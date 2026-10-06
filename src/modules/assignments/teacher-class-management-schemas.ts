import { z } from "zod";

const classNameSchema = z
  .string()
  .trim()
  .min(1, "Sınıf adı gerekli")
  .max(120, "Sınıf adı en fazla 120 karakter olmalı");

const gradeLevelSchema = z
  .number()
  .int("Sınıf düzeyi tam sayı olmalı")
  .min(1, "Sınıf düzeyi en az 1 olmalı")
  .max(12, "Sınıf düzeyi en fazla 12 olmalı");

export const createTeacherClassSchema = z.object({
  branchId: z.string().trim().min(1, "Şube gerekli"),
  academicYearId: z.string().trim().min(1, "Akademik yıl gerekli"),
  name: classNameSchema,
  gradeLevel: gradeLevelSchema,
});

export const updateTeacherClassSchema = z
  .object({
    name: classNameSchema.optional(),
    gradeLevel: gradeLevelSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.gradeLevel !== undefined, {
    message: "Güncellenecek sınıf alanı gerekli",
  });

export const updateTeacherClassStatusSchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

export const addTeacherClassStudentSchema = z.object({
  studentId: z.string().trim().min(1, "Öğrenci gerekli"),
});

export type CreateTeacherClassInput = z.infer<typeof createTeacherClassSchema>;
export type UpdateTeacherClassInput = z.infer<typeof updateTeacherClassSchema>;
export type UpdateTeacherClassStatusInput = z.infer<typeof updateTeacherClassStatusSchema>;
export type AddTeacherClassStudentInput = z.infer<typeof addTeacherClassStudentSchema>;
