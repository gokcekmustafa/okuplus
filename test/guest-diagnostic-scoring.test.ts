import { describe, expect, it } from "vitest";

import {
  evaluateGuestDiagnostic,
  parseGuestRecommendationPolicy,
} from "../src/modules/guest-diagnostic/scoring.js";

const policy = parseGuestRecommendationPolicy(
  {
    bands: [
      { levelCode: "R1_FOUNDATION", minInclusive: 0, maxExclusive: 0.35 },
      { levelCode: "R2_DEVELOPING", minInclusive: 0.35, maxExclusive: 0.55 },
      { levelCode: "R3_INDEPENDENT", minInclusive: 0.55, maxExclusive: 0.75 },
      { levelCode: "R4_ADVANCED", minInclusive: 0.75, maxInclusive: 1 },
    ],
  },
  { minimumSkillAnsweredCount: 1, distinctSkillDelta: 0.5 },
);

function answers(correct: boolean[]) {
  const skills = ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] as const;
  return correct.map((isCorrect, index) => ({
    skillCode: skills[index % skills.length],
    isCorrect,
    rawScore: isCorrect ? 1 : 0,
  }));
}

describe("Guest Diagnostic V1 scoring contract", () => {
  it("uses server-provided correctness and simple correct/scored ratio", () => {
    const result = evaluateGuestDiagnostic(answers([true, true, false, true, false]), 5, policy);

    expect(result.score).toBe(0.6);
    expect(result.scoredQuestionCount).toBe(5);
    expect(result.recommendedLevelCode).toBe("R3_INDEPENDENT");
    expect(result.skillSubscores.RC_MAIN_IDEA).toEqual({
      correctCount: 2,
      answeredCount: 2,
      score: 1,
    });
  });

  it("keeps a missing skill null instead of treating it as zero", () => {
    const result = evaluateGuestDiagnostic(
      [
        { skillCode: "RC_MAIN_IDEA", isCorrect: true, rawScore: 1 },
        { skillCode: "RC_DETAIL", isCorrect: true, rawScore: 1 },
        { skillCode: "RC_MAIN_IDEA", isCorrect: false, rawScore: 0 },
        { skillCode: "RC_DETAIL", isCorrect: false, rawScore: 0 },
        { skillCode: "RC_MAIN_IDEA", isCorrect: true, rawScore: 1 },
      ],
      5,
      policy,
    );

    expect(result.skillSubscores.RC_INFERENCE.score).toBeNull();
    expect(result.resultState).toBe("PARTIAL_LOW_SIGNAL");
    expect(result.confidenceState).toBe("LOW_SIGNAL");
  });

  it("does not recommend below the minimum scorable count", () => {
    const result = evaluateGuestDiagnostic(answers([true, true, true, true]), 5, policy);

    expect(result.resultState).toBe("INSUFFICIENT_DATA");
    expect(result.recommendedLevelCode).toBeNull();
  });

  it("does not accept malformed or placeholder recommendation policy", () => {
    expect(parseGuestRecommendationPolicy({}, {})).toBeNull();
    expect(
      parseGuestRecommendationPolicy(
        { bands: [{ levelCode: "NOT_A_LEVEL", minInclusive: 0, maxInclusive: 1 }] },
        { minimumSkillAnsweredCount: 1, distinctSkillDelta: 0.5 },
      ),
    ).toBeNull();
    expect(
      parseGuestRecommendationPolicy(
        { bands: [{ levelCode: "R1_FOUNDATION", minInclusive: -0.1, maxInclusive: 1 }] },
        { minimumSkillAnsweredCount: 1, distinctSkillDelta: 0.5 },
      ),
    ).toBeNull();
  });

  it("uses total correct answers instead of partial raw score", () => {
    const result = evaluateGuestDiagnostic(
      [
        { skillCode: "RC_MAIN_IDEA", isCorrect: false, rawScore: 0.5 },
        { skillCode: "RC_DETAIL", isCorrect: true, rawScore: 1 },
        { skillCode: "RC_INFERENCE", isCorrect: false, rawScore: 0 },
        { skillCode: "RC_MAIN_IDEA", isCorrect: true, rawScore: 1 },
        { skillCode: "RC_DETAIL", isCorrect: false, rawScore: 0.5 },
      ],
      5,
      policy,
    );

    expect(result.score).toBe(0.4);
  });

  it("marks an exact configured boundary as boundary-sensitive", () => {
    const boundaryPolicy = parseGuestRecommendationPolicy(
      {
        bands: [
          { levelCode: "R1_FOUNDATION", minInclusive: 0, maxExclusive: 0.35 },
          { levelCode: "R2_DEVELOPING", minInclusive: 0.35, maxExclusive: 0.6 },
          { levelCode: "R3_INDEPENDENT", minInclusive: 0.6, maxExclusive: 0.75 },
          { levelCode: "R4_ADVANCED", minInclusive: 0.75, maxInclusive: 1 },
        ],
      },
      { minimumSkillAnsweredCount: 1, distinctSkillDelta: 0.5 },
    );
    const result = evaluateGuestDiagnostic(
      answers([true, true, true, false, false]),
      5,
      boundaryPolicy,
    );

    expect(result.score).toBe(0.6);
    expect(result.recommendedLevelCode).toBe("R3_INDEPENDENT");
    expect(result.confidenceState).toBe("BOUNDARY_SENSITIVE");
  });
});
