import type { QuestionType } from "@prisma/client";
import {
  ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
  readAdaptivePlacementItemMapping,
} from "../../curriculum/adaptive-placement-item-mapping.js";
import {
  ADAPTIVE_ROUTE_CONTRACTS,
  ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
  type AdaptiveRouteEvidenceDimension,
  type AdaptiveRouteFamily,
  type AdaptiveRouteMeasurement,
  type AdaptiveRouteSignal,
} from "../measurements/adaptive-route-contract.js";

const CANONICAL_PLACEMENT_MANIFEST_ID = "OKU-READING-PLACEMENT-V1";
const CANONICAL_PLACEMENT_ITEM_BANK_ID = "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1";

const ADAPTIVE_DIMENSIONS = new Set<AdaptiveRouteEvidenceDimension>([
  "FLUENCY",
  "ACCURACY",
  "MEANING_PRESERVATION",
  "TRANSFER",
  "INFERENCE",
  "EVIDENCE_FINDING",
  "EVIDENCE_RELATION",
  "CONTEXTUAL_MEANING",
  "LEXICAL_RELATION",
  "DOMAIN_CONTEXT",
]);

type JsonObject = Record<string, unknown>;

export type AdaptiveMeasurementQuestion = {
  questionVersionId: string;
  questionType: QuestionType;
  skillCode: string | null;
  generationMetadata?: unknown;
};

export type AdaptiveMeasurementAttempt = {
  questionVersionId: string;
  rawScore: number | null;
};

export type AdaptiveMeasurementRouteDecision = Partial<Record<AdaptiveRouteFamily, boolean>>;

export type AdaptiveMeasurementScoringReason =
  | "NO_TRUSTED_DIMENSION_MAPPING"
  | "INCOMPLETE_DIMENSION_EVIDENCE"
  | "DUPLICATE_ATTEMPT"
  | "UNKNOWN_ATTEMPT_QUESTION"
  | "MISSING_ROUTE_DECISION";

export type AdaptiveMeasurementScoringResult = {
  measurement: AdaptiveRouteMeasurement;
  status: "READY" | "REVIEW_REQUIRED";
  reasons: readonly AdaptiveMeasurementScoringReason[];
  mappedDimensionCount: number;
};

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function hasEditorialEvidence(value: unknown): boolean {
  const evidence = objectValue(value);
  const paragraph = evidence?.paragraph;
  const span = stringValue(evidence?.span);
  return (
    typeof paragraph === "number" && Number.isInteger(paragraph) && paragraph > 0 && span !== null
  );
}

function explicitDimensions(metadata: JsonObject): AdaptiveRouteEvidenceDimension[] {
  const raw = metadata.adaptiveEvidenceDimensions;
  if (!Array.isArray(raw)) return [];
  const dimensions = raw.filter(
    (value): value is AdaptiveRouteEvidenceDimension =>
      typeof value === "string" && ADAPTIVE_DIMENSIONS.has(value as AdaptiveRouteEvidenceDimension),
  );
  return [...new Set(dimensions)];
}

/**
 * Returns only mappings owned by the canonical, server-provisioned placement
 * item bank. Arbitrary question metadata is never enough to create adaptive
 * evidence. The current canonical bank explicitly supports three C dimensions
 * on reviewed items; B and D remain review-gated until their item mappings
 * and server scoring signals exist.
 */
function trustedDimensions(
  question: AdaptiveMeasurementQuestion,
): readonly AdaptiveRouteEvidenceDimension[] {
  const metadata = objectValue(question.generationMetadata);
  if (!metadata) return [];
  if (
    metadata.canonicalManifestId !== CANONICAL_PLACEMENT_MANIFEST_ID ||
    metadata.itemBankManifestId !== CANONICAL_PLACEMENT_ITEM_BANK_ID ||
    metadata.skillCode !== question.skillCode
  ) {
    return [];
  }

  const sourceMetadata = objectValue(metadata.sourceMetadata);
  if (
    sourceMetadata?.sourceType !== "ORIGINAL_EDITORIAL" ||
    sourceMetadata.sourceId !== "OKU-PLACEMENT-V1-EDITORIAL" ||
    !hasEditorialEvidence(metadata.evidence)
  ) {
    return [];
  }

  const currentEditorialMapping = readAdaptivePlacementItemMapping(metadata);
  if (currentEditorialMapping) return currentEditorialMapping.dimensions;

  // The current immutable bank is closed-world: an unknown stable question id
  // must not become trusted merely because its stored metadata names this
  // mapping version. Future bank versions may opt into the existing explicit
  // server-owned mapping extension point.
  if (metadata.itemBankManifestVersion === "1.0.1") return [];

  const explicit = explicitDimensions(metadata);
  return metadata.adaptiveMeasurementMappingVersion === ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION
    ? explicit
    : [];
}

