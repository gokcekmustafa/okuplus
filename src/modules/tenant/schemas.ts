import { z } from "zod";

/**
 * Tenant / Kurum yönetimi Zod şemaları.
 * Tenant tablosunda RLS yoktur; erişim app katmanında platform rolü guard'ı
 * (requirePlatformRole) ile korunur.
 */

const tenantTypeSchema = z.enum(["INDIVIDUAL", "ORGANIZATION"]);
const tenantStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]);

const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug en az 2 karakter olmalı")
  .max(64, "Slug en fazla 64 karakter olmalı")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug küçük harf, rakam ve tire içerebilir");

const logoUrlSchema = z
  .string()
  .trim()
  .max(500, "Logo URL en fazla 500 karakter olmalı")
  .url("Geçerli bir URL olmalı")
  .nullable()
  .optional();

const settingsSchema = z.record(z.string(), z.unknown()).nullable().optional();

/** Yeni kurum oluşturma gövdesi. */
export const createTenantSchema = z.object({
  type: tenantTypeSchema,
  name: z.string().trim().min(1, "Kurum adı gerekli").max(120, "Kurum adı en fazla 120 karakter"),
  slug: slugSchema.nullable().optional(),
  logoUrl: logoUrlSchema,
  settings: settingsSchema,
});

/** Kurum güncelleme gövdesi (kısmi). */
export const updateTenantSchema = createTenantSchema.partial();

/** Kurum durum değişikliği gövdesi. */
export const updateTenantStatusSchema = z.object({
  status: tenantStatusSchema,
});

/** Kurum listeleme sorgu parametreleri. */
export const listTenantsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: tenantStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
export type TenantType = z.infer<typeof tenantTypeSchema>;
export type TenantStatus = z.infer<typeof tenantStatusSchema>;
