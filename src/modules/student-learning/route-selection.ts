import type { MeasurementSkillResult } from "../measurements/service.js";

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

type RouteSelectionProfile =
  | "FLUENCY_ACCURACY_NEED"
  | "INFERENCE_EVIDENCE_NEED"
  | "VOCABULARY_CONTEXT_NEED"
  | "BALANCED_PROFILE"
  | "MEASUREMENT_CONFLICT";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function profileFromValue(value: unknown): RouteSelectionProfile | null {
  if (value === "FLUENCY_ACCURACY_NEED") return value;
  if (value === "INFERENCE_EVIDENCE_NEED") return value;
  if (value === "VOCABULARY_CONTEXT_NEED") return value;
  if (value === "BALANCED_PROFILE") return value;
  if (value === "MEASUREMENT_CONFLICT") return value;
  return null;
}

/**
 * Reads only an explicit, versionable academic measurement contract.
 * Training data, WPM values and arbitrary client fields are ignored.
 */
export function readRouteSelectionProfile(metrics: unknown): RouteSelectionProfile | null {
  const root = objectValue(metrics);
  const nested = objectValue(root?.routeSelection);
  const explicitProfile = profileFromValue(root?.routeSelectionProfile ?? nested?.profile);
  if (explicitProfile) return explicitProfile;

  const signals = objectValue(root?.routeSelectionSignals ?? nested?.signals);
  if (!signals) return null;
  const activeReasons: string[] = [];
  if (signals.fluencyAccuracyNeed === true) activeReasons.push("FLUENCY_ACCURACY_NEED");
  if (signals.inferenceEvidenceNeed === true) activeReasons.push("INFERENCE_EVIDENCE_NEED");
  if (signals.vocabularyContextNeed === true) activeReasons.push("VOCABULARY_CONTEXT_NEED");
  if (activeReasons.length > 1) return "MEASUREMENT_CONFLICT";
  return profileFromValue(activeReasons[0]) ?? "BALANCED_PROFILE";
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

function hasRequiredReadingComprehensionEvidence(measurement: RouteSelectionMeasurement): boolean {
  const byCode = new Map(measurement.skillResults.map((item) => [item.skillCode, item]));
  return REQUIRED_RC_SKILLS.every((skillCode) => {
    const item = byCode.get(skillCode);
    return Boolean(item && item.scoredCount > 0 && item.score !== null);
  });
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
        routeFamilyFromPathCode(candidate.code) === family &&
        (candidate.levelId === null || candidate.levelId === levelId),
    ) ?? null
  );
}

/**
 * Pure P0 -> P1 route decision. It does not read or mutate the database.
 * P1-B and P1-D are fail-closed until their official measurement contracts
 * exist. P1-C requires actual RC evidence and an explicit inference profile.
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

  if (!hasRequiredReadingComprehensionEvidence(measurement)) {
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

  if (profile === "FLUENCY_ACCURACY_NEED") {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      "B",
      ["FLUENCY_ACCURACY_NEED"],
      measurement,
      profile,
      false,
      "HIGH",
      "P1-B için resmi akıcılık ölçüm sözleşmesi henüz yok",
    );
  }

  if (profile === "VOCABULARY_CONTEXT_NEED") {
    return selectionResult(
      "REVIEW_REQUIRED",
      null,
      "D",
      ["VOCABULARY_CONTEXT_NEED"],
      measurement,
      profile,
      false,
      "HIGH",
      "P1-D için resmi kelime/kontekst ölçüm sözleşmesi henüz yok",
    );
  }

  const family: P1RouteFamily = profile === "INFERENCE_EVIDENCE_NEED" ? "C" : "A";
  const reasonCode: RouteReasonCode =
    family === "C" ? "INFERENCE_EVIDENCE_NEED" : "BALANCED_PROFILE";
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
