export type PracticeQuestionQuota = {
  plan: string;
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
};

export type QuotaAwareAttemptPlan = {
  quotaLimit: number | null;
  quotaUsedAtStart: number;
  quotaRemainingAtStart: number | null;
  outstandingQuestionCount: number;
  maxSafeAttempts: number;
  plannedAttemptCount: number;
  fullCompletionPossible: boolean;
  completionBlockedByQuota: boolean;
};

export const MINIMUM_VALIDATION_ATTEMPTS = 2;

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} negatif olmayan bir tam sayı olmalı`);
  }
}

/**
 * Plans the smallest useful validation run without changing product quota
 * rules. When the remaining free quota cannot cover all unanswered questions,
 * only enough attempts for correct/incorrect scoring coverage are planned.
 */
export function planQuotaAwareAttempts(
  quota: PracticeQuestionQuota,
  outstandingQuestionCount: number,
  minimumValidationAttempts = MINIMUM_VALIDATION_ATTEMPTS,
): QuotaAwareAttemptPlan {
  assertNonNegativeInteger(quota.usedToday, "usedToday");
  assertNonNegativeInteger(outstandingQuestionCount, "outstandingQuestionCount");
  assertNonNegativeInteger(minimumValidationAttempts, "minimumValidationAttempts");
  if (quota.dailyLimit !== null) assertNonNegativeInteger(quota.dailyLimit, "dailyLimit");
  if (quota.remainingToday !== null) {
    assertNonNegativeInteger(quota.remainingToday, "remainingToday");
  }

  const fullCompletionPossible =
    quota.remainingToday === null || quota.remainingToday >= outstandingQuestionCount;
  const maxSafeAttempts =
    quota.remainingToday === null
      ? outstandingQuestionCount
      : Math.min(quota.remainingToday, outstandingQuestionCount);
  const plannedAttemptCount = fullCompletionPossible
    ? maxSafeAttempts
    : Math.min(maxSafeAttempts, minimumValidationAttempts);

  return {
    quotaLimit: quota.dailyLimit,
    quotaUsedAtStart: quota.usedToday,
    quotaRemainingAtStart: quota.remainingToday,
    outstandingQuestionCount,
    maxSafeAttempts,
    plannedAttemptCount,
    fullCompletionPossible,
    completionBlockedByQuota: !fullCompletionPossible,
  };
}
