import { z } from "zod";

const entitlementPlanSchema = z.enum(["PLAN_FREE", "PLAN_PREMIUM"]);
const entitlementScopeSchema = z.enum(["PERSONAL", "ORGANIZATION"]);
const dateSchema = z.coerce.date().optional();

export const listEntitlementsQuerySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  tenantId: z.string().trim().min(1).optional(),
});

export const createEntitlementSchema = z
  .object({
    userId: z.string().trim().min(1).nullable().optional(),
    tenantId: z.string().trim().min(1),
    scope: entitlementScopeSchema,
    plan: entitlementPlanSchema,
    source: z.string().trim().min(1).max(80).default("ADMIN"),
    effectiveAt: dateSchema,
    expiresAt: dateSchema,
    active: z.boolean().default(true),
  })
  .refine(
    (input) =>
      input.effectiveAt === undefined ||
      input.expiresAt === undefined ||
      input.expiresAt > input.effectiveAt,
    { message: "Bitiş tarihi başlangıç tarihinden sonra olmalı", path: ["expiresAt"] },
  );

export const updateEntitlementSchema = z
  .object({
    plan: entitlementPlanSchema.optional(),
    source: z.string().trim().min(1).max(80).optional(),
    effectiveAt: dateSchema,
    expiresAt: z.coerce.date().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.effectiveAt === undefined ||
      input.expiresAt === undefined ||
      input.expiresAt === null ||
      input.expiresAt > input.effectiveAt,
    { message: "Bitiş tarihi başlangıç tarihinden sonra olmalı", path: ["expiresAt"] },
  );

export type ListEntitlementsQuery = z.infer<typeof listEntitlementsQuerySchema>;
export type CreateEntitlementInput = z.infer<typeof createEntitlementSchema>;
export type UpdateEntitlementInput = z.infer<typeof updateEntitlementSchema>;
