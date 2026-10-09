import type { MeasurementSkillResult } from "./service.js";
import { ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION } from "../../curriculum/adaptive-placement-item-mapping.js";

/**
 * Versioned, server-produced evidence contract for adaptive P1 routing.
 *
 * The contract deliberately does not calculate a route from a single score.
 * A trusted assessment scorer must persist the complete evidence set and a
 * versioned server-owned need decision. Training telemetry, WPM and
 * client-provided route fields are not valid inputs to this contract.
 */
export const ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION = "P1_ADAPTIVE_MEASUREMENT_V1" as const;

export type AdaptiveRouteFamily = "B" | "C" | "D";
export type AdaptiveRouteEvidenceDimension =
  | "FLUENCY"
  | "ACCURACY"
  | "MEANING_PRESERVATION"
  | "TRANSFER"
  | "INFERENCE"
  | "EVIDENCE_FINDING"
  | "EVIDENCE_RELATION"
  | "CONTEXTUAL_MEANING"
  | "LEXICAL_RELATION"
  | "DOMAIN_CONTEXT";

export type AdaptiveRouteEvidenceValue = {
  score: number | null;
  scoredCount: number;
  eligibleCount?: number;
};

export type AdaptiveRouteSignal = {
  needsRoute: boolean;
  evidence: Partial<Record<AdaptiveRouteEvidenceDimension, AdaptiveRouteEvidenceValue>>;
  decisionStatus?: "DECIDED" | "REVIEW_REQUIRED";
  decisionReason?: string;
};

export type AdaptiveRouteMeasurement = {
  contractVersion: typeof ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION;
  source: "OFFICIAL_PLACEMENT";
  assessmentId: string;
  itemMappingVersion?: string;
  routeNeedClassifierVersion?: string;
  signals: Partial<Record<AdaptiveRouteFamily, AdaptiveRouteSignal>>;
};

export const ADAPTIVE_ROUTE_CONTRACTS: Readonly<
  Record<
    AdaptiveRouteFamily,
    {
      routeFamily: AdaptiveRouteFamily;
      requiredDimensions: readonly AdaptiveRouteEvidenceDimension[];
    }
  >
> = Object.freeze({
  B: {
    routeFamily: "B",
    requiredDimensions: ["FLUENCY", "ACCURACY", "MEANING_PRESERVATION", "TRANSFER"],
  },
  C: {
    routeFamily: "C",
    requiredDimensions: ["INFERENCE", "EVIDENCE_FINDING", "EVIDENCE_RELATION"],
  },
  D: {
    routeFamily: "D",
    requiredDimensions: ["CONTEXTUAL_MEANING", "LEXICAL_RELATION", "DOMAIN_CONTEXT"],
  },
});

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function validEvidenceValue(value: unknown): value is AdaptiveRouteEvidenceValue {
  const row = objectValue(value);
  return Boolean(
    row &&
    (row.score === null ||
      (typeof row.score === "number" &&
        Number.isFinite(row.score) &&
        row.score >= 0 &&
        row.score <= 1)) &&
    typeof row.scoredCount === "number" &&
    Number.isInteger(row.scoredCount) &&
    row.scoredCount >= 0 &&
    (row.eligibleCount === undefined ||
      (typeof row.eligibleCount === "number" &&
        Number.isInteger(row.eligibleCount) &&
        row.eligibleCount >= row.scoredCount)),
  );
}

function parseSignal(value: unknown): AdaptiveRouteSignal | null {
  const row = objectValue(value);
  const evidence = objectValue(row?.evidence);
  if (
    !row ||
    typeof row.needsRoute !== "boolean" ||
    !evidence ||
    (row.decisionStatus !== undefined &&
      row.decisionStatus !== "DECIDED" &&
      row.decisionStatus !== "REVIEW_REQUIRED") ||
    (row.decisionReason !== undefined &&
      (typeof row.decisionReason !== "string" || row.decisionReason.length === 0))
  ) {
    return null;
  }
  const parsedEvidence: AdaptiveRouteSignal["evidence"] = {};
  for (const [dimension, item] of Object.entries(evidence)) {
    if (!validEvidenceValue(item)) return null;
    parsedEvidence[dimension as AdaptiveRouteEvidenceDimension] = item;
  }
  return {
    needsRoute: row.needsRoute,
    evidence: parsedEvidence,
    ...(row.decisionStatus !== undefined ? { decisionStatus: row.decisionStatus } : {}),
    ...(row.decisionReason !== undefined ? { decisionReason: row.decisionReason } : {}),
  };
}

