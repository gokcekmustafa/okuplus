import { describe, expect, it } from "vitest";
import {
  CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST,
  validateCanonicalPlacementItemBankManifest,
} from "../src/curriculum/canonical-placement-item-bank.js";

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
});
