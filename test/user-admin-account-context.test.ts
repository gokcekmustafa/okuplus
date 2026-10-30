import { describe, expect, it } from "vitest";
import { entitlementPlanFeatureLabels } from "../src/modules/entitlements/service.js";
import { createUserSchema, listUsersQuerySchema } from "../src/modules/users/schemas.js";
import {
  adminEntitlementStatus,
  entitlementForAccountContext,
  type AdminEntitlementRecord,
} from "../src/modules/users/account-context.js";

const now = new Date("2026-10-30T12:00:00.000Z");

function grant(overrides: Partial<AdminEntitlementRecord> = {}): AdminEntitlementRecord {
  return {
    id: "grant-default",
    userId: "user-1",
    tenantId: "personal-1",
    scope: "PERSONAL",
    plan: "PLAN_PREMIUM",
    active: true,
    source: "ADMIN",
    effectiveAt: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("superadmin account-context package summaries", () => {
  it("keeps personal and multiple organization entitlements in their own contexts", () => {
    const rows = [
      grant(),
      grant({
        id: "org-1-grant",
        userId: null,
        tenantId: "org-1",
        scope: "ORGANIZATION",
        plan: "PLAN_FREE",
      }),
      grant({
        id: "org-2-grant",
        userId: null,
        tenantId: "org-2",
        scope: "ORGANIZATION",
        plan: "PLAN_PREMIUM",
      }),
    ];

    expect(
      entitlementForAccountContext(
        rows,
        {
          userId: "user-1",
          tenantId: "personal-1",
          tenantType: "INDIVIDUAL",
        },
        now,
      )?.id,
    ).toBe("grant-default");
    expect(
      entitlementForAccountContext(rows, {
        userId: "user-1",
        tenantId: "org-1",
        tenantType: "ORGANIZATION",
      })?.id,
    ).toBe("org-1-grant");
    expect(
      entitlementForAccountContext(rows, {
        userId: "user-1",
        tenantId: "org-2",
        tenantType: "ORGANIZATION",
      })?.id,
    ).toBe("org-2-grant");
    expect(
      entitlementForAccountContext(rows, {
        userId: "user-2",
        tenantId: "personal-1",
        tenantType: "INDIVIDUAL",
      }),
    ).toBeNull();
  });

  it("uses runtime-effective grant first, then labels scheduled, expired and inactive records", () => {
    const current = grant({ id: "current" });
    const scheduled = grant({
      id: "scheduled",
      effectiveAt: new Date("2026-11-10T00:00:00.000Z"),
      createdAt: new Date("2026-10-29T00:00:00.000Z"),
    });
    expect(
      entitlementForAccountContext(
        [scheduled, current],
        {
          userId: "user-1",
          tenantId: "personal-1",
          tenantType: "INDIVIDUAL",
        },
        now,
      )?.id,
    ).toBe("current");
    expect(adminEntitlementStatus(scheduled, now)).toBe("SCHEDULED");
    expect(
      adminEntitlementStatus(grant({ expiresAt: new Date("2026-10-20T00:00:00.000Z") }), now),
    ).toBe("EXPIRED");
    expect(adminEntitlementStatus(grant({ active: false }), now)).toBe("INACTIVE");
    expect(
      adminEntitlementStatus(grant({ expiresAt: new Date("2026-09-30T00:00:00.000Z") }), now),
    ).toBe("INVALID");
  });

  it("shows feature labels and limits from the entitlement policy", () => {
    expect(entitlementPlanFeatureLabels("PLAN_FREE")).toContain("Günde 3 alıştırma");
    expect(entitlementPlanFeatureLabels("PLAN_FREE")).toContain("Günde 20 soru");
    expect(entitlementPlanFeatureLabels("PLAN_PREMIUM")).toContain("Sınırsız alıştırma");
    expect(entitlementPlanFeatureLabels("PLAN_PREMIUM")).toContain("Sınırsız soru");
    expect(entitlementPlanFeatureLabels("PLAN_FREE")).toContain("Öğrenme yolu");
    expect(entitlementPlanFeatureLabels("PLAN_PREMIUM")).not.toContain("Reklamlar");
  });

  it("accepts only known context and membership-status filters", () => {
    expect(
      listUsersQuerySchema.parse({ tenantType: "INDIVIDUAL", membershipStatus: "ACTIVE" }),
    ).toMatchObject({ tenantType: "INDIVIDUAL", membershipStatus: "ACTIVE", page: 1 });
    expect(() => listUsersQuerySchema.parse({ tenantType: "PERSONAL" })).toThrow();
    expect(() => listUsersQuerySchema.parse({ membershipStatus: "UNKNOWN" })).toThrow();
    expect(listUsersQuerySchema.parse({ segment: "UNLINKED" }).segment).toBe("UNLINKED");
    expect(() => listUsersQuerySchema.parse({ segment: "EVERYONE" })).toThrow();
  });

  it("allows individual account creation without an institution and requires a valid organization context", () => {
    const common = {
      displayName: "Örnek kullanıcı",
      email: "user@example.test",
      password: "secure-password-123",
    };
    expect(createUserSchema.parse({ ...common, accountType: "INDIVIDUAL" })).toMatchObject({
      accountType: "INDIVIDUAL",
    });
    expect(() =>
      createUserSchema.parse({ ...common, accountType: "INDIVIDUAL", tenantId: "tenant-id" }),
    ).toThrow();
    expect(() => createUserSchema.parse({ ...common, accountType: "ORGANIZATION" })).toThrow();
    expect(
      createUserSchema.parse({
        ...common,
        accountType: "ORGANIZATION",
        tenantId: "tenant-id",
        membershipRole: "STUDENT",
      }).accountType,
    ).toBe("ORGANIZATION");
  });
});
