import { z } from "zod";

/**
 * Ölçme & Değerlendirme Zod şemaları.
 *
 * AssessmentStatus: DRAFT → PUBLISHED → ARCHIVED.
 * Config JSON: { templateId, templateVersionId, questionCount? }
 */

const assessmentStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const assessmentTypeSchema = z.enum(["PLACEMENT", "DIAGNOSTIC", "BENCHMARK"]);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Değerlendirme başlığı gerekli")
  .max(200, "Başlık en fazla 200 karakter olmalı");

/** Yeni değerlendirme oluşturma gövdesi. */
export const createAssessmentSchema = z.object({
  title: titleSchema,
  type: assessmentTypeSchema.optional(),
  levelId: z.string().trim().min(1).nullable().optional(),
  config: z
    .object({
      templateId: z.string().trim().min(1, "Şablon gerekli"),
      templateVersionId: z.string().trim().min(1).optional(),
      questionCount: z.number().int().min(1).optional(),
    })
    .passthrough()
    .optional(),
});

/** Değerlendirme güncelleme gövdesi (kısmi; config değiştirilemez). */
export const updateAssessmentSchema = z.object({
  title: titleSchema.optional(),
  type: assessmentTypeSchema.optional(),
  levelId: z.string().trim().min(1).nullable().optional(),
});

/** Değerlendirme durumu değiştirme gövdesi. */
export const updateAssessmentStatusSchema = z.object({
  status: assessmentStatusSchema,
});

/** Değerlendirme listeleme sorgu parametreleri. */
export const listAssessmentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: assessmentTypeSchema.optional(),
  status: assessmentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;
export type UpdateAssessmentStatusInput = z.infer<typeof updateAssessmentStatusSchema>;
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;
export type AssessmentType = z.infer<typeof assessmentTypeSchema>;
