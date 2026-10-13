import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { provisionPersonalContext } from "../src/modules/tenant/index.js";
import { reconcileP1ToNextCycle } from "../src/modules/student-learning/p1-transition.js";
import type { StudentActor } from "../src/modules/student-learning/policy.js";
import {
  EDUCATION_V2_P1_A_PROGRAM,
  EDUCATION_V2_P1_A_PROGRAM_ID,
} from "../src/curriculum/education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_ID,
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
} from "../src/curriculum/education-v2-p1-a-cycle-v2-program.js";

const ID_PREFIX = "c2510000-0000-7000-8000-";
const id = (suffix: number) => `${ID_PREFIX}${String(suffix).padStart(12, "0")}`;

const PATH_IDS = { initial: id(1), next: id(2) };
const ACTOR_EMAILS = [
  "p1-transition-1@example.test",
  "p1-transition-2@example.test",
  "p1-transition-3@example.test",
];
const ACTOR_IDS = { complete: id(10), incomplete: id(11), unavailable: id(12) };
const TENANT_IDS = { complete: "", incomplete: "", unavailable: "" };

type ActorFixture = {
  actor: StudentActor & { tenantId: string; platformRole: null };
  enrollmentId: string;
};

const createdContentIds: string[] = [];
const createdContentVersionIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdTemplateVersionIds: string[] = [];
const createdAssessmentIds: string[] = [];

