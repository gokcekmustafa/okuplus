import { Prisma, type PlatformRole } from "@prisma/client";
import { notFoundError, validationError } from "../../lib/errors.js";
import {
  ACADEMIC_P0_COMMON_FLOW,
  ACADEMIC_P0_LESSONS,
} from "../../curriculum/academic-reading-p0.js";
import {
  EDUCATION_V2_P1_A_LEVEL_CODE,
  EDUCATION_V2_P1_A_PATH_VERSION,
  EDUCATION_V2_P1_A_PROGRAM,
  EDUCATION_V2_P1_A_PATH_CODE_PREFIX,
} from "../../curriculum/education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_V2_VERSION,
  isEducationV2P1ACycleV2ProductionAssignmentEnabled,
} from "../../curriculum/education-v2-p1-a-cycle-v2-program.js";
import { buildEducationV2P1ALearningCycleManifest } from "../../curriculum/learning-cycle-manifest.js";
import { EDUCATION_V2_P0_PATH_SCOPE_CODE } from "../../curriculum/education-v2-p0-program.js";
import {
  assertTeacherClassAccess,
  type TeacherAssignmentActor,
} from "../assignments/teacher-service.js";
import { resolveLearningPathStepEvidence } from "../learning-path/service.js";
import { readSkillResults } from "../measurements/service.js";
import { resolveTrainingRuntimeConfig } from "../training/exercise-contract.js";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor, type StudentActor } from "./policy.js";
import {
  P1_ROUTE_SELECTION_POLICY_VERSION,
  isP1PathCode,
  routeFamilyFromPathCode,
  selectP1Route,
  type RouteSelectionCandidate,
  type RouteSelectionMeasurement,
  type RouteSelectionResult,
} from "./route-selection.js";

const P0_PATH_PREFIX = "EDUCATION_V2_P0_";
const P0_LEGACY_PATH_PREFIX = "EDU-V2-P0-";
const P0_CANONICAL_PATH_VERSION = 1;
const P1_PATH_PREFIX = "EDUCATION_V2_P1_";
export const P1_A_INITIAL_PATH_CODE = `${EDUCATION_V2_P1_A_PATH_CODE_PREFIX}${EDUCATION_V2_P1_A_LEVEL_CODE}`;
const P1_A_NEXT_CYCLE_PATH_CODE = "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12";
export const P1_CYCLE_TRANSITION_POLICY_VERSION = "P1_CYCLE_TRANSITION_V1" as const;
const P0_PATH_AREAS = ["FAST_READING", "READING_COMPREHENSION", "COMMON"] as const;
const P0_CANONICAL_STEP_COUNT =
  ACADEMIC_P0_LESSONS.length * 3 + ACADEMIC_P0_COMMON_FLOW.stages.length;

type P1StudentActor = StudentActor & {
  tenantId: string;
  platformRole: null;
};

type P0Step = {
  id: string;
  pathId?: string;
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
  contentVersion: {
    status: string;
    content: { status: string; deletedAt: Date | null };
  } | null;
  exerciseTemplateVersion: {
    status: string;
    template: { status: string; deletedAt: Date | null };
  } | null;
  assessment: { status: string; deletedAt: Date | null } | null;
  completionRule: Prisma.JsonValue;
};

type P0State = {
  pathId: string;
  levelId: string | null;
  canonicalGraphReady: boolean;
  levelScopeReady: boolean;
  completed: boolean;
  measurement: RouteSelectionMeasurement | null;
};

export type P1TransitionReadinessStatus =
  | "P0_GRAPH_NOT_READY"
  | "P0_LEVEL_SCOPE_NOT_READY"
  | "P0_NOT_COMPLETED"
  | "FINAL_MEASUREMENT_MISSING"
  | "MEASUREMENT_REVIEW_REQUIRED"
  | "P1_CURRICULUM_UNAVAILABLE"
  | "ASSIGNED"
  | "ALREADY_ASSIGNED";

export type P1TransitionReadiness = {
  status: P1TransitionReadinessStatus;
  p0GraphReady: boolean | null;
  p0LevelScopeReady: boolean | null;
  p0Completed: boolean | null;
  finalMeasurementAvailable: boolean | null;
  candidateAvailable: boolean | null;
};

export type P1TransitionInput = {
  p0LearningPathId: string;
};

export type P1TransitionResult = {
  outcome: "ASSIGNED" | "ALREADY_ASSIGNED" | "REVIEW_REQUIRED";
  enrollmentId: string | null;
  selection: RouteSelectionResult;
  readiness: P1TransitionReadiness;
};

