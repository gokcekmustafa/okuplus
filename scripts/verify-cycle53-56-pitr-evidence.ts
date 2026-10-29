import { readFileSync } from "node:fs";
import {
  isCycle53To56PitrEvidenceValid,
  type Cycle53To56PitrEvidenceExpectation,
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
    process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 53–56 production provision" ||
    process.env.CYCLE5356_OPERATION !== "APPLY" ||
    process.env.CYCLE_PITR_SCOPE !== "cycle53-56" ||
    process.env.CYCLE5356_GRAPH_SCOPE !== "CYCLES_53_TO_56"
  ) {
    throw new Error("protected Cycle 53–56 APPLY workflow identity did not match");
  }
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(required("CYCLE5356_PITR_EVIDENCE_PATH"), "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable");
  }
  const expected: Cycle53To56PitrEvidenceExpectation = {
    runId: required("GITHUB_RUN_ID"),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
    sha: required("GITHUB_SHA").toLowerCase(),
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle53-56",
    graphScope: "CYCLES_53_TO_56",
  };
  if (!isCycle53To56PitrEvidenceValid(evidence, expected)) {
    throw new Error("same-run Cycle 53–56 PITR evidence is missing, failed, or incomplete");
  }
  process.stdout.write("CYCLE5356_PITR_EVIDENCE=PASS (read-only validation)\n");
}

try {
  main();
} catch {
  process.stderr.write("Cycle 53–56 PITR evidence validation failed; APPLY is blocked.\n");
  process.exitCode = 1;
}
