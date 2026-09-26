import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export type MigrationRow = {
  id: string;
  migrationName: string;
  checksum: string;
  startedAt: string | null;
  finishedAt: string | null;
  rolledBackAt: string | null;
  appliedStepsCount: number;
  logs: "PRESENT" | "NONE";
};

export type MigrationRowMetadata = {
  id: string;
  migration_name: string;
  checksum: string;
  started_at: string | null;
  finished_at: string | null;
  rolled_back_at: string | null;
  applied_steps_count: number;
};

export type ExtraMigrationMetadata = MigrationRowMetadata & {
  repository_exists: "YES" | "NO";
  staging_branch_exists: "YES" | "NO";
  master_branch_exists: "YES" | "NO";
  archived_artifact_exists: "YES" | "NO";
  known_from_git_history: "YES" | "NO";
};

export type MigrationSetReport = {
  readOnly: "YES";
  targetEnvironment: "STAGING";
  fingerprintStatus: "PASS";
  databaseIdentityStatus: "PASS";
  repositoryCount: number;
  repositoryNames: string[];
  activeAppliedCount: number;
  activeAppliedNames: string[];
  extraActiveInDb: string[];
  missingFromDb: string[];
  duplicateActiveNames: string[];
  rolledBackNames: string[];
  unresolvedFailedNames: string[];
  migrationRows: MigrationRowMetadata[];
  extraActiveDetails: ExtraMigrationMetadata[];
};

export type GitMetadata = {
  stagingBranchExists: boolean;
  masterBranchExists: boolean;
  archivedArtifactExists: boolean;
  knownFromGitHistory: boolean;
};

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function toMetadata(row: MigrationRow): MigrationRowMetadata {
  return {
    id: row.id,
    migration_name: row.migrationName,
    checksum: row.checksum,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    rolled_back_at: row.rolledBackAt,
    applied_steps_count: row.appliedStepsCount,
  };
}

