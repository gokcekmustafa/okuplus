import { describe, expect, it } from "vitest";
import {
  REVIEW_COOLDOWN_HOURS,
  isReviewEligible,
  sortReviewItems,
  type ReviewItem,
} from "../src/modules/student-learning/review-service.js";

const now = new Date("2026-09-01T12:00:00.000Z");

function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    skillId: "skill",
    skillName: "Beceri",
    skillCode: "SKILL",
    templateVersionId: "template-version",
    templateTitle: "Tekrar seti",
    templateVersion: 1,
    lastAttemptAt: new Date("2026-08-28T12:00:00.000Z"),
    accuracy: 1,
    priority: "STANDARD",
    reason: "OLDER_ACTIVITY",
    ...overrides,
  };
}

describe("review foundation policy", () => {
  it("uses the documented 24-hour cooldown boundary", () => {
    expect(REVIEW_COOLDOWN_HOURS).toBe(24);
    expect(isReviewEligible(new Date("2026-08-31T12:00:00.000Z"), now)).toBe(true);
    expect(isReviewEligible(new Date("2026-08-31T12:00:00.001Z"), now)).toBe(false);
    expect(isReviewEligible(null, now)).toBe(false);
  });

  it("orders high-priority and lower-accuracy items deterministically", () => {
    const ordered = sortReviewItems([
      item({ skillId: "old", skillName: "Eski", lastAttemptAt: new Date("2026-08-20T12:00:00Z") }),
      item({ skillId: "high", skillName: "Zayıf", priority: "HIGH", accuracy: 0.2 }),
      item({ skillId: "high-2", skillName: "Daha zayıf", priority: "HIGH", accuracy: 0.1 }),
    ]);
    expect(ordered.map((entry) => entry.skillId)).toEqual(["high-2", "high", "old"]);
  });

  it("does not mutate the queue passed by the caller", () => {
    const original = [
      item({ skillId: "b" }),
      item({ skillId: "a", priority: "HIGH", accuracy: 0.1 }),
    ];
    const ordered = sortReviewItems(original);
    expect(original[0]?.skillId).toBe("b");
    expect(ordered[0]?.skillId).toBe("a");
  });
});