export type P1CycleTransitionResult = {
  outcome: "ASSIGNED" | "ALREADY_ASSIGNED" | "REVIEW_REQUIRED";
  currentLearningPathId: string;
  nextLearningPathId: string | null;
  readiness: {
    status:
      | "CURRENT_CYCLE_NOT_COMPLETED"
      | "NEXT_CYCLE_UNAVAILABLE"
      | "NOT_APPLICABLE"
      | "ASSIGNED"
      | "ALREADY_ASSIGNED";
    currentCycleCompleted: boolean;
    nextCycleAvailable: boolean;
  };
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
  if (previous && (!step.pathId || !previous.pathId || step.pathId === previous.pathId)) {
    ids.add(previous.id);
  }
  return [...ids];
}

function hasP0StepArtifact(step: P0Step): boolean {
  if (step.type === "TEACHING" || step.type === "SMALL_STUDY") {
    return (
      Boolean(step.contentVersionId) &&
      step.contentVersion?.status === "PUBLISHED" &&
      step.contentVersion.content.status === "PUBLISHED" &&
      step.contentVersion.content.deletedAt === null
    );
  }
  if (step.type === "PRACTICE" || step.type === "REINFORCEMENT") {
    return (
      Boolean(step.exerciseTemplateVersionId) &&
      step.exerciseTemplateVersion?.status === "PUBLISHED" &&
      step.exerciseTemplateVersion.template.status === "PUBLISHED" &&
      step.exerciseTemplateVersion.template.deletedAt === null
    );
  }
  if (step.type === "ASSESSMENT") {
    return (
      Boolean(step.assessmentId) &&
      step.assessment?.status === "PUBLISHED" &&
      step.assessment.deletedAt === null
    );
  }
  return true;
}

export type P1CandidateStepReadinessInput = {
  type: P0Step["type"];
  contentVersionId: string | null;
  contentVersion: {
    status: string;
    content: { status: string; deletedAt: Date | null };
  } | null;
  exerciseTemplateVersionId: string | null;
  exerciseTemplateVersion: {
    status: string;
    config: Prisma.JsonValue | null;
    template: { status: string; deletedAt: Date | null };
  } | null;
  assessmentId: string | null;
  assessment: { status: string; deletedAt: Date | null } | null;
};

function hasPublishedContentArtifact(step: P1CandidateStepReadinessInput): boolean {
  return Boolean(
    step.contentVersionId &&
    step.contentVersion?.status === "PUBLISHED" &&
    step.contentVersion.content.status === "PUBLISHED" &&
    step.contentVersion.content.deletedAt === null,
  );
}

function hasPublishedTemplateArtifact(step: P1CandidateStepReadinessInput): boolean {
  const runtimeConfig = step.exerciseTemplateVersion
    ? resolveTrainingRuntimeConfig("TRAINING", step.exerciseTemplateVersion.config)
    : null;
  return Boolean(
    step.exerciseTemplateVersionId &&
    step.exerciseTemplateVersion?.status === "PUBLISHED" &&
    step.exerciseTemplateVersion.template.status === "PUBLISHED" &&
    step.exerciseTemplateVersion.template.deletedAt === null &&
    runtimeConfig?.status === "READY",
  );
}

/**
 * Checks the artifact contract for one published P1 candidate step.
 * SMALL_STUDY is intentionally content-or-template backed: P0 uses the
 * lesson form while P1-A uses a published exercise template for its short
 * study stations.
 */
