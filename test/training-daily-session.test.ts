import { describe, expect, it } from "vitest";
import {
  DAILY_TRAINING_COMPOSITION,
  dailySessionDateKey,
  planDailyTraining,
  utcSessionDate,
  type DailyTrainingCandidate,
} from "../src/modules/training/daily-session.js";

function candidates(): DailyTrainingCandidate[] {
  return [
    {
      templateVersionId: "attention-1",
      family: "ATTENTION_BURST",
      competency: "FAST_ATTENTION",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "recognition-1",
      family: "RAPID_RECOGNITION",
      competency: "FAST_RECOGNITION",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "chunking-1",
      family: "PHRASE_CHUNKING",
      competency: "FAST_CHUNKING",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "main-1",
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "detail-1",
      family: "DETAIL_EVIDENCE",
      competency: "RC_DETAIL",
      difficulty: "FOUNDATION",
    },
    {
      templateVersionId: "inference-1",
      family: "INFERENCE",
      competency: "RC_INFERENCE",
      difficulty: "CHALLENGING",
    },
  ];
}

describe("daily training planner", () => {
  it("keeps the fixed six-item composition and deterministic order", () => {
    const plan = planDailyTraining(candidates());

    expect(plan).toMatchObject({ version: 1, totalItems: 6 });
    expect(plan.items.map((item) => item.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.items.map((item) => item.family)).toEqual(
      DAILY_TRAINING_COMPOSITION.map((item) => item.family),
    );
    expect(plan.items.map((item) => item.templateVersionId)).toEqual([
      "attention-1",
      "recognition-1",
      "chunking-1",
      "main-1",
      "detail-1",
      "inference-1",
    ]);
  });

  it("preserves competency and difficulty metadata for future routing", () => {
    const plan = planDailyTraining(candidates());

    expect(plan.items.map((item) => item.competency)).toEqual([
      "FAST_ATTENTION",
      "FAST_RECOGNITION",
      "FAST_CHUNKING",
      "RC_MAIN_IDEA",
      "RC_DETAIL",
      "RC_INFERENCE",
    ]);
    expect(plan.items.map((item) => item.difficulty)).toEqual([
      "FOUNDATION",
      "FOUNDATION",
      "FOUNDATION",
      "FOUNDATION",
      "FOUNDATION",
      "CHALLENGING",
    ]);
  });

  it("fails closed instead of repeating a single family graph", () => {
    expect(() =>
      planDailyTraining(candidates().filter((item) => item.family !== "INFERENCE")),
    ).toThrow("INFERENCE için günlük antrenmanda yayınlanmış egzersiz gerekli");
  });

  it("normalizes the daily uniqueness key in UTC", () => {
    const now = new Date("2026-09-07T23:30:00.000Z");
    expect(dailySessionDateKey(now)).toBe("2026-09-07");
    expect(utcSessionDate(now).toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("does not include placement in the planner composition", () => {
    expect(DAILY_TRAINING_COMPOSITION.some((item) => item.family === "PLACEMENT")).toBe(false);
  });

  it("fails closed when any one of the six families has no candidate", () => {
    expect(() =>
      planDailyTraining(candidates().filter((item) => item.family !== "RAPID_RECOGNITION")),
    ).toThrow("RAPID_RECOGNITION için günlük antrenmanda yayınlanmış egzersiz gerekli");
  });
});
