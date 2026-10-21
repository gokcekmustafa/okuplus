import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/u;

function invalid(message: string): never {
  throw new Error("production migration scope rejected: " + message);
}

export function parseApprovedMigrationScope(
  rawScope: string,
  repositoryMigrationNames: readonly string[],
): string[] {
  const scope = rawScope.trim();
  if (scope === "none") return [];
  if (!scope) invalid("approved migration scope is required; use 'none' for an empty scope");

  const repositoryNames = new Set(repositoryMigrationNames);
  const names = scope.split(",").map((name) => name.trim());
  if (names.some((name) => !name || !MIGRATION_NAME_PATTERN.test(name))) {
    invalid("scope must be 'none' or a comma-separated list of valid Prisma migration names");
  }
  if (new Set(names).size !== names.length) invalid("duplicate migration names are not allowed");
  const unknown = names.filter((name) => !repositoryNames.has(name));
  if (unknown.length > 0) {
    invalid("scope contains migration(s) absent from this master release: " + unknown.join(","));
  }
  return names.toSorted();
}

export function assertApprovedMigrationScopeMatchesPending(
  rawScope: string,
  pendingMigrations: unknown,
  repositoryMigrationNames: readonly string[],
): string[] {
  const approved = parseApprovedMigrationScope(rawScope, repositoryMigrationNames);
  if (
    !Array.isArray(pendingMigrations) ||
    pendingMigrations.some((name) => typeof name !== "string")
  ) {
    invalid("database fingerprint did not return a valid pending migration list");
  }

  const pending = parseApprovedMigrationScope(
    pendingMigrations.join(",") || "none",
    repositoryMigrationNames,
  );
  if (
    approved.length !== pending.length ||
    approved.some((name, index) => name !== pending[index])
  ) {
    invalid(
      "approved scope does not exactly match the database pending set (approved: " +
        (approved.join(",") || "none") +
        "; pending: " +
        (pending.join(",") || "none") +
        ")",
    );
  }
  return approved;
}

async function repositoryMigrationNames(): Promise<string[]> {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const migrationDirectory = join(resolve(scriptDirectory, ".."), "prisma", "migrations");
  return (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

async function readStdin(): Promise<string> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main(): Promise<void> {
  const rawScope = process.env.PRODUCTION_APPROVED_MIGRATION_SCOPE ?? "";
  const repositoryNames = await repositoryMigrationNames();
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === "--validate-only") {
    const approved = parseApprovedMigrationScope(rawScope, repositoryNames);
    console.log("APPROVED_MIGRATION_SCOPE_INPUT=PASS (" + approved.length + " migration(s))");
    return;
  }
  if (args.length !== 0) invalid("unsupported command-line argument");

  let report: { migrations?: { pending?: unknown } };
  try {
    report = JSON.parse(await readStdin()) as { migrations?: { pending?: unknown } };
  } catch {
    invalid("database fingerprint report is not valid JSON");
  }

  const approved = assertApprovedMigrationScopeMatchesPending(
    rawScope,
    report.migrations?.pending,
    repositoryNames,
  );
  console.log("PRODUCTION_MIGRATION_SCOPE=PASS (" + approved.length + " migration(s))");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "production migration scope rejected");
    process.exitCode = 1;
  });
}
