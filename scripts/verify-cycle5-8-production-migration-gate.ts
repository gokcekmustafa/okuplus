import { readFile } from "node:fs/promises";
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
  const operation = requiredEnvironment("CYCLE58_OPERATION");
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
