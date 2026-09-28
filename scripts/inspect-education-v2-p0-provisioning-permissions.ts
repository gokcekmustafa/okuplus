import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  targetFingerprint,
} from "../src/curriculum/catalog-target-verification.js";

const REQUIRED_ENVIRONMENT = "STAGING" as const;

const READ_TABLES = [
  "Level",
  "Skill",
  "Content",
  "ContentVersion",
  "ContentSkill",
  "ExerciseTemplate",
  "ExerciseTemplateVersion",
  "ExerciseTemplateVersionContent",
  "ExerciseTemplateVersionQuestion",
  "Question",
  "QuestionVersion",
  "Assessment",
] as const;

const WRITE_TABLES = ["LearningPath", "LearningUnit", "LearningStep"] as const;

type TablePrivilege = {
  tableName: string;
  canSelect: boolean;
  canInsert: boolean;
  rowSecurity: boolean;
  forceRowSecurity: boolean;
  readableUnderPlatformContext: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} gerekli`);
  return value;
}

function safeTarget(rawUrl: string) {
  const target = parseCatalogTargetUrl(rawUrl, REQUIRED_ENVIRONMENT);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  if (target.provider !== "NEON") throw new Error("staging hedefi Neon olmalı");
  return target;
}

async function readRoleAndTarget(
  client: PrismaClient,
  targetUrl: string,
): Promise<{
  database: string;
  db_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
}> {
  const rows = await client.$queryRaw<
    Array<{
      database: string;
      db_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>
  >`
    SELECT
      current_database() AS database,
      current_user AS db_user,
      r.rolsuper,
      r.rolbypassrls,
      r.rolcanlogin
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  `;
  const identity = rows[0];
  if (!identity) throw new Error("staging database identity okunamadı");
  const target = safeTarget(targetUrl);
  assertLiveCatalogTargetIdentity(target, identity);
  return identity;
}

async function readTablePrivileges(
  client: PrismaClient,
): Promise<{ schemaUsage: boolean; tables: TablePrivilege[] }> {
  const allTables = [...READ_TABLES, ...WRITE_TABLES];
  const tableRows = await client.$queryRaw<
    Array<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      row_security: boolean;
      force_row_security: boolean;
    }>
  >`
    SELECT
      names.table_name,
      has_table_privilege(current_user, format('public.%I', names.table_name), 'SELECT') AS can_select,
      has_table_privilege(current_user, format('public.%I', names.table_name), 'INSERT') AS can_insert,
      COALESCE(cls.relrowsecurity, false) AS row_security,
      COALESCE(cls.relforcerowsecurity, false) AS force_row_security
    FROM unnest(${allTables}::text[]) AS names(table_name)
    LEFT JOIN pg_catalog.pg_class cls
      ON cls.relname = names.table_name
    LEFT JOIN pg_catalog.pg_namespace ns
      ON ns.oid = cls.relnamespace
     AND ns.nspname = 'public'
    ORDER BY names.table_name
  `;

  const readability = new Map<string, boolean>();
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SELECT set_config('app.platform_role', 'CONTENT_EDITOR', true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', 'education-v2-p0-permission-check', true)`;
    for (const tableName of READ_TABLES) {
      try {
        await tx.$queryRawUnsafe(`SELECT 1 FROM public."${tableName}" LIMIT 0`);
        readability.set(tableName, true);
      } catch {
        readability.set(tableName, false);
      }
    }
  });

  const schemaRows = await client.$queryRaw<Array<{ schema_usage: boolean }>>`
    SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage
  `;
  return {
    schemaUsage: schemaRows[0]?.schema_usage === true,
    tables: tableRows.map((row) => ({
      tableName: row.table_name,
      canSelect: row.can_select,
      canInsert: row.can_insert,
      rowSecurity: row.row_security,
      forceRowSecurity: row.force_row_security,
      readableUnderPlatformContext: readability.get(row.table_name) ?? false,
    })),
  };
}

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const approvedUrl = required("DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = required("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT");
  const target = safeTarget(databaseUrl);
  const approvedTarget = safeTarget(approvedUrl);
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const approvedClient = new PrismaClient({ datasources: { db: { url: approvedUrl } } });

  try {
    const identity = await readRoleAndTarget(client, databaseUrl);
    const approvedIdentity = await readRoleAndTarget(approvedClient, approvedUrl);
    assertApprovedTargetFingerprint(approvedTarget, approvedIdentity, approvedFingerprint);
    const targetMatchesApproved =
      target.host === approvedTarget.host &&
      target.port === approvedTarget.port &&
      target.database === approvedTarget.database;
    if (!targetMatchesApproved) throw new Error("DATABASE_URL onaylı staging hedefiyle eşleşmiyor");

    const permissions = await readTablePrivileges(client);
    const readReady =
      permissions.schemaUsage &&
      READ_TABLES.every((tableName) => {
        const table = permissions.tables.find((entry) => entry.tableName === tableName);
        return table?.canSelect === true && table.readableUnderPlatformContext === true;
      });
    const writeReady =
      permissions.schemaUsage &&
      WRITE_TABLES.every((tableName) => {
        const table = permissions.tables.find((entry) => entry.tableName === tableName);
        return table?.canInsert === true;
      });
    const result = {
      status: readReady && writeReady ? "READY" : "BLOCKED",
      environment: REQUIRED_ENVIRONMENT,
      target: {
        databaseMatchesApproved: targetMatchesApproved,
        identityMatchesUrl: true,
        fingerprintVerified:
          targetFingerprint(approvedTarget, approvedIdentity) === approvedFingerprint,
      },
      role: {
        currentUser: identity.db_user,
        canLogin: identity.rolcanlogin,
        superuser: identity.rolsuper,
        bypassRls: identity.rolbypassrls,
      },
      permissions: {
        schemaUsage: permissions.schemaUsage,
        readReady,
        writeReady,
        tables: permissions.tables,
      },
      productionWrite: "NO",
    };
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "READY") process.exitCode = 1;
  } finally {
    await Promise.all([client.$disconnect(), approvedClient.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
