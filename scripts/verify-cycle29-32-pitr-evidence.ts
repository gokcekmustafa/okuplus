import { readFileSync } from "node:fs";
import {
  isCycle29To32PitrEvidenceValid,
  type Cycle29To32PitrEvidenceExpectation,
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
    process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 29–32 production provision" ||
    process.env.CYCLE2932_OPERATION !== "APPLY" ||
    process.env.CYCLE_PITR_SCOPE !== "cycle29-32" ||
    process.env.CYCLE2932_GRAPH_SCOPE !== "CYCLES_29_TO_32"
  ) {
    throw new Error("protected Cycle 29–32 APPLY workflow identity did not match");
  }
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(required("CYCLE2932_PITR_EVIDENCE_PATH"), "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable");
  }
  const expected: Cycle29To32PitrEvidenceExpectation = {
    runId: required("GITHUB_RUN_ID"),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
    sha: required("GITHUB_SHA").toLowerCase(),
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle29-32",
    graphScope: "CYCLES_29_TO_32",
  };
  if (!isCycle29To32PitrEvidenceValid(evidence, expected)) {
    throw new Error("same-run Cycle 29–32 PITR evidence is missing, failed, or incomplete");
  }
  process.stdout.write("CYCLE2932_PITR_EVIDENCE=PASS (read-only validation)\n");
}

try {
  main();
} catch {
  process.stderr.write("Cycle 29–32 PITR evidence validation failed; APPLY is blocked.\n");
  process.exitCode = 1;
}
