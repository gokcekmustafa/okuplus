export type ProgressAttempt = {
  isCorrect: boolean | null;
  rawScore: number | null;
};

export function summarizeProgressAttempts(attempts: readonly ProgressAttempt[]) {
  const scoredAttempts = attempts.filter(
    (attempt) => typeof attempt.rawScore === "number" && Number.isFinite(attempt.rawScore),
  );
  return {
    attemptCount: attempts.length,
    scoredCount: scoredAttempts.length,
    correctCount: scoredAttempts.filter((attempt) => attempt.isCorrect === true).length,
  };
}
