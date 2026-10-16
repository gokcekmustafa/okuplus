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
  shortestWrongLength: number;
  wrongMedianLength: number;
  margin: number;
  shortestMargin: number;
  ratioToWrongMedian: number;
  correctIsLongest: boolean;
  correctIsShortest: boolean;
  correctUniqueLongest: boolean;
  correctUniqueShortest: boolean;
  clearOutlier: boolean;
};

export type MultipleChoiceQualityQuestion = {
  key: string;
  /** Stable identity shared by immutable source and revision versions. */
  sourceQuestionId?: string;
  /** Authoritative source/version key; null means the source declares no version. */
  sourceVersionId?: string | null;
  sourceVersionStatus?:
    "SOURCE_CURRENT" | "UNRELEASED_CANDIDATE" | "REVISION_CANDIDATE" | "VERSION_UNDECLARED";
  options: readonly { id: string; text: string }[];
  correctOptionId: string;
  prompt?: string;
  contentKey?: string;
  sourceText?: string;
  explanation?: string;
  hint?: string;
  skillCode?: string;
  editorialReviewStatus?: "REVIEW_REQUIRED" | "VERIFIED";
};

export type RepeatedSkillQuestionPair = {
  firstKey: string;
  secondKey: string;
  contentKey: string;
  skillCode: string;
  promptSimilarity: number;
};

export type MultipleChoicePackageQuality = {
  questionCount: number;
  correctPositionCounts: Record<string, number>;
  maxCorrectPositionRatio: number;
  correctUniqueLongestCount: number;
  correctUniqueLongestRatio: number;
  correctUniqueShortestCount: number;
  correctUniqueShortestRatio: number;
  correctLongestOrTiedCount: number;
  correctLongestOrTiedRatio: number;
  clearLengthOutlierCount: number;
  repeatedSkillQuestionPairs: RepeatedSkillQuestionPair[];
  editorialReviewQuestionKeys: string[];
  questionReports: Array<{
    key: string;
    correctPosition: string | null;
    correctIsLongest: boolean;
    correctUniqueLongest: boolean;
    correctUniqueShortest: boolean;
    clearLengthOutlier: boolean;
  }>;
  needsEditorialReview: boolean;
};

export const MULTIPLE_CHOICE_MAX_POSITION_RATIO_REVIEW = 0.45;
export const MULTIPLE_CHOICE_UNIQUE_LONGEST_RATIO_REVIEW = 0.5;
export const MULTIPLE_CHOICE_UNIQUE_SHORTEST_RATIO_REVIEW = 0.5;

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
  const shortestWrongLength = Math.min(...wrongLengths);
  const wrongMedianLength = median(wrongLengths);
  const margin = correctLength - longestWrongLength;
  const shortestMargin = shortestWrongLength - correctLength;
  const ratioToWrongMedian = wrongMedianLength > 0 ? correctLength / wrongMedianLength : Infinity;
  const correctIsLongest = margin >= 0;
  const correctIsShortest = shortestMargin >= 0;
  const correctUniqueLongest = margin > 0;
  const correctUniqueShortest = shortestMargin > 0;
  const shortestRatio =
    correctLength > 0
      ? shortestWrongLength / correctLength
      : shortestWrongLength > 0
        ? Infinity
        : 1;

  return {
    correctOptionId: question.correctOptionId,
    correctLength,
    longestWrongLength,
    shortestWrongLength,
    wrongMedianLength,
    margin,
    shortestMargin,
    ratioToWrongMedian,
    correctIsLongest,
    correctIsShortest,
    correctUniqueLongest,
    correctUniqueShortest,
    clearOutlier:
      (correctUniqueLongest &&
        margin >= OPTION_LENGTH_CLEAR_MARGIN &&
        ratioToWrongMedian >= OPTION_LENGTH_CLEAR_RATIO) ||
      (correctUniqueShortest &&
        shortestMargin >= OPTION_LENGTH_CLEAR_MARGIN &&
        shortestRatio >= OPTION_LENGTH_CLEAR_RATIO),
  };
}

function normalizedPromptTokens(prompt: string): Set<string> {
  return new Set(
    prompt
      .normalize("NFKC")
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
      .trim()
      .split(/\s+/u)
      .filter((token) => token.length > 1),
  );
}

