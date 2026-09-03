import { z } from "zod";

/**
 * Soru Yönetimi Zod şemaları (SUPER_ADMIN + CONTENT_EDITOR).
 *
 * SORU:
 *  - tenantId doğrudan taşımaz; kapsam Content üzerinden türetilir (RLS subquery).
 *  - position: içerik içindeki sıra (benzersiz, sıfır-tabanlı).
 *  - type: soru tipi (MULTIPLE_CHOICE, TRUE_FALSE, OPEN_ENDED, MATCHING, FILL_BLANK).
 *  - skillId: opsiyonel beceri etiketi.
 *  - status: DRAFT / PUBLISHED / ARCHIVED.
 *
 * SORU SÜRÜM YAŞAM DÖNGÜSÜ: DRAFT → REVIEW → PUBLISHED → ARCHIVED.
 *  - PUBLISHED sürüm immutable'dır (DB trigger manual/007 + servis kuralı).
 *  - Değişiklik her zaman yeni bir sürüm üretir.
 *  - Publish işlemi: sürüm PUBLISHED + publishedAt olur ve Question.status=PUBLISHED yapılır.
 *    Question modelinde currentVersionId alanı bulunmadığından aktif sürüm published version üzerinden türetilir.
 *
 * DOĞRU CEVAP (correctAnswer) — QuestionType'a göre şema:
 *  - MULTIPLE_CHOICE: { type: 'MULTIPLE_CHOICE'; correctOptionIds: string[]; allowMultiple: boolean; partialCredit: boolean }
 *  - TRUE_FALSE: { type: 'TRUE_FALSE'; answer: boolean }
 *  - OPEN_ENDED: { type: 'OPEN_ENDED'; expectedAnswer: string; acceptableVariants?: string[]; rubric?: { criteria: string; points: number }[]; caseSensitive?: boolean }
 *  - MATCHING: { type: 'MATCHING'; pairs: { leftId: string; rightId: string }[]; partialCredit: boolean }
 *  - FILL_BLANK: { type: 'FILL_BLANK'; blanks: { blankId: string; acceptedAnswers: string[]; caseSensitive?: boolean; regex?: string }[]; partialCredit: boolean }
 *
 * OPSİYONLAR (options) — her tip için ortak yapı:
 *  { id: string; text: string; mediaId?: string; weight?: number; isCorrect?: boolean; matchGroup?: string; position: number }
 */

const questionTypeSchema = z.enum([
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "OPEN_ENDED",
  "MATCHING",
  "FILL_BLANK",
]);

const questionStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

const _versionStatusSchema = z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);

const promptSchema = z
  .string()
  .trim()
  .min(1, "Soru metni gerekli")
  .max(10000, "Soru metni en fazla 10.000 karakter olmalı");

const explanationSchema = z
  .string()
  .trim()
  .max(5000, "Açıklama en fazla 5.000 karakter olmalı")
  .nullable()
  .optional();

const hintSchema = z
  .string()
  .trim()
  .max(1000, "İpucu en fazla 1.000 karakter olmalı")
  .nullable()
  .optional();

const difficultySchema = z
  .number()
  .min(0, "Zorluk en az 0 olmalı")
  .max(1, "Zorluk en fazla 1 olmalı")
  .nullable()
  .optional();

const positionSchema = z.number().int("Sıra tam sayı olmalı").min(0, "Sıra en az 0 olmalı");

const optionSchema = z.object({
  id: z.string().trim().min(1, "Opsiyon kimliği gerekli"),
  text: z
    .string()
    .trim()
    .min(1, "Opsiyon metni gerekli")
    .max(2000, "Opsiyon metni en fazla 2.000 karakter"),
  mediaId: z.string().trim().min(1).nullable().optional(),
  weight: z.number().min(0).max(1).nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
  matchGroup: z.string().trim().min(1).nullable().optional(),
  position: positionSchema,
});

const optionsArraySchema = z
  .array(optionSchema)
  .max(50, "En fazla 50 opsiyon")
  .superRefine((options, ctx) => {
    const ids = new Set<string>();
    const positions = new Set<number>();
    options.forEach((option, index) => {
      if (ids.has(option.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: "Opsiyon kimlikleri benzersiz olmalı",
        });
      }
      if (positions.has(option.position)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "position"],
          message: "Opsiyon pozisyonları benzersiz olmalı",
        });
      }
      ids.add(option.id);
      positions.add(option.position);
    });
  });

// MULTIPLE_CHOICE correctAnswer şeması
const multipleChoiceCorrectSchema = z.object({
  type: z.literal("MULTIPLE_CHOICE"),
  correctOptionIds: z.array(z.string().trim().min(1)).min(1, "En az bir doğru seçenek gerekli"),
  allowMultiple: z.boolean(),
  partialCredit: z.boolean(),
});

