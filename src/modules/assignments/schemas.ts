import { z } from "zod";

/**
 * Ödev yönetimi Zod şemaları (SUPER_ADMIN).
 *
 * AssignmentStatus: DRAFT → SCHEDULED → ACTIVE → CLOSED.
 * Sınıf, öğretmen ve şablon doğrulaması service katmanında yapılır.
 */

const assignmentStatusSchema = z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "CLOSED"]);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Ödev başlığı gerekli")
  .max(200, "Ödev başlığı en fazla 200 karakter olmalı");

/** Yeni ödev oluşturma gövdesi. */
export const createAssignmentSchema = z.object({
  classId: z.string().trim().min(1, "Sınıf gerekli"),
  templateId: z.string().trim().min(1, "Şablon gerekli"),
  teacherId: z.string().trim().min(1, "Öğretmen gerekli"),
  title: titleSchema,
  dueDate: z.coerce.date().nullable().optional(),
});

/** Ödev güncelleme gövdesi (kısmi; class/template/teacher değiştirilemez). */
export const updateAssignmentSchema = z.object({
  title: titleSchema.optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

/** Ödev durumu değiştirme gövdesi. */
export const updateAssignmentStatusSchema = z.object({
  status: assignmentStatusSchema,
});

/** Ödev listeleme sorgu parametreleri. */
export const listAssignmentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  classId: z.string().trim().min(1).optional(),
  teacherId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  status: assignmentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;