function promptSimilarity(left: string, right: string): number {
  const leftTokens = normalizedPromptTokens(left);
  const rightTokens = normalizedPromptTokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 1;
  let intersectionSize = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersectionSize += 1;
  return intersectionSize / union.size;
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
    uniqueShortestRatio?: number;
    minimumQuestionCount?: number;
  } = {},
): MultipleChoicePackageQuality {
  const maxPositionRatio = options.maxPositionRatio ?? MULTIPLE_CHOICE_MAX_POSITION_RATIO_REVIEW;
  const uniqueLongestRatio =
    options.uniqueLongestRatio ?? MULTIPLE_CHOICE_UNIQUE_LONGEST_RATIO_REVIEW;
  const uniqueShortestRatio =
    options.uniqueShortestRatio ?? MULTIPLE_CHOICE_UNIQUE_SHORTEST_RATIO_REVIEW;
  const minimumQuestionCount = options.minimumQuestionCount ?? 8;
  const correctPositionCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const questionReports = questions.map((question) => {
    const position = question.options.findIndex((option) => option.id === question.correctOptionId);
    const correctPosition = position >= 0 ? String.fromCharCode(65 + position) : null;
    if (correctPosition) {
      correctPositionCounts[correctPosition] = (correctPositionCounts[correctPosition] ?? 0) + 1;
    }
    const lengthQuality = assessOptionLengthQuality(question);
    const correctUniqueLongest = lengthQuality?.correctUniqueLongest ?? false;
    return {
      key: question.key,
      correctPosition,
      correctIsLongest: lengthQuality?.correctIsLongest ?? false,
      correctUniqueLongest,
      correctUniqueShortest: lengthQuality?.correctUniqueShortest ?? false,
      clearLengthOutlier: lengthQuality?.clearOutlier ?? false,
    };
  });
  const repeatedSkillQuestionPairs: RepeatedSkillQuestionPair[] = [];
  for (let leftIndex = 0; leftIndex < questions.length; leftIndex += 1) {
    const left = questions[leftIndex]!;
    if (!left.prompt || !left.contentKey || !left.skillCode) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < questions.length; rightIndex += 1) {
      const right = questions[rightIndex]!;
      if (
        !right.prompt ||
        left.contentKey !== right.contentKey ||
        left.skillCode !== right.skillCode
      )
        continue;
      const similarity = promptSimilarity(left.prompt, right.prompt);
      if (similarity >= 0.8) {
        repeatedSkillQuestionPairs.push({
          firstKey: left.key,
          secondKey: right.key,
          contentKey: left.contentKey,
          skillCode: left.skillCode,
          promptSimilarity: Math.round(similarity * 100) / 100,
        });
      }
    }
  }
  const editorialReviewQuestionKeys = questions
    .filter((question) => question.editorialReviewStatus !== "VERIFIED")
    .map((question) => question.key);
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
  const correctUniqueShortestCount = questionReports.filter(
    (question) => question.correctUniqueShortest,
  ).length;
  const correctUniqueShortestRatio =
    questionCount > 0 ? correctUniqueShortestCount / questionCount : 0;
  const correctLongestOrTiedRatio =
    questionCount > 0 ? correctLongestOrTiedCount / questionCount : 0;

  return {
    questionCount,
    correctPositionCounts,
    maxCorrectPositionRatio,
    correctUniqueLongestCount,
    correctUniqueLongestRatio,
    correctUniqueShortestCount,
    correctUniqueShortestRatio,
    correctLongestOrTiedCount,
    correctLongestOrTiedRatio,
    clearLengthOutlierCount,
    repeatedSkillQuestionPairs,
    editorialReviewQuestionKeys,
    questionReports,
    needsEditorialReview:
      editorialReviewQuestionKeys.length > 0 ||
      repeatedSkillQuestionPairs.length > 0 ||
      (questionCount >= minimumQuestionCount &&
        (maxCorrectPositionRatio > maxPositionRatio ||
          correctUniqueLongestRatio > uniqueLongestRatio ||
          correctUniqueShortestRatio > uniqueShortestRatio ||
          clearLengthOutlierCount > 0)),
  };
}
