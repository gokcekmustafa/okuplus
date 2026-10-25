import { FAST_READING_FAMILIES } from "./exercise-contract.js";

export type FastReadingMeasurement = {
  status: "RECORDED" | "NOT_RECORDED";
  durationSource: "VISIBLE_FOREGROUND_CLIENT_TIMER";
  activeReadingDurationMs: number | null;
  wordCount: number;
  wordsPerMinute: number | null;
  comprehensionAccuracy: number | null;
  speedEligible: boolean;
};

export function countReadingWords(texts: readonly string[]): number {
  return texts.reduce(
    (total, text) => total + (text.trim() ? text.trim().split(/\s+/u).length : 0),
    0,
  );
}

export function buildFastReadingMeasurement(input: {
  family: string;
  readingDurationMs?: number;
  sessionAgeMs: number;
  contentBodies: readonly string[];
  comprehensionAccuracy: number | null;
}): FastReadingMeasurement | null {
  if (!FAST_READING_FAMILIES.includes(input.family as (typeof FAST_READING_FAMILIES)[number])) {
    return null;
  }

  const wordCount = countReadingWords(input.contentBodies);
  const duration = input.readingDurationMs;
  const validDuration =
    typeof duration === "number" &&
    Number.isInteger(duration) &&
    duration >= 1_000 &&
    duration <= 3_600_000 &&
    duration <= Math.max(0, input.sessionAgeMs);
  const wordsPerMinute =
    validDuration && wordCount > 0 ? Math.round((wordCount * 60_000) / duration) : null;
  const accuracy = input.comprehensionAccuracy;
  const speedEligible =
    wordsPerMinute !== null &&
    wordsPerMinute >= 30 &&
    wordsPerMinute <= 1_200 &&
    accuracy !== null &&
    accuracy >= 0.75;

  return {
    status: validDuration && wordCount > 0 ? "RECORDED" : "NOT_RECORDED",
    durationSource: "VISIBLE_FOREGROUND_CLIENT_TIMER",
    activeReadingDurationMs: validDuration && wordCount > 0 ? duration : null,
    wordCount,
    wordsPerMinute: validDuration && wordCount > 0 ? wordsPerMinute : null,
    comprehensionAccuracy: accuracy,
    speedEligible,
  };
}
