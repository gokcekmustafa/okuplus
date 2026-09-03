import { z } from "zod";

/**
 * İçerik Yönetimi Zod şemaları (SUPER_ADMIN + CONTENT_EDITOR).
 *
 * İÇERİK:
 *  - tenantId NULL = GLOBAL katalog (tüm kurumlar okur, yönetim platform yetkisi).
 *  - tenantId dolu = o kuruma özel katalog.
 *  - Content.type ve Content.tenantId oluşturma sonrası değiştirilemez
 *    (PATCH yalnızca title/difficulty).
 *
 * SÜRÜM YAŞAM DÖNGÜSÜ: DRAFT → REVIEW → PUBLISHED.
 *  - PUBLISHED sürüm immutable'dır; değişiklik yeni sürüm üretir.
 *  - Publish: ContentVersion.status=PUBLISHED + publishedAt, ardından
 *    Content.currentVersionId ve Content.status=PUBLISHED güncellenir.
 *  - wordCount servis tarafında body'den hesaplanır; readabilityScore
 *    şimdilik boş/opsiyonel bırakılır.
 *
 * BECERİ / SEVİYE (katalog):
 *  - Skill ve Level salt global katalogdur; yazma platform rolüyle yapılır.
 *  - Beceri içerikte kullanılıyorsa silinemez (Restrict → 409).
 */

const contentTypeSchema = z.enum(["PASSAGE", "STORY", "POEM", "ARTICLE", "DIALOGUE"]);

const contentStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

const skillCategorySchema = z.enum([
  "MAIN_IDEA",
  "DETAIL",
  "INFERENCE",
  "VOCABULARY",
  "FACTUAL",
  "COMPREHENSION",
]);

const titleSchema = z
  .string()
  .trim()
  .min(1, "İçerik başlığı gerekli")
  .max(200, "İçerik başlığı en fazla 200 karakter olmalı");

const difficultySchema = z
  .number()
  .min(0, "Zorluk en az 0 olmalı")
  .max(1, "Zorluk en fazla 1 olmalı");

const bodySchema = z
  .string()
  .trim()
  .min(1, "Metin gerekli")
  .max(100000, "Metin en fazla 100.000 karakter olmalı");

const licenseSchema = z
  .string()
  .trim()
  .max(120, "Lisans en fazla 120 karakter olmalı")
  .nullable()
  .optional();

const changelogSchema = z
  .string()
  .trim()
  .max(500, "Değişiklik notu en fazla 500 karakter olmalı")
  .nullable()
  .optional();

const codeSchema = z
  .string()
  .trim()
  .min(1, "Kod gerekli")
  .max(50, "Kod en fazla 50 karakter olmalı");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Ad gerekli")
  .max(120, "Ad en fazla 120 karakter olmalı");

const displayOrderSchema = z.number().int("Sıra tam sayı olmalı").min(0, "Sıra en az 0 olmalı");

/** Yeni içerik oluşturma gövdesi. tenantId verilmezse/null ise GLOBAL katalog. */
export const createContentSchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli").nullable().optional(),
  type: contentTypeSchema,
  title: titleSchema,
  difficulty: difficultySchema,
  status: contentStatusSchema.optional(),
});

/** İçerik güncelleme gövdesi (kısmi; type/tenantId değiştirilemez). */
export const updateContentSchema = z.object({
  title: titleSchema.optional(),
  difficulty: difficultySchema.optional(),
});

/** İçerik durumu değiştirme gövdesi. */
export const updateContentStatusSchema = z.object({
  status: contentStatusSchema,
});

/** İçerik listeleme sorgu parametreleri. */
export const listContentsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  scope: z.enum(["GLOBAL", "TENANT"]).optional(),
  tenantId: z.string().trim().min(1).optional(),
  type: contentTypeSchema.optional(),
  status: contentStatusSchema.optional(),
  skillId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Yeni içerik sürümü oluşturma gövdesi. */
export const createContentVersionSchema = z.object({
  title: titleSchema.optional(),
  body: bodySchema,
  license: licenseSchema,
  changelog: changelogSchema,
});

/** İçerik sürümü güncelleme gövdesi (yalnızca DRAFT/REVIEW; PUBLISHED immutable). */
export const updateContentVersionSchema = z.object({
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  license: licenseSchema,
  changelog: changelogSchema,
});

