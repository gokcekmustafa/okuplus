import { Prisma, type PlatformRole } from "@prisma/client";
import { notFoundError, validationError } from "../../lib/errors.js";
import {
  assertTeacherClassAccess,
  type TeacherAssignmentActor,
} from "../assignments/teacher-service.js";
import { resolveLearningPathStepEvidence } from "../learning-path/service.js";
import { readSkillResults } from "../measurements/service.js";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor, type StudentActor } from "./policy.js";
import {
  P1_ROUTE_SELECTION_POLICY_VERSION,
  isP1PathCode,
  selectP1Route,
  type RouteSelectionCandidate,
  type RouteSelectionMeasurement,
  type RouteSelectionResult,
} from "./route-selection.js";

const P0_PATH_PREFIX = "EDUCATION_V2_P0_";
const P1_PATH_PREFIX = "EDUCATION_V2_P1_";

type P1StudentActor = StudentActor & {
  tenantId: string;
  platformRole: null;
};

type P0Step = {
  id: string;
  type:
    | "TEACHING"
    | "SMALL_STUDY"
    | "PRACTICE"
    | "REINFORCEMENT"
    | "ASSESSMENT"
    | "MEASUREMENT"
    | "NEXT_LEARNING";
  position: number;
  prerequisiteStepId: string | null;
  contentVersionId: string | null;
  exerciseTemplateVersionId: string | null;
  assessmentId: string | null;
  completionRule: Prisma.JsonValue;
};

type P0State = {
  pathId: string;
  levelId: string | null;
  completed: boolean;
  measurement: RouteSelectionMeasurement | null;
};

export type P1TransitionInput = {
  p0LearningPathId: string;
};

export type P1TransitionResult = {
  outcome: "ASSIGNED" | "ALREADY_ASSIGNED" | "REVIEW_REQUIRED";
  enrollmentId: string | null;
  selection: RouteSelectionResult;
};

export type P1TeacherOverrideInput = P1TransitionInput & {
  classId: string;
  studentId: string;
  learningPathId: string;
  reason: string;
};

export type P1TeacherOverrideResult = {
  enrollmentId: string;
  studentId: string;
  learningPathId: string;
  systemRecommendation: {
    recommendedPathId: string | null;
    measurementResultId: string | null;
    selectionPolicyVersion: string | null;
  };
  overrideByUserId: string;
  overrideAt: Date;
  overrideReason: string;
};

function prerequisiteIds(value: Prisma.JsonValue): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const configured = (value as Record<string, unknown>).prerequisiteStepIds;
  return Array.isArray(configured)
    ? configured.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function p0PrerequisiteIds(steps: readonly P0Step[], index: number): string[] {
  const step = steps[index];
  if (!step) return [];
  const ids = new Set<string>();
  if (step.prerequisiteStepId) ids.add(step.prerequisiteStepId);
  for (const id of prerequisiteIds(step.completionRule)) ids.add(id);
  const previous = steps[index - 1];
  if (previous) ids.add(previous.id);
  return [...ids];
}

/**
 * Resolves only the P0 completion that is valid for the same path and its
 * linear prerequisite chain. A future raw completion cannot jump over an
 * incomplete station; MEASUREMENT is derived only after its prerequisites.
 */
export function resolveP0LinearCompletion(
  steps: readonly P0Step[],
  evidenceCompletedIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const completed = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [index, step] of steps.entries()) {
      if (completed.has(step.id)) continue;
      const derivedMeasurement =
        step.type === "MEASUREMENT" &&
        p0PrerequisiteIds(steps, index).every((id) => completed.has(id));
      if (!evidenceCompletedIds.has(step.id) && !derivedMeasurement) continue;
      if (!p0PrerequisiteIds(steps, index).every((id) => completed.has(id))) continue;
      completed.add(step.id);
      changed = true;
    }
  }
  return completed;
}