async function cleanup() {
  const tenantIds = Object.values(TENANT_IDS).filter(Boolean);
  const userIds = Object.values(ACTOR_IDS);

  await prisma.studentLearningPath.deleteMany({
    where: { learningPathId: { in: Object.values(PATH_IDS) } },
  });
  if (tenantIds.length) {
    await prisma.studentLearningStepProgress.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.studentLessonProgress.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.assessmentResult.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.studentProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  }
  await prisma.learningPath.deleteMany({ where: { id: { in: Object.values(PATH_IDS) } } });
  await prisma.assessment.deleteMany({ where: { id: { in: createdAssessmentIds } } });
  await prisma.exerciseTemplateVersion.deleteMany({
    where: { id: { in: createdTemplateVersionIds } },
  });
  await prisma.exerciseTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
  await prisma.contentVersion.deleteMany({ where: { id: { in: createdContentVersionIds } } });
  await prisma.content.deleteMany({ where: { id: { in: createdContentIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

async function createPublishedArtifact(kind: "CONTENT" | "TEMPLATE" | "ASSESSMENT", index: number) {
  if (kind === "CONTENT") {
    const contentId = id(100 + index);
    const versionId = id(200 + index);
    await prisma.content.create({
      data: {
        id: contentId,
        type: "PASSAGE",
        title: `P1 geçiş içeriği ${index}`,
        difficulty: 1,
        status: "PUBLISHED",
      },
    });
    await prisma.contentVersion.create({
      data: {
        id: versionId,
        contentId,
        version: 1,
        title: `P1 geçiş sürümü ${index}`,
        body: "Sentetik entegrasyon metni.",
        wordCount: 3,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.content.update({
      where: { id: contentId },
      data: { currentVersionId: versionId },
    });
    createdContentIds.push(contentId);
    createdContentVersionIds.push(versionId);
    return { contentVersionId: versionId };
  }

  if (kind === "TEMPLATE") {
    const templateId = id(300 + index);
    const versionId = id(400 + index);
    await prisma.exerciseTemplate.create({
      data: {
        id: templateId,
        title: `P1 geçiş şablonu ${index}`,
        type: "COMPREHENSION",
        status: "PUBLISHED",
      },
    });
    await prisma.exerciseTemplateVersion.create({
      data: {
        id: versionId,
        templateId,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    createdTemplateIds.push(templateId);
    createdTemplateVersionIds.push(versionId);
    return { exerciseTemplateVersionId: versionId };
  }

  const assessmentId = id(500 + index);
  await prisma.assessment.create({
    data: {
      id: assessmentId,
      title: `P1 geçiş değerlendirmesi ${index}`,
      type: "BENCHMARK",
      status: "PUBLISHED",
      config: { questionCount: 1, minimumAnsweredCount: 1, minimumScorableCount: 1 },
    },
  });
  createdAssessmentIds.push(assessmentId);
  return { assessmentId };
}

async function createPath(
  pathId: string,
  programId: typeof EDUCATION_V2_P1_A_PROGRAM_ID | typeof EDUCATION_V2_P1_A_CYCLE_V2_ID,
  program: typeof EDUCATION_V2_P1_A_PROGRAM | typeof EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
) {
  await prisma.learningPath.create({
    data: {
      id: pathId,
      code: program.path.code,
      title: program.path.title,
      area: "READING_COMPREHENSION",
      version: programId === EDUCATION_V2_P1_A_PROGRAM_ID ? 1 : 2,
      status: "PUBLISHED",
    },
  });

  let artifactIndex = pathId === PATH_IDS.initial ? 0 : 50;
  let previousStepId: string | null = null;
  for (const [unitIndex, unit] of program.path.units.entries()) {
    const unitId = id(600 + artifactIndex + unitIndex);
    await prisma.learningUnit.create({
      data: {
        id: unitId,
        pathId,
        code: unit.code,
        title: unit.title,
        position: unit.position,
        status: "PUBLISHED",
      },
    });
    for (const [stepIndex, sourceStep] of unit.steps.entries()) {
      const stepId = id(700 + artifactIndex + unitIndex * 20 + stepIndex);
      const artifact =
        sourceStep.type === "TEACHING"
          ? await createPublishedArtifact("CONTENT", artifactIndex++)
          : sourceStep.type === "ASSESSMENT"
            ? await createPublishedArtifact("ASSESSMENT", artifactIndex++)
            : await createPublishedArtifact("TEMPLATE", artifactIndex++);
      await prisma.learningStep.create({
        data: {
          id: stepId,
          unitId,
          stableKey: sourceStep.key,
          title: sourceStep.title,
          position: stepIndex + 1,
          type: sourceStep.type,
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: previousStepId,
          completionRule: sourceStep.type === "ASSESSMENT" ? { minimumScore: 0.75 } : {},
          ...artifact,
        },
      });
      previousStepId = stepId;
    }
  }
}

async function createActor(
  userId: string,
  email: string,
  fixtureName: keyof typeof TENANT_IDS,
): Promise<ActorFixture> {
  await prisma.user.create({
    data: { id: userId, email, displayName: "P1 geçiş test öğrencisi", status: "ACTIVE" },
  });
  const context = await provisionPersonalContext(userId);
  TENANT_IDS[fixtureName] = context.tenantId;
  const enrollment = await prisma.studentLearningPath.create({
    data: {
      tenantId: context.tenantId,
      studentId: userId,
      learningPathId: PATH_IDS.initial,
      routeStatus: "ACTIVE",
      selectionPolicyVersion: "P1_TEST_FIXTURE",
    },
    select: { id: true },
  });
  return {
    actor: { userId, tenantId: context.tenantId, platformRole: null },
    enrollmentId: enrollment.id,
  };
}

async function completeInitialCycle(fixture: ActorFixture, includeAssessmentResult: boolean) {
  const steps = await prisma.learningStep.findMany({
    where: { unit: { pathId: PATH_IDS.initial } },
    orderBy: [{ unit: { position: "asc" } }, { position: "asc" }],
    select: {
      id: true,
      type: true,
      contentVersionId: true,
      exerciseTemplateVersionId: true,
      assessmentId: true,
    },
  });
  const fixtureOffset =
    fixture.actor.userId === ACTOR_IDS.incomplete
      ? 100
      : fixture.actor.userId === ACTOR_IDS.unavailable
        ? 200
        : 0;
  for (const [index, step] of steps.entries()) {
    if (step.type !== "ASSESSMENT") {
      await prisma.studentLearningStepProgress.create({
        data: {
          tenantId: fixture.actor.tenantId,
          studentId: fixture.actor.userId,
          learningStepId: step.id,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    }
    if (step.contentVersionId) {
      await prisma.studentLessonProgress.create({
        data: {
          tenantId: fixture.actor.tenantId,
          studentId: fixture.actor.userId,
          contentVersionId: step.contentVersionId,
        },
      });
    }
    if (step.exerciseTemplateVersionId) {
      await prisma.exerciseSession.create({
        data: {
          id: id(900 + fixtureOffset + index),
          tenantId: fixture.actor.tenantId,
          studentId: fixture.actor.userId,
          templateVersionId: step.exerciseTemplateVersionId,
          learningStepId: step.id,
          context: "INDIVIDUAL",
          sessionType: "PRACTICE",
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    }
    if (step.type === "ASSESSMENT" && includeAssessmentResult && step.assessmentId) {
      await prisma.assessmentResult.create({
        data: {
          id: id(1000 + fixtureOffset),
          tenantId: fixture.actor.tenantId,
          studentId: fixture.actor.userId,
          assessmentId: step.assessmentId,
          score: 1,
          metrics: { source: "synthetic-integration-test" },
        },
      });
    }
  }
}

describe.sequential("P1 learning cycle transition integration", () => {
  let completeFixture: ActorFixture;
  let incompleteFixture: ActorFixture;
  let unavailableFixture: ActorFixture;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await createPath(PATH_IDS.initial, EDUCATION_V2_P1_A_PROGRAM_ID, EDUCATION_V2_P1_A_PROGRAM);
    await createPath(
      PATH_IDS.next,
      EDUCATION_V2_P1_A_CYCLE_V2_ID,
      EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
    );
    completeFixture = await createActor(ACTOR_IDS.complete, ACTOR_EMAILS[0]!, "complete");
    incompleteFixture = await createActor(ACTOR_IDS.incomplete, ACTOR_EMAILS[1]!, "incomplete");
    unavailableFixture = await createActor(ACTOR_IDS.unavailable, ACTOR_EMAILS[2]!, "unavailable");
    await completeInitialCycle(completeFixture, true);
    await completeInitialCycle(incompleteFixture, false);
    await completeInitialCycle(unavailableFixture, true);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("assigns the next cycle from real progress and AssessmentResult evidence", async () => {
    const result = await reconcileP1ToNextCycle(completeFixture.actor, {
      p1LearningPathId: completeFixture.enrollmentId,
    });
    expect(result).toMatchObject({
      outcome: "ASSIGNED",
      nextLearningPathId: PATH_IDS.next,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });
    const enrollments = await prisma.studentLearningPath.findMany({
      where: { tenantId: completeFixture.actor.tenantId, studentId: completeFixture.actor.userId },
      select: { learningPathId: true, routeStatus: true },
    });
    expect(enrollments).toEqual(
      expect.arrayContaining([
        { learningPathId: PATH_IDS.initial, routeStatus: "COMPLETED" },
        { learningPathId: PATH_IDS.next, routeStatus: "ACTIVE" },
      ]),
    );
  });

  it("returns ALREADY_ASSIGNED on a replay without duplicating or reactivating the old cycle", async () => {
    const result = await reconcileP1ToNextCycle(completeFixture.actor, {
      p1LearningPathId: completeFixture.enrollmentId,
    });
    expect(result.outcome).toBe("ALREADY_ASSIGNED");
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: completeFixture.actor.tenantId,
          studentId: completeFixture.actor.userId,
          learningPathId: PATH_IDS.next,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: completeFixture.actor.tenantId,
          studentId: completeFixture.actor.userId,
          routeStatus: "ACTIVE",
          learningPath: { code: { startsWith: "EDUCATION_V2_P1_" } },
        },
      }),
    ).toBe(1);
  });

  it("keeps an incomplete cycle in review and preserves existing progress", async () => {
    const before = await prisma.studentLearningStepProgress.count({
      where: {
        tenantId: incompleteFixture.actor.tenantId,
        studentId: incompleteFixture.actor.userId,
      },
    });
    const result = await reconcileP1ToNextCycle(incompleteFixture.actor, {
      p1LearningPathId: incompleteFixture.enrollmentId,
    });
    expect(result).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      readiness: { status: "CURRENT_CYCLE_NOT_COMPLETED", currentCycleCompleted: false },
    });
    expect(
      await prisma.studentLearningStepProgress.count({
        where: {
          tenantId: incompleteFixture.actor.tenantId,
          studentId: incompleteFixture.actor.userId,
        },
      }),
    ).toBe(before);
    expect(
      await prisma.studentLearningPath.findUnique({
        where: { id: incompleteFixture.enrollmentId },
      }),
    ).toMatchObject({ routeStatus: "ACTIVE" });

    await prisma.studentLearningPath.update({
      where: { id: incompleteFixture.enrollmentId },
      data: { routeStatus: "REASSIGNED" },
    });
    const staleReplay = await reconcileP1ToNextCycle(incompleteFixture.actor, {
      p1LearningPathId: incompleteFixture.enrollmentId,
    });
    expect(staleReplay).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      readiness: { status: "NOT_APPLICABLE" },
    });
  });

  it("fails closed when the next graph is unpublished and refuses a cross-tenant request", async () => {
    const unpublishedStep = await prisma.learningStep.findFirstOrThrow({
      where: { unit: { pathId: PATH_IDS.next } },
      select: { id: true, stableKey: true },
    });
    await prisma.learningStep.update({
      where: { id: unpublishedStep.id },
      data: { status: "DRAFT" },
    });
    const unavailable = await reconcileP1ToNextCycle(unavailableFixture.actor, {
      p1LearningPathId: unavailableFixture.enrollmentId,
    });
    expect(unavailable).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      readiness: { status: "NEXT_CYCLE_UNAVAILABLE", currentCycleCompleted: true },
    });
    await prisma.learningStep.update({
      where: { id: unpublishedStep.id },
      data: { status: "PUBLISHED" },
    });

    await prisma.learningStep.update({
      where: { id: unpublishedStep.id },
      data: { stableKey: "unexpected-test-step" },
    });
    const unexpected = await reconcileP1ToNextCycle(unavailableFixture.actor, {
      p1LearningPathId: unavailableFixture.enrollmentId,
    });
    expect(unexpected).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      readiness: { status: "NEXT_CYCLE_UNAVAILABLE", currentCycleCompleted: true },
    });
    await prisma.learningStep.update({
      where: { id: unpublishedStep.id },
      data: { stableKey: unpublishedStep.stableKey },
    });

    const crossTenant = await reconcileP1ToNextCycle(incompleteFixture.actor, {
      p1LearningPathId: completeFixture.enrollmentId,
    });
    expect(crossTenant.outcome).toBe("REVIEW_REQUIRED");
    expect(crossTenant.readiness.status).toBe("NOT_APPLICABLE");
  });
});