// TRUE_FALSE correctAnswer şeması
const trueFalseCorrectSchema = z.object({
  type: z.literal("TRUE_FALSE"),
  answer: z.boolean(),
});

// OPEN_ENDED correctAnswer şeması
const openEndedCorrectSchema = z.object({
  type: z.literal("OPEN_ENDED"),
  expectedAnswer: z.string().trim().min(1, "Beklenen cevap gerekli"),
  acceptableVariants: z.array(z.string().trim().min(1)).optional(),
  rubric: z
    .array(
      z.object({
        criteria: z.string().trim().min(1),
        points: z.number().min(0).max(1),
      }),
    )
    .max(10, "En fazla 10 kriter")
    .optional(),
  caseSensitive: z.boolean().optional(),
});

// MATCHING correctAnswer şeması
const matchingCorrectSchema = z.object({
  type: z.literal("MATCHING"),
  pairs: z
    .array(
      z.object({
        leftId: z.string().trim().min(1),
        rightId: z.string().trim().min(1),
      }),
    )
    .min(1, "En az bir eşleşme çifti gerekli"),
  partialCredit: z.boolean(),
});

// FILL_BLANK correctAnswer şeması
const fillBlankCorrectSchema = z.object({
  type: z.literal("FILL_BLANK"),
  blanks: z
    .array(
      z.object({
        blankId: z.string().trim().min(1, "Boşluk kimliği gerekli"),
        acceptedAnswers: z
          .array(z.string().trim().min(1))
          .min(1, "En az bir kabul edilen cevap gerekli"),
        caseSensitive: z.boolean().optional(),
        regex: z.string().nullable().optional(),
      }),
    )
    .min(1, "En az bir boşluk gerekli"),
  partialCredit: z.boolean(),
});

// Birleştirilmiş correctAnswer şeması (discriminated union)
const correctAnswerSchema = z.discriminatedUnion("type", [
  multipleChoiceCorrectSchema,
  trueFalseCorrectSchema,
  openEndedCorrectSchema,
  matchingCorrectSchema,
  fillBlankCorrectSchema,
]);

const questionVersionPayloadSchema = z
  .object({
    type: questionTypeSchema,
    prompt: promptSchema,
    options: optionsArraySchema,
    correctAnswer: correctAnswerSchema,
  })
  .superRefine(({ type, options, correctAnswer }, ctx) => {
    if (type !== correctAnswer.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctAnswer", "type"],
        message: "correctAnswer.type soru tipiyle eşleşmeli",
      });
      return;
    }

    const optionIds = new Set(options.map((option) => option.id));
    const ensureOptionIds = (ids: string[], path: (string | number)[]) => {
      ids.forEach((id, index) => {
        if (!optionIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, index],
            message: `Opsiyon kimliği bulunamadı: ${id}`,
          });
        }
      });
    };

    if (correctAnswer.type === "MULTIPLE_CHOICE") {
      ensureOptionIds(correctAnswer.correctOptionIds, ["correctAnswer", "correctOptionIds"]);
      if (new Set(correctAnswer.correctOptionIds).size !== correctAnswer.correctOptionIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer", "correctOptionIds"],
          message: "Doğru opsiyon kimlikleri benzersiz olmalı",
        });
      }
      if (!correctAnswer.allowMultiple && correctAnswer.correctOptionIds.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer", "correctOptionIds"],
          message: "Tek seçimli soruda tam olarak bir doğru seçenek olmalı",
        });
      }
    }

    if (correctAnswer.type === "MATCHING") {
      correctAnswer.pairs.forEach((pair, index) => {
        ensureOptionIds([pair.leftId], ["correctAnswer", "pairs", index, "leftId"]);
        ensureOptionIds([pair.rightId], ["correctAnswer", "pairs", index, "rightId"]);
      });
    }

    if (correctAnswer.type === "FILL_BLANK") {
      const blankIds = new Set<string>();
      correctAnswer.blanks.forEach((blank, index) => {
        if (blankIds.has(blank.blankId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["correctAnswer", "blanks", index, "blankId"],
            message: "Boşluk kimlikleri benzersiz olmalı",
          });
        }
        blankIds.add(blank.blankId);
      });
    }
  });

/** Sürüm güncellemesinde Question.type service'ten geldiği için ortak çapraz doğrulama. */
export function validateQuestionVersionPayload(type: QuestionType, payload: unknown): void {
  questionVersionPayloadSchema.parse({ type, ...(payload as object) });
}

