import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { forbiddenError, validationError } from "../../lib/errors.js";
import {
  ACADEMIC_P0_GUIDED_SKILL_ORDER,
  getAcademicP0GuidedSkillPrerequisite,
} from "../../curriculum/academic-reading-p0.js";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor, type StudentActor } from "../student-learning/policy.js";
import { resolveTrainingRuntimeConfig } from "../training/exercise-contract.js";
import {
  buildPlannedLearningRouteNodes,
  countVisibleLearningRoutePositions,
  learningRouteCycle,
  LEARNING_ROUTE_VISIBLE_STATION_TARGET,
  matchesLearningRouteGraph,
  upcomingLearningRouteCycles,
} from "../../curriculum/learning-route-catalog.js";
import { assessmentResultCompletesLearningStep } from "../student-learning/assessment-completion-policy.js";

export type LearningPathActor = StudentActor;

type PathStepRow = PrismaTypes.LearningStepGetPayload<{
  select: {
    id: true;
    stableKey: true;
    title: true;
    position: true;
    type: true;
    source: true;
    status: true;
    isActive: true;
    prerequisiteStepId: true;
    minimumLevel: { select: { id: true; displayOrder: true } };
    maximumLevel: { select: { id: true; displayOrder: true } };
    contentVersionId: true;
    exerciseTemplateVersionId: true;
    assessmentId: true;
    completionRule: true;
    contentVersion: {
      select: { status: true; content: { select: { status: true; deletedAt: true } } };
    };
    exerciseTemplateVersion: {
      select: {
        status: true;
        config: true;
        template: { select: { status: true; deletedAt: true } };
      };
    };
    assessment: { select: { status: true; deletedAt: true } };
  };
}>;

type PathUnitRow = {
  id: string;
  code: string;
  title: string;
  position: number;
  status: string;
  steps: PathStepRow[];
};

type PublishedPath = {
  id: string;
  tenantId: string | null;
  code: string;
  version: number;
  levelId: string | null;
  title: string;
  area: string;
  enrolled?: boolean;
  activeEnrollment?: boolean;
  completedEnrollment?: boolean;
  progressCount?: number;
  completedProgressCount?: number;
  units: PathUnitRow[];
};

type StepProgressRow = {
  learningStepId: string;
  status: "LOCKED" | "ACTIVE" | "IN_PROGRESS" | "COMPLETED" | "NOT_STARTED";
  completedAt: Date | null;
  sessionCount: number;
  accuracy: number | null;
};

export type LearningPathEvidenceStep = {
  id: string;
  exerciseTemplateVersionId: string | null;
  contentVersionId: string | null;
};

export type LearningPathSessionEvidence = {
  learningStepId: string | null;
  templateVersionId: string;
  deviceInfo?: unknown;
};

export type LearningPathStepEvidence = {
  completed: boolean;
  sessionCount: number;
  contentCompleted: boolean;
};

/**
 * Converts raw completion evidence into step-scoped evidence.
 *
 * A template session is trusted only when the session carries the exact
 * learningStepId and still points at that step's template version. Content
 * progress has no learningStepId in its legacy table, so it is trusted only
 * when that content version is unique within the selected learning-path
 * scope. Shared content is intentionally fail-closed.
 */
export function resolveLearningPathStepEvidence(
  steps: readonly LearningPathEvidenceStep[],
  sessions: readonly LearningPathSessionEvidence[],
  completedContentVersionIds: ReadonlySet<string>,
): ReadonlyMap<string, LearningPathStepEvidence> {
  const stepById = new Map(steps.map((step) => [step.id, step] as const));
  const stepsByTemplateVersion = new Map<string, string[]>();
  const contentUsage = new Map<string, number>();
  for (const step of steps) {
    if (step.exerciseTemplateVersionId) {
      const stepIds = stepsByTemplateVersion.get(step.exerciseTemplateVersionId) ?? [];
      stepIds.push(step.id);
      stepsByTemplateVersion.set(step.exerciseTemplateVersionId, stepIds);
    }
    if (step.contentVersionId) {
      contentUsage.set(step.contentVersionId, (contentUsage.get(step.contentVersionId) ?? 0) + 1);
    }
  }

  const sessionCounts = new Map<string, number>();
  for (const session of sessions) {
    const source =
      session.deviceInfo &&
      typeof session.deviceInfo === "object" &&
      !Array.isArray(session.deviceInfo)
        ? (session.deviceInfo as Record<string, unknown>).source
        : null;
    if (source === "INDEPENDENT_TRAINING" || source === "LEARNING_PATH_REPLAY") continue;
    // Sessions created before learningStepId was persisted can still be
    // recovered when their template belongs to exactly one step in this path.
    // A shared template remains intentionally ambiguous and is never used to
    // complete more than one step.
    const step = session.learningStepId
      ? stepById.get(session.learningStepId)
      : stepsByTemplateVersion.get(session.templateVersionId)?.length === 1
        ? stepById.get(stepsByTemplateVersion.get(session.templateVersionId)![0]!)
        : undefined;
    if (!step || step.exerciseTemplateVersionId !== session.templateVersionId) continue;
    sessionCounts.set(step.id, (sessionCounts.get(step.id) ?? 0) + 1);
  }

  return new Map(
    steps.map((step) => {
      const contentCompleted =
        Boolean(step.contentVersionId) &&
        contentUsage.get(step.contentVersionId!) === 1 &&
        completedContentVersionIds.has(step.contentVersionId!);
      const sessionCount = sessionCounts.get(step.id) ?? 0;
      return [
        step.id,
        {
          completed: sessionCount > 0 || contentCompleted,
          sessionCount: sessionCount || (contentCompleted ? 1 : 0),
          contentCompleted,
        },
      ] as const;
    }),
  );
}

export type LearningPathStatusStep = {
  id: string;
  prerequisiteIds: readonly string[];
  eligible: boolean;
  completed: boolean;
};

/**
 * Applies the linear Learning Path rule to already-scoped completion state.
 * A completed flag cannot bypass unmet prerequisites; later stations remain
 * locked until the chain reaches them.
 */
