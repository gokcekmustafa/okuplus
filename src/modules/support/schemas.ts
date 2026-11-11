import { z } from "zod/v3";

export const supportCategorySchema = z.enum([
  "ACCOUNT",
  "TECHNICAL",
  "LEARNING_PATH",
  "PAYMENT",
  "OTHER",
]);

export const supportStatusSchema = z.enum([
  "NEW",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
]);

export const createSupportTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(160),
    category: supportCategorySchema,
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

export const supportMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

export const supportAdminActionSchema = z
  .object({
    status: supportStatusSchema.optional(),
    message: z.string().trim().min(1).max(5000).optional(),
    internalNote: z.string().trim().min(1).max(5000).optional(),
  })
  .strict()
  .refine((value) => value.status || value.message || value.internalNote, "İşlem gerekli");

export const supportListQuerySchema = z
  .object({
    status: z.union([supportStatusSchema, z.literal("ALL")]).default("ALL"),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const supportIdParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict();

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
export type SupportAdminActionInput = z.infer<typeof supportAdminActionSchema>;
