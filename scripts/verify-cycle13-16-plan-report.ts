import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Cycle13To16Sequence = 13 | 14 | 15 | 16;
export type Cycle13To16PlanState = "MISSING" | "EXISTING" | "SKILL_LINKS_MISSING";

export type Cycle13To16PlanValidation =
  | { valid: true; state: Cycle13To16PlanState }
  | {
      valid: false;
      reason:
        | "REPORT_NOT_OBJECT"
        | "STATUS_NOT_PASS"
        | "MODE_NOT_DRY_RUN"
        | "RELEASE_ID_MISMATCH"
        | "RELEASE_COMMIT_MISMATCH"
        | "SEQUENCE_MISMATCH"
        | "GRAPH_STATE_INVALID"
        | "PLAN_REPORTED_WRITE"
        | "RESOURCE_COUNTS_MISMATCH";
    };

export type Cycle13To16PlanExpectation = {
  sequence: Cycle13To16Sequence;
  releaseId: string;
  commit: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCycle13To16ReadOnlyPlanReport(
  value: unknown,
  expected: Cycle13To16PlanExpectation,
): Cycle13To16PlanValidation {
  if (!isRecord(value)) return { valid: false, reason: "REPORT_NOT_OBJECT" };
  if (value.status !== "PASS") return { valid: false, reason: "STATUS_NOT_PASS" };
  if (value.mode !== "DRY_RUN") return { valid: false, reason: "MODE_NOT_DRY_RUN" };
  if (
    value.immutableReleaseId !== expected.releaseId ||
    value.productionReleaseId !== expected.releaseId
  ) {
    return { valid: false, reason: "RELEASE_ID_MISMATCH" };
  }
  if (
    value.expectedSourceCommit !== expected.commit ||
    value.productionReleaseCommit !== expected.commit
  ) {
    return { valid: false, reason: "RELEASE_COMMIT_MISMATCH" };
  }
  if (value.sequence !== expected.sequence) return { valid: false, reason: "SEQUENCE_MISMATCH" };
  if (
    typeof value.state !== "string" ||
    !["MISSING", "EXISTING", "SKILL_LINKS_MISSING"].includes(value.state)
  ) {
    return { valid: false, reason: "GRAPH_STATE_INVALID" };
  }
  if (value.dbChanged !== false) return { valid: false, reason: "PLAN_REPORTED_WRITE" };

  const expectedCounts: Record<string, number> = {
    stepCount: 5,
    contentCount: 5,
    exerciseCount: 5,
    questionCount: 15,
    assessmentCount: 1,
  };
  if (Object.entries(expectedCounts).some(([key, count]) => value[key] !== count)) {
    return { valid: false, reason: "RESOURCE_COUNTS_MISMATCH" };
  }

  return { valid: true, state: value.state as Cycle13To16PlanState };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("MISSING_REQUIRED_ENVIRONMENT");
  return value;
}

function parseSequence(value: string): Cycle13To16Sequence {
  if (value === "13" || value === "14" || value === "15" || value === "16") {
    return Number(value) as Cycle13To16Sequence;
  }
  throw new Error("INVALID_SEQUENCE");
}

function main(): void {
  let sequenceLabel = "unknown";
  try {
    sequenceLabel = requiredEnvironment("CYCLE1316_SEQUENCE");
    const sequence = parseSequence(sequenceLabel);
    const reportPath = requiredEnvironment("CYCLE1316_PLAN_REPORT_FILE");
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
    const result = validateCycle13To16ReadOnlyPlanReport(report, {
      sequence,
      releaseId: requiredEnvironment("CYCLE1316_EXPECTED_RELEASE_ID"),
      commit: requiredEnvironment("CYCLE1316_EXPECTED_RELEASE_COMMIT"),
    });
    if (!result.valid) {
      console.error(`FAIL: Cycle ${sequence} read-only plan rejected (${result.reason})`);
      process.exitCode = 1;
      return;
    }

    console.log(`CYCLE_${sequence}_GRAPH_STATE=${result.state}`);
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      appendFileSync(summaryPath, `\nCYCLE_${sequence}_GRAPH_STATE=${result.state}\n`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "INVALID_PLAN_REPORT";
    const safeReason =
      reason === "MISSING_REQUIRED_ENVIRONMENT" || reason === "INVALID_SEQUENCE"
        ? reason
        : "INVALID_PLAN_REPORT";
    console.error(`FAIL: Cycle ${sequenceLabel} read-only plan rejected (${safeReason})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