export function resolveLearningPathNodeStatuses(
  steps: readonly LearningPathStatusStep[],
  alreadyCompletedIds: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, "completed" | "active" | "locked"> {
  const statuses = new Map<string, "completed" | "active" | "locked">();
  const completedIds = new Set(alreadyCompletedIds);
  let activeAssigned = false;

  for (const step of steps) {
    const prerequisiteCompleted = step.prerequisiteIds.every((id) => completedIds.has(id));
    if (step.completed && prerequisiteCompleted) {
      statuses.set(step.id, "completed");
      completedIds.add(step.id);
      continue;
    }
    if (!activeAssigned && prerequisiteCompleted && step.eligible) {
      statuses.set(step.id, "active");
      activeAssigned = true;
      continue;
    }
    statuses.set(step.id, "locked");
  }

  return statuses;
}

const P1_PATH_PREFIX = "EDUCATION_V2_P1_";
const P0_PATH_PREFIX = "EDUCATION_V2_P0_";

const PATH_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  version: true,
  levelId: true,
  title: true,
  area: true,
  units: {
    where: { status: "PUBLISHED" as const },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      code: true,
      title: true,
      position: true,
      status: true,
      steps: {
        where: { status: "PUBLISHED" as const, isActive: true },
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          stableKey: true,
          title: true,
          position: true,
          type: true,
          source: true,
          status: true,
          isActive: true,
          prerequisiteStepId: true,
          minimumLevel: { select: { id: true, displayOrder: true } },
          maximumLevel: { select: { id: true, displayOrder: true } },
          contentVersionId: true,
          exerciseTemplateVersionId: true,
          assessmentId: true,
          completionRule: true,
          contentVersion: {
            select: { status: true, content: { select: { status: true, deletedAt: true } } },
          },
          exerciseTemplateVersion: {
            select: {
              status: true,
              config: true,
              template: { select: { status: true, deletedAt: true } },
            },
          },
          assessment: { select: { status: true, deletedAt: true } },
        },
      },
    },
  },
} satisfies PrismaTypes.LearningPathSelect;

function assertStudent(actor: LearningPathActor): asserts actor is LearningPathActor & {
  tenantId: string;
  platformRole: null;
} {
  assertStudentActor(actor);
}

async function findPublishedPaths(tx: PrismaTypes.TransactionClient, actor: LearningPathActor) {
  const rows = await tx.learningPath.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      AND: [
        { OR: [{ tenantId: null }, { tenantId: actor.tenantId ?? undefined }] },
        {
          OR: [
            { NOT: { code: { startsWith: P1_PATH_PREFIX } } },
            {
              code: { startsWith: P1_PATH_PREFIX },
              enrollments: {
                some: {
                  tenantId: actor.tenantId!,
                  studentId: actor.userId,
                  routeStatus: { in: ["ACTIVE", "COMPLETED", "PAUSED"] },
                },
              },
            },
          ],
        },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      ...PATH_SELECT,
      enrollments: {
        where: {
          tenantId: actor.tenantId!,
          studentId: actor.userId,
          OR: [
            { routeStatus: { in: ["ACTIVE", "COMPLETED", "PAUSED"] as const } },
            { routeStatus: null },
          ],
        },
        select: { id: true, routeStatus: true },
      },
    },
  });

  const pathIds = rows.map((row) => row.id);
  // Keep an already-enrolled path as the source of truth while old and new
  // canonical records coexist. Progress counts are only a tie-breaker between
  // enrolled P0 records; they never make an unassigned P1 path selectable.
  const progressRows = pathIds.length
    ? await tx.studentLearningStepProgress.findMany({
        where: {
          tenantId: actor.tenantId!,
          studentId: actor.userId,
          learningStep: { unit: { pathId: { in: pathIds } } },
        },
        select: {
          status: true,
          learningStep: { select: { unit: { select: { pathId: true } } } },
        },
      })
    : [];
  const progressByPath = new Map<string, { total: number; completed: number }>();
  for (const row of progressRows) {
    const pathId = row.learningStep.unit.pathId;
    const current = progressByPath.get(pathId) ?? { total: 0, completed: 0 };
    current.total += 1;
    if (row.status === "COMPLETED") current.completed += 1;
    progressByPath.set(pathId, current);
  }

  const candidates = rows
    .filter((row) => learningRouteCycle(row.code)?.publicationApproved() !== false)
    .map((row) => {
      const progress = progressByPath.get(row.id) ?? { total: 0, completed: 0 };
      return {
        ...row,
        enrolled: row.enrollments.length > 0,
        activeEnrollment: row.enrollments.some((enrollment) => enrollment.routeStatus === "ACTIVE"),
        completedEnrollment: row.enrollments.some(
          (enrollment) => enrollment.routeStatus === "COMPLETED",
        ),
        progressCount: progress.total,
        completedProgressCount: progress.completed,
      } as PublishedPath;
    });
  return selectPublishedPathCandidates(candidates, actor.tenantId);
}

