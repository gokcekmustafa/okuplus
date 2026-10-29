import { readFileSync } from "node:fs";
import {
  isCycle41To44PitrEvidenceValid,
  type Cycle41To44PitrEvidenceExpectation,
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
    process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 41–44 production provision" ||
    process.env.CYCLE4144_OPERATION !== "APPLY" ||
    process.env.CYCLE_PITR_SCOPE !== "cycle41-44" ||
    process.env.CYCLE4144_GRAPH_SCOPE !== "CYCLES_41_TO_44"
  ) {
    throw new Error("protected Cycle 41–44 APPLY workflow identity did not match");
  }
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(required("CYCLE4144_PITR_EVIDENCE_PATH"), "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable");
  }
  const expected: Cycle41To44PitrEvidenceExpectation = {
    runId: required("GITHUB_RUN_ID"),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
    sha: required("GITHUB_SHA").toLowerCase(),
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle41-44",
    graphScope: "CYCLES_41_TO_44",
  };
  if (!isCycle41To44PitrEvidenceValid(evidence, expected)) {
    throw new Error("same-run Cycle 41–44 PITR evidence is missing, failed, or incomplete");
  }
  process.stdout.write("CYCLE4144_PITR_EVIDENCE=PASS (read-only validation)\n");
}

try {
  main();
} catch {
  process.stderr.write("Cycle 41–44 PITR evidence validation failed; APPLY is blocked.\n");
  process.exitCode = 1;
}
