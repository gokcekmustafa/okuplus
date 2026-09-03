/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from "zod";

const templateTypeSchema = z.enum(["COMPREHENSION", "FLUENCY", "INFERENCE", "VOCABULARY", "MIXED"]);
const templateStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const versionStatusSchema = z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Başlık gerekli")
  .max(200, "Başlık en fazla 200 karakter olmalı");
const configSchema = z.any().nullable().optional();

export const createTemplateSchema = z.object({
  tenantId: z.string().trim().min(1).nullable().optional(),
  title: titleSchema,
  type: templateTypeSchema,
  skillId: z.string().trim().min(1).nullable().optional(),
  config: configSchema,
  status: templateStatusSchema.optional(),
});

export const updateTemplateSchema = z.object({
  title: titleSchema.optional(),
  type: templateTypeSchema.optional(),
  skillId: z.string().trim().min(1).nullable().optional(),
  config: configSchema,
});

export const updateTemplateStatusSchema = z.object({
  status: templateStatusSchema,
});

export const listTemplatesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  type: templateTypeSchema.optional(),
  status: templateStatusSchema.optional(),
  skillId: z.string().trim().min(1).optional(),
  tenantId: z.string().trim().min(1).optional(),
  scope: z.enum(["GLOBAL", "TENANT"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createTemplateVersionSchema = z.object({}).passthrough();

export const updateTemplateVersionSchema = z.object({}).passthrough();

export const updateTemplateVersionContentsSchema = z.object({
  contents: z
    .array(
      z.object({
        contentVersionId: z.string().trim().min(1, "İçerik sürümü kimliği gerekli"),
        position: z.number().int().min(0, "Pozisyon en az 0 olmalı"),
      }),
    )
    .max(100, "En fazla 100 içerik bağlanabilir"),
});

export const updateTemplateVersionQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionVersionId: z.string().trim().min(1, "Soru sürümü kimliği gerekli"),
        position: z.number().int().min(0, "Pozisyon en az 0 olmalı"),
      }),
    )
    .max(200, "En fazla 200 soru bağlanabilir"),
});

export type TemplateType = z.infer<typeof templateTypeSchema>;
export type TemplateStatus = z.infer<typeof templateStatusSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
export type CreateTemplateVersionInput = z.infer<typeof createTemplateVersionSchema>;
export type UpdateTemplateVersionInput = z.infer<typeof updateTemplateVersionSchema>;
export type UpdateTemplateVersionContentsInput = z.infer<
  typeof updateTemplateVersionContentsSchema
>;
export type UpdateTemplateVersionQuestionsInput = z.infer<
  typeof updateTemplateVersionQuestionsSchema
>;
