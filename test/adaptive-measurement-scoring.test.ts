import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_ROUTE_CONTRACTS,
  type AdaptiveRouteEvidenceDimension,
} from "../src/modules/measurements/adaptive-route-contract.js";
import { scoreAdaptiveMeasurement } from "../src/modules/assessments/adaptive-measurement-scoring.js";
import { ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION } from "../src/curriculum/adaptive-placement-item-mapping.js";

function metadata(
  skillCode: string,
  cognitiveDemand: "RECALL" | "UNDERSTAND" | "INFER",
  adaptiveEvidenceDimensions?: readonly AdaptiveRouteEvidenceDimension[],
  stableQuestionId = "PLV1-Q001",
  itemBankManifestVersion = "1.0.1",
) {
  return {
    canonicalManifestId: "OKU-READING-PLACEMENT-V1",
    itemBankManifestId: "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1",
    itemBankManifestVersion,
    stableQuestionId,
    skillCode,
    cognitiveDemand,
    evidence: { paragraph: 1, span: "Metindeki doğrulanabilir kanıt." },
    sourceMetadata: {
      sourceType: "ORIGINAL_EDITORIAL",
      sourceId: "OKU-PLACEMENT-V1-EDITORIAL",
    },
    ...(adaptiveEvidenceDimensions
      ? {
          adaptiveEvidenceDimensions,
          adaptiveMeasurementMappingVersion: "P1_ADAPTIVE_ITEM_MAPPING_V1",
        }
      : {}),
  };
}

