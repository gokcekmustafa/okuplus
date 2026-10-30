import { z } from "zod/v3";

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

/** Public Superadmin action: source is assigned by the server, never by the browser. */
export const createManagedEntitlementSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    tenantId: z.string().trim().min(1).optional(),
    scope: entitlementScopeSchema,
    plan: entitlementPlanSchema,
    effectiveAt: dateSchema,
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.scope === "PERSONAL" && (!input.userId || input.tenantId)) {
      context.addIssue({
        code: "custom",
        message: "Kişisel paket için kullanıcı seçilmeli; kurum alanı gönderilmemeli",
        path: ["userId"],
      });
    }
    if (input.scope === "ORGANIZATION" && (!input.tenantId || input.userId)) {
      context.addIssue({
        code: "custom",
        message: "Kurum paketi için yalnızca kurum seçilmelidir",
        path: ["tenantId"],
      });
    }
    if (input.effectiveAt && input.expiresAt && input.expiresAt <= input.effectiveAt) {
      context.addIssue({
        code: "custom",
        message: "Bitiş tarihi başlangıç tarihinden sonra olmalı",
        path: ["expiresAt"],
      });
    }
  });

export const updateEntitlementSchema = z
  .object({
    expiresAt: z.coerce.date().nullable().optional(),
    active: z.literal(false).optional(),
  })
  .strict()
  .refine((input) => !(input.expiresAt !== undefined && input.active === false), {
    message: "Süre uzatma ve erişimi sonlandırma ayrı işlemler olmalıdır",
  });

export const changeManagedEntitlementPlanSchema = z
  .object({
    plan: entitlementPlanSchema,
    effectiveAt: z.coerce.date(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .strict();

export type ListEntitlementsQuery = z.infer<typeof listEntitlementsQuerySchema>;
export type CreateEntitlementInput = z.infer<typeof createEntitlementSchema>;
export type UpdateEntitlementInput = z.infer<typeof updateEntitlementSchema>;
export type CreateManagedEntitlementInput = z.infer<typeof createManagedEntitlementSchema>;
export type ChangeManagedEntitlementPlanInput = z.infer<typeof changeManagedEntitlementPlanSchema>;
