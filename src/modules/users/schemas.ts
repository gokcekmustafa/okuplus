import { z } from "zod";

/**
 * User + Membership yönetimi Zod şemaları (yalnızca SUPER_ADMIN).
 *
 * Bireysel kullanıcı kuralı (INDIVIDUAL tenant): bir kullanıcı yalnızca bir
 * INDIVIDUAL tenant'a üye olabilir; ORGANIZATION tenant'lara birden fazla
 * üye olabilir. Bu kural servis katmanında kontrol edilir (DB'de karşılığı
 * olan partial unique index değiştirilmemiştir; `uq_membership_active`
 * tenant+user+role için ACTIVE/PENDING duplicate'ini DB seviyesinde engeller).
 */

const userStatusSchema = z.enum(["ACTIVE", "INVITED", "SUSPENDED", "CLOSED"]);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Geçerli bir e-posta adresi olmalı")
  .max(254, "E-posta en fazla 254 karakter olmalı");

const phoneSchema = z
  .string()
  .trim()
  .max(30, "Telefon en fazla 30 karakter olmalı")
  .nullable()
  .optional();

const birthYearSchema = z
  .number()
  .int("Doğum yılı tam sayı olmalı")
  .min(1900, "Doğum yılı en az 1900 olmalı")
  .max(new Date().getFullYear(), "Doğum yılı gelecekte olamaz")
  .nullable()
  .optional();

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Ad gerekli")
  .max(120, "Ad en fazla 120 karakter olmalı");

/** Yeni kullanıcı oluşturma gövdesi. */
export const createUserSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  birthYear: birthYearSchema,
  status: userStatusSchema.optional(),
  password: z
    .string()
    .min(8, "Parola en az 8 karakter olmalı")
    .max(128, "Parola en fazla 128 karakter"),
});

/** Kullanıcı güncelleme gövdesi (kısmi). */
export const updateUserSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  birthYear: birthYearSchema,
  status: userStatusSchema.optional(),
});

/** Kullanıcı listeleme sorgu parametreleri. */
export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: userStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const membershipRoleSchema = z.enum([
  "OWNER",
  "ORG_ADMIN",
  "BRANCH_MANAGER",
  "TEACHER",
  "STUDENT",
  "PARENT",
]);

const membershipStatusSchema = z.enum(["PENDING", "ACTIVE", "INACTIVE", "REMOVED"]);

/** Tenant üyelerini listeleme sorgu parametreleri. */
export const listMembershipsQuerySchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  role: membershipRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Yeni üyelik oluşturma gövdesi. */
export const createMembershipSchema = z.object({
  userId: z.string().trim().min(1, "Kullanıcı gerekli"),
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
  role: membershipRoleSchema,
  status: membershipStatusSchema.default("PENDING"),
});

/** Üyelik güncelleme gövdesi. */
export const updateMembershipSchema = z.object({
  role: membershipRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type ListMembershipsQuery = z.infer<typeof listMembershipsQuerySchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