function minimumScore(rule: Prisma.JsonValue): number | null {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
  const value = (rule as Record<string, unknown>).minimumScore;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function selectionMetadata(selection: RouteSelectionResult): Prisma.InputJsonValue {
  return {
    status: selection.status,
    routeFamily: selection.routeFamily,
    reasonCodes: selection.reasonCodes,
    supportingSignals: selection.supportingSignals,
    uncertainty: selection.uncertainty,
    policyVersion: selection.policyVersion,
    reason: selection.reason,
  } as Prisma.InputJsonValue;
}

function isP2002(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function loadP0State(
  tx: Prisma.TransactionClient,
  actor: { userId: string; tenantId: string },
  p0LearningPathId: string,
): Promise<P0State | null> {
  const path = await tx.learningPath.findFirst({
    where: {
      id: p0LearningPathId,
      status: "PUBLISHED",
      deletedAt: null,
      code: { startsWith: P0_PATH_PREFIX },
      OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
      enrollments: { some: { tenantId: actor.tenantId, studentId: actor.userId } },
    },
    select: {
      id: true,
      levelId: true,
      units: {
        where: { status: "PUBLISHED" },
        orderBy: { position: "asc" },
        select: {
          steps: {
            where: { status: "PUBLISHED", isActive: true },
            orderBy: { position: "asc" },
            select: {
              id: true,
              type: true,
              position: true,
              prerequisiteStepId: true,
              contentVersionId: true,
              exerciseTemplateVersionId: true,
              assessmentId: true,
              completionRule: true,
            },
          },
        },
      },
    },
  });
  if (!path) return null;

  const steps = path.units.flatMap((unit) => unit.steps) as P0Step[];
  if (!steps.length)
    return { pathId: path.id, levelId: path.levelId, completed: false, measurement: null };

  const stepIds = steps.map((step) => step.id);
  const templateIds = steps
    .map((step) => step.exerciseTemplateVersionId)
    .filter((id): id is string => Boolean(id));
  const contentIds = steps
    .map((step) => step.contentVersionId)
    .filter((id): id is string => Boolean(id));
  const assessmentIds = steps
    .map((step) => step.assessmentId)
    .filter((id): id is string => Boolean(id));

  const [progress, sessions, lessons, assessmentResults] = await Promise.all([
    tx.studentLearningStepProgress.findMany({
      where: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        learningStepId: { in: stepIds },
        status: "COMPLETED",
      },
      select: { learningStepId: true },
    }),
    templateIds.length
      ? tx.exerciseSession.findMany({
          where: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            templateVersionId: { in: templateIds },
            status: "COMPLETED",
            assignmentId: null,
            assessmentId: null,
            context: "INDIVIDUAL",
            sessionType: "PRACTICE",
            trainingSessionItem: { is: null },
          },
          select: { learningStepId: true, templateVersionId: true },
        })
      : Promise.resolve([]),
    contentIds.length
      ? tx.studentLessonProgress.findMany({
          where: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            contentVersionId: { in: contentIds },
          },
          select: { contentVersionId: true },
        })
      : Promise.resolve([]),
    assessmentIds.length
      ? tx.assessmentResult.findMany({
          where: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            assessmentId: { in: assessmentIds },
          },
          orderBy: { completedAt: "desc" },
          select: { id: true, assessmentId: true, score: true, metrics: true },
        })
      : Promise.resolve([]),
  ]);

  const stepEvidence = resolveLearningPathStepEvidence(
    steps.map((step) => ({
      id: step.id,
      exerciseTemplateVersionId: step.exerciseTemplateVersionId,
      contentVersionId: step.contentVersionId,
    })),
    sessions,
    new Set(lessons.map((lesson) => lesson.contentVersionId)),
  );
  const evidenceCompleted = new Set(progress.map((item) => item.learningStepId));
  for (const [stepId, evidence] of stepEvidence) {
    if (evidence.completed) evidenceCompleted.add(stepId);
  }
  const latestResults = new Map<string, (typeof assessmentResults)[number]>();
  for (const result of assessmentResults) {
    if (!latestResults.has(result.assessmentId)) latestResults.set(result.assessmentId, result);
  }

  for (const step of steps) {
    if (step.assessmentId) {
      const result = latestResults.get(step.assessmentId);
      const threshold = minimumScore(step.completionRule);
      if (result && (threshold === null || (result.score !== null && result.score >= threshold))) {
        evidenceCompleted.add(step.id);
      }
    }
  }

  const completed = resolveP0LinearCompletion(steps, evidenceCompleted);

  const completedP0 = steps.length > 0 && steps.every((step) => completed.has(step.id));
  const finalAssessmentStep = [...steps]
    .filter((step) => step.type === "ASSESSMENT" && step.assessmentId)
    .sort((a, b) => b.position - a.position)[0];
  const finalResult = finalAssessmentStep?.assessmentId
    ? (latestResults.get(finalAssessmentStep.assessmentId) ?? null)
    : null;
  const measurement = finalResult
    ? {
        id: finalResult.id,
        isFinalP0Measurement: completedP0,
        skillResults: readSkillResults(finalResult.metrics),
        metrics: finalResult.metrics,
      }
    : null;

  return { pathId: path.id, levelId: path.levelId, completed: completedP0, measurement };
}

