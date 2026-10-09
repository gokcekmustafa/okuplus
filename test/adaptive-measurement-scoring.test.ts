import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_ROUTE_CONTRACTS,
  type AdaptiveRouteEvidenceDimension,
} from "../src/modules/measurements/adaptive-route-contract.js";
import { scoreAdaptiveMeasurement } from "../src/modules/assessments/adaptive-measurement-scoring.js";

function metadata(
  skillCode: string,
  cognitiveDemand: "RECALL" | "UNDERSTAND" | "INFER",
  adaptiveEvidenceDimensions?: readonly AdaptiveRouteEvidenceDimension[],
) {
  return {
    canonicalManifestId: "OKU-READING-PLACEMENT-V1",
    itemBankManifestId: "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1",
    skillCode,
    cognitiveDemand,
    evidence: { paragraph: 1, span: "Metindeki doğrulanabilir kanıt." },
    sourceMetadata: {
      sourceType: "ORIGINAL_EDITORIAL",
      sourceId: "OKU-PLACEMENT-V1-EDITORIAL",
    },
    ...(adaptiveEvidenceDimensions ? { adaptiveEvidenceDimensions } : {}),
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
          generationMetadata: metadata("RC_INFERENCE", "INFER"),
        },
        {
          questionVersionId: "detail-1",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_DETAIL",
          generationMetadata: metadata("RC_DETAIL", "RECALL"),
        },
        {
          questionVersionId: "main-idea-1",
          questionType: "MULTIPLE_CHOICE",
          skillCode: "RC_MAIN_IDEA",
          generationMetadata: metadata("RC_MAIN_IDEA", "UNDERSTAND"),
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
    expect(result.measurement.signals.B).toBeUndefined();
    expect(result.measurement.signals.D).toBeUndefined();
    expect(result.measurement.signals.C).toEqual({
      needsRoute: false,
      evidence: {
        INFERENCE: { score: 1, scoredCount: 1 },
        EVIDENCE_FINDING: { score: 0.5, scoredCount: 1 },
      },
    });
    expect(result.reasons).toContain("INCOMPLETE_DIMENSION_EVIDENCE");
    expect(result.reasons).toContain("MISSING_ROUTE_DECISION");
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
        generationMetadata: metadata("RC_DETAIL", "UNDERSTAND", [dimension]),
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

    expect(result.status).toBe("READY");
    expect(result.reasons).toEqual([]);
    for (const family of ["B", "C", "D"] as const) {
      expect(result.measurement.signals[family]?.needsRoute).toBe(true);
      for (const dimension of ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions) {
        expect(result.measurement.signals[family]?.evidence[dimension]).toEqual({
          score: 0.75,
          scoredCount: 1,
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