describe("server adaptive measurement scorer", () => {
  it("produces only the canonical placement evidence that the current bank can support", () => {
    const result = scoreAdaptiveMeasurement(
      "assessment-1",
      [
        {
          questionVersionId: "inference-1",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_INFERENCE",
          generationMetadata: metadata("RC_INFERENCE", "INFER", undefined, "PLV1-Q003"),
        },
        {
          questionVersionId: "detail-1",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "RECALL", undefined, "PLV1-Q002"),
        },
        {
          questionVersionId: "main-idea-1",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "UNDERSTAND", undefined, "PLV1-Q001"),
        },
      ],
      [
        { questionVersionId: "inference-1", rawScore: 1 },
        { questionVersionId: "detail-1", rawScore: 0.5 },
        { questionVersionId: "main-idea-1", rawScore: 1 },
      ],
    );

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.measurement.assessmentId).toBe("assessment-1");
    expect(result.measurement.itemMappingVersion).toBe(ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION);
    expect(result.measurement.signals.B).toBeUndefined();
    expect(result.measurement.signals.D).toBeUndefined();
    expect(result.measurement.signals.C).toEqual({
      needsRoute: false,
      decisionStatus: "REVIEW_REQUIRED",
      decisionReason: "INCOMPLETE_EVIDENCE",
      evidence: {
        INFERENCE: { score: 1, scoredCount: 1, eligibleCount: 1 },
        EVIDENCE_FINDING: { score: 0.5, scoredCount: 1, eligibleCount: 1 },
      },
    });
    expect(result.reasons).toContain("INCOMPLETE_DIMENSION_EVIDENCE");
    expect(result.reasons).toContain("INDETERMINATE_ROUTE_NEED");
  });

  it("emits evidence-relation only for an independently mapped relation item", () => {
    const result = scoreAdaptiveMeasurement(
      "assessment-relation",
      [
        {
          questionVersionId: "inference",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_INFERENCE",
          generationMetadata: metadata("RC_INFERENCE", "INFER", undefined, "PLV1-Q009"),
        },
        {
          questionVersionId: "detail",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "RECALL", undefined, "PLV1-Q002"),
        },
        {
          questionVersionId: "relation",
          questionType: "MATCHING",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "UNDERSTAND", undefined, "PLV1-Q013"),
        },
      ],
      [
        { questionVersionId: "inference", rawScore: 1 },
        { questionVersionId: "detail", rawScore: 0.5 },
        { questionVersionId: "relation", rawScore: 0.75 },
      ],
    );

    expect(result.measurement.signals.C?.evidence).toEqual({
      INFERENCE: { score: 1, scoredCount: 1, eligibleCount: 1 },
      EVIDENCE_FINDING: { score: 0.5, scoredCount: 1, eligibleCount: 1 },
      EVIDENCE_RELATION: { score: 0.75, scoredCount: 1, eligibleCount: 1 },
    });
  });

  it.each([
    [0, true, "ALL_REQUIRED_DIMENSIONS_ZERO"],
    [1, false, "ALL_REQUIRED_DIMENSIONS_ONE"],
  ] as const)("classifies complete C evidence at the %s endpoint", (score, needsRoute, reason) => {
    const result = scoreAdaptiveMeasurement(
      `assessment-c-${score}`,
      [
        {
          questionVersionId: "inference",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_INFERENCE",
          generationMetadata: metadata("RC_INFERENCE", "INFER", undefined, "PLV1-Q009"),
        },
        {
          questionVersionId: "detail",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "RECALL", undefined, "PLV1-Q002"),
        },
        {
          questionVersionId: "relation",
          questionType: "MATCHING",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "UNDERSTAND", undefined, "PLV1-Q013"),
        },
      ],
      [
        { questionVersionId: "inference", rawScore: score },
        { questionVersionId: "detail", rawScore: score },
        { questionVersionId: "relation", rawScore: score },
      ],
    );

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reasons).toContain("CALIBRATION_REQUIRED");
    expect(result.measurement.calibrationStatus).toBe("NOT_CALIBRATED");
    expect(result.measurement.signals.C).toMatchObject({
      needsRoute,
      decisionStatus: "DECIDED",
      decisionReason: reason,
    });
  });

  it("keeps mixed or intermediate C evidence in review", () => {
    const result = scoreAdaptiveMeasurement(
      "assessment-c-review",
      [
        {
          questionVersionId: "inference",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_INFERENCE",
          generationMetadata: metadata("RC_INFERENCE", "INFER", undefined, "PLV1-Q009"),
        },
        {
          questionVersionId: "detail",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "RECALL", undefined, "PLV1-Q002"),
        },
        {
          questionVersionId: "relation",
          questionType: "MATCHING",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "UNDERSTAND", undefined, "PLV1-Q013"),
        },
      ],
      [
        { questionVersionId: "inference", rawScore: 0 },
        { questionVersionId: "detail", rawScore: 1 },
        { questionVersionId: "relation", rawScore: 0.5 },
      ],
    );

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.measurement.signals.C).toMatchObject({
      needsRoute: false,
      decisionStatus: "REVIEW_REQUIRED",
      decisionReason: "INTERMEDIATE_DIMENSION_EVIDENCE",
    });
    expect(result.reasons).toContain("INDETERMINATE_ROUTE_NEED");
  });

  it("does not classify C when a mapped item is unanswered", () => {
    const result = scoreAdaptiveMeasurement(
      "assessment-c-unanswered",
      [
        {
          questionVersionId: "inference",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_INFERENCE",
          generationMetadata: metadata("RC_INFERENCE", "INFER", undefined, "PLV1-Q009"),
        },
        {
          questionVersionId: "detail",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "RECALL", undefined, "PLV1-Q002"),
        },
        {
          questionVersionId: "relation",
          questionType: "MATCHING",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "UNDERSTAND", undefined, "PLV1-Q013"),
        },
      ],
      [
        { questionVersionId: "inference", rawScore: 0 },
        { questionVersionId: "detail", rawScore: 0 },
      ],
    );

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.measurement.signals.C).toMatchObject({
      decisionStatus: "REVIEW_REQUIRED",
      decisionReason: "INCOMPLETE_EVIDENCE",
      evidence: {
        EVIDENCE_RELATION: { score: null, scoredCount: 0, eligibleCount: 1 },
      },
    });
  });

  it("can emit a complete route envelope only from explicit server-owned dimension mappings", () => {
    const questions = (
      Object.entries(ADAPTIVE_ROUTE_CONTRACTS) as Array<
        ["B" | "C" | "D", { requiredDimensions: readonly AdaptiveRouteEvidenceDimension[] }]
      >
    ).flatMap(([, contract]) =>
      contract.requiredDimensions.map((dimension) => ({
        questionVersionId: dimension,
        questionType: "MULTIPLE_CHOICE" as const,
        skillCode: "RC_DETAIL",
        generationMetadata: metadata("RC_DETAIL", "UNDERSTAND", [dimension], "FUTURE-Q", "2.0.0"),
      })),
    );

    const result = scoreAdaptiveMeasurement(
      "assessment-2",
      questions,
      questions.map((question) => ({
        questionVersionId: question.questionVersionId,
        rawScore: 0.75,
      })),
      { B: true, C: true, D: true },
    );

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reasons).toContain("CALIBRATION_REQUIRED");
    for (const family of ["B", "C", "D"] as const) {
      expect(result.measurement.signals[family]?.needsRoute).toBe(true);
      for (const dimension of ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions) {
        expect(result.measurement.signals[family]?.evidence[dimension]).toEqual({
          score: 0.75,
          scoredCount: 1,
          eligibleCount: 1,
        });
      }
    }
  });

  it("fails closed for untrusted mappings and duplicate question attempts", () => {
    const result = scoreAdaptiveMeasurement(
      "assessment-3",
      [
        {
          questionVersionId: "q-1",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: { adaptiveEvidenceDimensions: ["EVIDENCE_FINDING"] },
        },
      ],
      [
        { questionVersionId: "q-1", rawScore: 1 },
        { questionVersionId: "q-1", rawScore: 0 },
        { questionVersionId: "unknown", rawScore: 1 },
      ],
    );

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.measurement.signals).toEqual({});
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "NO_TRUSTED_DIMENSION_MAPPING",
        "DUPLICATE_ATTEMPT",
        "UNKNOWN_ATTEMPT_QUESTION",
      ]),
    );
  });
});
