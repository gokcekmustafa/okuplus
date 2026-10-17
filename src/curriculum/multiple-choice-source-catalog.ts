import {
  EDUCATION_V2_P0_PROGRAM,
  questionVersionId as p0QuestionVersionId,
} from "./education-v2-p0-program.js";
import { EDUCATION_V2_P1_A_PROGRAM, p1AQuestionVersionId } from "./education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  p1ACycleV2QuestionVersionId,
} from "./education-v2-p1-a-cycle-v2-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4,
  p1ACycle3QuestionVersionId,
} from "./education-v2-p1-a-cycle-3-program.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS, p1BCDId } from "./education-v2-p1-bcd-program.js";
import { FIRST_REAL_CURRICULUM_PACK } from "./first-real-pack.js";
import { CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST } from "./canonical-placement-item-bank.js";
import {
  CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE,
  CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE,
} from "./canonical-placement-item-bank-revisions.js";
import { QUESTION_BANK_VERSIONED_REVISION_CANDIDATES } from "./question-bank-versioned-revisions.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "./education-v2-p1-800-draft-cycles.js";
import type { MultipleChoiceQualityQuestion } from "./option-length-quality.js";

export type MultipleChoiceSourcePackage = {
  key: string;
  status:
    | "SOURCE_CURRENT"
    | "UNRELEASED_CANDIDATE"
    | "VERSIONED_REVISION_CANDIDATE"
    | "DESIGN_ONLY_CANDIDATE";
  revisionKind?: "QUESTION_CONTENT" | "OPTION_ORDER_ONLY";
  questions: MultipleChoiceQualityQuestion[];
};

export type UniqueQuestionVersionGroup = {
  sourceQuestionId: string;
  versions: MultipleChoiceQualityQuestion[];
};

export function collectUniqueMultipleChoiceQuestions(
  packages: readonly MultipleChoiceSourcePackage[],
): UniqueQuestionVersionGroup[] {
  const byIdentity = new Map<string, Map<string, MultipleChoiceQualityQuestion>>();
  for (const source of packages) {
    for (const question of source.questions) {
      const sourceQuestionId = question.sourceQuestionId ?? `${source.key}:${question.key}`;
      const versionKey = question.sourceVersionId ?? `undeclared:${source.key}:${question.key}`;
      const versions =
        byIdentity.get(sourceQuestionId) ?? new Map<string, MultipleChoiceQualityQuestion>();
      const incoming = { ...question, sourceQuestionId };
      const existing = versions.get(versionKey);
      if (existing) {
        const sameOptions =
          existing.options.length === incoming.options.length &&
          existing.options.every(
            (option, index) =>
              option.id === incoming.options[index]?.id &&
              option.text === incoming.options[index]?.text,
          );
        const conflictingFields = [
          existing.key !== incoming.key && "question key",
          existing.prompt !== incoming.prompt && "prompt",
          existing.contentKey !== incoming.contentKey && "content key",
          existing.skillCode !== incoming.skillCode && "skill",
          existing.correctOptionId !== incoming.correctOptionId && "answer key",
          existing.explanation !== incoming.explanation && "explanation",
          existing.hint !== incoming.hint && "hint",
          !sameOptions && "options/order",
          existing.sourceVersionStatus !== incoming.sourceVersionStatus && "version status",
          existing.sourceText && incoming.sourceText && existing.sourceText !== incoming.sourceText
            ? "source text"
            : false,
        ].filter((field): field is string => Boolean(field));
        if (conflictingFields.length > 0) {
          throw new Error(
            `Aynı değişmez soru sürümü çakışan içerikle kataloglandı (${conflictingFields.join(", ")}): ${sourceQuestionId}@${versionKey}`,
          );
        }
        versions.set(versionKey, {
          ...existing,
          ...incoming,
          sourceText: incoming.sourceText ?? existing.sourceText,
          editorialReviewStatus: incoming.editorialReviewStatus ?? existing.editorialReviewStatus,
        });
      } else {
        versions.set(versionKey, incoming);
      }
      byIdentity.set(sourceQuestionId, versions);
    }
  }
  return [...byIdentity].map(([sourceQuestionId, versions]) => ({
    sourceQuestionId,
    versions: [...versions.values()],
  }));
}

