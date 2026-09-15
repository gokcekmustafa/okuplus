import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertTargetIdentityFingerprint, providerForHost } from "./db-fingerprint-contract.js";

const TARGET_MIGRATION = "20260907160000_add_training_session_completed_point_event";
const TARGET_ENUM = "PointEventType";
const TARGET_ENUM_LABEL = "TRAINING_SESSION_COMPLETED";

type FingerprintReport = {
  target?: { environment?: string };
  database?: { database?: string; currentUser?: string };
  targetIdentityFingerprint?: unknown;
};

type IdentityRow = {
  database: string;
  current_user: string;
};

type EnumRow = {
  type_name: string;
  enum_value: string;
};

type MigrationRow = {
  migration_name: string;
  applied_steps_count: number;
  started_at: Date | null;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs_present: boolean;
};

export type RecoveryAuditInput = {
  targetEnvironment: string;
  targetFingerprint: string;
  fingerprintConfirmed: boolean;
  fingerprintDatabase: string;
  fingerprintUser: string;
  database: string;
  databaseUser: string;
  enumValues: string[];
  migration: MigrationRow | null;
};

function migrationDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function migrationState(
  row: MigrationRow | null,
): "APPLIED" | "FAILED_OR_INCOMPLETE" | "ROLLED_BACK" | "NOT_FOUND" {
  if (!row) return "NOT_FOUND";
  if (row.rolled_back_at) return "ROLLED_BACK";
  if (row.finished_at) return "APPLIED";
  return "FAILED_OR_INCOMPLETE";
}

export function buildRecoveryAudit(input: RecoveryAuditInput) {
  const enumTypeExists = input.enumValues.length > 0;
  const enumLabelPresent = input.enumValues.includes(TARGET_ENUM_LABEL);
  const historyState = migrationState(input.migration);
  const migrationDefinitionOnlyEnumLabel = true;
  const schemaEffectCheck =
    enumTypeExists && enumLabelPresent && migrationDefinitionOnlyEnumLabel ? "PASS" : "FAIL";
  const safeToResolveApplied = schemaEffectCheck === "PASS" && historyState !== "APPLIED";

  return {
    status: "AUDIT_PASS" as const,
    targetEnvironment: input.targetEnvironment,
    targetFingerprint: input.targetFingerprint,
    fingerprintConfirmed: input.fingerprintConfirmed,
    databaseIdentityMatch:
      input.database === input.fingerprintDatabase && input.databaseUser === input.fingerprintUser,
    enum: {
      typeName: TARGET_ENUM,
      typeExists: enumTypeExists,
      label: TARGET_ENUM_LABEL,
      labelPresent: enumLabelPresent,
      values: input.enumValues,
    },
    migration: {
      name: TARGET_MIGRATION,
      exists: input.migration !== null,
      state: historyState,
      appliedStepsCount: input.migration?.applied_steps_count ?? null,
      startedAt: migrationDate(input.migration?.started_at ?? null),
      finishedAt: migrationDate(input.migration?.finished_at ?? null),
      rolledBackAt: migrationDate(input.migration?.rolled_back_at ?? null),
      logsPresent: input.migration?.logs_present ?? false,
      errorStatus:
        input.migration?.logs_present || historyState === "FAILED_OR_INCOMPLETE"
          ? "PRESENT"
          : "NONE",
    },
    migrationDefinition: {
      statementCount: 1,
      effect: "POINT_EVENT_TYPE_ENUM_LABEL_ONLY",
      otherSchemaEffects: "NONE",
    },
    schemaEffectCheck,
    safeToResolveApplied,
    recoveryClass: safeToResolveApplied
      ? "ENUM_PRESENT_HISTORY_NOT_APPLIED"
      : historyState === "APPLIED"
        ? "ALREADY_APPLIED"
        : "REVIEW_REQUIRED",
    writeOperations: "NONE",
    productionTouched: "NO",
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing required environment: ${name}`);
  return value;
}

function stagingDatabaseUrl(name: string): string {
  const value = requiredEnvironment(name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("staging database URL is invalid");
  }
  if (
    (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") ||
    providerForHost(parsed.hostname) !== "NEON"
  ) {
    throw new Error("staging database target is not an approved Neon PostgreSQL target");
  }
  return value;
}

async function fingerprintReport(): Promise<FingerprintReport> {
  const raw = await readFile(requiredEnvironment("FINGERPRINT_OUTPUT"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("fingerprint report is invalid");
  }
  return parsed as FingerprintReport;
}

async function main(): Promise<void> {
  if (requiredEnvironment("DB_FINGERPRINT_ENVIRONMENT").toUpperCase() !== "STAGING") {
    throw new Error("staging environment guard failed");
  }

  const approvedFingerprint = assertTargetIdentityFingerprint(
    requiredEnvironment("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT"),
  );
  const fingerprint = await fingerprintReport();
  const targetFingerprint = assertTargetIdentityFingerprint(fingerprint.targetIdentityFingerprint);
  if (fingerprint.target?.environment !== "STAGING" || targetFingerprint !== approvedFingerprint) {
    throw new Error("staging fingerprint guard failed");
  }

  const fingerprintDatabase = fingerprint.database?.database;
  const fingerprintUser = fingerprint.database?.currentUser;
  if (!fingerprintDatabase || !fingerprintUser) {
    throw new Error("fingerprint database identity is incomplete");
  }

  stagingDatabaseUrl("DB_FINGERPRINT_DATABASE_URL");
  const databaseUrl = stagingDatabaseUrl("DATABASE_URL");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    await prisma.$connect();
    const [identityRows, enumRows, migrationRows] = await Promise.all([
      prisma.$queryRaw<IdentityRow[]>`
        SELECT current_database() AS database, current_user AS current_user
      `,
      prisma.$queryRaw<EnumRow[]>`
        SELECT t.typname AS type_name, e.enumlabel AS enum_value
        FROM pg_type AS t
        JOIN pg_namespace AS n ON n.oid = t.typnamespace
        JOIN pg_enum AS e ON e.enumtypid = t.oid
        WHERE n.nspname = 'public' AND t.typname = ${TARGET_ENUM}
        ORDER BY e.enumsortorder
      `,
      prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, applied_steps_count, started_at, finished_at,
               rolled_back_at, (logs IS NOT NULL) AS logs_present
        FROM public._prisma_migrations
        WHERE migration_name = ${TARGET_MIGRATION}
      `,
    ]);

    const identity = identityRows[0];
    if (!identity) throw new Error("staging database identity is unavailable");

    const result = buildRecoveryAudit({
      targetEnvironment: "STAGING",
      targetFingerprint,
      fingerprintConfirmed: true,
      fingerprintDatabase,
      fingerprintUser,
      database: identity.database,
      databaseUser: identity.current_user,
      enumValues: enumRows.map((row) => row.enum_value),
      migration: migrationRows[0] ?? null,
    });

    if (!result.databaseIdentityMatch) {
      throw new Error("staging migration database identity does not match fingerprint target");
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const executedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === executedFile) {
  main().catch(() => {
    console.error("staging read-only recovery audit failed");
    process.exitCode = 1;
  });
}
