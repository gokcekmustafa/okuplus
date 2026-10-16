import { EDUCATION_V2_P0_PROGRAM } from "./education-v2-p0-program.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "./education-v2-p1-a-program.js";
import { EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM } from "./education-v2-p1-a-cycle-v2-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4,
} from "./education-v2-p1-a-cycle-3-program.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "./education-v2-p1-bcd-program.js";
import { FIRST_REAL_CURRICULUM_PACK } from "./first-real-pack.js";
import { CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST } from "./canonical-placement-item-bank.js";
import { CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE } from "./canonical-placement-item-bank-revisions.js";
import { QUESTION_BANK_VERSIONED_REVISION_CANDIDATES } from "./question-bank-versioned-revisions.js";
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

function curriculumProgramPackage(
  key: string,
  status: MultipleChoiceSourcePackage["status"],
  editorialReviewStatus: "REVIEW_REQUIRED" | "VERIFIED" | undefined,
  exercises: readonly {
    key: string;
    contentKey: string;
    skillCode: string;
    questions: readonly {
      key: string;
      prompt: string;
      options: readonly { id: string; text: string }[];
      correctOptionId: string;
    }[];
  }[],
): MultipleChoiceSourcePackage {
  return {
    key,
    status,
    questions: exercises.flatMap((exercise) =>
      exercise.questions.map((question) => ({
        key: question.key,
        prompt: question.prompt,
        contentKey: exercise.contentKey,
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
    exercises: EDUCATION_V2_P0_PROGRAM.exercises,
  },
  {
    key: EDUCATION_V2_P1_A_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    exercises: EDUCATION_V2_P1_A_PROGRAM.exercises,
  },
  {
    key: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    exercises: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.exercises,
  },
  {
    key: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.programId,
    status: "SOURCE_CURRENT" as const,
    exercises: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises,
  },
  ...EDUCATION_V2_P1_BCD_PROGRAMS.map((program) => ({
    key: program.programId,
    status: program.sequence > 1 ? ("UNRELEASED_CANDIDATE" as const) : ("SOURCE_CURRENT" as const),
    editorialReviewStatus: program.editorialReviewStatus,
    exercises: program.exercises,
  })),
];

const programPackages = sourcePrograms.map((program) =>
  curriculumProgramPackage(
    program.key,
    program.status,
    "editorialReviewStatus" in program ? program.editorialReviewStatus : undefined,
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
          prompt: question.prompt,
          contentKey: content.slug,
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
        prompt: question.questionText,
        contentKey: question.contentId,
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
        prompt: question.questionText,
        contentKey: question.contentId,
        skillCode: question.skillCode,
        options: [...question.options].sort((left, right) => left.position - right.position),
        correctOptionId: question.correctAnswer.correctOptionIds[0]!,
        editorialReviewStatus: "REVIEW_REQUIRED" as const,
      },
    ];
  }),
};

const rainGardenRevision = EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4;
const rainGardenRevisionPackage: MultipleChoiceSourcePackage = {
  key: rainGardenRevision.templateVersionId,
  status: "VERSIONED_REVISION_CANDIDATE",
  revisionKind: "QUESTION_CONTENT",
  questions: rainGardenRevision.questions.map((question) => ({
    key: question.key,
    prompt: question.prompt,
    contentKey: rainGardenRevision.contentKey,
    skillCode: rainGardenRevision.skillCode,
    options: question.options,
    correctOptionId: question.correctOptionId,
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
  rainGardenRevisionPackage,
  ...versionedRevisionPackages,
];
