import { z } from "zod";
import { PROFICIENCY_SKILL_CODES, type ProficiencySkillCode } from "./proficiency-levels.js";

export const CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_ID = "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1";
export const CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_VERSION = "1.0.1";

const REVISED_QUESTION_IDS = new Set([
  "PLV1-Q003",
  "PLV1-Q005",
  "PLV1-Q006",
  "PLV1-Q007",
  "PLV1-Q008",
  "PLV1-Q010",
  "PLV1-Q012",
  "PLV1-Q013",
  "PLV1-Q015",
  "PLV1-Q018",
  "PLV1-Q019",
  "PLV1-Q020",
  "PLV1-Q022",
  "PLV1-Q023",
  "PLV1-Q026",
  "PLV1-Q027",
  "PLV1-Q028",
  "PLV1-Q029",
  "PLV1-Q030",
  "PLV1-Q031",
  "PLV1-Q032",
  "PLV1-Q034",
  "PLV1-Q035",
  "PLV1-Q036",
]);

export type PlacementDifficultyLabel = "EASY" | "MEDIUM" | "HARD";
export type PlacementQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MATCHING" | "FILL_BLANK";
export type PlacementCognitiveDemand = "RECALL" | "UNDERSTAND" | "INFER";

const DIFFICULTY_SCORE: Record<PlacementDifficultyLabel, number> = {
  EASY: 0.25,
  MEDIUM: 0.5,
  HARD: 0.75,
};

const questionTypeSchema = z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK"]);
const difficultyLabelSchema = z.enum(["EASY", "MEDIUM", "HARD"]);
const cognitiveDemandSchema = z.enum(["RECALL", "UNDERSTAND", "INFER"]);

const optionSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    text: z.string().trim().min(1).max(2000),
    position: z.number().int().min(0),
  })
  .strict();

const sourceMetadataSchema = z
  .object({
    sourceType: z.literal("ORIGINAL_EDITORIAL"),
    sourceId: z.literal("OKU-PLACEMENT-V1-EDITORIAL"),
    license: z.literal("INTERNAL_ORIGINAL"),
    authoringMethod: z.literal("ORIGINAL_PASSAGE_AND_ITEM"),
    claimPolicy: z.literal("PASSAGE_INTERNAL_EVIDENCE_ONLY"),
  })
  .strict();

const evidenceSchema = z
  .object({
    paragraph: z.number().int().min(1),
    span: z.string().trim().min(1).max(2000),
  })
  .strict();

const correctAnswerSchema = z.union([
  z
    .object({
      type: z.literal("MULTIPLE_CHOICE"),
      correctOptionIds: z.array(z.string().trim().min(1)).length(1),
      allowMultiple: z.literal(false),
      partialCredit: z.literal(false),
    })
    .strict(),
  z.object({ type: z.literal("TRUE_FALSE"), answer: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("MATCHING"),
      pairs: z
        .array(
          z
            .object({ leftId: z.string().trim().min(1), rightId: z.string().trim().min(1) })
            .strict(),
        )
        .min(2),
      partialCredit: z.literal(false),
    })
    .strict(),
  z
    .object({
      type: z.literal("FILL_BLANK"),
      blanks: z
        .array(
          z
            .object({
              blankId: z.string().trim().min(1),
              acceptedAnswers: z.array(z.string().trim().min(1)).min(1),
              caseSensitive: z.boolean().optional(),
            })
            .strict(),
        )
        .min(1),
      partialCredit: z.literal(false),
    })
    .strict(),
]);

const placementQuestionSchema = z
  .object({
    stableQuestionId: z.string().regex(/^PLV1-Q\d{3}$/u),
    contentId: z.string().regex(/^PLV1-C\d{3}$/u),
    skillCode: z.enum(PROFICIENCY_SKILL_CODES),
    difficulty: z.number().finite().min(0).max(1),
    difficultyLabel: difficultyLabelSchema,
    questionType: questionTypeSchema,
    questionText: z.string().trim().min(1).max(10000),
    revisionReason: z.string().trim().min(1).max(1000).optional(),
    options: z.array(optionSchema),
    correctAnswer: correctAnswerSchema,
    explanation: z.string().trim().min(1).max(5000),
    rationale: z.string().trim().min(1).max(5000),
    evidence: evidenceSchema,
    cognitiveDemand: cognitiveDemandSchema,
    sourceMetadata: sourceMetadataSchema,
  })
  .strict();

const placementPassageSchema = z
  .object({
    contentId: z.string().regex(/^PLV1-C\d{3}$/u),
    title: z.string().trim().min(1).max(200),
    domain: z.string().trim().min(1).max(120),
    body: z.string().trim().min(100).max(5000),
    sourceMetadata: sourceMetadataSchema,
  })
  .strict();

const distributionSchema = z
  .object({
    RC_MAIN_IDEA: z.number().int().nonnegative(),
    RC_DETAIL: z.number().int().nonnegative(),
    RC_INFERENCE: z.number().int().nonnegative(),
  })
  .strict();

export const canonicalPlacementItemBankManifestSchema = z
  .object({
    manifestId: z.literal(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_ID),
    manifestVersion: z.literal(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_VERSION),
    itemBankType: z.literal("PLACEMENT"),
    lifecycle: z.literal("DESIGN_ONLY"),
    calibrationStatus: z.literal("NOT_CALIBRATED"),
    productionAssignmentEnabled: z.literal(false),
    expectedQuestionCount: z.literal(36),
    skillDistribution: distributionSchema,
    difficultyDistribution: z
      .object({ EASY: z.literal(12), MEDIUM: z.literal(12), HARD: z.literal(12) })
      .strict(),
    passageDistribution: z.record(z.string().regex(/^PLV1-C\d{3}$/u), z.literal(3)),
    validationRules: z.array(z.string().trim().min(1)).min(1),
    passages: z.array(placementPassageSchema).length(12),
    questions: z.array(placementQuestionSchema).length(36),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const passageIds = manifest.passages.map((passage) => passage.contentId);
    const questionIds = manifest.questions.map((question) => question.stableQuestionId);
    const passageBodies = manifest.passages.map((passage) => normalize(passage.body));
    const questionTexts = manifest.questions.map((question) => normalize(question.questionText));

    addUniqueIssues(passageIds, "passages", "contentId", ctx);
    addUniqueIssues(questionIds, "questions", "stableQuestionId", ctx);
    addUniqueIssues(passageBodies, "passages", "body", ctx);
    addUniqueIssues(questionTexts, "questions", "questionText", ctx);

    const passageIdSet = new Set(passageIds);
    const actualSkillDistribution = { RC_MAIN_IDEA: 0, RC_DETAIL: 0, RC_INFERENCE: 0 };
    const actualDifficultyDistribution = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const actualPassageDistribution = new Map<string, number>();
    const perSkillDifficulty = new Map<
      ProficiencySkillCode,
      Record<PlacementDifficultyLabel, number>
    >();

    for (const skillCode of PROFICIENCY_SKILL_CODES) {
      perSkillDifficulty.set(skillCode, { EASY: 0, MEDIUM: 0, HARD: 0 });
    }

    for (const [index, question] of manifest.questions.entries()) {
      if (!passageIdSet.has(question.contentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "contentId"],
          message: "question contentId manifest içinde bulunmuyor",
        });
      }

      if (question.difficulty !== DIFFICULTY_SCORE[question.difficultyLabel]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "difficulty"],
          message: "difficulty ve difficultyLabel eşleşmiyor",
        });
      }

      actualSkillDistribution[question.skillCode] += 1;
      actualDifficultyDistribution[question.difficultyLabel] += 1;
      actualPassageDistribution.set(
        question.contentId,
        (actualPassageDistribution.get(question.contentId) ?? 0) + 1,
      );

      const skillCounts = perSkillDifficulty.get(question.skillCode)!;
      skillCounts[question.difficultyLabel] += 1;
      validateQuestionAnswer(question, index, ctx);

      if (REVISED_QUESTION_IDS.has(question.stableQuestionId) && !question.revisionReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "revisionReason"],
          message: "revize edilen soruda revisionReason zorunlu",
        });
      }

      const passage = manifest.passages.find(
        (candidate) => candidate.contentId === question.contentId,
      );
      if (passage && !passage.body.includes(question.evidence.span)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "evidence", "span"],
          message: "evidence.span ilgili passage içinde bulunmuyor",
        });
      }
      if (passage) {
        const paragraph = passage.body.split(/\n\s*\n/u)[question.evidence.paragraph - 1];
        if (!paragraph) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", index, "evidence", "paragraph"],
            message: "evidence.paragraph passage içinde bulunmuyor",
          });
        }
      }
    }

    if (JSON.stringify(actualSkillDistribution) !== JSON.stringify(manifest.skillDistribution)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skillDistribution"],
        message: "gerçek Skill dağılımı manifest dağılımıyla eşleşmiyor",
      });
    }
    if (
      JSON.stringify(actualDifficultyDistribution) !==
      JSON.stringify(manifest.difficultyDistribution)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["difficultyDistribution"],
        message: "gerçek difficulty dağılımı manifest dağılımıyla eşleşmiyor",
      });
    }

    for (const [index, passage] of manifest.passages.entries()) {
      const actualCount = actualPassageDistribution.get(passage.contentId) ?? 0;
      const expectedCount = manifest.passageDistribution[passage.contentId];
      if (expectedCount !== 3 || actualCount !== expectedCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["passages", index, "contentId"],
          message: "passage tam olarak üç placement sorusuna sahip olmalı",
        });
      }
    }

    for (const [skillCode, counts] of perSkillDifficulty.entries()) {
      if (counts.EASY !== 4 || counts.MEDIUM !== 4 || counts.HARD !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions"],
          message: `${skillCode} için EASY/MEDIUM/HARD dağılımı 4/4/4 olmalı`,
        });
      }
    }

    for (const passageId of Object.keys(manifest.passageDistribution)) {
      if (!passageIdSet.has(passageId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["passageDistribution", passageId],
          message: "passageDistribution içinde bilinmeyen contentId",
        });
      }
    }
  });

export type CanonicalPlacementItemBankManifest = z.infer<
  typeof canonicalPlacementItemBankManifestSchema
>;
export type CanonicalPlacementPassage = CanonicalPlacementItemBankManifest["passages"][number];
export type CanonicalPlacementQuestion = CanonicalPlacementItemBankManifest["questions"][number];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function addUniqueIssues(
  values: string[],
  collection: "passages" | "questions",
  field: "contentId" | "stableQuestionId" | "body" | "questionText",
  ctx: z.RefinementCtx,
): void {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const [index, value] of values.entries()) {
    if ((counts.get(value) ?? 0) < 2) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [collection, index, field],
      message: `${field} unique olmalı: ${value}`,
    });
  }
}

function optionIds(question: CanonicalPlacementQuestion): Set<string> {
  return new Set(question.options.map((option) => option.id));
}

