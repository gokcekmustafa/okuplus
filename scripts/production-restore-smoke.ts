import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  sanitizeRestoreSmokeFailure,
  validateIsolatedRestoreTarget,
  type RestoreSmokeFailureStage,
} from "./production-restore-smoke-contract.js";

type Check = "NOT_RUN" | "PASS" | "FAIL";

type SmokeReport = {
  targetValidation: { status: "NOT_RUN" | "PASS" | "BLOCKED" | "FAIL"; reason: string };
  checks: {
    environmentValidation: Check;
    moduleLoading: Check;
    appBuild: Check;
    fastifyReady: Check;
    appInitialization: Check;
    health: Check;
    healthDb: Check;
    ready: Check;
    accountDeletionRequestSchema: Check;
  };
  databaseRolePrivileges: {
    status: Check;
    isSuperuser: boolean | null;
    bypassesRls: boolean | null;
  };
  commitSha: string;
  failureDiagnostic: ReturnType<typeof sanitizeRestoreSmokeFailure> | null;
};

function newReport(): SmokeReport {
  return {
    targetValidation: { status: "NOT_RUN", reason: "NOT_RUN" },
    checks: {
      environmentValidation: "NOT_RUN",
      moduleLoading: "NOT_RUN",
      appBuild: "NOT_RUN",
      fastifyReady: "NOT_RUN",
      appInitialization: "NOT_RUN",
      health: "NOT_RUN",
      healthDb: "NOT_RUN",
      ready: "NOT_RUN",
      accountDeletionRequestSchema: "NOT_RUN",
    },
    databaseRolePrivileges: {
      status: "NOT_RUN",
      isSuperuser: null,
      bypassesRls: null,
    },
    commitSha: /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA ?? "")
      ? process.env.GITHUB_SHA!
      : "UNKNOWN",
    failureDiagnostic: null,
  };
}

function checkBody(body: unknown, expected: Record<string, unknown>): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return Object.entries(expected).every(
    ([key, value]) => (body as Record<string, unknown>)[key] === value,
  );
}

async function checkGet(
  app: FastifyInstance,
  url: string,
  expected: Record<string, unknown>,
): Promise<Check> {
  const response = await app.inject({ method: "GET", url });
  return response.statusCode === 200 && checkBody(response.json(), expected) ? "PASS" : "FAIL";
}

