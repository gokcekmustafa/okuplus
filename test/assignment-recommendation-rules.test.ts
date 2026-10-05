import { describe, expect, it } from "vitest";
import { buildRecommendationDecisions } from "../src/modules/assignments/recommendation-rules.js";

describe("assignment recommendation rules", () => {
  it("creates a deterministic measurement-based recommendation with pinned version", () => {
    const decisions = buildRecommendationDecisions(
      [
        {
          skillId: "skill-1",
          skillCode: "INFERENCE",
          skillName: "Çıkarım yapma",
          measurementScore: 0.5,
          recentAssignmentScores: [],
          learningStepId: "step-1",
          learningStepTitle: "Kanıtı bul",
        },
      ],
      [
        {
          templateId: "template-1",
          templateVersionId: "template-version-7",
          templateTitle: "Kanıtı bulma çalışması",
          templateType: "MULTIPLE_CHOICE",
          skillId: "skill-1",
          learningStepId: "step-1",
        },
      ],
    );

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      reasonCode: "MEASUREMENT_NEED",
      templateId: "template-1",
      templateVersionId: "template-version-7",
      learningStepId: "step-1",
    });
    expect(decisions[0]?.reason).toContain("50%");
  });

  it("requires three consecutive weak assignment results", () => {
    const signal = {
      skillId: "skill-1",
      skillCode: "READING",
      skillName: "Okuma",
      measurementScore: null,
      recentAssignmentScores: [0.4, 0.59, 0.3],
      learningStepId: null,
      learningStepTitle: null,
    };
    const candidate = {
      templateId: "template-1",
      templateVersionId: "template-version-1",
      templateTitle: "Okuma çalışması",
      templateType: "MULTIPLE_CHOICE",
      skillId: "skill-1",
      learningStepId: null,
    };

    expect(buildRecommendationDecisions([signal], [candidate])).toHaveLength(1);
    expect(
      buildRecommendationDecisions(
        [{ ...signal, recentAssignmentScores: [0.4, 0.59, 0.7] }],
        [candidate],
      ),
    ).toHaveLength(0);
  });
});
