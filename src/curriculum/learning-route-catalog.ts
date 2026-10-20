import {
  buildEducationV2P1ALearningCycleManifest,
  buildEducationV2P1BCDLearningCycleManifests,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "./learning-cycle-manifest.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "./education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
  isEducationV2P1ACycleV2ProductionAssignmentEnabled,
} from "./education-v2-p1-a-cycle-v2-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
  isEducationV2P1ACycle3ProductionAssignmentEnabled,
} from "./education-v2-p1-a-cycle-3-program.js";
import { EDUCATION_V2_P1_A_CYCLE_4_PROGRAM } from "./education-v2-p1-a-cycle-4-program.js";
import { EDUCATION_V2_P1_A_CYCLE_4_MANIFEST } from "./education-v2-p1-a-cycle-4-manifest.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE,
  isEducationV2P1ACycle4ProductionAssignmentEnabled,
} from "./education-v2-p1-a-cycle-4-release.js";
import { EDUCATION_V2_P1_A_CYCLE_5_8 } from "./education-v2-p1-a-cycle-5-8-program.js";
import { isEducationV2P1ACycle5To8ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-5-8-release.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "./education-v2-p1-bcd-program.js";
import {
  EDUCATION_V2_P1_800_CATEGORY_TARGETS,
  EDUCATION_V2_P1_800_DRAFT_CYCLES,
  type EducationV2P1ExpansionCategory,
} from "./education-v2-p1-800-draft-cycles.js";

/** A route is an explicit chain of immutable content releases, not a level reassessment. */
export type LearningRouteCycle = {
  pathCode: string;
  programId: string;
  version: number;
  sequence: number;
  routeFamily: "A" | "B" | "C" | "D";
  scopeCode: string;
  title: string;
  units: readonly { code: string; steps: readonly { key: string }[] }[];
  manifest: LearningCycleManifest;
  nextPathCode: string | null;
  authoredStationCategories?: readonly EducationV2P1ExpansionCategory[];
  /** Number of authored stations with a checked, content-linked source citation. */
  sourceVerifiedStationCount?: number;
  authoringStatus?: "DRAFT_NOT_RELEASED" | "OWNER_RELEASE_APPROVED";
  /** Source permission; a PUBLISHED database graph is a separate requirement. */
  publicationApproved: () => boolean;
};

const initialManifest = buildEducationV2P1ALearningCycleManifest();
const bcdManifests = buildEducationV2P1BCDLearningCycleManifests();

const BASE_LEARNING_ROUTE_CYCLES: readonly LearningRouteCycle[] = [
  {
    pathCode: EDUCATION_V2_P1_A_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_PROGRAM.programId,
    version: initialManifest.cycleVersion,
    sequence: 1,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: "Anlam ve metin yapısı",
    units: EDUCATION_V2_P1_A_PROGRAM.path.units,
    manifest: initialManifest,
    nextPathCode: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.code,
    publicationApproved: () => true,
  },
  {
    pathCode: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.programId,
    version: EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST.cycleVersion,
    sequence: 2,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: "Metin yapısı ve anlam ilişkileri",
    units: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units,
    manifest: EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
    nextPathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
    publicationApproved: () => isEducationV2P1ACycleV2ProductionAssignmentEnabled(),
  },
  {
    pathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.programId,
    version: EDUCATION_V2_P1_A_CYCLE_3_MANIFEST.cycleVersion,
    sequence: 3,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: "Kanıt ve aktarım",
    units: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units,
    manifest: EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
    nextPathCode: null,
    publicationApproved: () => isEducationV2P1ACycle3ProductionAssignmentEnabled(),
  },
  ...EDUCATION_V2_P1_BCD_PROGRAMS.map((program, index): LearningRouteCycle => {
    const next = EDUCATION_V2_P1_BCD_PROGRAMS.find(
      (candidate) =>
        candidate.routeFamily === program.routeFamily &&
        candidate.sequence === program.sequence + 1,
    );
    return {
      pathCode: program.path.code,
      programId: program.programId,
      version: bcdManifests[index]!.cycleVersion,
      sequence: program.sequence,
      routeFamily: program.routeFamily,
      scopeCode: "G8_12",
      title: program.path.title,
      units: program.path.units,
      manifest: bcdManifests[index]!,
      nextPathCode: next?.path.code ?? null,
      publicationApproved: () => program.publicationApproved,
    };
  }),
];

const linkedBaseCycles = BASE_LEARNING_ROUTE_CYCLES.map((cycle) => {
  if (cycle.nextPathCode) return cycle;
  const draftNext = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
    (candidate) =>
      candidate.routeFamily === cycle.routeFamily && candidate.sequence === cycle.sequence + 1,
  );
  return draftNext ? { ...cycle, nextPathCode: draftNext.pathCode } : cycle;
});

