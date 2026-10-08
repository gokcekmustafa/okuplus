import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { forbiddenError, validationError } from "../../lib/errors.js";
import {
  ACADEMIC_P0_GUIDED_SKILL_ORDER,
  getAcademicP0GuidedSkillPrerequisite,
} from "../../curriculum/academic-reading-p0.js";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor, type StudentActor } from "../student-learning/policy.js";

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
  };
}>;

type PathUnitRow = {
  id: string;
  code: string;
  title: string;
  position: number;
  steps: PathStepRow[];
};

type PublishedPath = {
  id: string;
  tenantId: string | null;
  code: string;
  title: string;
  area: string;
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
  const contentUsage = new Map<string, number>();
  for (const step of steps) {
    if (step.contentVersionId) {
      contentUsage.set(step.contentVersionId, (contentUsage.get(step.contentVersionId) ?? 0) + 1);
    }
  }

  const sessionCounts = new Map<string, number>();
  for (const session of sessions) {
    if (!session.learningStepId) continue;
    const step = stepById.get(session.learningStepId);
    if (!step || step.exerciseTemplateVersionId !== session.templateVersionId) continue;
    sessionCounts.set(session.learningStepId, (sessionCounts.get(session.learningStepId) ?? 0) + 1);
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
    select: PATH_SELECT,
  });

  const pathsByArea = new Map<string, PublishedPath>();
  for (const row of rows) {
    const current = pathsByArea.get(row.area);
    if (shouldReplacePublishedPath(current, row, actor.tenantId)) {
      pathsByArea.set(row.area, row as PublishedPath);
    }
  }
  const areaOrder = new Map([
    ["FAST_READING", 0],
    ["READING_COMPREHENSION", 1],
    ["COMMON", 2],
  ]);
  return [...pathsByArea.values()].sort(
    (a, b) =>
      (areaOrder.get(a.area) ?? Number.MAX_SAFE_INTEGER) -
        (areaOrder.get(b.area) ?? Number.MAX_SAFE_INTEGER) || a.area.localeCompare(b.area),
  );
}

export function shouldReplacePublishedPath(
  current: { code: string; tenantId: string | null } | undefined,
  candidate: { code: string; tenantId: string | null },
  actorTenantId: string | null,
): boolean {
  if (!current) return true;

  const candidateIsAssignedP1 = candidate.code.startsWith(P1_PATH_PREFIX);
  const currentIsAssignedP1 = current.code.startsWith(P1_PATH_PREFIX);
  if (candidateIsAssignedP1 !== currentIsAssignedP1) return candidateIsAssignedP1;

  const candidateIsTenantSpecific = candidate.tenantId === actorTenantId;
  const currentIsTenantSpecific = current.tenantId === actorTenantId;
  if (candidateIsTenantSpecific !== currentIsTenantSpecific) {
    return candidateIsTenantSpecific;
  }

  const candidateIsCanonicalP0 = candidate.code.startsWith(P0_PATH_PREFIX);
  const currentIsCanonicalP0 = current.code.startsWith(P0_PATH_PREFIX);
  return candidateIsCanonicalP0 && !currentIsCanonicalP0;
}

async function findPublishedPath(tx: PrismaTypes.TransactionClient, actor: LearningPathActor) {
  return (await findPublishedPaths(tx, actor))[0] ?? null;
}

function flattenSteps(path: PublishedPath) {
  return path.units.flatMap((unit) =>
    unit.steps.map((step) => ({
      ...step,
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

async function readPathState(
  tx: PrismaTypes.TransactionClient,
  actor: LearningPathActor,
  selectedPath?: PublishedPath,
  contentEvidenceStepIds?: ReadonlySet<string>,
): Promise<{
  path: PublishedPath;
  currentLevel: { id: string; code: string; name: string; displayOrder: number } | null;
  progress: Map<string, StepProgressRow>;
} | null> {
  assertStudent(actor);
  const path = selectedPath ?? (await findPublishedPath(tx, actor));
  if (!path) return null;

  const pathSteps = flattenSteps(path);
  const pathStepIds = pathSteps.map((step) => step.id);
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
          learningStep: { unit: { pathId: path.id } },
        },
        select: { learningStepId: true, status: true, completedAt: true },
      }),
      pathStepIds.length
        ? tx.exerciseSession.findMany({
            where: {
              tenantId: actor.tenantId,
              studentId: actor.userId,
              learningStepId: { in: pathStepIds },
              context: "INDIVIDUAL",
              sessionType: "PRACTICE",
              status: "COMPLETED",
              assignmentId: null,
              assessmentId: null,
              trainingSessionItem: { is: null },
            },
            select: { learningStepId: true, templateVersionId: true },
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

  const progress = new Map(
    progressRows.map((row) => {
      const step = stepById.get(row.learningStepId);
      const evidence = stepEvidence.get(row.learningStepId);
      const assessmentCompleted = step?.assessmentId
        ? assessmentResultCompletesStep(step, latestAssessment)
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
      ? assessmentResultCompletesStep(step, latestAssessment)
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

  return {
    path,
    currentLevel,
    progress,
  };
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
  const statuses = resolveLearningPathNodeStatuses(
    steps.map((step, index) => ({
      id: step.id,
      prerequisiteIds: prerequisiteIdsForStep(steps, index, guidedStepsByStableKey),
      eligible: levelEligible(step, currentLevel),
      completed: completedIds.has(step.id),
    })),
    completedIds,
  );

  const nodes = steps.map((step) => {
    const saved = progress.get(step.id);
    const status = statuses.get(step.id) ?? "locked";

    return {
      id: step.id,
      type: step.type,
      source: step.source,
      code: step.stableKey,
      label: step.title,
      status,
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

function minimumScoreFromCompletionRule(rule: PrismaTypes.JsonValue): number | null {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
  const value = (rule as Record<string, unknown>).minimumScore;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assessmentResultCompletesStep(
  step: PathStepRow,
  results: Map<string, number | null>,
): boolean {
  if (!step.assessmentId || !results.has(step.assessmentId)) return false;
  const minimumScore = minimumScoreFromCompletionRule(step.completionRule);
  const score = results.get(step.assessmentId) ?? null;
  return minimumScore === null || (score !== null && score >= minimumScore);
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
      const states = (
        await Promise.all(
          paths.map((path) => readPathState(tx, actor, path, contentEvidenceStepIds)),
        )
      ).filter((state): state is NonNullable<typeof state> => Boolean(state));
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
      return {
        ...primary,
        paths: projections,
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
  return Boolean(node && node.status !== "locked");
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
  if (node.status === "locked") throw forbiddenError("Bu öğrenme adımı henüz açık değil");
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
    const minimumScore = minimumScoreFromCompletionRule(node.completionRule);
    if (minimumScore !== null && (result.score === null || result.score < minimumScore)) return;
  }

  await completeLearningStep(actor, node.id);
}
