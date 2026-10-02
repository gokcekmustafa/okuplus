import { z } from "zod";

const EXTERNAL_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const OPTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export const CONTENT_IMPORT_TYPES = ["PASSAGE", "STORY", "POEM", "ARTICLE", "DIALOGUE"] as const;
export const CONTENT_IMPORT_QUESTION_TYPES = [
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "OPEN_ENDED",
  "MATCHING",
  "FILL_BLANK",
] as const;

/** Current global Skill.code values supported by the authoring catalog. */
export const CONTENT_IMPORT_COMPETENCIES = [
  "RC_MAIN_IDEA",
  "RC_DETAIL",
  "RC_INFERENCE",
  "FAST_ATTENTION",
  "FAST_RECOGNITION",
  "FAST_CHUNKING",
  "VOCABULARY",
  "FACTUAL",
  "COMPREHENSION",
] as const;

const externalKeySchema = z
  .string({ required_error: "externalKey gerekli" })
  .trim()
  .min(1, "externalKey gerekli")
  .max(120, "externalKey en fazla 120 karakter olabilir")
  .regex(EXTERNAL_KEY_PATTERN, "externalKey küçük harfli ve güvenli bir anahtar olmalı");

const titleSchema = z
  .string({ required_error: "Başlık gerekli" })
  .trim()
  .min(1, "Başlık gerekli")
  .max(200, "Başlık en fazla 200 karakter olabilir");

const passageSchema = z
  .string({ required_error: "Pasaj gerekli" })
  .trim()
  .min(1, "Pasaj gerekli")
  .max(100000, "Pasaj en fazla 100.000 karakter olabilir");

const stemSchema = z
  .string({ required_error: "Soru metni gerekli" })
  .trim()
  .min(1, "Soru metni gerekli")
  .max(10000, "Soru metni en fazla 10.000 karakter olabilir");

const difficultySchema = z
  .number({ required_error: "Zorluk gerekli", invalid_type_error: "Zorluk sayı olmalı" })
  .finite("Zorluk sonlu bir sayı olmalı")
  .min(0, "Zorluk en az 0 olmalı")
  .max(1, "Zorluk en fazla 1 olmalı");

const metadataKeyPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const UNSAFE_METADATA_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_NODES = 200;
const MAX_METADATA_KEYS = 40;
const MAX_METADATA_STRING_LENGTH = 4000;

function addMetadataIssues(
  value: unknown,
  path: (string | number)[],
  depth: number,
  state: { nodes: number },
  ctx: z.RefinementCtx,
): void {
  state.nodes += 1;
  if (state.nodes > MAX_METADATA_NODES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Metadata çok büyük" });
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > MAX_METADATA_STRING_LENGTH) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Metadata metni çok uzun" });
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Metadata sayısı sonlu olmalı" });
    }
    return;
  }
  if (typeof value !== "object") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Metadata yalnızca JSON değerleri içerebilir",
    });
    return;
  }
  if (depth >= MAX_METADATA_DEPTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Metadata nesne derinliği çok fazla",
    });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 50) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Metadata dizisi çok büyük" });
    }
    value.forEach((entry, index) =>
      addMetadataIssues(entry, [...path, index], depth + 1, state, ctx),
    );
    return;
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_METADATA_KEYS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "Metadata alan sayısı çok fazla" });
  }
  for (const key of keys) {
    if (UNSAFE_METADATA_KEYS.has(key) || !metadataKeyPattern.test(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, key],
        message: "Metadata anahtarı güvenli değil",
      });
    }
    addMetadataIssues(
      (value as Record<string, unknown>)[key],
      [...path, key],
      depth + 1,
      state,
      ctx,
    );
  }
}

const metadataSchema = z.unknown().superRefine((value, ctx) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "Metadata JSON nesnesi olmalı",
    });
    return;
  }
  addMetadataIssues(value, [], 0, { nodes: 0 }, ctx);
});

