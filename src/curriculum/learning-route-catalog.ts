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
} from "./education-v2-p1-a-cycle-3-program.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "./education-v2-p1-bcd-program.js";

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
  /** Source permission; a PUBLISHED database graph is a separate requirement. */
  publicationApproved: () => boolean;
};

const initialManifest = buildEducationV2P1ALearningCycleManifest();
const bcdManifests = buildEducationV2P1BCDLearningCycleManifests();

export const LEARNING_ROUTE_CYCLES: readonly LearningRouteCycle[] = [
  {
    pathCode: EDUCATION_V2_P1_A_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_PROGRAM.programId,
    version: initialManifest.cycleVersion,
    sequence: 1,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: EDUCATION_V2_P1_A_PROGRAM.path.title,
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
    title: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.title,
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
    title: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.title,
    units: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units,
    manifest: EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
    nextPathCode: null,
    // No publication decision has been recorded for this authored candidate.
    // Enabling it requires an explicit product-owner release, never an env/request flag.
    publicationApproved: () => false,
  },
  ...EDUCATION_V2_P1_BCD_PROGRAMS.map((program, index): LearningRouteCycle => ({
    pathCode: program.path.code,
    programId: program.programId,
    version: bcdManifests[index]!.cycleVersion,
    sequence: 1,
    routeFamily: program.routeFamily,
    scopeCode: "G8_12",
    title: program.path.title,
    units: program.path.units,
    manifest: bcdManifests[index]!,
    nextPathCode: null,
    publicationApproved: () => true,
  })),
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