/**
 * Expansion drafts extend the source chain. Cycles with dedicated versioned
 * programs use those exact manifests; their production graphs remain separate
 * availability gates. Cycles 5–8 remain unavailable until their owner release
 * decision is recorded in source as well as their graph being ready.
 */
const expansionRouteCycles = EDUCATION_V2_P1_800_DRAFT_CYCLES.map((cycle) => {
  if (cycle.pathCode === EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE) {
    return {
      ...cycle,
      pathCode: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.code,
      programId: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.programId,
      version: EDUCATION_V2_P1_A_CYCLE_4_MANIFEST.cycleVersion,
      sequence: EDUCATION_V2_P1_A_CYCLE_4_MANIFEST.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.title,
      units: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.units,
      manifest: EDUCATION_V2_P1_A_CYCLE_4_MANIFEST,
      authoringStatus: "OWNER_RELEASE_APPROVED" as const,
      publicationApproved: isEducationV2P1ACycle4ProductionAssignmentEnabled,
    };
  }

  const authoredCycle = EDUCATION_V2_P1_A_CYCLE_5_8.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && authoredCycle) {
    return {
      ...cycle,
      pathCode: authoredCycle.program.path.code,
      programId: authoredCycle.program.programId,
      version: authoredCycle.manifest.cycleVersion,
      sequence: authoredCycle.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: authoredCycle.program.path.title,
      units: authoredCycle.program.path.units,
      manifest: authoredCycle.manifest,
      authoringStatus: "DRAFT_NOT_RELEASED" as const,
      publicationApproved: () =>
        isEducationV2P1ACycle5To8ProductionAssignmentEnabled(authoredCycle.sequence),
    };
  }
  return cycle;
});

export const LEARNING_ROUTE_CYCLES: readonly LearningRouteCycle[] = [
  ...linkedBaseCycles,
  ...expansionRouteCycles,
];

const cyclesByCode = new Map(LEARNING_ROUTE_CYCLES.map((cycle) => [cycle.pathCode, cycle]));
export function learningRouteCycle(pathCode: string): LearningRouteCycle | null {
  return cyclesByCode.get(pathCode) ?? null;
}

export function nextLearningRouteCycle(pathCode: string): LearningRouteCycle | null {
  const current = learningRouteCycle(pathCode);
  if (!current?.nextPathCode) return null;
  const next = learningRouteCycle(current.nextPathCode);
  return next &&
    next.routeFamily === current.routeFamily &&
    next.scopeCode === current.scopeCode &&
    next.sequence === current.sequence + 1
    ? next
    : null;
}

export function upcomingLearningRouteCycles(pathCode: string): LearningRouteCycle[] {
  const result: LearningRouteCycle[] = [];
  const seen = new Set([pathCode]);
  let next = nextLearningRouteCycle(pathCode);
  while (next && !seen.has(next.pathCode)) {
    result.push(next);
    seen.add(next.pathCode);
    next = nextLearningRouteCycle(next.pathCode);
  }
  return result;
}

/** Minimum number of route positions visible on the student roadmap. */
export const LEARNING_ROUTE_VISIBLE_STATION_TARGET = 300;

export type PlannedLearningRouteNode = {
  id: string;
  learningPathId: null;
  learningPathCode: string;
  code: string;
  type: string;
  label: string;
  status: "locked";
  availability: "UNAVAILABLE";
  planningStatus: "AUTHORED_UNRELEASED" | "GRAPH_NOT_AVAILABLE" | "CONTENT_NOT_AUTHORED";
  cycleSequence: number | null;
  stepOrder: number;
  templateVersionId: null;
  contentVersionId: null;
  assessmentId: null;
  prerequisiteStepId: null;
  progress: null;
  unit: { title: string };
  isCurrent: false;
};

/** Counts real positions already rendered before adding roadmap placeholders. */
export function countVisibleLearningRoutePositions(
  groups: readonly { nodes: readonly unknown[] }[],
): number {
  return groups.reduce((count, group) => count + group.nodes.length, 0);
}

/**
 * Produces a safe, read-only roadmap projection for future stations. The
 * projection deliberately excludes passage bodies, questions, answers,
 * explanations, source URLs, and database identifiers. It does not change
 * publication or assignment eligibility.
 */