export function isReadyP1CandidateStep(step: P1CandidateStepReadinessInput): boolean {
  if (step.type === "TEACHING") return hasPublishedContentArtifact(step);
  if (step.type === "SMALL_STUDY") {
    return hasPublishedContentArtifact(step) || hasPublishedTemplateArtifact(step);
  }
  if (step.type === "PRACTICE" || step.type === "REINFORCEMENT") {
    return hasPublishedTemplateArtifact(step);
  }
  if (step.type === "ASSESSMENT") {
    return Boolean(
      step.assessmentId &&
      step.assessment?.status === "PUBLISHED" &&
      step.assessment.deletedAt === null,
    );
  }
  return false;
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

export function nextP1CyclePathCode(pathCode: string): string | null {
  return pathCode === P1_A_INITIAL_PATH_CODE ? P1_A_NEXT_CYCLE_PATH_CODE : null;
}

/**
 * Resolves the published final assessment step for an older session that was
 * created before `learningStepId` was persisted. The assessment id is only
 * accepted inside the student's own published initial P1 enrollment; this
 * keeps legacy-session recovery tenant- and route-scoped.
 */
export async function resolveP1CycleTransitionStep(
  actor: StudentActor,
  input: { learningStepId: string | null; assessmentId: string | null },
): Promise<{ learningStepId: string; learningPathId: string } | null> {
  assertStudentActor(actor);
  const assessmentId = input.assessmentId;
  if (!assessmentId && !input.learningStepId) return null;

  return withTenantContext(actor, async (tx) => {
    const currentPath = await tx.learningPath.findFirst({
      where: {
        code: P1_A_INITIAL_PATH_CODE,
        status: "PUBLISHED",
        deletedAt: null,
        enrollments: {
          some: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            routeStatus: { in: ["ACTIVE", "COMPLETED", "PAUSED"] },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!currentPath) return null;

    const stepScope = {
      type: "ASSESSMENT" as const,
      status: "PUBLISHED" as const,
      isActive: true,
      unit: { pathId: currentPath.id, status: "PUBLISHED" as const },
    };
    const step = input.learningStepId
      ? await tx.learningStep.findFirst({
          where: {
            id: input.learningStepId,
            ...(assessmentId ? { assessmentId } : {}),
            ...stepScope,
          },
          select: { id: true },
        })
      : null;
    const assessmentStep =
      step ??
      (assessmentId
        ? await tx.learningStep.findFirst({
            where: { assessmentId, ...stepScope },
            select: { id: true },
          })
        : null);
    return assessmentStep
      ? { learningStepId: assessmentStep.id, learningPathId: currentPath.id }
      : null;
  });
}

function p1CycleReviewResult(
  currentLearningPathId: string,
  status: "CURRENT_CYCLE_NOT_COMPLETED" | "NEXT_CYCLE_UNAVAILABLE" | "NOT_APPLICABLE",
  currentCycleCompleted: boolean,
  nextCycleAvailable = false,
): P1CycleTransitionResult {
  return {
    outcome: "REVIEW_REQUIRED",
    currentLearningPathId,
    nextLearningPathId: null,
    readiness: { status, currentCycleCompleted, nextCycleAvailable },
  };
}

function routeCandidateAvailable(
  candidates: readonly RouteSelectionCandidate[],
  family: RouteSelectionResult["routeFamily"],
): boolean | null {
  if (!family) return null;
  return candidates.some(
    (candidate) =>
      candidate.status === "PUBLISHED" &&
      candidate.curriculumReady !== false &&
      routeFamilyFromPathCode(candidate.code) === family,
  );
}

function reviewReadinessStatus(
  selection: RouteSelectionResult,
  candidates: readonly RouteSelectionCandidate[],
): P1TransitionReadinessStatus {
  const candidateAvailable = routeCandidateAvailable(candidates, selection.routeFamily);
  const isBalancedProfile =
    selection.routeFamily === "A" && selection.supportingSignals.routeSelectionProfile === null;
  if (
    selection.routeFamily &&
    (isBalancedProfile || selection.supportingSignals.routeSelectionProfile !== null) &&
    candidateAvailable === false
  ) {
    return "P1_CURRICULUM_UNAVAILABLE";
  }
  return "MEASUREMENT_REVIEW_REQUIRED";
}

function reviewResult(
  p0: P0State,
  selection: RouteSelectionResult,
  status: P1TransitionReadinessStatus,
  candidateAvailable: boolean | null,
): P1TransitionResult {
  return {
    outcome: "REVIEW_REQUIRED",
    enrollmentId: null,
    selection,
    readiness: {
      status,
      p0GraphReady: p0.canonicalGraphReady,
      p0LevelScopeReady: p0.levelScopeReady,
      p0Completed: p0.completed,
      finalMeasurementAvailable: Boolean(p0.measurement),
      candidateAvailable,
    },
  };
}

async function loadP0State(
  tx: Prisma.TransactionClient,
  actor: { userId: string; tenantId: string },
  p0LearningPathId: string,
): Promise<P0State | null> {
  const anchorPath = await tx.learningPath.findFirst({
    where: {
      id: p0LearningPathId,
      status: "PUBLISHED",
      deletedAt: null,
      AND: [
        {
          OR: [
            { code: { startsWith: P0_PATH_PREFIX } },
            { code: { startsWith: P0_LEGACY_PATH_PREFIX } },
          ],
        },
        { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] },
      ],
      enrollments: { some: { tenantId: actor.tenantId, studentId: actor.userId } },
    },
    select: {
      id: true,
      tenantId: true,
      levelId: true,
      code: true,
      area: true,
    },
  });
  if (!anchorPath) return null;

  const anchorIsCanonical = anchorPath.code.startsWith(P0_PATH_PREFIX);
  const pathScopeCode =
    anchorPath.code.match(
      /^EDUCATION_V2_P0_(?:FAST_READING|READING_COMPREHENSION|COMMON)_(.+)$/u,
    )?.[1] ?? EDUCATION_V2_P0_PATH_SCOPE_CODE;
  const canonicalCodes = P0_PATH_AREAS.map((area) => `EDUCATION_V2_P0_${area}_${pathScopeCode}`);
  const paths = await tx.learningPath.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      ...(anchorIsCanonical && canonicalCodes.length
        ? { code: { in: canonicalCodes } }
        : { code: { startsWith: P0_LEGACY_PATH_PREFIX } }),
      OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
      version: P0_CANONICAL_PATH_VERSION,
    },
    orderBy: [{ area: "asc" }, { version: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      tenantId: true,
      levelId: true,
      area: true,
      level: { select: { code: true } },
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
              contentVersion: {
                select: { status: true, content: { select: { status: true, deletedAt: true } } },
              },
              exerciseTemplateVersion: {
                select: {
                  status: true,
                  template: { select: { status: true, deletedAt: true } },
                },
              },
              assessment: { select: { status: true, deletedAt: true } },
              completionRule: true,
            },
          },
        },
      },
    },
  });

  const selectedPaths = P0_PATH_AREAS.map((area) => {
    const candidates = paths.filter((path) => path.area === area);
    if (area === anchorPath.area) {
      return candidates.find((path) => path.id === anchorPath.id) ?? null;
    }
    return (
      candidates.find((path) => path.tenantId === anchorPath.tenantId) ??
      candidates.find((path) => path.tenantId === null) ??
      candidates[0] ??
      null
    );
  }).filter((path): path is (typeof paths)[number] => Boolean(path));
  const steps = selectedPaths.flatMap((path) =>
    path.units.flatMap((unit) =>
      unit.steps.map((step) => ({ ...step, pathId: path.id }) as P0Step),
    ),
  );
  const completeCanonicalGraph =
    selectedPaths.length === P0_PATH_AREAS.length &&
    steps.length === P0_CANONICAL_STEP_COUNT &&
    steps.every(hasP0StepArtifact);
  const levelScopeReady =
    selectedPaths.length === P0_PATH_AREAS.length &&
    anchorPath.levelId !== null &&
    selectedPaths.every((path) => path.levelId === anchorPath.levelId);
  if (!steps.length)
    return {
      pathId: anchorPath.id,
      levelId: anchorPath.levelId,
      canonicalGraphReady: false,
      levelScopeReady: false,
      completed: false,
      measurement: null,
    };

  if (!completeCanonicalGraph) {
    return {
      pathId: anchorPath.id,
      levelId: anchorPath.levelId,
      canonicalGraphReady: false,
      levelScopeReady,
      completed: false,
      measurement: null,
    };
  }

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

  return {
    pathId: anchorPath.id,
    levelId: anchorPath.levelId,
    canonicalGraphReady: true,
    levelScopeReady,
    completed: completedP0,
    measurement,
  };
}