export function buildMigrationSetReport(
  rows: readonly MigrationRow[],
  repositoryMigrationNames: readonly string[],
  gitMetadataByMigration: ReadonlyMap<string, GitMetadata> = new Map(),
): MigrationSetReport {
  const repositoryNames = uniqueSorted(repositoryMigrationNames);
  const repositorySet = new Set(repositoryNames);
  const activeRows = rows.filter((row) => row.finishedAt !== null && row.rolledBackAt === null);
  const activeNames = uniqueSorted(activeRows.map((row) => row.migrationName));
  const activeSet = new Set(activeNames);
  const rolledBackNames = uniqueSorted(
    rows.filter((row) => row.rolledBackAt !== null).map((row) => row.migrationName),
  );
  const unresolvedFailedNames = uniqueSorted(
    rows
      .filter((row) => row.finishedAt === null && row.rolledBackAt === null)
      .map((row) => row.migrationName),
  );
  const activeCounts = new Map<string, number>();
  for (const row of activeRows) {
    activeCounts.set(row.migrationName, (activeCounts.get(row.migrationName) ?? 0) + 1);
  }
  const duplicateActiveNames = uniqueSorted(
    [...activeCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  );
  const extraActiveInDb = activeNames.filter((name) => !repositorySet.has(name));
  const migrationRows = rows.map(toMetadata);
  const extraActiveDetails = activeRows
    .filter((row) => extraActiveInDb.includes(row.migrationName))
    .map((row) => {
      const git = gitMetadataByMigration.get(row.migrationName) ?? {
        stagingBranchExists: false,
        masterBranchExists: false,
        archivedArtifactExists: false,
        knownFromGitHistory: false,
      };
      return {
        ...toMetadata(row),
        repository_exists: repositorySet.has(row.migrationName) ? "YES" : "NO",
        staging_branch_exists: git.stagingBranchExists ? "YES" : "NO",
        master_branch_exists: git.masterBranchExists ? "YES" : "NO",
        archived_artifact_exists: git.archivedArtifactExists ? "YES" : "NO",
        known_from_git_history: git.knownFromGitHistory ? "YES" : "NO",
      };
    });

  return {
    readOnly: "YES",
    targetEnvironment: "STAGING",
    fingerprintStatus: "PASS",
    databaseIdentityStatus: "PASS",
    repositoryCount: repositoryNames.length,
    repositoryNames,
    activeAppliedCount: activeRows.length,
    activeAppliedNames: activeNames,
    extraActiveInDb,
    missingFromDb: repositoryNames.filter((name) => !activeSet.has(name)),
    duplicateActiveNames,
    rolledBackNames,
    unresolvedFailedNames,
    migrationRows,
    extraActiveDetails,
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

function isMigrationRow(value: unknown): value is MigrationRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MigrationRow>;
  return (
    typeof row.id === "string" &&
    typeof row.migrationName === "string" &&
    typeof row.checksum === "string" &&
    (row.startedAt === null || typeof row.startedAt === "string") &&
    (row.finishedAt === null || typeof row.finishedAt === "string") &&
    (row.rolledBackAt === null || typeof row.rolledBackAt === "string") &&
    Number.isInteger(row.appliedStepsCount) &&
    (row.logs === "PRESENT" || row.logs === "NONE")
  );
}

function gitPathExists(ref: string, path: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}:${path}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function gitHistoryContains(path: string): boolean {
  try {
    const output = execFileSync("git", ["rev-list", "--all", "--objects", "--", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function migrationGitMetadata(name: string): GitMetadata {
  const path = `prisma/migrations/${name}/migration.sql`;
  const stagingBranchExists = gitPathExists("HEAD", path);
  const masterBranchExists = gitPathExists("refs/remotes/origin/master", path);
  const knownFromGitHistory = gitHistoryContains(path);
  return {
    stagingBranchExists,
    masterBranchExists,
    knownFromGitHistory,
    archivedArtifactExists: knownFromGitHistory && !stagingBranchExists && !masterBranchExists,
  };
}

async function main(): Promise<void> {
  const {
    assertCatalogEnvironmentSafety,
    assertLiveCatalogTargetIdentity,
    parseCatalogTargetUrl,
    targetFingerprint,
  } = await import("../src/curriculum/catalog-target-verification.js");
  const outputPath = requiredEnvironment("FORENSIC_OUTPUT");
  const fingerprintOutputPath = requiredEnvironment("FINGERPRINT_OUTPUT");
  const expectedFingerprint = requiredEnvironment("EXPECTED_STAGING_FINGERPRINT");
  const approvedFingerprint = requiredEnvironment("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT");
  const environment = requiredEnvironment("DB_FINGERPRINT_ENVIRONMENT").toUpperCase();
  const fingerprintDatabaseUrl = requiredEnvironment("DB_FINGERPRINT_DATABASE_URL");

  if (environment !== "STAGING") throw new Error("environment_not_staging");
  if (approvedFingerprint !== expectedFingerprint) throw new Error("approved_fingerprint_mismatch");

  let report: Record<string, unknown>;
  try {
    report = JSON.parse(await readFile(fingerprintOutputPath, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("fingerprint_report_invalid");
  }

  const target = report.target as Record<string, unknown> | undefined;
  const database = report.database as Record<string, unknown> | undefined;
  const migrations = report.migrations as Record<string, unknown> | undefined;
  if (target?.environment !== "STAGING") throw new Error("target_environment_mismatch");
  if (typeof report.targetIdentityFingerprint !== "string") {
    throw new Error("target_fingerprint_missing");
  }
  if (
    !/^[a-f0-9]{64}$/u.test(report.targetIdentityFingerprint) ||
    report.targetIdentityFingerprint !== expectedFingerprint
  ) {
    throw new Error("target_fingerprint_mismatch");
  }
  if (
    typeof target.database !== "string" ||
    typeof database?.database !== "string" ||
    target.database !== database.database ||
    typeof database.currentUser !== "string"
  ) {
    throw new Error("database_identity_mismatch");
  }

  try {
    const parsedTarget = parseCatalogTargetUrl(fingerprintDatabaseUrl, "STAGING");
    const identity = { database: database.database, db_user: database.currentUser };
    assertCatalogEnvironmentSafety(parsedTarget, { rejectTestDatabase: true });
    assertLiveCatalogTargetIdentity(parsedTarget, identity);
    if (targetFingerprint(parsedTarget, identity) !== expectedFingerprint) {
      throw new Error("target_fingerprint_mismatch");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "target_fingerprint_mismatch") throw error;
    throw new Error("database_identity_guard_failed");
  }

  const rowsValue = migrations?.rows;
  if (!Array.isArray(rowsValue) || !rowsValue.every(isMigrationRow)) {
    throw new Error("migration_rows_invalid");
  }
  const scriptDirectory = resolve(fileURLToPath(import.meta.url), "..");
  const migrationRoot = resolve(scriptDirectory, "../prisma/migrations");
  const repositoryNames = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const extraNames = uniqueSorted(
    rowsValue
      .filter((row) => row.finishedAt !== null && row.rolledBackAt === null)
      .map((row) => row.migrationName)
      .filter((name) => !repositoryNames.includes(name)),
  );
  const gitMetadata = new Map(extraNames.map((name) => [name, migrationGitMetadata(name)]));
  await writeFile(
    outputPath,
    `${JSON.stringify(buildMigrationSetReport(rowsValue, repositoryNames, gitMetadata), null, 2)}\n`,
    "utf8",
  );
}

const currentFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (currentFile === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "unknown_error";
    console.error(`staging active migration forensic failed: ${reason}`);
    process.exitCode = 1;
  });
}
