import { describe, expect, it } from "vitest";
import {
  CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
  canonicalPlacementAssessmentConfig,
  planCanonicalPlacementAssessment,
  validateCanonicalPlacementAssessmentManifest,
} from "../src/curriculum/canonical-placement-assessment.js";
import {
  buildCanonicalPlacementAssessmentGraph,
  planCanonicalPlacementPromotion,
  type CanonicalPlacementSnapshot,
} from "../src/curriculum/canonical-placement-assessment-bootstrap.js";

function exactExisting() {
  const manifest = CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST;
  return {
    id: "placement-1",
    tenantId: null,
    title: manifest.assessment.title,
    type: "PLACEMENT",
    status: "PUBLISHED",
    deletedAt: null,
    config: canonicalPlacementAssessmentConfig(manifest),
  } as const;
}

describe("canonical placement assessment manifest and plan", () => {
  it("defines a global, published-target, 36-question three-skill design", () => {
    expect(
      validateCanonicalPlacementAssessmentManifest(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST),
    ).toEqual(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST);
    expect(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST.assessment.targetLevelCodes).toHaveLength(4);
    expect(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST.questionPlan.totalQuestionCount).toBe(36);
    expect(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST.questionPlan.skillDistribution).toEqual([
      { skillCode: "RC_MAIN_IDEA", questionCount: 12 },
      { skillCode: "RC_DETAIL", questionCount: 12 },
      { skillCode: "RC_INFERENCE", questionCount: 12 },
    ]);
    expect(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST.template.firstRealPackReuse).toBe(
      "EXPLICIT_REVIEW_ONLY",
    );
  });

  it("plans CREATE for an empty target and NOOP for an exact rerun", () => {
    expect(planCanonicalPlacementAssessment(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST, null)).toEqual(
      { action: "CREATE", conflicts: [], idempotent: false },
    );
    expect(
      planCanonicalPlacementAssessment(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST, exactExisting()),
    ).toEqual({ action: "NOOP", conflicts: [], idempotent: true });
  });

  it("returns CONFLICT for identity, tenant, lifecycle, or metadata drift", () => {
    const existing = exactExisting();
    existing.config.questionCount = 35;
    const plan = planCanonicalPlacementAssessment(
      CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST,
      existing,
    );
    expect(plan.action).toBe("CONFLICT");
    expect(plan.idempotent).toBe(false);
    expect(plan.conflicts).toContain(
      "canonical placement Assessment config mismatch veya identity marker eksik",
    );
  });

  it("is pure and performs no persistence", () => {
    const snapshot = exactExisting();
    const before = structuredClone(snapshot);
    planCanonicalPlacementAssessment(CANONICAL_PLACEMENT_ASSESSMENT_MANIFEST, snapshot);
    expect(snapshot).toEqual(before);
  });
});

function emptyPromotionSnapshot(): CanonicalPlacementSnapshot {
  return {
    assessment: null,
    template: null,
    templateVersion: null,
    contents: [],
    contentVersions: [],
    questions: [],
    questionVersions: [],
    contentSkills: [],
    templateContents: [],
    templateQuestions: [],
    assessmentMarkerIds: [],
    templateMarkerIds: [],
  };
}

function exactPromotionSnapshot(): CanonicalPlacementSnapshot {
  const graph = buildCanonicalPlacementAssessmentGraph();
  const publishedAt = new Date("2026-09-05T00:00:00.000Z");
  return {
    assessment: {
      ...graph.assessment,
      config: graph.assessment.config,
    },
    template: {
      ...graph.template,
      config: graph.template.config,
    },
    templateVersion: { ...graph.templateVersion, publishedAt },
    contents: graph.contents.map((content) => ({
      id: content.contentId,
      tenantId: null,
      type: "PASSAGE",
      title: content.title,
      difficulty: content.difficulty,
      status: "PUBLISHED",
      currentVersionId: content.contentVersionId,
      deletedAt: null,
    })),
    contentVersions: graph.contents.map((content) => ({
      id: content.contentVersionId,
      contentId: content.contentId,
      version: 1,
      title: content.title,
      body: content.body,
      wordCount: content.wordCount,
      license: content.license,
      changelog: content.changelog,
      status: "PUBLISHED",
      publishedAt,
    })),
    questions: graph.questions.map((question) => ({
      id: question.questionId,
      contentId: question.contentId,
      position: question.contentPosition,
      type: question.question.questionType,
      skillId: graph.skills.find((skill) => skill.code === question.skillCode)!.id,
      status: "PUBLISHED",
      deletedAt: null,
    })),
    questionVersions: graph.questions.map((question) => ({
      id: question.questionVersionId,
      questionId: question.questionId,
      version: 1,
      prompt: question.question.questionText,
      options: question.question.options,
      correctAnswer: question.question.correctAnswer,
      explanation: question.question.explanation,
      difficulty: question.question.difficulty,
      status: "PUBLISHED",
      publishedAt,
      partialCreditEnabled: false,
      generationMetadata: question.generationMetadata,
    })),
    contentSkills: graph.contentSkills,
    templateContents: graph.contents.map((content) => ({
      templateVersionId: graph.templateVersion.id,
      contentVersionId: content.contentVersionId,
      position: content.position,
    })),
    templateQuestions: graph.questions.map((question) => ({
      templateVersionId: graph.templateVersion.id,
      questionVersionId: question.questionVersionId,
      questionId: question.questionId,
      position: question.templatePosition,
    })),
    assessmentMarkerIds: [graph.assessment.id],
    templateMarkerIds: [graph.template.id],
  };
}

