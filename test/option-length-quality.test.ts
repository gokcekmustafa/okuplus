import { describe, expect, it } from "vitest";
import { MULTIPLE_CHOICE_SOURCE_PACKAGES } from "../src/curriculum/multiple-choice-source-catalog.js";
import {
  assessMultipleChoicePackageQuality,
  assessOptionLengthQuality,
  normalizedOptionLength,
} from "../src/curriculum/option-length-quality.js";

describe("multiple-choice option length quality", () => {
  it("normalizes whitespace and punctuation without requiring mechanically equal lengths", () => {
    expect(normalizedOptionLength("  Kanıt-ilişkisidir! ")).toBe(
      normalizedOptionLength("Kanıt ilişkisidir"),
    );
    expect(
      assessOptionLengthQuality({
        correctOptionId: "a",
        options: [
          { id: "a", text: "Açıklama" },
          { id: "b", text: "Kısa yanıt" },
          { id: "c", text: "Başka" },
        ],
      })?.clearOutlier,
    ).toBe(false);
  });

  it("flags a clear long or short correct-answer length cue for editorial review", () => {
    const long = assessOptionLengthQuality({
      correctOptionId: "a",
      options: [
        { id: "a", text: "Metindeki bütün kanıtları birlikte değerlendiren açıklama" },
        { id: "b", text: "Kısa seçenek" },
        { id: "c", text: "Başka seçenek" },
        { id: "d", text: "Yanlış" },
      ],
    });
    const short = assessOptionLengthQuality({
      correctOptionId: "a",
      options: [
        { id: "a", text: "Evet" },
        { id: "b", text: "Başka makul yanıt" },
        { id: "c", text: "Uygun olmayan başka bir açıklama" },
        { id: "d", text: "Metinle uyuşmayan seçenek" },
      ],
    });

    expect(long?.correctUniqueLongest).toBe(true);
    expect(long?.clearOutlier).toBe(true);
    expect(short?.correctUniqueShortest).toBe(true);
    expect(short?.clearOutlier).toBe(true);
  });

  it("audits every multiple-choice source and protects unreleased/corrected packages", () => {
    const currentSources = MULTIPLE_CHOICE_SOURCE_PACKAGES.filter(
      (item) => item.status === "SOURCE_CURRENT",
    );
    expect(currentSources.flatMap((item) => item.questions)).toHaveLength(144);
    const designOnly = MULTIPLE_CHOICE_SOURCE_PACKAGES.filter(
      (item) => item.status === "DESIGN_ONLY_CANDIDATE",
    );
    expect(designOnly).toHaveLength(1);
    expect(designOnly[0]!.questions.length).toBeGreaterThan(0);
    expect(assessMultipleChoicePackageQuality(designOnly[0]!.questions).needsEditorialReview).toBe(
      true,
    );
    expect(
      currentSources
        .flatMap((item) => item.questions)
        .filter((question) => assessOptionLengthQuality(question)?.clearOutlier),
    ).toHaveLength(6);

    const releaseCandidates = MULTIPLE_CHOICE_SOURCE_PACKAGES.filter((item) =>
      ["UNRELEASED_CANDIDATE", "VERSIONED_REVISION_CANDIDATE"].includes(item.status),
    );
    expect(releaseCandidates.length).toBeGreaterThan(0);
    for (const source of releaseCandidates) {
      const report = assessMultipleChoicePackageQuality(source.questions, {
        minimumQuestionCount: 1,
      });
      if (source.revisionKind !== "OPTION_ORDER_ONLY") {
        expect(report.correctUniqueLongestRatio).toBeLessThanOrEqual(0.5);
        expect(report.correctUniqueShortestRatio).toBeLessThanOrEqual(0.5);
      }
      expect(report.maxCorrectPositionRatio).toBeLessThanOrEqual(0.45);
      expect(report.clearLengthOutlierCount).toBe(0);
      expect(report.repeatedSkillQuestionPairs).toEqual([]);
      expect(report.editorialReviewQuestionKeys).toEqual(source.questions.map((item) => item.key));
      expect(report.needsEditorialReview).toBe(true);
    }
  });
});