export function shouldReplacePublishedPath(
  current:
    | {
        code: string;
        tenantId: string | null;
        version?: number;
        enrolled?: boolean;
        activeEnrollment?: boolean;
        progressCount?: number;
        completedProgressCount?: number;
      }
    | undefined,
  candidate: {
    code: string;
    tenantId: string | null;
    version?: number;
    enrolled?: boolean;
    activeEnrollment?: boolean;
    progressCount?: number;
    completedProgressCount?: number;
  },
  actorTenantId: string | null,
): boolean {
  if (!current) return true;

  const candidateIsAssignedP1 = candidate.code.startsWith(P1_PATH_PREFIX);
  const currentIsAssignedP1 = current.code.startsWith(P1_PATH_PREFIX);
  if (candidateIsAssignedP1 !== currentIsAssignedP1) return candidateIsAssignedP1;

  if (candidateIsAssignedP1 && currentIsAssignedP1) {
    const candidateIsActive = Boolean(candidate.activeEnrollment);
    const currentIsActive = Boolean(current.activeEnrollment);
    if (candidateIsActive !== currentIsActive) return candidateIsActive;
  }

  const candidateIsEnrolled = Boolean(candidate.enrolled);
  const currentIsEnrolled = Boolean(current.enrolled);
  if (candidateIsEnrolled !== currentIsEnrolled) return candidateIsEnrolled;

  const candidateIsP0 = !candidateIsAssignedP1;
  const currentIsP0 = !currentIsAssignedP1;
  if (candidateIsP0 && currentIsP0 && candidateIsEnrolled && currentIsEnrolled) {
    const candidateCompleted = candidate.completedProgressCount ?? 0;
    const currentCompleted = current.completedProgressCount ?? 0;
    if (candidateCompleted !== currentCompleted) return candidateCompleted > currentCompleted;

    const candidateProgress = candidate.progressCount ?? 0;
    const currentProgress = current.progressCount ?? 0;
    if (candidateProgress !== currentProgress) return candidateProgress > currentProgress;
  }

  const candidateIsCanonicalP0 = candidate.code.startsWith(P0_PATH_PREFIX);
  const currentIsCanonicalP0 = current.code.startsWith(P0_PATH_PREFIX);
  if (candidateIsCanonicalP0 !== currentIsCanonicalP0) return candidateIsCanonicalP0;

  const sameCanonicalP0Version =
    candidateIsCanonicalP0 &&
    currentIsCanonicalP0 &&
    candidate.code === current.code &&
    (candidate.version === undefined ||
      current.version === undefined ||
      candidate.version === current.version);
  if (sameCanonicalP0Version && Boolean(candidate.enrolled) !== Boolean(current.enrolled)) {
    return Boolean(candidate.enrolled);
  }

  if (sameCanonicalP0Version && candidate.enrolled && current.enrolled) {
    const candidateIsTenantSpecific = candidate.tenantId === actorTenantId;
    const currentIsTenantSpecific = current.tenantId === actorTenantId;
    if (candidateIsTenantSpecific !== currentIsTenantSpecific) {
      return candidateIsTenantSpecific;
    }
  }

  if (candidateIsCanonicalP0 && currentIsCanonicalP0) {
    const candidateIsGlobal = candidate.tenantId === null;
    const currentIsGlobal = current.tenantId === null;
    if (candidateIsGlobal !== currentIsGlobal) return candidateIsGlobal;
  }

  const candidateIsTenantSpecific = candidate.tenantId === actorTenantId;
  const currentIsTenantSpecific = current.tenantId === actorTenantId;
  if (candidateIsTenantSpecific !== currentIsTenantSpecific) {
    return candidateIsTenantSpecific;
  }

  return false;
}

type PublishedPathSelectionCandidate = {
  code: string;
  area: string;
  tenantId: string | null;
  version?: number;
  enrolled?: boolean;
  activeEnrollment?: boolean;
  completedEnrollment?: boolean;
  progressCount?: number;
  completedProgressCount?: number;
};

/**
 * Keeps completed curriculum phases visible when a new assigned phase is
 * created for the same area. P1 is a new phase after P0, and a later P1
 * cycle must append after an earlier completed P1 cycle instead of replacing
 * its historical projection.
 *
 * Within each phase and area we still keep the existing canonical/enrollment
 * selection rules for the active route, so duplicate published records do not
 * produce duplicate active modules or weaken tenant isolation. Completed P1
 * enrollments are retained only as the student's own historical projections.
 */
export function selectPublishedPathCandidates<T extends PublishedPathSelectionCandidate>(
  candidates: readonly T[],
  actorTenantId: string | null,
): T[] {
  const p0ByArea = new Map<string, T>();
  const p1ByArea = new Map<string, T>();
  const completedP1ByArea = new Map<string, T[]>();

  for (const candidate of candidates) {
    if (
      candidate.code.startsWith(P1_PATH_PREFIX) &&
      candidate.enrolled &&
      candidate.completedEnrollment &&
      !candidate.activeEnrollment
    ) {
      const history = completedP1ByArea.get(candidate.area) ?? [];
      if (
        !history.some(
          (item) =>
            item.code === candidate.code &&
            item.version === candidate.version &&
            item.tenantId === candidate.tenantId,
        )
      ) {
        history.push(candidate);
        completedP1ByArea.set(candidate.area, history);
      }
      continue;
    }
    const target = candidate.code.startsWith(P1_PATH_PREFIX) ? p1ByArea : p0ByArea;
    const current = target.get(candidate.area);
    if (shouldReplacePublishedPath(current, candidate, actorTenantId)) {
      target.set(candidate.area, candidate);
    }
  }

  const areaOrder = new Map([
    ["FAST_READING", 0],
    ["READING_COMPREHENSION", 1],
    ["COMMON", 2],
  ]);
  const historicalP1 = [...completedP1ByArea.values()].flat();
  return [...p0ByArea.values(), ...historicalP1, ...p1ByArea.values()].sort((a, b) => {
    const aPhase = a.code.startsWith(P1_PATH_PREFIX) ? 1 : 0;
    const bPhase = b.code.startsWith(P1_PATH_PREFIX) ? 1 : 0;
    const aHistorical = a.completedEnrollment && !a.activeEnrollment ? 0 : 1;
    const bHistorical = b.completedEnrollment && !b.activeEnrollment ? 0 : 1;
    return (
      aPhase - bPhase ||
      (areaOrder.get(a.area) ?? Number.MAX_SAFE_INTEGER) -
        (areaOrder.get(b.area) ?? Number.MAX_SAFE_INTEGER) ||
      aHistorical - bHistorical ||
      (learningRouteCycle(a.code)?.sequence ?? 0) - (learningRouteCycle(b.code)?.sequence ?? 0) ||
      a.area.localeCompare(b.area) ||
      a.code.localeCompare(b.code)
    );
  });
}

function flattenSteps(path: PublishedPath) {
  return path.units.flatMap((unit) =>
    unit.steps.map((step) => ({
      ...step,
      pathCode: path.code,
      unit: {
        id: unit.id,
        code: unit.code,
        title: unit.title,
        position: unit.position,
      },
    })),
  );
}

function levelEligible(
  step: PathStepRow,
  currentLevel: { id: string; displayOrder: number } | null,
): boolean {
  if (!step.minimumLevel && !step.maximumLevel) return true;
  if (!currentLevel) return false;
  if (step.minimumLevel && currentLevel.displayOrder < step.minimumLevel.displayOrder) return false;
  if (step.maximumLevel && currentLevel.displayOrder > step.maximumLevel.displayOrder) return false;
  return true;
}

