import { describe, expect, it } from "vitest";
import {
  collectUniqueMultipleChoiceQuestions,
  MULTIPLE_CHOICE_SOURCE_PACKAGES,
} from "../src/curriculum/multiple-choice-source-catalog.js";
import { reorderQuestionOptionSetsForSession } from "../src/modules/questions/session-option-order.js";

const sourceCurrent = MULTIPLE_CHOICE_SOURCE_PACKAGES.filter(
  (source) => source.status === "SOURCE_CURRENT",
);
const uniqueVersions = collectUniqueMultipleChoiceQuestions(sourceCurrent).flatMap((group) =>
  group.versions.map((question, versionIndex) => ({
    questionVersionId: `${group.sourceQuestionId}:${question.sourceVersionId ?? versionIndex}`,
    questionType: "MULTIPLE_CHOICE",
    options: question.options,
    correctOptionIds: [question.correctOptionId],
  })),
);
const fourChoiceQuestions = uniqueVersions.filter((question) => question.options.length === 4);
const ORDER_SECRET = "answer-position-balance-secret-for-tests-only";

describe("student session answer-position balance", () => {
  it("rebalances catalogued source-position bias and removes predictable triples in full sessions", () => {
    const counts = [0, 0, 0, 0];
    let sourceForwardRuns = 0;
    let displayedForwardRuns = 0;
    const sourcePositions = fourChoiceQuestions.map((question) =>
      question.options.findIndex((option) => option.id === question.correctOptionIds[0]),
    );

    for (let index = 2; index < sourcePositions.length; index += 1) {
      const first = sourcePositions[index - 2]!;
      const second = sourcePositions[index - 1]!;
      const third = sourcePositions[index]!;
      if (second === first + 1 && third === second + 1) sourceForwardRuns += 1;
    }
    expect(fourChoiceQuestions.length).toBeGreaterThan(100);
    expect(sourceForwardRuns).toBeGreaterThan(0);

    for (let sessionIndex = 0; sessionIndex < 128; sessionIndex += 1) {
      const ordered = reorderQuestionOptionSetsForSession(
        fourChoiceQuestions,
        `catalog-session-${sessionIndex}`,
        ORDER_SECRET,
      );
      const displayedPositions = fourChoiceQuestions.map((question) => {
        const options = ordered.get(question.questionVersionId) as Array<{ id: string }>;
        return options.findIndex((option) => option.id === question.correctOptionIds[0]);
      });
      for (let index = 0; index < displayedPositions.length; index += 1) {
        const position = displayedPositions[index]!;
        expect(position).toBeGreaterThanOrEqual(0);
        counts[position]! += 1;
        if (index < 2) continue;
        const first = displayedPositions[index - 2]!;
        const second = displayedPositions[index - 1]!;
        const third = position;
        if (second === first + 1 && third === second + 1) displayedForwardRuns += 1;
        expect(second === first + 1 && third === second + 1).toBe(false);
        expect(second === first - 1 && third === second - 1).toBe(false);
        expect(first === second && second === third).toBe(false);
      }
    }

    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBe(fourChoiceQuestions.length * 128);
    expect(displayedForwardRuns).toBe(0);
    expect(Math.min(...counts) / total).toBeGreaterThan(0.22);
    expect(Math.max(...counts) / total).toBeLessThan(0.28);
  });
});
