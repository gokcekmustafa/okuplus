export const MAX_TRAINING_ATTEMPTS_PER_QUESTION = 2;

export type TrainingAttemptState = {
  isCorrect: boolean | null;
};

export type TrainingAttemptDecision =
  | { allowed: true; responseOrder: 1 | 2 }
  | {
      allowed: false;
      reason: "ALREADY_CORRECT" | "MAX_ATTEMPTS_REACHED" | "PENDING_EVALUATION";
    };

/**
 * Training soruları için retry kararı. Bu fonksiyon yalnızca mevcut immutable
 * attempt geçmişini okur; puanlama veya ödül üretmez.
 */
export function decideTrainingAttempt(
  previousAttempts: readonly TrainingAttemptState[],
): TrainingAttemptDecision {
  if (previousAttempts.some((attempt) => attempt.isCorrect === true)) {
    return { allowed: false, reason: "ALREADY_CORRECT" };
  }
  if (previousAttempts.some((attempt) => attempt.isCorrect === null)) {
    return { allowed: false, reason: "PENDING_EVALUATION" };
  }
  if (previousAttempts.length >= MAX_TRAINING_ATTEMPTS_PER_QUESTION) {
    return { allowed: false, reason: "MAX_ATTEMPTS_REACHED" };
  }
  return { allowed: true, responseOrder: previousAttempts.length === 0 ? 1 : 2 };
}
