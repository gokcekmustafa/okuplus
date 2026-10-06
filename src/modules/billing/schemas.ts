import { z } from "zod";

export const billingPeriodSchema = z.enum(["MONTHLY", "YEARLY"]);

export const createCheckoutSchema = z
  .object({
    billingPeriod: billingPeriodSchema,
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

export const cancelSubscriptionSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

export const updateOrganizationPlanSchema = z
  .object({
    plan: z.enum(["PLAN_FREE", "PLAN_PREMIUM"]),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((input) => !input.expiresAt || input.expiresAt > new Date(), {
    message: "Kurum planı bitiş tarihi gelecekte olmalı",
    path: ["expiresAt"],
  });

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type UpdateOrganizationPlanInput = z.infer<typeof updateOrganizationPlanSchema>;