async function loadCandidates(
  tx: Prisma.TransactionClient,
  actor: { tenantId: string },
  levelId: string | null,
): Promise<RouteSelectionCandidate[]> {
  return tx.learningPath.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      code: { startsWith: P1_PATH_PREFIX },
      AND: [
        { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] },
        ...(levelId ? [{ OR: [{ levelId: null }, { levelId }] }] : []),
        {
          units: {
            some: {
              status: "PUBLISHED",
              steps: { some: { status: "PUBLISHED", isActive: true } },
            },
          },
        },
      ],
    },
    select: { id: true, code: true, version: true, levelId: true, status: true },
  });
}

async function reconcileInTransaction(
  tx: Prisma.TransactionClient,
  actor: P1StudentActor,
  input: P1TransitionInput,
): Promise<P1TransitionResult> {
  const p0 = await loadP0State(tx, actor, input.p0LearningPathId);
  if (!p0) throw notFoundError("P0 öğrenme yolu bulunamadı");
  if (!p0.completed || !p0.measurement) {
    return {
      outcome: "REVIEW_REQUIRED",
      enrollmentId: null,
      selection: selectP1Route({ levelId: p0.levelId, measurement: null, candidates: [] }),
    };
  }

  const candidates = await loadCandidates(tx, actor, p0.levelId);
  const selection = selectP1Route({
    levelId: p0.levelId,
    measurement: p0.measurement,
    candidates,
  });
  if (selection.status !== "READY" || !selection.recommendedPathId || !p0.measurement.id) {
    return { outcome: "REVIEW_REQUIRED", enrollmentId: null, selection };
  }

  const existing = await tx.studentLearningPath.findUnique({
    where: {
      tenantId_studentId_learningPathId: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        learningPathId: selection.recommendedPathId,
      },
    },
    select: { id: true, routeStatus: true, measurementResultId: true, recommendedPathId: true },
  });
  if (
    existing &&
    (existing.routeStatus === "ACTIVE" || existing.routeStatus === "COMPLETED") &&
    existing.measurementResultId === p0.measurement.id &&
    existing.recommendedPathId === selection.recommendedPathId
  ) {
    return { outcome: "ALREADY_ASSIGNED", enrollmentId: existing.id, selection };
  }

  await tx.studentLearningPath.updateMany({
    where: {
      tenantId: actor.tenantId,
      studentId: actor.userId,
      routeStatus: "ACTIVE",
      learningPath: { code: { startsWith: P1_PATH_PREFIX } },
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    data: { routeStatus: "REASSIGNED" },
  });

  const assignedAt = new Date();
  const enrollment = await tx.studentLearningPath.upsert({
    where: {
      tenantId_studentId_learningPathId: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        learningPathId: selection.recommendedPathId,
      },
    },
    update: {
      routeStatus: "ACTIVE",
      assignedAt,
      recommendedPathId: selection.recommendedPathId,
      measurementResultId: p0.measurement.id,
      selectionPolicyVersion: selection.policyVersion,
      selectionReason: selectionMetadata(selection),
      overrideByUserId: null,
      overrideAt: null,
      overrideReason: null,
    },
    create: {
      tenantId: actor.tenantId,
      studentId: actor.userId,
      learningPathId: selection.recommendedPathId,
      routeStatus: "ACTIVE",
      assignedAt,
      recommendedPathId: selection.recommendedPathId,
      measurementResultId: p0.measurement.id,
      selectionPolicyVersion: selection.policyVersion,
      selectionReason: selectionMetadata(selection),
    },
    select: { id: true },
  });

  return { outcome: "ASSIGNED", enrollmentId: enrollment.id, selection };
}

/** Explicit transition entry point; it is not called from generic P0 completion. */
export async function reconcileP0ToP1(
  actor: StudentActor,
  input: P1TransitionInput,
): Promise<P1TransitionResult> {
  assertStudentActor(actor);
  try {
    return await withTenantContext(actor, (tx) => reconcileInTransaction(tx, actor, input));
  } catch (error) {
    if (!isP2002(error)) throw error;
    return withTenantContext(actor, async (tx) => {
      const active = await tx.studentLearningPath.findFirst({
        where: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          routeStatus: "ACTIVE",
          learningPath: { code: { startsWith: P1_PATH_PREFIX } },
        },
        select: { id: true },
      });
      if (!active) throw error;
      return {
        outcome: "ALREADY_ASSIGNED",
        enrollmentId: active.id,
        selection: selectP1Route({ levelId: null, measurement: null, candidates: [] }),
      };
    });
  }
}

/**
 * Teacher override foundation. Authorization is checked against the teacher's
 * active class assignment inside the same transaction as the route write.
 */