async function loadCandidates(
  tx: Prisma.TransactionClient,
  actor: { tenantId: string },
  levelId: string | null,
): Promise<RouteSelectionCandidate[]> {
  const paths = await tx.learningPath.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      code: { startsWith: P1_PATH_PREFIX },
      AND: [
        { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] },
        ...(levelId ? [{ OR: [{ levelId: null }, { levelId }] }] : []),
      ],
    },
    select: {
      id: true,
      code: true,
      version: true,
      levelId: true,
      status: true,
      units: {
        where: { status: "PUBLISHED" },
        select: {
          steps: {
            where: { status: "PUBLISHED", isActive: true },
            select: {
              type: true,
              contentVersionId: true,
              exerciseTemplateVersionId: true,
              assessmentId: true,
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
    },
  });
  return paths.flatMap((path) => {
    const steps = path.units.flatMap((unit) => unit.steps);
    const curriculumReady =
      path.units.length > 0 &&
      path.units.every((unit) => unit.steps.length > 0) &&
      steps.every(isReadyP1CandidateStep);
    return curriculumReady
      ? [
          {
            id: path.id,
            code: path.code,
            version: path.version,
            levelId: path.levelId,
            status: path.status,
            curriculumReady: true,
          },
        ]
      : [];
  });
}

async function reconcileInTransaction(
  tx: Prisma.TransactionClient,
  actor: P1StudentActor,
  input: P1TransitionInput,
): Promise<P1TransitionResult> {
  const p0 = await loadP0State(tx, actor, input.p0LearningPathId);
  if (!p0) throw notFoundError("P0 öğrenme yolu bulunamadı");
  if (!p0.canonicalGraphReady) {
    return reviewResult(
      p0,
      selectP1Route({ levelId: p0.levelId, measurement: null, candidates: [] }),
      "P0_GRAPH_NOT_READY",
      null,
    );
  }
  if (!p0.levelScopeReady) {
    return reviewResult(
      p0,
      selectP1Route({ levelId: p0.levelId, measurement: null, candidates: [] }),
      "P0_LEVEL_SCOPE_NOT_READY",
      null,
    );
  }
  if (!p0.completed) {
    return reviewResult(
      p0,
      selectP1Route({ levelId: p0.levelId, measurement: null, candidates: [] }),
      "P0_NOT_COMPLETED",
      null,
    );
  }
  if (!p0.measurement) {
    return reviewResult(
      p0,
      selectP1Route({ levelId: p0.levelId, measurement: null, candidates: [] }),
      "FINAL_MEASUREMENT_MISSING",
      null,
    );
  }

  const candidates = await loadCandidates(tx, actor, p0.levelId);
  const selection = selectP1Route({
    levelId: p0.levelId,
    measurement: p0.measurement,
    candidates,
  });
  if (selection.status !== "READY" || !selection.recommendedPathId || !p0.measurement.id) {
    return reviewResult(
      p0,
      selection,
      reviewReadinessStatus(selection, candidates),
      routeCandidateAvailable(candidates, selection.routeFamily),
    );
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
    return {
      outcome: "ALREADY_ASSIGNED",
      enrollmentId: existing.id,
      selection,
      readiness: {
        status: "ALREADY_ASSIGNED",
        p0GraphReady: p0.canonicalGraphReady,
        p0LevelScopeReady: p0.levelScopeReady,
        p0Completed: p0.completed,
        finalMeasurementAvailable: true,
        candidateAvailable: true,
      },
    };
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

  return {
    outcome: "ASSIGNED",
    enrollmentId: enrollment.id,
    selection,
    readiness: {
      status: "ASSIGNED",
      p0GraphReady: p0.canonicalGraphReady,
      p0LevelScopeReady: p0.levelScopeReady,
      p0Completed: p0.completed,
      finalMeasurementAvailable: true,
      candidateAvailable: true,
    },
  };
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
        readiness: {
          status: "ALREADY_ASSIGNED",
          p0GraphReady: null,
          p0LevelScopeReady: null,
          p0Completed: null,
          finalMeasurementAvailable: null,
          candidateAvailable: null,
        },
      };
    });
  }
}

