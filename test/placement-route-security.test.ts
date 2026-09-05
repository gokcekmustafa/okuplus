import { describe, expect, it } from "vitest";
import { buildPublishedPlacementAssessmentWhere } from "../src/modules/onboarding/placement-visibility.js";

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
});