export async function overrideP1Route(
  actor: TeacherAssignmentActor,
  input: P1TeacherOverrideInput,
): Promise<P1TeacherOverrideResult> {
  if (!actor.tenantId) throw validationError("Öğretmen işlemi için kurum seçimi gerekli");
  const tenantId = actor.tenantId;
  const now = new Date();

  return withTenantContext(actor, async (tx) => {
    await assertTeacherClassAccess(actor, input.classId, input.studentId, tx);
    const p0 = await loadP0State(tx, { userId: input.studentId, tenantId }, input.p0LearningPathId);
    if (!p0?.completed) throw validationError("P0 öğrenme yolu henüz tamamlanmadı");

    const target = await tx.learningPath.findFirst({
      where: {
        id: input.learningPathId,
        status: "PUBLISHED",
        deletedAt: null,
        code: { startsWith: P1_PATH_PREFIX },
        OR: [{ tenantId: null }, { tenantId }],
        ...(p0.levelId ? { AND: [{ OR: [{ levelId: null }, { levelId: p0.levelId }] }] } : {}),
        units: {
          some: {
            status: "PUBLISHED",
            steps: { some: { status: "PUBLISHED", isActive: true } },
          },
        },
      },
      select: { id: true, code: true },
    });
    if (!target || !isP1PathCode(target.code)) {
      throw validationError("Seçilen P1 yolu bu öğrenci için uygun değil");
    }

    const systemRoute = await tx.studentLearningPath.findFirst({
      where: {
        tenantId,
        studentId: input.studentId,
        routeStatus: { in: ["ACTIVE", "PAUSED", "REVIEW_REQUIRED"] },
        learningPath: { code: { startsWith: P1_PATH_PREFIX } },
      },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        recommendedPathId: true,
        measurementResultId: true,
        selectionPolicyVersion: true,
        selectionReason: true,
      },
    });

    await tx.studentLearningPath.updateMany({
      where: {
        tenantId,
        studentId: input.studentId,
        routeStatus: "ACTIVE",
        learningPath: { code: { startsWith: P1_PATH_PREFIX } },
        ...(systemRoute ? { id: { not: systemRoute.id } } : {}),
      },
      data: { routeStatus: "REASSIGNED" },
    });

    const enrollment = await tx.studentLearningPath.upsert({
      where: {
        tenantId_studentId_learningPathId: {
          tenantId,
          studentId: input.studentId,
          learningPathId: target.id,
        },
      },
      update: {
        routeStatus: "ACTIVE",
        assignedAt: now,
        recommendedPathId: systemRoute?.recommendedPathId ?? null,
        measurementResultId: systemRoute?.measurementResultId ?? p0.measurement?.id ?? null,
        selectionPolicyVersion:
          systemRoute?.selectionPolicyVersion ?? P1_ROUTE_SELECTION_POLICY_VERSION,
        selectionReason: systemRoute?.selectionReason ?? {
          source: "TEACHER_OVERRIDE",
          reasonCodes: ["MEASUREMENT_INSUFFICIENT"],
        },
        overrideByUserId: actor.userId,
        overrideAt: now,
        overrideReason: input.reason,
      },
      create: {
        tenantId,
        studentId: input.studentId,
        learningPathId: target.id,
        routeStatus: "ACTIVE",
        assignedAt: now,
        recommendedPathId: systemRoute?.recommendedPathId ?? null,
        measurementResultId: systemRoute?.measurementResultId ?? p0.measurement?.id ?? null,
        selectionPolicyVersion:
          systemRoute?.selectionPolicyVersion ?? P1_ROUTE_SELECTION_POLICY_VERSION,
        selectionReason: systemRoute?.selectionReason ?? {
          source: "TEACHER_OVERRIDE",
          reasonCodes: ["MEASUREMENT_INSUFFICIENT"],
        },
        overrideByUserId: actor.userId,
        overrideAt: now,
        overrideReason: input.reason,
      },
      select: { id: true },
    });

    return {
      enrollmentId: enrollment.id,
      studentId: input.studentId,
      learningPathId: target.id,
      systemRecommendation: {
        recommendedPathId: systemRoute?.recommendedPathId ?? null,
        measurementResultId: systemRoute?.measurementResultId ?? p0.measurement?.id ?? null,
        selectionPolicyVersion:
          systemRoute?.selectionPolicyVersion ?? P1_ROUTE_SELECTION_POLICY_VERSION,
      },
      overrideByUserId: actor.userId,
      overrideAt: now,
      overrideReason: input.reason,
    };
  });
}

export function isP1TransitionActor(actor: {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}): actor is P1StudentActor {
  return Boolean(actor.tenantId) && actor.platformRole === null;
}
