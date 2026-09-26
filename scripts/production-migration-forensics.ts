import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { providerForHost, targetIdentityFingerprint } from "./db-fingerprint-contract.js";

const MIGRATION_1 = "20260905090000_add_exercise_template_version_config";
const MIGRATION_2 = "20260907150000_add_training_session_models";
const INIT_MIGRATION = "20260817000000_init";

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
type MigrationFileHistory = {
  path: string;
  creationCommit: string | null;
  changeCommitCount: number;
  contentChangedAfterCreation: "YES" | "NO" | "UNKNOWN";
};

type Migration1DataPreflight = {
  status: "PASS" | "REVIEW_REQUIRED" | "UNKNOWN";
  totalExerciseTemplateVersions: number | null;
  backfillTargetCount: number | null;
  alreadyConfigured: number | null;
  parentConfigAvailable: number | null;
  parentConfigMissing: number | null;
  missingParent: number | null;
  deterministic: "YES" | "NO" | "UNKNOWN";
  reason: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function approvedHistoricalChecksums(): Map<string, string> {
  const raw = process.env.PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS?.trim();
  if (!raw) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("approved historical migration checksums must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("approved historical migration checksums must be a JSON object");
  }

  const result = new Map<string, string>();
  for (const [migrationName, checksum] of Object.entries(parsed)) {
    if (!/^20[0-9]{12}_[a-z0-9_]+$/u.test(migrationName)) {
      throw new Error("approved historical migration name is invalid");
    }
    if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/u.test(checksum)) {
      throw new Error("approved historical migration checksum is invalid");
    }
    result.set(migrationName, checksum);
  }
  return result;
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

async function repositoryChecksumVariants(migrationName: string): Promise<Set<string>> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationPath = join(root, "prisma", "migrations", migrationName, "migration.sql");
  const sql = await readFile(migrationPath, "utf8");
  const variants = new Set([sha256(sql)]);

  if (migrationName === INIT_MIGRATION) {
    variants.add(sha256(sql.replace(/\r?\n/gu, "\r\n")));
  }
  return variants;
}