function parseMeasurement(value: unknown): AdaptiveRouteMeasurement | null {
  const root = objectValue(value);
  if (
    root?.contractVersion !== ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION ||
    root.source !== "OFFICIAL_PLACEMENT" ||
    typeof root.assessmentId !== "string" ||
    root.assessmentId.length === 0
  ) {
    return null;
  }
  const signals = objectValue(root.signals);
  if (!signals) return null;
  if (root.itemMappingVersion !== undefined && typeof root.itemMappingVersion !== "string") {
    return null;
  }
  if (
    root.routeNeedClassifierVersion !== undefined &&
    (typeof root.routeNeedClassifierVersion !== "string" ||
      root.routeNeedClassifierVersion.length === 0)
  ) {
    return null;
  }
  const parsedSignals: Partial<Record<AdaptiveRouteFamily, AdaptiveRouteSignal>> = {};
  for (const family of ["B", "C", "D"] as const) {
    if (signals[family] === undefined) continue;
    const signal = parseSignal(signals[family]);
    if (!signal) return null;
    parsedSignals[family] = signal;
  }
  return {
    contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
    source: "OFFICIAL_PLACEMENT",
    assessmentId: root.assessmentId,
    ...(root.itemMappingVersion !== undefined
      ? { itemMappingVersion: root.itemMappingVersion }
      : {}),
    ...(root.routeNeedClassifierVersion !== undefined
      ? { routeNeedClassifierVersion: root.routeNeedClassifierVersion }
      : {}),
    signals: parsedSignals,
  };
}

export type AdaptiveRouteEvidenceRead =
  | { status: "MISSING"; measurement: null }
  | { status: "INVALID"; measurement: null }
  | { status: "VALID"; measurement: AdaptiveRouteMeasurement };

export function readAdaptiveRouteMeasurement(metrics: unknown): AdaptiveRouteEvidenceRead {
  const root = objectValue(metrics);
  const raw = root?.adaptiveRouteMeasurement;
  if (raw === undefined) return { status: "MISSING", measurement: null };
  const measurement = parseMeasurement(raw);
  return measurement ? { status: "VALID", measurement } : { status: "INVALID", measurement: null };
}

export function hasCompleteAdaptiveRouteEvidence(
  measurement: AdaptiveRouteMeasurement,
  family: AdaptiveRouteFamily,
): boolean {
  const signal = measurement.signals[family];
  if (
    !signal?.needsRoute ||
    signal.decisionStatus !== "DECIDED" ||
    measurement.itemMappingVersion !== ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION
  ) {
    return false;
  }
  return ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions.every((dimension) => {
    const evidence = signal.evidence[dimension];
    return Boolean(
      evidence &&
      evidence.score !== null &&
      Number.isFinite(evidence.score) &&
      evidence.scoredCount > 0 &&
      (evidence.eligibleCount === undefined || evidence.scoredCount === evidence.eligibleCount),
    );
  });
}

/**
 * The existing RC skill evidence remains a prerequisite for every P1 route.
 * This helper is intentionally narrow; it does not turn a skill score into a
 * B/C/D recommendation.
 */
export function hasReadingComprehensionEvidence(
  skillResults: readonly MeasurementSkillResult[],
): boolean {
  const byCode = new Map(skillResults.map((item) => [item.skillCode, item]));
  return ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"].every((code) => {
    const item = byCode.get(code);
    return Boolean(item && item.scoredCount > 0 && item.score !== null);
  });
}
