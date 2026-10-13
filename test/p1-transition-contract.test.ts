import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  isReadyP1CandidateStep,
  nextP1CyclePathCode,
  P1_CYCLE_TRANSITION_POLICY_VERSION,
} from "../src/modules/student-learning/p1-transition.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_EXPLICIT_PUBLICATION_APPROVED,
  EDUCATION_V2_P1_A_CYCLE_V2_STATUS,
  isEducationV2P1ACycleV2ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-v2-program.js";

const publishedContent = {
  status: "PUBLISHED",
  content: { status: "PUBLISHED", deletedAt: null },
} as const;
const publishedTemplate = {
  status: "PUBLISHED",
  template: { status: "PUBLISHED", deletedAt: null },
} as const;

function candidateStep(
  type: "TEACHING" | "SMALL_STUDY" | "PRACTICE" | "REINFORCEMENT" | "ASSESSMENT",
  overrides: Partial<Parameters<typeof isReadyP1CandidateStep>[0]> = {},
) {
  return {
    type,
    contentVersionId: null,
    contentVersion: null,
    exerciseTemplateVersionId: null,
    exerciseTemplateVersion: null,
    assessmentId: null,
    assessment: null,
    ...overrides,
  } as Parameters<typeof isReadyP1CandidateStep>[0];
}

