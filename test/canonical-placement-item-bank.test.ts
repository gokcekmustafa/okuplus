import { describe, expect, it } from "vitest";
import {
  CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST,
  validateCanonicalPlacementItemBankManifest,
} from "../src/curriculum/canonical-placement-item-bank.js";
import {
  CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE,
  validateCanonicalPlacementItemBankRevisionCandidate,
} from "../src/curriculum/canonical-placement-item-bank-revisions.js";
import { assessMultipleChoicePackageQuality } from "../src/curriculum/option-length-quality.js";

describe("canonical placement item bank v1", () => {
  it("validates the complete 36-item manifest", () => {
    expect(
      validateCanonicalPlacementItemBankManifest(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST),
    ).toEqual(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST);
    expect(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions).toHaveLength(36);
    expect(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.passages).toHaveLength(12);
    expect(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.calibrationStatus).toBe("NOT_CALIBRATED");
    expect(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.productionAssignmentEnabled).toBe(false);
  });

  it("contains no OPEN_ENDED questions and keeps all answer types deterministic", () => {
    expect(
      new Set(
        CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map((question) => question.questionType),
      ),
    ).toEqual(new Set(["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK"]));
    expect(
      CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.every(
        (question) => question.questionType !== "OPEN_ENDED",
      ),
    ).toBe(true);
  });

  it("records targeted revision metadata and preserves the placement blueprint", () => {
    const revisedIds = CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions
      .filter((question) => question.revisionReason)
      .map((question) => question.stableQuestionId);

    expect(revisedIds).toEqual([
      "PLV1-Q003",
      "PLV1-Q005",
      "PLV1-Q006",
      "PLV1-Q007",
      "PLV1-Q008",
      "PLV1-Q010",
      "PLV1-Q012",
      "PLV1-Q013",
      "PLV1-Q015",
      "PLV1-Q018",
      "PLV1-Q019",
      "PLV1-Q020",
      "PLV1-Q022",
      "PLV1-Q023",
      "PLV1-Q026",
      "PLV1-Q027",
      "PLV1-Q028",
      "PLV1-Q029",
      "PLV1-Q030",
      "PLV1-Q031",
      "PLV1-Q032",
      "PLV1-Q034",
      "PLV1-Q035",
      "PLV1-Q036",
    ]);
    expect(
      CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.reduce<Record<string, number>>(
        (counts, question) => {
          counts[question.questionType] = (counts[question.questionType] ?? 0) + 1;
          return counts;
        },
        {},
      ),
    ).toEqual({ MULTIPLE_CHOICE: 9, TRUE_FALSE: 9, MATCHING: 9, FILL_BLANK: 9 });
    expect(
      CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.reduce<Record<string, number>>(
        (counts, question) => {
          const key = `${question.skillCode}:${question.difficultyLabel}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        },
        {},
      ),
    ).toEqual({
      "RC_MAIN_IDEA:EASY": 4,
      "RC_MAIN_IDEA:MEDIUM": 4,
      "RC_MAIN_IDEA:HARD": 4,
      "RC_DETAIL:EASY": 4,
      "RC_DETAIL:MEDIUM": 4,
      "RC_DETAIL:HARD": 4,
      "RC_INFERENCE:EASY": 4,
      "RC_INFERENCE:MEDIUM": 4,
      "RC_INFERENCE:HARD": 4,
    });
  });

  it("keeps the First Real Pack manifest independent", () => {
    expect(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions[0]?.contentId).toMatch(/^PLV1-C/u);
    expect(CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions).not.toHaveLength(0);
  });

  it("keeps the original bank immutable and validates the unpublished v1.0.2 QA candidate", () => {
    expect(CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.manifestVersion).toBe("1.0.2");
    expect(CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.lifecycle).toBe("DESIGN_ONLY");
    expect(CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.productionAssignmentEnabled).toBe(
      false,
    );
    expect(CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.publicationApproved).toBe(false);
    expect(
      validateCanonicalPlacementItemBankRevisionCandidate(
        CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE,
      ),
    ).toEqual(CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE);

    const sourceById = new Map(
      CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map((question) => [
        question.stableQuestionId,
        question,
      ]),
    );
    const candidateById = new Map(
      CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.questions.map((question) => [
        question.stableQuestionId,
        question,
      ]),
    );
    const changedQuestionIds = [...candidateById].flatMap(([id, candidate]) =>
      JSON.stringify(candidate) === JSON.stringify(sourceById.get(id)) ? [] : [id],
    );
    expect(changedQuestionIds).toEqual([
      "PLV1-Q001",
      "PLV1-Q010",
      "PLV1-Q015",
      "PLV1-Q017",
      "PLV1-Q021",
      "PLV1-Q025",
      "PLV1-Q029",
      "PLV1-Q033",
    ]);
  });

  it("balances placement candidate answer positions and removes its four clear length cues", () => {
    const questions = CANONICAL_PLACEMENT_ITEM_BANK_REVISION_CANDIDATE.questions
      .filter(
        (question) =>
          question.questionType === "MULTIPLE_CHOICE" &&
          question.correctAnswer.type === "MULTIPLE_CHOICE",
      )
      .map((question) => ({
        key: question.stableQuestionId,
        prompt: question.questionText,
        contentKey: question.contentId,
        skillCode: question.skillCode,
        options: [...question.options].sort((left, right) => left.position - right.position),
        correctOptionId: question.correctAnswer.correctOptionIds[0]!,
        editorialReviewStatus: "REVIEW_REQUIRED" as const,
      }));
    const report = assessMultipleChoicePackageQuality(questions, { minimumQuestionCount: 1 });

    expect(questions).toHaveLength(9);
    expect(report.correctPositionCounts).toEqual({ A: 3, B: 2, C: 2, D: 2 });
    expect(report.clearLengthOutlierCount).toBe(0);
    expect(report.correctUniqueLongestRatio).toBeLessThanOrEqual(0.5);
    expect(report.correctUniqueShortestRatio).toBeLessThanOrEqual(0.5);
    expect(report.editorialReviewQuestionKeys).toHaveLength(9);
    expect(report.needsEditorialReview).toBe(true);

    for (const question of questions) {
      const source = sourceByIdForPlacement(question.key);
      expect(question.correctOptionId).toBe(source.correctAnswer.correctOptionIds[0]);
    }
  });
});

function sourceByIdForPlacement(questionId: string) {
  return CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.find(
    (question) => question.stableQuestionId === questionId,
  )!;
}