function migrationFileHistory(root: string, migrationName: string): MigrationFileHistory {
  const relativePath = `prisma/migrations/${migrationName}/migration.sql`;

  try {
    const commits = execFileSync(
      "git",
      ["log", "--follow", "--format=%H", "--diff-filter=AM", "--", relativePath],
      { cwd: root, encoding: "utf8" },
    )
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      path: relativePath,
      creationCommit: commits.at(-1) ?? null,
      changeCommitCount: Math.max(commits.length - 1, 0),
      contentChangedAfterCreation: commits.length > 1 ? "YES" : "NO",
    };
  } catch {
    return {
      path: relativePath,
      creationCommit: null,
      changeCommitCount: 0,
      contentChangedAfterCreation: "UNKNOWN",
    };
  }
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
  const approvedHistorical = approvedHistoricalChecksums();
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
            AND table_name IN (
              'ExerciseTemplateVersion', 'TrainingSession', 'TrainingSessionItem',
              'User', 'Tenant', 'Membership', 'Content', 'ContentVersion', 'Question',
              'QuestionVersion', 'ExerciseTemplate', 'ExerciseSession', 'Attempt',
              'StudentProfile', 'StudentProgress', 'Assessment', 'PointEvent', 'StudentStreak'
            )
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
    const initMigrationFileHistory = migrationFileHistory(
      resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      "20260817000000_init",
    );
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
    const historicalChecksumAcknowledgements: Array<{
      migrationName: string;
      productionChecksum: string;
      repositoryChecksum: string;
      lineEndingEquivalent: boolean;
    }> = [];
    const unresolvedChecksumMismatches: string[] = [];

    for (const row of migrations) {
      if (!checksumMismatches.includes(row.migration_name)) continue;

      const approvedChecksum = approvedHistorical.get(row.migration_name);
      const variants = await repositoryChecksumVariants(row.migration_name);
      const lineEndingEquivalent = variants.has(row.checksum);
      const historicallyApproved =
        row.migration_name === INIT_MIGRATION && approvedChecksum === row.checksum;
      if (historicallyApproved) {
        historicalChecksumAcknowledgements.push({
          migrationName: row.migration_name,
          productionChecksum: row.checksum,
          repositoryChecksum: checksums.get(row.migration_name)!,
          lineEndingEquivalent,
        });
      } else {
        unresolvedChecksumMismatches.push(row.migration_name);
      }
    }

    const initSchema = checkSchema(columns, indexes, constraints, enums, policies, {
      columns: [
        ...["id", "email", "status"].map((column) => `User.${column}`),
        ...["id", "type", "status"].map((column) => `Tenant.${column}`),
        ...["id", "tenantId", "userId", "role", "status"].map((column) => `Membership.${column}`),
        ...["id", "status", "currentVersionId"].map((column) => `Content.${column}`),
        ...["id", "contentId", "version", "status"].map((column) => `ContentVersion.${column}`),
        ...["id", "contentId", "status"].map((column) => `Question.${column}`),
        ...["id", "questionId", "version", "status"].map((column) => `QuestionVersion.${column}`),
        ...["id", "tenantId", "type", "status"].map((column) => `ExerciseTemplate.${column}`),
        ...["id", "templateId", "version", "status"].map(
          (column) => `ExerciseTemplateVersion.${column}`,
        ),
        ...["id", "studentId", "templateVersionId", "status"].map(
          (column) => `ExerciseSession.${column}`,
        ),
        ...["id", "tenantId", "sessionId", "questionVersionId"].map(
          (column) => `Attempt.${column}`,
        ),
        ...["id", "tenantId", "studentId"].map((column) => `StudentProfile.${column}`),
        ...["id", "tenantId", "studentId", "skillId"].map((column) => `StudentProgress.${column}`),
        ...["id", "status"].map((column) => `Assessment.${column}`),
        ...["id", "tenantId", "studentId", "eventType", "points"].map(
          (column) => `PointEvent.${column}`,
        ),
        ...["id", "tenantId", "studentId", "currentDays"].map(
          (column) => `StudentStreak.${column}`,
        ),
      ],
      indexes: [],
      constraints: [],
      enums: [],
      policies: [],
    });

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
    let migration1DataPreflight: Migration1DataPreflight = {
      status: "UNKNOWN",
      totalExerciseTemplateVersions: null,
      backfillTargetCount: null,
      alreadyConfigured: null,
      parentConfigAvailable: null,
      parentConfigMissing: null,
      missingParent: null,
      deterministic: "UNKNOWN",
      reason: "required ExerciseTemplateVersion schema is unavailable",
    };

    const exerciseTemplateVersionTableExists = columns.some(
      (row) => row.table_name === "ExerciseTemplateVersion",
    );
    const exerciseTemplateTableExists = columns.some(
      (row) => row.table_name === "ExerciseTemplate",
    );
    const exerciseTemplateVersionConfigExists = columns.some(
      (row) => row.table_name === "ExerciseTemplateVersion" && row.column_name === "config",
    );

    if (exerciseTemplateVersionTableExists && exerciseTemplateTableExists) {
      const rows = exerciseTemplateVersionConfigExists
        ? await prisma.$queryRaw<
            Array<{
              total: number;
              target: number;
              configured: number;
              parentConfigAvailable: number;
              parentConfigMissing: number;
              missingParent: number;
            }>
          >`
            SELECT count(*)::int AS total,
                   count(*) FILTER (
                     WHERE version."config" IS NULL OR version."config" = 'null'::jsonb
                   )::int AS target,
                   count(*) FILTER (WHERE version."config" IS NOT NULL)::int AS configured,
                   count(*) FILTER (
                     WHERE template."id" IS NOT NULL
                       AND template."config" IS NOT NULL
                       AND template."config" <> 'null'::jsonb
                   )::int AS "parentConfigAvailable",
                   count(*) FILTER (
                     WHERE template."id" IS NOT NULL
                       AND (template."config" IS NULL OR template."config" = 'null'::jsonb)
                   )::int AS "parentConfigMissing",
                   count(*) FILTER (WHERE template."id" IS NULL)::int AS "missingParent"
            FROM "ExerciseTemplateVersion" AS version
            LEFT JOIN "ExerciseTemplate" AS template
              ON template."id" = version."templateId"
          `
        : await prisma.$queryRaw<
            Array<{
              total: number;
              parentConfigAvailable: number;
              parentConfigMissing: number;
              missingParent: number;
            }>
          >`
            SELECT count(*)::int AS total,
                   count(*) FILTER (
                     WHERE template."id" IS NOT NULL
                       AND template."config" IS NOT NULL
                       AND template."config" <> 'null'::jsonb
                   )::int AS "parentConfigAvailable",
                   count(*) FILTER (
                     WHERE template."id" IS NOT NULL
                       AND (template."config" IS NULL OR template."config" = 'null'::jsonb)
                   )::int AS "parentConfigMissing",
                   count(*) FILTER (WHERE template."id" IS NULL)::int AS "missingParent"
            FROM "ExerciseTemplateVersion" AS version
            LEFT JOIN "ExerciseTemplate" AS template
              ON template."id" = version."templateId"
          `;

      const counts = rows[0];
      const total = counts?.total ?? 0;
      const target = exerciseTemplateVersionConfigExists
        ? (counts as { target: number }).target
        : total;
      const configured = exerciseTemplateVersionConfigExists
        ? (counts as { configured: number }).configured
        : 0;
      const parentConfigAvailable = counts?.parentConfigAvailable ?? 0;
      const parentConfigMissing = counts?.parentConfigMissing ?? 0;
      const missingParent = counts?.missingParent ?? 0;
      const safe = missingParent === 0 && parentConfigMissing === 0;

      migration1DataPreflight = {
        status: safe ? "PASS" : "REVIEW_REQUIRED",
        totalExerciseTemplateVersions: total,
        backfillTargetCount: target,
        alreadyConfigured: configured,
        parentConfigAvailable,
        parentConfigMissing,
        missingParent,
        deterministic: missingParent === 0 ? "YES" : "NO",
        reason: safe
          ? "every target has exactly one parent config source"
          : "missing parent or null parent config requires review before backfill",
      };
    }

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
      (partialSchema || unresolvedChecksumMismatches.length > 0 || schemaAhead || historyAhead);
    const remediationClass =
      unresolvedChecksumMismatches.length > 0
        ? "D_CHECKSUM_MISMATCH"
        : historicalChecksumAcknowledgements.length > 0
          ? "I_HISTORICAL_CHECKSUM_ACKNOWLEDGED"
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
            repositoryChecksum: checksums.get(row.migration_name) ?? null,
            migrationFileExists: checksums.has(row.migration_name),
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
          historicalChecksumAcknowledgements,
          unresolvedChecksumMismatches,
          migrationFileHistory: initMigrationFileHistory,
          repositoryOnlyMigrations: repositoryOnly,
          productionOnlyMigrations: productionOnly,
          releaseMigration1: {
            name: MIGRATION_1,
            history: stateOf(byName.get(MIGRATION_1)),
            schema: migration1Schema,
            dataState: configDataState,
            partial: migration1Schema.status === "PARTIAL" || configDataState === "YES",
            dataPreflight: migration1DataPreflight,
          },
          releaseMigration2: {
            name: MIGRATION_2,
            history: stateOf(byName.get(MIGRATION_2)),
            schema: migration2Schema,
            partial: migration2Schema.status === "PARTIAL",
          },
          initSchemaCompatibility: initSchema.status === "COMPLETE" ? "PASS" : "FAIL",
          schemaSummary: { columns, indexes, constraints, enums, policies },
          schemaDrift: partialSchema || schemaAhead || historyAhead,
          partialSchemaState: partialSchema ? "YES" : "NO",
          partialDataState: configDataState,
          remediationClass,
          migrateDeploySafe:
            failed.length === 0 &&
            unresolvedChecksumMismatches.length === 0 &&
            !partialSchema &&
            !schemaAhead &&
            !historyAhead,
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
