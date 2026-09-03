import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const ENVIRONMENTS = new Set(["LOCAL", "TEST", "STAGING", "PRODUCTION"]);

type DbIdentity = {
  database: string;
  schema: string;
  current_user: string;
  server_address: string | null;
  server_port: number | null;
  server_version: string;
};

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

type ColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
};

function fail(message: string): never {
  throw new Error(`DB fingerprint reddedildi: ${message}`);
}

function requiredEnvironment(): string {
  const value = process.env.DB_FINGERPRINT_ENVIRONMENT?.trim().toUpperCase();
  if (!value || !ENVIRONMENTS.has(value)) {
    fail("DB_FINGERPRINT_ENVIRONMENT=LOCAL|TEST|STAGING|PRODUCTION açıkça verilmelidir");
  }
  return value;
}

function targetUrl(): string {
  const raw = process.env.DB_FINGERPRINT_DATABASE_URL?.trim();
  if (!raw) {
    fail("DB_FINGERPRINT_DATABASE_URL verilmelidir; DATABASE_URL fallback'i yoktur");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail("DB_FINGERPRINT_DATABASE_URL geçerli bir URL değil");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("yalnız PostgreSQL URL kabul edilir");
  }
  return raw;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested instanceof Date) return nested.toISOString();
    return nested;
  });
}

async function repositoryHashes(): Promise<{
  schemaHash: string;
  migrationManifestHash: string;
  migrationNames: string[];
}> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const schemaText = await readFile(join(repoRoot, "prisma", "schema.prisma"), "utf8");
  const migrationRoot = join(repoRoot, "prisma", "migrations");
  const migrationNames = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const manifest = [];
  for (const name of migrationNames) {
    const sql = await readFile(join(migrationRoot, name, "migration.sql"), "utf8");
    manifest.push({ name, sqlHash: sha256(sql) });
  }
  return {
    schemaHash: sha256(schemaText),
    migrationManifestHash: sha256(stableJson(manifest)),
    migrationNames,
  };
}

async function main(): Promise<void> {
  const environment = requiredEnvironment();
  const rawUrl = targetUrl();
  const parsedUrl = new URL(rawUrl);
  const repository = await repositoryHashes();
  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });

  try {
    await prisma.$connect();
    const [identityRows, migrationRows, columnRows] = await Promise.all([
      prisma.$queryRaw<DbIdentity[]>`
        SELECT
          current_database() AS database,
          current_schema() AS schema,
          current_user AS current_user,
          inet_server_addr()::text AS server_address,
          inet_server_port() AS server_port,
          version() AS server_version
      `,
      prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM _prisma_migrations
        ORDER BY started_at
      `,
      prisma.$queryRaw<ColumnRow[]>`
        SELECT table_schema, table_name, column_name, ordinal_position,
               data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_schema, table_name, ordinal_position
      `,
    ]);

    const identity = identityRows[0];
    if (!identity) fail("database identity okunamadı");

    const applied = migrationRows.filter((row) => row.finished_at && !row.rolled_back_at);
    const failed = migrationRows.filter((row) => !row.finished_at || row.rolled_back_at);
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    const pending = repository.migrationNames.filter((name) => !appliedNames.has(name));
    const lastApplied = applied.at(-1)?.migration_name ?? null;
    const liveSchemaHash = sha256(stableJson(columnRows));
    const fingerprintInput = {
      environment,
      database: {
        host: identity.server_address,
        port: identity.server_port,
        database: identity.database,
        schema: identity.schema,
        serverVersion: identity.server_version,
      },
      schemaHash: repository.schemaHash,
      liveSchemaHash,
      migrationManifestHash: repository.migrationManifestHash,
      lastAppliedMigration: lastApplied,
    };

    console.log(
      JSON.stringify(
        {
          status: failed.length === 0 && pending.length === 0 ? "PASS" : "REVIEW_REQUIRED",
          target: {
            environment,
            host: parsedUrl.hostname,
            port: parsedUrl.port || "5432",
            database: decodeURIComponent(
              parsedUrl.pathname.replace(/^\/+/, "").split("/")[0] ?? "",
            ),
            schema: parsedUrl.searchParams.get("schema") || "public",
          },
          database: {
            host: identity.server_address,
            port: identity.server_port,
            database: identity.database,
            schema: identity.schema,
            currentUser: identity.current_user,
            serverVersion: identity.server_version,
          },
          hashes: {
            schemaHash: repository.schemaHash,
            liveSchemaHash,
            migrationManifestHash: repository.migrationManifestHash,
          },
          migrations: {
            repositoryCount: repository.migrationNames.length,
            appliedCount: applied.length,
            pending,
            failed: failed.map((row) => ({
              name: row.migration_name,
              rolledBack: Boolean(row.rolled_back_at),
            })),
            lastApplied,
          },
          fingerprint: sha256(stableJson(fingerprintInput)),
          productionWrite: "NO",
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
  console.error(`DB fingerprint FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
