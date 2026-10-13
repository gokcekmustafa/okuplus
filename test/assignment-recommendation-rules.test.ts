import { describe, expect, it } from "vitest";
import { buildRecommendationDecisions } from "../src/modules/assignments/recommendation-rules.js";
import { selectAssignmentTemplateVersion } from "../src/modules/assignments/service.js";
import { listStudentAssignmentsQuerySchema } from "../src/modules/assignments/schemas.js";

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

  it("pins an assignment to the learning step's published template version", () => {
    expect(
      selectAssignmentTemplateVersion({
        templateId: "template-1",
        latestPublishedVersionId: "template-version-2",
        boundVersion: { id: "template-version-1", templateId: "template-1", status: "PUBLISHED" },
      }),
    ).toBe("template-version-1");
  });

  it("rejects an unpublished or mismatched learning-step template version", () => {
    expect(() =>
      selectAssignmentTemplateVersion({
        templateId: "template-1",
        latestPublishedVersionId: "template-version-2",
        boundVersion: { id: "template-version-1", templateId: "template-1", status: "DRAFT" },
      }),
    ).toThrow("yayınlanmış olmalı");

    expect(() =>
      selectAssignmentTemplateVersion({
        templateId: "template-1",
        latestPublishedVersionId: "template-version-2",
        boundVersion: { id: "template-version-1", templateId: "template-2", status: "PUBLISHED" },
      }),
    ).toThrow("eşleşmiyor");
  });

  it("uses the latest published version only when the step has no template binding", () => {
    expect(
      selectAssignmentTemplateVersion({
        templateId: "template-1",
        latestPublishedVersionId: "template-version-2",
      }),
    ).toBe("template-version-2");
  });

  it("rejects invalid student assignment status filters at the API contract boundary", () => {
    expect(() => listStudentAssignmentsQuerySchema.parse({ status: "IN_PROGRESS" })).toThrow();
    expect(listStudentAssignmentsQuerySchema.parse({ status: "ACTIVE" }).status).toBe("ACTIVE");
  });
});