/** One evidence read per table for the entire route, regardless of its cycle count. */
async function readPathStates(
  tx: PrismaTypes.TransactionClient,
  actor: LearningPathActor,
  paths: readonly PublishedPath[],
  contentEvidenceStepIds?: ReadonlySet<string>,
): Promise<ReadPathState[]> {
  assertStudent(actor);
  if (!paths.length) return [];
  const pathSteps = paths.flatMap(flattenSteps);
  const pathStepIds = pathSteps.map((step) => step.id);
  const templateVersionIds = pathSteps
    .map((step) => step.exerciseTemplateVersionId)
    .filter((id): id is string => Boolean(id));
  const stepById = new Map(pathSteps.map((step) => [step.id, step] as const));
  const localContentUsage = new Map<string, number>();
  for (const step of pathSteps) {
    if (step.contentVersionId) {
      localContentUsage.set(
        step.contentVersionId,
        (localContentUsage.get(step.contentVersionId) ?? 0) + 1,
      );
    }
  }
  const trustedContentStepIds =
    contentEvidenceStepIds ??
    new Set(
      pathSteps
        .filter(
          (step) =>
            Boolean(step.contentVersionId) && localContentUsage.get(step.contentVersionId!) === 1,
        )
        .map((step) => step.id),
    );
  const contentVersionIds = pathSteps
    .filter((step) => trustedContentStepIds.has(step.id))
    .map((step) => step.contentVersionId)
    .filter((id): id is string => Boolean(id));
  const assessmentIds = pathSteps
    .map((step) => step.assessmentId)
    .filter((id): id is string => Boolean(id));

  const [profile, progressRows, exerciseCounts, lessonCounts, assessmentResults] =
    await Promise.all([
      tx.studentProfile.findUnique({
        where: { tenantId_studentId: { tenantId: actor.tenantId, studentId: actor.userId } },
        select: { currentLevelId: true },
      }),
      tx.studentLearningStepProgress.findMany({
        where: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          learningStepId: { in: pathStepIds },
        },
        select: { learningStepId: true, status: true, completedAt: true },
      }),
      pathStepIds.length
        ? tx.exerciseSession.findMany({
            where: {
              tenantId: actor.tenantId,
              studentId: actor.userId,
              OR: [
                { learningStepId: { in: pathStepIds } },
                ...(templateVersionIds.length
                  ? [{ learningStepId: null, templateVersionId: { in: templateVersionIds } }]
                  : []),
              ],
              context: "INDIVIDUAL",
              sessionType: "PRACTICE",
              status: "COMPLETED",
              assignmentId: null,
              assessmentId: null,
              trainingSessionItem: { is: null },
            },
            select: { learningStepId: true, templateVersionId: true, deviceInfo: true },
          })
        : Promise.resolve([]),
      contentVersionIds.length
        ? tx.studentLessonProgress.groupBy({
            by: ["contentVersionId"],
            where: {
              tenantId: actor.tenantId,
              studentId: actor.userId,
              contentVersionId: { in: contentVersionIds },
            },
            _count: { _all: true },
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
            select: { assessmentId: true, score: true },
          })
        : Promise.resolve([]),
    ]);

  const currentLevel = profile?.currentLevelId
    ? await tx.level.findUnique({
        where: { id: profile.currentLevelId },
        select: { id: true, code: true, name: true, displayOrder: true },
      })
    : null;

  const completedByContent = new Map(
    lessonCounts.map((row) => [row.contentVersionId, row._count._all] as const),
  );
  const latestAssessment = new Map<string, number | null>();
  for (const result of assessmentResults) {
    if (!latestAssessment.has(result.assessmentId)) {
      latestAssessment.set(result.assessmentId, result.score);
    }
  }

  const stepEvidence = resolveLearningPathStepEvidence(
    pathSteps.map((step) => ({
      id: step.id,
      exerciseTemplateVersionId: step.exerciseTemplateVersionId,
      contentVersionId: trustedContentStepIds.has(step.id) ? step.contentVersionId : null,
    })),
    exerciseCounts,
    new Set(completedByContent.keys()),
  );

  const progress = new Map<string, StepProgressRow>(
    progressRows.map((row) => {
      const step = stepById.get(row.learningStepId);
      const evidence = stepEvidence.get(row.learningStepId);
      const assessmentCompleted = step?.assessmentId
        ? assessmentResultCompletesStep(step, latestAssessment, step.pathCode)
        : false;
      const sessionCount = evidence?.sessionCount ?? (assessmentCompleted ? 1 : 0);
      const accuracy = step?.assessmentId
        ? (latestAssessment.get(step.assessmentId) ?? null)
        : null;
      const effectiveStatus =
        row.status === "COMPLETED" || evidence?.completed || assessmentCompleted
          ? "COMPLETED"
          : row.status;
      return [
        row.learningStepId,
        { ...row, status: effectiveStatus, sessionCount, accuracy },
      ] as const;
    }),
  );

  for (const step of pathSteps) {
    if (progress.has(step.id)) continue;
    const evidence = stepEvidence.get(step.id);
    const assessmentCompleted = step.assessmentId
      ? assessmentResultCompletesStep(step, latestAssessment, step.pathCode)
      : false;
    if (evidence?.completed || assessmentCompleted) {
      progress.set(step.id, {
        learningStepId: step.id,
        status: "COMPLETED",
        completedAt: null,
        sessionCount: evidence?.sessionCount ?? (assessmentCompleted ? 1 : 0),
        accuracy: step.assessmentId ? (latestAssessment.get(step.assessmentId) ?? null) : null,
      });
    }
  }

  return paths.map((path) => {
    const finalized = path.completedEnrollment && matchesLearningRouteGraph(path);
    const scoped = new Map<string, StepProgressRow>();
    for (const step of flattenSteps(path)) {
      const saved = progress.get(step.id);
      if (saved) scoped.set(step.id, finalized ? { ...saved, status: "COMPLETED" } : saved);
      else if (finalized)
        scoped.set(step.id, {
          learningStepId: step.id,
          status: "COMPLETED",
          completedAt: null,
          sessionCount: 0,
          accuracy: null,
        });
    }
    return { path, currentLevel, progress: scoped };
  });
}