function validateQuestionAnswer(
  question: CanonicalPlacementQuestion,
  index: number,
  ctx: z.RefinementCtx,
): void {
  const ids = optionIds(question);
  const optionPositions = new Set(question.options.map((option) => option.position));
  if (optionPositions.size !== question.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["questions", index, "options"],
      message: "option position değerleri unique olmalı",
    });
  }
  if (ids.size !== question.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["questions", index, "options"],
      message: "option id değerleri unique olmalı",
    });
  }
  if (question.questionType !== question.correctAnswer.type) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["questions", index, "correctAnswer", "type"],
      message: "questionType ve correctAnswer.type eşleşmiyor",
    });
  }

  if (question.questionType === "MULTIPLE_CHOICE") {
    if (question.options.length !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index, "options"],
        message: "MULTIPLE_CHOICE tam olarak dört seçenek içermeli",
      });
    }
    if (
      question.correctAnswer.type === "MULTIPLE_CHOICE" &&
      !ids.has(question.correctAnswer.correctOptionIds[0]!)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index, "correctAnswer", "correctOptionIds"],
        message: "correctOptionId options içinde bulunmuyor",
      });
    }
  } else if (question.questionType === "TRUE_FALSE") {
    if (
      question.options.length !== 2 ||
      question.options[0]?.id !== "true" ||
      question.options[1]?.id !== "false"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index, "options"],
        message: "TRUE_FALSE true/false seçeneklerini beklenen sırada içermeli",
      });
    }
  } else if (question.questionType === "MATCHING") {
    if (question.correctAnswer.type === "MATCHING") {
      const leftIds = new Set<string>();
      const rightIds = new Set<string>();
      for (const pair of question.correctAnswer.pairs) {
        if (!ids.has(pair.leftId) || !ids.has(pair.rightId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", index, "correctAnswer", "pairs"],
            message: "MATCHING pair option içinde bulunmuyor",
          });
        }
        leftIds.add(pair.leftId);
        rightIds.add(pair.rightId);
      }
      if (
        leftIds.size !== question.correctAnswer.pairs.length ||
        rightIds.size !== question.correctAnswer.pairs.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "correctAnswer", "pairs"],
          message: "MATCHING pair kimlikleri unique olmalı",
        });
      }
    }
  } else if (
    question.questionType === "FILL_BLANK" &&
    question.correctAnswer.type === "FILL_BLANK"
  ) {
    const blankIds = new Set(question.correctAnswer.blanks.map((blank) => blank.blankId));
    if (blankIds.size !== question.correctAnswer.blanks.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index, "correctAnswer", "blanks"],
        message: "FILL_BLANK blankId değerleri unique olmalı",
      });
    }
  }
}

const SOURCE_METADATA = {
  sourceType: "ORIGINAL_EDITORIAL",
  sourceId: "OKU-PLACEMENT-V1-EDITORIAL",
  license: "INTERNAL_ORIGINAL",
  authoringMethod: "ORIGINAL_PASSAGE_AND_ITEM",
  claimPolicy: "PASSAGE_INTERNAL_EVIDENCE_ONLY",
} as const;

const TRUE_FALSE_OPTIONS = [
  { id: "true", text: "Doğru", position: 0 },
  { id: "false", text: "Yanlış", position: 1 },
] as const;

function baseQuestion(
  stableQuestionId: string,
  contentId: string,
  skillCode: ProficiencySkillCode,
  difficultyLabel: PlacementDifficultyLabel,
  questionType: PlacementQuestionType,
  questionText: string,
  explanation: string,
  rationale: string,
  paragraph: number,
  span: string,
  cognitiveDemand: PlacementCognitiveDemand,
  options: Array<{ id: string; text: string; position: number }>,
  correctAnswer: Record<string, unknown>,
): CanonicalPlacementQuestion {
  return {
    stableQuestionId,
    contentId,
    skillCode,
    difficulty: DIFFICULTY_SCORE[difficultyLabel],
    difficultyLabel,
    questionType,
    questionText,
    options,
    correctAnswer,
    explanation,
    rationale,
    evidence: { paragraph, span },
    cognitiveDemand,
    sourceMetadata: SOURCE_METADATA,
  } as CanonicalPlacementQuestion;
}

function mc(
  id: string,
  contentId: string,
  skill: ProficiencySkillCode,
  difficulty: PlacementDifficultyLabel,
  text: string,
  options: string[],
  correct: string,
  explanation: string,
  rationale: string,
  paragraph: number,
  span: string,
  cognitiveDemand: PlacementCognitiveDemand,
): CanonicalPlacementQuestion {
  return baseQuestion(
    id,
    contentId,
    skill,
    difficulty,
    "MULTIPLE_CHOICE",
    text,
    explanation,
    rationale,
    paragraph,
    span,
    cognitiveDemand,
    options.map((optionText, position) => ({
      id: String.fromCharCode(97 + position),
      text: optionText,
      position,
    })),
    {
      type: "MULTIPLE_CHOICE",
      correctOptionIds: [correct],
      allowMultiple: false,
      partialCredit: false,
    },
  );
}

function tf(
  id: string,
  contentId: string,
  skill: ProficiencySkillCode,
  difficulty: PlacementDifficultyLabel,
  text: string,
  answer: boolean,
  explanation: string,
  rationale: string,
  paragraph: number,
  span: string,
  cognitiveDemand: PlacementCognitiveDemand,
): CanonicalPlacementQuestion {
  return baseQuestion(
    id,
    contentId,
    skill,
    difficulty,
    "TRUE_FALSE",
    text,
    explanation,
    rationale,
    paragraph,
    span,
    cognitiveDemand,
    [...TRUE_FALSE_OPTIONS],
    { type: "TRUE_FALSE", answer },
  );
}

function matching(
  id: string,
  contentId: string,
  skill: ProficiencySkillCode,
  difficulty: PlacementDifficultyLabel,
  text: string,
  left: string[],
  right: string[],
  pairs: Array<[number, number]>,
  explanation: string,
  rationale: string,
  paragraph: number,
  span: string,
  cognitiveDemand: PlacementCognitiveDemand,
): CanonicalPlacementQuestion {
  const options = [
    ...left.map((optionText, position) => ({ id: `l${position + 1}`, text: optionText, position })),
    ...right.map((optionText, position) => ({
      id: `r${position + 1}`,
      text: optionText,
      position: left.length + position,
    })),
  ];
  return baseQuestion(
    id,
    contentId,
    skill,
    difficulty,
    "MATCHING",
    text,
    explanation,
    rationale,
    paragraph,
    span,
    cognitiveDemand,
    options,
    {
      type: "MATCHING",
      pairs: pairs.map(([leftIndex, rightIndex]) => ({
        leftId: `l${leftIndex}`,
        rightId: `r${rightIndex}`,
      })),
      partialCredit: false,
    },
  );
}

function fill(
  id: string,
  contentId: string,
  skill: ProficiencySkillCode,
  difficulty: PlacementDifficultyLabel,
  text: string,
  blankId: string,
  acceptedAnswers: string[],
  explanation: string,
  rationale: string,
  paragraph: number,
  span: string,
  cognitiveDemand: PlacementCognitiveDemand,
): CanonicalPlacementQuestion {
  return baseQuestion(
    id,
    contentId,
    skill,
    difficulty,
    "FILL_BLANK",
    text,
    explanation,
    rationale,
    paragraph,
    span,
    cognitiveDemand,
    [],
    {
      type: "FILL_BLANK",
      blanks: [{ blankId, acceptedAnswers, caseSensitive: false }],
      partialCredit: false,
    },
  );
}

