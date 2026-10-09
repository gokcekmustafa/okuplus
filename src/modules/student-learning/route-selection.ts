import type { MeasurementSkillResult } from "../measurements/service.js";
import {
  hasCompleteAdaptiveRouteEvidence,
  hasReadingComprehensionEvidence,
  readAdaptiveRouteMeasurement,
  type AdaptiveRouteFamily,
} from "../measurements/adaptive-route-contract.js";

/** The policy contract is separate from the curriculum version. */
export const P1_ROUTE_SELECTION_POLICY_VERSION = "P1_ROUTE_SELECTION_V1" as const;

export const P1_ROUTE_FAMILIES = ["A", "B", "C", "D"] as const;
export type P1RouteFamily = (typeof P1_ROUTE_FAMILIES)[number];

export const ROUTE_REASON_CODES = [
  "FLUENCY_ACCURACY_NEED",
  "INFERENCE_EVIDENCE_NEED",
  "VOCABULARY_CONTEXT_NEED",
  "BALANCED_PROFILE",
  "MEASUREMENT_INSUFFICIENT",
  "MEASUREMENT_CONFLICT",
] as const;
export type RouteReasonCode = (typeof ROUTE_REASON_CODES)[number];

export type RouteSelectionStatus = "READY" | "REVIEW_REQUIRED";
export type RouteSelectionUncertainty = "LOW" | "MEDIUM" | "HIGH";

export type RouteSelectionCandidate = {
  id: string;
  code: string;
  version: number;
  levelId: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  curriculumReady?: boolean;
};

export type RouteSelectionMeasurement = {
  id: string;
  isFinalP0Measurement: boolean;
  skillResults: readonly MeasurementSkillResult[];
  metrics: unknown;
};

export type RouteSelectionResult = {
  status: RouteSelectionStatus;
  recommendedPathId: string | null;
  routeFamily: P1RouteFamily | null;
  reasonCodes: RouteReasonCode[];
  supportingSignals: {
    measurementResultId: string | null;
    measuredSkillCodes: string[];
    requiredReadingComprehensionSkills: string[];
    routeSelectionProfile: string | null;
    candidateAvailable: boolean;
  };
  uncertainty: RouteSelectionUncertainty;
  policyVersion: typeof P1_ROUTE_SELECTION_POLICY_VERSION;
  reason: string;
};

export type SelectP1RouteInput = {
  levelId: string | null;
  measurement: RouteSelectionMeasurement | null;
  candidates: readonly RouteSelectionCandidate[];
};

const REQUIRED_RC_SKILLS = ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"] as const;

export type RouteSelectionProfile =
  | "FLUENCY_ACCURACY_NEED"
  | "INFERENCE_EVIDENCE_NEED"
  | "VOCABULARY_CONTEXT_NEED"
  | "BALANCED_PROFILE"
  | "MEASUREMENT_CONFLICT";

/**
 * Reads only the server-produced, versioned adaptive measurement contract.
 * Legacy routeSelectionProfile/signals fields are intentionally ignored.
 */
export function readRouteSelectionProfile(metrics: unknown): RouteSelectionProfile | null {
  const adaptive = readAdaptiveRouteMeasurement(metrics);
  if (adaptive.status !== "VALID") return null;
  const activeFamilies = (
    Object.keys(adaptive.measurement.signals) as AdaptiveRouteFamily[]
  ).filter((family) => adaptive.measurement.signals[family]?.needsRoute === true);
  if (activeFamilies.length > 1) return "MEASUREMENT_CONFLICT";
  const family = activeFamilies[0];
  if (!family || !hasCompleteAdaptiveRouteEvidence(adaptive.measurement, family)) return null;
  return family === "B"
    ? "FLUENCY_ACCURACY_NEED"
    : family === "C"
      ? "INFERENCE_EVIDENCE_NEED"
      : "VOCABULARY_CONTEXT_NEED";
}

function adaptiveReviewSignal(metrics: unknown): {
  family: AdaptiveRouteFamily;
  reasonCode: RouteReasonCode;
} | null {
  const adaptive = readAdaptiveRouteMeasurement(metrics);
  if (adaptive.status !== "VALID") return null;
  for (const family of ["B", "C", "D"] as const) {
    const signal = adaptive.measurement.signals[family];
    if (signal?.decisionStatus !== "REVIEW_REQUIRED") continue;
    return {
      family,
      reasonCode:
        signal.decisionReason === "MIXED_DIMENSION_EVIDENCE"
          ? "MEASUREMENT_CONFLICT"
          : "MEASUREMENT_INSUFFICIENT",
    };
  }
  return null;
}

export function routeFamilyFromPathCode(code: string): P1RouteFamily | null {
  const family = /^EDUCATION_V2_P1_([ABCD])(?:_|$)/.exec(code)?.[1];
  return P1_ROUTE_FAMILIES.includes(family as P1RouteFamily) ? (family as P1RouteFamily) : null;
}

export function isP1PathCode(code: string): boolean {
  return routeFamilyFromPathCode(code) !== null;
}

