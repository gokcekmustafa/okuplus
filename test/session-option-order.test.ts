import { describe, expect, it } from "vitest";
import {
  multipleChoiceCorrectOptionIds,
  reorderJsonOptionsForSession,
  reorderOptionsForSession,
  reorderQuestionOptionSetsForSession,
  shouldReorderStudentOptions,
} from "../src/modules/questions/session-option-order.js";

const letters = ["A", "B", "C", "D"];
const ORDER_SECRET = "session-option-order-test-secret-for-unit-tests";

function optionSet(correctPositions: readonly number[], prefix = "q") {
  return correctPositions.map((position, index) => ({
    questionVersionId: `${prefix}-${index}`,
    questionType: "MULTIPLE_CHOICE",
    options: letters.map((letter) => ({
      id: `${prefix}-${index}-${letter}`,
      text: `${letter} seçenek ${index}`,
      position: letters.indexOf(letter),
    })),
    correctOptionIds: [`${prefix}-${index}-${letters[position]}`],
  }));
}

function displayedPositions(questions: ReturnType<typeof optionSet>, sessionKey: string): number[] {
  const ordered = reorderQuestionOptionSetsForSession(questions, sessionKey, ORDER_SECRET);
  return questions.map((question) => {
    const correctId = question.correctOptionIds[0]!;
    const options = ordered.get(question.questionVersionId) as Array<{ id: string }>;
    return options.findIndex((option) => option.id === correctId);
  });
}

function hasForwardOrBackwardRun(values: readonly number[], optionCount = 4): boolean {
  return values.some((_, index) => {
    if (index < 2) return false;
    const first = values[index - 2]!;
    const second = values[index - 1]!;
    const third = values[index]!;
    const stepOne = (second - first + optionCount) % optionCount;
    const stepTwo = (third - second + optionCount) % optionCount;
    return (
      (stepOne === 1 && stepTwo === 1) ||
      (stepOne === optionCount - 1 && stepTwo === optionCount - 1)
    );
  });
}

function hasRepeatedTriple(values: readonly number[]): boolean {
  return values.some(
    (value, index) => index >= 2 && value === values[index - 1] && value === values[index - 2],
  );
}

