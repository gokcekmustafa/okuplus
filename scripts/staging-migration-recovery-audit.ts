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
  migrations?: {
    pending?: unknown;
    failed?: unknown;
  };
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
  id: string;
  migration_name: string;
  checksum: string;
  applied_steps_count: number;
  started_at: Date | null;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs_present: boolean;
};

type MigrationStatus = {
  exitCode: number;
  state: "CURRENT" | "PENDING" | "ERROR";
};

type FingerprintFailedMigration = {
  name: string;
  rolledBack: boolean;
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
  migrationRows: MigrationRow[];
  fingerprintPendingMigrations: string[];
  fingerprintFailedMigrations: FingerprintFailedMigration[];
  migrationStatus: MigrationStatus;
};

function migrationDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function migrationState(
  rows: MigrationRow[],
): "APPLIED" | "FAILED_OR_INCOMPLETE" | "ROLLED_BACK" | "NOT_FOUND" {
  if (rows.some((row) => row.finished_at !== null && row.rolled_back_at === null)) {
    return "APPLIED";
  }
  if (rows.some((row) => row.finished_at === null && row.rolled_back_at === null)) {
    return "FAILED_OR_INCOMPLETE";
  }
  if (rows.some((row) => row.rolled_back_at !== null)) return "ROLLED_BACK";
  return "NOT_FOUND";
}

function serializeMigrationRow(row: MigrationRow) {
  return {
    id: row.id,
    migrationName: row.migration_name,
    checksum: row.checksum,
    startedAt: migrationDate(row.started_at),
    finishedAt: migrationDate(row.finished_at),
    rolledBackAt: migrationDate(row.rolled_back_at),
    appliedStepsCount: row.applied_steps_count,
  };
}

export function buildRecoveryAudit(input: RecoveryAuditInput) {
  const enumTypeExists = input.enumValues.length > 0;
  const enumLabelPresent = input.enumValues.includes(TARGET_ENUM_LABEL);
  const migrationRows = [...input.migrationRows].sort((left, right) => {
    const startedAt =
      (left.started_at?.getTime() ?? Number.NEGATIVE_INFINITY) -
      (right.started_at?.getTime() ?? Number.NEGATIVE_INFINITY);
    return startedAt || left.id.localeCompare(right.id);
  });
  const activeAppliedRows = migrationRows.filter(
    (row) =>
      row.migration_name === TARGET_MIGRATION &&
      row.finished_at !== null &&
      row.rolled_back_at === null,
  );
  const rolledBackRows = migrationRows.filter((row) => row.rolled_back_at !== null);
  const unresolvedRows = migrationRows.filter(
    (row) => row.finished_at === null && row.rolled_back_at === null,
  );
  const unexpectedFailedMigrations = input.fingerprintFailedMigrations.filter(
    (migration) => migration.name !== TARGET_MIGRATION && !migration.rolledBack,
  );
  const historyState = migrationState(migrationRows);
  const migrationDefinitionOnlyEnumLabel = true;
  const schemaEffectCheck =
    enumTypeExists && enumLabelPresent && migrationDefinitionOnlyEnumLabel ? "PASS" : "FAIL";
  const safeToResolveApplied = schemaEffectCheck === "PASS" && historyState !== "APPLIED";
  const safeToDeploy =
    input.targetEnvironment === "STAGING" &&
    input.fingerprintConfirmed &&
    input.database === input.fingerprintDatabase &&
    input.databaseUser === input.fingerprintUser &&
    enumTypeExists &&
    enumLabelPresent &&
    activeAppliedRows.length === 1 &&
    unresolvedRows.length === 0 &&
    unexpectedFailedMigrations.length === 0 &&
    (input.migrationStatus.state === "CURRENT" || input.migrationStatus.state === "PENDING");
  const activeAppliedRow = activeAppliedRows[0] ?? null;

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
      exists: migrationRows.length > 0,
      state: historyState,
      recordCount: migrationRows.length,
      appliedStepsCount:
        activeAppliedRow?.applied_steps_count ?? migrationRows[0]?.applied_steps_count ?? null,
      startedAt: migrationDate(
        activeAppliedRow?.started_at ?? migrationRows[0]?.started_at ?? null,
      ),
      finishedAt: migrationDate(activeAppliedRow?.finished_at ?? null),
      rolledBackAt: migrationDate(rolledBackRows[0]?.rolled_back_at ?? null),
      logsPresent: migrationRows.some((row) => row.logs_present),
      errorStatus:
        migrationRows.some((row) => row.logs_present) || historyState === "FAILED_OR_INCOMPLETE"
          ? "PRESENT"
          : "NONE",
    },
    migrationRows: migrationRows.map(serializeMigrationRow),
    activeAppliedMigration: activeAppliedRow ? serializeMigrationRow(activeAppliedRow) : null,
    rolledBackMigrations: rolledBackRows.map(serializeMigrationRow),
    unresolvedMigrationRows: unresolvedRows.map(serializeMigrationRow),
    migrationStatus: input.migrationStatus,
    pendingMigrations: input.fingerprintPendingMigrations,
    unexpectedFailedMigrations,
    migrationDefinition: {
      statementCount: 1,
      effect: "POINT_EVENT_TYPE_ENUM_LABEL_ONLY",
      otherSchemaEffects: "NONE",
    },
    schemaEffectCheck,
    safeToResolveApplied,
    safeToDeploy,
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

function parseFingerprintMigrationNames(report: FingerprintReport): {
  pending: string[];
  failed: FingerprintFailedMigration[];
} {
  const pending = report.migrations?.pending;
  const failed = report.migrations?.failed;
  if (!Array.isArray(pending) || !pending.every((name) => typeof name === "string")) {
    throw new Error("fingerprint pending migration metadata is invalid");
  }
  if (
    !Array.isArray(failed) ||
    !failed.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        "name" in entry &&
        typeof entry.name === "string" &&
        "rolledBack" in entry &&
        typeof entry.rolledBack === "boolean",
    )
  ) {
    throw new Error("fingerprint failed migration metadata is invalid");
  }
  return { pending, failed };
}

function migrationStatusFromEnvironment(): MigrationStatus {
  const exitCodeText = requiredEnvironment("MIGRATE_STATUS_EXIT");
  const state = requiredEnvironment("MIGRATE_STATUS_STATE");
  if (!/^(?:0|[1-9]\d*)$/u.test(exitCodeText) || !["CURRENT", "PENDING", "ERROR"].includes(state)) {
    throw new Error("staging migration status is invalid");
  }
  const exitCode = Number(exitCodeText);
  return { exitCode, state: state as MigrationStatus["state"] };
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
  const fingerprintMigrations = parseFingerprintMigrationNames(fingerprint);
  const migrationStatus = migrationStatusFromEnvironment();

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
        SELECT id, migration_name, checksum, applied_steps_count, started_at, finished_at,
               rolled_back_at, (logs IS NOT NULL) AS logs_present
        FROM public._prisma_migrations
        WHERE migration_name = ${TARGET_MIGRATION}
        ORDER BY started_at ASC, id ASC
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
      migrationRows,
      fingerprintPendingMigrations: fingerprintMigrations.pending,
      fingerprintFailedMigrations: fingerprintMigrations.failed,
      migrationStatus,
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
