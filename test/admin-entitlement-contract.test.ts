import { describe, expect, it } from "vitest";
import {
  changeManagedEntitlementPlanSchema,
  createManagedEntitlementSchema,
  updateEntitlementSchema,
} from "../src/modules/entitlements/admin-schemas.js";

describe("Superadmin manual package action contracts", () => {
  it("resolves personal tenant server-side and rejects tenant/source supplied by the browser", () => {
    const base = { userId: "user-1", scope: "PERSONAL", plan: "PLAN_PREMIUM" };
    expect(createManagedEntitlementSchema.safeParse(base).success).toBe(true);
    expect(
      createManagedEntitlementSchema.safeParse({ ...base, tenantId: "tenant-1" }).success,
    ).toBe(false);
    expect(createManagedEntitlementSchema.safeParse({ ...base, source: "BILLING" }).success).toBe(
      false,
    );
  });

  it("requires an explicit organization target and keeps it distinct from a user grant", () => {
    expect(
      createManagedEntitlementSchema.safeParse({
        tenantId: "organization-1",
        scope: "ORGANIZATION",
        plan: "PLAN_FREE",
      }).success,
    ).toBe(true);
    expect(
      createManagedEntitlementSchema.safeParse({
        tenantId: "organization-1",
        userId: "user-1",
        scope: "ORGANIZATION",
        plan: "PLAN_FREE",
      }).success,
    ).toBe(false);
  });

  it("keeps update limited to extension or deactivation; plan change is a separate history-preserving action", () => {
    expect(updateEntitlementSchema.safeParse({ active: false }).success).toBe(true);
    expect(
      updateEntitlementSchema.safeParse({ expiresAt: "2027-01-01T00:00:00.000Z" }).success,
    ).toBe(true);
    expect(updateEntitlementSchema.safeParse({ active: true }).success).toBe(false);
    expect(updateEntitlementSchema.safeParse({ source: "BILLING" }).success).toBe(false);
    expect(updateEntitlementSchema.safeParse({ plan: "PLAN_PREMIUM" }).success).toBe(false);
    expect(updateEntitlementSchema.safeParse({ active: false, expiresAt: null }).success).toBe(
      false,
    );
    expect(
      changeManagedEntitlementPlanSchema.safeParse({
        plan: "PLAN_PREMIUM",
        effectiveAt: "2027-01-01T00:00:00.000Z",
        expiresAt: "2027-06-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