export function buildPlannedLearningRouteNodes(options: {
  currentPathCode: string;
  representedPathCodes?: ReadonlySet<string>;
  visibleStationCount: number;
  targetStationCount?: number;
}): PlannedLearningRouteNode[] {
  const current = learningRouteCycle(options.currentPathCode);
  if (!current) return [];

  const representedPathCodes = options.representedPathCodes ?? new Set<string>();
  const targetStationCount = Math.max(
    0,
    options.targetStationCount ?? LEARNING_ROUTE_VISIBLE_STATION_TARGET,
  );
  const planned: PlannedLearningRouteNode[] = [];

  const futureCycles = LEARNING_ROUTE_CYCLES.filter(
    (cycle) =>
      cycle.routeFamily === current.routeFamily &&
      cycle.sequence > current.sequence &&
      !representedPathCodes.has(cycle.pathCode),
  ).sort((left, right) => left.sequence - right.sequence);

  for (const cycle of futureCycles) {
    const draft = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
      (candidate) => candidate.pathCode === cycle.pathCode,
    );
    const stationsByKey = new Map(draft?.sourceStations.map((station) => [station.key, station]));
    for (const step of cycle.manifest.steps) {
      const station = stationsByKey.get(step.stableKey);
      const hasContentDefinition = Boolean(
        station ||
        ("content" in step && step.content) ||
        ("exercise" in step && step.exercise) ||
        ("assessment" in step && step.assessment),
      );
      planned.push({
        id: `planned:${current.routeFamily}:${cycle.sequence}:${step.order}`,
        learningPathId: null,
        learningPathCode: cycle.pathCode,
        code: step.stableKey,
        type: step.type,
        label: station
          ? station.title || "İçerik başlığı hazırlanıyor"
          : hasContentDefinition
            ? `${cycle.title} · Adım ${step.order}`
            : "Henüz içerik tanımlanmadı",
        status: "locked",
        availability: "UNAVAILABLE",
        planningStatus: !hasContentDefinition
          ? "CONTENT_NOT_AUTHORED"
          : cycle.publicationApproved()
            ? "GRAPH_NOT_AVAILABLE"
            : "AUTHORED_UNRELEASED",
        cycleSequence: cycle.sequence,
        stepOrder: step.order,
        templateVersionId: null,
        contentVersionId: null,
        assessmentId: null,
        prerequisiteStepId: null,
        progress: null,
        unit: { title: cycle.title },
        isCurrent: false,
      });
    }
  }

  const reservedCount = Math.max(
    0,
    targetStationCount - options.visibleStationCount - planned.length,
  );
  for (let index = 0; index < reservedCount; index += 1) {
    const routePosition = options.visibleStationCount + planned.length + 1;
    planned.push({
      id: `planned:${current.routeFamily}:reserved:${routePosition}`,
      learningPathId: null,
      learningPathCode: `PLANNED_EDUCATION_V2_P1_${current.routeFamily}`,
      code: `PLANNED_${current.routeFamily}_${routePosition}`,
      type: "PLANNED",
      label: "Henüz içerik tanımlanmadı",
      status: "locked",
      availability: "UNAVAILABLE",
      planningStatus: "CONTENT_NOT_AUTHORED",
      cycleSequence: null,
      stepOrder: routePosition,
      templateVersionId: null,
      contentVersionId: null,
      assessmentId: null,
      prerequisiteStepId: null,
      progress: null,
      unit: { title: "Gelecekteki istasyonlar" },
      isCurrent: false,
    });
  }

  return planned;
}

export const LEARNING_ROUTE_STATION_TARGET = 200;

export type LearningRouteCoverage = {
  routeFamily: "A" | "B" | "C" | "D";
  authoredStationCount: number;
  releasedSourceStationCount: number;
  sourceVerifiedDraftStationCount: number;
  sourceQualifiedStationCount: number;
  sourceQualifiedRemainingStations: number;
  authoredSourceReviewRequiredStationCount: number;
  targetStationCount: number;
  remainingAuthoredStations: number;
  categoryDistribution: "NOT_CLASSIFIED" | "INCOMPLETE" | "TARGETS_MISMATCH" | "TARGETS_MET";
  categoryCounts: Record<EducationV2P1ExpansionCategory, number>;
  categoryTargetGaps: Record<EducationV2P1ExpansionCategory, number>;
  categoryTargetExcesses: Record<EducationV2P1ExpansionCategory, number>;
  unclassifiedStationCount: number;
  categoryTargets: typeof EDUCATION_V2_P1_800_CATEGORY_TARGETS;
  productionGraph: "NOT_VERIFIED";
};

