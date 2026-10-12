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
