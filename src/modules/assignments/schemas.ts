import { z } from "zod";

/**
 * Ödev yönetimi Zod şemaları (SUPER_ADMIN).
 *
 * AssignmentStatus: DRAFT → SCHEDULED → ACTIVE → CLOSED.
 * Sınıf, öğretmen ve şablon doğrulaması service katmanında yapılır.
 */

const assignmentStatusSchema = z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "CLOSED"]);
const teacherAssignmentStatusSchema = z.enum(["SCHEDULED", "ACTIVE"]);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Ödev başlığı gerekli")
  .max(200, "Ödev başlığı en fazla 200 karakter olmalı");

/** Yeni ödev oluşturma gövdesi. */
export const createAssignmentSchema = z.object({
  classId: z.string().trim().min(1, "Sınıf gerekli"),
  templateId: z.string().trim().min(1, "Şablon gerekli"),
  learningStepId: z.string().trim().min(1).nullable().optional(),
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

/** Öğretmenin kendi yetki alanına ödev atama gövdesi. */
export const createTeacherAssignmentSchema = z.object({
  classId: z.string().trim().min(1, "Sınıf gerekli"),
  studentId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1, "Şablon gerekli"),
  learningStepId: z.string().trim().min(1).nullable().optional(),
  title: titleSchema,
  dueDate: z.coerce.date().nullable().optional(),
  status: teacherAssignmentStatusSchema.default("ACTIVE"),
});

const recommendationStatusSchema = z.enum(["PENDING", "ACCEPTED", "DISMISSED"]);
const recommendationTargetSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  classId: z.string().trim().min(1).optional(),
});

/** Öğrenci/öğretmen öneri listesi sorgusu. */
export const listAssignmentRecommendationsQuerySchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  classId: z.string().trim().min(1).optional(),
  status: recommendationStatusSchema.optional(),
});

/** Öğrenci veya sınıf için önerileri yeniden değerlendirir. */
export const refreshAssignmentRecommendationsSchema = z.object({
  studentId: z.string().trim().min(1, "Öğrenci gerekli"),
  classId: z.string().trim().min(1).optional(),
});

export const refreshTeacherAssignmentRecommendationsSchema = recommendationTargetSchema.refine(
  (value) => Boolean(value.studentId) !== Boolean(value.classId),
  { message: "Öğrenci veya sınıf hedeflerinden yalnızca biri seçilebilir" },
);

export const acceptAssignmentRecommendationSchema = z.object({
  classId: z.string().trim().min(1).optional(),
});

/** Öğretmenin aynı sınıftaki uygun önerileri topluca ataması. */
export const acceptTeacherRecommendationsBatchSchema = z.object({
  classId: z.string().trim().min(1, "Sınıf gerekli"),
  recommendationIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

/** Öğretmen otomasyon ayarının hedefi. */
export const assignmentAutomationSettingSchema = recommendationTargetSchema
  .extend({
    enabled: z.boolean(),
    maxActiveAssignments: z.coerce.number().int().min(1).max(3).optional(),
    cooldownHours: z.coerce.number().int().min(1).max(720).optional(),
  })
  .refine((value) => Boolean(value.studentId) !== Boolean(value.classId), {
    message: "Öğrenci veya sınıf hedeflerinden yalnızca biri seçilebilir",
  });

/** Öğretmen otomasyonunu tek bir öğrenci veya sınıf için çalıştırır. */
export const runAssignmentAutomationSchema = recommendationTargetSchema.refine(
  (value) => Boolean(value.studentId) !== Boolean(value.classId),
  { message: "Öğrenci veya sınıf hedeflerinden yalnızca biri seçilebilir" },
);

export type AssignmentRecommendationStatus = z.infer<typeof recommendationStatusSchema>;
export type ListAssignmentRecommendationsQuery = z.infer<
  typeof listAssignmentRecommendationsQuerySchema
>;
export type RefreshAssignmentRecommendationsInput = z.infer<
  typeof refreshAssignmentRecommendationsSchema
>;
export type RefreshTeacherAssignmentRecommendationsInput = z.infer<
  typeof refreshTeacherAssignmentRecommendationsSchema
>;
export type AcceptAssignmentRecommendationInput = z.infer<
  typeof acceptAssignmentRecommendationSchema
>;
export type AcceptTeacherRecommendationsBatchInput = z.infer<
  typeof acceptTeacherRecommendationsBatchSchema
>;
export type AssignmentAutomationSettingInput = z.infer<typeof assignmentAutomationSettingSchema>;
export type RunAssignmentAutomationInput = z.infer<typeof runAssignmentAutomationSchema>;

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;
export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;
export type TeacherAssignmentStatus = z.infer<typeof teacherAssignmentStatusSchema>;
