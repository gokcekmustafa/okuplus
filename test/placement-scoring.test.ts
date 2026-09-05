import { describe, expect, it } from "vitest";
import {
  aggregatePlacementScore,
  PLACEMENT_SCORING_CONTRACT_V1,
  resolvePlacementBand,
  resolvePlacementResult,
  scorePlacementSession,
  type PlacementScoringContract,
} from "../src/modules/assessments/placement-scoring.js";
import { PROFICIENCY_SKILL_CODES } from "../src/curriculum/proficiency-levels.js";

function fullScoredSet(rawScore = 1) {
  return PROFICIENCY_SKILL_CODES.flatMap((skillCode) =>
    Array.from({ length: 8 }, () => ({
      skillCode,
      questionType: "MULTIPLE_CHOICE" as const,
      rawScore,
    })),
  );
}

describe("placement scoring contract v1", () => {
  it("aggregates three skill subscores and excludes OPEN_ENDED", () => {
    const aggregate = aggregatePlacementScore([
      ...fullScoredSet(),
      { skillCode: "RC_MAIN_IDEA", questionType: "OPEN_ENDED", rawScore: null },
    ]);

    expect(aggregate.scoredCount).toBe(24);
    expect(aggregate.score).toBe(1);
    expect(aggregate.eligibleQuestionCount).toBe(24);
    expect(aggregate.pendingEvaluationCount).toBe(1);
    for (const skillCode of PROFICIENCY_SKILL_CODES) {
      expect(aggregate.skillSubscores[skillCode]).toEqual({
        scoredCount: 8,
        totalRawScore: 8,
        score: 1,
      });
    }
  });

  it("uses deterministic inclusive/exclusive band boundaries", () => {
    expect(resolvePlacementBand(0)?.levelCode).toBe("R1_FOUNDATION");
    expect(resolvePlacementBand(0.35)?.levelCode).toBe("R2_DEVELOPING");
    expect(resolvePlacementBand(0.55)?.levelCode).toBe("R3_INDEPENDENT");
    expect(resolvePlacementBand(0.75)?.levelCode).toBe("R4_ADVANCED");
    expect(resolvePlacementBand(1)?.levelCode).toBe("R4_ADVANCED");
  });

  it("keeps resultLevelId empty until calibration is approved", () => {
    const result = resolvePlacementResult(aggregatePlacementScore(fullScoredSet()), [
      { id: "r4-id", code: "R4_ADVANCED" },
    ]);

    expect(result).toMatchObject({
      recommendedLevelCode: "R4_ADVANCED",
      resultLevelId: null,
      reviewRequired: true,
      reason: "CALIBRATION_REQUIRED",
    });
  });

  it("resolves an AssessmentResult level only with an explicitly calibrated contract", () => {
    const calibratedContract: PlacementScoringContract = {
      ...PLACEMENT_SCORING_CONTRACT_V1,
      calibrationStatus: "CALIBRATED",
      productionAssignmentEnabled: true,
    };
    const result = resolvePlacementResult(
      aggregatePlacementScore(fullScoredSet(), calibratedContract),
      [{ id: "r4-id", code: "R4_ADVANCED" }],
      calibratedContract,
    );

    expect(result).toEqual({
      score: 1,
      recommendedLevelCode: "R4_ADVANCED",
      resultLevelId: "r4-id",
      reviewRequired: false,
      reason: "RESOLVED",
    });
  });

  it("requires the minimum scored count", () => {
    const result = resolvePlacementResult(aggregatePlacementScore(fullScoredSet().slice(0, 23)), [
      { id: "r1-id", code: "R1_FOUNDATION" },
    ]);
    expect(result.reason).toBe("INSUFFICIENT_SCORED_COUNT");
    expect(result.resultLevelId).toBeNull();
  });

  it("requires scored coverage for every placement skill", () => {
    const result = resolvePlacementResult(
      aggregatePlacementScore(
        Array.from({ length: 24 }, () => ({
          skillCode: "RC_MAIN_IDEA" as const,
          questionType: "MULTIPLE_CHOICE" as const,
          rawScore: 1,
        })),
      ),
      [{ id: "r4-id", code: "R4_ADVANCED" }],
    );

    expect(result.reason).toBe("INCOMPLETE_SKILL_COVERAGE");
    expect(result.resultLevelId).toBeNull();
  });

  it("integrates session questions, attempts, OPEN_ENDED and calibration gate", () => {
    const questions = PROFICIENCY_SKILL_CODES.flatMap((skillCode) =>
      Array.from({ length: 8 }, (_, index) => ({
        questionVersionId: `${skillCode}-${index}`,
        questionType: "MULTIPLE_CHOICE" as const,
        skillCode,
      })),
    );
    const attempts = questions.map((question) => ({
      questionVersionId: question.questionVersionId,
      rawScore: 1,
    }));
    questions.push({
      questionVersionId: "open-ended",
      questionType: "OPEN_ENDED",
      skillCode: "RC_MAIN_IDEA",
    });

    const result = scorePlacementSession(questions, attempts, [
      { id: "r4-id", code: "R4_ADVANCED" },
    ]);

    expect(result.aggregate.scoredCount).toBe(24);
    expect(result.aggregate.pendingEvaluationCount).toBe(1);
    expect(result.resolution.resultLevelId).toBeNull();
    expect(result.resolution.reason).toBe("CALIBRATION_REQUIRED");
  });

  it("keeps invalid non-open-ended Skill mappings review-only", () => {
    const questions = [
      ...PROFICIENCY_SKILL_CODES.flatMap((skillCode) =>
        Array.from({ length: 8 }, (_, index) => ({
          questionVersionId: `${skillCode}-${index}`,
          questionType: "MULTIPLE_CHOICE" as const,
          skillCode,
        })),
      ),
      {
        questionVersionId: "invalid-skill",
        questionType: "MULTIPLE_CHOICE" as const,
        skillCode: null,
      },
    ];
    const result = scorePlacementSession(
      questions,
      questions.map((question) => ({ questionVersionId: question.questionVersionId, rawScore: 1 })),
      [{ id: "r4-id", code: "R4_ADVANCED" }],
    );

    expect(result.invalidSkillQuestionCount).toBe(1);
    expect(result.resolution.resultLevelId).toBeNull();
    expect(result.resolution.reason).toBe("INCOMPLETE_SKILL_COVERAGE");
  });
});
