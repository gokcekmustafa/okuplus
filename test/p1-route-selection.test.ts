import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
  type AdaptiveRouteFamily,
} from "../src/modules/measurements/adaptive-route-contract.js";
import { ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION } from "../src/curriculum/adaptive-placement-item-mapping.js";
import { scoreAdaptiveMeasurement } from "../src/modules/assessments/adaptive-measurement-scoring.js";
import { P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_VERSION } from "../src/modules/assessments/adaptive-route-need-classifier.js";
import {
  P1_ROUTE_SELECTION_POLICY_VERSION,
  selectP1Route,
  type RouteSelectionCandidate,
  type RouteSelectionMeasurement,
} from "../src/modules/student-learning/route-selection.js";

const candidates: RouteSelectionCandidate[] = (["A", "B", "C", "D"] as const).map((family) => ({
  id: `p1-${family.toLowerCase()}`,
  code: `EDUCATION_V2_P1_${family}_READING`,
  version: 1,
  levelId: "level-1",
  status: "PUBLISHED",
  curriculumReady: true,
}));

function measurement(metrics: unknown = {}): RouteSelectionMeasurement {
  return {
    id: "measurement-1",
    isFinalP0Measurement: true,
    metrics,
    skillResults: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"].map((skillCode) => ({
      skillCode,
      label: skillCode,
      score: 0.75,
      scoredCount: 4,
    })),
  };
}

