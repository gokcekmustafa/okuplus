import { readFileSync } from "node:fs";
import {
  isCycle9To12PitrEvidenceValid,
  type Cycle9To12PitrEvidenceExpectation,
} from "./production-cycle4-pitr-restore-evidence.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function main(): void {
  if (
    process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    process.env.GITHUB_REF !== "refs/heads/master" ||
    process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 9–12 production provision" ||
    process.env.CYCLE912_OPERATION !== "APPLY" ||
    process.env.CYCLE_PITR_SCOPE !== "cycle9-12" ||
    process.env.CYCLE912_GRAPH_SCOPE !== "CYCLES_9_TO_12"
  ) {
    throw new Error("protected Cycle 9–12 APPLY workflow identity did not match");
  }
  const path = required("CYCLE912_PITR_EVIDENCE_PATH");
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable");
  }
  const expected: Cycle9To12PitrEvidenceExpectation = {
    runId: required("GITHUB_RUN_ID"),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
    sha: required("GITHUB_SHA").toLowerCase(),
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle9-12",
    graphScope: "CYCLES_9_TO_12",
  };
  if (!isCycle9To12PitrEvidenceValid(evidence, expected)) {
    throw new Error("same-run Cycle 9–12 PITR evidence is missing, failed, or incomplete");
  }
  process.stdout.write("CYCLE912_PITR_EVIDENCE=PASS (read-only validation)\n");
}

try {
  main();
} catch {
  process.stderr.write("Cycle 9–12 PITR evidence validation failed; APPLY is blocked.\n");
  process.exitCode = 1;
}
