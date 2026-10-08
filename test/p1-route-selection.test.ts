import { describe, expect, it } from "vitest";
import {
  P1_ROUTE_SELECTION_POLICY_VERSION,
  selectP1Route,
  type RouteSelectionCandidate,
  type RouteSelectionMeasurement,
} from "../src/modules/student-learning/route-selection.js";

const candidates: RouteSelectionCandidate[] = [
  {
    id: "p1-a",
    code: "EDUCATION_V2_P1_A_READING",
    version: 1,
    levelId: "level-1",
    status: "PUBLISHED",
  },
  {
    id: "p1-c",
    code: "EDUCATION_V2_P1_C_READING",
    version: 1,
    levelId: "level-1",
    status: "PUBLISHED",
  },
];

function measurement(profile?: string): RouteSelectionMeasurement {
  return {
    id: "measurement-1",
    isFinalP0Measurement: true,
    metrics: profile ? { routeSelectionProfile: profile } : {},
    skillResults: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"].map((skillCode) => ({
      skillCode,
      label: skillCode,
      score: 0.75,
      scoredCount: 4,
    })),
  };
}

describe("P0 to P1 route selection", () => {
  it("balanced final measurement selects the published P1-A candidate", () => {
    const result = selectP1Route({ levelId: "level-1", measurement: measurement(), candidates });

    expect(result).toMatchObject({
      status: "READY",
      recommendedPathId: "p1-a",
      routeFamily: "A",
      reasonCodes: ["BALANCED_PROFILE"],
      policyVersion: P1_ROUTE_SELECTION_POLICY_VERSION,
    });
  });

  it("selects P1-C only with explicit inference evidence", () => {
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement("INFERENCE_EVIDENCE_NEED"),
      candidates,
    });

    expect(result.status).toBe("READY");
    expect(result.routeFamily).toBe("C");
    expect(result.recommendedPathId).toBe("p1-c");
  });

  it("fails closed for unsupported B/D route contracts", () => {
    for (const profile of ["FLUENCY_ACCURACY_NEED", "VOCABULARY_CONTEXT_NEED"]) {
      const result = selectP1Route({
        levelId: "level-1",
        measurement: measurement(profile),
        candidates,
      });
      expect(result.status).toBe("REVIEW_REQUIRED");
      expect(result.recommendedPathId).toBeNull();
    }
  });

  it("requires a final measurement and all three reading-comprehension signals", () => {
    const notFinal = selectP1Route({
      levelId: "level-1",
      measurement: { ...measurement(), isFinalP0Measurement: false },
      candidates,
    });
    const incomplete = selectP1Route({
      levelId: "level-1",
      measurement: {
        ...measurement(),
        skillResults: measurement().skillResults.slice(0, 2),
      },
      candidates,
    });

    expect(notFinal.reasonCodes).toContain("MEASUREMENT_INSUFFICIENT");
    expect(incomplete.reasonCodes).toContain("MEASUREMENT_INSUFFICIENT");
    expect(notFinal.status).toBe("REVIEW_REQUIRED");
    expect(incomplete.status).toBe("REVIEW_REQUIRED");
  });

  it("does not choose a route when measurement signals conflict or content is absent", () => {
    const conflict = selectP1Route({
      levelId: "level-1",
      measurement: {
        ...measurement(),
        metrics: {
          routeSelectionSignals: {
            inferenceEvidenceNeed: true,
            vocabularyContextNeed: true,
          },
        },
      },
      candidates,
    });
    const noCandidate = selectP1Route({
      levelId: "level-1",
      measurement: measurement("INFERENCE_EVIDENCE_NEED"),
      candidates: [],
    });

    expect(conflict.reasonCodes).toContain("MEASUREMENT_CONFLICT");
    expect(noCandidate.reasonCodes).toContain("INFERENCE_EVIDENCE_NEED");
    expect(conflict.status).toBe("REVIEW_REQUIRED");
    expect(noCandidate.status).toBe("REVIEW_REQUIRED");
  });

  it("does not use a draft or wrong-level P1 candidate", () => {
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement(),
      candidates: [
        { ...candidates[0]!, id: "draft", status: "DRAFT" },
        { ...candidates[0]!, id: "wrong-level", levelId: "level-2" },
      ],
    });

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.recommendedPathId).toBeNull();
  });
});
