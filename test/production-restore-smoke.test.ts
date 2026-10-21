import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  sanitizeRestoreSmokeFailure,
  validateIsolatedRestoreTarget,
} from "../scripts/production-restore-smoke-contract.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-restore-smoke.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/production-restore-smoke.ts", import.meta.url),
  "utf8",
);
const guestDiagnosticIndex = readFileSync(
  new URL("../src/modules/guest-diagnostic/index.ts", import.meta.url),
  "utf8",
);

const isolatedHost = "ep-isolated-restore-123.c-2.eu-central-1.aws.neon.tech";
const productionHost = "ep-production-456.c-2.eu-central-1.aws.neon.tech";
const isolatedUrl = `postgresql://restore_user:secret@${isolatedHost}/app?sslmode=require`;

describe("isolated production restore smoke contract", () => {
  it("accepts only the exact configured isolated Neon endpoint", () => {
    expect(
      validateIsolatedRestoreTarget({
        databaseUrl: isolatedUrl,
        expectedHost: isolatedHost,
        productionHost,
      }),
    ).toEqual({ ok: true, reason: "MATCH" });
  });

  it("rejects a different Neon endpoint even when it is not production", () => {
    expect(
      validateIsolatedRestoreTarget({
        databaseUrl: isolatedUrl,
        expectedHost: "ep-other-restore.c-2.eu-central-1.aws.neon.tech",
        productionHost,
      }),
    ).toEqual({ ok: false, reason: "ISOLATED_HOST_MISMATCH" });
  });

  it("rejects the production endpoint including its pooler variant", () => {
    const productionPooler = productionHost.replace(".c-", "-pooler.c-");
    expect(
      validateIsolatedRestoreTarget({
        databaseUrl: `postgresql://user:secret@${productionPooler}/app`,
        expectedHost: isolatedHost,
        productionHost,
      }),
    ).toEqual({ ok: false, reason: "PRODUCTION_TARGET_REJECTED" });
  });

  it("fails closed when the secret or either exact host binding is missing", () => {
    expect(
      validateIsolatedRestoreTarget({
        databaseUrl: undefined,
        expectedHost: isolatedHost,
        productionHost,
      }),
    ).toEqual({ ok: false, reason: "ISOLATED_DATABASE_URL_MISSING" });
    expect(
      validateIsolatedRestoreTarget({
        databaseUrl: isolatedUrl,
        expectedHost: undefined,
        productionHost,
      }),
    ).toEqual({ ok: false, reason: "EXPECTED_HOST_MISSING" });
    expect(
      validateIsolatedRestoreTarget({
        databaseUrl: isolatedUrl,
        expectedHost: isolatedHost,
        productionHost: undefined,
      }),
    ).toEqual({ ok: false, reason: "PRODUCTION_HOST_MISSING" });
  });

  it("reports only allowlisted failure stage, class and code", () => {
    const secretMessage =
      "postgresql://private-user:private-password@private-host/db?sslmode=require token=private";
    const error = Object.assign(new SyntaxError(secretMessage), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    const diagnostic = sanitizeRestoreSmokeFailure("MODULE_LOADING", error);

    expect(diagnostic).toEqual({
      stage: "MODULE_LOADING",
      errorClass: "SyntaxError",
      errorCode: "ERR_MODULE_NOT_FOUND",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(secretMessage);
    expect(JSON.stringify(diagnostic)).not.toContain("private-password");
  });

  it("omits unrecognized error names and codes", () => {
    const error = Object.assign(new Error("sensitive text"), {
      name: "private-user@private-host",
      code: "PASSWORD=private",
    });

    expect(sanitizeRestoreSmokeFailure("APP_BUILD", error)).toEqual({
      stage: "APP_BUILD",
      errorClass: "OtherError",
      errorCode: null,
    });
  });

  it("keeps Prisma raw-query diagnostics allowlisted without exposing database details", () => {
    const error = Object.assign(new Error("permission denied at private database"), {
      code: "P2010",
      meta: { code: "42501", message: "private database details" },
    });

    expect(sanitizeRestoreSmokeFailure("READY", error)).toEqual({
      stage: "READY",
      errorClass: "Error",
      errorCode: "P2010",
    });
  });

  it("keeps the guest diagnostic entrypoint valid under Node ESM", () => {
    expect(guestDiagnosticIndex).toContain(
      'export type { GuestDiagnosticOperation, ValidatedGuestSession } from "./context.js";',
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          "await import('./src/modules/guest-diagnostic/index.ts')",
        ],
        { cwd: process.cwd(), stdio: "ignore" },
      ),
    ).not.toThrow();
  });

  it("does not expose a URL or load Prisma until the target is validated", () => {
    expect(script.indexOf("validateIsolatedRestoreTarget")).toBeLessThan(
      script.indexOf('import("../src/app.js")'),
    );
    expect(script.indexOf("process.env.DATABASE_URL = isolatedUrl")).toBeLessThan(
      script.indexOf('import("../src/app.js")'),
    );
    for (const stage of ["environmentValidation", "moduleLoading", "appBuild", "fastifyReady"]) {
      expect(script).toContain(`${stage}: Check`);
      expect(workflow).toContain(`${stage}:`);
    }
    expect(script).toContain("await app.ready();");
    expect(script).toContain("sanitizeRestoreSmokeFailure(activeStage, error)");
    expect(script).not.toMatch(/error\.message|error\.stack/iu);
    expect(workflow).toContain("report.failureDiagnostic");
    expect(workflow).toContain("Failure diagnostic:");
    expect(script).toContain('app.inject({ method: "GET", url });');
    expect(script).toContain(
      `SELECT to_regclass('public."AccountDeletionRequest"')::text AS table_name`,
    );
    expect(script).not.toContain("prisma.accountDeletionRequest.count()");
    expect(script).toContain("accountDeletionRequestSchema");
    expect(script).toContain("role.rolsuper AS is_superuser");
    expect(script).toContain("role.rolbypassrls AS bypasses_rls");
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("accountDeletionRequest.create");
    expect(script).not.toContain("console.log(isolatedUrl)");
    expect(script).not.toContain("current_user AS");
  });

  it("is dispatch-only, master-only, protected and uses only the isolated URL secret", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("ref: master");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("secrets.ISOLATED_RESTORE_DATABASE_URL");
    expect(workflow).toContain("vars.ISOLATED_RESTORE_DATABASE_HOST");
    expect(workflow).toContain("vars.PRODUCTION_DB_APPROVED_HOST");
    expect(workflow).toContain("appInitialization");
    expect(workflow).not.toContain("inputs.");
    expect(workflow).not.toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toMatch(/^\s+(?:push|pull_request):/mu);
    expect(workflow).not.toMatch(/prisma\s+migrate|seed|INSERT\s+INTO|\bUPDATE\s+.+\bSET\b/iu);
    expect(workflow).not.toContain('echo "${ISOLATED_RESTORE_DATABASE_URL}"');
  });
});
