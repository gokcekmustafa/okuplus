import { describe, expect, it } from "vitest";
import { canonicalPlacementAssessmentConfig } from "../src/curriculum/canonical-placement-assessment.js";
import { selectCanonicalPlacementAssessment } from "../src/modules/assessments/canonical-selector.js";
import { buildPublishedPlacementAssessmentWhere } from "../src/modules/onboarding/placement-visibility.js";

function canonicalCandidate(canonicalActive: boolean) {
  return {
    id: canonicalActive ? "canonical-active" : "canonical-inactive",
    tenantId: null,
    type: "PLACEMENT",
    status: "PUBLISHED",
    deletedAt: null,
    config: { ...canonicalPlacementAssessmentConfig(), canonicalActive },
  } as const;
}

describe("placement onboarding visibility", () => {
  it("shows only global placement assessments without an active tenant", () => {
    expect(buildPublishedPlacementAssessmentWhere(null)).toEqual({
      deletedAt: null,
      status: "PUBLISHED",
      type: "PLACEMENT",
      OR: [{ tenantId: null }],
    });
  });

  it("shows global and active-tenant placement assessments only", () => {
    expect(buildPublishedPlacementAssessmentWhere("tenant-a")).toEqual({
      deletedAt: null,
      status: "PUBLISHED",
      type: "PLACEMENT",
      OR: [{ tenantId: null }, { tenantId: "tenant-a" }],
    });
  });

  it("does not select a published canonical placement while canonicalActive is false", () => {
    expect(selectCanonicalPlacementAssessment([canonicalCandidate(false)], null)).toEqual({
      status: "NONE",
      assessment: null,
    });
  });

  it("selects only the active canonical placement identity", () => {
    const candidate = canonicalCandidate(true);
    expect(selectCanonicalPlacementAssessment([candidate], null)).toEqual({
      status: "FOUND",
      assessment: candidate,
    });
  });
});
