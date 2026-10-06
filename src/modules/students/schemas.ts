import { z } from "zod";

/**
 * Öğrenci ve kurum akademik yıl yönetimi Zod şemaları.
 *
 * Öğrenci = User (STUDENT rolünde Membership) + StudentProfile. Yeni sınıf
 * oluşturma (Class CRUD) bu modülde YOKTUR; öğrenci kaydında mevcut Class ve
 * AcademicYear kayıtlarının seçilebilmesi sağlanır. AcademicYear yönetimi
 * kurum yönetimi endpoint'lerinde, mevcut model üzerinden yapılır.
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

const levelIdSchema = z.string().trim().min(1, "Seviye kimliği gerekli").nullable().optional();

/** Öğrenci listeleme sorgu parametreleri. */
export const listStudentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  tenantId: z.string().trim().min(1).optional(),
  status: userStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Yeni öğrenci oluşturma gövdesi. */
export const createStudentSchema = z.object({
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
  currentLevelId: levelIdSchema,
  targetLevelId: levelIdSchema,
  academicYearId: z.string().trim().min(1).optional(),
  classId: z.string().trim().min(1).optional(),
});

/** Öğrenci güncelleme gövdesi (kısmi; kişisel + hesap + profil). */
export const updateStudentSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  birthYear: birthYearSchema,
  status: userStatusSchema.optional(),
  currentLevelId: levelIdSchema,
  targetLevelId: levelIdSchema,
  startedAt: z.coerce.date().optional(),
});

const enrollmentStatusSchema = z.enum(["ACTIVE", "LEFT", "COMPLETED"]);

/** Yeni sınıf kaydı (enrollment) gövdesi. */
export const createEnrollmentSchema = z.object({
  classId: z.string().trim().min(1, "Sınıf gerekli"),
  status: enrollmentStatusSchema.default("ACTIVE"),
});

/** Sınıf kaydı durum güncelleme gövdesi. */
export const updateEnrollmentSchema = z.object({
  status: enrollmentStatusSchema,
});

/** Tenant akademik yıl listesi sorgusu. */
export const listAcademicYearsQuerySchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
});

const academicYearStatusSchema = z.enum(["UPCOMING", "ACTIVE", "CLOSED"]);
const academicYearNameSchema = z
  .string()
  .trim()
  .min(1, "Akademik yıl adı gerekli")
  .max(120, "Akademik yıl adı en fazla 120 karakter olmalı");
const academicYearDateSchema = z.coerce.date();

function validateAcademicYearDates(
  value: { startDate?: Date; endDate?: Date },
  ctx: z.RefinementCtx,
) {
  if (value.startDate && value.endDate && value.endDate <= value.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "Bitiş tarihi başlangıç tarihinden sonra olmalı",
    });
  }
}

/** Platform lookup'u için tenant zorunlu, kurum yönetiminde context kullanılır. */
export const listAdminAcademicYearsQuerySchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli").optional(),
});

/** Kurum yöneticisinin yeni akademik yıl oluşturma gövdesi. */
export const createAcademicYearSchema = z
  .object({
    name: academicYearNameSchema,
    startDate: academicYearDateSchema,
    endDate: academicYearDateSchema,
    status: academicYearStatusSchema.optional(),
  })
  .superRefine(validateAcademicYearDates);

/** Akademik yıl güncelleme gövdesi (kısmi). */
export const updateAcademicYearSchema = z
  .object({
    name: academicYearNameSchema.optional(),
    startDate: academicYearDateSchema.optional(),
    endDate: academicYearDateSchema.optional(),
    status: academicYearStatusSchema.optional(),
  })
  .superRefine(validateAcademicYearDates);

/** Tenant sınıf listesi sorgusu. */
export const listClassesQuerySchema = z.object({
  tenantId: z.string().trim().min(1, "Kurum gerekli"),
  academicYearId: z.string().trim().min(1).optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
export type ListAcademicYearsQuery = z.infer<typeof listAcademicYearsQuerySchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
