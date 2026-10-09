import type { QuestionType } from "@prisma/client";
import {
  ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
  readAdaptivePlacementItemMapping,
} from "../../curriculum/adaptive-placement-item-mapping.js";
import {
  P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_VERSION,
  classifyCAdaptiveRouteNeed,
} from "./adaptive-route-need-classifier.js";
import {
  ADAPTIVE_ROUTE_CONTRACTS,
  ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
  type AdaptiveRouteEvidenceDimension,
  type AdaptiveRouteFamily,
  type AdaptiveRouteMeasurement,
  type AdaptiveRouteSignal,
} from "../measurements/adaptive-route-contract.js";
import { PLACEMENT_SCORING_CONTRACT_V1 } from "./placement-scoring.js";

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
  | "MISSING_ROUTE_DECISION"
  | "INDETERMINATE_ROUTE_NEED"
  | "CALIBRATION_REQUIRED";

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
 * adaptive evidence envelope. C uses the conservative endpoint-only,
 * server-owned classifier; B and D remain review-gated until their official
 * evidence exists. No calibrated score band is inferred here.
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
    { totalRawScore: number; scoredCount: number; eligibleCount: number }
  >();
  let mappedDimensionCount = 0;

  for (const question of questions) {
    if (question.questionType === "OPEN_ENDED") continue;
    const dimensions = trustedDimensions(question);
    mappedDimensionCount += dimensions.length;
    const attempt = attemptsByQuestion.get(question.questionVersionId);
    if (dimensions.length === 0) continue;
    for (const dimension of dimensions) {
      const total = totals.get(dimension) ?? { totalRawScore: 0, scoredCount: 0, eligibleCount: 0 };
      total.eligibleCount += 1;
      totals.set(dimension, total);
    }
    if (!attempt || attempt.rawScore === null) continue;
    assertRawScore(attempt.rawScore);
    for (const dimension of dimensions) {
      const total = totals.get(dimension)!;
      total.totalRawScore += attempt.rawScore;
      total.scoredCount += 1;
      totals.set(dimension, total);
    }
  }

  const signals: Partial<Record<AdaptiveRouteFamily, AdaptiveRouteSignal>> = {};
  let dimensionsComplete = true;

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
        eligibleCount: total.eligibleCount,
      };
    }
    if (!hasAnyFamilyEvidence) {
      if (routeDecisions[family] === true) {
        signals[family] = {
          ...emptySignal(true),
          decisionStatus: "DECIDED",
          decisionReason: "EXPLICIT_SERVER_DECISION",
        };
        dimensionsComplete = false;
      }
      continue;
    }

    const explicitDecision = routeDecisions[family];
    let needsRoute = explicitDecision === true;
    let decisionStatus: AdaptiveRouteSignal["decisionStatus"] =
      explicitDecision === undefined ? undefined : "DECIDED";
    let decisionReason: string | undefined =
      explicitDecision === undefined ? undefined : "EXPLICIT_SERVER_DECISION";

    if (explicitDecision === undefined) {
      if (family === "C") {
        const classification = classifyCAdaptiveRouteNeed(evidence);
        needsRoute = classification.needsRoute;
        decisionStatus = classification.status;
        decisionReason = classification.reason;
        if (classification.status === "REVIEW_REQUIRED") {
          reasons.add("INDETERMINATE_ROUTE_NEED");
        }
      } else {
        reasons.add("MISSING_ROUTE_DECISION");
        decisionStatus = "REVIEW_REQUIRED";
        decisionReason = "UNSUPPORTED_FAMILY";
      }
    }

    const signal: AdaptiveRouteSignal = {
      needsRoute,
      evidence,
      ...(decisionStatus !== undefined ? { decisionStatus } : {}),
      ...(decisionReason !== undefined ? { decisionReason } : {}),
    };
    signals[family] = signal;
    const familyComplete = ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions.every(
      (dimension) => {
        const value = evidence[dimension];
        return Boolean(
          value &&
          value.score !== null &&
          Number.isFinite(value.score) &&
          value.scoredCount > 0 &&
          (value.eligibleCount === undefined || value.scoredCount === value.eligibleCount),
        );
      },
    );
    if (!familyComplete) dimensionsComplete = false;
  }

  if (mappedDimensionCount === 0) reasons.add("NO_TRUSTED_DIMENSION_MAPPING");
  if (!dimensionsComplete) reasons.add("INCOMPLETE_DIMENSION_EVIDENCE");
  if (
    Object.keys(signals).some(
      (family) => family !== "C" && routeDecisions[family as AdaptiveRouteFamily] === undefined,
    )
  ) {
    reasons.add("MISSING_ROUTE_DECISION");
  }

  const measurement: AdaptiveRouteMeasurement = {
    contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
    source: "OFFICIAL_PLACEMENT",
    assessmentId,
    itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
    routeNeedClassifierVersion: P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_VERSION,
    calibrationStatus: PLACEMENT_SCORING_CONTRACT_V1.calibrationStatus,
    productionAssignmentEnabled: PLACEMENT_SCORING_CONTRACT_V1.productionAssignmentEnabled,
    signals,
  };

  if (
    PLACEMENT_SCORING_CONTRACT_V1.calibrationStatus !== "CALIBRATED" ||
    !PLACEMENT_SCORING_CONTRACT_V1.productionAssignmentEnabled
  ) {
    reasons.add("CALIBRATION_REQUIRED");
  }

  return {
    measurement,
    status: reasons.size === 0 ? "READY" : "REVIEW_REQUIRED",
    reasons: [...reasons],
    mappedDimensionCount,
  };
}