async function run(): Promise<void> {
  const report = newReport();
  let app: FastifyInstance | undefined;
  let prisma: typeof import("../src/lib/prisma.js").prisma | undefined;
  let activeStage: RestoreSmokeFailureStage | null = "TARGET_VALIDATION";

  try {
    if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") {
      report.targetValidation = { status: "BLOCKED", reason: "WORKFLOW_DISPATCH_REQUIRED" };
    } else if (process.env.GITHUB_REF !== "refs/heads/master") {
      report.targetValidation = { status: "BLOCKED", reason: "MASTER_REF_REQUIRED" };
    } else {
      const target = validateIsolatedRestoreTarget({
        databaseUrl: process.env.ISOLATED_RESTORE_DATABASE_URL,
        expectedHost: process.env.ISOLATED_RESTORE_DATABASE_HOST,
        productionHost: process.env.PRODUCTION_DB_APPROVED_HOST,
      });
      report.targetValidation = {
        status: target.ok ? "PASS" : "BLOCKED",
        reason: target.reason,
      };
    }

    if (report.targetValidation.status !== "PASS") {
      activeStage = null;
      return emit(report, false);
    }

    // Prisma is imported only after the exact isolated endpoint check succeeds.
    const isolatedUrl = process.env.ISOLATED_RESTORE_DATABASE_URL!.trim();
    process.env.DATABASE_URL = isolatedUrl;
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "silent";

    activeStage = "ENVIRONMENT_VALIDATION";
    const { parseEnv } = await import("../src/config/env.js");
    const env = parseEnv({
      APP_ENV: "staging",
      NODE_ENV: "production",
      DATABASE_URL: isolatedUrl,
      JWT_SECRET: randomBytes(48).toString("base64url"),
      LOG_LEVEL: "silent",
    });
    report.checks.environmentValidation = "PASS";
    activeStage = "MODULE_LOADING";

    const [{ buildApp }, prismaModule] = await Promise.all([
      import("../src/app.js"),
      import("../src/lib/prisma.js"),
    ]);
    report.checks.moduleLoading = "PASS";
    prisma = prismaModule.prisma;
    activeStage = "APP_BUILD";
    app = await buildApp(env);
    report.checks.appBuild = "PASS";
    activeStage = "FASTIFY_READY";
    await app.ready();
    report.checks.fastifyReady = "PASS";
    report.checks.appInitialization = "PASS";
    activeStage = null;

    activeStage = "HEALTH";
    report.checks.health = await checkGet(app, "/health", { status: "ok" });
    activeStage = "HEALTH_DB";
    report.checks.healthDb = await checkGet(app, "/health/db", {
      status: "ok",
      database: "up",
    });
    activeStage = "READY";
    report.checks.ready = await checkGet(app, "/ready", { status: "ok", ready: true });

    activeStage = "ACCOUNT_DELETION_SCHEMA";
    const accountDeletionRequestTable = await prisma.$queryRaw<
      Array<{ table_name: string | null }>
    >`SELECT to_regclass('public."AccountDeletionRequest"')::text AS table_name`;
    if (!accountDeletionRequestTable[0]?.table_name) {
      report.checks.accountDeletionRequestSchema = "FAIL";
    } else {
      report.checks.accountDeletionRequestSchema = "PASS";
    }

    activeStage = "DATABASE_ROLE_PRIVILEGES";
    const roleRows = await prisma.$queryRaw<
      Array<{ is_superuser: boolean; bypasses_rls: boolean }>
    >`
      SELECT role.rolsuper AS is_superuser,
             role.rolbypassrls AS bypasses_rls
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `;
    const role = roleRows[0];
    if (role && typeof role.is_superuser === "boolean" && typeof role.bypasses_rls === "boolean") {
      report.databaseRolePrivileges = {
        status: "PASS",
        isSuperuser: role.is_superuser,
        bypassesRls: role.bypasses_rls,
      };
    } else {
      report.databaseRolePrivileges.status = "FAIL";
    }
    activeStage = null;

    const passed =
      Object.values(report.checks).every((check) => check === "PASS") &&
      report.databaseRolePrivileges.status === "PASS";
    emit(report, passed);
  } catch (error) {
    if (activeStage) {
      report.failureDiagnostic = sanitizeRestoreSmokeFailure(activeStage, error);
      const checkByStage: Partial<Record<RestoreSmokeFailureStage, keyof SmokeReport["checks"]>> = {
        ENVIRONMENT_VALIDATION: "environmentValidation",
        MODULE_LOADING: "moduleLoading",
        APP_BUILD: "appBuild",
        FASTIFY_READY: "fastifyReady",
        HEALTH: "health",
        HEALTH_DB: "healthDb",
        READY: "ready",
        ACCOUNT_DELETION_SCHEMA: "accountDeletionRequestSchema",
      };
      const failedCheck = checkByStage[activeStage];
      if (failedCheck) report.checks[failedCheck] = "FAIL";
      if (
        activeStage === "ENVIRONMENT_VALIDATION" ||
        activeStage === "MODULE_LOADING" ||
        activeStage === "APP_BUILD" ||
        activeStage === "FASTIFY_READY"
      ) {
        report.checks.appInitialization = "FAIL";
      }
      if (activeStage === "DATABASE_ROLE_PRIVILEGES") {
        report.databaseRolePrivileges.status = "FAIL";
      }
    }
    report.targetValidation =
      report.targetValidation.status === "PASS"
        ? report.targetValidation
        : { status: "FAIL", reason: "TARGET_VALIDATION_FAILED" };
    emit(report, false);
  } finally {
    if (app) await app.close().catch(() => undefined);
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  }
}

function emit(report: SmokeReport, passed: boolean): void {
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!passed) process.exitCode = 1;
}

void run().catch(() => {
  const report = newReport();
  report.targetValidation = { status: "FAIL", reason: "SMOKE_INTERNAL_ERROR" };
  report.failureDiagnostic = sanitizeRestoreSmokeFailure("TARGET_VALIDATION", new Error());
  emit(report, false);
});
