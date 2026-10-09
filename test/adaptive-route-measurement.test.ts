import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_ROUTE_CONTRACTS,
  ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
  hasCompleteAdaptiveRouteEvidence,
  readAdaptiveRouteMeasurement,
} from "../src/modules/measurements/adaptive-route-contract.js";
import { ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION } from "../src/curriculum/adaptive-placement-item-mapping.js";

function metrics(family: "B" | "C" | "D", missing?: string) {
  const dimensions = ADAPTIVE_ROUTE_CONTRACTS[family].requiredDimensions;
  return {
    adaptiveRouteMeasurement: {
      contractVersion: ADAPTIVE_ROUTE_MEASUREMENT_CONTRACT_VERSION,
      source: "OFFICIAL_PLACEMENT",
      assessmentId: "placement-result-1",
      itemMappingVersion: ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
      calibrationStatus: "CALIBRATED",
      productionAssignmentEnabled: true,
      signals: {
        [family]: {
          needsRoute: true,
          decisionStatus: "DECIDED",
          decisionReason: "EXPLICIT_SERVER_DECISION",
          evidence: Object.fromEntries(
            dimensions.map((dimension) => [
              dimension,
              { score: 0.5, scoredCount: dimension === missing ? 0 : 4 },
            ]),
          ),
        },
      },
    },
  };
}

describe("adaptive route measurement contracts", () => {
  it("accepts only the versioned official placement evidence envelope", () => {
    const result = readAdaptiveRouteMeasurement(metrics("C"));
    expect(result.status).toBe("VALID");
    if (result.status === "VALID") {
      expect(hasCompleteAdaptiveRouteEvidence(result.measurement, "C")).toBe(true);
    }
  });

  it("rejects missing evidence dimensions instead of guessing", () => {
    const result = readAdaptiveRouteMeasurement(metrics("B", "TRANSFER"));
    expect(result.status).toBe("VALID");
    if (result.status === "VALID") {
      expect(hasCompleteAdaptiveRouteEvidence(result.measurement, "B")).toBe(false);
    }
  });

  it("rejects route evidence without server decision, mapping version, or score", () => {
    const base = metrics("C").adaptiveRouteMeasurement;
    expect(
      hasCompleteAdaptiveRouteEvidence(
        {
          ...base,
          itemMappingVersion: undefined,
          signals: {
            C: {
              ...base.signals.C,
              decisionStatus: undefined,
            },
          },
        },
        "C",
      ),
    ).toBe(false);

    expect(
      hasCompleteAdaptiveRouteEvidence(
        {
          ...base,
          signals: {
            C: {
              ...base.signals.C,
              evidence: {
                ...base.signals.C.evidence,
                INFERENCE: { score: null, scoredCount: 4 },
              },
            },
          },
        },
        "C",
      ),
    ).toBe(false);
  });

  it("keeps complete evidence review-gated while the assessment is uncalibrated", () => {
    const result = readAdaptiveRouteMeasurement({
      adaptiveRouteMeasurement: {
        ...metrics("C").adaptiveRouteMeasurement,
        calibrationStatus: "NOT_CALIBRATED",
        productionAssignmentEnabled: false,
      },
    });
    expect(result.status).toBe("VALID");
    if (result.status === "VALID") {
      expect(hasCompleteAdaptiveRouteEvidence(result.measurement, "C")).toBe(false);
    }
  });

  it("rejects unversioned or non-placement route data", () => {
    expect(
      readAdaptiveRouteMeasurement({ routeSelectionProfile: "INFERENCE_EVIDENCE_NEED" }).status,
    ).toBe("MISSING");
    expect(
      readAdaptiveRouteMeasurement({
        adaptiveRouteMeasurement: {
          ...metrics("D").adaptiveRouteMeasurement,
          source: "TRAINING",
        },
      }).status,
    ).toBe("INVALID");
  });

  it("keeps route contracts explicit and dimension-specific", () => {
    expect(ADAPTIVE_ROUTE_CONTRACTS.B.requiredDimensions).toEqual([
      "FLUENCY",
      "ACCURACY",
      "MEANING_PRESERVATION",
      "TRANSFER",
    ]);
    expect(ADAPTIVE_ROUTE_CONTRACTS.C.requiredDimensions).toEqual([
      "INFERENCE",
      "EVIDENCE_FINDING",
      "EVIDENCE_RELATION",
    ]);
    expect(ADAPTIVE_ROUTE_CONTRACTS.D.requiredDimensions).toEqual([
      "CONTEXTUAL_MEANING",
      "LEXICAL_RELATION",
      "DOMAIN_CONTEXT",
    ]);
  });
});
