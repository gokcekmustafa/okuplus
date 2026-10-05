import { describe, expect, it } from "vitest";
import {
  FOUNDATION_ACHIEVEMENT_CATALOG,
  GAMIFICATION_EVENT_TYPES,
  GAMIFICATION_REWARD_RULES,
  calculateGamificationStreakTransition,
} from "../src/modules/gamification/index.js";

describe("gamification foundation kuralları", () => {
  it("event türleri için puan kuralları gamification katmanında tanımlıdır", () => {
    expect(GAMIFICATION_EVENT_TYPES).toEqual([
      "ASSIGNMENT_COMPLETED",
      "TRAINING_COMPLETED",
      "LEARNING_ACTIVITY_COMPLETED",
    ]);
    expect(GAMIFICATION_REWARD_RULES.ASSIGNMENT_COMPLETED.points).toBe(60);
    expect(GAMIFICATION_REWARD_RULES.TRAINING_COMPLETED.points).toBe(15);
    expect(GAMIFICATION_REWARD_RULES.LEARNING_ACTIVITY_COMPLETED.points).toBe(10);
  });

  it("ilk achievement kataloğu akademik başarı eşiği uydurmaz", () => {
    expect(FOUNDATION_ACHIEVEMENT_CATALOG.map((item) => item.code)).toEqual([
      "FIRST_ASSIGNMENT",
      "FIRST_STUDY",
      "FIVE_STUDIES",
    ]);
    expect(FOUNDATION_ACHIEVEMENT_CATALOG.map((item) => item.name)).toEqual([
      "İlk ödev",
      "İlk çalışma",
      "5 çalışma",
    ]);
  });

  it("aynı takvim günü streak'i artırmaz ve sonraki gün yalnızca bir artırır", () => {
    const first = calculateGamificationStreakTransition({
      previousDate: null,
      previousCurrentDays: 0,
      previousLongestDays: 0,
      activityDate: new Date("2026-02-01T10:00:00Z"),
    });
    const replay = calculateGamificationStreakTransition({
      previousDate: first.lastActivityDate,
      previousCurrentDays: first.currentDays,
      previousLongestDays: first.longestDays,
      activityDate: new Date("2026-02-01T22:00:00Z"),
    });
    const nextDay = calculateGamificationStreakTransition({
      previousDate: replay.lastActivityDate,
      previousCurrentDays: replay.currentDays,
      previousLongestDays: replay.longestDays,
      activityDate: new Date("2026-02-02T09:00:00Z"),
    });

    expect(replay).toMatchObject({ currentDays: 1, longestDays: 1 });
    expect(nextDay).toMatchObject({ currentDays: 2, longestDays: 2 });
  });
});