type P1CycleStep = P1CandidateStepReadinessInput & {
  id: string;
  stableKey: string;
  position: number;
  prerequisiteStepId: string | null;
  status: string;
  isActive: boolean;
  completionRule: Prisma.JsonValue;
};

type P1CycleGraph = {
  code: string;
  version: number;
  units: Array<{
    code: string;
    status: string;
    steps: P1CycleStep[];
  }>;
};

function p1CycleShape(pathCode: string): {
  version: number;
  unitCodes: readonly string[];
  steps: readonly { stableKey: string; type: string; prerequisiteKeys: readonly string[] }[];
} | null {
  if (pathCode === P1_A_INITIAL_PATH_CODE) {
    const manifest = buildEducationV2P1ALearningCycleManifest();
    return {
      version: EDUCATION_V2_P1_A_PATH_VERSION,
      unitCodes: EDUCATION_V2_P1_A_PROGRAM.path.units.map((unit) => unit.code),
      steps: manifest.steps,
    };
  }
  if (pathCode === P1_A_NEXT_CYCLE_PATH_CODE) {
    return {
      version: EDUCATION_V2_P1_A_CYCLE_V2_VERSION,
      unitCodes: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units.map((unit) => unit.code),
      steps: EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST.steps,
    };
  }
  return null;
}

