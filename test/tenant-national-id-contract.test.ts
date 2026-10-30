import { describe, expect, it } from "vitest";
import { createTenantSchema, updateTenantSchema } from "../src/modules/tenant/schemas.js";

describe("initial tenant administrator TCKN contract", () => {
  const organization = {
    type: "ORGANIZATION" as const,
    name: "Örnek kurum",
    admin: {
      displayName: "Kurum yöneticisi",
      email: "manager@example.com",
      password: "strong-password",
    },
  };

  it("allows provisioning the initial administrator without TCKN", () => {
    expect(createTenantSchema.parse(organization)).toMatchObject(organization);
  });

  it("strips a legacy TCKN key as an unknown field rather than treating it as tenant data", () => {
    const parsed = createTenantSchema.parse({
      ...organization,
      admin: { ...organization.admin, nationalId: "not-collected" },
    });

    expect(parsed.admin).not.toHaveProperty("nationalId");
    expect(parsed.admin).toMatchObject(organization.admin);
  });

  it("limits institution creation to ORGANIZATION", () => {
    expect(createTenantSchema.safeParse({ type: "INDIVIDUAL", name: "Kişisel" }).success).toBe(
      false,
    );
  });

  it("rejects tenant-type conversion through the organization update contract", () => {
    expect(updateTenantSchema.safeParse({ type: "INDIVIDUAL" }).success).toBe(false);
    expect(updateTenantSchema.safeParse({ type: "ORGANIZATION" }).success).toBe(false);
  });
});