/** Source-only progress. It never implies a database graph was provisioned. */
export function summarizeLearningRouteCoverage(
  cycles: readonly LearningRouteCycle[] = LEARNING_ROUTE_CYCLES,
): LearningRouteCoverage[] {
  return (["A", "B", "C", "D"] as const).map((routeFamily) => {
    const routeCycles = cycles.filter((cycle) => cycle.routeFamily === routeFamily);
    const authoredStationCount = routeCycles.reduce(
      (count, cycle) => count + cycle.manifest.steps.length,
      0,
    );
    const releasedSourceStationCount = routeCycles.reduce(
      (count, cycle) =>
        count +
        (cycle.publicationApproved()
          ? (cycle.sourceVerifiedStationCount ?? cycle.manifest.steps.length)
          : 0),
      0,
    );
    const sourceVerifiedDraftStationCount = routeCycles.reduce(
      (count, cycle) => count + (cycle.sourceVerifiedStationCount ?? 0),
      0,
    );
    const sourceQualifiedStationCount =
      releasedSourceStationCount + sourceVerifiedDraftStationCount;
    const categoryCounts = Object.fromEntries(
      Object.keys(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map((category) => [category, 0]),
    ) as Record<EducationV2P1ExpansionCategory, number>;
    let classifiedStationCount = 0;
    for (const cycle of routeCycles) {
      for (const category of cycle.authoredStationCategories ?? []) {
        categoryCounts[category] += 1;
        classifiedStationCount += 1;
      }
    }
    const categoryTargetGaps = Object.fromEntries(
      Object.entries(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map(([category, target]) => [
        category,
        Math.max(0, target - categoryCounts[category as EducationV2P1ExpansionCategory]),
      ]),
    ) as Record<EducationV2P1ExpansionCategory, number>;
    const categoryTargetExcesses = Object.fromEntries(
      Object.entries(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map(([category, target]) => [
        category,
        Math.max(0, categoryCounts[category as EducationV2P1ExpansionCategory] - target),
      ]),
    ) as Record<EducationV2P1ExpansionCategory, number>;
    const categoryTargetsMet =
      Object.values(categoryTargetGaps).every((count) => count === 0) &&
      Object.values(categoryTargetExcesses).every((count) => count === 0);
    return {
      routeFamily,
      authoredStationCount,
      releasedSourceStationCount,
      sourceVerifiedDraftStationCount,
      sourceQualifiedStationCount,
      sourceQualifiedRemainingStations: Math.max(
        0,
        LEARNING_ROUTE_STATION_TARGET - sourceQualifiedStationCount,
      ),
      authoredSourceReviewRequiredStationCount: Math.max(
        0,
        authoredStationCount - sourceQualifiedStationCount,
      ),
      targetStationCount: LEARNING_ROUTE_STATION_TARGET,
      remainingAuthoredStations: Math.max(0, LEARNING_ROUTE_STATION_TARGET - authoredStationCount),
      categoryDistribution:
        classifiedStationCount === 0
          ? "NOT_CLASSIFIED"
          : authoredStationCount > classifiedStationCount
            ? "INCOMPLETE"
            : categoryTargetsMet
              ? "TARGETS_MET"
              : "TARGETS_MISMATCH",
      categoryCounts,
      categoryTargetGaps,
      categoryTargetExcesses,
      unclassifiedStationCount: Math.max(0, authoredStationCount - classifiedStationCount),
      categoryTargets: EDUCATION_V2_P1_800_CATEGORY_TARGETS,
      productionGraph: "NOT_VERIFIED",
    };
  });
}

export type LearningRouteGraph = {
  code: string;
  version: number;
  units: readonly {
    code: string;
    status: string;
    steps: readonly {
      id: string;
      stableKey: string;
      type: string;
      position: number;
      status: string;
      isActive: boolean;
      prerequisiteStepId: string | null;
      completionRule: unknown;
      contentVersionId: string | null;
      exerciseTemplateVersionId: string | null;
      assessmentId: string | null;
    }[];
  }[];
};

export function matchesLearningRouteGraph(path: LearningRouteGraph): boolean {
  const cycle = learningRouteCycle(path.code);
  if (!cycle || path.version !== cycle.version || path.units.length !== cycle.units.length)
    return false;
  const actual = path.units.flatMap((unit) => unit.steps);
  if (
    actual.length !== cycle.manifest.steps.length ||
    new Set(actual.map((step) => step.id)).size !== actual.length
  )
    return false;
  const byKey = new Map(actual.map((step) => [step.stableKey, step]));
  if (byKey.size !== actual.length) return false;
  const sourceSteps = new Map(cycle.manifest.steps.map((step) => [step.stableKey, step]));
  return path.units.every((unit, index) => {
    const source = cycle.units[index]!;
    return (
      unit.status === "PUBLISHED" &&
      unit.code === source.code &&
      unit.steps.length === source.steps.length &&
      unit.steps.every((step, stepIndex) => {
        const key = source.steps[stepIndex]!.key;
        const expected = sourceSteps.get(key);
        if (!expected) return false;
        const rule =
          step.completionRule &&
          typeof step.completionRule === "object" &&
          !Array.isArray(step.completionRule)
            ? (step.completionRule as Record<string, unknown>)
            : {};
        const configured = rule.prerequisiteStepIds;
        if (
          configured !== undefined &&
          (!Array.isArray(configured) || configured.some((id) => typeof id !== "string"))
        )
          return false;
        const prerequisites = new Set([
          ...(step.prerequisiteStepId ? [step.prerequisiteStepId] : []),
          ...(Array.isArray(configured) ? (configured as string[]) : []),
        ]);
        const expectedIds = expected.prerequisiteKeys.map(
          (prerequisite) => byKey.get(`${cycle.programId}:${prerequisite}`)?.id,
        );
        return (
          step.stableKey === `${cycle.programId}:${key}` &&
          step.type === expected.type &&
          step.contentVersionId === (expected.content?.versionId ?? null) &&
          step.exerciseTemplateVersionId === (expected.exercise?.versionId ?? null) &&
          step.assessmentId === (expected.assessment?.versionId ?? null) &&
          step.position === stepIndex + 1 &&
          step.status === "PUBLISHED" &&
          step.isActive &&
          prerequisites.size === expectedIds.length &&
          expectedIds.every((id) => id !== undefined && prerequisites.has(id))
        );
      })
    );
  });
}

/** Validates authored resources and the chain without inventing future stations. */
export function validateLearningRouteCatalog(
  cycles: readonly LearningRouteCycle[] = LEARNING_ROUTE_CYCLES,
): string[] {
  const errors: string[] = [];
  const paths = new Map(cycles.map((cycle) => [cycle.pathCode, cycle]));
  if (paths.size !== cycles.length) errors.push("Tekrarlı öğrenme rotası kodu");
  const sequences = new Set<string>();
  const resources = new Set<string>();
  for (const cycle of cycles) {
    const identity = `${cycle.routeFamily}:${cycle.scopeCode}:${cycle.sequence}`;
    if (sequences.has(identity)) errors.push(`Tekrarlı döngü sırası: ${identity}`);
    sequences.add(identity);
    if (
      cycle.version !== cycle.manifest.cycleVersion ||
      cycle.sequence !== cycle.manifest.sequence ||
      cycle.routeFamily !== cycle.manifest.routeFamily
    )
      errors.push(`Döngü sürüm/kapsam uyuşmazlığı: ${cycle.pathCode}`);
    const unitSteps = cycle.units.flatMap((unit) => unit.steps.map((step) => step.key));
    if (
      unitSteps.length !== cycle.manifest.steps.length ||
      unitSteps.some((key, index) => key !== cycle.manifest.steps[index]?.stableKey)
    )
      errors.push(`Ünite ve istasyon sırası uyuşmuyor: ${cycle.pathCode}`);
    for (const issue of validateLearningCycleManifest(cycle.manifest).errors)
      errors.push(`${cycle.pathCode}: ${issue.path}: ${issue.message}`);
    for (const resource of [
      ...cycle.manifest.resourceCatalog.contentVersions,
      ...cycle.manifest.resourceCatalog.exerciseVersions,
      ...cycle.manifest.resourceCatalog.assessmentVersions,
    ]) {
      if (resources.has(resource.versionId))
        errors.push(`Tekrarlı kaynak sürümü: ${resource.versionId}`);
      resources.add(resource.versionId);
    }
    for (const questionId of cycle.manifest.resourceCatalog.questionVersionIds) {
      if (resources.has(questionId)) errors.push(`Tekrarlı soru sürümü: ${questionId}`);
      resources.add(questionId);
    }
    if (cycle.nextPathCode) {
      const next = paths.get(cycle.nextPathCode);
      if (
        !next ||
        next.routeFamily !== cycle.routeFamily ||
        next.scopeCode !== cycle.scopeCode ||
        next.sequence !== cycle.sequence + 1
      )
        errors.push(`Geçersiz döngü bağlantısı: ${cycle.pathCode}`);
    }
  }
  return errors;
}