function stepArtifactsReady(step: PathStepRow): boolean {
  const contentReady = Boolean(
    step.contentVersionId &&
    step.contentVersion?.status === "PUBLISHED" &&
    step.contentVersion.content.status === "PUBLISHED" &&
    step.contentVersion.content.deletedAt === null,
  );
  const templateReady = Boolean(
    step.exerciseTemplateVersionId &&
    step.exerciseTemplateVersion?.status === "PUBLISHED" &&
    step.exerciseTemplateVersion.template.status === "PUBLISHED" &&
    step.exerciseTemplateVersion.template.deletedAt === null &&
    resolveTrainingRuntimeConfig("TRAINING", step.exerciseTemplateVersion.config).status ===
      "READY",
  );
  if (step.type === "TEACHING") return contentReady;
  if (step.type === "SMALL_STUDY") return contentReady || templateReady;
  if (step.type === "PRACTICE" || step.type === "REINFORCEMENT") return templateReady;
  if (step.type === "ASSESSMENT")
    return Boolean(
      step.assessmentId &&
      step.assessment?.status === "PUBLISHED" &&
      step.assessment.deletedAt === null,
    );
  return step.type === "MEASUREMENT" || step.type === "NEXT_LEARNING";
}

function prerequisiteIdsForStep(
  steps: ReturnType<typeof flattenSteps>,
  index: number,
  guidedStepsByStableKey: ReadonlyMap<string, PathStepRow>,
) {
  const step = steps[index];
  if (!step) return [];
  const ids = new Set<string>();
  if (step.prerequisiteStepId) ids.add(step.prerequisiteStepId);
  if (step.completionRule && typeof step.completionRule === "object") {
    const configured = (step.completionRule as Record<string, unknown>).prerequisiteStepIds;
    if (Array.isArray(configured)) {
      for (const id of configured) {
        if (typeof id === "string" && id.length > 0) ids.add(id);
      }
    }
  }
  const previousStep = steps[index - 1];
  if (previousStep) ids.add(previousStep.id);
  if (step.type === "ASSESSMENT") {
    const reinforcement = [...steps.slice(0, index)]
      .reverse()
      .find((candidate) => candidate.type === "REINFORCEMENT");
    if (reinforcement) ids.add(reinforcement.id);
  }
  if (step.type === "TEACHING") {
    const skill = ACADEMIC_P0_GUIDED_SKILL_ORDER.find(
      (candidate) =>
        step.stableKey === `${candidate}_TEACHING` ||
        step.stableKey === `${candidate}_SMALL_STUDY` ||
        step.stableKey === `${candidate}_PRACTICE`,
    );
    if (skill) {
      const previousSkill = getAcademicP0GuidedSkillPrerequisite(skill);
      if (previousSkill) {
        const previousPractice =
          guidedStepsByStableKey.get(`${previousSkill}_PRACTICE`) ??
          steps.find((candidate) => candidate.stableKey === `${previousSkill}_PRACTICE`);
        if (previousPractice) ids.add(previousPractice.id);
      }
    }
  }
  return [...ids];
}

type ReadPathState = {
  path: PublishedPath;
  currentLevel: { id: string; code: string; name: string; displayOrder: number } | null;
  progress: Map<string, StepProgressRow>;
};

function learningPathScopeKey(code: string): string {
  if (code.startsWith("EDUCATION_V2_P0_")) return "EDUCATION_V2_P0";
  const p1Family = /^EDUCATION_V2_P1_[A-D](?:_|$)/.exec(code)?.[0];
  if (p1Family) return p1Family.replace(/_$/, "");
  return code;
}

function effectiveCompletedIdsForScope(
  states: ReadonlyArray<ReadPathState>,
  guidedStepsByStableKey: ReadonlyMap<string, PathStepRow>,
): Set<string> {
  const completedIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const state of states) {
      const steps = flattenSteps(state.path);
      for (const [index, step] of steps.entries()) {
        if (completedIds.has(step.id)) continue;
        if (state.progress.get(step.id)?.status !== "COMPLETED") continue;
        const prerequisites = prerequisiteIdsForStep(steps, index, guidedStepsByStableKey);
        if (!prerequisites.every((id) => completedIds.has(id))) continue;
        completedIds.add(step.id);
        changed = true;
      }
    }
  }
  return completedIds;
}

function toNodes(
  path: PublishedPath,
  currentLevel: { id: string; code: string; name: string; displayOrder: number } | null,
  progress: Map<string, StepProgressRow>,
  completedIds: ReadonlySet<string>,
  guidedStepsByStableKey: ReadonlyMap<string, PathStepRow>,
) {
  const steps = flattenSteps(path);
  const graphReady = !learningRouteCycle(path.code) || matchesLearningRouteGraph(path);
  const statuses = resolveLearningPathNodeStatuses(
    steps.map((step, index) => ({
      id: step.id,
      prerequisiteIds: prerequisiteIdsForStep(steps, index, guidedStepsByStableKey),
      eligible:
        graphReady &&
        levelEligible(step, currentLevel) &&
        stepArtifactsReady(step) &&
        (!path.code.startsWith(P1_PATH_PREFIX) || path.activeEnrollment === true),
      completed: completedIds.has(step.id),
    })),
    completedIds,
  );

  const nodes = steps.map((step) => {
    const saved = progress.get(step.id);
    const status = statuses.get(step.id) ?? "locked";

    return {
      id: step.id,
      learningPathId: path.id,
      learningPathCode: path.code,
      type: step.type,
      source: step.source,
      code: step.stableKey,
      label: step.title,
      status,
      availability:
        graphReady && stepArtifactsReady(step) ? ("READY" as const) : ("UNAVAILABLE" as const),
      progress: saved ? { sessionCount: saved.sessionCount, accuracy: saved.accuracy } : null,
      templateVersionId: step.exerciseTemplateVersionId,
      contentVersionId: step.contentVersionId,
      assessmentId: step.assessmentId,
      prerequisiteStepId: step.prerequisiteStepId,
      completionRule: step.completionRule,
      unit: step.unit,
      isCurrent: status === "active",
    };
  });

  const completed = nodes.filter((node) => node.status === "completed").length;
  return {
    nodes,
    overallProgress: {
      completed,
      total: nodes.length,
      percent: nodes.length ? Math.round((completed / nodes.length) * 100) : 0,
    },
  };
}

