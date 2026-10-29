import { z } from "zod/v3";

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

export const completeExerciseSessionSchema = z
  .object({
    readingDurationMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict();

export type CreateExerciseSessionInput = z.infer<typeof createExerciseSessionSchema>;