function hasExpectedP1CycleGraph(path: P1CycleGraph): boolean {
  const shape = p1CycleShape(path.code);
  if (!shape || path.version !== shape.version || path.units.length !== shape.unitCodes.length) {
    return false;
  }
  const actualUnitCodes = path.units.map((unit) => unit.code);
  if (
    actualUnitCodes.some((code, index) => code !== shape.unitCodes[index]) ||
    path.units.some((unit) => unit.status !== "PUBLISHED")
  ) {
    return false;
  }

  const steps = path.units.flatMap((unit) => unit.steps);
  const expectedSteps = new Map(shape.steps.map((step) => [step.stableKey, step]));
  const actualKeys = steps.map((step) => step.stableKey);
  if (
    steps.length !== expectedSteps.size ||
    actualKeys.some((key) => !expectedSteps.has(key)) ||
    new Set(actualKeys).size !== actualKeys.length ||
    steps.some((step) => step.status !== "PUBLISHED" || !step.isActive)
  ) {
    return false;
  }

  const actualByKey = new Map(steps.map((step) => [step.stableKey, step]));
  return shape.steps.every((expected) => {
    const actual = actualByKey.get(expected.stableKey);
    if (!actual || actual.type !== expected.type || expected.prerequisiteKeys.length > 1) {
      return false;
    }
    const expectedPrerequisiteId = expected.prerequisiteKeys[0]
      ? (actualByKey.get(expected.prerequisiteKeys[0])?.id ?? null)
      : null;
    return actual.prerequisiteStepId === expectedPrerequisiteId;
  });
}

function cycleMinimumScore(rule: Prisma.JsonValue): number | null {
  return minimumScore(rule);
}

async function isP1CycleComplete(
  tx: Prisma.TransactionClient,
  actor: P1StudentActor,
  path: P1CycleGraph,
): Promise<boolean> {
  if (!hasExpectedP1CycleGraph(path)) return false;
  const steps = path.units.flatMap((unit) => unit.steps);
  if (!steps.length) return false;
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
          select: { assessmentId: true, score: true },
        })
      : Promise.resolve([]),
  ]);

  const evidenceCompleted = new Set(progress.map((item) => item.learningStepId));
  const evidence = resolveLearningPathStepEvidence(
    steps.map((step) => ({
      id: step.id,
      exerciseTemplateVersionId: step.exerciseTemplateVersionId,
      contentVersionId: step.contentVersionId,
    })),
    sessions,
    new Set(lessons.map((lesson) => lesson.contentVersionId)),
  );
  for (const [stepId, item] of evidence) {
    if (item.completed) evidenceCompleted.add(stepId);
  }

  const latestResults = new Map<string, number | null>();
  for (const result of assessmentResults) {
    if (!latestResults.has(result.assessmentId))
      latestResults.set(result.assessmentId, result.score);
  }
  for (const step of steps) {
    if (!step.assessmentId || !latestResults.has(step.assessmentId)) continue;
    const score = latestResults.get(step.assessmentId) ?? null;
    const threshold = cycleMinimumScore(step.completionRule);
    if (threshold === null || (score !== null && score >= threshold)) {
      evidenceCompleted.add(step.id);
    }
  }
  return steps.every((step) => evidenceCompleted.has(step.id));
}