function curriculumProgramPackage(
  key: string,
  status: MultipleChoiceSourcePackage["status"],
  editorialReviewStatus: "REVIEW_REQUIRED" | "VERIFIED" | undefined,
  contents: readonly { key: string; body: string }[],
  questionVersionId: (exerciseKey: string, questionKey: string) => string,
  exercises: readonly {
    key: string;
    contentKey: string;
    skillCode: string;
    questions: readonly {
      key: string;
      prompt: string;
      options: readonly { id: string; text: string }[];
      correctOptionId: string;
      explanation: string;
      hint: string;
    }[];
  }[],
): MultipleChoiceSourcePackage {
  const contentByKey = new Map(contents.map((content) => [content.key, content.body]));
  return {
    key,
    status,
    questions: exercises.flatMap((exercise) =>
      exercise.questions.map((question) => ({
        key: question.key,
        sourceQuestionId: `${key}:${exercise.key}:${question.key}`,
        sourceVersionId: questionVersionId(exercise.key, question.key),
        sourceVersionStatus:
          status === "SOURCE_CURRENT" ? "SOURCE_CURRENT" : "UNRELEASED_CANDIDATE",
        prompt: question.prompt,
        contentKey: exercise.contentKey,
        sourceText: contentByKey.get(exercise.contentKey),
        explanation: question.explanation,
        hint: question.hint,
        skillCode: exercise.skillCode,
        options: question.options,
        correctOptionId: question.correctOptionId,
        editorialReviewStatus,
      })),
    ),
  };
}

