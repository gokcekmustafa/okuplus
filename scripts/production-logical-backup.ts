import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  isAgePublicRecipient,
  validateProductionBackupTarget,
} from "./production-logical-backup-contract.js";

type BackupStage =
  "TARGET_VALIDATION" | "DATABASE_IDENTITY" | "DUMP_AND_ENCRYPT" | "ARTIFACT_VALIDATION";

type BackupReport = {
  result: "PASS" | "FAIL";
  stage: BackupStage | null;
  failureReason: string | null;
  targetValidation: "PASS" | "FAIL";
  targetHostMatched: boolean;
  targetDatabaseMatched: boolean;
  databaseRoleReadOnly: boolean | null;
  databaseRoleSuperuser: boolean | null;
  databaseRoleBypassesRls: boolean | null;
  archiveFormat: "pg_dump_custom";
  encryption: "age";
  encryptedBytes: number | null;
  encryptedSha256: string | null;
  createdAt: string;
  commitSha: string | null;
};

const FAILURE_REASONS = [
  "DATABASE_URL_MISSING",
  "APPROVED_HOST_MISSING",
  "APPROVED_DATABASE_MISSING",
  "INVALID_DATABASE_URL",
  "INVALID_APPROVED_HOST",
  "POOLER_ENDPOINT_REJECTED",
  "PRODUCTION_HOST_MISMATCH",
  "DATABASE_NAME_MISMATCH",
  "DATABASE_CREDENTIALS_MISSING",
  "INSECURE_SSL_MODE",
  "UNSUPPORTED_URL_PARAMETER",
  "AGE_RECIPIENT_MISSING_OR_INVALID",
  "DATABASE_IDENTITY_QUERY_FAILED",
  "DATABASE_ROLE_NOT_READ_ONLY",
  "DATABASE_ROLE_PRIVILEGES_TOO_BROAD",
  "PG_DUMP_OR_AGE_FAILED",
  "ENCRYPTED_ARCHIVE_INVALID",
  "OUTPUT_PATH_UNSAFE",
] as const;

const POSTGRES_CLIENT_BIN = "/usr/lib/postgresql/18/bin";

function environment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function escapePgpass(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

function postgresToolEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
  };
}

function baseReport(): BackupReport {
  return {
    result: "FAIL",
    stage: "TARGET_VALIDATION",
    failureReason: null,
    targetValidation: "FAIL",
    targetHostMatched: false,
    targetDatabaseMatched: false,
    databaseRoleReadOnly: null,
    databaseRoleSuperuser: null,
    databaseRoleBypassesRls: null,
    archiveFormat: "pg_dump_custom",
    encryption: "age",
    encryptedBytes: null,
    encryptedSha256: null,
    createdAt: new Date().toISOString(),
    commitSha: environment("GITHUB_SHA") ?? null,
  };
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
  });
}

async function captureStdout(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string }> {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "ignore"] });
  let stdout = "";
  let overflow = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (stdout.length + chunk.length > 8192) {
      overflow = true;
      child.kill();
      return;
    }
    stdout += chunk;
  });
  const code = await waitForExit(child);
  return { code: overflow ? null : code, stdout: overflow ? "" : stdout.trim() };
}

function connectionEnvironment(databaseUrl: string, passFile: string): NodeJS.ProcessEnv {
  const parsed = new URL(databaseUrl);
  const username = decodeURIComponent(parsed.username);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  return {
    ...postgresToolEnvironment(),
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: database,
    PGUSER: username,
    PGPASSFILE: passFile,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "/etc/ssl/certs/ca-certificates.crt",
    PGOPTIONS: "-c default_transaction_read_only=on",
    ...(parsed.searchParams.get("channel_binding")
      ? { PGCHANNELBINDING: parsed.searchParams.get("channel_binding") ?? undefined }
      : {}),
  };
}

