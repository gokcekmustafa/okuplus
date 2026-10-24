import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateCycle13To16ReadOnlyPlanReport,
  type Cycle13To16PlanExpectation,
} from "../scripts/verify-cycle13-16-plan-report.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-13-16.yml", import.meta.url),
  "utf8",
);

const expected: Cycle13To16PlanExpectation = {
  sequence: 13,
  releaseId: "release-cycle-13-16",
  commit: "a".repeat(40),
};

function validReport(state: "MISSING" | "EXISTING"): Record<string, unknown> {
  return {
    status: "PASS",
    mode: "DRY_RUN",
    immutableReleaseId: expected.releaseId,
    productionReleaseId: expected.releaseId,
    expectedSourceCommit: expected.commit,
    productionReleaseCommit: expected.commit,
    sequence: expected.sequence,
    state,
    dbChanged: false,
    stepCount: 5,
    contentCount: 5,
    exerciseCount: 5,
    questionCount: 15,
    assessmentCount: 1,
  };
}

describe("Cycle 13–16 read-only plan report validation", () => {
  it.each(["MISSING", "EXISTING"] as const)("accepts a valid %s graph state", (state) => {
    expect(validateCycle13To16ReadOnlyPlanReport(validReport(state), expected)).toEqual({
      valid: true,
      state,
    });
  });

  it.each([undefined, null, 17, "CONFLICT", "missing"])(
    "rejects invalid graph state %s",
    (state) => {
      expect(
        validateCycle13To16ReadOnlyPlanReport({ ...validReport("MISSING"), state }, expected),
      ).toEqual({ valid: false, reason: "GRAPH_STATE_INVALID" });
    },
  );

  it("rejects a report that claims a write during PLAN_ONLY", () => {
    expect(
      validateCycle13To16ReadOnlyPlanReport(
        { ...validReport("MISSING"), dbChanged: true },
        expected,
      ),
    ).toEqual({ valid: false, reason: "PLAN_REPORTED_WRITE" });
  });

  it("requires exact dry-run mode, release, commit, sequence and resource counts", () => {
    expect(
      validateCycle13To16ReadOnlyPlanReport({ ...validReport("MISSING"), mode: "APPLY" }, expected),
    ).toEqual({ valid: false, reason: "MODE_NOT_DRY_RUN" });
    expect(
      validateCycle13To16ReadOnlyPlanReport(
        { ...validReport("MISSING"), immutableReleaseId: "other-release" },
        expected,
      ),
    ).toEqual({ valid: false, reason: "RELEASE_ID_MISMATCH" });
    expect(
      validateCycle13To16ReadOnlyPlanReport(
        { ...validReport("MISSING"), expectedSourceCommit: "b".repeat(40) },
        expected,
      ),
    ).toEqual({ valid: false, reason: "RELEASE_COMMIT_MISMATCH" });
    expect(
      validateCycle13To16ReadOnlyPlanReport(
        { ...validReport("MISSING"), sequence: "13" },
        expected,
      ),
    ).toEqual({ valid: false, reason: "SEQUENCE_MISMATCH" });
    expect(
      validateCycle13To16ReadOnlyPlanReport(
        { ...validReport("MISSING"), questionCount: "15" },
        expected,
      ),
    ).toEqual({ valid: false, reason: "RESOURCE_COUNTS_MISMATCH" });
  });

  it("routes plan validation through the typed helper instead of shell-sensitive inline eval", () => {
    expect(workflow).toContain("scripts/verify-cycle13-16-plan-report.ts");
    expect(workflow).not.toContain("![MISSING,EXISTING]");
  });
});
