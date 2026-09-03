import { z } from "zod";

/**
 * Öğretmen yönetimi Zod şemaları (yalnızca SUPER_ADMIN).
 *
 * Öğretmen = User (TEACHER rolünde Membership) + isteğe bağlı
 * TeacherBranchMembership (şube üyelikleri) + TeacherClassAssignment
 * (sınıf atamaları). Yeni şube/sınıf oluşturma (Branch/Class CRUD) bu
 * modülde YOKTUR; yalnızca mevcut Branch/Class/AcademicYear kayıtlarının
 * seçilmesi sağlanır (read-only lookup uçları). Schema/RLS değişikliği
 * yapılmaz.
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

const membershipStatusSchema = z.enum(["ACTIVE", "INACTIVE", "REMOVED"]);

/** Öğretmen listeleme sorgu parametreleri. */
export const listTeachersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  tenantId: z.string().trim().min(1).optional(),
  status: userStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Yeni öğretmen oluşturma gövdesi (User + TEACHER Membership tek tx). */
export const createTeacherSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  birthYear: birthYearSchema,
  password: z
    .string()
    .min(8, "Parola en az 8 karakter olmalı")
    .max(128, "Parola en fazla 128 karakter"),
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
  status: userStatusSchema.optional(),
});

/** Öğretmen güncelleme gövdesi (kısmi; kişisel + hesap). */
export const updateTeacherSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  birthYear: birthYearSchema,
  status: userStatusSchema.optional(),
});

/** Şube üyeliği ekleme gövdesi. */
export const createTeacherBranchSchema = z.object({
  branchId: z.string().trim().min(1, "Şube gerekli"),
  status: membershipStatusSchema.default("ACTIVE"),
});

/** Şube üyeliği durum güncelleme gövdesi. */
export const updateTeacherBranchSchema = z.object({
  status: membershipStatusSchema,
});

/** Sınıf ataması ekleme gövdesi. */
export const createTeacherClassSchema = z.object({
  classId: z.string().trim().min(1, "Sınıf gerekli"),
  subject: z.string().trim().max(120, "Ders en fazla 120 karakter olmalı").nullable().optional(),
  status: membershipStatusSchema.default("ACTIVE"),
});

/** Sınıf ataması durum güncelleme gövdesi. */
export const updateTeacherClassSchema = z.object({
  status: membershipStatusSchema,
});

/** Şube listesi sorgusu. */
export const listBranchesQuerySchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
});

/** Sınıf listesi sorgusu. */
export const listClassesQuerySchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
  academicYearId: z.string().trim().min(1).optional(),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
export type ListTeachersQuery = z.infer<typeof listTeachersQuerySchema>;
export type CreateTeacherBranchInput = z.infer<typeof createTeacherBranchSchema>;
export type UpdateTeacherBranchInput = z.infer<typeof updateTeacherBranchSchema>;
export type CreateTeacherClassInput = z.infer<typeof createTeacherClassSchema>;
export type UpdateTeacherClassInput = z.infer<typeof updateTeacherClassSchema>;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
