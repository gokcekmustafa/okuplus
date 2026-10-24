import { readFileSync } from "node:fs";
import {
  isCycle13To16PitrEvidenceValid,
  type Cycle13To16PitrEvidenceExpectation,
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
    process.env.GITHUB_WORKFLOW !== "Manual Education V2 P1-A Cycles 13–16 production provision" ||
    process.env.CYCLE1316_OPERATION !== "APPLY" ||
    process.env.CYCLE_PITR_SCOPE !== "cycle13-16" ||
    process.env.CYCLE1316_GRAPH_SCOPE !== "CYCLES_13_TO_16"
  ) {
    throw new Error("protected Cycle 13–16 APPLY workflow identity did not match");
  }
  const path = required("CYCLE1316_PITR_EVIDENCE_PATH");
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable");
  }
  const expected: Cycle13To16PitrEvidenceExpectation = {
    runId: required("GITHUB_RUN_ID"),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim() || "1",
    sha: required("GITHUB_SHA").toLowerCase(),
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    scope: "cycle13-16",
    graphScope: "CYCLES_13_TO_16",
  };
  if (!isCycle13To16PitrEvidenceValid(evidence, expected)) {
    throw new Error("same-run Cycle 13–16 PITR evidence is missing, failed, or incomplete");
  }
  process.stdout.write("CYCLE1316_PITR_EVIDENCE=PASS (read-only validation)\n");
}

try {
  main();
} catch {
  process.stderr.write("Cycle 13–16 PITR evidence validation failed; APPLY is blocked.\n");
  process.exitCode = 1;
}