async function identityCheck(env: NodeJS.ProcessEnv): Promise<{
  database: string;
  readOnly: boolean;
  hasWritePrivileges: boolean;
  superuser: boolean;
  bypassesRls: boolean;
  canManageRolesOrDatabases: boolean;
}> {
  const sql = [
    "BEGIN READ ONLY;",
    `SELECT json_build_object(
      'database', current_database(),
      'readOnly', current_setting('transaction_read_only')::boolean,
      'superuser', role.rolsuper,
      'bypassesRls', role.rolbypassrls,
      'canManageRolesOrDatabases', role.rolcreatedb OR role.rolcreaterole OR role.rolreplication,
      'hasWritePrivileges',
        has_database_privilege(current_user, current_database(), 'CREATE')
        OR EXISTS (
          SELECT 1 FROM pg_namespace AS n
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND has_schema_privilege(current_user, n.oid, 'CREATE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND (
              has_table_privilege(current_user, c.oid, 'INSERT')
              OR has_table_privilege(current_user, c.oid, 'UPDATE')
              OR has_table_privilege(current_user, c.oid, 'DELETE')
              OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
              OR has_table_privilege(current_user, c.oid, 'TRIGGER')
              OR has_any_column_privilege(current_user, c.oid, 'INSERT')
              OR has_any_column_privilege(current_user, c.oid, 'UPDATE')
            )
        )
        OR EXISTS (
          SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND c.relkind = 'S'
            AND has_sequence_privilege(current_user, c.oid, 'UPDATE')
        )
    )::text FROM pg_roles AS role WHERE role.rolname = current_user;`,
    "COMMIT;",
  ].join(" ");
  const result = await captureStdout(
    join(POSTGRES_CLIENT_BIN, "psql"),
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--no-password", "-c", sql],
    env,
  );
  if (result.code !== 0 || !result.stdout) throw new Error("DATABASE_IDENTITY_QUERY_FAILED");
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    if (
      typeof parsed.database !== "string" ||
      typeof parsed.readOnly !== "boolean" ||
      typeof parsed.hasWritePrivileges !== "boolean" ||
      typeof parsed.superuser !== "boolean" ||
      typeof parsed.bypassesRls !== "boolean" ||
      typeof parsed.canManageRolesOrDatabases !== "boolean"
    ) {
      throw new Error("DATABASE_IDENTITY_QUERY_FAILED");
    }
    return {
      database: parsed.database,
      readOnly: parsed.readOnly,
      hasWritePrivileges: parsed.hasWritePrivileges,
      superuser: parsed.superuser,
      bypassesRls: parsed.bypassesRls,
      canManageRolesOrDatabases: parsed.canManageRolesOrDatabases,
    };
  } catch {
    throw new Error("DATABASE_IDENTITY_QUERY_FAILED");
  }
}

