import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { parseCatalogTargetUrl } from "../src/curriculum/catalog-target-verification.js";
import { trainingRuntimeVersionSelect } from "../src/modules/training/runtime.js";
import { buildSafeTrainingInventoryReport } from "../src/modules/training/inventory-audit.js";
import { providerForHost, targetIdentityFingerprint } from "../src/lib/db-fingerprint-contract.js";

type MatchStatus = "MATCH" | "MISMATCH" | "UNVERIFIED";
type IdentityRow = { database: string; current_user: string; server_port: number };

const CONFIRMATION = "TRAINING_QUESTION_INVENTORY_READ_ONLY_AUDIT";
const SOURCE_COMMIT = process.env.GITHUB_SHA?.trim() || "UNVERIFIED";

function required(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function match(actual: string, expected: string | null, normalize = (value: string) => value) {
  if (!expected) return "UNVERIFIED" as const;
  return normalize(actual) === normalize(expected) ? "MATCH" : "MISMATCH";
}

function blockedReport(
  reason: string,
  identityChecks?: Record<string, MatchStatus>,
): Record<string, unknown> {
  return {
    status: "BLOCKED",
    productionWrite: "NO",
    semanticContentReview: "NOT_PERFORMED",
    reason,
    sourceCommit: SOURCE_COMMIT,
    ...(identityChecks ? { targetIdentityChecks: identityChecks } : {}),
  };
}

function assertWorkflowGate(): boolean {
  return (
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    process.env.GITHUB_REF === "refs/heads/master" &&
    process.env.APP_ENV === "production" &&
    process.env.NODE_ENV === "production" &&
    process.env.DB_FINGERPRINT_ENVIRONMENT === "PRODUCTION" &&
    required("TRAINING_INVENTORY_AUDIT_CONFIRMATION") === CONFIRMATION
  );
}

async function writeReport(report: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  const summaryPath = required("GITHUB_STEP_SUMMARY");
  if (summaryPath)
    await appendFile(
      summaryPath,
      `\n## Read-only Antrenman inventory\n\n\`\`\`json\n${json}\n\`\`\`\n`,
    );
}

async function main(): Promise<void> {
  if (!assertWorkflowGate()) {
    await writeReport(blockedReport("protected manual master audit gate did not match"));
    process.exitCode = 1;
    return;
  }

  const rawUrl = required("PRODUCTION_DATABASE_URL");
  const approvedFingerprint = required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
  if (!rawUrl || !approvedFingerprint || !/^[0-9a-f]{64}$/iu.test(approvedFingerprint)) {
    await writeReport(
      blockedReport("approved production target configuration is missing or invalid"),
    );
    process.exitCode = 1;
    return;
  }

  let target: ReturnType<typeof parseCatalogTargetUrl>;
  try {
    target = parseCatalogTargetUrl(rawUrl, "PRODUCTION");
  } catch {
    await writeReport(blockedReport("production target URL is invalid"));
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  try {
    await prisma.$transaction(
      async (tx) => {
        // Enforce read-only in PostgreSQL as a second guard beyond this
        // script's SELECT/findMany-only data access.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const identityRows = await tx.$queryRaw<IdentityRow[]>`
          SELECT current_database() AS database,
                 current_user AS current_user,
                 inet_server_port() AS server_port
        `;
        const identity = identityRows[0];
        if (!identity) throw new Error("target identity unavailable");

        const provider = providerForHost(target.host);
        const actualFingerprint = targetIdentityFingerprint({
          environment: "PRODUCTION",
          provider,
          host: target.host,
          port: target.port,
          database: identity.database,
          dbUser: identity.current_user,
        });
        const identityChecks: Record<string, MatchStatus> = {
          environment: match("PRODUCTION", required("DB_FINGERPRINT_ENVIRONMENT"), (value) =>
            value.toUpperCase(),
          ),
          provider: match(provider, required("PRODUCTION_DB_APPROVED_PROVIDER"), (value) =>
            value.toUpperCase(),
          ),
          host: match(target.host, required("PRODUCTION_DB_APPROVED_HOST"), (value) =>
            value.toLowerCase().replace(/\.$/u, ""),
          ),
          port: match(
            String(identity.server_port || target.port),
            required("PRODUCTION_DB_APPROVED_PORT"),
          ),
          database: match(identity.database, required("PRODUCTION_DB_APPROVED_DATABASE")),
          currentUser: match(identity.current_user, required("PRODUCTION_DB_APPROVED_USER")),
          fingerprint:
            actualFingerprint === approvedFingerprint.toLowerCase() ? "MATCH" : "MISMATCH",
        };

        if (Object.values(identityChecks).some((status) => status !== "MATCH")) {
          await writeReport(
            blockedReport("production target identity did not match", identityChecks),
          );
          process.exitCode = 1;
          return;
        }

        const rows = await tx.exerciseTemplateVersion.findMany({
          where: {
            status: "PUBLISHED",
            template: { status: "PUBLISHED", deletedAt: null },
          },
          select: trainingRuntimeVersionSelect,
          orderBy: [{ templateId: "asc" }, { version: "asc" }, { id: "asc" }],
        });
        const inventory = buildSafeTrainingInventoryReport(rows);
        await writeReport({
          ...inventory,
          sourceCommit: SOURCE_COMMIT,
          targetIdentityChecks: identityChecks,
          queryScope: "PUBLISHED_TEMPLATE_AND_VERSION_ROWS_ONLY",
        });
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  } catch {
    await writeReport(blockedReport("read-only production inventory query failed"));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