function assessmentResultCompletesStep(
  step: PathStepRow,
  results: Map<string, number | null>,
  pathCode: string,
): boolean {
  if (!step.assessmentId) return false;
  return assessmentResultCompletesLearningStep(
    pathCode,
    results.has(step.assessmentId),
    results.get(step.assessmentId) ?? null,
    step.completionRule,
  );
}

export async function getStudentLearningPath(actor: LearningPathActor) {
  assertStudent(actor);
  try {
    return await withTenantContext(actor, async (tx) => {
      const paths = await findPublishedPaths(tx, actor);
      if (!paths.length) return null;
      const contentUsage = new Map<string, number>();
      for (const path of paths) {
        for (const step of flattenSteps(path)) {
          if (step.contentVersionId) {
            contentUsage.set(
              step.contentVersionId,
              (contentUsage.get(step.contentVersionId) ?? 0) + 1,
            );
          }
        }
      }
      const contentEvidenceStepIds = new Set(
        paths
          .flatMap((path) => flattenSteps(path))
          .filter(
            (step) =>
              Boolean(step.contentVersionId) && contentUsage.get(step.contentVersionId!) === 1,
          )
          .map((step) => step.id),
      );
      const states = await readPathStates(tx, actor, paths, contentEvidenceStepIds);
      if (!states.length) return null;
      const scopes = new Map<
        string,
        {
          states: ReadPathState[];
          progress: Map<string, StepProgressRow>;
          guidedStepsByStableKey: Map<string, PathStepRow>;
          completedIds: Set<string>;
        }
      >();
      for (const state of states) {
        const key = learningPathScopeKey(state.path.code);
        const scope = scopes.get(key) ?? {
          states: [],
          progress: new Map<string, StepProgressRow>(),
          guidedStepsByStableKey: new Map<string, PathStepRow>(),
          completedIds: new Set<string>(),
        };
        scope.states.push(state);
        for (const [stepId, progress] of state.progress) scope.progress.set(stepId, progress);
        for (const step of flattenSteps(state.path)) {
          scope.guidedStepsByStableKey.set(step.stableKey, step);
        }
        scopes.set(key, scope);
      }
      for (const scope of scopes.values()) {
        scope.completedIds = effectiveCompletedIdsForScope(
          scope.states,
          scope.guidedStepsByStableKey,
        );
      }
      const projections = states.map((state) => ({
        path: {
          id: state.path.id,
          code: state.path.code,
          title: state.path.title,
          area: state.path.area,
          routeStatus: state.path.activeEnrollment
            ? "ACTIVE"
            : state.path.completedEnrollment
              ? "COMPLETED"
              : null,
          cycleSequence: learningRouteCycle(state.path.code)?.sequence ?? null,
          nextCycleCode: learningRouteCycle(state.path.code)?.nextPathCode ?? null,
        },
        currentLevel: state.currentLevel
          ? {
              id: state.currentLevel.id,
              code: state.currentLevel.code,
              name: state.currentLevel.name,
            }
          : null,
        ...toNodes(
          state.path,
          state.currentLevel,
          scopes.get(learningPathScopeKey(state.path.code))!.progress,
          scopes.get(learningPathScopeKey(state.path.code))!.completedIds,
          scopes.get(learningPathScopeKey(state.path.code))!.guidedStepsByStableKey,
        ),
      }));
      const primary =
        projections.find((projection) =>
          projection.nodes.some((node) => node.status === "active"),
        ) ?? projections[0];
      const currentPath =
        paths.find((path) => path.activeEnrollment && learningRouteCycle(path.code)) ??
        [...paths]
          .reverse()
          .find((path) => path.completedEnrollment && learningRouteCycle(path.code));
      const upcoming = currentPath ? upcomingLearningRouteCycles(currentPath.code) : [];
      const released = [] as typeof upcoming;
      for (const cycle of upcoming) {
        if (!cycle.publicationApproved()) break;
        released.push(cycle);
      }
      const futureRows =
        released.length && currentPath
          ? await tx.learningPath.findMany({
              where: {
                status: "PUBLISHED",
                deletedAt: null,
                area: currentPath.area as "READING_COMPREHENSION",
                OR: released.map((cycle) => ({ code: cycle.pathCode, version: cycle.version })),
                AND: [
                  { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] },
                  { OR: [{ levelId: null }, { levelId: currentPath.levelId }] },
                ],
              },
              select: PATH_SELECT,
              orderBy: [
                { tenantId: { sort: "desc", nulls: "last" } },
                { levelId: { sort: "desc", nulls: "last" } },
                { id: "asc" },
              ],
            })
          : [];
      const upcomingPaths = [] as typeof projections;
      for (const cycle of released) {
        if (paths.some((path) => path.code === cycle.pathCode)) continue;
        const future = futureRows.find(
          (path) =>
            path.code === cycle.pathCode &&
            matchesLearningRouteGraph(path) &&
            flattenSteps(path).every(stepArtifactsReady),
        );
        if (!future) break;
        upcomingPaths.push({
          path: {
            id: future.id,
            code: future.code,
            title: future.title,
            area: future.area,
            routeStatus: null,
            cycleSequence: cycle.sequence,
            nextCycleCode: cycle.nextPathCode,
          },
          currentLevel: primary!.currentLevel,
          ...toNodes(future, null, new Map(), new Set(), new Map()),
        });
        for (const node of upcomingPaths.at(-1)!.nodes) {
          node.status = "locked";
          node.isCurrent = false;
        }
      }
      const currentRouteCycle = currentPath ? learningRouteCycle(currentPath.code) : null;
      const visibleRouteGroups = [...projections, ...upcomingPaths];
      // The student roadmap renders P0 history and the enrolled P1 route in
      // one ordered list. Count every real position shown there so reserved
      // placeholders fill only the remaining slots up to the roadmap target.
      const visibleRouteStationCount = currentRouteCycle
        ? countVisibleLearningRoutePositions(visibleRouteGroups)
        : 0;
      const plannedNodes =
        currentPath && currentRouteCycle
          ? buildPlannedLearningRouteNodes({
              currentPathCode: currentPath.code,
              representedPathCodes: new Set(
                visibleRouteGroups.map((projection) => projection.path.code),
              ),
              visibleStationCount: visibleRouteStationCount,
              targetStationCount: LEARNING_ROUTE_VISIBLE_STATION_TARGET,
            })
          : [];
      const plannedPaths =
        currentPath && currentRouteCycle && plannedNodes.length
          ? [
              {
                path: {
                  id: `planned-route-${currentRouteCycle.routeFamily}`,
                  code: `EDUCATION_V2_P1_${currentRouteCycle.routeFamily}_PLANNED`,
                  title: "Gelecekteki istasyonlar",
                  area: currentPath.area,
                  routeStatus: null,
                  cycleSequence: null,
                  nextCycleCode: null,
                },
                currentLevel: primary!.currentLevel,
                nodes: plannedNodes,
              },
            ]
          : [];
      const routeCompleted = projections.reduce(
        (sum, projection) => sum + projection.overallProgress.completed,
        0,
      );
      const routeTotal = [...projections, ...upcomingPaths, ...plannedPaths].reduce(
        (sum, projection) => sum + projection.nodes.length,
        0,
      );
      return {
        ...primary,
        paths: projections,
        upcomingPaths,
        plannedPaths,
        routeProgress: {
          completed: routeCompleted,
          total: routeTotal,
          percent: routeTotal ? Math.floor((routeCompleted / routeTotal) * 100) : 0,
        },
        routeContinuation: currentPath
          ? {
              currentPathCode: currentPath.code,
              nextPathCode: learningRouteCycle(currentPath.code)?.nextPathCode ?? null,
              futureCycles: upcoming.map((cycle) => ({
                pathCode: cycle.pathCode,
                title: cycle.title,
                sequence: cycle.sequence,
                stationCount: cycle.manifest.steps.length,
                publicationApproved: cycle.publicationApproved(),
                graphAvailable: upcomingPaths.some((path) => path.path.code === cycle.pathCode),
              })),
            }
          : null,
        source: "PERSISTED_CURRICULUM" as const,
      };
    });
  } catch (error) {
    // The application remains backward-compatible during the migration-first
    // rollout. Once the migration exists, all other database errors surface.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return null;
    }
    throw error;
  }
}

