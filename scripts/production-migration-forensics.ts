import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { providerForHost, targetIdentityFingerprint } from "./db-fingerprint-contract.js";

const MIGRATION_1 = "20260905090000_add_exercise_template_version_config";
const MIGRATION_2 = "20260907150000_add_training_session_models";

type IdentityRow = {
  database: string;
  schema: string;
  current_user: string;
};

type MigrationRow = {
  migration_name: string;
  checksum: string;
  started_at: Date | null;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
  logs: string | null;
};

type ColumnRow = { table_name: string; column_name: string; data_type: string; udt_name: string };
type IndexRow = { tablename: string; indexname: string; indexdef: string };
type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  columns: string | null;
};
type EnumRow = { type_name: string; enum_value: string };
type PolicyRow = { tablename: string; policyname: string; cmd: string };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeErrorSummary(value: string | null): string | null {
  if (!value) return null;
  return (
    value
      .split(/\r?\n/u)
      .find((line) => line.trim())
      ?.replace(/postgres(?:ql)?:\/\/\S+/giu, "[REDACTED_URL]")
      .replace(/(?:password|secret|token|authorization)\s*[:=]\s*\S+/giu, "$1=[REDACTED]")
      .slice(0, 240) ?? null
  );
}

function safeThrownMessage(error: unknown): string {
  return (
    safeErrorSummary(error instanceof Error ? error.message : String(error)) ?? "unknown error"
  );
}

function dateValue(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function stateOf(row: MigrationRow | undefined): string {
  if (!row) return "NOT_RECORDED";
  if (row.rolled_back_at) return "ROLLED_BACK";
  if (!row.finished_at) return "FAILED_OR_INCOMPLETE";
  return "APPLIED";
}

async function repositoryChecksums(): Promise<Map<string, string>> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationRoot = join(root, "prisma", "migrations");
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const result = new Map<string, string>();

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const sql = await readFile(join(migrationRoot, entry.name, "migration.sql"), "utf8");
    result.set(entry.name, sha256(sql));
  }
  return result;
}

function checkSchema(
  columns: ColumnRow[],
  indexes: IndexRow[],
  constraints: ConstraintRow[],
  enums: EnumRow[],
  policies: PolicyRow[],
  expected: {
    columns: string[];
    indexes: string[];
    constraints: string[];
    enums: string[];
    policies: string[];
  },
) {
  const actualColumns = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  const actualIndexes = new Set(indexes.map((row) => row.indexname));
  const actualConstraints = new Set(constraints.map((row) => row.constraint_name));
  const actualEnums = new Set(enums.map((row) => `${row.type_name}.${row.enum_value}`));
  const actualPolicies = new Set(policies.map((row) => row.policyname));
  const missing = {
    columns: expected.columns.filter((item) => !actualColumns.has(item)),
    indexes: expected.indexes.filter((item) => !actualIndexes.has(item)),
    constraints: expected.constraints.filter((item) => !actualConstraints.has(item)),
    enums: expected.enums.filter((item) => !actualEnums.has(item)),
    policies: expected.policies.filter((item) => !actualPolicies.has(item)),
  };
  const expectedCount = Object.values(expected).reduce((sum, values) => sum + values.length, 0);
  const missingCount = Object.values(missing).reduce((sum, values) => sum + values.length, 0);
  return {
    status: missingCount === expectedCount ? "ABSENT" : missingCount === 0 ? "COMPLETE" : "PARTIAL",
    expectedCount,
    presentCount: expectedCount - missingCount,
    missing,
  };
}