const PASSAGES: CanonicalPlacementPassage[] = [
  {
    contentId: "PLV1-C001",
    title: "Filtrede Kalan Lifler",
    domain: "Çevre ve gözlem",
    body: "Bir okul kulübü, sentetik kumaşlardan kopan küçük liflerin suya karışıp karışmadığını merak etti. Öğrenciler, çamaşır makinesinden çıkan suyu incelemek için basit bir filtre düzeneği kurdu.\n\nEkip, aynı miktarda suyu filtreden geçirip filtre kâğıtlarını karşılaştırdı. Kâğıtlarda görülen lifleri saydılar ve sonuçları bir tabloya yazdılar. Böylece yalnızca bir tahminde bulunmak yerine ölçülebilir bir gözlem elde ettiler.\n\nİlk deneme liflerin bir bölümünün tutulduğunu gösterdi. Öğrenciler, tek bir denemeyle kesin sonuca varmak yerine farklı kumaşlar ve daha uzun sürelerle yeni ölçümler yapmayı planladı.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C002",
    title: "Kütüphanede Sessiz Bir Yol",
    domain: "Tasarım ve ortak yaşam",
    body: "Mahalle kütüphanesinde bazı öğrenciler ders çalışırken, bazı ziyaretçiler kitap arıyordu. Görevli, girişten çalışma masalarına uzanan yolun sık sık kesildiğini fark etti. Bunun üzerine masaların yerini değiştirdi ve kitap arabalarını duvar kenarına aldı.\n\nYeni düzende girişe yakın bölüm hareketli işler için, pencere kenarı ise sessiz çalışma için ayrıldı. Bölümleri ayırmak için yüksek duvarlar yerine alçak raflar kullanıldı; böylece görevli iki alanı da görebiliyordu.\n\nBir hafta sonra yapılan kısa ankette öğrenciler daha az bölündüklerini söyledi. Görevli yine de düzenin herkes için uygun olup olmadığını anlamak için farklı saatlerde gözlem yapmaya devam etti.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C003",
    title: "Bahçedeki Ziyaretçiler",
    domain: "Doğa ve canlılar",
    body: "Okulun küçük bahçesine yerel bitkiler dikildikten sonra öğrenciler çiçekleri ziyaret eden canlıları izlemeye başladı. Arılar çiçekler arasında dolaşıyor, bazı kelebekler ise aynı bitkinin üzerinde daha uzun süre kalıyordu.\n\nÖğrenciler her gözlemde saati, bitkinin adını ve gördükleri canlıyı not etti. Çiçekleri koparmadılar; yalnızca uzaktan bakıp sayım yaptılar. Birkaç hafta sonra bazı bitkilerin belirli saatlerde daha çok ziyaret edildiğini fark ettiler.\n\nKulüp, gözlemlerinin bütün bahçeler için geçerli olduğunu söylemedi. Hava, çiçeklerin açık olması ve çevredeki başka bitkiler sonucu etkileyebileceği için çalışmayı başka günlerde tekrarlamayı kararlaştırdı.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C004",
    title: "Bulut Günlüğü",
    domain: "Hava ve veri",
    body: "Bir öğrenci grubu, üç hafta boyunca her öğle vakti gökyüzünün fotoğrafını çekti. Fotoğrafların yanına bulutların kapladığı alanı, rüzgârın yönünü ve o gün yağmur yağıp yağmadığını yazdı.\n\nBaşlangıçta öğrenciler yalnızca güzel görüntüler biriktirdiklerini düşünüyordu. Verileri yan yana koyunca bulutların art arda geldiği günlerin bazılarında yağmur görüldüğünü, bazılarında ise görülmediğini fark ettiler.\n\nGünlük, tek başına hava tahmini yapmak için yeterli değildi; ölçümler yalnızca öğle saatlerinde yapılmıştı. Grup, daha güvenilir bir karşılaştırma için sabah ve akşam gözlemlerini de eklemeyi önerdi.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C005",
    title: "Bisiklet İstasyonlarının Haritası",
    domain: "Kent ve ulaşım",
    body: "Bir belediye, öğrencilerin bisiklet istasyonlarını nasıl kullandığını anlamak için bir ay boyunca istasyonlardaki bisiklet sayısını kaydetti. Okula yakın istasyonlar sabahları hızla boşalıyor, öğleden sonra ise yeniden doluyordu. Parkın yanındaki istasyonda ise akşamüstü hareketlilik artıyordu.\n\nAraştırma ekibi yalnızca toplam bisiklet sayısını toplamakla yetinmedi. Saat, hava durumu ve istasyonun çevresindeki yolları da tabloya ekledi. Böylece yoğunluğun yalnızca istasyonun büyüklüğünden kaynaklanıp kaynaklanmadığını karşılaştırabildi.\n\nİlk öneri, her istasyona aynı sayıda bisiklet göndermekti. Veriler bu önerinin bazı saatlerde işe yarayacağını, ancak bütün gün için dengeli bir çözüm olmayacağını gösterdi. Ekip, bisikletleri gün içindeki değişime göre taşımayı önerdi.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C006",
    title: "Kıyının Altındaki Çayır",
    domain: "Deniz ekosistemi",
    body: "Kıyıdaki araştırma ekibi, sığ sularda uzanan deniz çayırlarının çevresindeki canlı çeşitliliğini inceledi. Çayırların yoğun olduğu bölgelerde küçük balıklar ve kabuklular daha sık görülüyordu. Ancak ekip, bu durumun tek nedeninin çayırlar olduğunu hemen ilan etmedi.\n\nAraştırmacılar üç farklı noktada aynı büyüklükte alanlar belirledi. Her alanda suyun berraklığını, zeminin türünü ve görülen canlıları kaydetti. Çıplak kum bulunan bazı alanlarda da canlılar vardı; fakat türlerin dağılımı çayırlı alanlardan farklıydı.\n\nRapor, deniz çayırlarının canlılara saklanma alanı sağlayabileceğini belirtiyordu. Yine de akıntı, derinlik ve zeminin yapısı gibi başka etkenlerin birlikte incelenmesi gerektiği vurgulandı.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C007",
    title: "Müzede Sesli Rehber",
    domain: "Kültür ve erişilebilirlik",
    body: "Bir müze, sergi salonlarında ziyaretçilerin nesneleri daha rahat inceleyebilmesi için sesli bir rehber uygulaması denedi. Ziyaretçiler, her eserin yanındaki kodu okutarak kısa açıklamayı dinleyebiliyordu. Açıklamalar eserin adı, yapıldığı malzeme ve sergideki konumu hakkında bilgi veriyordu.\n\nMüze ekibi ilk sürümde bütün açıklamaları aynı uzunlukta hazırladı. Deneme ziyaretlerinde bazı kişilerin uzun açıklamaları yarıda bıraktığı, bazı kişilerin ise eserin yanındaki yazıyı da okumak istediği görüldü. Ekip, açıklamaları kısaltıp ayrıntılı bilgiye ayrı bir düğmeyle ulaşılmasını sağladı.\n\nDeğişiklikten sonra ziyaretçiler hem temel bilgiyi daha hızlı aldı hem de isteyenler ayrıntıya geçebildi. Müze, uygulamanın sergi deneyimini desteklediğini; eserlerin yerini ve fiziksel incelemeyi tamamen ortadan kaldırmadığını belirtti.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C008",
    title: "Sınıf Bitkileri Deneyi",
    domain: "Deney tasarımı",
    body: "Bir sınıf, bitkilerin sulama sıklığına nasıl tepki verdiğini gözlemlemek istedi. Öğrenciler aynı türden dört bitki seçti ve bitkileri eşit ışık alan bir rafa koydu. İki bitkiyi iki günde bir, diğer ikisini dört günde bir suladılar.\n\nHer hafta yaprak sayısını, toprağın nemini ve bitkilerin boyunu kaydettiler. Saksıların yerini değiştirmediler; çünkü ışık farkının sonuçları etkilemesini istemiyorlardı. Bir ayın sonunda iki gruptaki değişimleri karşılaştırdılar.\n\nSonuçlar sulama aralığı ile büyüme arasında bir ilişki olabileceğini düşündürdü. Öğrenciler, bitki sayısının az olması ve deneyin kısa sürmesi nedeniyle sonucu bütün bitkilere genellemek yerine daha uzun bir çalışma önermeyi seçti.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C009",
    title: "Geceleri Kaydedilen Işık",
    domain: "Bilim tarihi ve arşiv",
    body: "Bir gözlemevi, yıllar önce farklı gecelerde kaydedilmiş gökyüzü notlarını dijital arşive aktardı. Notlarda gözlem saati, kullanılan araç ve gökyüzünde görülen parlak noktaların konumu yer alıyordu. Bazı sayfalarda hava koşulları yazılmadığı için kayıtlar eksik kaldı.\n\nArşiv ekibi aynı gecenin farklı gözlemciler tarafından yazılmış notlarını karşılaştırdı. Birbirine uyan konumlar güvenilir bir başlangıç sağladı; ancak tek bir notta geçen sıra dışı bir ifade hemen kesin keşif olarak kabul edilmedi. Ekip, eski araçların ölçüm hassasiyetini de hesaba kattı.\n\nÇalışmanın amacı yeni bir gök cismi ilan etmek değil, geçmiş gözlemleri karşılaştırılabilir hâle getirmekti. Ekip, eksik bilgileri işaretleyerek arşivi ileride yapılacak araştırmalara açık bıraktı.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C010",
    title: "Mahalle Sözcüklerinin Haritası",
    domain: "Dil ve iletişim",
    body: "Bir gençlik merkezi, aynı nesne için mahallede kullanılan farklı sözcükleri belgelemek üzere gönüllülerden kısa kayıtlar topladı. Gönüllüler, sözcüğü hangi cümlede duyduklarını ve konuşanın hangi yaş grubunda olduğunu not etti. Amaç, bir kullanımın doğru ya da yanlış olduğunu ilan etmek değil, dildeki çeşitliliği görünür kılmaktı.\n\nEkip, benzer sesleri tek bir sözcük sanmamak için kayıtları birkaç kişiyle birlikte dinledi. Yazılışından emin olunmayan örnekleri ayrı bir listeye aldı. Ayrıca bir sözcüğün yalnızca tek bir kayıtta görülmesinin yaygınlık kanıtı olmadığını belirtti.\n\nOrtaya çıkan harita, sözcüklerin mahalleler arasında kesin sınırlarla ayrılmadığını gösterdi. Bazı kullanımlar komşu bölgelerde de duyuluyor, bazıları ise belirli bir arkadaş grubunda kalıyordu. Bu nedenle ekip, haritayı tamamlanmış bir sözlük değil, geliştirilecek bir arşiv olarak sundu.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C011",
    title: "Kumulların Gece Işığı",
    domain: "Kıyı ekolojisi",
    body: "Kıyıdaki kumullarda yaşayan bazı böcekler ve gece etkinleşen canlılar, yönlerini gökyüzünün doğal ışığına göre bulur. Sahile kurulan güçlü lambalar bu canlıların hareket rotasını değiştirebilir. Bir araştırma ekibi, farklı ışık düzeylerine sahip üç kıyı kesiminde izleri ve canlı yoğunluğunu kaydetti.\n\nEkip, lambaların bulunduğu alanlarda canlıların kıyıdan içeriye yönelmek yerine ışık çevresinde toplandığını gözledi. Fakat sonuçların yalnızca aydınlatmadan kaynaklandığını söylemek için rüzgâr, insan hareketliliği ve kumun nemi gibi değişkenleri de izledi.\n\nRapor, bütün ışıkların aynı anda kaldırılmasını önermek yerine daha sıcak renkli, düşük yönlü ve zaman ayarlı aydınlatma seçeneklerini karşılaştırdı. Böylece hem güvenlik ihtiyacını hem de canlıların gece davranışını birlikte değerlendiren bir yaklaşım benimsendi.",
    sourceMetadata: SOURCE_METADATA,
  },
  {
    contentId: "PLV1-C012",
    title: "Haritadaki Görünmeyen Ayrıntı",
    domain: "Haritalama ve veri yorumu",
    body: "Bir ekip, aynı vadinin iki farklı ölçekle hazırlanmış haritalarını karşılaştırdı. Büyük ölçekli harita, patikaların kıvrımlarını ve küçük köprüleri ayrıntılı biçimde gösteriyordu. Daha küçük ölçekli harita ise bütün vadiyi tek sayfaya sığdırıyor, fakat bazı dar yolları göstermiyordu.\n\nEkip, ikinci haritanın hatalı olduğunu söylemedi. Haritanın amacı geniş alanı hızlıca görmekse ayrıntıların elenmesi okunabilirliği artırabilirdi. Ancak acil bir yürüyüş rotası seçilecekse küçük köprülerin ve dar geçitlerin ayrıca kontrol edilmesi gerekiyordu.\n\nSonuçta harita seçiminin tek bir “en iyi” cevabı olmadığı belirtildi. Kullanıcının amacı, bakılan alanın büyüklüğü ve ihtiyaç duyulan ayrıntı düzeyi birlikte değerlendirilmeliydi.",
    sourceMetadata: SOURCE_METADATA,
  },
];

