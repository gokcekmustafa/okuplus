import { z } from "zod";

export const LESSON_METADATA_TYPE = "LEARNING_LESSON" as const;

export const lessonMetadataSchema = z
  .object({
    lessonType: z.literal(LESSON_METADATA_TYPE),
    contractVersion: z.literal(1),
    skillCode: z.string().trim().min(1).max(80),
    objective: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(5000),
    workedExample: z.string().trim().min(1).max(5000),
    guidedPractice: z.string().trim().min(1).max(5000),
    exerciseTemplateVersionId: z.string().trim().min(1).max(120),
    completionLabel: z.string().trim().min(1).max(160).default("Dersi tamamladım"),
  })
  .strict();

export type LessonMetadata = z.infer<typeof lessonMetadataSchema>;

export function parseLessonMetadata(value: unknown): LessonMetadata | null {
  const parsed = lessonMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