async function main(): Promise<void> {
  if (process.env.DB_FINGERPRINT_ENVIRONMENT?.trim().toUpperCase() !== "PRODUCTION") {
    throw new Error("DB_FINGERPRINT_ENVIRONMENT=PRODUCTION is required");
  }

  const rawUrl = process.env.DB_FINGERPRINT_DATABASE_URL?.trim();
  if (!rawUrl) throw new Error("DB_FINGERPRINT_DATABASE_URL is required");
  const approved = process.env.PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT?.trim().toLowerCase();
  if (!approved || !/^[a-f0-9]{64}$/u.test(approved)) {
    throw new Error("approved production target fingerprint is missing or invalid");
  }

  const parsedUrl = new URL(rawUrl);
  const checksums = await repositoryChecksums();
  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });

  try {
    await prisma.$connect();
    const [identityRows, tableRows, columns, indexes, constraints, enums, policies] =
      await Promise.all([
        prisma.$queryRaw<IdentityRow[]>`
          SELECT current_database() AS database,
                 current_schema() AS schema,
                 current_user AS current_user
        `,
        prisma.$queryRaw<Array<{ migration_table: string | null }>>`
          SELECT to_regclass('public._prisma_migrations')::text AS migration_table
        `,
        prisma.$queryRaw<ColumnRow[]>`
          SELECT table_name, column_name, data_type, udt_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('ExerciseTemplateVersion', 'TrainingSession', 'TrainingSessionItem')
          ORDER BY table_name, ordinal_position
        `,
        prisma.$queryRaw<IndexRow[]>`
          SELECT tablename, indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename IN ('ExerciseTemplateVersion', 'TrainingSession', 'TrainingSessionItem')
          ORDER BY tablename, indexname
        `,
        prisma.$queryRaw<ConstraintRow[]>`
          SELECT tc.table_name,
                 tc.constraint_name,
                 tc.constraint_type,
                 string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns
          FROM information_schema.table_constraints AS tc
          LEFT JOIN information_schema.key_column_usage AS kcu
            ON kcu.constraint_schema = tc.constraint_schema
           AND kcu.constraint_name = tc.constraint_name
           AND kcu.table_name = tc.table_name
          WHERE tc.table_schema = 'public'
            AND tc.table_name IN ('ExerciseTemplateVersion', 'TrainingSession', 'TrainingSessionItem')
          GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
          ORDER BY tc.table_name, tc.constraint_name
        `,
        prisma.$queryRaw<EnumRow[]>`
          SELECT t.typname AS type_name, e.enumlabel AS enum_value
          FROM pg_type AS t
          JOIN pg_enum AS e ON e.enumtypid = t.oid
          WHERE t.typname IN ('TrainingSessionStatus', 'TrainingSessionItemStatus')
          ORDER BY t.typname, e.enumsortorder
        `,
        prisma.$queryRaw<PolicyRow[]>`
          SELECT tablename, policyname, cmd
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename IN ('TrainingSession', 'TrainingSessionItem')
          ORDER BY tablename, policyname
        `,
      ]);

    const identity = identityRows[0];
    if (!identity) throw new Error("database identity could not be read");
    const actualTarget = targetIdentityFingerprint({
      environment: "PRODUCTION",
      provider: providerForHost(parsedUrl.hostname),
      host: parsedUrl.hostname,
      port: parsedUrl.port || "5432",
      database: identity.database,
      dbUser: identity.current_user,
    });
    if (actualTarget !== approved) throw new Error("production target identity mismatch");

    const migrationTableExists = Boolean(tableRows[0]?.migration_table);
    const migrations = migrationTableExists
      ? await prisma.$queryRaw<MigrationRow[]>`
          SELECT migration_name, checksum, started_at, finished_at,
                 rolled_back_at, applied_steps_count, logs
          FROM public._prisma_migrations
          ORDER BY started_at, migration_name
        `
      : [];
    const byName = new Map(migrations.map((row) => [row.migration_name, row]));
    const failed = migrations
      .filter((row) => !row.finished_at || row.rolled_back_at)
      .map((row) => ({
        migrationName: row.migration_name,
        state: stateOf(row),
        checksum: row.checksum,
        appliedStepsCount: row.applied_steps_count,
        startedAt: dateValue(row.started_at),
        finishedAt: dateValue(row.finished_at),
        rolledBackAt: dateValue(row.rolled_back_at),
        safeErrorSummary: safeErrorSummary(row.logs),
      }));
    const rolledBack = failed.filter((row) => row.state === "ROLLED_BACK");
    const productionNames = new Set(migrations.map((row) => row.migration_name));
    const repositoryOnly = [...checksums.keys()].filter((name) => !productionNames.has(name));
    const productionOnly = [...productionNames].filter((name) => !checksums.has(name));
    const checksumMismatches = migrations
      .filter((row) => checksums.has(row.migration_name))
      .filter((row) => checksums.get(row.migration_name) !== row.checksum)
      .map((row) => row.migration_name);

    const migration1Schema = checkSchema(columns, indexes, constraints, enums, policies, {
      columns: ["ExerciseTemplateVersion.config"],
      indexes: [],
      constraints: [],
      enums: [],
      policies: [],
    });
    const migration2Schema = checkSchema(columns, indexes, constraints, enums, policies, {
      columns: [
        ...[
          "id",
          "tenantId",
          "studentId",
          "sessionDate",
          "status",
          "composition",
          "completedAt",
          "totalItems",
          "completedItems",
          "totalGP",
          "createdAt",
          "updatedAt",
        ].map((column) => `TrainingSession.${column}`),
        ...[
          "id",
          "trainingSessionId",
          "position",
          "family",
          "competency",
          "difficulty",
          "templateVersionId",
          "exerciseSessionId",
          "status",
          "startedAt",
          "completedAt",
          "createdAt",
          "updatedAt",
        ].map((column) => `TrainingSessionItem.${column}`),
      ],
      indexes: [
        "TrainingSession_tenantId_studentId_sessionDate_key",
        "TrainingSession_studentId_sessionDate_idx",
        "TrainingSession_studentId_tenantId_status_idx",
        "TrainingSession_tenantId_status_idx",
        "TrainingSessionItem_trainingSessionId_position_key",
        "TrainingSessionItem_exerciseSessionId_key",
        "TrainingSessionItem_trainingSessionId_status_idx",
        "TrainingSessionItem_templateVersionId_idx",
      ],
      constraints: [
        "TrainingSession_pkey",
        "TrainingSession_tenantId_fkey",
        "TrainingSession_studentId_fkey",
        "TrainingSessionItem_pkey",
        "TrainingSessionItem_trainingSessionId_fkey",
        "TrainingSessionItem_templateVersionId_fkey",
        "TrainingSessionItem_exerciseSessionId_fkey",
      ],
      enums: [
        "TrainingSessionStatus.IN_PROGRESS",
        "TrainingSessionStatus.COMPLETED",
        "TrainingSessionStatus.ABANDONED",
        "TrainingSessionStatus.EXPIRED",
        "TrainingSessionItemStatus.PENDING",
        "TrainingSessionItemStatus.IN_PROGRESS",
        "TrainingSessionItemStatus.COMPLETED",
        "TrainingSessionItemStatus.SKIPPED",
      ],
      policies: [
        "training_session_read",
        "training_session_insert",
        "training_session_update",
        "training_session_item_read",
        "training_session_item_insert",
        "training_session_item_update",
      ],
    });

    let configDataState: "YES" | "NO" | "UNKNOWN" = "UNKNOWN";
    if (
      columns.some(
        (row) => row.table_name === "ExerciseTemplateVersion" && row.column_name === "config",
      )
    ) {
      const rows = await prisma.$queryRaw<Array<{ total: number; configured: number }>>`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE "config" IS NOT NULL)::int AS configured
        FROM "ExerciseTemplateVersion"
      `;
      const counts = rows[0] ?? { total: 0, configured: 0 };
      configDataState = counts.configured < counts.total ? "YES" : "NO";
    }

    const partialSchema =
      migration1Schema.status === "PARTIAL" || migration2Schema.status === "PARTIAL";
    const schemaAhead =
      (stateOf(byName.get(MIGRATION_1)) !== "APPLIED" && migration1Schema.status === "COMPLETE") ||
      (stateOf(byName.get(MIGRATION_2)) !== "APPLIED" && migration2Schema.status === "COMPLETE");
    const historyAhead =
      (stateOf(byName.get(MIGRATION_1)) === "APPLIED" && migration1Schema.status === "ABSENT") ||
      (stateOf(byName.get(MIGRATION_2)) === "APPLIED" && migration2Schema.status === "ABSENT");
    const multipleConflicts =
      failed.length > 0 &&
      (partialSchema || checksumMismatches.length > 0 || schemaAhead || historyAhead);
    const remediationClass =
      checksumMismatches.length > 0
        ? "D_CHECKSUM_MISMATCH"
        : multipleConflicts
          ? "G_MULTIPLE_CONFLICTS"
          : failed.length > 0 && partialSchema
            ? "B_FAILED_RECORD_PARTIAL_SCHEMA"
            : failed.length > 0
              ? "A_FAILED_RECORD_NO_PARTIAL_SCHEMA_OR_UNKNOWN"
              : schemaAhead
                ? "E_SCHEMA_AHEAD_OF_HISTORY"
                : historyAhead
                  ? "F_HISTORY_AHEAD_OF_SCHEMA"
                  : "H_UNKNOWN";

    console.log(
      JSON.stringify(
        {
          forensics: "PASS",
          connectedReadOnly: true,
          targetIdentityMatch: true,
          migrationTableExists,
          migrationHistoryCount: migrations.length,
          migrationHistory: migrations.map((row) => ({
            migrationName: row.migration_name,
            state: stateOf(row),
            checksum: row.checksum,
            appliedStepsCount: row.applied_steps_count,
            startedAt: dateValue(row.started_at),
            finishedAt: dateValue(row.finished_at),
            rolledBackAt: dateValue(row.rolled_back_at),
            checksumMatchesRepository: checksums.get(row.migration_name) === row.checksum,
          })),
          failedMigrations: failed,
          rolledBackMigrations: rolledBack,
          checksumMismatch: checksumMismatches.length > 0,
          checksumMismatches,
          repositoryOnlyMigrations: repositoryOnly,
          productionOnlyMigrations: productionOnly,
          releaseMigration1: {
            name: MIGRATION_1,
            history: stateOf(byName.get(MIGRATION_1)),
            schema: migration1Schema,
            dataState: configDataState,
            partial: migration1Schema.status === "PARTIAL" || configDataState === "YES",
          },
          releaseMigration2: {
            name: MIGRATION_2,
            history: stateOf(byName.get(MIGRATION_2)),
            schema: migration2Schema,
            partial: migration2Schema.status === "PARTIAL",
          },
          schemaSummary: { columns, indexes, constraints, enums, policies },
          schemaDrift: partialSchema || schemaAhead || historyAhead,
          partialSchemaState: partialSchema ? "YES" : "NO",
          partialDataState: configDataState,
          remediationClass,
          migrateDeploySafe:
            failed.length === 0 && checksumMismatches.length === 0 && !partialSchema,
          resolveRequired: failed.length > 0,
          forwardFixRequired: partialSchema || schemaAhead || historyAhead,
          manualSqlRequired: "NO",
          productionDbWrite: "NO",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`FORENSICS_FAIL: ${safeThrownMessage(error)}`);
  process.exitCode = 1;
});
