import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { forbiddenError } from "../../lib/errors.js";
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
  status: "LOCKED" | "ACTIVE" | "IN_PROGRESS" | "COMPLETED";
  completedAt: Date | null;
  sessionCount: number;
  accuracy: number | null;
};

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
      OR: [{ tenantId: null }, { tenantId: actor.tenantId ?? undefined }],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: PATH_SELECT,
  });

  const pathsByArea = new Map<string, PublishedPath>();
  for (const row of rows) {
    const current = pathsByArea.get(row.area);
    const isTenantSpecific = row.tenantId === actor.tenantId;
    const currentIsTenantSpecific = current?.tenantId === actor.tenantId;
    if (!current || (isTenantSpecific && !currentIsTenantSpecific)) {
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
): Promise<{
  path: PublishedPath;
  currentLevel: { id: string; code: string; name: string; displayOrder: number } | null;
  progress: Map<string, StepProgressRow>;
} | null> {
  assertStudent(actor);
  const path = selectedPath ?? (await findPublishedPath(tx, actor));
  if (!path) return null;

  const pathSteps = flattenSteps(path);
  const templateVersionIds = pathSteps
    .map((step) => step.exerciseTemplateVersionId)
    .filter((id): id is string => Boolean(id));
  const contentVersionIds = pathSteps
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
      templateVersionIds.length
        ? tx.exerciseSession.groupBy({
            by: ["templateVersionId"],
            where: {
              tenantId: actor.tenantId,
              studentId: actor.userId,
              templateVersionId: { in: templateVersionIds },
              context: "INDIVIDUAL",
              status: "COMPLETED",
            },
            _count: { _all: true },
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

  const completedByTemplate = new Map(
    exerciseCounts.map((row) => [row.templateVersionId, row._count._all] as const),
  );
  const completedByContent = new Map(
    lessonCounts.map((row) => [row.contentVersionId, row._count._all] as const),
  );
  const latestAssessment = new Map<string, number | null>();
  for (const result of assessmentResults) {
    if (!latestAssessment.has(result.assessmentId)) {
      latestAssessment.set(result.assessmentId, result.score);
    }
  }

  const progress = new Map(
    progressRows.map((row) => {
      const step = pathSteps.find((candidate) => candidate.id === row.learningStepId);
      const sessionCount = step?.exerciseTemplateVersionId
        ? (completedByTemplate.get(step.exerciseTemplateVersionId) ?? 0)
        : step?.contentVersionId
          ? (completedByContent.get(step.contentVersionId) ?? 0)
          : step?.assessmentId
            ? assessmentResultCompletesStep(step, latestAssessment)
              ? 1
              : 0
            : 0;
      const accuracy = step?.assessmentId
        ? (latestAssessment.get(step.assessmentId) ?? null)
        : null;
      const effectiveStatus =
        row.status === "COMPLETED" || sessionCount > 0 ? "COMPLETED" : row.status;
      return [
        row.learningStepId,
        { ...row, status: effectiveStatus, sessionCount, accuracy },
      ] as const;
    }),
  );

  for (const step of pathSteps) {
    if (progress.has(step.id)) continue;
    const sessionCount = step.exerciseTemplateVersionId
      ? (completedByTemplate.get(step.exerciseTemplateVersionId) ?? 0)
      : step.contentVersionId
        ? (completedByContent.get(step.contentVersionId) ?? 0)
        : step.assessmentId && assessmentResultCompletesStep(step, latestAssessment)
          ? 1
          : 0;
    if (sessionCount > 0) {
      progress.set(step.id, {
        learningStepId: step.id,
        status: "COMPLETED",
        completedAt: null,
        sessionCount,
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

function prerequisiteIdsForStep(steps: ReturnType<typeof flattenSteps>, index: number) {
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
  return [...ids];
}

function toNodes(
  path: PublishedPath,
  currentLevel: { id: string; code: string; name: string; displayOrder: number } | null,
  progress: Map<string, StepProgressRow>,
  globallyCompletedIds: Set<string>,
) {
  const steps = flattenSteps(path);
  let activeAssigned = false;

  const nodes = steps.map((step, index) => {
    const saved = progress.get(step.id);
    let status: "completed" | "active" | "locked" = "locked";
    if (saved?.status === "COMPLETED") {
      status = "completed";
    } else {
      const prerequisiteIds = prerequisiteIdsForStep(steps, index);
      const prerequisiteCompleted = prerequisiteIds.every((id) => globallyCompletedIds.has(id));
      const eligible = levelEligible(step, currentLevel);
      if (!activeAssigned && prerequisiteCompleted && eligible) {
        status = "active";
        activeAssigned = true;
      }
    }

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
      const states = (
        await Promise.all(paths.map((path) => readPathState(tx, actor, path)))
      ).filter((state): state is NonNullable<typeof state> => Boolean(state));
      if (!states.length) return null;
      const allProgress = new Map(states.flatMap((state) => [...state.progress.entries()]));
      const globallyCompletedIds = new Set(
        [...allProgress.values()]
          .filter((stepProgress) => stepProgress.status === "COMPLETED")
          .map((stepProgress) => stepProgress.learningStepId),
      );
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
        ...toNodes(state.path, state.currentLevel, allProgress, globallyCompletedIds),
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
        templateVersionId: node.templateVersionId,
        contentVersionId: node.contentVersionId,
        assessmentId: node.assessmentId,
      }
    : null;
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
  await assertLearningStepAccessible(actor, stepId);
  await updateProgress(actor, stepId, "COMPLETED");
}

export async function completeLearningStepForContentVersion(
  actor: LearningPathActor,
  contentVersionId: string,
) {
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const node = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .find((item) => item.contentVersionId === contentVersionId);
  if (node) await completeLearningStep(actor, node.id);
}

export async function markLearningStepInProgressForTemplate(
  actor: LearningPathActor,
  templateVersionId: string,
) {
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const node = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .find((item) => item.templateVersionId === templateVersionId);
  if (node) await markLearningStepInProgress(actor, node.id);
}

export async function completeLearningStepForSession(
  actor: LearningPathActor,
  session: { templateVersionId: string; assessmentId: string | null },
) {
  const path = await getStudentLearningPath(actor);
  if (!path) return;
  const node = (path.paths ?? [path])
    .flatMap((projection) => projection.nodes)
    .find(
      (item) =>
        (session.assessmentId && item.assessmentId === session.assessmentId) ||
        (!session.assessmentId && item.templateVersionId === session.templateVersionId),
    );
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
