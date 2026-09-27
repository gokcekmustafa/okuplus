import { z } from "zod";

export const LESSON_METADATA_TYPE = "LEARNING_LESSON" as const;

const academicSourceSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(300),
    url: z.string().url().max(500),
    claim: z.string().trim().min(1).max(2000),
    limitation: z.string().trim().min(1).max(2000).optional(),
    scope: z.enum(["EVIDENCE", "CURRICULUM", "PRODUCT_INFERENCE"]),
  })
  .strict();

const academicMeasurementSignalSchema = z.enum([
  "ACCURACY",
  "COMPREHENSION",
  "WORD_RECOGNITION",
  "PHRASE_CHUNKING",
  "CONTROLLED_TASK_TIME",
  "ERROR_TYPE",
  "TRANSFER",
]);

export const lessonMetadataSchema = z
  .object({
    lessonType: z.literal(LESSON_METADATA_TYPE),
    contractVersion: z.union([z.literal(1), z.literal(2)]),
    skillCode: z.string().trim().min(1).max(80),
    objective: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(5000),
    workedExample: z.string().trim().min(1).max(5000),
    guidedPractice: z.string().trim().min(1).max(5000),
    exerciseTemplateVersionId: z.string().trim().min(1).max(120),
    completionLabel: z.string().trim().min(1).max(160).default("Dersi tamamladım"),
    area: z.enum(["FAST_READING", "READING_COMPREHENSION"]).optional(),
    stage: z.enum(["TEACHING", "SMALL_STUDY", "PRACTICE"]).optional(),
    observableOutcome: z.string().trim().min(1).max(1000).optional(),
    modeledThinking: z.string().trim().min(1).max(5000).optional(),
    misconception: z.string().trim().min(1).max(2000).optional(),
    correctFeedback: z.string().trim().min(1).max(5000).optional(),
    incorrectFeedback: z.string().trim().min(1).max(5000).optional(),
    independentApplication: z.string().trim().min(1).max(5000).optional(),
    feedback: z.string().trim().min(1).max(5000).optional(),
    reteach: z.string().trim().min(1).max(5000).optional(),
    transferTask: z.string().trim().min(1).max(5000).optional(),
    completionCondition: z.string().trim().min(1).max(1000).optional(),
    measurementSignals: z.array(academicMeasurementSignalSchema).max(8).optional(),
    successIndicators: z
      .array(
        z
          .object({
            signal: academicMeasurementSignalSchema,
            evidence: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    academicSources: z.array(academicSourceSchema).max(8).optional(),
  })
  .strict();

export type LessonMetadata = z.infer<typeof lessonMetadataSchema>;

export function parseLessonMetadata(value: unknown): LessonMetadata | null {
  const parsed = lessonMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