export async function getNextLearningStep(actor: LearningPathActor) {
  assertStudent(actor);
  const path = await getStudentLearningPath(actor);
  const pathProjections = path?.paths ?? (path ? [path] : []);
  const node =
    pathProjections
      .flatMap((projection) => projection.nodes ?? [])
      .find((item) => item.status === "active") ?? null;
  return node
    ? {
        id: node.id,
        learningPathId: node.learningPathId,
        learningPathCode: node.learningPathCode,
        type: node.type,
        title: node.label,
        unitTitle: node.unit.title,
        status: node.status,
        templateVersionId: node.templateVersionId,
        contentVersionId: node.contentVersionId,
        assessmentId: node.assessmentId,
      }
    : null;
}

type LearningPathNavigationStep = {
  id: string;
  type: string;
  title: string;
  unitTitle: string;
  status: "completed" | "active";
  templateVersionId: string | null;
  contentVersionId: string | null;
  assessmentId: string | null;
};

type LearningPathNavigationNode = {
  id: string;
  type: string;
  label: string;
  status: "completed" | "active" | "locked";
  availability?: "READY" | "UNAVAILABLE";
  templateVersionId: string | null;
  contentVersionId: string | null;
  assessmentId: string | null;
  unit: { title: string };
};

function navigationStep(
  node: LearningPathNavigationNode & { status: "completed" | "active" },
): LearningPathNavigationStep {
  return {
    id: node.id,
    type: node.type,
    title: node.label,
    unitTitle: node.unit.title,
    status: node.status,
    templateVersionId: node.templateVersionId,
    contentVersionId: node.contentVersionId,
    assessmentId: node.assessmentId,
  };
}

function isNavigationTarget(
  node: LearningPathNavigationNode | undefined,
): node is LearningPathNavigationNode & { status: "completed" | "active" } {
  return Boolean(node && node.status !== "locked" && node.availability !== "UNAVAILABLE");
}

/**
 * Returns only the immediately adjacent server-authorized stations. A locked
 * neighbor is a hard boundary: later stations must never be exposed as a
 * shortcut, even when their own progress row happens to be completed.
 */
export async function getLearningStepNavigation(
  actor: LearningPathActor,
  currentStepId: string,
): Promise<{
  previousStep: LearningPathNavigationStep | null;
  nextStep: LearningPathNavigationStep | null;
}> {
  assertStudent(actor);
  const path = await getStudentLearningPath(actor);
  const orderedNodes = (path?.paths ?? (path ? [path] : [])).flatMap(
    (projection) => projection.nodes ?? [],
  );
  const currentIndex = orderedNodes.findIndex((node) => node.id === currentStepId);
  if (currentIndex < 0) return { previousStep: null, nextStep: null };

  const previousNode = orderedNodes[currentIndex - 1];
  const nextNode = orderedNodes[currentIndex + 1];
  return {
    previousStep: isNavigationTarget(previousNode) ? navigationStep(previousNode) : null,
    nextStep: isNavigationTarget(nextNode) ? navigationStep(nextNode) : null,
  };
}

export async function assertLearningStepAdjacent(
  actor: LearningPathActor,
  currentStepId: string,
  targetStepId: string,
) {
  const navigation = await getLearningStepNavigation(actor, currentStepId);
  const target = [navigation.previousStep, navigation.nextStep].find(
    (step) => step?.id === targetStepId,
  );
  if (!target) throw forbiddenError("Bu öğrenme adımı mevcut durağın komşusu değil");
  return target;
}

/**
 * Selects the immediately adjacent server-authorized station after the
 * addressed station. Completed stations remain valid replay targets, while a
 * locked station is a hard progression boundary and stops navigation.
 */
export async function getNextLearningStepAfter(actor: LearningPathActor, currentStepId: string) {
  return (await getLearningStepNavigation(actor, currentStepId)).nextStep;
}