describe("canonical placement assessment graph and promotion plan", () => {
  it("builds the complete published-target graph without assigning a result level", () => {
    const graph = buildCanonicalPlacementAssessmentGraph();
    expect(graph.assessment.status).toBe("PUBLISHED");
    expect(graph.assessment.levelId).toBeNull();
    expect(graph.assessment.tenantId).toBeNull();
    expect(graph.assessment.deletedAt).toBeNull();
    expect(graph.manifest.assessment.visibility).toEqual({
      scope: "GLOBAL",
      tenantId: null,
      deletedAt: null,
    });
    expect(graph.assessment.config).toMatchObject({
      resultLevelId: null,
      reviewRequired: true,
      calibrationStatus: "NOT_CALIBRATED",
      productionAssignmentEnabled: false,
    });
    expect(graph.contents).toHaveLength(12);
    expect(graph.questions).toHaveLength(36);
    expect(graph.contentSkills).toHaveLength(36);
    expect(
      graph.questions.reduce<Record<string, number>>((counts, question) => {
        counts[question.skillCode] = (counts[question.skillCode] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ RC_MAIN_IDEA: 12, RC_DETAIL: 12, RC_INFERENCE: 12 });
    expect(graph.template.type).toBe("MIXED");
    expect(graph.templateVersion.status).toBe("PUBLISHED");
    expect(graph.template.config).toMatchObject({
      questionCount: 36,
      scoring: { contractVersion: 1, minScoredCount: 24 },
      levelMappingPolicy: { resultLevelId: null, reviewRequired: true },
    });
    expect(
      graph.questions.every((question) => question.question.questionType !== "OPEN_ENDED"),
    ).toBe(true);
  });

  it("plans CREATE for an empty target", () => {
    const plan = planCanonicalPlacementPromotion(
      buildCanonicalPlacementAssessmentGraph(),
      emptyPromotionSnapshot(),
    );
    expect(plan.action).toBe("CREATE");
    expect(plan.conflicts).toEqual([]);
    expect(plan.idempotent).toBe(false);
    expect(plan.expectedCounts).toEqual({
      assessments: 1,
      templates: 1,
      templateVersions: 1,
      contents: 12,
      contentVersions: 12,
      contentSkills: 36,
      questions: 36,
      questionVersions: 36,
      templateContents: 12,
      templateQuestions: 36,
    });
  });

  it("plans NOOP for an exact published graph and is idempotent", () => {
    const graph = buildCanonicalPlacementAssessmentGraph();
    const plan = planCanonicalPlacementPromotion(graph, exactPromotionSnapshot());
    expect(plan).toMatchObject({ action: "NOOP", conflicts: [], idempotent: true });
  });

  it("returns CONFLICT for identity drift or a partial graph", () => {
    const graph = buildCanonicalPlacementAssessmentGraph();
    const identityDrift = exactPromotionSnapshot();
    identityDrift.assessment!.title = "Başka değerlendirme";
    expect(planCanonicalPlacementPromotion(graph, identityDrift).action).toBe("CONFLICT");

    const partial = emptyPromotionSnapshot();
    partial.template = exactPromotionSnapshot().template;
    expect(planCanonicalPlacementPromotion(graph, partial).action).toBe("CONFLICT");
  });

  it("does not mutate the read-only snapshot while planning", () => {
    const graph = buildCanonicalPlacementAssessmentGraph();
    const snapshot = exactPromotionSnapshot();
    const before = structuredClone(snapshot);
    planCanonicalPlacementPromotion(graph, snapshot);
    expect(snapshot).toEqual(before);
  });
});
