import { describe, expect, it } from "vitest";
import { classifyCAdaptiveRouteNeed } from "../src/modules/assessments/adaptive-route-need-classifier.js";

function evidence(
  scores: Partial<Record<"INFERENCE" | "EVIDENCE_FINDING" | "EVIDENCE_RELATION", number>>,
) {
  return Object.fromEntries(
    ["INFERENCE", "EVIDENCE_FINDING", "EVIDENCE_RELATION"].map((dimension) => [
      dimension,
      scores[dimension as keyof typeof scores] === undefined
        ? undefined
        : { score: scores[dimension as keyof typeof scores], scoredCount: 4 },
    ]),
  );
}

describe("P1 C route-need classifier", () => {
  it("requires every independent C dimension before deciding", () => {
    expect(classifyCAdaptiveRouteNeed(evidence({ INFERENCE: 0, EVIDENCE_FINDING: 0 }))).toEqual({
      status: "REVIEW_REQUIRED",
      needsRoute: false,
      reason: "INCOMPLETE_EVIDENCE",
    });
  });

  it("decides a C need only when all dimensions are exactly zero", () => {
    expect(
      classifyCAdaptiveRouteNeed(
        evidence({ INFERENCE: 0, EVIDENCE_FINDING: 0, EVIDENCE_RELATION: 0 }),
      ),
    ).toEqual({
      status: "DECIDED",
      needsRoute: true,
      reason: "ALL_REQUIRED_DIMENSIONS_ZERO",
    });
  });

  it("does not convert mixed endpoint evidence into a route", () => {
    expect(
      classifyCAdaptiveRouteNeed(
        evidence({ INFERENCE: 0, EVIDENCE_FINDING: 1, EVIDENCE_RELATION: 1 }),
      ),
    ).toEqual({
      status: "REVIEW_REQUIRED",
      needsRoute: false,
      reason: "MIXED_DIMENSION_EVIDENCE",
    });
  });
});