function selectionResult(
  status: RouteSelectionStatus,
  recommendedPathId: string | null,
  routeFamily: P1RouteFamily | null,
  reasonCodes: RouteReasonCode[],
  measurement: RouteSelectionMeasurement | null,
  routeSelectionProfile: string | null,
  candidateAvailable: boolean,
  uncertainty: RouteSelectionUncertainty,
  reason: string,
): RouteSelectionResult {
  return {
    status,
    recommendedPathId,
    routeFamily,
    reasonCodes,
    supportingSignals: {
      measurementResultId: measurement?.id ?? null,
      measuredSkillCodes: measurement?.skillResults.map((item) => item.skillCode) ?? [],
      requiredReadingComprehensionSkills: [...REQUIRED_RC_SKILLS],
      routeSelectionProfile,
      candidateAvailable,
    },
    uncertainty,
    policyVersion: P1_ROUTE_SELECTION_POLICY_VERSION,
    reason,
  };
}

function findCandidate(
  candidates: readonly RouteSelectionCandidate[],
  family: P1RouteFamily,
  levelId: string | null,
): RouteSelectionCandidate | null {
  return (
    candidates.find(
      (candidate) =>
        candidate.status === "PUBLISHED" &&
        candidate.curriculumReady !== false &&
        routeFamilyFromPathCode(candidate.code) === family &&
        (candidate.levelId === null || candidate.levelId === levelId),
    ) ?? null
  );
}

/**
 * Pure P0 -> P1 route decision. It does not read or mutate the database.
 * B/C/D are fail-closed until the complete, versioned official contract is
 * persisted by the assessment pipeline. In particular, legacy client-shaped
 * profile fields cannot activate a route.
 */
export function selectP1Route(input: SelectP1RouteInput): RouteSelectionResult {
  const { measurement, candidates, levelId } = input;
  if (!measurement || !measurement.isFinalP0Measurement) {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      null,
      ["MEASUREMENT_INSUFFICIENT"],
      measurement,
      null,
      false,
      "HIGH",
      "P0 final ölçümü bulunamadı",
    );
  }

  if (!hasReadingComprehensionEvidence(measurement.skillResults)) {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      null,
      ["MEASUREMENT_INSUFFICIENT"],
      measurement,
      null,
      false,
      "HIGH",
      "Okuduğunu anlama için gerekli ölçüm sinyalleri eksik",
    );
  }

  const adaptive = readAdaptiveRouteMeasurement(measurement.metrics);
  if (adaptive.status === "INVALID") {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      null,
      ["MEASUREMENT_INSUFFICIENT"],
      measurement,
      null,
      false,
      "HIGH",
      "Uyarlanabilir ölçüm sözleşmesi geçersiz",
    );
  }
  if (adaptive.status === "VALID") {
    const reviewSignal = adaptiveReviewSignal(measurement.metrics);
    if (reviewSignal) {
      return selectionResult(
        "REVIEW_REQUIRED",
        null,
        reviewSignal.family,
        [reviewSignal.reasonCode],
        measurement,
        null,
        false,
        "HIGH",
        `P1-${reviewSignal.family} için server-side route ihtiyacı kesinleştirilemedi`,
      );
    }
    const activeFamilies = (
      Object.keys(adaptive.measurement.signals) as AdaptiveRouteFamily[]
    ).filter((family) => adaptive.measurement.signals[family]?.needsRoute === true);
    if (activeFamilies.length > 1) {
      return selectionResult(
        "REVIEW_REQUIRED",
        null,
        null,
        ["MEASUREMENT_CONFLICT"],
        measurement,
        "MEASUREMENT_CONFLICT",
        false,
        "HIGH",
        "Ölçüm sinyalleri birden fazla P1 ihtiyacını gösteriyor",
      );
    }
    const activeFamily = activeFamilies[0];
    if (activeFamily && !hasCompleteAdaptiveRouteEvidence(adaptive.measurement, activeFamily)) {
      return selectionResult(
        "REVIEW_REQUIRED",
        null,
        activeFamily,
        [
          activeFamily === "B"
            ? "FLUENCY_ACCURACY_NEED"
            : activeFamily === "C"
              ? "INFERENCE_EVIDENCE_NEED"
              : "VOCABULARY_CONTEXT_NEED",
        ],
        measurement,
        null,
        false,
        "HIGH",
        `P1-${activeFamily} için gerekli resmi kanıtların tamamı yok`,
      );
    }
  }

  const profile = readRouteSelectionProfile(measurement.metrics);
  if (profile === "MEASUREMENT_CONFLICT") {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      null,
      ["MEASUREMENT_CONFLICT"],
      measurement,
      profile,
      false,
      "HIGH",
      "Ölçüm sinyalleri birden fazla baskın ihtiyacı gösteriyor",
    );
  }

  const family: P1RouteFamily =
    profile === "FLUENCY_ACCURACY_NEED"
      ? "B"
      : profile === "INFERENCE_EVIDENCE_NEED"
        ? "C"
        : profile === "VOCABULARY_CONTEXT_NEED"
          ? "D"
          : "A";
  const reasonCode: RouteReasonCode =
    family === "B"
      ? "FLUENCY_ACCURACY_NEED"
      : family === "C"
        ? "INFERENCE_EVIDENCE_NEED"
        : family === "D"
          ? "VOCABULARY_CONTEXT_NEED"
          : "BALANCED_PROFILE";
  const candidate = findCandidate(candidates, family, levelId);
  if (!candidate) {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      family,
      [reasonCode],
      measurement,
      profile,
      false,
      "HIGH",
      `P1-${family} için yayınlanmış uygun öğrenme yolu bulunamadı`,
    );
  }

  return selectionResult(
    "READY",
    candidate.id,
    family,
    [reasonCode],
    measurement,
    profile,
    true,
    "LOW",
    `P1-${family} rotası ölçüm sözleşmesine göre seçildi`,
  );
}