function assertRawScore(rawScore: number): void {
  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 1) {
    throw new Error("Adaptive measurement rawScore 0..1 aralığında olmalı");
  }
}

function emptySignal(needsRoute: boolean): AdaptiveRouteSignal {
  return { needsRoute, evidence: {} };
}

/**
 * Converts the immutable server-scored placement attempts into the versioned
 * adaptive evidence envelope. This function never calculates a route need
 * from a score. A route decision can only be supplied by a future official,
 * server-owned classifier; without it every signal remains review-gated.
 */
export function scoreAdaptiveMeasurement(
  assessmentId: string,
  questions: readonly AdaptiveMeasurementQuestion[],
  attempts: readonly AdaptiveMeasurementAttempt[],
  routeDecisions: AdaptiveMeasurementRouteDecision = {},
): AdaptiveMeasurementScoringResult {
  const reasons = new Set<AdaptiveMeasurementScoringReason>();
  const questionIds = new Set(questions.map((question) => question.questionVersionId));
  const attemptsByQuestion = new Map<string, AdaptiveMeasurementAttempt>();

  for (const attempt of attempts) {
    if (!questionIds.has(attempt.questionVersionId)) {
      reasons.add("UNKNOWN_ATTEMPT_QUESTION");
      continue;
    }
    if (attemptsByQuestion.has(attempt.questionVersionId)) {
      reasons.add("DUPLICATE_ATTEMPT");
      continue;
    }
    attemptsByQuestion.set(attempt.questionVersionId, attempt);
  }

  const totals = new Map<
    AdaptiveRouteEvidenceDimension,
    { totalRawScore: number; scoredCount: number }
  >();
  let mappedDimensionCount = 0;

  for (const question of questions) {
    if (question.questionType === "OPEN_ENDED") continue;
    const dimensions = trustedDimensions(question);
    mappedDimensionCount += dimensions.length;
    const attempt = attemptsByQuestion.get(question.questionVersionId);
    if (dimensions.length === 0 || !attempt || attempt.rawScore === null) continue;
    assertRawScore(attempt.rawScore);
    for (const dimension of dimensions) {
      const total = totals.get(dimension) ?? { totalRawScore: 0, scoredCount: 0 };
      total.totalRawScore += attempt.rawScore;
      total.scoredCount += 1;
      totals.set(dimension, total);
    }
  }

  const signals: Partial<Record<AdaptiveRouteFamily, AdaptiveRouteSignal>> = {};
  let completeEvidence = true;

  for (const family of ["B", "C", "D"] as const) {
    const evidence: AdaptiveRouteSignal["evidence"] = {};
    let hasAnyFamilyEvidence = false;
    for (const dimension of ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions) {
      const total = totals.get(dimension);
      if (!total) continue;
      hasAnyFamilyEvidence = true;
      evidence[dimension] = {
        score: total.scoredCount > 0 ? total.totalRawScore / total.scoredCount : null,
        scoredCount: total.scoredCount,
      };
    }
    if (!hasAnyFamilyEvidence) {
      if (routeDecisions[family] === true) {
        signals[family] = emptySignal(true);
        completeEvidence = false;
      }
      continue;
    }

    const needsRoute = routeDecisions[family] === true;
    const signal = { needsRoute, evidence };
    signals[family] = signal;
    const familyComplete = ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions.every(
      (dimension) => (evidence[dimension]?.scoredCount ?? 0) > 0,
    );
    if (!familyComplete || routeDecisions[family] === undefined) completeEvidence = false;
  }

  if (mappedDimensionCount === 0) reasons.add("NO_TRUSTED_DIMENSION_MAPPING");
  if (!completeEvidence) reasons.add("INCOMPLETE_DIMENSION_EVIDENCE");
  if (
    Object.keys(signals).some(
      (family) => routeDecisions[family as AdaptiveRouteFamily] === undefined,
    )
  ) {
    reasons.add("MISSING_ROUTE_DECISION");
  }

  const measurement: AdaptiveRouteMeasurement = {
    contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
    source: "OFFICIAL_PLACEMENT",
    assessmentId,
    itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    signals,
  };

  return {
    measurement,
    status: reasons.size === 0 ? "READY" : "REVIEW_REQUIRED",
    reasons: [...reasons],
    mappedDimensionCount,
  };
}
