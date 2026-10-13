/**
 * Detects a predictable length cue in multiple-choice options.
 *
 * This is an editorial warning, not a scoring rule. It deliberately keeps
 * option IDs separate from displayed text so option-order randomization and
 * server-side optionId scoring remain unaffected.
 */
export type OptionLengthQuestion = {
  options: readonly { id: string; text: string }[];
  correctOptionId: string;
};

export type OptionLengthQuality = {
  correctOptionId: string;
  correctLength: number;
  longestWrongLength: number;
  wrongMedianLength: number;
  margin: number;
  ratioToWrongMedian: number;
  correctIsLongest: boolean;
  clearOutlier: boolean;
};

export type MultipleChoiceQualityQuestion = {
  key: string;
  options: readonly { id: string; text: string }[];
  correctOptionId: string;
};

export type MultipleChoicePackageQuality = {
  questionCount: number;
  correctPositionCounts: Record<string, number>;
  maxCorrectPositionRatio: number;
  correctUniqueLongestCount: number;
  correctUniqueLongestRatio: number;
  correctLongestOrTiedCount: number;
  correctLongestOrTiedRatio: number;
  clearLengthOutlierCount: number;
  questionReports: Array<{
    key: string;
    correctPosition: string | null;
    correctIsLongest: boolean;
    correctUniqueLongest: boolean;
    clearLengthOutlier: boolean;
  }>;
  needsEditorialReview: boolean;
};

export const MULTIPLE_CHOICE_MAX_POSITION_RATIO_REVIEW = 0.45;
export const MULTIPLE_CHOICE_UNIQUE_LONGEST_RATIO_REVIEW = 0.5;

export const OPTION_LENGTH_CLEAR_MARGIN = 8;
export const OPTION_LENGTH_CLEAR_RATIO = 1.2;

/** Count letters and numbers after normalizing whitespace and punctuation. */
export function normalizedOptionLength(text: string): number {
  return text.normalize("NFKC").replace(/[\p{White_Space}\p{Punctuation}\p{Symbol}]+/gu, "").length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function assessOptionLengthQuality(
  question: OptionLengthQuestion,
): OptionLengthQuality | null {
  const correct = question.options.find((option) => option.id === question.correctOptionId);
  const wrong = question.options.filter((option) => option.id !== question.correctOptionId);
  if (!correct || wrong.length === 0) return null;

  const correctLength = normalizedOptionLength(correct.text);
  const wrongLengths = wrong.map((option) => normalizedOptionLength(option.text));
  const longestWrongLength = Math.max(...wrongLengths);
  const wrongMedianLength = median(wrongLengths);
  const margin = correctLength - longestWrongLength;
  const ratioToWrongMedian = wrongMedianLength > 0 ? correctLength / wrongMedianLength : Infinity;
  const correctIsLongest = margin >= 0;

  return {
    correctOptionId: question.correctOptionId,
    correctLength,
    longestWrongLength,
    wrongMedianLength,
    margin,
    ratioToWrongMedian,
    correctIsLongest,
    clearOutlier:
      correctIsLongest &&
      margin >= OPTION_LENGTH_CLEAR_MARGIN &&
      ratioToWrongMedian >= OPTION_LENGTH_CLEAR_RATIO,
  };
}

/**
 * Produces an editorial QA report for a complete multiple-choice package.
 *
 * The thresholds are release-quality review triggers, not learning or
 * mastery criteria. A report never changes an answer key and must not be used
 * by route selection or scoring.
 */
export function assessMultipleChoicePackageQuality(
  questions: readonly MultipleChoiceQualityQuestion[],
  options: {
    maxPositionRatio?: number;
    uniqueLongestRatio?: number;
    minimumQuestionCount?: number;
  } = {},
): MultipleChoicePackageQuality {
  const maxPositionRatio = options.maxPositionRatio ?? MULTIPLE_CHOICE_MAX_POSITION_RATIO_REVIEW;
  const uniqueLongestRatio =
    options.uniqueLongestRatio ?? MULTIPLE_CHOICE_UNIQUE_LONGEST_RATIO_REVIEW;
  const minimumQuestionCount = options.minimumQuestionCount ?? 8;
  const correctPositionCounts: Record<string, number> = {};
  const questionReports = questions.map((question) => {
    const position = question.options.findIndex((option) => option.id === question.correctOptionId);
    const correctPosition = position >= 0 ? String.fromCharCode(65 + position) : null;
    if (correctPosition) {
      correctPositionCounts[correctPosition] = (correctPositionCounts[correctPosition] ?? 0) + 1;
    }
    const lengthQuality = assessOptionLengthQuality(question);
    const correctUniqueLongest = Boolean(
      lengthQuality && lengthQuality.correctLength > lengthQuality.longestWrongLength,
    );
    return {
      key: question.key,
      correctPosition,
      correctIsLongest: lengthQuality?.correctIsLongest ?? false,
      correctUniqueLongest,
      clearLengthOutlier: lengthQuality?.clearOutlier ?? false,
    };
  });
  const questionCount = questions.length;
  const positionTotal = Object.values(correctPositionCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const maxCorrectPositionRatio =
    positionTotal > 0 ? Math.max(...Object.values(correctPositionCounts)) / positionTotal : 0;
  const correctUniqueLongestCount = questionReports.filter(
    (question) => question.correctUniqueLongest,
  ).length;
  const correctLongestOrTiedCount = questionReports.filter(
    (question) => question.correctIsLongest,
  ).length;
  const clearLengthOutlierCount = questionReports.filter(
    (question) => question.clearLengthOutlier,
  ).length;
  const correctUniqueLongestRatio =
    questionCount > 0 ? correctUniqueLongestCount / questionCount : 0;
  const correctLongestOrTiedRatio =
    questionCount > 0 ? correctLongestOrTiedCount / questionCount : 0;

  return {
    questionCount,
    correctPositionCounts,
    maxCorrectPositionRatio,
    correctUniqueLongestCount,
    correctUniqueLongestRatio,
    correctLongestOrTiedCount,
    correctLongestOrTiedRatio,
    clearLengthOutlierCount,
    questionReports,
    needsEditorialReview:
      questionCount >= minimumQuestionCount &&
      (maxCorrectPositionRatio > maxPositionRatio ||
        correctUniqueLongestRatio > uniqueLongestRatio ||
        clearLengthOutlierCount > 0),
  };
}
