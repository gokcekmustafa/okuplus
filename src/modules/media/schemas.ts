import { z } from "zod";

const mediaTypeSchema = z.enum(["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"]);
const mediaRoleSchema = z.enum(["MAIN", "OPTION", "EXPLANATION", "HINT"]);

const urlSchema = z
  .string()
  .trim()
  .url("Geçerli bir URL olmalı")
  .max(2000, "URL en fazla 2000 karakter")
  .refine((value) => /^https?:\/\//iu.test(value), "Sadece HTTP(S) URL kullanılabilir");
const mimeTypeSchema = z.string().trim().min(1, "MIME tipi gerekli").max(100);
const hashSchema = z.string().trim().min(1, "Hash gerekli").max(200);
const altTextSchema = z.string().trim().max(500).nullable().optional();
const captionSchema = z.string().trim().max(500).nullable().optional();

export const createMediaSchema = z.object({
  tenantId: z.string().trim().min(1).nullable().optional(),
  type: mediaTypeSchema,
  url: urlSchema,
  mimeType: mimeTypeSchema,
  width: z.number().int().min(0).nullable().optional(),
  height: z.number().int().min(0).nullable().optional(),
  durationMs: z.number().int().min(0).nullable().optional(),
  altText: altTextSchema,
  caption: captionSchema,
  hash: hashSchema,
  sizeBytes: z
    .number()
    .int()
    .min(0, "Boyut en az 0 olmalı")
    .max(50_000_000, "Boyut en fazla 50 MB olabilir"),
});

export const listMediaQuerySchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  type: mediaTypeSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const attachMediaSchema = z.object({
  mediaId: z.string().trim().min(1, "Medya kimliği gerekli"),
  role: mediaRoleSchema.default("MAIN"),
  position: z.number().int().min(0).default(0),
});

export const updateMediaBindingSchema = z.object({
  role: mediaRoleSchema.optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;
export type AttachMediaInput = z.infer<typeof attachMediaSchema>;
export type UpdateMediaBindingInput = z.infer<typeof updateMediaBindingSchema>;