async function loadNextP1Cycle(
  tx: Prisma.TransactionClient,
  actor: P1StudentActor,
  current: { area: string; levelId: string | null },
) {
  return tx.learningPath.findFirst({
    where: {
      code: P1_A_NEXT_CYCLE_PATH_CODE,
      version: EDUCATION_V2_P1_A_CYCLE_V2_VERSION,
      area: current.area as "READING_COMPREHENSION",
      status: "PUBLISHED",
      deletedAt: null,
      OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
      ...(current.levelId
        ? { AND: [{ OR: [{ levelId: null }, { levelId: current.levelId }] }] }
        : {}),
    },
    select: {
      id: true,
      code: true,
      version: true,
      units: {
        orderBy: { position: "asc" },
        select: {
          code: true,
          status: true,
          steps: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              stableKey: true,
              position: true,
              prerequisiteStepId: true,
              status: true,
              isActive: true,
              type: true,
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
    },
  });
}

/**
 * Completes the published P1-A cycle only after all of its server-side
 * evidence is complete, then atomically activates the next published cycle.
 * A cycle only passes when its source release is explicitly published and its
 * database graph is complete. A missing release decision or graph therefore
 * remains REVIEW_REQUIRED.
 */
export async function reconcileP1ToNextCycle(
  actor: StudentActor,
  input: { p1LearningPathId: string },
): Promise<P1CycleTransitionResult> {
  assertStudentActor(actor);
  try {
    return await withTenantContext(actor, async (tx) => {
      const enrollmentSelect = {
        id: true,
        routeStatus: true,
        measurementResultId: true,
        learningPath: {
          select: {
            id: true,
            code: true,
            version: true,
            area: true,
            levelId: true,
            units: {
              orderBy: { position: "asc" as const },
              select: {
                code: true,
                status: true,
                steps: {
                  orderBy: { position: "asc" as const },
                  select: {
                    id: true,
                    stableKey: true,
                    position: true,
                    prerequisiteStepId: true,
                    status: true,
                    isActive: true,
                    type: true,
                    contentVersionId: true,
                    exerciseTemplateVersionId: true,
                    assessmentId: true,
                    completionRule: true,
                    contentVersion: {
                      select: {
                        status: true,
                        content: { select: { status: true, deletedAt: true } },
                      },
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
          },
        },
      } as const;
      const enrollmentScope = {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        learningPath: { status: "PUBLISHED" as const, deletedAt: null },
      };
      // The client learning-path projection carries LearningPath.id, while
      // older callers and direct transition retries carry
      // StudentLearningPath.id. Accept either only inside this student's
      // tenant-scoped enrollment so the recovery remains idempotent and
      // cannot resolve another student's route.
      const enrollmentById = await tx.studentLearningPath.findFirst({
        where: {
          id: input.p1LearningPathId,
          ...enrollmentScope,
        },
        select: enrollmentSelect,
      });
      const enrollment =
        enrollmentById ??
        (await tx.studentLearningPath.findFirst({
          where: { learningPathId: input.p1LearningPathId, ...enrollmentScope },
          select: enrollmentSelect,
        }));
      if (!enrollment) {
        return p1CycleReviewResult(input.p1LearningPathId, "NOT_APPLICABLE", false);
      }

      const nextCode = nextP1CyclePathCode(enrollment.learningPath.code);
      if (!nextCode) {
        return p1CycleReviewResult(enrollment.id, "NOT_APPLICABLE", false);
      }

      // A completed or reassigned enrollment is historical state. Before
      // returning, look up the associated next-cycle enrollment so a replay
      // of the final request is idempotent without ever reactivating the old
      // cycle. This check intentionally stays tenant- and student-scoped.
      const associatedNextPath = await tx.learningPath.findFirst({
        where: {
          code: nextCode,
          version: EDUCATION_V2_P1_A_CYCLE_V2_VERSION,
          deletedAt: null,
          OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
        },
        select: { id: true, status: true },
      });
      const existingAssociatedNext = associatedNextPath
        ? await tx.studentLearningPath.findUnique({
            where: {
              tenantId_studentId_learningPathId: {
                tenantId: actor.tenantId,
                studentId: actor.userId,
                learningPathId: associatedNextPath.id,
              },
            },
            select: { id: true, routeStatus: true },
          })
        : null;

      // A completed enrollment can be a recoverable historical state: the
      // cycle may have been completed before the next graph was published or
      // before a previous transition request finished. In that narrow case,
      // re-run the evidence and graph gates below so the next cycle can be
      // assigned without reopening or rewriting the completed cycle. Other
      // historical states remain non-reactivatable.
      const canRecoverCompletedCycle =
        enrollment.routeStatus === "COMPLETED" && !existingAssociatedNext;
      if (enrollment.routeStatus !== "ACTIVE" && !canRecoverCompletedCycle) {
        if (
          existingAssociatedNext &&
          (existingAssociatedNext.routeStatus === "ACTIVE" ||
            existingAssociatedNext.routeStatus === "COMPLETED")
        ) {
          return {
            outcome: "ALREADY_ASSIGNED",
            currentLearningPathId: enrollment.id,
            nextLearningPathId: associatedNextPath?.id ?? null,
            readiness: {
              status: "ALREADY_ASSIGNED",
              currentCycleCompleted: true,
              nextCycleAvailable: associatedNextPath?.status === "PUBLISHED",
            },
          };
        }
        return p1CycleReviewResult(enrollment.id, "NOT_APPLICABLE", false);
      }

      if (canRecoverCompletedCycle) {
        const conflictingActiveP1 = await tx.studentLearningPath.findFirst({
          where: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            routeStatus: "ACTIVE",
            id: { not: enrollment.id },
            learningPath: { code: { startsWith: P1_PATH_PREFIX } },
          },
          select: { id: true },
        });
        if (conflictingActiveP1) {
          return p1CycleReviewResult(enrollment.id, "NEXT_CYCLE_UNAVAILABLE", true, false);
        }
      }

      const currentCompleted = await isP1CycleComplete(tx, actor, enrollment.learningPath);
      if (!currentCompleted) {
        return p1CycleReviewResult(enrollment.id, "CURRENT_CYCLE_NOT_COMPLETED", false);
      }

      const nextPath = await loadNextP1Cycle(tx, actor, enrollment.learningPath);
      if (
        !isEducationV2P1ACycleV2ProductionAssignmentEnabled() ||
        !nextPath ||
        nextPath.code !== nextCode ||
        !hasExpectedP1CycleGraph(nextPath) ||
        nextPath.units.flatMap((unit) => unit.steps).some((step) => !isReadyP1CandidateStep(step))
      ) {
        return p1CycleReviewResult(enrollment.id, "NEXT_CYCLE_UNAVAILABLE", true, false);
      }

      const existingNext =
        existingAssociatedNext && associatedNextPath?.id === nextPath.id
          ? existingAssociatedNext
          : await tx.studentLearningPath.findUnique({
              where: {
                tenantId_studentId_learningPathId: {
                  tenantId: actor.tenantId,
                  studentId: actor.userId,
                  learningPathId: nextPath.id,
                },
              },
              select: { id: true, routeStatus: true },
            });
      if (existingNext?.routeStatus === "ACTIVE" || existingNext?.routeStatus === "COMPLETED") {
        return {
          outcome: "ALREADY_ASSIGNED",
          currentLearningPathId: enrollment.id,
          nextLearningPathId: nextPath.id,
          readiness: {
            status: "ALREADY_ASSIGNED",
            currentCycleCompleted: true,
            nextCycleAvailable: true,
          },
        };
      }

      // A previously paused, reviewed, or reassigned next cycle is an
      // explicit product decision, not an invitation to reactivate it. Keep
      // the historical enrollment and require a new reviewed decision.
      if (
        existingNext &&
        (existingNext.routeStatus === "REASSIGNED" ||
          existingNext.routeStatus === "PAUSED" ||
          existingNext.routeStatus === "REVIEW_REQUIRED")
      ) {
        return p1CycleReviewResult(enrollment.id, "NEXT_CYCLE_UNAVAILABLE", true, false);
      }

      const now = new Date();
      await tx.studentLearningPath.updateMany({
        where: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          routeStatus: "ACTIVE",
          learningPath: { code: { startsWith: P1_PATH_PREFIX } },
          id: { not: enrollment.id },
        },
        data: { routeStatus: "REASSIGNED" },
      });
      if (enrollment.routeStatus === "ACTIVE") {
        await tx.studentLearningPath.update({
          where: { id: enrollment.id },
          data: { routeStatus: "COMPLETED", completedAt: now, currentStepId: null },
        });
      }
      await tx.studentLearningPath.upsert({
        where: {
          tenantId_studentId_learningPathId: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            learningPathId: nextPath.id,
          },
        },
        update: {
          routeStatus: "ACTIVE",
          assignedAt: now,
          recommendedPathId: nextPath.id,
          measurementResultId: enrollment.measurementResultId,
          selectionPolicyVersion: P1_CYCLE_TRANSITION_POLICY_VERSION,
          selectionReason: {
            source: "P1_CYCLE_CONTINUATION",
            fromLearningPathId: enrollment.learningPath.id,
            fromPathCode: enrollment.learningPath.code,
            toPathCode: nextPath.code,
          },
        },
        create: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          learningPathId: nextPath.id,
          routeStatus: "ACTIVE",
          assignedAt: now,
          recommendedPathId: nextPath.id,
          measurementResultId: enrollment.measurementResultId,
          selectionPolicyVersion: P1_CYCLE_TRANSITION_POLICY_VERSION,
          selectionReason: {
            source: "P1_CYCLE_CONTINUATION",
            fromLearningPathId: enrollment.learningPath.id,
            fromPathCode: enrollment.learningPath.code,
            toPathCode: nextPath.code,
          },
        },
        select: { id: true },
      });
      return {
        outcome: "ASSIGNED",
        currentLearningPathId: enrollment.id,
        nextLearningPathId: nextPath.id,
        readiness: {
          status: "ASSIGNED",
          currentCycleCompleted: true,
          nextCycleAvailable: true,
        },
      };
    });
  } catch (error) {
    if (!isP2002(error)) throw error;
    const active = await withTenantContext(actor, (tx) =>
      tx.studentLearningPath.findFirst({
        where: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          routeStatus: "ACTIVE",
          learningPath: { code: P1_A_NEXT_CYCLE_PATH_CODE },
        },
        select: { id: true, learningPathId: true },
      }),
    );
    if (!active) throw error;
    return {
      outcome: "ALREADY_ASSIGNED",
      currentLearningPathId: input.p1LearningPathId,
      nextLearningPathId: active.learningPathId,
      readiness: {
        status: "ALREADY_ASSIGNED",
        currentCycleCompleted: true,
        nextCycleAvailable: true,
      },
    };
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
    if (!p0?.canonicalGraphReady || !p0.levelScopeReady || !p0.completed) {
      throw validationError("P0 öğrenme yolu grafiği veya seviye kapsamı henüz hazır değil");
    }

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