function officialNeed(family: AdaptiveRouteFamily, complete = true) {
  const dimensions: Record<AdaptiveRouteFamily, string[]> = {
    B: ["FLUENCY", "ACCURACY", "MEANING_PRESERVATION", "TRANSFER"],
    C: ["INFERENCE", "EVIDENCE_FINDING", "EVIDENCE_RELATION"],
    D: ["CONTEXTUAL_MEANING", "LEXICAL_RELATION", "DOMAIN_CONTEXT"],
  };
  const evidence = Object.fromEntries(
    dimensions[family].map((dimension, index) => [
      dimension,
      { score: 0.6 + index / 20, scoredCount: complete || index === 0 ? 4 : 0 },
    ]),
  );
  return {
    adaptiveRouteMeasurement: {
      contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
      source: "OFFICIAL_PLACEMENT",
      assessmentId: "assessment-1",
      itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
      routeNeedClassifierVersion: P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_VERSION,
      signals: {
        [family]: {
          needsRoute: true,
          decisionStatus: "DECIDED",
          decisionReason: "EXPLICIT_SERVER_DECISION",
          evidence,
        },
      },
    },
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

  it.each([
    ["B", "FLUENCY_ACCURACY_NEED"],
    ["C", "INFERENCE_EVIDENCE_NEED"],
    ["D", "VOCABULARY_CONTEXT_NEED"],
  ] as const)("selects P1-%s only with the complete official contract", (family, reasonCode) => {
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement(officialNeed(family)),
      candidates,
    });
    expect(result).toMatchObject({
      status: "READY",
      recommendedPathId: `p1-${family.toLowerCase()}`,
      routeFamily: family,
      reasonCodes: [reasonCode],
    });
  });

  it("uses the server classifier decision for C and never falls back on an unresolved signal", () => {
    const decided = selectP1Route({
      levelId: "level-1",
      measurement: measurement({
        adaptiveRouteMeasurement: {
          contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
          source: "OFFICIAL_PLACEMENT",
          assessmentId: "assessment-c",
          itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
          routeNeedClassifierVersion: "P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_V1",
          signals: {
            C: {
              needsRoute: true,
              decisionStatus: "DECIDED",
              decisionReason: "ALL_REQUIRED_DIMENSIONS_ZERO",
              evidence: {
                INFERENCE: { score: 0, scoredCount: 4 },
                EVIDENCE_FINDING: { score: 0, scoredCount: 4 },
                EVIDENCE_RELATION: { score: 0, scoredCount: 4 },
              },
            },
          },
        },
      }),
      candidates,
    });
    expect(decided.status).toBe("READY");
    expect(decided.routeFamily).toBe("C");
    expect(decided.recommendedPathId).toBe("p1-c");

    const unresolved = selectP1Route({
      levelId: "level-1",
      measurement: measurement({
        adaptiveRouteMeasurement: {
          contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
          source: "OFFICIAL_PLACEMENT",
          assessmentId: "assessment-c-review",
          itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
          routeNeedClassifierVersion: "P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_V1",
          signals: {
            C: {
              needsRoute: false,
              decisionStatus: "REVIEW_REQUIRED",
              decisionReason: "MIXED_DIMENSION_EVIDENCE",
              evidence: {
                INFERENCE: { score: 0, scoredCount: 4 },
                EVIDENCE_FINDING: { score: 1, scoredCount: 4 },
                EVIDENCE_RELATION: { score: 0, scoredCount: 4 },
              },
            },
          },
        },
      }),
      candidates,
    });
    expect(unresolved.status).toBe("REVIEW_REQUIRED");
    expect(unresolved.recommendedPathId).toBeNull();
    expect(unresolved.reasonCodes).toContain("MEASUREMENT_CONFLICT");
  });

  it("passes the real server scorer output into P1-C selection", () => {
    const metadata = (skillCode: string, stableQuestionId: string) => ({
      canonicalManifestId: "OKU-READING-PLACEMENT-V1",
      itemBankManifestId: "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1",
      itemBankManifestVersion: "1.0.1",
      stableQuestionId,
      skillCode,
      evidence: { paragraph: 1, span: "Metindeki doğrulanabilir kanıt." },
      sourceMetadata: {
        sourceType: "ORIGINAL_EDITORIAL",
        sourceId: "OKU-PLACEMENT-V1-EDITORIAL",
      },
    });
    const scored = scoreAdaptiveMeasurement(
      "assessment-c-production-contract",
      [
        {
          questionVersionId: "inference",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_INFERENCE",
          generationMetadata: metadata("RC_INFERENCE", "PLV1-Q009"),
        },
        {
          questionVersionId: "evidence",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "PLV1-Q002"),
        },
        {
          questionVersionId: "relation",
          questionType: "MATCHING",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "PLV1-Q013"),
        },
      ],
      [
        { questionVersionId: "inference", rawScore: 0 },
        { questionVersionId: "evidence", rawScore: 0 },
        { questionVersionId: "relation", rawScore: 0 },
      ],
    );
    expect(scored.status).toBe("READY");
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement({ adaptiveRouteMeasurement: scored.measurement }),
      candidates,
    });
    expect(result).toMatchObject({ status: "READY", routeFamily: "C", recommendedPathId: "p1-c" });
  });

  it("fails closed for incomplete official evidence", () => {
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement(officialNeed("C", false)),
      candidates,
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.routeFamily).toBe("C");
    expect(result.recommendedPathId).toBeNull();
    expect(result.reasonCodes).toContain("INFERENCE_EVIDENCE_NEED");
  });

  it("ignores legacy client-shaped profile fields", () => {
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement({ routeSelectionProfile: "INFERENCE_EVIDENCE_NEED" }),
      candidates,
    });
    expect(result.status).toBe("READY");
    expect(result.routeFamily).toBe("A");
  });

  it("requires a final measurement and all three reading-comprehension signals", () => {
    const notFinal = selectP1Route({
      levelId: "level-1",
      measurement: { ...measurement(), isFinalP0Measurement: false },
      candidates,
    });
    const incomplete = selectP1Route({
      levelId: "level-1",
      measurement: { ...measurement(), skillResults: measurement().skillResults.slice(0, 2) },
      candidates,
    });
    expect(notFinal.reasonCodes).toContain("MEASUREMENT_INSUFFICIENT");
    expect(incomplete.reasonCodes).toContain("MEASUREMENT_INSUFFICIENT");
    expect(notFinal.status).toBe("REVIEW_REQUIRED");
    expect(incomplete.status).toBe("REVIEW_REQUIRED");
  });

  it("does not choose a route when official signals conflict or content is absent", () => {
    const conflict = selectP1Route({
      levelId: "level-1",
      measurement: measurement({
        adaptiveRouteMeasurement: {
          contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
          source: "OFFICIAL_PLACEMENT",
          assessmentId: "assessment-1",
          itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
          signals: {
            B: officialNeed("B").adaptiveRouteMeasurement.signals.B,
            D: officialNeed("D").adaptiveRouteMeasurement.signals.D,
          },
        },
      }),
      candidates,
    });
    const noCandidate = selectP1Route({
      levelId: "level-1",
      measurement: measurement(officialNeed("C")),
      candidates: [],
    });
    expect(conflict.reasonCodes).toContain("MEASUREMENT_CONFLICT");
    expect(noCandidate.reasonCodes).toContain("INFERENCE_EVIDENCE_NEED");
    expect(conflict.status).toBe("REVIEW_REQUIRED");
    expect(noCandidate.status).toBe("REVIEW_REQUIRED");
  });

  it("does not use an unready or wrong-level P1 candidate", () => {
    const result = selectP1Route({
      levelId: "level-1",
      measurement: measurement(),
      candidates: [
        { ...candidates[0]!, id: "unready", curriculumReady: false },
        { ...candidates[0]!, id: "wrong-level", levelId: "level-2" },
      ],
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.recommendedPathId).toBeNull();
  });
});
