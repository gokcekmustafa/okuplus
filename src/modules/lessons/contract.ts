import { z } from "zod";

export const LESSON_METADATA_TYPE = "LEARNING_LESSON" as const;
const LEGACY_P1_A_PROGRAM_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE" as const;
const CYCLE_2_P1_A_PROGRAM_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-2" as const;
const CYCLE_2_P1_A_ROUTE_FAMILY = "P1-A-CYCLE-2" as const;

const lessonMetadataKeys = [
  "lessonType",
  "contractVersion",
  "programId",
  "routeFamily",
  "skillCode",
  "objective",
  "explanation",
  "workedExample",
  "guidedPractice",
  "exerciseTemplateVersionId",
  "completionLabel",
  "area",
  "stage",
  "observableOutcome",
  "modeledThinking",
  "misconception",
  "correctFeedback",
  "incorrectFeedback",
  "independentApplication",
  "feedback",
  "reteach",
  "transferTask",
  "completionCondition",
  "measurementSignals",
  "successIndicators",
  "academicSources",
] as const;

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
    // Curriculum metadata may carry a stable authoring envelope. These fields
    // are optional so older P0 lesson versions remain valid, but they are
    // still validated instead of being silently accepted as arbitrary data.
    programId: z.string().trim().min(1).max(120).optional(),
    // Versioned P1-A cycles keep their route family in the lesson envelope so
    // the published content can be resolved without weakening the contract.
    routeFamily: z.enum(["P1-A", "P1-A-CYCLE-2"]).optional(),
    skillCode: z.string().trim().min(1).max(80),
    objective: z.string().trim().min(1).max(500),
    explanation: z.string().trim().min(1).max(5000),
    workedExample: z.string().trim().min(1).max(5000),
    guidedPractice: z.string().trim().min(1).max(5000),
    // Content-only teaching lessons do not need an exercise template. P0
    // lessons keep their published template binding; P1-A teaching content
    // legitimately uses null and is still resolved by contentVersionId.
    exerciseTemplateVersionId: z.string().trim().min(1).max(120).nullable(),
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

// The first immutable Cycle 2 teaching versions used the full passage as the
// objective fallback. Keep that already-published shape readable without
// widening the contract for newly-authored lesson metadata.
const legacyCycle2LessonMetadataSchema = lessonMetadataSchema.extend({
  objective: z.string().trim().min(1).max(5000),
});

export type LessonMetadata = z.infer<typeof lessonMetadataSchema>;

export function parseLessonMetadata(value: unknown): LessonMetadata | null {
  const parsed = lessonMetadataSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  // P1-A was provisioned before contractVersion became mandatory. Keep those
  // already-published immutable versions readable, but only when the
  // canonical P1-A envelope is present. New provisioning must always emit an
  // explicit version and must not rely on this compatibility path.
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "contractVersion" in value === false &&
    (value as { programId?: unknown }).programId === LEGACY_P1_A_PROGRAM_ID &&
    (value as { routeFamily?: unknown }).routeFamily === "P1-A"
  ) {
    const legacyParsed = lessonMetadataSchema.safeParse({
      ...(value as Record<string, unknown>),
      contractVersion: 1,
    });
    return legacyParsed.success ? legacyParsed.data : null;
  }

  // Cycle 2 was published before its two content-only teaching records were
  // emitted with the lesson discriminator. Keep those immutable versions
  // readable, but scope the compatibility path to the exact versioned
  // program, route family, contract version, and content-only binding. New
  // provisioning must emit LEARNING_LESSON directly.
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { lessonType?: unknown }).lessonType === "LEARNING_EXERCISE" &&
    (value as { contractVersion?: unknown }).contractVersion === 2 &&
    (value as { programId?: unknown }).programId === CYCLE_2_P1_A_PROGRAM_ID &&
    ((value as { routeFamily?: unknown }).routeFamily === undefined ||
      (value as { routeFamily?: unknown }).routeFamily === CYCLE_2_P1_A_ROUTE_FAMILY) &&
    (value as { exerciseTemplateVersionId?: unknown }).exerciseTemplateVersionId === null
  ) {
    const raw = value as Record<string, unknown>;
    const normalized = Object.fromEntries(
      lessonMetadataKeys.filter((key) => key in raw).map((key) => [key, raw[key]]),
    );
    const compatibilityParsed = legacyCycle2LessonMetadataSchema.safeParse({
      ...normalized,
      lessonType: LESSON_METADATA_TYPE,
      routeFamily: CYCLE_2_P1_A_ROUTE_FAMILY,
    });
    return compatibilityParsed.success ? compatibilityParsed.data : null;
  }

  return null;
}
