import { z } from "zod";

const dateSchema = z.coerce.date();

export const analyticsRangeSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const analyticsListQuerySchema = analyticsRangeSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeSchema>;
export type AnalyticsListQuery = z.infer<typeof analyticsListQuerySchema>;
