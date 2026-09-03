import { z } from "zod";

/**
 * Sınıf yönetimi Zod şemaları (yalnızca SUPER_ADMIN).
 *
 * Sınıf: Branch + AcademicYear'a bağlı Class kaydı. Sınıf oluşturma yalnızca
 * ORGANIZATION tipteki ACTIVE tenant'larda mümkündür (INDIVIDUAL tenant'ta
 * sınıf kavramı yoktur). Sınıf adı aynı şube + akademik yıl içinde tektir
 * (`@@unique([branchId, academicYearId, name])` — soft-delete dahil tüm
 * kayıtlar için, P2002 → 409). ClassStatus yalnızca ACTIVE/ARCHIVED'tir.
 *
 * Öğretmen ataması (class-scoped) için şube üyeliği kuralı: atanacak öğretmen
 * silinmemiş + ACTIVE kullanıcı, ilgili kurumda ACTIVE TEACHER üyeliğine ve
 * sınıfın şubesinde ACTIVE TeacherBranchMembership'e sahip olmalıdır.
 */

const classStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

const membershipStatusSchema = z.enum(["ACTIVE", "INACTIVE", "REMOVED"]);

const nameSchema = z
  .string()
  .trim()
  .min(1, "Sınıf adı gerekli")
  .max(120, "Sınıf adı en fazla 120 karakter olmalı");

const gradeLevelSchema = z
  .number()
  .int("Sınıf düzeyi tam sayı olmalı")
  .min(1, "Sınıf düzeyi en az 1 olmalı")
  .max(12, "Sınıf düzeyi en fazla 12 olmalı");

const subjectSchema = z
  .string()
  .trim()
  .max(120, "Ders en fazla 120 karakter olmalı")
  .nullable()
  .optional();

/** Yeni sınıf oluşturma gövdesi. */
export const createClassSchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
  branchId: z.string().trim().min(1, "Şube gerekli"),
  academicYearId: z.string().trim().min(1, "Akademik yıl gerekli"),
  name: nameSchema,
  gradeLevel: gradeLevelSchema,
  status: classStatusSchema.optional(),
});

/** Sınıf güncelleme gövdesi (kısmi; tenant/şube/akademik yıl değiştirilemez). */
export const updateClassSchema = z.object({
  name: nameSchema.optional(),
  gradeLevel: gradeLevelSchema.optional(),
});

/** Sınıf durumu değiştirme gövdesi (ACTIVE/ARCHIVED). */
export const updateClassStatusSchema = z.object({
  status: classStatusSchema,
});

/** Sınıf listeleme sorgu parametreleri. */
export const listClassesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  tenantId: z.string().trim().min(1).optional(),
  branchId: z.string().trim().min(1).optional(),
  academicYearId: z.string().trim().min(1).optional(),
  status: classStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Sınıfa öğretmen atama gövdesi (class-scoped; şube üyeliği doğrulanır). */
export const createTeacherAssignmentSchema = z.object({
  teacherId: z.string().trim().min(1, "Öğretmen gerekli"),
  subject: subjectSchema,
  status: membershipStatusSchema.default("ACTIVE"),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type UpdateClassStatusInput = z.infer<typeof updateClassStatusSchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;
export type ClassStatus = z.infer<typeof classStatusSchema>;
