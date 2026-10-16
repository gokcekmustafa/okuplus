import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { provisionPersonalContext } from "../src/modules/tenant/index.js";
const transitionTestState = vi.hoisted(() => ({
  publicationApproved: false,
}));

vi.mock("../src/curriculum/education-v2-p1-a-cycle-v2-program.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/curriculum/education-v2-p1-a-cycle-v2-program.js")
    >();
  return {
    ...actual,
    isEducationV2P1ACycleV2ProductionAssignmentEnabled: () =>
      transitionTestState.publicationApproved,
  };
});

import {
  reconcileP1ToNextCycle,
  resolveP1CycleTransitionStep,
} from "../src/modules/student-learning/p1-transition.js";
import type { StudentActor } from "../src/modules/student-learning/policy.js";
import {
  getStudentLearningPath,
  assertLearningStepAccessible,
  assertLearningContentAccessible,
} from "../src/modules/learning-path/service.js";
import { learningRouteCycle } from "../src/curriculum/learning-route-catalog.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import type { P1AProgram } from "../src/curriculum/education-v2-p1-a-program.js";
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

const PATH_IDS = { initial: id(1), next: id(2), third: id(3) };
const ACTOR_EMAILS = [
  "p1-transition-1@example.test",
  "p1-transition-2@example.test",
  "p1-transition-3@example.test",
  "p1-transition-4@example.test",
  "p1-transition-5@example.test",
  "p1-transition-6@example.test",
  "p1-transition-7@example.test",
  "p1-transition-8@example.test",
];
const ACTOR_IDS = {
  complete: id(10),
  incomplete: id(11),
  unavailable: id(12),
  assigned: id(13),
  blocked: id(14),
  concurrent: id(15),
  recovery: id(16),
  cycle2: id(18),
};
const TENANT_IDS = {
  complete: "",
  incomplete: "",
  unavailable: "",
  assigned: "",
  blocked: "",
  concurrent: "",
  recovery: "",
  cycle2: "",
};

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
  await prisma.$transaction(async (tx) => {
    // These fixtures intentionally use PUBLISHED versions to exercise the
    // student gate. The production immutability trigger remains enabled in
    // real databases; only this isolated test cleanup bypasses it.
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.exerciseTemplateVersion.deleteMany({
      where: { id: { in: createdTemplateVersionIds } },
    });
    await tx.content.updateMany({
      where: { id: { in: createdContentIds } },
      data: { currentVersionId: null },
    });
    await tx.contentVersion.deleteMany({
      where: { id: { in: createdContentVersionIds } },
    });
  });
  await prisma.exerciseTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
  await prisma.content.deleteMany({ where: { id: { in: createdContentIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

async function createPublishedArtifact(
  kind: "CONTENT" | "TEMPLATE" | "ASSESSMENT",
  index: number,
  templateConfig = EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.exercises[0]!.contract,
  sourceVersionId?: string,
) {
  if (kind === "CONTENT") {
    const contentId = id(100 + index);
    const versionId = sourceVersionId ?? id(200 + index);
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
    const versionId = sourceVersionId ?? id(400 + index);
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
        config: templateConfig,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    createdTemplateIds.push(templateId);
    createdTemplateVersionIds.push(versionId);
    return { exerciseTemplateVersionId: versionId };
  }

  const assessmentId = sourceVersionId ?? id(500 + index);
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

async function createPath(pathId: string, programId: string, program: P1AProgram) {
  await prisma.learningPath.create({
    data: {
      id: pathId,
      code: program.path.code,
      title: program.path.title,
      area: "READING_COMPREHENSION",
      version: learningRouteCycle(program.path.code)!.version,
      status: "PUBLISHED",
    },
  });

  let artifactIndex = Object.values(PATH_IDS).indexOf(pathId) * 50;
  let previousStepId: string | null = null;
  const stepIdByKey = new Map<string, string>();
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
      const configuredPrerequisiteIds = (sourceStep.prerequisiteStepKeys ?? []).map((key) => {
        const prerequisiteId = stepIdByKey.get(key);
        if (!prerequisiteId) throw new Error(`Missing fixture prerequisite: ${key}`);
        return prerequisiteId;
      });
      const expected = learningRouteCycle(program.path.code)!.manifest.steps.find(
        (step) => step.stableKey === sourceStep.key,
      )!;
      const artifact = {
        ...(expected.content
          ? await createPublishedArtifact(
              "CONTENT",
              artifactIndex++,
              undefined,
              expected.content.versionId,
            )
          : {}),
        ...(expected.exercise
          ? await createPublishedArtifact(
              "TEMPLATE",
              artifactIndex++,
              undefined,
              expected.exercise.versionId,
            )
          : {}),
        ...(expected.assessment
          ? await createPublishedArtifact(
              "ASSESSMENT",
              artifactIndex++,
              undefined,
              expected.assessment.versionId,
            )
          : {}),
      };
      await prisma.learningStep.create({
        data: {
          id: stepId,
          unitId,
          stableKey: `${programId}:${sourceStep.key}`,
          title: sourceStep.title,
          position: stepIndex + 1,
          type: sourceStep.type,
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: previousStepId,
          completionRule: {
            ...(sourceStep.type === "ASSESSMENT" ? { minimumScore: 0.75 } : {}),
            ...(configuredPrerequisiteIds.length
              ? { prerequisiteStepIds: configuredPrerequisiteIds }
              : {}),
          },
          ...artifact,
        },
      });
      stepIdByKey.set(sourceStep.key, stepId);
      previousStepId = stepId;
    }
  }
}

async function createActor(
  userId: string,
  email: string,
  fixtureName: keyof typeof TENANT_IDS,
  startingPathId = PATH_IDS.initial,
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
      learningPathId: startingPathId,
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

async function completeInitialCycle(
  fixture: ActorFixture,
  includeAssessmentResult: boolean,
  pathId = PATH_IDS.initial,
) {
  const steps = await prisma.learningStep.findMany({
    where: { unit: { pathId } },
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
        : fixture.actor.userId === ACTOR_IDS.assigned
          ? 300
          : fixture.actor.userId === ACTOR_IDS.blocked
            ? 400
            : fixture.actor.userId === ACTOR_IDS.concurrent
              ? 500
              : fixture.actor.userId === ACTOR_IDS.recovery
                ? 600
                : fixture.actor.userId === ACTOR_IDS.cycle2
                  ? 800
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
  let assignedFixture: ActorFixture;
  let blockedFixture: ActorFixture;
  let concurrentFixture: ActorFixture;
  let recoveryFixture: ActorFixture;
  let cycle2Fixture: ActorFixture;
  let blockedNextEnrollmentId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await createPath(PATH_IDS.initial, EDUCATION_V2_P1_A_PROGRAM_ID, EDUCATION_V2_P1_A_PROGRAM);
    await createPath(
      PATH_IDS.next,
      EDUCATION_V2_P1_A_CYCLE_V2_ID,
      EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
    );
    await createPath(
      PATH_IDS.third,
      EDUCATION_V2_P1_A_CYCLE_3_ID,
      EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
    );
    completeFixture = await createActor(ACTOR_IDS.complete, ACTOR_EMAILS[0]!, "complete");
    incompleteFixture = await createActor(ACTOR_IDS.incomplete, ACTOR_EMAILS[1]!, "incomplete");
    unavailableFixture = await createActor(ACTOR_IDS.unavailable, ACTOR_EMAILS[2]!, "unavailable");
    assignedFixture = await createActor(ACTOR_IDS.assigned, ACTOR_EMAILS[3]!, "assigned");
    blockedFixture = await createActor(ACTOR_IDS.blocked, ACTOR_EMAILS[4]!, "blocked");
    concurrentFixture = await createActor(ACTOR_IDS.concurrent, ACTOR_EMAILS[5]!, "concurrent");
    recoveryFixture = await createActor(ACTOR_IDS.recovery, ACTOR_EMAILS[6]!, "recovery");
    cycle2Fixture = await createActor(ACTOR_IDS.cycle2, ACTOR_EMAILS[7]!, "cycle2", PATH_IDS.next);
    await completeInitialCycle(completeFixture, true);
    await completeInitialCycle(incompleteFixture, false);
    await completeInitialCycle(unavailableFixture, true);
    await completeInitialCycle(assignedFixture, true);
    await completeInitialCycle(blockedFixture, true);
    await completeInitialCycle(concurrentFixture, true);
    await completeInitialCycle(recoveryFixture, true);
    await completeInitialCycle(cycle2Fixture, true, PATH_IDS.next);
    await prisma.studentLearningPath.create({
      data: {
        tenantId: cycle2Fixture.actor.tenantId,
        studentId: cycle2Fixture.actor.userId,
        learningPathId: PATH_IDS.initial,
        routeStatus: "COMPLETED",
        completedAt: new Date(),
      },
    });
    const blockedNext = await prisma.studentLearningPath.create({
      data: {
        tenantId: blockedFixture.actor.tenantId,
        studentId: blockedFixture.actor.userId,
        learningPathId: PATH_IDS.next,
        routeStatus: "REASSIGNED",
      },
      select: { id: true },
    });
    blockedNextEnrollmentId = blockedNext.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function withPublicationApproval<T>(callback: () => Promise<T>): Promise<T> {
    transitionTestState.publicationApproved = true;
    try {
      return await callback();
    } finally {
      transitionTestState.publicationApproved = false;
    }
  }

  it("continues a completed Cycle 2 student into the published Cycle 3 graph exactly once", async () => {
    await withPublicationApproval(async () => {
      const beforeProgress = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle2Fixture.actor.tenantId, studentId: cycle2Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const beforeResults = await prisma.assessmentResult.findMany({
        where: { tenantId: cycle2Fixture.actor.tenantId, studentId: cycle2Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const preview = await getStudentLearningPath(cycle2Fixture.actor);
      expect(preview?.routeContinuation?.futureCycles[0]).toMatchObject({
        pathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
        stationCount: 7,
        publicationApproved: true,
        graphAvailable: true,
      });
      expect(preview?.upcomingPaths).toHaveLength(1);
      expect(preview?.upcomingPaths[0]?.nodes).toHaveLength(7);
      expect(
        preview?.upcomingPaths[0]?.nodes.every(
          (node) => node.status === "locked" && !node.isCurrent,
        ),
      ).toBe(true);
      const first = preview!.upcomingPaths[0]!.nodes[0]!;
      await expect(assertLearningStepAccessible(cycle2Fixture.actor, first.id)).rejects.toThrow();
      await expect(
        assertLearningContentAccessible(cycle2Fixture.actor, first.contentVersionId!),
      ).rejects.toThrow();
      const outcomes = await Promise.all(
        [1, 2].map(() =>
          reconcileP1ToNextCycle(cycle2Fixture.actor, { p1LearningPathId: PATH_IDS.next }),
        ),
      );
      expect(outcomes.map((result) => result.outcome).sort()).toEqual([
        "ALREADY_ASSIGNED",
        "ASSIGNED",
      ]);
      const path = await getStudentLearningPath(cycle2Fixture.actor);
      expect(path?.paths.map((item) => item.path.cycleSequence)).toEqual([1, 2, 3]);
      expect(
        path?.paths
          .slice(0, 2)
          .flatMap((item) => item.nodes)
          .every((node) => node.status === "completed"),
      ).toBe(true);
      expect(path?.paths[2]?.nodes[0]).toMatchObject({
        id: first.id,
        status: "active",
        availability: "READY",
      });
      expect(path?.paths[2]?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);
      await expect(
        assertLearningStepAccessible(cycle2Fixture.actor, first.id),
      ).resolves.toMatchObject({ status: "active" });
      await reconcileP1ToNextCycle(cycle2Fixture.actor, { p1LearningPathId: PATH_IDS.initial });
      expect(
        await prisma.studentLearningPath.count({
          where: {
            tenantId: cycle2Fixture.actor.tenantId,
            studentId: cycle2Fixture.actor.userId,
            routeStatus: "ACTIVE",
          },
        }),
      ).toBe(1);
      expect(
        await prisma.studentLearningPath.findFirst({
          where: {
            tenantId: cycle2Fixture.actor.tenantId,
            studentId: cycle2Fixture.actor.userId,
            routeStatus: "ACTIVE",
          },
          select: { learningPathId: true },
        }),
      ).toEqual({ learningPathId: PATH_IDS.third });
      expect(
        await prisma.studentLearningStepProgress.findMany({
          where: {
            tenantId: cycle2Fixture.actor.tenantId,
            studentId: cycle2Fixture.actor.userId,
          },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeProgress);
      expect(
        await prisma.assessmentResult.findMany({
          where: {
            tenantId: cycle2Fixture.actor.tenantId,
            studentId: cycle2Fixture.actor.userId,
          },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeResults);
      const assessmentStep = await prisma.learningStep.findFirstOrThrow({
        where: { unit: { pathId: PATH_IDS.next }, type: "ASSESSMENT" },
      });
      expect(
        await resolveP1CycleTransitionStep(cycle2Fixture.actor, {
          learningStepId: null,
          assessmentId: assessmentStep.assessmentId,
        }),
      ).toEqual({ learningStepId: assessmentStep.id, learningPathId: PATH_IDS.next });
    });
  });

  it("does not assign a fully published next graph while publication permission is closed", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.count({
      where: {
        tenantId: completeFixture.actor.tenantId,
        studentId: completeFixture.actor.userId,
      },
    });
    const beforeAssessmentResults = await prisma.assessmentResult.findMany({
      where: {
        tenantId: completeFixture.actor.tenantId,
        studentId: completeFixture.actor.userId,
      },
      select: { id: true, score: true },
      orderBy: { id: "asc" },
    });
    const result = await reconcileP1ToNextCycle(completeFixture.actor, {
      p1LearningPathId: completeFixture.enrollmentId,
    });
    expect(result).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      nextLearningPathId: null,
      readiness: {
        status: "NEXT_CYCLE_UNAVAILABLE",
        currentCycleCompleted: true,
        nextCycleAvailable: false,
      },
    });
    const enrollments = await prisma.studentLearningPath.findMany({
      where: { tenantId: completeFixture.actor.tenantId, studentId: completeFixture.actor.userId },
      select: { learningPathId: true, routeStatus: true },
    });
    expect(enrollments).toEqual([{ learningPathId: PATH_IDS.initial, routeStatus: "ACTIVE" }]);
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: completeFixture.actor.tenantId,
          studentId: completeFixture.actor.userId,
          learningPathId: PATH_IDS.next,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.studentLearningStepProgress.count({
        where: {
          tenantId: completeFixture.actor.tenantId,
          studentId: completeFixture.actor.userId,
        },
      }),
    ).toBe(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: {
          tenantId: completeFixture.actor.tenantId,
          studentId: completeFixture.actor.userId,
        },
        select: { id: true, score: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeAssessmentResults);
  });

  it("resolves a legacy final assessment session without learningStepId only in the enrolled P1 path", async () => {
    const assessmentStep = await prisma.learningStep.findFirst({
      where: { unit: { pathId: PATH_IDS.initial }, type: "ASSESSMENT" },
      select: { id: true, assessmentId: true },
    });
    expect(assessmentStep?.assessmentId).toBeTruthy();

    const resolved = await resolveP1CycleTransitionStep(completeFixture.actor, {
      learningStepId: null,
      assessmentId: assessmentStep!.assessmentId!,
    });
    expect(resolved).toEqual({
      learningStepId: assessmentStep!.id,
      learningPathId: PATH_IDS.initial,
    });

    const staleStepResolution = await resolveP1CycleTransitionStep(completeFixture.actor, {
      learningStepId: id(999_001),
      assessmentId: assessmentStep!.assessmentId!,
    });
    expect(staleStepResolution).toEqual(resolved);

    const unEnrolledResolution = await resolveP1CycleTransitionStep(
      {
        userId: id(17),
        tenantId: completeFixture.actor.tenantId,
        platformRole: null,
      },
      { learningStepId: null, assessmentId: assessmentStep!.assessmentId! },
    );
    expect(unEnrolledResolution).toBeNull();
  });

  it("keeps repeated publication-gated checks review-required without creating a duplicate", async () => {
    const result = await reconcileP1ToNextCycle(completeFixture.actor, {
      p1LearningPathId: completeFixture.enrollmentId,
    });
    expect(result).toMatchObject({
      outcome: "REVIEW_REQUIRED",
      readiness: { status: "NEXT_CYCLE_UNAVAILABLE", currentCycleCompleted: true },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: completeFixture.actor.tenantId,
          studentId: completeFixture.actor.userId,
          learningPathId: PATH_IDS.next,
        },
      }),
    ).toBe(0);
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
    expect(
      await prisma.studentLearningPath.findUnique({
        where: { id: completeFixture.enrollmentId },
        select: { routeStatus: true },
      }),
    ).toEqual({ routeStatus: "ACTIVE" });
  });

  it("assigns one published next cycle when publication is explicitly approved in isolation", async () => {
    // The student-facing path projection excludes draft units. Keep the
    // transition query on the same published runtime graph so a legacy draft
    // unit cannot make an otherwise complete visible cycle look incomplete.
    await prisma.learningUnit.create({
      data: {
        id: id(1200),
        pathId: PATH_IDS.initial,
        code: "LEGACY_DRAFT_UNIT",
        title: "Eski taslak ünite",
        position: 99,
        status: "DRAFT",
      },
    });
    const result = await withPublicationApproval(() =>
      reconcileP1ToNextCycle(assignedFixture.actor, {
        p1LearningPathId: assignedFixture.enrollmentId,
      }),
    );
    expect(result).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: assignedFixture.enrollmentId,
      nextLearningPathId: PATH_IDS.next,
      readiness: {
        status: "ASSIGNED",
        currentCycleCompleted: true,
        nextCycleAvailable: true,
      },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: assignedFixture.actor.tenantId,
          studentId: assignedFixture.actor.userId,
          routeStatus: "ACTIVE",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.studentLearningPath.findUnique({
        where: { id: assignedFixture.enrollmentId },
        select: { routeStatus: true },
      }),
    ).toEqual({ routeStatus: "COMPLETED" });
    expect(
      await prisma.studentLearningPath.findUnique({
        where: {
          tenantId_studentId_learningPathId: {
            tenantId: assignedFixture.actor.tenantId,
            studentId: assignedFixture.actor.userId,
            learningPathId: PATH_IDS.next,
          },
        },
        select: { routeStatus: true },
      }),
    ).toEqual({ routeStatus: "ACTIVE" });

    const replay = await withPublicationApproval(() =>
      reconcileP1ToNextCycle(assignedFixture.actor, {
        p1LearningPathId: assignedFixture.enrollmentId,
      }),
    );
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      nextLearningPathId: PATH_IDS.next,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: assignedFixture.actor.tenantId,
          studentId: assignedFixture.actor.userId,
          routeStatus: "ACTIVE",
        },
      }),
    ).toBe(1);
  });

  it("recovers a completed current cycle when the next enrollment was not created", async () => {
    await prisma.studentLearningStepProgress.deleteMany({
      where: {
        tenantId: recoveryFixture.actor.tenantId,
        studentId: recoveryFixture.actor.userId,
      },
    });
    await prisma.studentLessonProgress.deleteMany({
      where: {
        tenantId: recoveryFixture.actor.tenantId,
        studentId: recoveryFixture.actor.userId,
      },
    });
    await prisma.exerciseSession.deleteMany({
      where: {
        tenantId: recoveryFixture.actor.tenantId,
        studentId: recoveryFixture.actor.userId,
      },
    });
    await prisma.assessmentResult.deleteMany({
      where: {
        tenantId: recoveryFixture.actor.tenantId,
        studentId: recoveryFixture.actor.userId,
      },
    });
    await prisma.studentLearningPath.update({
      where: { id: recoveryFixture.enrollmentId },
      data: { routeStatus: "COMPLETED", completedAt: new Date() },
    });
    const beforeProgress = await prisma.studentLearningStepProgress.count({
      where: {
        tenantId: recoveryFixture.actor.tenantId,
        studentId: recoveryFixture.actor.userId,
      },
    });

    const result = await withPublicationApproval(() =>
      reconcileP1ToNextCycle(recoveryFixture.actor, {
        // The browser learning-path projection sends LearningPath.id. The
        // service must resolve that to this student's enrollment safely.
        p1LearningPathId: PATH_IDS.initial,
      }),
    );

    expect(result).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: recoveryFixture.enrollmentId,
      nextLearningPathId: PATH_IDS.next,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });
    expect(
      await prisma.studentLearningPath.findUnique({
        where: { id: recoveryFixture.enrollmentId },
        select: { routeStatus: true },
      }),
    ).toEqual({ routeStatus: "COMPLETED" });
    expect(
      await prisma.studentLearningStepProgress.count({
        where: {
          tenantId: recoveryFixture.actor.tenantId,
          studentId: recoveryFixture.actor.userId,
        },
      }),
    ).toBe(beforeProgress);

    const replay = await withPublicationApproval(() =>
      reconcileP1ToNextCycle(recoveryFixture.actor, {
        p1LearningPathId: PATH_IDS.initial,
      }),
    );
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      nextLearningPathId: PATH_IDS.next,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
  });

  it("does not reactivate reassigned, paused, or review-required next cycles", async () => {
    for (const routeStatus of ["REASSIGNED", "PAUSED", "REVIEW_REQUIRED"] as const) {
      await prisma.studentLearningPath.update({
        where: { id: blockedNextEnrollmentId },
        data: { routeStatus },
      });
      const result = await withPublicationApproval(() =>
        reconcileP1ToNextCycle(blockedFixture.actor, {
          p1LearningPathId: blockedFixture.enrollmentId,
        }),
      );
      expect(result).toMatchObject({
        outcome: "REVIEW_REQUIRED",
        nextLearningPathId: null,
        readiness: {
          status: "NEXT_CYCLE_UNAVAILABLE",
          currentCycleCompleted: true,
          nextCycleAvailable: false,
        },
      });
      expect(
        await prisma.studentLearningPath.findUnique({
          where: { id: blockedFixture.enrollmentId },
          select: { routeStatus: true },
        }),
      ).toEqual({ routeStatus: "ACTIVE" });
      expect(
        await prisma.studentLearningPath.findUnique({
          where: { id: blockedNextEnrollmentId },
          select: { routeStatus: true },
        }),
      ).toEqual({ routeStatus });
    }
  });

  it("keeps concurrent approved retries at one active route", async () => {
    const results = await withPublicationApproval(() =>
      Promise.all([
        reconcileP1ToNextCycle(concurrentFixture.actor, {
          p1LearningPathId: concurrentFixture.enrollmentId,
        }),
        reconcileP1ToNextCycle(concurrentFixture.actor, {
          p1LearningPathId: concurrentFixture.enrollmentId,
        }),
      ]),
    );
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "ALREADY_ASSIGNED",
      "ASSIGNED",
    ]);
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: concurrentFixture.actor.tenantId,
          studentId: concurrentFixture.actor.userId,
          routeStatus: "ACTIVE",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.studentLearningPath.findUnique({
        where: { id: concurrentFixture.enrollmentId },
        select: { routeStatus: true },
      }),
    ).toEqual({ routeStatus: "COMPLETED" });
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

  it("fails closed when a published next template has no valid runtime config", async () => {
    const nextStep = await prisma.learningStep.findFirstOrThrow({
      where: {
        unit: { pathId: PATH_IDS.next },
        exerciseTemplateVersionId: { not: null },
      },
      select: {
        id: true,
        exerciseTemplateVersionId: true,
      },
    });
    const invalidArtifact = await createPublishedArtifact("TEMPLATE", 99, {
      schemaVersion: 1,
    });
    await prisma.learningStep.update({
      where: { id: nextStep.id },
      data: { exerciseTemplateVersionId: invalidArtifact.exerciseTemplateVersionId },
    });

    try {
      const result = await withPublicationApproval(() =>
        reconcileP1ToNextCycle(unavailableFixture.actor, {
          p1LearningPathId: unavailableFixture.enrollmentId,
        }),
      );
      expect(result).toMatchObject({
        outcome: "REVIEW_REQUIRED",
        readiness: { status: "NEXT_CYCLE_UNAVAILABLE", currentCycleCompleted: true },
      });
      expect(
        await prisma.studentLearningPath.count({
          where: {
            tenantId: unavailableFixture.actor.tenantId,
            studentId: unavailableFixture.actor.userId,
            learningPathId: PATH_IDS.next,
          },
        }),
      ).toBe(0);
    } finally {
      await prisma.learningStep.update({
        where: { id: nextStep.id },
        data: { exerciseTemplateVersionId: nextStep.exerciseTemplateVersionId },
      });
    }
  });
});