/** İçeriğe beceri bağlama gövdesi (tam değiştirme). */
export const updateContentSkillsSchema = z.object({
  skillIds: z
    .array(z.string().trim().min(1, "Beceri kimliği gerekli"))
    .max(20, "En fazla 20 beceri bağlanabilir"),
});

/** Beceri listeleme sorgu parametreleri. */
export const listSkillsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: skillCategorySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** Yeni beceri oluşturma gövdesi. */
export const createSkillSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  category: skillCategorySchema,
  description: z
    .string()
    .trim()
    .max(500, "Açıklama en fazla 500 karakter olmalı")
    .nullable()
    .optional(),
  displayOrder: displayOrderSchema.default(0),
});

/** Beceri güncelleme gövdesi (kısmi). */
export const updateSkillSchema = z.object({
  code: codeSchema.optional(),
  name: nameSchema.optional(),
  category: skillCategorySchema.optional(),
  description: z
    .string()
    .trim()
    .max(500, "Açıklama en fazla 500 karakter olmalı")
    .nullable()
    .optional(),
  displayOrder: displayOrderSchema.optional(),
});

/** Seviye listeleme sorgu parametreleri. */
export const listLevelsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** Yeni seviye oluşturma gövdesi. */
export const createLevelSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    minScore: z.number().min(0, "Minimum puan en az 0 olmalı"),
    maxScore: z.number().min(0, "Maksimum puan en az 0 olmalı"),
    gradeBand: z
      .string()
      .trim()
      .max(120, "Sınıf aralığı en fazla 120 karakter olmalı")
      .nullable()
      .optional(),
    difficultyMin: z.number().min(0, "Minimum zorluk en az 0 olmalı"),
    difficultyMax: z.number().min(0, "Maksimum zorluk en az 0 olmalı"),
    displayOrder: displayOrderSchema.default(0),
  })
  .refine((d) => d.minScore <= d.maxScore, {
    message: "Minimum puan maksimum puanı aşamaz",
    path: ["minScore"],
  })
  .refine((d) => d.difficultyMin <= d.difficultyMax, {
    message: "Minimum zorluk maksimum zorluğu aşamaz",
    path: ["difficultyMin"],
  });

/** Seviye güncelleme gövdesi (kısmi). */
export const updateLevelSchema = z
  .object({
    code: codeSchema.optional(),
    name: nameSchema.optional(),
    minScore: z.number().min(0, "Minimum puan en az 0 olmalı").optional(),
    maxScore: z.number().min(0, "Maksimum puan en az 0 olmalı").optional(),
    gradeBand: z
      .string()
      .trim()
      .max(120, "Sınıf aralığı en fazla 120 karakter olmalı")
      .nullable()
      .optional(),
    difficultyMin: z.number().min(0, "Minimum zorluk en az 0 olmalı").optional(),
    difficultyMax: z.number().min(0, "Maksimum zorluk en az 0 olmalı").optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .refine((d) => d.minScore === undefined || d.maxScore === undefined || d.minScore <= d.maxScore, {
    message: "Minimum puan maksimum puanı aşamaz",
    path: ["minScore"],
  })
  .refine(
    (d) =>
      d.difficultyMin === undefined ||
      d.difficultyMax === undefined ||
      d.difficultyMin <= d.difficultyMax,
    { message: "Minimum zorluk maksimum zorluğu aşamaz", path: ["difficultyMin"] },
  );

export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type UpdateContentStatusInput = z.infer<typeof updateContentStatusSchema>;
export type ListContentsQuery = z.infer<typeof listContentsQuerySchema>;
export type CreateContentVersionInput = z.infer<typeof createContentVersionSchema>;
export type UpdateContentVersionInput = z.infer<typeof updateContentVersionSchema>;
export type UpdateContentSkillsInput = z.infer<typeof updateContentSkillsSchema>;
export type ListSkillsQuery = z.infer<typeof listSkillsQuerySchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type ListLevelsQuery = z.infer<typeof listLevelsQuerySchema>;
export type CreateLevelInput = z.infer<typeof createLevelSchema>;
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type SkillCategory = z.infer<typeof skillCategorySchema>;
