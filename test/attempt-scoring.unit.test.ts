import { describe, expect, it, vi } from "vitest";
import { formatAttemptServerTiming, scoreAttemptValue } from "../src/modules/questions/service.js";
import { reorderOptionsForSession } from "../src/modules/questions/session-option-order.js";

vi.mock("../src/lib/prisma.js", () => ({ prisma: {} }));

describe("attempt performance helpers", () => {
  it("scores from the already loaded question version snapshot", () => {
    expect(
      scoreAttemptValue(
        {
          options: [
            { id: "a", text: "Birinci" },
            { id: "b", text: "İkinci" },
          ],
          correctAnswer: {
            type: "MULTIPLE_CHOICE",
            correctOptionIds: ["b"],
            allowMultiple: false,
            partialCredit: false,
          },
          question: { type: "MULTIPLE_CHOICE" },
        },
        ["b"],
      ),
    ).toEqual({ isCorrect: true, rawScore: 1 });
  });

  it("scores the same option id after its displayed position changes", () => {
    const displayedOptions = reorderOptionsForSession(
      [
        { id: "a", text: "Birinci" },
        { id: "b", text: "İkinci" },
        { id: "c", text: "Üçüncü" },
        { id: "d", text: "Dördüncü" },
      ],
      "session-with-reordered-options:question-1",
    );

    expect(displayedOptions.findIndex((option) => option.id === "b")).not.toBe(1);
    expect(
      scoreAttemptValue(
        {
          options: displayedOptions,
          correctAnswer: {
            type: "MULTIPLE_CHOICE",
            correctOptionIds: ["b"],
            allowMultiple: false,
            partialCredit: false,
          },
          question: { type: "MULTIPLE_CHOICE" },
        },
        ["b"],
      ),
    ).toEqual({ isCorrect: true, rawScore: 1 });
  });

  it("formats only safe phase durations for Server-Timing", () => {
    expect(
      formatAttemptServerTiming({
        validationMs: 1.234,
        scoringMs: 0,
        persistenceMs: 12.345,
        rewardMs: Number.NaN,
        totalMs: 14.9,
      }),
    ).toBe("validation;dur=1.2, scoring;dur=0, persistence;dur=12.3, total;dur=14.9");
  });
});
