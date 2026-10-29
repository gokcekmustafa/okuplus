import { readFile } from "node:fs/promises";
import {
  CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256,
  verifyCycle5To8GraphOnlyMigrationSources,
} from "../src/lib/canonical-placement-migration-policy.js";
import {
  evaluateCycle5To8MigrationGate,
  type CanonicalPlacementMigrationPolicyInput,
  type Cycle5To8MigrationOperation,
} from "../src/lib/canonical-placement-migration-policy.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const cycle58Operation = process.env.CYCLE58_OPERATION?.trim();
  const cycle912Operation = process.env.CYCLE912_OPERATION?.trim();
  const cycle1316Operation = process.env.CYCLE1316_OPERATION?.trim();
  const cycle1720Operation = process.env.CYCLE1720_OPERATION?.trim();
  const cycle2124Operation = process.env.CYCLE2124_OPERATION?.trim();
  const cycle2528Operation = process.env.CYCLE2528_OPERATION?.trim();
  const cycle2932Operation = process.env.CYCLE2932_OPERATION?.trim();
  const cycle3336Operation = process.env.CYCLE3336_OPERATION?.trim();
  const cycle3740Operation = process.env.CYCLE3740_OPERATION?.trim();
  const cycle4144Operation = process.env.CYCLE4144_OPERATION?.trim();
  const cycle4548Operation = process.env.CYCLE4548_OPERATION?.trim();
  if (
    [
      cycle58Operation,
      cycle912Operation,
      cycle1316Operation,
      cycle1720Operation,
      cycle2124Operation,
      cycle2528Operation,
      cycle2932Operation,
      cycle3336Operation,
      cycle3740Operation,
      cycle4144Operation,
      cycle4548Operation,
    ].filter(Boolean).length > 1
  ) {
    throw new Error("only one protected curriculum operation may be selected");
  }
  const operation =
    cycle4548Operation ||
    cycle4144Operation ||
    cycle2124Operation ||
    cycle2932Operation ||
    cycle3336Operation ||
    cycle3740Operation ||
    cycle2528Operation ||
    cycle1720Operation ||
    cycle1316Operation ||
    cycle912Operation ||
    cycle58Operation ||
    requiredEnvironment("CYCLE58_OPERATION");
  if (operation !== "PLAN_ONLY" && operation !== "APPLY") {
    throw new Error("CYCLE58_OPERATION must be PLAN_ONLY or APPLY");
  }
  const rawReport = JSON.parse(
    await readFile(requiredEnvironment("MIGRATION_FORENSICS_REPORT_FILE"), "utf8"),
  ) as Omit<CanonicalPlacementMigrationPolicyInput, "targetIdentityMatch"> & {
    targetIdentityMatch?: unknown;
  };
  const input: CanonicalPlacementMigrationPolicyInput = {
    ...rawReport,
    targetIdentityMatch:
      rawReport.targetIdentityMatch === true || rawReport.targetIdentityMatch === "MATCH",
    cycle5To8GraphOnlyMigrationSourcesVerified: verifyCycle5To8GraphOnlyMigrationSources(
      Object.fromEntries(
        await Promise.all(
          Object.keys(CYCLE5_TO_8_GRAPH_ONLY_PENDING_MIGRATION_SHA256).map(async (name) => [
            name,
            await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
          ]),
        ),
      ),
    ),
  };
  const result = evaluateCycle5To8MigrationGate(operation as Cycle5To8MigrationOperation, input);
  console.log(
    JSON.stringify(
      {
        ...result,
        decision: result.allowed
          ? operation === "PLAN_ONLY"
            ? "READ_ONLY_PLAN_ALLOWED"
            : "APPLY_PREFLIGHT_ALLOWED"
          : "BLOCKED",
      },
      null,
      2,
    ),
  );
  if (!result.allowed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Cycle 5–8 migration gate failed");
  process.exitCode = 1;
});
