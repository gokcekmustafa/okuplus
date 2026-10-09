import {
  ADAPTIVE_ROUTE_CONTRACTS,
  type AdaptiveRouteEvidenceDimension,
  type AdaptiveRouteEvidenceValue,
} from "../measurements/adaptive-route-contract.js";

/**
 * This classifier deliberately has no calibrated score band. It only makes a
 * route decision for unambiguous endpoint evidence across every required C
 * dimension. Intermediate or mixed results remain review-gated.
 */
export const P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_VERSION =
  "P1_ADAPTIVE_ROUTE_NEED_CLASSIFIER_V1" as const;

export type AdaptiveRouteNeedClassification =
  | {
      status: "DECIDED";
      needsRoute: boolean;
      reason: "ALL_REQUIRED_DIMENSIONS_ZERO" | "ALL_REQUIRED_DIMENSIONS_ONE";
    }
  | {
      status: "REVIEW_REQUIRED";
      needsRoute: false;
      reason:
        "INCOMPLETE_EVIDENCE" | "MIXED_DIMENSION_EVIDENCE" | "INTERMEDIATE_DIMENSION_EVIDENCE";
    };

function completeEvidence(
  evidence: Partial<Record<AdaptiveRouteEvidenceDimension, AdaptiveRouteEvidenceValue>>,
): AdaptiveRouteEvidenceValue[] | null {
  const values = ADAPTIVE_ROUTE_CONTRACTS.C.requiredDimensions.map(
    (dimension) => evidence[dimension],
  );
  if (
    values.some(
      (value) =>
        !value ||
        value.scoredCount <= 0 ||
        !Number.isFinite(value.score) ||
        value.score === null ||
        (value.eligibleCount !== undefined && value.scoredCount !== value.eligibleCount),
    )
  ) {
    return null;
  }
  return values as AdaptiveRouteEvidenceValue[];
}

/**
 * Classifies only the C route from server-scored, dimension-specific evidence.
 * A C route is automatic only when all three dimensions are completely
 * unsuccessful. A fully successful profile is explicitly not a C need. Any
 * partial, mixed, or incomplete profile is REVIEW_REQUIRED rather than being
 * forced through an invented threshold.
 */
export function classifyCAdaptiveRouteNeed(
  evidence: Partial<Record<AdaptiveRouteEvidenceDimension, AdaptiveRouteEvidenceValue>>,
): AdaptiveRouteNeedClassification {
  const values = completeEvidence(evidence);
  if (!values) {
    return {
      status: "REVIEW_REQUIRED",
      needsRoute: false,
      reason: "INCOMPLETE_EVIDENCE",
    };
  }

  const scores = values.map((value) => value.score as number);
  const allZero = scores.every((score) => score === 0);
  const allOne = scores.every((score) => score === 1);
  if (allZero) {
    return {
      status: "DECIDED",
      needsRoute: true,
      reason: "ALL_REQUIRED_DIMENSIONS_ZERO",
    };
  }
  if (allOne) {
    return {
      status: "DECIDED",
      needsRoute: false,
      reason: "ALL_REQUIRED_DIMENSIONS_ONE",
    };
  }

  const hasOnlyEndpoints = scores.every((score) => score === 0 || score === 1);
  return {
    status: "REVIEW_REQUIRED",
    needsRoute: false,
    reason: hasOnlyEndpoints ? "MIXED_DIMENSION_EVIDENCE" : "INTERMEDIATE_DIMENSION_EVIDENCE",
  };
}
