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

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
