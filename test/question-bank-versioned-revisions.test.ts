import { describe, expect, it } from "vitest";
import { EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM } from "../src/curriculum/education-v2-p1-a-cycle-v2-program.js";
import { EDUCATION_V2_P1_A_CYCLE_3_PROGRAM } from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import {
  assertQuestionOptionPermutation,
  QUESTION_BANK_VERSIONED_REVISION_CANDIDATES,
} from "../src/curriculum/question-bank-versioned-revisions.js";
import { assessMultipleChoicePackageQuality } from "../src/curriculum/option-length-quality.js";

describe("versioned multiple-choice question revisions", () => {
  it("requires every option patch to preserve the exact unique option ID set", () => {
    const options = [
      { id: "a", text: "Bir" },
      { id: "b", text: "İki" },
      { id: "c", text: "Üç" },
      { id: "d", text: "Dört" },
    ];

    expect(() =>
      assertQuestionOptionPermutation("q-1", options, [
        { id: "c", text: "Üç" },
        { id: "a", text: "Bir" },
        { id: "d", text: "Dört" },
        { id: "b", text: "İki" },
      ]),
    ).not.toThrow();
    expect(() => assertQuestionOptionPermutation("q-1", options, options.slice(0, 3))).toThrow(
      /tam bir permütasyonu/u,
    );
    expect(() =>
      assertQuestionOptionPermutation("q-1", options, [
        { id: "a", text: "Bir" },
        { id: "a", text: "Yinelenen" },
        { id: "c", text: "Üç" },
        { id: "d", text: "Dört" },
      ]),
    ).toThrow(/tam bir permütasyonu/u);
  });

  it("keeps existing source versions intact and gives changed questions new version IDs", () => {
    const contentCandidates = QUESTION_BANK_VERSIONED_REVISION_CANDIDATES.filter(
      (candidate) => candidate.revisionKind === "QUESTION_CONTENT",
    );
    expect(contentCandidates).toHaveLength(2);
    const cycle2 = contentCandidates.find((candidate) => candidate.baseProgramVersion === 2)!;
    const cycle3 = contentCandidates.find((candidate) => candidate.baseProgramVersion === 3)!;

    expect(cycle2.changedQuestions.map((item) => item.questionKey)).toEqual([
      "p1a-v2-evidence-practice-2",
      "p1a-v2-structure-reinforcement-2",
      "p1a-v2-transfer-practice-2",
      "p1a-v2-assessment-4",
    ]);
    expect(cycle3.changedQuestions.map((item) => item.questionKey)).toEqual([
      "p1a-v3-evidence-practice-1",
      "p1a-v3-evidence-practice-2",
      "p1a-v3-evidence-practice-3",
      "p1a-v3-evidence-reinforcement-2",
      "p1a-v3-assessment-1",
    ]);

    for (const candidate of [cycle2, cycle3]) {
      expect(candidate.publicationApproved).toBe(false);
      expect(candidate.editorialReviewStatus).toBe("REVIEW_REQUIRED");
      for (const item of candidate.changedQuestions) {
        expect(item.questionVersionId).not.toBe(item.baseQuestionVersionId);
        const sourceProgram =
          candidate.baseProgramVersion === 2
            ? EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM
            : EDUCATION_V2_P1_A_CYCLE_3_PROGRAM;
        const sourceQuestion = sourceProgram.exercises
          .flatMap((exercise) => exercise.questions)
          .find((question) => question.key === item.questionKey)!;
        if (item.answerKeyChanged) {
          expect(candidate.baseProgramVersion).toBe(3);
          expect(item.questionKey).toMatch(/^p1a-v3-evidence-practice-[123]$/u);
          expect(item.answerKeyCorrectionReason).toBeTruthy();
        } else {
          expect(item.question.correctOptionId).toBe(sourceQuestion.correctOptionId);
          expect(item.answerKeyCorrectionReason).toBeUndefined();
        }
        expect(item.question.options.map((option) => option.id)).toEqual(
          sourceQuestion.options.map((option) => option.id),
        );
      }
      expect(candidate.changedQuestions.filter((item) => item.answerKeyChanged)).toHaveLength(
        candidate.baseProgramVersion === 3 ? 3 : 0,
      );
      expect(candidate.templateVersions.length).toBeGreaterThan(0);
      for (const template of candidate.templateVersions) {
        expect(template.templateVersionId).not.toBe(template.baseTemplateVersionId);
        expect(template.questionVersionIds.length).toBeGreaterThan(0);
      }
    }
  });

  it("removes mechanical length outliers without claiming editorial verification", () => {
    for (const candidate of QUESTION_BANK_VERSIONED_REVISION_CANDIDATES) {
      const report = assessMultipleChoicePackageQuality(candidate.questions, {
        minimumQuestionCount: 1,
      });
      expect(report.clearLengthOutlierCount, candidate.key).toBe(0);
      expect(report.maxCorrectPositionRatio, candidate.key).toBeLessThanOrEqual(0.45);
      expect(report.editorialReviewQuestionKeys).toHaveLength(candidate.questions.length);
      expect(report.needsEditorialReview).toBe(true);
      if (candidate.revisionKind === "OPTION_ORDER_ONLY") {
        expect(candidate.changedQuestions.every((item) => !item.answerKeyChanged)).toBe(true);
      } else {
        expect(report.correctUniqueLongestRatio, candidate.key).toBeLessThanOrEqual(0.5);
        expect(report.correctUniqueShortestRatio, candidate.key).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
