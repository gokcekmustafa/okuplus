import {
  buildEducationV2P0LearningCycleManifest,
  buildEducationV2P1ALearningCycleManifest,
  buildEducationV2P1BCDLearningCycleManifests,
  validateLearningCycleManifest,
  type LearningCycleManifest,
  type LearningCycleValidationError,
  type LearningCycleRouteFamily,
} from "./learning-cycle-manifest.js";

export type LearningCycleReadinessStatus = "INVALID" | "NOT_VERIFIED";

export type LearningCycleReadinessCycle = {
  cycleId: string;
  routeFamily: LearningCycleRouteFamily;
  stepCount: number | null;
  sourceValidation: "PASS" | "FAIL";
  publishedGraph: "NOT_VERIFIED";
  status: LearningCycleReadinessStatus;
  errors: readonly LearningCycleValidationError[];
};

export type LearningCycleReadinessReport = {
  status: LearningCycleReadinessStatus;
  scope: "SOURCE_MANIFEST_AND_STATIC_GRAPH";
  productionVerification: {
    status: "NOT_VERIFIED";
    reason: string;
  };
  cycles: readonly LearningCycleReadinessCycle[];
  automaticAssignment: {
    p1A: "EXISTING_FALLBACK_ONLY";
    p1BCD: "CLOSED_UNTIL_CALIBRATED";
  };
};

type CycleDefinition = {
  routeFamily: LearningCycleRouteFamily;
  build: () => LearningCycleManifest;
};

const CYCLE_DEFINITIONS: readonly CycleDefinition[] = [
  { routeFamily: "P0", build: buildEducationV2P0LearningCycleManifest },
  { routeFamily: "A", build: buildEducationV2P1ALearningCycleManifest },
  ...buildEducationV2P1BCDLearningCycleManifests().map((manifest) => ({
    routeFamily: manifest.routeFamily,
    build: () => manifest,
  })),
];

function sourceError(
  routeFamily: LearningCycleRouteFamily,
  cause: unknown,
): LearningCycleValidationError {
  const message = cause instanceof Error ? cause.message : "Kaynak müfredat doğrulanamadı.";
  return {
    code: "SOURCE_CATALOG_INVALID",
    path: `${routeFamily}.sourceCatalog`,
    message,
  };
}

/**
 * Runs the existing P0/P1 source validators through the cycle manifest
 * builders, then applies the shared cycle-graph validator. It deliberately
 * does not connect to Prisma: source validity is not proof of production
 * publication, so the published graph status remains NOT_VERIFIED.
 */
export function auditCanonicalEducationV2LearningCycleReadiness(): LearningCycleReadinessReport {
  const cycles: LearningCycleReadinessCycle[] = CYCLE_DEFINITIONS.map((definition) => {
    try {
      const manifest = definition.build();
      const validation = validateLearningCycleManifest(manifest);
      const errors = validation.errors.map((item) => ({
        ...item,
        path: `${manifest.cycleId}.${item.path}`,
      }));
      return {
        cycleId: manifest.cycleId,
        routeFamily: manifest.routeFamily,
        stepCount: manifest.steps.length,
        sourceValidation: errors.length === 0 ? "PASS" : "FAIL",
        publishedGraph: "NOT_VERIFIED",
        status: errors.length === 0 ? "NOT_VERIFIED" : "INVALID",
        errors,
      };
    } catch (cause) {
      return {
        cycleId: `EDUCATION_V2_${definition.routeFamily}`,
        routeFamily: definition.routeFamily,
        stepCount: null,
        sourceValidation: "FAIL",
        publishedGraph: "NOT_VERIFIED",
        status: "INVALID",
        errors: [sourceError(definition.routeFamily, cause)],
      };
    }
  });
  const hasInvalidCycle = cycles.some((cycle) => cycle.status === "INVALID");
  return {
    status: hasInvalidCycle ? "INVALID" : "NOT_VERIFIED",
    scope: "SOURCE_MANIFEST_AND_STATIC_GRAPH",
    productionVerification: {
      status: "NOT_VERIFIED",
      reason:
        "Bu salt-okunur denetim production veritabanına bağlanmaz; kaynakta tanımlı içerik yayımlanmış kabul edilmez.",
    },
    cycles,
    automaticAssignment: {
      p1A: "EXISTING_FALLBACK_ONLY",
      p1BCD: "CLOSED_UNTIL_CALIBRATED",
    },
  };
}