describe("session option order", () => {
  it("retains option ids/text and stable order on repeat requests for one session", () => {
    const questions = optionSet([0, 1, 2]);
    const first = reorderQuestionOptionSetsForSession(
      questions,
      "persisted-session-1",
      ORDER_SECRET,
    );
    const second = reorderQuestionOptionSetsForSession(
      questions,
      "persisted-session-1",
      ORDER_SECRET,
    );

    for (const question of questions) {
      expect(second.get(question.questionVersionId)).toEqual(first.get(question.questionVersionId));
      const original = question.options;
      const displayed = first.get(question.questionVersionId) as typeof original;
      expect(displayed.map((option) => option.id).sort()).toEqual(
        original.map((option) => option.id).sort(),
      );
      expect(displayed.map((option) => option.text).sort()).toEqual(
        original.map((option) => option.text).sort(),
      );
      expect(
        displayed.findIndex((option) => option.id === question.correctOptionIds[0]),
      ).toBeGreaterThanOrEqual(0);
      expect(displayed.every((option, position) => option.position === position)).toBe(true);
    }
  });

  it("rejects ascending, descending, repeated and cycling patterns across varied sessions", () => {
    const sourcePatterns = [
      [0, 1, 2], // A→B→C
      [1, 2, 3], // B→C→D
      [3, 2, 1],
      [0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0, 1],
      [3, 0, 1, 2], // wraps across D→A→B
    ];
    for (const [patternIndex, source] of sourcePatterns.entries()) {
      for (let sessionIndex = 0; sessionIndex < 128; sessionIndex += 1) {
        const displayed = displayedPositions(
          optionSet(source, `source-${patternIndex}`),
          `session-${patternIndex}-${sessionIndex}`,
        );
        expect(hasForwardOrBackwardRun(displayed)).toBe(false);
        expect(hasRepeatedTriple(displayed)).toBe(false);
        for (let index = 3; index < displayed.length; index += 1) {
          expect(
            displayed[index - 3] === displayed[index - 1] &&
              displayed[index - 2] === displayed[index],
          ).toBe(false);
        }
      }
    }
  });

  it("varies between sessions without making every answer position distinct", () => {
    const questions = optionSet([0, 1, 2]);
    const sequences = Array.from({ length: 256 }, (_, index) =>
      displayedPositions(questions, `varied-session-${index}`),
    );
    expect(new Set(sequences.map((sequence) => sequence.join(""))).size).toBeGreaterThan(40);
    expect(sequences.some(([first, , third]) => first === third)).toBe(true);
    expect(sequences.some(([first, second, third]) => first === second || second === third)).toBe(
      true,
    );
    expect(
      sequences.some(([first, second, third]) => new Set([first, second, third]).size === 3),
    ).toBe(true);
  });

  it("checks answer-letter runs across questions with different option counts", () => {
    const questions = [
      {
        questionVersionId: "four-a",
        questionType: "MULTIPLE_CHOICE",
        options: letters.map((letter) => ({ id: `four-a-${letter}`, text: letter })),
        correctOptionIds: ["four-a-A"],
      },
      {
        questionVersionId: "three-b",
        questionType: "MULTIPLE_CHOICE",
        options: letters.slice(0, 3).map((letter) => ({ id: `three-b-${letter}`, text: letter })),
        correctOptionIds: ["three-b-B"],
      },
      {
        questionVersionId: "four-c",
        questionType: "MULTIPLE_CHOICE",
        options: letters.map((letter) => ({ id: `four-c-${letter}`, text: letter })),
        correctOptionIds: ["four-c-C"],
      },
    ];
    for (let index = 0; index < 128; index += 1) {
      const ordered = reorderQuestionOptionSetsForSession(
        questions,
        `mixed-count-session-${index}`,
        ORDER_SECRET,
      );
      const positions = questions.map((question) =>
        (ordered.get(question.questionVersionId) as Array<{ id: string }>).findIndex((option) =>
          question.correctOptionIds.includes(option.id),
        ),
      );
      expect(hasForwardOrBackwardRun(positions)).toBe(false);
    }
  });

  it("balances answer positions across many persisted sessions", () => {
    const questions = optionSet(Array.from({ length: 24 }, (_, index) => index % 4));
    const counts = [0, 0, 0, 0];
    for (let sessionIndex = 0; sessionIndex < 512; sessionIndex += 1) {
      for (const position of displayedPositions(questions, `balance-session-${sessionIndex}`)) {
        counts[position]! += 1;
      }
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBe(24 * 512);
    expect(Math.min(...counts) / total).toBeGreaterThan(0.22);
    expect(Math.max(...counts) / total).toBeLessThan(0.28);
  });

  it("preserves multiple-correct answers and supports different option counts", () => {
    const questions = [
      {
        questionVersionId: "multi",
        questionType: "MULTIPLE_CHOICE",
        options: ["a", "b", "c", "d"].map((id) => ({ id, text: id.toUpperCase() })),
        correctOptionIds: ["b", "d"],
      },
      {
        questionVersionId: "three-option",
        questionType: "MULTIPLE_CHOICE",
        options: ["x", "y", "z"].map((id) => ({ id, text: id.toUpperCase() })),
        correctOptionIds: ["y"],
      },
      {
        questionVersionId: "two-option",
        questionType: "MULTIPLE_CHOICE",
        options: ["m", "n"].map((id) => ({ id, text: id.toUpperCase() })),
        correctOptionIds: ["m"],
      },
      {
        questionVersionId: "open",
        questionType: "OPEN_ENDED",
        options: [],
        correctOptionIds: null,
      },
    ];
    const ordered = reorderQuestionOptionSetsForSession(
      questions,
      "mixed-option-session",
      ORDER_SECRET,
    );
    for (const question of questions) {
      const before = question.options;
      const after = ordered.get(question.questionVersionId) as typeof before;
      expect(after.map((option) => option.id).sort()).toEqual(
        before.map((option) => option.id).sort(),
      );
      expect(after.map((option) => option.text).sort()).toEqual(
        before.map((option) => option.text).sort(),
      );
      expect(after.filter((option) => question.correctOptionIds?.includes(option.id)).length).toBe(
        question.correctOptionIds?.length ?? 0,
      );
    }
  });

  it("does not alter malformed option data and validates correct-answer keys", () => {
    const malformed = [{ text: "Kimliksiz seçenek" }];
    const scalar = "not-an-option-list";
    expect(reorderJsonOptionsForSession(malformed, "session-1")).toEqual(malformed);
    expect(reorderJsonOptionsForSession(scalar, "session-1")).toBe(scalar);
    expect(
      multipleChoiceCorrectOptionIds({ type: "MULTIPLE_CHOICE", correctOptionIds: ["a"] }),
    ).toEqual(["a"]);
    expect(
      multipleChoiceCorrectOptionIds({ type: "MULTIPLE_CHOICE", correctOptionIds: ["a", "a"] }),
    ).toBeNull();
    expect(multipleChoiceCorrectOptionIds({ type: "TRUE_FALSE", answer: true })).toBeNull();
  });

  it("reorders every student-visible session context but never teacher/admin views", () => {
    for (const context of ["INDIVIDUAL", "ASSIGNMENT", "ASSESSMENT"] as const) {
      expect(shouldReorderStudentOptions(null, context, "MULTIPLE_CHOICE")).toBe(true);
    }
    expect(shouldReorderStudentOptions("TEACHER", "ASSIGNMENT", "MULTIPLE_CHOICE")).toBe(false);
    expect(shouldReorderStudentOptions("SUPER_ADMIN", "ASSESSMENT", "MULTIPLE_CHOICE")).toBe(false);
    expect(shouldReorderStudentOptions(null, "INDIVIDUAL", "TRUE_FALSE")).toBe(false);
  });

  it("keeps the original low-level permutation deterministic for ID-based scoring callers", () => {
    expect(
      reorderOptionsForSession([{ id: "x" }, { id: "y" }], "scoring-session:question"),
    ).toEqual(reorderOptionsForSession([{ id: "x" }, { id: "y" }], "scoring-session:question"));
  });
});