describe("P1 transition foundation contracts", () => {
  it("keeps the migration additive and protects the single active route invariant", async () => {
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261008100000_add_adaptive_learning_path_routing/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|TYPE|COLUMN|INDEX)\b/iu);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "routeStatus"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "measurementResultId"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "StudentLearningPath_one_active_route_idx"',
    );
    expect(migration).toContain("WHERE \"routeStatus\" = 'ACTIVE'");
  });

  it("keeps P1 selection separate from generic P0 completion", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );
    const learningPath = await readFile(
      new URL("../src/modules/learning-path/service.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("reconcileP0ToP1");
    expect(transition).toContain("withTenantContext");
    expect(transition).toContain('routeStatus: "REASSIGNED"');
    expect(transition).toContain("assertTeacherClassAccess");
    expect(transition).not.toContain("completeLearningStep(");
    expect(learningPath).toContain('const P1_PATH_PREFIX = "EDUCATION_V2_P1_"');
    expect(learningPath).toContain('routeStatus: { in: ["ACTIVE", "COMPLETED", "PAUSED"] }');
  });

  it("reconciles P1 only after the student completes a P0 terminal step", async () => {
    const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

    expect(app).toContain('"/student/learning-path/p1/reconcile"');
    expect(app).toContain('startsWith("EDUCATION_V2_P0_")');
    expect(app).toContain("p0LearningPathId: node.learningPathId");
  });

  it("keeps the next-cycle transition explicit, versioned, and publication-gated", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );
    const cycleV2 = await readFile(
      new URL("../src/curriculum/education-v2-p1-a-cycle-v2-program.ts", import.meta.url),
      "utf8",
    );

    expect(nextP1CyclePathCode("EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12")).toBe(
      "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12",
    );
    expect(nextP1CyclePathCode("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12")).toBeNull();
    expect(P1_CYCLE_TRANSITION_POLICY_VERSION).toBe("P1_CYCLE_TRANSITION_V1");
    expect(transition).toContain('"NEXT_CYCLE_UNAVAILABLE"');
    expect(transition).toContain('enrollment.routeStatus !== "ACTIVE"');
    expect(transition).toContain('status: "PUBLISHED"');
    expect(transition).toContain("hasExpectedP1CycleGraph");
    expect(transition).toContain("stableKey");
    expect(transition).toContain("prerequisiteStepId");
    expect(transition).toContain("studentLearningPath.upsert");
    expect(transition).toContain('outcome: "ALREADY_ASSIGNED"');
    expect(cycleV2).toContain(
      'EDUCATION_V2_P1_A_CYCLE_V2_STATUS: EducationV2P1ACycleV2SourceStatus = "PUBLISHED"',
    );
    expect(cycleV2).not.toContain("EXPERT_REVIEW_REQUIRED");
    expect(cycleV2).toContain("EDUCATION_V2_P1_A_CYCLE_V2_EXPLICIT_PUBLICATION_APPROVED = true");
    expect(cycleV2).toContain("isEducationV2P1ACycleV2ProductionAssignmentEnabled");
    expect(EDUCATION_V2_P1_A_CYCLE_V2_STATUS).toBe("PUBLISHED");
    expect(EDUCATION_V2_P1_A_CYCLE_V2_EXPLICIT_PUBLICATION_APPROVED).toBe(true);
    expect(isEducationV2P1ACycleV2ProductionAssignmentEnabled()).toBe(true);
    expect(await readFile(new URL("../public/app.js", import.meta.url), "utf8")).toContain(
      'exerciseSession.deviceInfo?.source !== "LEARNING_PATH_REPLAY"',
    );
  });

  it("refreshes the path and opens the first assigned P1 station without a manual reload", async () => {
    const [app, index] = await Promise.all([
      readFile(new URL("../public/app.js", import.meta.url), "utf8"),
      readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    ]);

    expect(app).toContain('result?.outcome === "ASSIGNED"');
    expect(app).toContain('result?.outcome === "ALREADY_ASSIGNED"');
    expect(app).toContain('String(node.learningPathCode || "").startsWith("EDUCATION_V2_P1_")');
    expect(app).toContain('return node.type !== "NEXT_LEARNING"');
    expect(app).toContain('const path = await insightApi("learning-path")');
    expect(app).toContain("activeLearningPathNodeFromData(path)");
    expect(app).toContain("learningPathEntryMode = true");
    expect(app).toContain('result?.outcome === "REVIEW_REQUIRED"');
    expect(app).toContain("pendingP1Reconcile");
    expect(app).toContain("pendingP1CycleReconcile");
    expect(app).toContain("retryPendingP1CycleReconcile");
    expect(app).toContain("retryPendingLearningPathReconcile");
    expect(index).toContain('id="learning-path-transition-status"');
    expect(index).toContain('id="learning-path-transition-retry"');
  });

  it("does not claim that P0 is complete when reconcile is blocked", async () => {
    const [transition, app] = await Promise.all([
      readFile(
        new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    ]);

    expect(transition).toContain('"P0_GRAPH_NOT_READY"');
    expect(transition).toContain('"P0_LEVEL_SCOPE_NOT_READY"');
    expect(transition).toContain('"P0_NOT_COMPLETED"');
    expect(transition).toContain('"FINAL_MEASUREMENT_MISSING"');
    expect(transition).toContain('"P1_CURRICULUM_UNAVAILABLE"');
    expect(transition).toContain('"MEASUREMENT_REVIEW_REQUIRED"');
    expect(transition).toContain("canonicalGraphReady");
    expect(transition).toContain("p0LevelScopeReady");
    expect(app).toContain("function p1TransitionReviewMessage(result)");
    expect(app).not.toContain(
      '"P0 tamamlandı. Ölçüm veya uygun içerik kontrolleri tamamlanmadan yeni öğrenme yolu açılamıyor."',
    );
  });

  it("reads P0 completion without writing P0 progress", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain('const P0_PATH_PREFIX = "EDUCATION_V2_P0_"');
    expect(transition).toContain('const P0_LEGACY_PATH_PREFIX = "EDU-V2-P0-"');
    expect(transition).toContain("tx.studentLearningStepProgress.findMany");
    expect(transition).toContain("learningPath: { code: { startsWith: P1_PATH_PREFIX } }");
    expect(transition).not.toContain("tx.studentLearningStepProgress.update");
    expect(transition).not.toContain("tx.studentLearningStepProgress.delete");
  });

  it("reads the complete 22-step P0 family from all three canonical path areas", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain(
      'const P0_PATH_AREAS = ["FAST_READING", "READING_COMPREHENSION", "COMMON"] as const',
    );
    expect(transition).toContain("ACADEMIC_P0_LESSONS.length * 3");
    expect(transition).toContain("tx.learningPath.findMany");
    expect(transition).toContain("selectedPaths.length === P0_PATH_AREAS.length");
    expect(transition).toContain("steps.length === P0_CANONICAL_STEP_COUNT");
    expect(transition).toContain("EDUCATION_V2_P0_PATH_SCOPE_CODE");
    expect(transition).toContain("pathScopeCode");
    expect(transition).toContain("anchorIsCanonical");
    expect(transition).toContain("steps.every(hasP0StepArtifact)");
    expect(transition).toContain('contentVersion?.status === "PUBLISHED"');
    expect(transition).toContain('exerciseTemplateVersion?.status === "PUBLISHED"');
    expect(transition).toContain('assessment?.status === "PUBLISHED"');
    expect(transition).toContain("const P0_CANONICAL_PATH_VERSION = 1");
    expect(transition).toContain("version: P0_CANONICAL_PATH_VERSION");
    expect(transition).toContain("levelScopeReady");
    expect(transition).toContain('"P0_LEVEL_SCOPE_NOT_READY"');
    expect(transition).not.toContain("level: { code: levelCode }");
    expect(transition).toContain("step.pathId === previous.pathId");
  });

  it("pins candidate versions and rejects candidates outside the published level scope", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("version: true");
    expect(transition).toContain('status: "PUBLISHED"');
    expect(transition).toContain("levelId: null");
    expect(transition).toContain("{ levelId }");
  });

  it("accepts P1-A template-backed small study without weakening other artifact contracts", () => {
    expect(
      isReadyP1CandidateStep(
        candidateStep("SMALL_STUDY", {
          exerciseTemplateVersionId: "template-version-1",
          exerciseTemplateVersion: publishedTemplate,
        }),
      ),
    ).toBe(true);
    expect(
      isReadyP1CandidateStep(
        candidateStep("SMALL_STUDY", {
          contentVersionId: "content-version-1",
          contentVersion: publishedContent,
        }),
      ),
    ).toBe(true);
    expect(
      isReadyP1CandidateStep(
        candidateStep("PRACTICE", {
          contentVersionId: "content-version-1",
          contentVersion: publishedContent,
        }),
      ),
    ).toBe(false);
    expect(
      isReadyP1CandidateStep(
        candidateStep("REINFORCEMENT", {
          exerciseTemplateVersionId: "template-version-1",
          exerciseTemplateVersion: publishedTemplate,
        }),
      ),
    ).toBe(true);
    expect(
      isReadyP1CandidateStep(
        candidateStep("TEACHING", {
          exerciseTemplateVersionId: "template-version-1",
          exerciseTemplateVersion: publishedTemplate,
        }),
      ),
    ).toBe(false);
    expect(
      isReadyP1CandidateStep(
        candidateStep("SMALL_STUDY", {
          exerciseTemplateVersionId: "template-version-1",
          exerciseTemplateVersion: {
            status: "PUBLISHED",
            template: { status: "DRAFT", deletedAt: null },
          },
        }),
      ),
    ).toBe(false);
  });

  it("keeps the P1 candidate check tied to the published assessment artifact", () => {
    expect(
      isReadyP1CandidateStep(
        candidateStep("ASSESSMENT", {
          assessmentId: "assessment-1",
          assessment: { status: "PUBLISHED", deletedAt: null },
        }),
      ),
    ).toBe(true);
    expect(
      isReadyP1CandidateStep(
        candidateStep("ASSESSMENT", {
          assessmentId: "assessment-1",
          assessment: { status: "PUBLISHED", deletedAt: new Date() },
        }),
      ),
    ).toBe(false);
  });

  it("keeps template-backed small study support explicit in the runtime contracts", async () => {
    const [persistent, app] = await Promise.all([
      readFile(
        new URL("../src/modules/student-learning/persistent-path.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    ]);

    expect(persistent).toContain('step.type === "SMALL_STUDY"');
    expect(persistent).toContain('type: { in: ["SMALL_STUDY", "PRACTICE", "REINFORCEMENT"] }');
    expect(app).toContain('if (type === "SMALL_STUDY" && node?.contentVersionId)');
    expect(app).toContain("Boolean(node.contentVersionId || node.templateVersionId)");
  });

  it("makes duplicate assignment idempotent", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("studentLearningPath.findUnique");
    expect(transition).toContain("studentLearningPath.upsert");
    expect(transition).toContain('outcome: "ALREADY_ASSIGNED"');
  });

  it("records teacher override audit data without changing measurement data", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("recommendedPathId");
    expect(transition).toContain("measurementResultId");
    expect(transition).toContain("selectionPolicyVersion");
    expect(transition).toContain("overrideByUserId: actor.userId");
    expect(transition).toContain("overrideAt: now");
    expect(transition).toContain("overrideReason: input.reason");
    expect(transition).not.toContain("assessmentResult.update");
  });

  it("uses class authorization and explicit tenant/student predicates for override", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain(
      "assertTeacherClassAccess(actor, input.classId, input.studentId, tx)",
    );
    expect(transition).toContain("tenantId,");
    expect(transition).toContain("studentId: input.studentId");
    expect(transition).toContain("withTenantContext(actor");
  });

  it("preserves the original P0 enrollment while creating a distinct P1 enrollment", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("learningPathId: selection.recommendedPathId");
    expect(transition).toContain("recommendedPathId: selection.recommendedPathId");
    expect(transition).toContain("P0_PATH_PREFIX");
    expect(transition).toContain("P1_PATH_PREFIX");
  });

  it("handles the unique active-route race without creating a second active route", async () => {
    const [transition, migration] = await Promise.all([
      readFile(
        new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../prisma/migrations/20261008100000_add_adaptive_learning_path_routing/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(transition).toContain('error.code === "P2002"');
    expect(transition).toContain('data: { routeStatus: "REASSIGNED" }');
    expect(migration).toContain("WHERE \"routeStatus\" = 'ACTIVE'");
  });
});