async function dumpAndEncrypt(
  env: NodeJS.ProcessEnv,
  recipient: string,
  outputFile: string,
): Promise<void> {
  const dump = spawn(join(POSTGRES_CLIENT_BIN, "pg_dump"), ["--format=custom", "--no-password"], {
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const encrypt = spawn("age", ["--encrypt", "--recipient", recipient, "--output", outputFile], {
    env: postgresToolEnvironment(),
    stdio: ["pipe", "ignore", "ignore"],
  });
  dump.stdout.pipe(encrypt.stdin);
  encrypt.stdin.on("error", () => dump.kill());
  const [dumpCode, encryptCode] = await Promise.all([waitForExit(dump), waitForExit(encrypt)]);
  if (dumpCode !== 0 || encryptCode !== 0) throw new Error("PG_DUMP_OR_AGE_FAILED");
}

async function writeReport(report: BackupReport): Promise<void> {
  const reportPath = environment("PRODUCTION_BACKUP_REPORT_FILE");
  if (reportPath) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  const summaryPath = environment("GITHUB_STEP_SUMMARY");
  if (summaryPath) {
    await writeFile(
      summaryPath,
      `## Encrypted production logical backup\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
      { flag: "a", mode: 0o600 },
    );
  }
}

async function run(): Promise<void> {
  const report = baseReport();
  let passDirectory: string | undefined;
  let outputFile: string | undefined;
  let artifactDirectoryOwned = false;
  try {
    const runnerTemp = environment("RUNNER_TEMP");
    outputFile = environment("PRODUCTION_BACKUP_ENCRYPTED_FILE");
    const reportPath = environment("PRODUCTION_BACKUP_REPORT_FILE");
    if (!runnerTemp || !outputFile || !reportPath) throw new Error("OUTPUT_PATH_UNSAFE");
    const tempRoot = resolve(runnerTemp);
    const artifactDirectory = dirname(resolve(outputFile));
    const relativeArtifactDirectory = relative(tempRoot, artifactDirectory);
    if (
      !relativeArtifactDirectory ||
      relativeArtifactDirectory.startsWith("..") ||
      isAbsolute(relativeArtifactDirectory) ||
      dirname(resolve(reportPath)) !== artifactDirectory ||
      basename(outputFile) !== "database.dump.age" ||
      basename(reportPath) !== "manifest.json"
    ) {
      throw new Error("OUTPUT_PATH_UNSAFE");
    }
    await mkdir(artifactDirectory, { mode: 0o700 });
    await chmod(artifactDirectory, 0o700);
    artifactDirectoryOwned = true;

    const target = validateProductionBackupTarget({
      databaseUrl: environment("PRODUCTION_BACKUP_DATABASE_URL"),
      approvedHost: environment("PRODUCTION_DB_APPROVED_HOST"),
      approvedDatabase: environment("PRODUCTION_DB_APPROVED_DATABASE"),
    });
    if (!target.ok) throw new Error(target.reason);
    const url = environment("PRODUCTION_BACKUP_DATABASE_URL");
    const recipient = environment("PRODUCTION_BACKUP_AGE_RECIPIENT");
    if (!isAgePublicRecipient(recipient)) throw new Error("AGE_RECIPIENT_MISSING_OR_INVALID");

    report.targetValidation = "PASS";
    report.stage = "DATABASE_IDENTITY";

    passDirectory = await mkdtemp(join(tmpdir(), "okuplus-backup-auth-"));
    await chmod(passDirectory, 0o700);
    const parsed = new URL(url!);
    const passFile = join(passDirectory, ".pgpass");
    const passLine = [
      parsed.hostname,
      parsed.port || "5432",
      decodeURIComponent(parsed.pathname.slice(1)),
      decodeURIComponent(parsed.username),
      decodeURIComponent(parsed.password),
    ]
      .map(escapePgpass)
      .join(":");
    await writeFile(passFile, `${passLine}\n`, { mode: 0o600 });
    await chmod(passFile, 0o600);
    const pgEnv = connectionEnvironment(url!, passFile);
    const identity = await identityCheck(pgEnv);
    report.targetHostMatched = true;
    report.targetDatabaseMatched =
      identity.database === environment("PRODUCTION_DB_APPROVED_DATABASE");
    report.databaseRoleReadOnly =
      identity.readOnly &&
      !identity.hasWritePrivileges &&
      !identity.superuser &&
      !identity.bypassesRls &&
      !identity.canManageRolesOrDatabases;
    report.databaseRoleSuperuser = identity.superuser;
    report.databaseRoleBypassesRls = identity.bypassesRls;
    if (!report.targetDatabaseMatched) throw new Error("DATABASE_NAME_MISMATCH");
    if (identity.hasWritePrivileges || !identity.readOnly) {
      throw new Error("DATABASE_ROLE_NOT_READ_ONLY");
    }
    if (identity.superuser || identity.bypassesRls || identity.canManageRolesOrDatabases) {
      throw new Error("DATABASE_ROLE_PRIVILEGES_TOO_BROAD");
    }

    report.stage = "DUMP_AND_ENCRYPT";
    process.umask(0o077);
    await dumpAndEncrypt(pgEnv, recipient!, outputFile);

    report.stage = "ARTIFACT_VALIDATION";
    const fileStat = await stat(outputFile);
    if (fileStat.size === 0) throw new Error("ENCRYPTED_ARCHIVE_INVALID");
    const hash = createHash("sha256");
    let encryptedBytes = 0;
    for await (const chunk of createReadStream(outputFile)) {
      const bytes = chunk as Buffer;
      encryptedBytes += bytes.byteLength;
      hash.update(bytes);
    }
    if (fileStat.size !== encryptedBytes) throw new Error("ENCRYPTED_ARCHIVE_INVALID");
    await chmod(outputFile, 0o600);
    report.encryptedBytes = fileStat.size;
    report.encryptedSha256 = hash.digest("hex");
    report.result = "PASS";
    report.stage = null;
    report.failureReason = null;
    report.createdAt = new Date().toISOString();
    await writeReport(report);
  } catch (error) {
    const rawReason = error instanceof Error ? error.message : "";
    const reason = FAILURE_REASONS.find((candidate) => candidate === rawReason);
    report.result = "FAIL";
    report.failureReason = reason ?? "PG_DUMP_OR_AGE_FAILED";
    if (!report.stage) report.stage = "ARTIFACT_VALIDATION";
    report.createdAt = new Date().toISOString();
    if (artifactDirectoryOwned && outputFile) {
      await rm(outputFile, { force: true }).catch(() => undefined);
      await writeReport(report).catch(() => undefined);
    }
    console.error(`Backup failed safely at ${report.stage}: ${report.failureReason}`);
    process.exitCode = 1;
  } finally {
    if (passDirectory)
      await rm(passDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

await run();
