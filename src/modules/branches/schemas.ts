import { z } from "zod";

/**
 * Şube yönetimi Zod şemaları (yalnızca SUPER_ADMIN).
 *
 * Şube: Tenant'a bağlı Branch kaydı. Şube oluşturma yalnızca ORGANIZATION
 * tipteki ACTIVE tenant'larda mümkündür (INDIVIDUAL tenant'ta şube
 * kavramı yoktur). Şube kodu `@@unique([tenantId, code])` ile kurum içinde,
 * şube adı `uq_branch_active_name` partial unique index'i ile kurum içinde
 * silinmemiş kayıtlar için tektir (P2002 → 409).
 *
 * Müdür (managerUserId) opsiyoneldir; atandığında ilgili tenant'ta ACTIVE
 * Membership + BRANCH_MANAGER rolü olan silinmemiş bir User olmalıdır.
 */

const branchStatusSchema = z.enum(["ACTIVE", "INACTIVE", "CLOSED"]);

const nameSchema = z
  .string()
  .trim()
  .min(1, "Şube adı gerekli")
  .max(120, "Şube adı en fazla 120 karakter olmalı");

const codeSchema = z
  .string()
  .trim()
  .min(1, "Şube kodu gerekli")
  .max(50, "Şube kodu en fazla 50 karakter olmalı");

const addressSchema = z
  .string()
  .trim()
  .max(300, "Adres en fazla 300 karakter olmalı")
  .nullable()
  .optional();

const phoneSchema = z
  .string()
  .trim()
  .max(30, "Telefon en fazla 30 karakter olmalı")
  .nullable()
  .optional();

const managerUserIdSchema = z.string().trim().min(1, "Müdür kimliği gerekli").nullable();

/** Yeni şube oluşturma gövdesi. */
export const createBranchSchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
  name: nameSchema,
  code: codeSchema,
  address: addressSchema,
  phone: phoneSchema,
  managerUserId: managerUserIdSchema.optional(),
});

/** Şube güncelleme gövdesi (kısmi; tenant değiştirilemez). */
export const updateBranchSchema = z.object({
  name: nameSchema.optional(),
  code: codeSchema.optional(),
  address: addressSchema,
  phone: phoneSchema,
});

/** Şube durumu değiştirme gövdesi (ACTIVE/INACTIVE/CLOSED). */
export const updateBranchStatusSchema = z.object({
  status: branchStatusSchema,
});

/** Şube müdürü atama/kaldırma gövdesi. */
export const updateBranchManagerSchema = z.object({
  managerUserId: managerUserIdSchema,
});

/** Şube listeleme sorgu parametreleri. */
export const listBranchesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  tenantId: z.string().trim().min(1).optional(),
  status: branchStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Müdür seçim listesi sorgusu. */
export const listBranchManagersQuerySchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type UpdateBranchStatusInput = z.infer<typeof updateBranchStatusSchema>;
export type UpdateBranchManagerInput = z.infer<typeof updateBranchManagerSchema>;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;
export type BranchStatus = z.infer<typeof branchStatusSchema>;