export async function assertLearningStepAccessible(actor: LearningPathActor, stepId: string) {
  assertStudent(actor);
  const path = await getStudentLearningPath(actor);
  if (!path) throw forbiddenError("Bu öğrenci için yayınlanmış öğrenme yolu yok");
  const node = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .find((item) => item.id === stepId);
  if (!node) throw forbiddenError("Bu öğrenme adımı bu öğrenci için kullanılabilir değil");
  if (node.status === "locked" || node.availability === "UNAVAILABLE")
    throw forbiddenError("Bu öğrenme adımı henüz açık değil");
  return node;
}

/**
 * Ders tamamlama endpoint'i, öğrenme yoluna bağlı bir içeriği kilit sırasını
 * atlayarak tamamlayamamalıdır. Öğrenme yoluna bağlı olmayan eski dersler için
 * geriye dönük davranış korunur.
 */
export async function assertLearningContentAccessible(
  actor: LearningPathActor,
  contentVersionId: string,
) {
  assertStudent(actor);
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const node = (path.paths ?? [path])
    .concat(path.upcomingPaths ?? [])
    .flatMap((projection) => projection.nodes)
    .find((item) => item.contentVersionId === contentVersionId);
  if (node?.status === "locked") {
    throw forbiddenError("Bu ders öğrenme yolunda henüz açık değil");
  }
}

export async function assertLearningTemplateAccessible(
  actor: LearningPathActor,
  templateVersionId: string,
) {
  assertStudent(actor);
  const path = await getStudentLearningPath(actor);
  if (!path) throw forbiddenError("Bu öğrenci için yayınlanmış öğrenme yolu yok");
  const node = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .find((item) => item.templateVersionId === templateVersionId);
  if (!node) throw forbiddenError("Bu egzersiz öğrenme yolunda bulunmuyor");
  if (node.status === "locked") {
    const resumable = await withTenantContext(actor, (tx) =>
      tx.exerciseSession.findFirst({
        where: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          templateVersionId,
          context: "INDIVIDUAL",
          sessionType: "PRACTICE",
          status: "IN_PROGRESS",
          assignmentId: null,
          assessmentId: null,
        },
        select: { id: true },
      }),
    );
    if (!resumable) throw forbiddenError("Bu öğrenme adımı henüz açık değil");
  }
  return node;
}

async function updateProgress(
  actor: LearningPathActor,
  learningStepId: string,
  status: "IN_PROGRESS" | "COMPLETED",
) {
  assertStudent(actor);
  const now = new Date();
  const update: PrismaTypes.StudentLearningStepProgressUpdateInput = {
    startedAt: now,
    lastActivityAt: now,
  };
  if (status === "COMPLETED") {
    update.status = "COMPLETED";
    update.completedAt = now;
  } else {
    update.status = { set: "IN_PROGRESS" };
  }
  await withTenantContext(actor, (tx) =>
    tx.studentLearningStepProgress.upsert({
      where: {
        tenantId_studentId_learningStepId: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          learningStepId,
        },
      },
      create: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        learningStepId,
        status,
        startedAt: now,
        completedAt: status === "COMPLETED" ? now : null,
        lastActivityAt: now,
      },
      update,
    }),
  );
}

export async function markLearningStepInProgress(actor: LearningPathActor, stepId: string) {
  const node = await assertLearningStepAccessible(actor, stepId);
  if (node.status !== "completed") await updateProgress(actor, stepId, "IN_PROGRESS");
}

export async function completeLearningStep(actor: LearningPathActor, stepId: string) {
  const node = await assertLearningStepAccessible(actor, stepId);
  if (node.status === "completed") return;
  await updateProgress(actor, stepId, "COMPLETED");
}

/**
 * The final roadmap station is an explicit terminal checkpoint, not a lesson
 * or exercise. Keep its completion on the server so the last station can be
 * opened, acknowledged, and leave the roadmap at a consistent 22/22 state.
 */
export async function completeTerminalLearningStep(actor: LearningPathActor, stepId: string) {
  const node = await assertLearningStepAccessible(actor, stepId);
  if (node.type !== "NEXT_LEARNING") {
    throw validationError("Bu öğrenme adımı terminal bir durak değil");
  }
  await completeLearningStep(actor, stepId);
  return {
    learningStep: { id: node.id, title: node.label, status: "completed" as const },
    nextStep: await getNextLearningStepAfter(actor, stepId),
  };
}

export async function completeLearningStepForContentVersion(
  actor: LearningPathActor,
  contentVersionId: string,
) {
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const matches = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .filter((item) => item.contentVersionId === contentVersionId);
  if (matches.length === 1) await completeLearningStep(actor, matches[0]!.id);
}

export async function markLearningStepInProgressForTemplate(
  actor: LearningPathActor,
  templateVersionId: string,
  learningStepId?: string | null,
) {
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const matches = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .filter((item) => item.templateVersionId === templateVersionId);
  const node = learningStepId
    ? matches.find((item) => item.id === learningStepId)
    : matches.length === 1
      ? matches[0]
      : null;
  if (node) await markLearningStepInProgress(actor, node.id);
}

export async function completeLearningStepForSession(
  actor: LearningPathActor,
  session: {
    templateVersionId: string;
    assessmentId: string | null;
    learningStepId?: string | null;
  },
) {
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const matches = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .filter(
      (item) =>
        (session.assessmentId && item.assessmentId === session.assessmentId) ||
        (!session.assessmentId && item.templateVersionId === session.templateVersionId),
    );
  const node = session.learningStepId
    ? matches.find((item) => item.id === session.learningStepId)
    : matches.length === 1
      ? matches[0]
      : null;
  if (!node) return;

  const assessmentId = node.assessmentId;
  if (assessmentId) {
    const tenantId = actor.tenantId;
    if (!tenantId) return;
    const result = await withTenantContext(actor, (tx) =>
      tx.assessmentResult.findFirst({
        where: {
          tenantId,
          studentId: actor.userId,
          assessmentId,
        },
        orderBy: { completedAt: "desc" },
        select: { score: true },
      }),
    );
    if (!result) return;
    if (
      !assessmentResultCompletesLearningStep(
        node.learningPathCode,
        true,
        result.score,
        node.completionRule,
      )
    ) {
      return;
    }
  }

  await completeLearningStep(actor, node.id);
}
