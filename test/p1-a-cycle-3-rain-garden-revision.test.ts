import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4,
  p1ACycle3QuestionVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import {
  assessMultipleChoicePackageQuality,
  assessOptionLengthQuality,
} from "../src/curriculum/option-length-quality.js";

describe("Cycle 3 rain-garden station version 4 candidate", () => {
  it("preserves the published v3 question and creates distinct unreleased v4 identifiers", () => {
    const exercise = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises.find(
      (item) => item.key === "p1a-v3-evidence-practice",
    );
    expect(exercise?.questions.map((item) => item.correctOptionId)).toEqual(["a", "d", "c"]);
    expect(EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4.publicationApproved).toBe(false);
    expect(EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4.editorialReviewStatus).toBe(
      "REVIEW_REQUIRED",
    );
    expect(EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4.templateVersionId).not.toBe(
      "p1a-v3-templateVersion-p1a-v3-evidence-practice-v3",
    );
    for (const question of EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4.questions) {
      expect(
        EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4.questionVersionId(question.key),
      ).not.toBe(
        p1ACycle3QuestionVersionId(
          EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4.exerciseKey,
          question.key,
        ),
      );
    }
  });

  it("separates explicit information, cause/effect and a bounded multi-detail inference", () => {
    const revision = EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4;
    expect(revision.questions.map((item) => item.prompt)).toEqual([
      "Çukur alanlar yağmur suyunu ne kadar süre tuttu?",
      "Çukur alanların suyu tutmasının ardından metinde hangi neden-sonuç ilişkisi veriliyor?",
      "Suyun iki ayrı sonucunu birlikte düşününce yağmur bahçesiyle ilgili hangi çıkarım desteklenir?",
    ]);
    expect(revision.questions[0]?.options.find((item) => item.id === "b")?.text).toBe(
      "Yalnızca kısa bir süre",
    );
    expect(revision.questions[1]?.options.find((item) => item.id === "c")?.text).toContain(
      "Bir bölümü toprağa geçer; başka bir bölümü",
    );
    expect(revision.questions[2]?.options.find((item) => item.id === "a")?.text).toBe(
      "Su, bahçeye iki ayrı yoldan katkı sağlar",
    );
    expect(revision.questions[1]?.explanation).toContain("iki ayrı sonucu birbirinden ayırır");
  });

  it("passes mechanical cue checks while remaining blocked for editorial review", () => {
    const revision = EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4;
    const report = assessMultipleChoicePackageQuality(
      revision.questions.map((item) => ({
        key: item.key,
        prompt: item.prompt,
        contentKey: revision.contentKey,
        skillCode: revision.skillCode,
        options: item.options,
        correctOptionId: item.correctOptionId,
        editorialReviewStatus: revision.editorialReviewStatus,
      })),
      { minimumQuestionCount: 1 },
    );
    expect(revision.questions.map((item) => item.correctOptionId)).toEqual(["b", "c", "a"]);
    expect(report.clearLengthOutlierCount).toBe(0);
    expect(report.correctUniqueLongestRatio).toBeLessThanOrEqual(0.5);
    expect(report.correctUniqueShortestRatio).toBeLessThanOrEqual(0.5);
    expect(report.maxCorrectPositionRatio).toBeLessThanOrEqual(0.45);
    expect(report.repeatedSkillQuestionPairs).toEqual([]);
    expect(report.editorialReviewQuestionKeys).toHaveLength(3);
    expect(
      revision.questions.every((item) => assessOptionLengthQuality(item)?.clearOutlier === false),
    ).toBe(true);
  });
});
