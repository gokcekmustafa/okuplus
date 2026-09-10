import { describe, expect, it } from "vitest";
import {
  MINIMUM_VALIDATION_ATTEMPTS,
  planQuotaAwareAttempts,
} from "../scripts/browser-student-full-e2e-policy.js";

describe("staging student E2E quota policy", () => {
  it("free quota tüm soruları karşılıyorsa tamamlama bütçesi verir", () => {
    expect(
      planQuotaAwareAttempts(
        { plan: "PLAN_FREE", dailyLimit: 20, usedToday: 0, remainingToday: 20 },
        6,
      ),
    ).toMatchObject({
      maxSafeAttempts: 6,
      plannedAttemptCount: 6,
      fullCompletionPossible: true,
      completionBlockedByQuota: false,
    });
  });

  it("36 soruluk günlük planı 20 free soru kotasıyla iki kritik attempt'e indirir", () => {
    expect(
      planQuotaAwareAttempts(
        { plan: "PLAN_FREE", dailyLimit: 20, usedToday: 0, remainingToday: 20 },
        36,
      ),
    ).toMatchObject({
      quotaLimit: 20,
      quotaUsedAtStart: 0,
      quotaRemainingAtStart: 20,
      maxSafeAttempts: 20,
      plannedAttemptCount: MINIMUM_VALIDATION_ATTEMPTS,
      fullCompletionPossible: false,
      completionBlockedByQuota: true,
    });
  });

  it("kota sıfırsa attempt bütçesi vermez ve tamamlamayı PASS saymaz", () => {
    expect(
      planQuotaAwareAttempts(
        { plan: "PLAN_FREE", dailyLimit: 20, usedToday: 20, remainingToday: 0 },
        36,
      ),
    ).toMatchObject({
      maxSafeAttempts: 0,
      plannedAttemptCount: 0,
      fullCompletionPossible: false,
      completionBlockedByQuota: true,
    });
  });

  it("premium/unlimited quota için mevcut unanswered sorular kadar planlar", () => {
    expect(
      planQuotaAwareAttempts(
        { plan: "PLAN_PREMIUM", dailyLimit: null, usedToday: 100, remainingToday: null },
        36,
      ),
    ).toMatchObject({
      quotaLimit: null,
      maxSafeAttempts: 36,
      plannedAttemptCount: 36,
      fullCompletionPossible: true,
      completionBlockedByQuota: false,
    });
  });
});