const targetSchema = z
  .object({
    scope: z.enum(["GLOBAL", "TENANT"]),
    tenantId: z.string().trim().min(1, "Tenant kimliği gerekli").nullable().optional(),
    allowGlobal: z.boolean().default(false),
  })
  .strict();

const optionSchema = z
  .object({
    key: z
      .string({ required_error: "Seçenek anahtarı gerekli" })
      .trim()
      .min(1, "Seçenek anahtarı gerekli")
      .max(32, "Seçenek anahtarı en fazla 32 karakter olabilir")
      .regex(OPTION_KEY_PATTERN, "Seçenek anahtarı güvenli değil"),
    text: z
      .string({ required_error: "Seçenek metni gerekli" })
      .trim()
      .min(1, "Seçenek metni gerekli")
      .max(2000, "Seçenek metni en fazla 2.000 karakter olabilir"),
  })
  .strict();

const contentVersionReferenceSchema = z
  .object({
    externalKey: externalKeySchema,
    version: z.number().int().min(1, "Sürüm pozitif tam sayı olmalı"),
  })
  .strict();

const questionSchema = z
  .object({
    externalKey: externalKeySchema,
    position: z.number().int().min(0, "Soru pozisyonu negatif olamaz").optional(),
    type: z.enum(CONTENT_IMPORT_QUESTION_TYPES),
    stem: stemSchema,
    options: z.array(optionSchema).max(50, "En fazla 50 seçenek olabilir"),
    correctAnswer: z.unknown().refine((value) => value !== undefined, "Doğru cevap gerekli"),
    explanation: z
      .string()
      .trim()
      .max(5000, "Açıklama en fazla 5.000 karakter olabilir")
      .optional(),
    hint: z.string().trim().max(1000, "İpucu en fazla 1.000 karakter olabilir").optional(),
    competency: z.enum(CONTENT_IMPORT_COMPETENCIES),
    difficulty: difficultySchema,
    contentVersion: contentVersionReferenceSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

const contentSchema = z
  .object({
    externalKey: externalKeySchema,
    title: titleSchema,
    contentType: z.enum(CONTENT_IMPORT_TYPES),
    competency: z.enum(CONTENT_IMPORT_COMPETENCIES),
    difficulty: difficultySchema,
    passage: passageSchema,
    metadata: metadataSchema.optional(),
    license: z.string().trim().max(120, "Lisans en fazla 120 karakter olabilir").optional(),
    changelog: z
      .string()
      .trim()
      .max(500, "Değişiklik notu en fazla 500 karakter olabilir")
      .optional(),
  })
  .strict();

export const contentImportManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    manifestId: z
      .string({ required_error: "Manifest kimliği gerekli" })
      .trim()
      .min(1, "Manifest kimliği gerekli")
      .max(120, "Manifest kimliği en fazla 120 karakter olabilir")
      .regex(/^[A-Z0-9][A-Z0-9_.-]*$/, "Manifest kimliği güvenli değil"),
    target: targetSchema,
    content: contentSchema,
    questions: z
      .array(questionSchema)
      .min(1, "En az bir soru gerekli")
      .max(50, "En fazla 50 soru olabilir"),
  })
  .strict();

export type ContentImportManifest = z.infer<typeof contentImportManifestSchema>;
export type ContentImportQuestion = ContentImportManifest["questions"][number];
export type ContentImportContent = ContentImportManifest["content"];

export const CONTENT_IMPORT_LIMITS = {
  maxManifestBytes: 2_000_000,
  maxMetadataDepth: MAX_METADATA_DEPTH,
  maxMetadataNodes: MAX_METADATA_NODES,
  maxMetadataKeys: MAX_METADATA_KEYS,
} as const;

export function isUnsafeMetadataKey(key: string): boolean {
  return UNSAFE_METADATA_KEYS.has(key) || !metadataKeyPattern.test(key);
}
