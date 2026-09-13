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

const STAGING_PROJECT_HOST = /^okuplus-[a-z0-9-]+-gokcekmustafas-projects\.vercel\.app$/u;

export const MINIMUM_VALIDATION_ATTEMPTS = 2;

/**
 * Requires an explicit staging deployment URL. The stable staging alias is
 * accepted only when the caller provides it explicitly; there is no implicit
 * fallback to an alias that may point at an older deployment.
 */
export function validateStagingBaseUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error("BASE_URL gerekli; doğrulanmış staging deployment URL'sini açıkça verin");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("BASE_URL geçerli bir URL olmalı");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !STAGING_PROJECT_HOST.test(parsed.hostname)
  ) {
    throw new Error(
      `BASE_URL reddedildi: yalnızca açıkça verilen okuplus staging deployment URL'si kullanılabilir (${parsed.origin})`,
    );
  }

  return parsed.origin;
}

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
