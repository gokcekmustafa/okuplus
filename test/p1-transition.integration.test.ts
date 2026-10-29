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
  completeLearningStepForSession,
} from "../src/modules/learning-path/service.js";
import { learningRouteCycle } from "../src/curriculum/learning-route-catalog.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_ID,
} from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import {
  getEducationV2P1ACycle,
  getEducationV2P1ACycle5To8,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
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

const PATH_IDS = {
  initial: id(1),
  next: id(2),
  third: id(3),
  fourth: id(4),
  fifth: id(5),
  sixth: id(6),
  seventh: id(7),
  eighth: id(8),
  cycle20: id(20),
  cycle21: id(21),
  cycle28: id(28),
  cycle29: id(29),
  cycle32: id(32),
  cycle33: id(33),
  cycle36: id(36),
  cycle37: id(37),
  cycle40: id(40),
  cycle41: id(41),
  cycle44: id(44),
  cycle45: id(45),
  cycle48: id(48),
  cycle49: id(49),
};
const ACTOR_EMAILS = [
  "p1-transition-1@example.test",
  "p1-transition-2@example.test",
  "p1-transition-3@example.test",
  "p1-transition-4@example.test",
  "p1-transition-5@example.test",
  "p1-transition-6@example.test",
  "p1-transition-7@example.test",
  "p1-transition-8@example.test",
  "p1-transition-9@example.test",
  "p1-transition-10@example.test",
  "p1-transition-11@example.test",
  "p1-transition-12@example.test",
  "p1-transition-13@example.test",
  "p1-transition-14@example.test",
  "p1-transition-15@example.test",
  "p1-transition-16@example.test",
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
  cycle3: id(19),
  cycle20: id(22),
  cycle28: id(23),
  cycle32: id(24),
  cycle36: id(25),
  cycle40: id(26),
  cycle44: id(27),
  cycle48: id(28),
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
  cycle3: "",
  cycle20: "",
  cycle28: "",
  cycle32: "",
  cycle36: "",
  cycle40: "",
  cycle44: "",
  cycle48: "",
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
      const sourceExercise = sourceStep.exerciseKey
        ? program.exercises.find((exercise) => exercise.key === sourceStep.exerciseKey)
        : undefined;
      if (expected.exercise && !sourceExercise) {
        throw new Error(`Missing fixture exercise: ${sourceStep.exerciseKey ?? sourceStep.key}`);
      }
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
              sourceExercise?.contract,
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
  assessmentScore = 1,
  testOffset = 0,
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
                  : fixture.actor.userId === ACTOR_IDS.cycle3
                    ? 1000
                    : fixture.actor.userId === ACTOR_IDS.cycle20
                      ? 1500
                      : fixture.actor.userId === ACTOR_IDS.cycle28
                        ? 3000
                        : fixture.actor.userId === ACTOR_IDS.cycle32
                          ? 5000
                          : fixture.actor.userId === ACTOR_IDS.cycle36
                            ? 7000
                            : fixture.actor.userId === ACTOR_IDS.cycle40
                              ? 9000
                              : fixture.actor.userId === ACTOR_IDS.cycle44
                                ? 20_000
                                : fixture.actor.userId === ACTOR_IDS.cycle48
                                  ? 40_000
                                  : 0;
  const uniqueFixtureOffset = fixtureOffset + testOffset;
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
          id: id(900 + uniqueFixtureOffset + index),
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
          id: id(1000 + uniqueFixtureOffset),
          tenantId: fixture.actor.tenantId,
          studentId: fixture.actor.userId,
          assessmentId: step.assessmentId,
          score: assessmentScore,
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
  let cycle3Fixture: ActorFixture;
  let cycle20Fixture: ActorFixture;
  let cycle28Fixture: ActorFixture;
  let cycle32Fixture: ActorFixture;
  let cycle36Fixture: ActorFixture;
  let cycle40Fixture: ActorFixture;
  let cycle44Fixture: ActorFixture;
  let cycle48Fixture: ActorFixture;
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
    await createPath(
      PATH_IDS.fourth,
      EDUCATION_V2_P1_A_CYCLE_4_ID,
      EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
    );
    const cycle20 = getEducationV2P1ACycle(20)!;
    const cycle21 = getEducationV2P1ACycle(21)!;
    const cycle28 = getEducationV2P1ACycle(28)!;
    const cycle29 = getEducationV2P1ACycle(29)!;
    const cycle32 = getEducationV2P1ACycle(32)!;
    const cycle33 = getEducationV2P1ACycle(33)!;
    const cycle36 = getEducationV2P1ACycle(36)!;
    const cycle37 = getEducationV2P1ACycle(37)!;
    const cycle40 = getEducationV2P1ACycle(40)!;
    const cycle41 = getEducationV2P1ACycle(41)!;
    const cycle44 = getEducationV2P1ACycle(44)!;
    const cycle45 = getEducationV2P1ACycle(45)!;
    const cycle48 = getEducationV2P1ACycle(48)!;
    const cycle49 = getEducationV2P1ACycle(49)!;
    await createPath(PATH_IDS.cycle20, cycle20.program.programId, cycle20.program);
    await createPath(PATH_IDS.cycle21, cycle21.program.programId, cycle21.program);
    await createPath(PATH_IDS.cycle28, cycle28.program.programId, cycle28.program);
    await createPath(PATH_IDS.cycle29, cycle29.program.programId, cycle29.program);
    await createPath(PATH_IDS.cycle32, cycle32.program.programId, cycle32.program);
    await createPath(PATH_IDS.cycle33, cycle33.program.programId, cycle33.program);
    await createPath(PATH_IDS.cycle36, cycle36.program.programId, cycle36.program);
    await createPath(PATH_IDS.cycle37, cycle37.program.programId, cycle37.program);
    await createPath(PATH_IDS.cycle40, cycle40.program.programId, cycle40.program);
    await createPath(PATH_IDS.cycle41, cycle41.program.programId, cycle41.program);
    await createPath(PATH_IDS.cycle44, cycle44.program.programId, cycle44.program);
    await createPath(PATH_IDS.cycle45, cycle45.program.programId, cycle45.program);
    await createPath(PATH_IDS.cycle48, cycle48.program.programId, cycle48.program);
    await createPath(PATH_IDS.cycle49, cycle49.program.programId, cycle49.program);
    completeFixture = await createActor(ACTOR_IDS.complete, ACTOR_EMAILS[0]!, "complete");
    incompleteFixture = await createActor(ACTOR_IDS.incomplete, ACTOR_EMAILS[1]!, "incomplete");
    unavailableFixture = await createActor(ACTOR_IDS.unavailable, ACTOR_EMAILS[2]!, "unavailable");
    assignedFixture = await createActor(ACTOR_IDS.assigned, ACTOR_EMAILS[3]!, "assigned");
    blockedFixture = await createActor(ACTOR_IDS.blocked, ACTOR_EMAILS[4]!, "blocked");
    concurrentFixture = await createActor(ACTOR_IDS.concurrent, ACTOR_EMAILS[5]!, "concurrent");
    recoveryFixture = await createActor(ACTOR_IDS.recovery, ACTOR_EMAILS[6]!, "recovery");
    cycle2Fixture = await createActor(ACTOR_IDS.cycle2, ACTOR_EMAILS[7]!, "cycle2", PATH_IDS.next);
    cycle3Fixture = await createActor(ACTOR_IDS.cycle3, ACTOR_EMAILS[8]!, "cycle3", PATH_IDS.third);
    cycle20Fixture = await createActor(
      ACTOR_IDS.cycle20,
      ACTOR_EMAILS[9]!,
      "cycle20",
      PATH_IDS.cycle20,
    );
    cycle28Fixture = await createActor(
      ACTOR_IDS.cycle28,
      ACTOR_EMAILS[10]!,
      "cycle28",
      PATH_IDS.cycle28,
    );
    cycle32Fixture = await createActor(
      ACTOR_IDS.cycle32,
      ACTOR_EMAILS[11]!,
      "cycle32",
      PATH_IDS.cycle32,
    );
    cycle36Fixture = await createActor(
      ACTOR_IDS.cycle36,
      ACTOR_EMAILS[12]!,
      "cycle36",
      PATH_IDS.cycle36,
    );
    cycle40Fixture = await createActor(
      ACTOR_IDS.cycle40,
      ACTOR_EMAILS[13]!,
      "cycle40",
      PATH_IDS.cycle40,
    );
    cycle44Fixture = await createActor(
      ACTOR_IDS.cycle44,
      ACTOR_EMAILS[14]!,
      "cycle44",
      PATH_IDS.cycle44,
    );
    cycle48Fixture = await createActor(
      ACTOR_IDS.cycle48,
      ACTOR_EMAILS[15]!,
      "cycle48",
      PATH_IDS.cycle48,
    );
    await completeInitialCycle(completeFixture, true);
    await completeInitialCycle(incompleteFixture, false);
    await completeInitialCycle(unavailableFixture, true);
    await completeInitialCycle(assignedFixture, true);
    await completeInitialCycle(blockedFixture, true);
    await completeInitialCycle(concurrentFixture, true);
    await completeInitialCycle(recoveryFixture, true);
    await completeInitialCycle(cycle2Fixture, true, PATH_IDS.next, 0.4);
    await prisma.studentLearningPath.createMany({
      data: [PATH_IDS.initial, PATH_IDS.next].map((learningPathId) => ({
        tenantId: cycle3Fixture.actor.tenantId,
        studentId: cycle3Fixture.actor.userId,
        learningPathId,
        routeStatus: "COMPLETED" as const,
        completedAt: new Date(),
      })),
    });
    await completeInitialCycle(cycle3Fixture, true, PATH_IDS.initial, 1);
    await completeInitialCycle(cycle3Fixture, true, PATH_IDS.next, 1, 100);
    await completeInitialCycle(cycle3Fixture, true, PATH_IDS.third, 1, 200);
    await completeInitialCycle(cycle20Fixture, true, PATH_IDS.cycle20, 1);
    await completeInitialCycle(cycle28Fixture, true, PATH_IDS.cycle28, 1);
    await completeInitialCycle(cycle32Fixture, true, PATH_IDS.cycle32);
    await completeInitialCycle(cycle36Fixture, true, PATH_IDS.cycle36);
    await completeInitialCycle(cycle40Fixture, true, PATH_IDS.cycle40);
    await completeInitialCycle(cycle44Fixture, true, PATH_IDS.cycle44);
    await completeInitialCycle(cycle48Fixture, true, PATH_IDS.cycle48);
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
      const assessmentStep = await prisma.learningStep.findFirstOrThrow({
        where: { unit: { pathId: PATH_IDS.next }, type: "ASSESSMENT" },
        select: { id: true, assessmentId: true },
      });
      await completeLearningStepForSession(cycle2Fixture.actor, {
        templateVersionId: "cycle-2-assessment",
        assessmentId: assessmentStep.assessmentId,
        learningStepId: assessmentStep.id,
      });
      const beforeProgress = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle2Fixture.actor.tenantId, studentId: cycle2Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const beforeResults = await prisma.assessmentResult.findMany({
        where: { tenantId: cycle2Fixture.actor.tenantId, studentId: cycle2Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const preview = await getStudentLearningPath(cycle2Fixture.actor);
      const completedCycle2 = preview?.paths.find(
        (projection) => projection.path.code === EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.code,
      );
      expect(completedCycle2?.nodes.every((node) => node.status === "completed")).toBe(true);
      expect(
        completedCycle2?.nodes.find((node) => node.type === "ASSESSMENT")?.progress?.accuracy,
      ).toBe(0.4);
      expect(preview?.routeContinuation?.futureCycles[0]).toMatchObject({
        pathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
        stationCount: 7,
        publicationApproved: true,
        graphAvailable: true,
      });
      expect(preview?.upcomingPaths).toHaveLength(2);
      expect(preview?.upcomingPaths[0]?.path.code).toBe(
        EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
      );
      expect(preview?.upcomingPaths[0]?.nodes).toHaveLength(7);
      expect(
        preview?.upcomingPaths[0]?.nodes.every(
          (node) => node.status === "locked" && !node.isCurrent,
        ),
      ).toBe(true);
      expect(preview?.upcomingPaths[1]?.path.code).toBe(
        EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.code,
      );
      expect(preview?.upcomingPaths[1]?.nodes).toHaveLength(5);
      expect(
        preview?.upcomingPaths[1]?.nodes.every(
          (node) => node.status === "locked" && node.availability === "READY",
        ),
      ).toBe(true);
      const plannedNodes = preview?.plannedPaths?.flatMap((path) => path.nodes) ?? [];
      expect(plannedNodes.length).toBeGreaterThan(0);
      expect(18 + 7 + 5 + plannedNodes.length).toBe(300);
      expect(plannedNodes[0]).toMatchObject({
        learningPathCode: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_5_G8_12",
        status: "locked",
        availability: "UNAVAILABLE",
        planningStatus: "GRAPH_NOT_AVAILABLE",
      });
      expect(
        plannedNodes.every(
          (node) =>
            node.status === "locked" &&
            node.availability === "UNAVAILABLE" &&
            node.contentVersionId === null &&
            node.templateVersionId === null &&
            node.assessmentId === null,
        ),
      ).toBe(true);
      expect(JSON.stringify(plannedNodes)).not.toMatch(/questions|correctOptionId|explanation/iu);
      await expect(
        assertLearningStepAccessible(cycle2Fixture.actor, plannedNodes[0]!.id),
      ).rejects.toThrow();
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
      expect(
        await resolveP1CycleTransitionStep(cycle2Fixture.actor, {
          learningStepId: null,
          assessmentId: assessmentStep.assessmentId,
        }),
      ).toEqual({ learningStepId: assessmentStep.id, learningPathId: PATH_IDS.next });
    });
  });

  it("continues a completed Cycle 3 student into the real Cycle 4 station 48 and preserves history", async () => {
    await withPublicationApproval(async () => {
      const assessmentStep = await prisma.learningStep.findFirstOrThrow({
        where: { unit: { pathId: PATH_IDS.third }, type: "ASSESSMENT" },
        select: { id: true, assessmentId: true },
      });
      await completeLearningStepForSession(cycle3Fixture.actor, {
        templateVersionId: "cycle-3-assessment",
        assessmentId: assessmentStep.assessmentId,
        learningStepId: assessmentStep.id,
      });
      const beforeProgress = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const beforeResults = await prisma.assessmentResult.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const preview = await getStudentLearningPath(cycle3Fixture.actor);
      expect(preview?.paths.map((item) => item.path.cycleSequence)).toEqual([1, 2, 3]);
      expect(
        preview?.paths
          .slice(0, 2)
          .flatMap((item) => item.nodes)
          .every((node) => node.status === "completed"),
      ).toBe(true);
      expect(preview?.routeContinuation?.futureCycles[0]).toMatchObject({
        pathCode: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.code,
        stationCount: 5,
        publicationApproved: true,
        graphAvailable: true,
      });
      expect(preview?.upcomingPaths).toHaveLength(1);
      expect(preview?.upcomingPaths[0]?.nodes).toHaveLength(5);
      expect(
        preview?.upcomingPaths[0]?.nodes.every(
          (node) => node.status === "locked" && node.availability === "READY",
        ),
      ).toBe(true);

      const firstCycle4Step = preview!.upcomingPaths[0]!.nodes[0]!;
      const assignment = await reconcileP1ToNextCycle(cycle3Fixture.actor, {
        p1LearningPathId: PATH_IDS.third,
      });
      expect(assignment.outcome).toBe("ASSIGNED");
      const after = await getStudentLearningPath(cycle3Fixture.actor);
      expect(after?.paths.map((item) => item.path.cycleSequence)).toEqual([1, 2, 3, 4]);
      expect(
        after?.paths
          .slice(0, 3)
          .flatMap((item) => item.nodes)
          .every((node) => node.status === "completed"),
      ).toBe(true);
      expect(after?.paths[3]?.nodes[0]).toMatchObject({
        id: firstCycle4Step.id,
        status: "active",
        availability: "READY",
      });
      expect(after?.paths[3]?.nodes[0]?.contentVersionId).toBeTruthy();
      expect(after?.paths[3]?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);

      const retry = await reconcileP1ToNextCycle(cycle3Fixture.actor, {
        p1LearningPathId: PATH_IDS.third,
      });
      expect(retry.outcome).toBe("ALREADY_ASSIGNED");
      expect(
        await prisma.studentLearningStepProgress.findMany({
          where: {
            tenantId: cycle3Fixture.actor.tenantId,
            studentId: cycle3Fixture.actor.userId,
          },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeProgress);
      expect(
        await prisma.assessmentResult.findMany({
          where: {
            tenantId: cycle3Fixture.actor.tenantId,
            studentId: cycle3Fixture.actor.userId,
          },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeResults);

      const progressAfterAssignment = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      await completeLearningStepForSession(cycle3Fixture.actor, {
        templateVersionId: firstCycle4Step.templateVersionId!,
        assessmentId: null,
        learningStepId: firstCycle4Step.id,
      });
      const afterStation48 = await getStudentLearningPath(cycle3Fixture.actor);
      expect(afterStation48?.paths[3]?.nodes[0]).toMatchObject({
        id: firstCycle4Step.id,
        status: "completed",
      });
      expect(afterStation48?.paths[3]?.nodes[1]).toMatchObject({
        status: "active",
        availability: "READY",
      });
      const progressAfterStation48 = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      expect(
        progressAfterStation48.filter((item) =>
          progressAfterAssignment.some((previous) => previous.id === item.id),
        ),
      ).toEqual(progressAfterAssignment);
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
        id: id(10_000),
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

  it("moves a completed 52-station route to usable station 53 and preserves prior progress", async () => {
    await withPublicationApproval(async () => {
      const getCycle4 = async () => {
        const path = await getStudentLearningPath(cycle3Fixture.actor);
        return path?.paths.find((item) => item.path.cycleSequence === 4);
      };

      for (let index = 1; index < 5; index += 1) {
        const cycle4 = await getCycle4();
        const node = cycle4?.nodes[index];
        expect(node?.status).toBe("active");
        if (node?.type === "ASSESSMENT") {
          await prisma.assessmentResult.create({
            data: {
              id: id(1800 + index),
              tenantId: cycle3Fixture.actor.tenantId,
              studentId: cycle3Fixture.actor.userId,
              assessmentId: node.assessmentId!,
              score: 1,
              metrics: { source: "synthetic-integration-test" },
            },
          });
        }
        await completeLearningStepForSession(cycle3Fixture.actor, {
          templateVersionId: node?.templateVersionId ?? "cycle-4-assessment",
          assessmentId: node?.type === "ASSESSMENT" ? node.assessmentId : null,
          learningStepId: node?.id,
        });
        const afterStep = await getCycle4();
        expect(afterStep?.nodes[index]?.status).toBe("completed");
        if (index < 4) expect(afterStep?.nodes[index + 1]?.status).toBe("active");
      }

      const beforeProgress = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const cycle5 = getEducationV2P1ACycle5To8(5)!;
      await createPath(PATH_IDS.fifth, cycle5.program.programId, cycle5.program);
      for (const [sequence, pathId] of [
        [6, PATH_IDS.sixth],
        [7, PATH_IDS.seventh],
        [8, PATH_IDS.eighth],
      ] as const) {
        const cycle = getEducationV2P1ACycle5To8(sequence)!;
        await createPath(pathId, cycle.program.programId, cycle.program);
      }

      const assignment = await reconcileP1ToNextCycle(cycle3Fixture.actor, {
        p1LearningPathId: PATH_IDS.fourth,
      });
      expect(assignment).toMatchObject({
        outcome: "ASSIGNED",
        nextLearningPathId: PATH_IDS.fifth,
        readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
      });

      const afterAssignment = await getStudentLearningPath(cycle3Fixture.actor);
      expect(afterAssignment?.paths.map((item) => item.path.cycleSequence)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(afterAssignment?.paths[3]?.nodes.every((node) => node.status === "completed")).toBe(
        true,
      );
      expect(afterAssignment?.paths[4]?.nodes[0]).toMatchObject({
        label: cycle5.program.path.units[0]!.steps[0]!.title,
        status: "active",
        availability: "READY",
      });
      expect(
        afterAssignment?.paths[4]?.nodes.slice(1).every((node) => node.status === "locked"),
      ).toBe(true);
      expect(
        await prisma.studentLearningStepProgress.findMany({
          where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeProgress);

      const station53 = afterAssignment!.paths[4]!.nodes[0]!;
      await completeLearningStepForSession(cycle3Fixture.actor, {
        templateVersionId: station53.templateVersionId!,
        assessmentId: null,
        learningStepId: station53.id,
      });
      const afterStation53 = await getStudentLearningPath(cycle3Fixture.actor);
      expect(afterStation53?.paths[4]?.nodes[0]?.status).toBe("completed");
      expect(afterStation53?.paths[4]?.nodes[1]).toMatchObject({
        status: "active",
        availability: "READY",
      });
      const afterProgress = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      expect(
        afterProgress.filter((row) => beforeProgress.some((before) => before.id === row.id)),
      ).toEqual(beforeProgress);

      const pathIdBySequence = new Map<number, string>([
        [5, PATH_IDS.fifth],
        [6, PATH_IDS.sixth],
        [7, PATH_IDS.seventh],
        [8, PATH_IDS.eighth],
      ]);
      for (const sequence of [5, 6, 7, 8]) {
        const pathId = pathIdBySequence.get(sequence)!;
        for (let stepIndex = sequence === 5 ? 1 : 0; stepIndex < 5; stepIndex += 1) {
          const snapshot = await getStudentLearningPath(cycle3Fixture.actor);
          const cyclePath = snapshot?.paths.find((path) => path.path.cycleSequence === sequence);
          const node = cyclePath?.nodes[stepIndex];
          expect(node?.status).toBe("active");
          if (node?.type === "ASSESSMENT") {
            await prisma.assessmentResult.create({
              data: {
                id: id(2000 + sequence * 10 + stepIndex),
                tenantId: cycle3Fixture.actor.tenantId,
                studentId: cycle3Fixture.actor.userId,
                assessmentId: node.assessmentId!,
                score: 1,
                metrics: { source: "synthetic-integration-test" },
              },
            });
          }
          await completeLearningStepForSession(cycle3Fixture.actor, {
            templateVersionId: node?.templateVersionId ?? `cycle-${sequence}-assessment`,
            assessmentId: node?.type === "ASSESSMENT" ? node.assessmentId : null,
            learningStepId: node?.id,
          });
          const afterStep = await getStudentLearningPath(cycle3Fixture.actor);
          const updatedCycle = afterStep?.paths.find(
            (path) => path.path.cycleSequence === sequence,
          );
          expect(updatedCycle?.nodes[stepIndex]?.status).toBe("completed");
          if (stepIndex < 4) expect(updatedCycle?.nodes[stepIndex + 1]?.status).toBe("active");
        }

        if (sequence < 8) {
          const progressBeforeTransition = await prisma.studentLearningStepProgress.findMany({
            where: {
              tenantId: cycle3Fixture.actor.tenantId,
              studentId: cycle3Fixture.actor.userId,
            },
            orderBy: { id: "asc" },
          });
          const transition = await reconcileP1ToNextCycle(cycle3Fixture.actor, {
            p1LearningPathId: pathId,
          });
          expect(transition).toMatchObject({
            outcome: "ASSIGNED",
            nextLearningPathId: pathIdBySequence.get(sequence + 1),
            readiness: { currentCycleCompleted: true, nextCycleAvailable: true },
          });
          const afterTransition = await getStudentLearningPath(cycle3Fixture.actor);
          const nextPath = afterTransition?.paths.find(
            (path) => path.path.cycleSequence === sequence + 1,
          );
          expect(nextPath?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
          const progressAfterTransition = await prisma.studentLearningStepProgress.findMany({
            where: {
              tenantId: cycle3Fixture.actor.tenantId,
              studentId: cycle3Fixture.actor.userId,
            },
            orderBy: { id: "asc" },
          });
          expect(
            progressAfterTransition.filter((row) =>
              progressBeforeTransition.some((before) => before.id === row.id),
            ),
          ).toEqual(progressBeforeTransition);
        }
      }

      const progressBeforeFinalTransition = await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
        orderBy: { id: "asc" },
      });
      const finalTransition = await reconcileP1ToNextCycle(cycle3Fixture.actor, {
        p1LearningPathId: PATH_IDS.eighth,
      });
      const cycle9 = learningRouteCycle("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_9_G8_12");
      expect(cycle9?.publicationApproved()).toBe(true);
      expect(finalTransition).toMatchObject({
        outcome: "REVIEW_REQUIRED",
        readiness: { status: "NEXT_CYCLE_UNAVAILABLE", currentCycleCompleted: true },
      });
      expect(
        await prisma.studentLearningPath.count({
          where: {
            tenantId: cycle3Fixture.actor.tenantId,
            studentId: cycle3Fixture.actor.userId,
            learningPath: { code: cycle9!.pathCode },
          },
        }),
      ).toBe(0);
      expect(
        await prisma.studentLearningStepProgress.findMany({
          where: { tenantId: cycle3Fixture.actor.tenantId, studentId: cycle3Fixture.actor.userId },
          orderBy: { id: "asc" },
        }),
      ).toEqual(progressBeforeFinalTransition);
    });
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

  it("assigns the real Cycle 21 graph after completed station 132, opening station 133 once", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle20Fixture.actor.tenantId, studentId: cycle20Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle20Fixture.actor.tenantId, studentId: cycle20Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const completedPath = await getStudentLearningPath(cycle20Fixture.actor);
    expect(completedPath?.paths.find((path) => path.path.cycleSequence === 20)?.nodes).toHaveLength(
      5,
    );
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 20)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle20Fixture.actor, {
      p1LearningPathId: cycle20Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle20Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle21,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle20Fixture.actor);
    const station133Path = after?.paths.find((path) => path.path.cycleSequence === 21);
    expect(station133Path?.nodes).toHaveLength(5);
    expect(station133Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station133Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);
    expect(
      after?.paths
        .find((path) => path.path.cycleSequence === 20)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const replay = await reconcileP1ToNextCycle(cycle20Fixture.actor, {
      p1LearningPathId: cycle20Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle20Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle21,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle20Fixture.actor.tenantId,
          studentId: cycle20Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle21,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle20Fixture.actor.tenantId, studentId: cycle20Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle20Fixture.actor.tenantId, studentId: cycle20Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });

  it("assigns Cycle 29 after completed station 172, opening station 173 once", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle28Fixture.actor.tenantId, studentId: cycle28Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle28Fixture.actor.tenantId, studentId: cycle28Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const completedPath = await getStudentLearningPath(cycle28Fixture.actor);
    expect(completedPath?.paths.find((path) => path.path.cycleSequence === 28)?.nodes).toHaveLength(
      5,
    );
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 28)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle28Fixture.actor, {
      p1LearningPathId: cycle28Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle28Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle29,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle28Fixture.actor);
    const station173Path = after?.paths.find((path) => path.path.cycleSequence === 29);
    expect(station173Path?.nodes).toHaveLength(5);
    expect(station173Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station173Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);

    const replay = await reconcileP1ToNextCycle(cycle28Fixture.actor, {
      p1LearningPathId: cycle28Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle28Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle29,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle28Fixture.actor.tenantId,
          studentId: cycle28Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle29,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle28Fixture.actor.tenantId, studentId: cycle28Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle28Fixture.actor.tenantId, studentId: cycle28Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });

  it("assigns the approved Cycle 33 graph after completed station 192 without opening a session", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle32Fixture.actor.tenantId, studentId: cycle32Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle32Fixture.actor.tenantId, studentId: cycle32Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeSessions = await prisma.exerciseSession.count({
      where: { tenantId: cycle32Fixture.actor.tenantId, studentId: cycle32Fixture.actor.userId },
    });
    const completedPath = await getStudentLearningPath(cycle32Fixture.actor);
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 32)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle32Fixture.actor, {
      p1LearningPathId: cycle32Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle32Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle33,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle32Fixture.actor);
    const station193Path = after?.paths.find((path) => path.path.cycleSequence === 33);
    expect(station193Path?.nodes).toHaveLength(5);
    expect(station193Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station193Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);

    const replay = await reconcileP1ToNextCycle(cycle32Fixture.actor, {
      p1LearningPathId: cycle32Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle32Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle33,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle32Fixture.actor.tenantId,
          studentId: cycle32Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle33,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.exerciseSession.count({
        where: { tenantId: cycle32Fixture.actor.tenantId, studentId: cycle32Fixture.actor.userId },
      }),
    ).toBe(beforeSessions);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle32Fixture.actor.tenantId, studentId: cycle32Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle32Fixture.actor.tenantId, studentId: cycle32Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });

  it("assigns the approved Cycle 37 graph after completed station 212 without opening a session", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle36Fixture.actor.tenantId, studentId: cycle36Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle36Fixture.actor.tenantId, studentId: cycle36Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeSessions = await prisma.exerciseSession.count({
      where: { tenantId: cycle36Fixture.actor.tenantId, studentId: cycle36Fixture.actor.userId },
    });
    const completedPath = await getStudentLearningPath(cycle36Fixture.actor);
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 36)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle36Fixture.actor, {
      p1LearningPathId: cycle36Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle36Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle37,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle36Fixture.actor);
    const station213Path = after?.paths.find((path) => path.path.cycleSequence === 37);
    expect(station213Path?.nodes).toHaveLength(5);
    expect(station213Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station213Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);

    const replay = await reconcileP1ToNextCycle(cycle36Fixture.actor, {
      p1LearningPathId: cycle36Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle36Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle37,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle36Fixture.actor.tenantId,
          studentId: cycle36Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle37,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.exerciseSession.count({
        where: { tenantId: cycle36Fixture.actor.tenantId, studentId: cycle36Fixture.actor.userId },
      }),
    ).toBe(beforeSessions);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle36Fixture.actor.tenantId, studentId: cycle36Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle36Fixture.actor.tenantId, studentId: cycle36Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });

  it("assigns Cycle 41 after completed station 232 with station 233 active and no history changes", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle40Fixture.actor.tenantId, studentId: cycle40Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle40Fixture.actor.tenantId, studentId: cycle40Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeSessions = await prisma.exerciseSession.count({
      where: { tenantId: cycle40Fixture.actor.tenantId, studentId: cycle40Fixture.actor.userId },
    });
    const completedPath = await getStudentLearningPath(cycle40Fixture.actor);
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 40)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle40Fixture.actor, {
      p1LearningPathId: cycle40Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle40Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle41,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle40Fixture.actor);
    const station233Path = after?.paths.find((path) => path.path.cycleSequence === 41);
    expect(station233Path?.nodes).toHaveLength(5);
    expect(station233Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station233Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);

    const replay = await reconcileP1ToNextCycle(cycle40Fixture.actor, {
      p1LearningPathId: cycle40Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle40Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle41,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle40Fixture.actor.tenantId,
          studentId: cycle40Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle41,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.exerciseSession.count({
        where: { tenantId: cycle40Fixture.actor.tenantId, studentId: cycle40Fixture.actor.userId },
      }),
    ).toBe(beforeSessions);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle40Fixture.actor.tenantId, studentId: cycle40Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle40Fixture.actor.tenantId, studentId: cycle40Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });

  it("assigns Cycle 45 after completed station 252 with station 253 active and no history changes", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle44Fixture.actor.tenantId, studentId: cycle44Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle44Fixture.actor.tenantId, studentId: cycle44Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeSessions = await prisma.exerciseSession.count({
      where: { tenantId: cycle44Fixture.actor.tenantId, studentId: cycle44Fixture.actor.userId },
    });
    const completedPath = await getStudentLearningPath(cycle44Fixture.actor);
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 44)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle44Fixture.actor, {
      p1LearningPathId: cycle44Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle44Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle45,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle44Fixture.actor);
    const station253Path = after?.paths.find((path) => path.path.cycleSequence === 45);
    expect(station253Path?.nodes).toHaveLength(5);
    expect(station253Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station253Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);
    const station253 = station253Path!.nodes[0]!;
    await expect(
      assertLearningStepAccessible(cycle44Fixture.actor, station253.id),
    ).resolves.toMatchObject({
      id: station253.id,
      status: "active",
      availability: "READY",
    });

    const replay = await reconcileP1ToNextCycle(cycle44Fixture.actor, {
      p1LearningPathId: cycle44Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle44Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle45,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle44Fixture.actor.tenantId,
          studentId: cycle44Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle45,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.exerciseSession.count({
        where: { tenantId: cycle44Fixture.actor.tenantId, studentId: cycle44Fixture.actor.userId },
      }),
    ).toBe(beforeSessions);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle44Fixture.actor.tenantId, studentId: cycle44Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle44Fixture.actor.tenantId, studentId: cycle44Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });

  it("assigns Cycle 49 after completed station 272 with station 273 active and no history changes", async () => {
    const beforeProgress = await prisma.studentLearningStepProgress.findMany({
      where: { tenantId: cycle48Fixture.actor.tenantId, studentId: cycle48Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeResults = await prisma.assessmentResult.findMany({
      where: { tenantId: cycle48Fixture.actor.tenantId, studentId: cycle48Fixture.actor.userId },
      orderBy: { id: "asc" },
    });
    const beforeSessions = await prisma.exerciseSession.count({
      where: { tenantId: cycle48Fixture.actor.tenantId, studentId: cycle48Fixture.actor.userId },
    });
    const completedPath = await getStudentLearningPath(cycle48Fixture.actor);
    expect(
      completedPath?.paths
        .find((path) => path.path.cycleSequence === 44)
        ?.nodes.every((node) => node.status === "completed"),
    ).toBe(true);

    const transition = await reconcileP1ToNextCycle(cycle48Fixture.actor, {
      p1LearningPathId: cycle48Fixture.enrollmentId,
    });
    expect(transition).toMatchObject({
      outcome: "ASSIGNED",
      currentLearningPathId: cycle48Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle49,
      readiness: { status: "ASSIGNED", currentCycleCompleted: true, nextCycleAvailable: true },
    });

    const after = await getStudentLearningPath(cycle48Fixture.actor);
    const station273Path = after?.paths.find((path) => path.path.cycleSequence === 49);
    expect(station273Path?.nodes).toHaveLength(5);
    expect(station273Path?.nodes[0]).toMatchObject({ status: "active", availability: "READY" });
    expect(station273Path?.nodes.slice(1).every((node) => node.status === "locked")).toBe(true);
    const station273 = station273Path!.nodes[0]!;
    await expect(
      assertLearningStepAccessible(cycle48Fixture.actor, station273.id),
    ).resolves.toMatchObject({
      id: station273.id,
      status: "active",
      availability: "READY",
    });

    const replay = await reconcileP1ToNextCycle(cycle48Fixture.actor, {
      p1LearningPathId: cycle48Fixture.enrollmentId,
    });
    expect(replay).toMatchObject({
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: cycle48Fixture.enrollmentId,
      nextLearningPathId: PATH_IDS.cycle49,
      readiness: { status: "ALREADY_ASSIGNED" },
    });
    expect(
      await prisma.studentLearningPath.count({
        where: {
          tenantId: cycle48Fixture.actor.tenantId,
          studentId: cycle48Fixture.actor.userId,
          learningPathId: PATH_IDS.cycle49,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.exerciseSession.count({
        where: { tenantId: cycle48Fixture.actor.tenantId, studentId: cycle48Fixture.actor.userId },
      }),
    ).toBe(beforeSessions);
    expect(
      await prisma.studentLearningStepProgress.findMany({
        where: { tenantId: cycle48Fixture.actor.tenantId, studentId: cycle48Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeProgress);
    expect(
      await prisma.assessmentResult.findMany({
        where: { tenantId: cycle48Fixture.actor.tenantId, studentId: cycle48Fixture.actor.userId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeResults);
  });
});