const sourcePrograms = [
  {
    key: EDUCATION_V2_P0_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    content: EDUCATION_V2_P0_PROGRAM.content,
    questionVersionId: p0QuestionVersionId,
    exercises: EDUCATION_V2_P0_PROGRAM.exercises,
  },
  {
    key: EDUCATION_V2_P1_A_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    content: EDUCATION_V2_P1_A_PROGRAM.content,
    questionVersionId: p1AQuestionVersionId,
    exercises: EDUCATION_V2_P1_A_PROGRAM.exercises,
  },
  {
    key: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    content: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.content,
    questionVersionId: p1ACycleV2QuestionVersionId,
    exercises: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.exercises,
  },
  {
    key: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    content: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content,
    questionVersionId: p1ACycle3QuestionVersionId,
    exercises: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises,
  },
  ...EDUCATION_V2_P1_BCD_PROGRAMS.map((program) => ({
    key: program.programId,
    status: program.sequence > 1 ? ("UNRELEASED_CANDIDATE" as const) : ("SOURCE_CURRENT" as const),
    editorialReviewStatus: program.editorialReviewStatus,
    content: program.content,
    questionVersionId: (exerciseKey: string, questionKey: string) =>
      p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v1`),
    exercises: program.exercises,
  })),
];

const programPackages = sourcePrograms.map((program) =>
  curriculumProgramPackage(
    program.key,
    program.status,
    "editorialReviewStatus" in program ? program.editorialReviewStatus : undefined,
    program.content,
    program.questionVersionId,
    program.exercises,
  ),
);

const firstRealPackages: MultipleChoiceSourcePackage[] = FIRST_REAL_CURRICULUM_PACK.contents.map(
  (content) => ({
    key: `${FIRST_REAL_CURRICULUM_PACK.packId}:${content.slug}`,
    status: "SOURCE_CURRENT",
    questions: content.questions
      .filter((question) => question.type === "MULTIPLE_CHOICE")
      .map((question, index) => {
        const correctOptionIds = question.correctAnswer.correctOptionIds;
        const correctOptionId =
          Array.isArray(correctOptionIds) && typeof correctOptionIds[0] === "string"
            ? correctOptionIds[0]
            : null;
        if (!correctOptionId)
          throw new Error(`Çoktan seçmeli cevap anahtarı eksik: ${content.slug}:${index + 1}`);
        return {
          key: `${content.slug}:${index + 1}`,
          sourceQuestionId: `${FIRST_REAL_CURRICULUM_PACK.packId}:${content.slug}:${index + 1}`,
          sourceVersionId: null,
          sourceVersionStatus: "VERSION_UNDECLARED" as const,
          prompt: question.prompt,
          contentKey: content.slug,
          sourceText: content.body,
          explanation: question.explanation,
          hint: question.hint,
          skillCode: content.trackId,
          options: question.options,
          correctOptionId,
        };
      }),
  }),
);

const placementQuestionPackage: MultipleChoiceSourcePackage = {
  key: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestId,
  status: "DESIGN_ONLY_CANDIDATE",
  revisionKind: "QUESTION_CONTENT",
  questions: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.flatMap((question) => {
    if (
      question.questionType !== "MULTIPLE_CHOICE" ||
      question.correctAnswer.type !== "MULTIPLE_CHOICE"
    ) {
      return [];
    }
    return [
      {
        key: question.stableQuestionId,
        sourceQuestionId: `${CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestId}:${question.stableQuestionId}`,
        sourceVersionId: `${CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestId}@${CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.manifestVersion}:${question.stableQuestionId}`,
        sourceVersionStatus: "SOURCE_CURRENT" as const,
        prompt: question.questionText,
        contentKey: question.contentId,
        sourceText: CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.passages.find(
          (passage) => passage.contentId === question.contentId,
        )?.body,
        explanation: question.explanation,
        skillCode: question.skillCode,
        options: question.options,
        correctOptionId: question.correctAnswer.correctOptionIds[0]!,
        editorialReviewStatus: "REVIEW_REQUIRED" as const,
      },
    ];
  }),
};

const placementRevisionCandidatePackage: MultipleChoiceSourcePackage = {
  key: `${CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.manifestId}:${CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.manifestVersion}`,
  status: "VERSIONED_REVISION_CANDIDATE",
  revisionKind: "QUESTION_CONTENT",
  questions: CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.questions.flatMap((question) => {
    if (
      question.questionType !== "MULTIPLE_CHOICE" ||
      question.correctAnswer.type !== "MULTIPLE_CHOICE"
    ) {
      return [];
    }
    return [
      {
        key: question.stableQuestionId,
        sourceQuestionId: `${CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.manifestId}:${question.stableQuestionId}`,
        sourceVersionId: `${CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.manifestId}@${CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.manifestVersion}:${question.stableQuestionId}`,
        sourceVersionStatus: "REVISION_CANDIDATE" as const,
        prompt: question.questionText,
        contentKey: question.contentId,
        sourceText: CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.passages.find(
          (passage) => passage.contentId === question.contentId,
        )?.body,
        explanation: question.explanation,
        skillCode: question.skillCode,
        options: [...question.options].sort((left, right) => left.position - right.position),
        correctOptionId: question.correctAnswer.correctOptionIds[0]!,
        editorialReviewStatus: "REVIEW_REQUIRED" as const,
      },
    ];
  }),
};

const placementReviewCandidatePackage: MultipleChoiceSourcePackage = {
  key: `${CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.manifestId}:${CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.manifestVersion}`,
  status: "VERSIONED_REVISION_CANDIDATE",
  revisionKind: "QUESTION_CONTENT",
  questions: CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.questions.flatMap((question) => {
    if (
      question.questionType !== "MULTIPLE_CHOICE" ||
      question.correctAnswer.type !== "MULTIPLE_CHOICE"
    ) {
      return [];
    }
    return [
      {
        key: question.stableQuestionId,
        sourceQuestionId: `${CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.manifestId}:${question.stableQuestionId}`,
        sourceVersionId: `${CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.manifestId}@${CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.manifestVersion}:${question.stableQuestionId}`,
        sourceVersionStatus: "REVISION_CANDIDATE" as const,
        prompt: question.questionText,
        contentKey: question.contentId,
        sourceText: CANONICAL_PLACEMENT_ITEM_BANK_REVIEW_CANDIDATE.passages.find(
          (passage) => passage.contentId === question.contentId,
        )?.body,
        explanation: question.explanation,
        skillCode: question.skillCode,
        options: [...question.options].sort((left, right) => left.position - right.position),
        correctOptionId: question.correctAnswer.correctOptionIds[0]!,
        editorialReviewStatus: "REVIEW_REQUIRED" as const,
      },
    ];
  }),
};

const rainGardenRevision = EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4;
const rainGardenSourceContentKey = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.find(
  (exercise) => exercise.key === rainGardenRevision.exerciseKey,
)?.contentKey;
if (!rainGardenSourceContentKey || rainGardenSourceContentKey !== rainGardenRevision.contentKey) {
  throw new Error("43. istasyon yağmur bahçesi v4 adayı Cycle 3 kaynak içeriğine bağlı değil.");
}
const rainGardenRevisionPackage: MultipleChoiceSourcePackage = {
  key: rainGardenRevision.templateVersionId,
  status: "VERSIONED_REVISION_CANDIDATE",
  revisionKind: "QUESTION_CONTENT",
  questions: rainGardenRevision.questions.map((question) => ({
    key: question.key,
    sourceQuestionId: `${EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.programId}:${rainGardenRevision.exerciseKey}:${question.key}`,
    sourceVersionId: rainGardenRevision.questionVersionId(question.key),
    sourceVersionStatus: "REVISION_CANDIDATE",
    prompt: question.prompt,
    contentKey: rainGardenRevision.contentKey,
    sourceText: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content.find(
      (content) => content.key === rainGardenSourceContentKey,
    )?.body,
    skillCode: rainGardenRevision.skillCode,
    options: question.options,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    hint: question.hint,
    editorialReviewStatus: rainGardenRevision.editorialReviewStatus,
  })),
};

const versionedRevisionPackages: MultipleChoiceSourcePackage[] =
  QUESTION_BANK_VERSIONED_REVISION_CANDIDATES.map((candidate) => ({
    key: candidate.key,
    status: candidate.status,
    revisionKind: candidate.revisionKind,
    questions: candidate.questions,
  }));

const expansionDraftPackages: MultipleChoiceSourcePackage[] = EDUCATION_V2_P1_800_DRAFT_CYCLES.map(
  (cycle) => ({
    key: `${cycle.programId}:SOURCE_QUESTIONS`,
    status: "UNRELEASED_CANDIDATE",
    revisionKind: "QUESTION_CONTENT",
    questions: cycle.sourceStations.flatMap((station) =>
      station.questions.map((question) => ({
        key: question.key,
        sourceQuestionId: `${cycle.programId}:${station.key}:${question.key}`,
        sourceVersionId: question.versionId,
        sourceVersionStatus: "UNRELEASED_CANDIDATE" as const,
        prompt: question.prompt,
        contentKey: station.key,
        sourceText: station.text,
        explanation: question.explanation,
        hint: question.hint,
        skillCode: station.skillCodes.join("+") || undefined,
        options: question.options,
        correctOptionId: question.correctOptionId,
        editorialReviewStatus: "REVIEW_REQUIRED" as const,
      })),
    ),
  }),
);

/**
 * Enumerates every source package actually used by the learning-route catalog
 * and the independent first-real content pack. It is source QA only; it does
 * not assert that any database graph is deployed.
 */
export const MULTIPLE_CHOICE_SOURCE_PACKAGES: readonly MultipleChoiceSourcePackage[] = [
  ...programPackages,
  ...firstRealPackages,
  placementQuestionPackage,
  placementRevisionCandidatePackage,
  placementReviewCandidatePackage,
  rainGardenRevisionPackage,
  ...versionedRevisionPackages,
  ...expansionDraftPackages,
];

export const MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS = [
  {
    code: "RUNTIME_TRAINING_BANK_NOT_ENUMERATED",
    detail:
      "Bu statik katalog, bağımsız Antrenman'ın yayımlanmış veritabanı şablon/soru sürümlerini kapsamaz. Canlı envanter yalnızca ayrı, korumalı salt-okunur workflow kanıtıyla raporlanabilir; bu katalog komutu soru içeriğini veya semantiğini doğrulamaz.",
  },
  {
    code: "FIRST_REAL_PACK_VERSION_UNDECLARED",
    detail:
      "İlk gerçek içerik paketinde soru bazında değişmez sürüm kimliği tanımlanmamış; sürüm uydurulmadı.",
  },
  {
    code: "ACADEMIC_P0_IS_LEARNING_CONTRACT_NOT_QUESTION_BANK",
    detail:
      "academic-reading-p0.ts öğretim hedefleri ve uygulama sözleşmeleri tanımlar; soru kökü/seçenek/cevap kayıtları içermez.",
  },
] as const;