/** Yeni soru oluşturma gövdesi. */
export const createQuestionSchema = z
  .object({
    contentId: z.string().trim().min(1, "İçerik kimliği gerekli"),
    position: positionSchema,
    type: questionTypeSchema,
    skillId: z.string().trim().min(1).nullable().optional(),
    prompt: promptSchema,
    options: optionsArraySchema,
    correctAnswer: correctAnswerSchema,
    explanation: explanationSchema,
    hint: hintSchema,
    difficulty: difficultySchema,
  })
  .superRefine((input, ctx) => {
    const result = questionVersionPayloadSchema.safeParse(input);
    if (!result.success) {
      result.error.issues.forEach((issue) => ctx.addIssue(issue));
    }
  });

/** Soru güncelleme gövdesi (yalnızca meta alanlar; prompt/options/correctAnswer sürüm içinde). */
export const updateQuestionSchema = z.object({
  position: positionSchema.optional(),
  skillId: z.string().trim().min(1).nullable().optional(),
});

/** Soru durumu güncelleme gövdesi. */
export const updateQuestionStatusSchema = z.object({
  status: questionStatusSchema,
});

/** Soru listeleme sorgu parametreleri. */
export const listQuestionsQuerySchema = z.object({
  contentId: z.string().trim().min(1).optional(),
  type: questionTypeSchema.optional(),
  status: questionStatusSchema.optional(),
  skillId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Yeni soru sürümü oluşturma gövdesi. */
export const createQuestionVersionSchema = z.object({
  prompt: promptSchema.optional(),
  options: optionsArraySchema.optional(),
  correctAnswer: correctAnswerSchema.optional(),
  explanation: explanationSchema,
  hint: hintSchema,
  difficulty: difficultySchema,
});

/** Soru sürümü güncelleme gövdesi (yalnızca DRAFT/REVIEW; PUBLISHED immutable). */
export const updateQuestionVersionSchema = z.object({
  prompt: promptSchema.optional(),
  options: optionsArraySchema.optional(),
  correctAnswer: correctAnswerSchema.optional(),
  explanation: explanationSchema,
  hint: hintSchema,
  difficulty: difficultySchema,
});

/** İçerik-soru ilişki/sıralama gövdesi. */
export const updateContentQuestionsSchema = z
  .object({
    questions: z
      .array(
        z.object({
          questionId: z.string().trim().min(1, "Soru kimliği gerekli"),
          position: positionSchema,
        }),
      )
      .max(200, "En fazla 200 soru bağlanabilir"),
  })
  .superRefine(({ questions }, ctx) => {
    const ids = new Set<string>();
    const positions = new Set<number>();
    questions.forEach((question, index) => {
      if (ids.has(question.questionId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "questionId"],
          message: "Soru kimlikleri benzersiz olmalı",
        });
      if (positions.has(question.position))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "position"],
          message: "Soru pozisyonları benzersiz olmalı",
        });
      ids.add(question.questionId);
      positions.add(question.position);
    });
  });

// Tür çıkarımı
export type QuestionType = z.infer<typeof questionTypeSchema>;
export type QuestionStatus = z.infer<typeof questionStatusSchema>;
export type VersionStatus = z.infer<typeof _versionStatusSchema>;

export type CorrectAnswer = z.infer<typeof correctAnswerSchema>;
export type Option = z.infer<typeof optionSchema>;

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type UpdateQuestionStatusInput = z.infer<typeof updateQuestionStatusSchema>;
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
export type CreateQuestionVersionInput = z.infer<typeof createQuestionVersionSchema>;
export type UpdateQuestionVersionInput = z.infer<typeof updateQuestionVersionSchema>;
export type UpdateContentQuestionsInput = z.infer<typeof updateContentQuestionsSchema>;

/** Cevap gönderimi gövdesi — questionVersionId URL param'dan gelir. */
export const createAttemptSchema = z.object({
  sessionId: z.string().trim().min(1, "Oturum kimliği gerekli"),
  answer: z.any(),
  clientAttemptId: z.string().trim().min(1, "İstemci deneme kimliği gerekli"),
  timeSpentMs: z.number().int().min(0, "Geçen süre 0 veya daha büyük olmalı").optional(),
});

/** Cevap yanıtı. */
export const attemptResponseSchema = z.object({
  id: z.string(),
  questionVersionId: z.string(),
  questionId: z.string(),
  answer: z.any().nullable(),
  isCorrect: z.boolean().nullable(),
  rawScore: z.number().nullable(),
  timeSpentMs: z.number().nullable(),
  responseOrder: z.number().int(),
  feedback: z.any().nullable(),
  answeredAt: z.string(),
  createdAt: z.string(),
});

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;
