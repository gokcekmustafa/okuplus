import { describe, expect, it } from "vitest";
import { latestComparableAssessmentResult } from "../src/modules/analytics/assessment-comparison.js";

const baseline = {
  id: "baseline-result",
  assessmentId: "placement-form-a",
  score: 0.6,
  completedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("analytics assessment comparison", () => {
  it("selects the latest later result from the same assessment", () => {
    const earlier = {
      id: "earlier-result",
      assessmentId: baseline.assessmentId,
      score: 0.7,
      completedAt: new Date("2025-12-30T00:00:00.000Z"),
    };
    const later = {
      id: "later-result",
      assessmentId: baseline.assessmentId,
      score: 0.8,
      completedAt: new Date("2026-02-01T00:00:00.000Z"),
    };

    expect(latestComparableAssessmentResult(baseline, [earlier, later])).toBe(later);
  });

  it("does not compare a result from a different assessment", () => {
    expect(
      latestComparableAssessmentResult(baseline, [
        {
          id: "other-form-result",
          assessmentId: "development-form-b",
          score: 0.9,
          completedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]),
    ).toBeNull();
  });

  it("does not treat the baseline itself, an equal-time result, or missing scores as follow-up", () => {
    expect(latestComparableAssessmentResult(baseline, [baseline])).toBeNull();
    expect(
      latestComparableAssessmentResult(baseline, [
        {
          ...baseline,
          id: "same-time-result",
        },
      ]),
    ).toBeNull();
    expect(
      latestComparableAssessmentResult(baseline, [
        {
          id: "unscored-result",
          assessmentId: baseline.assessmentId,
          score: null,
          completedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]),
    ).toBeNull();
  });

  it("does not compare when the baseline score is unavailable", () => {
    expect(
      latestComparableAssessmentResult({ ...baseline, score: null }, [
        {
          id: "later-result",
          assessmentId: baseline.assessmentId,
          score: 0.8,
          completedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ]),
    ).toBeNull();
  });
});
