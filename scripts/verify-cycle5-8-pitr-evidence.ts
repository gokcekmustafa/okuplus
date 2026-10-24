import { readFileSync } from "node:fs";
import {
  isCycle5To8PitrEvidenceValid,
  type Cycle5To8PitrEvidenceExpectation,
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
    process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 5–8 production provision" ||
    process.env.CYCLE58_OPERATION !== "APPLY" ||
    process.env.CYCLE_PITR_SCOPE !== "cycle5-8"
  ) {
    throw new Error("protected Cycle 5–8 APPLY workflow identity did not match");
  }
  const path = required("CYCLE58_PITR_EVIDENCE_PATH");
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable");
  }
  const graphScope = required("CYCLE58_GRAPH_SCOPE");
  if (graphScope !== "CYCLE_5_ONLY" && graphScope !== "CYCLES_5_TO_8") {
    throw new Error("CYCLE58_GRAPH_SCOPE is invalid");
  }
  const expected: Cycle5To8PitrEvidenceExpectation = {
    runId: required("GITHUB_RUN_ID"),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
    sha: required("GITHUB_SHA").toLowerCase(),
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle5-8",
    graphScope,
  };
  if (!isCycle5To8PitrEvidenceValid(evidence, expected)) {
    throw new Error("same-run Cycle 5–8 PITR evidence is missing, failed, or incomplete");
  }
  process.stdout.write("CYCLE58_PITR_EVIDENCE=PASS (read-only validation)\n");
}

try {
  main();
} catch {
  process.stderr.write("Cycle 5–8 PITR evidence validation failed; APPLY is blocked.\n");
  process.exitCode = 1;
}
