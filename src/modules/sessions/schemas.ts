import { z } from "zod";

/**
 * ExerciseSession Zod şemaları
 * Mevcut Prisma modeline uygun, yeni enum oluşturulmaz
 */

export const createExerciseSessionSchema = z.object({
  studentId: z.string().trim().min(1, "Öğrenci kimliği gerekli"),
  templateVersionId: z.string().trim().min(1, "Şablon sürümü kimliği gerekli"),
  clientSessionId: z.string().trim().min(1).max(100).optional(),
  assignmentId: z.string().trim().min(1).nullable().optional(),
  context: z.enum(["INDIVIDUAL", "ASSIGNMENT", "ASSESSMENT"]).optional(),
  sessionType: z.enum(["PRACTICE", "ASSESSMENT"]).optional(),
});

export type CreateExerciseSessionInput = z.infer<typeof createExerciseSessionSchema>;