const RAW_QUESTIONS: CanonicalPlacementQuestion[] = [
  mc(
    "PLV1-Q001",
    "PLV1-C001",
    "RC_MAIN_IDEA",
    "EASY",
    "Metnin ana düşüncesi aşağıdakilerden hangisidir?",
    [
      "Öğrenciler bütün kumaşların aynı miktarda lif bıraktığını kanıtlamıştır.",
      "Bir gözlemi anlamlandırmak için düzenli ölçüm ve karşılaştırma yapmak gerekir.",
      "Filtre kâğıtları yalnızca suyun rengini değiştirmek için kullanılmıştır.",
      "Tek bir deneme her konuda kesin sonuca ulaşmak için yeterlidir.",
    ],
    "b",
    "Kulüp, tahmini ölçülebilir gözleme dönüştürmüş ve tek denemeyi yeterli görmemiştir.",
    "Ana düşünceyi bulmak için üç paragrafın ortak amacını birleştirmek gerekir.",
    2,
    "Böylece yalnızca bir tahminde bulunmak yerine ölçülebilir bir gözlem elde ettiler.",
    "UNDERSTAND",
  ),
  tf(
    "PLV1-Q002",
    "PLV1-C001",
    "RC_DETAIL",
    "EASY",
    "Ekip, aynı miktarda suyu filtreden geçirerek filtre kâğıtlarını karşılaştırmıştır.",
    true,
    "İkinci paragraf aynı miktarda suyun filtreden geçirildiğini açıkça belirtir.",
    "Detay sorusu, yöntemde kullanılan karşılaştırma koşulunu doğrudan bulmayı ölçer.",
    2,
    "Ekip, aynı miktarda suyu filtreden geçirip filtre kâğıtlarını karşılaştırdı.",
    "RECALL",
  ),
  fill(
    "PLV1-Q003",
    "PLV1-C001",
    "RC_INFERENCE",
    "EASY",
    "Öğrenciler gözlemlerini daha güvenilir hâle getirmek için yeni ___ yapmayı planlamıştır.",
    "blank-1",
    ["ölçümler", "ölçüm"],
    "Üçüncü paragraf, farklı kumaşlar ve daha uzun sürelerle yeni ölçümler yapılacağını söyler.",
    "Cevap, önerilen sonraki adımdan doğrudan çıkarılır; metinde aynen geçen bir kavramdır.",
    3,
    "farklı kumaşlar ve daha uzun sürelerle yeni ölçümler yapmayı planladı.",
    "INFER",
  ),
  tf(
    "PLV1-Q004",
    "PLV1-C002",
    "RC_MAIN_IDEA",
    "EASY",
    "Kütüphanedeki düzenleme, hareketli işler ile sessiz çalışmayı aynı alanda daha iyi ayırmayı amaçlamıştır.",
    true,
    "Masalar ve kitap arabaları yeniden düzenlenerek iki farklı kullanım alanı oluşturulmuştur.",
    "Ana düşünce, değişikliklerin tek tek ayrıntısından çok ortak amacını kavramayı gerektirir.",
    2,
    "Yeni düzende girişe yakın bölüm hareketli işler için, pencere kenarı ise sessiz çalışma için ayrıldı.",
    "UNDERSTAND",
  ),
  mc(
    "PLV1-Q005",
    "PLV1-C002",
    "RC_DETAIL",
    "EASY",
    "Görevli kitap arabalarını nereye almıştır?",
    ["Pencere önüne", "Girişin ortasına", "Duvar kenarına", "Bahçenin dışına"],
    "c",
    "İlk paragrafta kitap arabalarının duvar kenarına alındığı belirtilir.",
    "Soru, düzenleme sırasında yapılan somut değişikliği bulmayı ölçer.",
    1,
    "kitap arabalarını duvar kenarına aldı.",
    "RECALL",
  ),
  matching(
    "PLV1-Q006",
    "PLV1-C002",
    "RC_INFERENCE",
    "EASY",
    "Metindeki düzenlemeleri amaçlarıyla eşleştiriniz.",
    ["Alçak raflar kullanmak", "Pencere kenarını ayırmak"],
    ["İki alanın da görünürlüğünü korumak", "Sessiz çalışma alanı oluşturmak"],
    [
      [1, 1],
      [2, 2],
    ],
    "Alçak raflar görevlinin görüşünü kapatmaz; pencere kenarı sessiz çalışma için ayrılmıştır.",
    "Neden-sonuç ilişkisini iki farklı ayrıntı arasında kurmak basit bir çıkarım gerektirir.",
    2,
    "Bölümleri ayırmak için yüksek duvarlar yerine alçak raflar kullanıldı; böylece görevli iki alanı da görebiliyordu.",
    "INFER",
  ),
  fill(
    "PLV1-Q007",
    "PLV1-C003",
    "RC_MAIN_IDEA",
    "EASY",
    "Öğrenciler bahçedeki canlıları gözlemleyerek bitkilerin hangi koşullarda daha çok ziyaret edildiğini ___ çalışmıştır.",
    "blank-1",
    ["anlamaya", "anlamak"],
    "Metin, canlıları sayıp zaman ve bitki bilgisi kaydederek ziyaret düzenini anlamaya çalıştıklarını anlatır.",
    "Ana düşünceyi tek bir canlıya değil, gözlem çalışmasının bütününe bağlar.",
    2,
    "Öğrenciler her gözlemde saati, bitkinin adını ve gördükleri canlıyı not etti.",
    "UNDERSTAND",
  ),
  matching(
    "PLV1-Q008",
    "PLV1-C003",
    "RC_DETAIL",
    "EASY",
    "Gözlem kayıtlarındaki bilgileri eşleştiriniz.",
    ["Saat", "Görülen canlı"],
    [
      "Ziyaret zamanını karşılaştırmaya yardım eder",
      "Bahçedeki ziyaretçiyi sınıflandırmaya yardım eder",
    ],
    [
      [1, 1],
      [2, 2],
    ],
    "Saat ziyaret zamanını, görülen canlı ise ziyaretçinin türünü kaydetmek için kullanılmıştır.",
    "Detayları metinde verilen kayıt alanlarıyla eşleştirme becerisini ölçer.",
    2,
    "Öğrenciler her gözlemde saati, bitkinin adını ve gördükleri canlıyı not etti.",
    "RECALL",
  ),
  mc(
    "PLV1-Q009",
    "PLV1-C003",
    "RC_INFERENCE",
    "EASY",
    "Kulübün çalışmayı başka günlerde tekrarlamak istemesinin en güçlü nedeni nedir?",
    [
      "Bütün çiçekleri koparmak istemeleri",
      "Tek bir gözlemin farklı koşulları temsil etmeyebileceği",
      "Bahçedeki bitkilerin adlarını unutmuş olmaları",
      "Kelebeklerin hiç gözlemlenmemesi",
    ],
    "b",
    "Metin, hava ve çiçeklerin açık olması gibi koşulların sonucu etkileyebileceğini söyler.",
    "Açıkça verilen iki sınırlamayı birleştirerek araştırma kararının nedenini çıkarmayı gerektirir.",
    3,
    "Hava, çiçeklerin açık olması ve çevredeki başka bitkiler sonucu etkileyebileceği için çalışmayı başka günlerde tekrarlamayı kararlaştırdı.",
    "INFER",
  ),
  matching(
    "PLV1-Q010",
    "PLV1-C004",
    "RC_MAIN_IDEA",
    "EASY",
    "Bulut günlüğündeki uygulamaları amaçlarıyla eşleştiriniz.",
    ["Fotoğraf çekmek", "Sabah ve akşam gözlemi eklemek"],
    ["Gökyüzü durumunu görsel olarak kaydetmek", "Günün farklı zamanlarını karşılaştırmak"],
    [
      [1, 1],
      [2, 2],
    ],
    "Fotoğraflar görsel kayıt sağlar; ek zamanlar gün içindeki değişimi karşılaştırmayı sağlar.",
    "Metnin veri toplama yöntemlerini ortak araştırma amacıyla ilişkilendirmeyi ölçer.",
    1,
    "her öğle vakti gökyüzünün fotoğrafını çekti.",
    "UNDERSTAND",
  ),
  fill(
    "PLV1-Q011",
    "PLV1-C004",
    "RC_DETAIL",
    "EASY",
    "Öğrenciler fotoğrafların yanına rüzgârın ___ da yazmıştır.",
    "blank-1",
    ["yönünü", "yonunu"],
    "İlk paragraf kaydedilen bilgileri sayarken rüzgârın yönünü açıkça verir.",
    "Soru, paragraftaki belirli veri alanını metinden çekmeyi ölçer.",
    1,
    "Fotoğrafların yanına bulutların kapladığı alanı, rüzgârın yönünü ve o gün yağmur yağıp yağmadığını yazdı.",
    "RECALL",
  ),
  tf(
    "PLV1-Q012",
    "PLV1-C004",
    "RC_INFERENCE",
    "EASY",
    "Metindeki günlüğün, tek başına kesin hava tahmini yapmak için yeterli olmadığı sonucuna varılabilir.",
    true,
    "Gözlemler yalnızca öğle saatlerinde yapılmıştır ve bazı benzer günlerde yağmur görülmemiştir.",
    "Sınırlı veri zamanını ve karışık sonucu birlikte değerlendirerek ölçümün sınırını çıkarmayı gerektirir.",
    3,
    "Günlük, tek başına hava tahmini yapmak için yeterli değildi; ölçümler yalnızca öğle saatlerinde yapılmıştı.",
    "INFER",
  ),
  mc(
    "PLV1-Q013",
    "PLV1-C005",
    "RC_MAIN_IDEA",
    "MEDIUM",
    "Bisiklet istasyonlarıyla ilgili çalışmanın temel amacı nedir?",
    [
      "Bütün istasyonları aynı büyüklükte yapmak",
      "Bisiklet kullanımındaki zaman ve konum değişimini anlayarak dağıtımı düzenlemek",
      "Parkın yanındaki istasyonu kapatmak",
      "Hava durumunu bisiklet sayısından bağımsız incelemek",
    ],
    "b",
    "Ekip, istasyon kullanımını farklı zaman ve koşullarla inceleyip bisikletleri değişime göre taşımayı önermiştir.",
    "Ana fikir, veri toplama ayrıntılarını son öneriyle ilişkilendirmeyi gerektirir.",
    3,
    "Ekip, bisikletleri gün içindeki değişime göre taşımayı önerdi.",
    "UNDERSTAND",
  ),
  tf(
    "PLV1-Q014",
    "PLV1-C005",
    "RC_DETAIL",
    "MEDIUM",
    "Araştırma ekibi yalnızca istasyonlardaki toplam bisiklet sayısını kaydetmiştir.",
    false,
    "Saat, hava durumu ve çevredeki yollar da tabloya eklenmiştir.",
    "Doğrudan söylenenleri ayırt ederek metnin kapsamlı veri toplama yöntemini ölçer.",
    2,
    "Araştırma ekibi yalnızca toplam bisiklet sayısını toplamakla yetinmedi.",
    "RECALL",
  ),
  fill(
    "PLV1-Q015",
    "PLV1-C005",
    "RC_INFERENCE",
    "MEDIUM",
    "Veriler, her istasyona gün boyunca aynı sayıda bisiklet göndermenin ___ bir çözüm olmayacağını göstermiştir.",
    "blank-1",
    ["dengeli"],
    "İstasyon yoğunluğu saatlere göre değiştiği için sabit dağıtımın bütün gün dengeli olmayacağı çıkarılır.",
    "İlk öneri ile verilerin gösterdiği sınırlamayı birleştiren orta düzey bir çıkarımdır.",
    3,
    "bu önerinin bazı saatlerde işe yarayacağını, ancak bütün gün için dengeli bir çözüm olmayacağını gösterdi.",
    "INFER",
  ),
  tf(
    "PLV1-Q016",
    "PLV1-C006",
    "RC_MAIN_IDEA",
    "MEDIUM",
    "Metin, deniz çayırları ile canlı çeşitliliği arasındaki ilişkiyi incelerken başka çevresel etkenleri de dikkate almaktadır.",
    true,
    "Ekip; akıntı, derinlik, zemin ve su berraklığı gibi etkenleri de kaydetmiştir.",
    "Ana fikri, ilk gözlem ile raporun temkinli yorumunu birlikte okuyarak bulmayı gerektirir.",
    3,
    "akıntı, derinlik ve zeminin yapısı gibi başka etkenlerin birlikte incelenmesi gerektiği vurgulandı.",
    "UNDERSTAND",
  ),
  mc(
    "PLV1-Q017",
    "PLV1-C006",
    "RC_DETAIL",
    "MEDIUM",
    "Araştırmacılar karşılaştırma yapmak için her alanda neyi aynı tutmuştur?",
    ["Gözlem saatini", "Alanların büyüklüğünü", "Canlı türlerini", "Akıntının yönünü"],
    "b",
    "Üç farklı noktada aynı büyüklükte alanlar belirlenmiştir.",
    "Yöntem paragrafındaki kontrol edilen değişkeni bulmayı ölçer.",
    2,
    "Araştırmacılar üç farklı noktada aynı büyüklükte alanlar belirledi.",
    "RECALL",
  ),
  matching(
    "PLV1-Q018",
    "PLV1-C006",
    "RC_INFERENCE",
    "MEDIUM",
    "Metindeki bulguları yorumlarla eşleştiriniz.",
    [
      "Çayırlı alanlarda küçük balıkların daha sık görülmesi",
      "Çıplak kumlu alanlarda da canlıların bulunması",
    ],
    [
      "Çayırların saklanma alanı sağlıyor olabileceği",
      "Çayırların tek açıklama olduğunun kesinleşmediği",
    ],
    [
      [1, 1],
      [2, 2],
    ],
    "Çayırlı alanlardaki yoğunluk olası saklanma alanını düşündürür; kumlu alanlardaki canlılar tek neden iddiasını sınırlar.",
    "İki kanıtın araştırma sonucunu nasıl sınırladığını yorumlamayı ölçer.",
    3,
    "Çıplak kum bulunan bazı alanlarda da canlılar vardı; fakat türlerin dağılımı çayırlı alanlardan farklıydı.",
    "INFER",
  ),
  fill(
    "PLV1-Q019",
    "PLV1-C007",
    "RC_MAIN_IDEA",
    "MEDIUM",
    "Müze, sesli rehberi ziyaretçinin temel bilgiye hızlı ulaşmasını ve isteyenin ayrıntıya geçmesini sağlayacak biçimde ___ etmiştir.",
    "blank-1",
    ["düzenlemiştir", "yeniden düzenlemiştir"],
    "Ekip açıklamaları kısaltmış ve ayrıntılı bilgi için ayrı bir düğme eklemiştir.",
    "Metindeki sorun, değişiklik ve sonuç zincirini tek cümlede özetlemeyi gerektirir.",
    2,
    "Ekip, açıklamaları kısaltıp ayrıntılı bilgiye ayrı bir düğmeyle ulaşılmasını sağladı.",
    "UNDERSTAND",
  ),
  matching(
    "PLV1-Q020",
    "PLV1-C007",
    "RC_DETAIL",
    "MEDIUM",
    "Sesli rehberin verdiği bilgi türlerini metindeki örneklerle eşleştiriniz.",
    ["Eserin adı", "Eserin malzemesi", "Sergideki konumu"],
    [
      "Nesnenin hangi adla tanındığı",
      "Nesnenin hangi maddeden yapıldığı",
      "Nesnenin salondaki yeri",
    ],
    [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
    "İlk paragraf üç bilgi türünü de aynı sırayla açıklar.",
    "Ayrıntıları yeniden ifade edilmiş karşılıklarıyla eşleştirmeyi ölçer.",
    1,
    "Açıklamalar eserin adı, yapıldığı malzeme ve sergideki konumu hakkında bilgi veriyordu.",
    "RECALL",
  ),
  mc(
    "PLV1-Q021",
    "PLV1-C007",
    "RC_INFERENCE",
    "MEDIUM",
    "Müzenin uygulamayı eserlerin fiziksel incelemesini tamamen kaldırmayacak biçimde tasarlamasının nedeni nedir?",
    [
      "Ziyaretçilerin hiçbir açıklama dinlememesi",
      "Sesli açıklamanın sergi deneyimini destekleyen bir araç olması",
      "Eserlerin sergi salonundan çıkarılması",
      "Bütün açıklamaların aynı uzunlukta kalması",
    ],
    "b",
    "Son paragraf uygulamanın temel bilgiyi desteklediğini, eserlerin fiziksel incelenmesinin yerine geçmediğini söyler.",
    "Sonuç paragrafındaki destekleme ve yerine geçmeme ilişkisini yorumlar.",
    3,
    "uygulamanın sergi deneyimini desteklediğini; eserlerin yerini ve fiziksel incelemeyi tamamen ortadan kaldırmadığını belirtti.",
    "INFER",
  ),
  matching(
    "PLV1-Q022",
    "PLV1-C008",
    "RC_MAIN_IDEA",
    "MEDIUM",
    "Deneydeki uygulamaları kontrol amaçlarıyla eşleştiriniz.",
    ["Bitkileri eşit ışık alan rafa koymak", "Saksıların yerini değiştirmemek"],
    ["Işık koşullarını benzer tutmak", "Yer değişiminin sonucu etkilemesini önlemek"],
    [
      [1, 1],
      [2, 2],
    ],
    "Eşit ışık rafı grupları karşılaştırır; saksıları sabit tutmak ek bir ışık farkını önler.",
    "Deney tasarımındaki iki önlemi çalışmanın ana amacıyla ilişkilendirir.",
    2,
    "Saksıların yerini değiştirmediler; çünkü ışık farkının sonuçları etkilemesini istemiyorlardı.",
    "UNDERSTAND",
  ),
  fill(
    "PLV1-Q023",
    "PLV1-C008",
    "RC_DETAIL",
    "MEDIUM",
    "Öğrenciler her hafta yaprak sayısının yanında toprağın ___ da kaydetmiştir.",
    "blank-1",
    ["nemini", "nem"],
    "İkinci paragraf kaydedilen üç ölçümden biri olarak toprağın nemini verir.",
    "Birden fazla ölçüm arasından istenen somut ayrıntıyı seçmeyi ölçer.",
    2,
    "Her hafta yaprak sayısını, toprağın nemini ve bitkilerin boyunu kaydettiler.",
    "RECALL",
  ),
  tf(
    "PLV1-Q024",
    "PLV1-C008",
    "RC_INFERENCE",
    "MEDIUM",
    "Öğrenciler deney kısa sürdüğü için sonuçlarını bütün bitkilere kesin biçimde genellememiştir.",
    true,
    "Metin, bitki sayısının azlığını ve sürenin kısalığını sınırlama olarak belirtir.",
    "Araştırmanın örneklem ve süre sınırlamasının sonuç yorumuna etkisini çıkarır.",
    3,
    "bitki sayısının az olması ve deneyin kısa sürmesi nedeniyle sonucu bütün bitkilere genellemek yerine",
    "INFER",
  ),
  mc(
    "PLV1-Q025",
    "PLV1-C009",
    "RC_MAIN_IDEA",
    "HARD",
    "Arşiv ekibinin çalışması en iyi nasıl özetlenir?",
    [
      "Eksik kayıtları yok sayarak yeni bir keşif ilan etmek",
      "Geçmiş gözlemleri kaynak sınırlılıklarını işaretleyerek karşılaştırılabilir hâle getirmek",
      "Yalnızca en sıra dışı notu doğru kabul etmek",
      "Eski araçlarla yapılan bütün ölçümleri geçersiz saymak",
    ],
    "b",
    "Ekip kayıtları karşılaştırmış, araç ve eksik bilgi sınırlılıklarını işaretleyerek arşivi araştırmaya açık bırakmıştır.",
    "Ana fikir, amaç, yöntem ve temkinli sonuç arasındaki gerilimi birlikte değerlendirmeyi gerektirir.",
    3,
    "eksik bilgileri işaretleyerek arşivi ileride yapılacak araştırmalara açık bıraktı.",
    "INFER",
  ),
  tf(
    "PLV1-Q026",
    "PLV1-C009",
    "RC_DETAIL",
    "HARD",
    "Arşiv ekibi eski notlarda hava koşullarının her sayfada bulunduğunu belirtmiştir.",
    false,
    "Bazı sayfalarda hava koşullarının yazılmadığı açıkça söylenir.",
    "Benzer görünen iki ayrıntıyı ayırarak kayıtların eksikliği hakkındaki bilgiyi ölçer.",
    1,
    "Bazı sayfalarda hava koşulları yazılmadığı için kayıtlar eksik kaldı.",
    "RECALL",
  ),
  fill(
    "PLV1-Q027",
    "PLV1-C009",
    "RC_INFERENCE",
    "HARD",
    "Tek bir nottaki sıra dışı ifadenin hemen kesin keşif sayılmaması, araştırmacıların ___ doğrulamayı tercih ettiğini gösterir.",
    "blank-1",
    ["karşılaştırmalı", "karşılaştırarak"],
    "Ekip farklı gözlemcilerin notlarını karşılaştırmış ve tek kaynağı yeterli görmemiştir.",
    "Tek kaynak, uyumlu kayıtlar ve araç hassasiyeti arasındaki kanıt ağırlığını yorumlamayı gerektirir.",
    2,
    "tek bir notta geçen sıra dışı bir ifade hemen kesin keşif olarak kabul edilmedi.",
    "INFER",
  ),
  tf(
    "PLV1-Q028",
    "PLV1-C010",
    "RC_MAIN_IDEA",
    "HARD",
    "Dil arşivinin amacı, mahallelerdeki kullanımları tek bir doğru sözcüğe indirgemektir.",
    false,
    "Amaç doğru-yanlış kararı vermek değil, dil çeşitliliğini görünür kılmaktır.",
    "Metnin amacı ile reddettiği yaklaşımı ayırt etmeyi ölçer.",
    1,
    "Amaç, bir kullanımın doğru ya da yanlış olduğunu ilan etmek değil, dildeki çeşitliliği görünür kılmaktı.",
    "INFER",
  ),
  mc(
    "PLV1-Q029",
    "PLV1-C010",
    "RC_DETAIL",
    "HARD",
    "Ekip, yazılışından emin olunmayan örnekleri nasıl ele almıştır?",
    [
      "Hepsini yaygın sözcük kabul etmiştir.",
      "Onları ayrı bir listeye almıştır.",
      "Kayıtları başka mahalleye taşımıştır.",
      "Örnekleri arşivden tamamen silmiştir.",
    ],
    "b",
    "İkinci paragraf, yazılışından emin olunmayan örneklerin ayrı listelendiğini söyler.",
    "Metindeki veri temizleme ve belirsizlik işaretleme adımını bulmayı ölçer.",
    2,
    "Yazılışından emin olunmayan örnekleri ayrı bir listeye aldı.",
    "RECALL",
  ),
  matching(
    "PLV1-Q030",
    "PLV1-C010",
    "RC_INFERENCE",
    "HARD",
    "Arşivdeki bulguları doğru yorum ilkeleriyle eşleştiriniz.",
    [
      "Tek kayıtta görülen sözcük",
      "Komşu bölgelerde de duyulan kullanım",
      "Emin olunmayan yazılış",
    ],
    [
      "Yaygınlık kanıtı olarak tek başına yeterli değildir",
      "Kesin mahalle sınırı oluşturmaz",
      "Ayrı listede tutulmalıdır",
    ],
    [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
    "Metin tek kaydın yaygınlık kanıtı olmadığını, kullanımların sınırlarla kesin ayrılmadığını ve belirsiz yazılışların ayrıldığını belirtir.",
    "Üç ayrı sınırlama cümlesini doğru ilkeye bağlayan çok adımlı bir çıkarımdır.",
    2,
    "bir sözcüğün yalnızca tek bir kayıtta görülmesinin yaygınlık kanıtı olmadığını belirtti.",
    "INFER",
  ),
  fill(
    "PLV1-Q031",
    "PLV1-C011",
    "RC_MAIN_IDEA",
    "HARD",
    "Rapor, kıyı aydınlatmasını değerlendirirken güvenlik ihtiyacı ile canlıların gece davranışını birlikte ___ bir çözüm aramıştır.",
    "blank-1",
    ["dengeleyen", "değerlendiren"],
    "Son paragraf, aydınlatmayı tamamen kaldırmak yerine iki ihtiyacı birlikte değerlendiren seçenekleri karşılaştırır.",
    "Birbiriyle yarışan iki amacı ve önerilen politika yaklaşımını sentezlemeyi gerektirir.",
    3,
    "hem güvenlik ihtiyacını hem de canlıların gece davranışını birlikte değerlendiren bir yaklaşım benimsendi.",
    "INFER",
  ),
  matching(
    "PLV1-Q032",
    "PLV1-C011",
    "RC_DETAIL",
    "HARD",
    "Önerilen aydınlatma seçeneklerini özellikleriyle eşleştiriniz.",
    ["Renk", "Yön", "Zaman"],
    ["Daha sıcak", "Düşük ve belirli alana dönük", "Belirli saatlerde çalışan"],
    [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
    "Rapor seçenekleri sıcak renkli, düşük yönlü ve zaman ayarlı olarak sıralar.",
    "Birden fazla niteleyiciyi doğru kavramla eşleştirmeyi ölçer.",
    3,
    "daha sıcak renkli, düşük yönlü ve zaman ayarlı aydınlatma seçeneklerini karşılaştırdı.",
    "RECALL",
  ),
  mc(
    "PLV1-Q033",
    "PLV1-C011",
    "RC_INFERENCE",
    "HARD",
    "Ekip neden lambaları tamamen kaldırmak yerine farklı aydınlatma seçeneklerini karşılaştırmıştır?",
    [
      "Gece gözlemi yapmayı bırakmak için",
      "İnsanların güvenlik ihtiyacını ve canlıların yön bulmasını birlikte korumak için",
      "Kumun nemini artırmak için",
      "Bütün canlıları ışık çevresinde toplamak için",
    ],
    "b",
    "Ekip, güvenliği korurken ışığın canlıların rotasına etkisini azaltabilecek seçenekleri aramıştır.",
    "Önerinin nedenini, önceki sorun ve son paragraftaki çözüm arasında kurar.",
    3,
    "Böylece hem güvenlik ihtiyacını hem de canlıların gece davranışını birlikte değerlendiren bir yaklaşım benimsendi.",
    "INFER",
  ),
  matching(
    "PLV1-Q034",
    "PLV1-C012",
    "RC_MAIN_IDEA",
    "HARD",
    "Harita seçimini etkileyen unsurları amaçlarıyla eşleştiriniz.",
    ["Haritanın ölçeği", "Kullanıcının amacı", "İhtiyaç duyulan ayrıntı"],
    [
      "Alanı ve gösterilebilecek ayrıntıyı belirler",
      "Haritanın nasıl kullanılacağını belirler",
      "Dar yollar gibi ayrıntıların gerekli olup olmadığını belirler",
    ],
    [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
    "Metin, ölçeği alan ve ayrıntıyla; amacı kullanım biçimiyle; ihtiyaç duyulan ayrıntıyı rota seçimiyle ilişkilendirir.",
    "Sonuç paragrafındaki üç ölçütü metnin ana karar ilkesiyle birleştirir.",
    3,
    "Kullanıcının amacı, bakılan alanın büyüklüğü ve ihtiyaç duyulan ayrıntı düzeyi birlikte değerlendirilmeliydi.",
    "INFER",
  ),
  fill(
    "PLV1-Q035",
    "PLV1-C012",
    "RC_DETAIL",
    "HARD",
    "Büyük ölçekli harita, küçük köprülerin yanı sıra patikaların ___ da göstermektedir.",
    "blank-1",
    ["kıvrımlarını", "kivrimlarini"],
    "İlk paragraf büyük ölçekli haritanın patika kıvrımlarını ve küçük köprüleri ayrıntılı gösterdiğini belirtir.",
    "Aynı cümledeki iki somut harita ayrıntısından isteneni ayırt etmeyi ölçer.",
    1,
    "Büyük ölçekli harita, patikaların kıvrımlarını ve küçük köprüleri ayrıntılı biçimde gösteriyordu.",
    "RECALL",
  ),
  tf(
    "PLV1-Q036",
    "PLV1-C012",
    "RC_INFERENCE",
    "HARD",
    "Metne göre, geniş alanı hızlıca görmek isteyen biri için bazı ayrıntıların haritadan çıkarılması işlevsel olabilir.",
    true,
    "Küçük ölçekli harita bazı ayrıntıları elese de bütün vadiyi tek sayfada görmeyi sağlar.",
    "Ayrıntı kaybının her zaman hata değil, amaca bağlı bir tasarım tercihi olabileceğini çıkarır.",
    2,
    "Haritanın amacı geniş alanı hızlıca görmekse ayrıntıların elenmesi okunabilirliği artırabilirdi.",
    "INFER",
  ),
];

const QUESTION_REVISIONS: Record<
  string,
  { question: CanonicalPlacementQuestion; revisionReason: string }
> = {
  "PLV1-Q003": {
    question: fill(
      "PLV1-Q003",
      "PLV1-C001",
      "RC_INFERENCE",
      "EASY",
      "İlk bulguyu farklı kumaş ve sürelerde yeniden ___ isteyen ekip, tek denemeyi yeterli görmemiştir.",
      "blank-1",
      ["sınamak"],
      "Ekip ilk denemede liflerin bir bölümünü görmüş, ardından farklı kumaş ve sürelerle yeni ölçümler planlamıştır.",
      "İlk deneme ile sonraki ölçüm planını birleştirerek ekibin kanıtı farklı koşullarda sınama tutumunu çıkarır.",
      3,
      "İlk deneme liflerin bir bölümünün tutulduğunu gösterdi. Öğrenciler, tek bir denemeyle kesin sonuca varmak yerine farklı kumaşlar ve daha uzun sürelerle yeni ölçümler yapmayı planladı.",
      "INFER",
    ),
    revisionReason:
      "Açık bir ayrıntıyı sormak yerine ilk bulgu ile sonraki planı birleştiren çıkarıma dönüştürüldü.",
  },
  "PLV1-Q005": {
    question: fill(
      "PLV1-Q005",
      "PLV1-C002",
      "RC_DETAIL",
      "EASY",
      "Görevli, geçiş yolundaki engeli azaltmak için kitap arabalarını ___ almıştır.",
      "blank-1",
      ["duvar kenarına"],
      "İlk paragraf, kitap arabalarının duvar kenarına alındığını açıkça belirtir.",
      "Geçiş yolundaki sorunu ve buna karşı yapılan somut düzenlemeyi birlikte hatırlatır.",
      1,
      "kitap arabalarını duvar kenarına aldı.",
      "RECALL",
    ),
    revisionReason:
      "Q015’in fill-in-the-blank belirsizliği MC’ye dönüştürülürken type dağılımını korumak için bu açık ayrıntı kontrollü fill-in-the-blank biçimine alındı.",
  },
  "PLV1-Q006": {
    question: matching(
      "PLV1-Q006",
      "PLV1-C002",
      "RC_INFERENCE",
      "EASY",
      "Kütüphane düzenlemelerini amaçlarıyla eşleştiriniz.",
      [
        "Masaların yerini değiştirmek",
        "Kitap arabalarını duvar kenarına almak",
        "Girişe yakın bölümü hareketli işler için ayırmak",
        "Alçak raflar kullanmak",
      ],
      [
        "Hareketli kullanımı giriş bölümünde toplamak",
        "Çalışma yolundaki kesilmeyi azaltmak",
        "İki alanın görünürlüğünü korumak",
        "Geçiş alanındaki engeli azaltmak",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "Masaların ve kitap arabalarının yeri geçişi rahatlatır; giriş ve alçak raf düzeni kullanım alanlarını ayırırken görüşü korur.",
      "Dört düzenleme kararını amaçlarıyla ilişkilendirerek basit neden-sonuç çıkarımı yaptırır.",
      1,
      PASSAGES[1]!.body,
      "INFER",
    ),
    revisionReason:
      "İki eşleşmeli trivial yapı yerine dört düzenleme kararını ve amaçlarını ilişkilendirecek şekilde genişletildi.",
  },
  "PLV1-Q007": {
    question: fill(
      "PLV1-Q007",
      "PLV1-C003",
      "RC_MAIN_IDEA",
      "EASY",
      "Bahçedeki canlıları gözlemleyip sonuçları farklı koşulları dikkate alarak yorumlayan kulüp, kanıta dayalı bir ___ yürütmüştür.",
      "blank-1",
      ["araştırma"],
      "Kulüp canlıları saymış, zaman ve bitki bilgisi kaydetmiş, sonucu başka koşullara hemen genellememiştir.",
      "Tek bir gözlem ayrıntısı yerine gözlem, kayıt ve temkinli yorum adımlarının ortak düşüncesini özetletir.",
      2,
      PASSAGES[2]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "Belirli bir araştırma amacını değil, gözlem ve temkinli yorumdan oluşan merkez düşünceyi ölçmek üzere yeniden yazıldı.",
  },
  "PLV1-Q008": {
    question: matching(
      "PLV1-Q008",
      "PLV1-C003",
      "RC_DETAIL",
      "EASY",
      "Gözlem kayıtlarında tutulan bilgileri kullanım amaçlarıyla eşleştiriniz.",
      ["Saat", "Bitkinin adı", "Görülen canlı", "Çiçekleri koparmamak"],
      [
        "Ziyaretçinin türünü kaydetmek",
        "Ziyaret zamanını karşılaştırmak",
        "Canlıları gözlemlemeyi sürdürmek",
        "Hangi bitkinin izlendiğini belirtmek",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "Metin saat, bitki adı ve canlı bilgisinin yazıldığını; çiçeklerin koparılmadan uzaktan sayıldığını belirtir.",
      "Metinde açıkça verilen üç kayıt alanını ve gözleme zarar vermeme ayrıntısını kullanım amacıyla eşleştirir.",
      2,
      PASSAGES[2]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "İki eşleşmeli trivial yapı yerine passage’daki dört somut kayıt ayrıntısını kapsayacak şekilde genişletildi.",
  },
  "PLV1-Q010": {
    question: mc(
      "PLV1-Q010",
      "PLV1-C004",
      "RC_MAIN_IDEA",
      "EASY",
      "Bu gözlem çalışmasının bütününü en doğru özetleyen yargı hangisidir?",
      [
        "Öğle saatinde çekilen tek bir fotoğraf hava durumunu kesin belirler.",
        "Sınırlı zamanlarda toplanan gözlemler karşılaştırmaya yardım eder; ancak tek başına kesin hava tahmini sağlamaz.",
        "Bulutların güzel görünmesi, kayıtların bilimsel olmasından daha önemlidir.",
        "Rüzgârın yönü yağmurun kesin olarak başlayacağını gösterir.",
      ],
      "b",
      "Grup verileri karşılaştırılabilir bulmuş, ancak yalnızca öğle gözlemlerinin kesin tahmin için yeterli olmadığını belirtmiştir.",
      "Üç paragraftaki veri toplama, karışık sonuç ve ölçüm sınırlılığını tek merkez düşüncede birleştirir.",
      2,
      "Verileri yan yana koyunca bulutların art arda geldiği günlerin bazılarında yağmur görüldüğünü, bazılarında ise görülmediğini fark ettiler.\n\nGünlük, tek başına hava tahmini yapmak için yeterli değildi; ölçümler yalnızca öğle saatlerinde yapılmıştı.",
      "UNDERSTAND",
    ),
    revisionReason:
      "Yöntem eşleştirmesi yerine veri toplama ve sınırlı çıkarımın merkez düşüncesini ölçen tek doğru cevaplı MC’ye dönüştürüldü.",
  },
  "PLV1-Q012": {
    question: tf(
      "PLV1-Q012",
      "PLV1-C004",
      "RC_INFERENCE",
      "EASY",
      "Öğle gözlemlerini sabah ve akşam kayıtlarıyla tamamlamak, hava durumunu karşılaştırmayı daha güvenilir kılabilir.",
      true,
      "Grup, yalnız öğle saatlerinde yapılan ölçümlerin sınırlı olduğunu düşünmüş ve sabah-akşam gözlemleri eklemeyi önermiştir.",
      "Ölçüm zamanlarının kapsamı ile daha güvenilir karşılaştırma önerisi arasında sonuç ilişkisi kurar.",
      3,
      "Grup, daha güvenilir bir karşılaştırma için sabah ve akşam gözlemlerini de eklemeyi önerdi.",
      "INFER",
    ),
    revisionReason:
      "Q010’un ana fikir seçenekleriyle doğrudan cevap ipucu oluşturmasını önlemek için aynı çıkarım, ölçüm kapsamı ve karşılaştırma ilişkisi üzerinden yeniden yazıldı.",
  },
  "PLV1-Q013": {
    question: matching(
      "PLV1-Q013",
      "PLV1-C005",
      "RC_MAIN_IDEA",
      "MEDIUM",
      "Bisiklet istasyonları çalışmasının ana düşüncesini destekleyen bulguları sonuçlarıyla eşleştiriniz.",
      [
        "Okula yakın istasyonların sabah boşalması",
        "Park yanındaki istasyonda akşamüstü hareketliliğin artması",
        "Saat, hava durumu ve yolların kaydedilmesi",
        "Aynı sayıda bisiklet gönderme önerisinin sınırlı kalması",
      ],
      [
        "Yoğunluğun yalnız istasyon büyüklüğüyle açıklanmasını sınar",
        "Talebin zamana ve konuma göre değişebildiğini gösterir",
        "Sabit planın sınırını ortaya koyar",
        "Farklı bir konumda farklı zaman yoğunluğu olduğunu gösterir",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "Çalışma; sabah ve öğleden sonra farklarını, park çevresindeki değişimi, eklenen bağlam verilerini ve buna dayalı taşıma önerisini birlikte verir.",
      "Dört bulguyu ortak merkez düşünce olan veriye dayalı ve değişken dağıtımla ilişkilendirir.",
      1,
      PASSAGES[4]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "Ana fikir korunarak, dört kanıtı merkez sonuçla ilişkilendiren matching biçimine dönüştürüldü.",
  },
  "PLV1-Q015": {
    question: mc(
      "PLV1-Q015",
      "PLV1-C005",
      "RC_INFERENCE",
      "MEDIUM",
      "Okula yakın istasyonların sabah boşalıp öğleden sonra dolması, hangi uygulamayı daha makul kılar?",
      [
        "Günün her saatinde her istasyonda aynı sayıda bisiklet tutmayı",
        "Bisikletleri gün içindeki yoğunluğa göre yeniden dağıtmayı",
        "Bisikletleri yalnız park yanındaki istasyona göndermeyi",
        "İstasyonları yalnızca sabah saatlerinde kapatmayı",
      ],
      "b",
      "Sabah ve öğleden sonra yoğunluğu farklı olduğu için bisikletleri günün her saatinde aynı yerde tutmak dengeli olmayabilir; ekip de gün içindeki değişime göre taşımayı önermiştir.",
      "İstasyonlardaki zaman değişimi ile son paragraftaki taşıma önerisini birleştirir; cevap passage’da birebir yazılı değildir.",
      1,
      PASSAGES[4]!.body,
      "INFER",
    ),
    revisionReason:
      "Passage’da doğrudan geçen bir kelimeyi istemek yerine zaman örüntüsünden türeyen eylem cevabı kullanıldı.",
  },
  "PLV1-Q018": {
    question: matching(
      "PLV1-Q018",
      "PLV1-C006",
      "RC_INFERENCE",
      "MEDIUM",
      "Deniz çayırları araştırmasındaki bulguları temkinli yorumlarla eşleştiriniz.",
      [
        "Çayırlı alanlarda küçük balıkların daha sık görülmesi",
        "Çıplak kumlu alanlarda da canlıların bulunması",
        "Üç farklı noktada aynı büyüklükte alanların belirlenmesi",
        "Akıntı, derinlik ve zemin bilgilerinin kaydedilmesi",
      ],
      [
        "Alanlar arası karşılaştırmayı daha tutarlı kılar",
        "Çayırların saklanma alanı sağlıyor olabileceğini düşündürür",
        "Başka etkenlerin sonucu değiştirebileceğini hesaba katar",
        "Çayırların tek açıklama olduğunun kesinleşmediğini gösterir",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "Bulgular, çayırlı alanlardaki yoğunluğu olası saklanma alanıyla ilişkilendirir; kumlu alanlardaki canlılar ve ek değişkenler tek neden yorumunu sınırlar; aynı büyüklükte alanlar karşılaştırmayı düzenler.",
      "Dört veri parçasını tek tek tekrarlamak yerine her birinin araştırma sonucunu nasıl sınırladığını çıkarır.",
      1,
      PASSAGES[5]!.body,
      "INFER",
    ),
    revisionReason:
      "İki eşleşmeli yapı, kanıt ile temkinli bilimsel yorum arasında dört bağlantı kuracak şekilde genişletildi.",
  },
  "PLV1-Q019": {
    question: fill(
      "PLV1-Q019",
      "PLV1-C007",
      "RC_MAIN_IDEA",
      "MEDIUM",
      "Müze, deneme ziyaretlerinden aldığı geri bildirimle sesli rehberi temel bilgiye hızlı ulaşılacak ve ayrıntıya isteğe bağlı geçilecek biçimde ___ etmiştir.",
      "blank-1",
      ["düzenlemiştir"],
      "Ekip açıklamaları kısaltmış ve ayrıntılı bilgi için ayrı bir düğme eklemiştir.",
      "Sorun, yapılan değişiklik ve elde edilen kullanım kolaylığını tek cümlede özetlemeyi gerektirir.",
      2,
      "Ekip, açıklamaları kısaltıp ayrıntılı bilgiye ayrı bir düğmeyle ulaşılmasını sağladı.",
      "UNDERSTAND",
    ),
    revisionReason:
      "Eşdeğer iki fiil kabul eden fill-in-the-blank yapı, tek doğal cevap bırakacak şekilde daraltıldı.",
  },
  "PLV1-Q020": {
    question: matching(
      "PLV1-Q020",
      "PLV1-C007",
      "RC_DETAIL",
      "MEDIUM",
      "Sesli rehberin özelliklerini sağladıkları bilgi veya kullanım kolaylığıyla eşleştiriniz.",
      ["Eserin adı", "Yapıldığı malzeme", "Sergideki konumu", "Ayrıntılı bilgi düğmesi"],
      [
        "Eserin salondaki yerini belirtir",
        "Eserin hangi adla tanındığını belirtir",
        "İsteyenin daha uzun açıklamaya geçmesini sağlar",
        "Eserin fiziksel yapısını belirtir",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "İlk paragraf üç temel bilgi türünü, ikinci paragraf ise ayrıntılı bilgi için ayrı düğmeyi belirtir.",
      "Dört açık ayrıntıyı anlamca eşleştirmeyi ölçer; seçenekler yalnızca soru kökünü tekrar etmez.",
      1,
      PASSAGES[6]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "Üç eşleşmeli yapı, ayrı düğme ayrıntısı eklenerek dört açık bilgi ve işlev bağlantısına genişletildi.",
  },
  "PLV1-Q022": {
    question: matching(
      "PLV1-Q022",
      "PLV1-C008",
      "RC_MAIN_IDEA",
      "MEDIUM",
      "Bitki deneyinin temel yaklaşımını oluşturan uygulamaları amaçlarıyla eşleştiriniz.",
      [
        "Aynı türden dört bitki seçmek",
        "İki farklı sulama aralığı uygulamak",
        "Bitkileri eşit ışık alan rafa koymak",
        "Az bitki ve kısa süreyle yetinmek",
      ],
      [
        "Işık koşulunu olabildiğince sabit tutmak",
        "Bitki türü farkını azaltmak",
        "Sonuçların kapsamını sınırlı tutar",
        "Değişen sulama koşullarını karşılaştırmak",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "Aynı tür ve ışık koşulları karşılaştırmayı düzenler; iki sulama aralığı değişkeni oluşturur; az örnek ve kısa süre genellemeyi sınırlar.",
      "Yöntem ile sonuç sınırlamasını birlikte eşleştirerek deneyin merkez yaklaşımını ölçer.",
      1,
      PASSAGES[7]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "İki eşleşmeli yöntem sorusu, deney tasarımı ve genelleme sınırını birlikte ölçen dört eşleşmeye dönüştürüldü.",
  },
  "PLV1-Q023": {
    question: fill(
      "PLV1-Q023",
      "PLV1-C008",
      "RC_DETAIL",
      "MEDIUM",
      "Öğrenciler her hafta yaprak sayısının yanında toprağın ___ ve bitkilerin boyunu da kaydetmiştir.",
      "blank-1",
      ["nemini"],
      "İkinci paragraf yaprak sayısı, toprağın nemi ve bitkilerin boyunun kaydedildiğini açıkça söyler.",
      "Üç ölçüm arasından istenen ayrıntıyı doğal ve tekil bir tamlamayla buldurur.",
      2,
      "Her hafta yaprak sayısını, toprağın nemini ve bitkilerin boyunu kaydettiler.",
      "RECALL",
    ),
    revisionReason:
      "Geçersiz ve eksik tamlamayı kaldırıp tek doğal ve dilbilgisel olarak doğru cevaba indirildi.",
  },
  "PLV1-Q026": {
    question: tf(
      "PLV1-Q026",
      "PLV1-C009",
      "RC_DETAIL",
      "HARD",
      "Arşiv ekibi tek bir sıra dışı notu değerlendirirken farklı gözlemci kayıtlarını ve eski araçların ölçüm hassasiyetini birlikte dikkate almıştır.",
      true,
      "Ekip farklı gözlemci notlarını karşılaştırmış, tek bir sıra dışı ifadeyi hemen kesin keşif saymamış ve eski araçların ölçüm hassasiyetini hesaba katmıştır.",
      "Tek notun sınırlılığı ile araç hassasiyetini aynı değerlendirme sürecinde birleştiren iki ayrıntıyı buldurur.",
      2,
      PASSAGES[8]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "Her sayfada hava koşulu gibi sıradan bir ayrıntı yerine, karşılaştırmayı etkileyen seçici bir arşiv ayrıntısı kullanıldı.",
  },
  "PLV1-Q027": {
    question: fill(
      "PLV1-Q027",
      "PLV1-C009",
      "RC_INFERENCE",
      "HARD",
      "Eksik hava bilgisi ve tekil gözlem sınırlılığı nedeniyle, arşivdeki bir kayıt yeni bir keşfin ___ olarak sunulmamalıdır.",
      "blank-1",
      ["kesin kanıtı"],
      "Hava koşulları bazı kayıtlarda yoktur ve tek bir sıra dışı ifade hemen keşif kabul edilmemiştir; bu nedenle kayıt kesin kanıt sayılamaz.",
      "Eksik bağlam ile tek kaynağa temkinli yaklaşımı birleştirir; cevap passage’da bu tamlamayla birebir verilmez.",
      1,
      PASSAGES[8]!.body,
      "INFER",
    ),
    revisionReason:
      "Doğrudan bir yöntem adını istemek yerine iki sınırlamayı birleştiren koşullu kanıt çıkarımına dönüştürüldü.",
  },
  "PLV1-Q028": {
    question: tf(
      "PLV1-Q028",
      "PLV1-C010",
      "RC_MAIN_IDEA",
      "HARD",
      "Dil arşivinin temel yaklaşımı, farklı kullanımları belirsizlikleriyle birlikte belgelemek ve tek bir doğruya indirgememektir.",
      true,
      "Ekip doğru-yanlış kararı vermek yerine çeşitliliği görünür kılmış, emin olunmayan örnekleri ayırmış ve haritayı geliştirilecek arşiv olarak sunmuştur.",
      "Amaç, belirsizlik yönetimi ve sonuçların sınırlı sunulmasını üç paragraftan sentezletir.",
      1,
      PASSAGES[9]!.body,
      "INFER",
    ),
    revisionReason:
      "Doğrudan ters cümleli literal T/F yerine arşivin amaç, yöntem ve sınırlılıklarını sentezleyen ana fikir ifadesi kullanıldı.",
  },
  "PLV1-Q029": {
    question: mc(
      "PLV1-Q029",
      "PLV1-C010",
      "RC_DETAIL",
      "HARD",
      "Arşiv ekibinin bir sözcüğün yaygınlığı hakkında temkinli davranmasının metindeki iki dayanağı hangisidir?",
      [
        "Birden fazla kişinin kayıtları dinlemesi ve benzer sesleri karşılaştırması",
        "Tek bir kaydın yaygınlık kanıtı sayılmaması ve bazı yazılışların ayrı tutulması",
        "Gönüllülerin sözcüğü hangi cümlede duyduğunu ve yaş grubunu not etmesi",
        "Kullanımların komşu bölgelerde de duyulması ve haritanın dijital olması",
      ],
      "b",
      "İkinci paragraf hem tek kaydın yaygınlık için yeterli olmadığını hem de emin olunmayan yazılışların ayrı tutulduğunu söyler.",
      "İki ayrı ayrıntıyı aynı seçenekte birleştirerek tek bir metin detayı değil, kanıt çiftini seçtirir.",
      2,
      PASSAGES[9]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "Tek bir işlem ayrıntısı yerine yaygınlık konusunda temkinli olmayı açıklayan iki ayrı açık ayrıntıyı birleştirecek biçimde yazıldı.",
  },
  "PLV1-Q030": {
    question: matching(
      "PLV1-Q030",
      "PLV1-C010",
      "RC_INFERENCE",
      "HARD",
      "Dil arşivindeki bulguları bu bulguların izin verdiği yorumlarla eşleştiriniz.",
      [
        "Tek kayıtta görülen sözcük",
        "Benzer seslerin birkaç kişiyle dinlenmesi",
        "Emin olunmayan yazılış",
        "Komşu bölgelerde de duyulan kullanım",
      ],
      [
        "Belirsizlik açıkça işaretlenir",
        "Yaygınlık kanıtı olarak tek başına yeterli değildir",
        "Kesin mahalle sınırı oluşturmaz",
        "Yanlış birleştirme olasılığını azaltır",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "Tek kayıt yaygınlık için yeterli değildir; birkaç kişiyle dinlemek ses ayrımını destekler; belirsiz yazılışlar ayrılır; komşu kullanımlar sınırların kesin olmadığını gösterir.",
      "Dört kanıtı doğrudan tekrar etmek yerine her birinden çıkarılabilecek sınırlı yorumu kurdurur.",
      1,
      PASSAGES[9]!.body,
      "INFER",
    ),
    revisionReason:
      "Üç eşleşmeli paraphrase yerine dört kanıt-yorum bağlantısı ve passage’ın sınırlılıklarını birlikte ölçen yapı kullanıldı.",
  },
  "PLV1-Q031": {
    question: fill(
      "PLV1-Q031",
      "PLV1-C011",
      "RC_MAIN_IDEA",
      "HARD",
      "Rapor, güvenlik ihtiyacı ile canlıların gece davranışını birlikte gözeten bir yaklaşımı ___.",
      "blank-1",
      ["benimsemiştir"],
      "Rapor ışıkları tamamen kaldırmak yerine renk, yön ve zaman seçeneklerini karşılaştırarak iki ihtiyacı birlikte ele almıştır.",
      "Sorun, değişkenler ve çözüm önerisini birleştiren tek bir merkez fiille özetletir.",
      3,
      PASSAGES[10]!.body,
      "INFER",
    ),
    revisionReason:
      "İki farklı anlam taşıyan kabul edilebilir cevaplar kaldırılıp, tek doğal ve merkez düşünceyi tamamlayan fiil seçildi.",
  },
  "PLV1-Q032": {
    question: matching(
      "PLV1-Q032",
      "PLV1-C011",
      "RC_DETAIL",
      "HARD",
      "Kıyı aydınlatması araştırmasındaki ayrıntıları işlevleriyle eşleştiriniz.",
      [
        "Canlıların ışık çevresinde toplanması",
        "Rüzgâr, insan hareketliliği ve kumun nemi",
        "Farklı ışık düzeylerine sahip üç kıyı kesimi",
        "Sıcak renkli, düşük yönlü ve zaman ayarlı seçenekler",
      ],
      [
        "Karşılaştırma yapılan gözlem alanları",
        "Aydınlatmayla ilişkili olabilecek davranış gözlemi",
        "Etkisini azaltmak için karşılaştırılan çözümler",
        "Alternatif açıklamaları değerlendirmek için izlenen değişkenler",
      ],
      [
        [1, 2],
        [2, 4],
        [3, 1],
        [4, 3],
      ],
      "İkinci paragraf gözlemi ve değişkenleri; ilk paragraf alanları; üçüncü paragraf çözüm seçeneklerini açıklar.",
      "Dört farklı paragraf ayrıntısını aynı araştırma planındaki işlevleriyle eşleştirir.",
      1,
      PASSAGES[10]!.body,
      "UNDERSTAND",
    ),
    revisionReason:
      "Üç doğrudan niteleyici eşleştirmesi yerine gözlem, değişken, alan ve çözüm ayrıntılarını kapsayan dört eşleşme oluşturuldu.",
  },
  "PLV1-Q034": {
    question: matching(
      "PLV1-Q034",
      "PLV1-C012",
      "RC_MAIN_IDEA",
      "HARD",
      "Harita seçimiyle ilgili durumları metnin önerdiği sonuçlarla eşleştiriniz.",
      [
        "Geniş alanı hızlıca görmek",
        "Acil bir yürüyüş rotası seçmek",
        "Küçük ölçekli haritanın dar yolları göstermemesi",
        "İhtiyaç duyulan ayrıntı düzeyinin değişmesi",
      ],
      [
        "Bu durum tek başına haritanın hatalı olduğunu göstermez",
        "Bazı ayrıntıları elemek okunabilirliği artırabilir",
        "Ayrıntılı gösterim gerektirebilir",
        "Her durumda geçerli tek bir en iyi harita yoktur",
      ],
      [
        [1, 2],
        [2, 3],
        [3, 1],
        [4, 4],
      ],
      "Metin geniş alan için ayrıntı elenebileceğini, acil rotada küçük geçitlerin kontrolünü, eksik ayrıntının tek başına hata olmadığını ve seçimin amaca bağlı olduğunu açıklar.",
      "Dört durumu ortak ana düşünce olan amaca göre uygun ölçek ve ayrıntı seçimiyle ilişkilendirir.",
      1,
      PASSAGES[11]!.body,
      "INFER",
    ),
    revisionReason:
      "Karar kriterlerini doğrudan sormak yerine farklı kullanım koşullarını ana düşünce sonuçlarıyla ilişkilendiren dört eşleşmeli yapıya dönüştürüldü.",
  },
  "PLV1-Q035": {
    question: fill(
      "PLV1-Q035",
      "PLV1-C012",
      "RC_DETAIL",
      "HARD",
      "Acil bir yürüyüş rotası seçilirken küçük köprülerin ve ___ ayrıca kontrol edilmesi gerekir.",
      "blank-1",
      ["dar geçitlerin"],
      "İkinci paragraf acil rota için küçük köprülerin ve dar geçitlerin ayrıca kontrol edilmesi gerektiğini belirtir.",
      "Koşullu kullanım bağlamı içindeki iki ayrıntıdan doğru tamamlamayı seçtirir; tek kelimelik yüzeysel hatırlama değildir.",
      2,
      "Ancak acil bir yürüyüş rotası seçilecekse küçük köprülerin ve dar geçitlerin ayrıca kontrol edilmesi gerekiyordu.",
      "UNDERSTAND",
    ),
    revisionReason:
      "Tek kelimelik doğrudan hatırlama yerine acil rota koşulunda birlikte kontrol edilmesi gereken iki ayrıntıyı isteyen doğal bir tamlama kullanıldı.",
  },
  "PLV1-Q036": {
    question: tf(
      "PLV1-Q036",
      "PLV1-C012",
      "RC_INFERENCE",
      "HARD",
      "Bir haritanın bazı ayrıntıları göstermemesi, metne göre her kullanım amacı için onu hatalı kılar.",
      false,
      "Haritanın uygunluğu kullanım amacına ve gereken ayrıntı düzeyine bağlıdır; geniş alanı görmek için bazı ayrıntıların elenmesi işlevsel olabilir.",
      "Metnin geniş alan ve acil rota koşullarını karşılaştırarak “her kullanım amacı” genellemesinin yanlışlığını buldurur.",
      2,
      PASSAGES[11]!.body,
      "INFER",
    ),
    revisionReason:
      "Doğrudan koşul cümlesi yerine farklı kullanım amaçlarını karşılaştıran ve aşırı genellemeyi test eden inference T/F maddesine dönüştürüldü.",
  },
};

const QUESTIONS: CanonicalPlacementQuestion[] = RAW_QUESTIONS.map((question) => {
  const revision = QUESTION_REVISIONS[question.stableQuestionId];
  return revision ? { ...revision.question, revisionReason: revision.revisionReason } : question;
});

const CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_DRAFT = {
  manifestId: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_ID,
  manifestVersion: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_VERSION,
  itemBankType: "PLACEMENT",
  lifecycle: "DESIGN_ONLY",
  calibrationStatus: "NOT_CALIBRATED",
  productionAssignmentEnabled: false,
  expectedQuestionCount: 36,
  skillDistribution: { RC_MAIN_IDEA: 12, RC_DETAIL: 12, RC_INFERENCE: 12 },
  difficultyDistribution: { EASY: 12, MEDIUM: 12, HARD: 12 },
  passageDistribution: Object.fromEntries(PASSAGES.map((passage) => [passage.contentId, 3])),
  validationRules: [
    "36 stableQuestionId unique olmalı ve PLV1-Q### formatında olmalı.",
    "Her Skill tam 12 soru; her Skill içinde EASY/MEDIUM/HARD tam 4/4/4 olmalı.",
    "Her passage tam 3 soruya sahip olmalı; passage gövdeleri ve questionText değerleri normalize edildiğinde unique olmalı.",
    "OPEN_ENDED yasaktır; yalnız MULTIPLE_CHOICE, TRUE_FALSE, MATCHING ve FILL_BLANK kullanılabilir.",
    "Her sorunun tek primary Skill'i, tek doğrulanabilir correctAnswer'ı ve passage içinde evidence span'i olmalı.",
    "PUBLISHED item bank immutable kabul edilir; içerik değişikliği yeni manifestVersion gerektirir.",
    "Aynı canonical identity ve metadata exact match ise NOOP; identity/metadata drift ise CONFLICT.",
  ],
  passages: PASSAGES,
  questions: QUESTIONS,
} as const;

export function validateCanonicalPlacementItemBankManifest(
  input: unknown,
): CanonicalPlacementItemBankManifest {
  return canonicalPlacementItemBankManifestSchema.parse(input);
}

export const CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST = validateCanonicalPlacementItemBankManifest(
  CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST_DRAFT,
);
