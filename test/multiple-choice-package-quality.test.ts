import { describe, expect, it } from "vitest";
import {
  collectUniqueMultipleChoiceQuestions,
  MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS,
  MULTIPLE_CHOICE_SOURCE_PACKAGES,
} from "../src/curriculum/multiple-choice-source-catalog.js";
import { assessMultipleChoicePackageQuality } from "../src/curriculum/option-length-quality.js";

describe("multiple-choice package quality", () => {
  it("covers each real catalog source and reports package-level length and position patterns", () => {
    const keys = MULTIPLE_CHOICE_SOURCE_PACKAGES.map((item) => item.key);
    expect(keys).toContain("OKU-EDUCATION-V2-P0-FOUNDATION");
    expect(keys).toContain("OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-3");
    expect(keys).toContain("OKU-EDUCATION-V2-P1-B-FLUENCY-MEANING-CYCLE-2");
    expect(keys).toContain("OKU-EDUCATION-V2-P1-C-INFERENCE-EVIDENCE-CYCLE-2");
    expect(keys).toContain("OKU-EDUCATION-V2-P1-D-VOCABULARY-CONTEXT-CYCLE-2");
    expect(keys).toContain("OKU-8G8-FIRST-REAL-CURRICULUM:aksam-isigi-ve-beden-saati");
    expect(keys).toContain("OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1");
    expect(keys).toContain("OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1:1.0.2");
    expect(keys).toContain("OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1:1.0.3");
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const sequence = routeFamily === "A" ? 4 : 3;
      expect(keys).toContain(
        `EDU_V2_P1_${routeFamily}_EXPANSION_${sequence}_PROGRAM:SOURCE_QUESTIONS`,
      );
    }

    const reports = MULTIPLE_CHOICE_SOURCE_PACKAGES.map((source) => ({
      source,
      report: assessMultipleChoicePackageQuality(source.questions),
    }));
    expect(reports.every(({ report }) => report.questionCount > 0)).toBe(true);
    expect(
      reports.every(({ report }) =>
        ["A", "B", "C", "D"].every((key) => key in report.correctPositionCounts),
      ),
    ).toBe(true);
    expect(
      reports.every(
        ({ report }) =>
          report.correctUniqueLongestRatio >= 0 &&
          report.correctUniqueShortestRatio >= 0 &&
          report.clearLengthOutlierCount >= 0,
      ),
    ).toBe(true);

    const sourceQuestions = reports
      .filter(({ source }) => source.status === "SOURCE_CURRENT")
      .reduce((total, { report }) => total + report.questionCount, 0);
    expect(sourceQuestions).toBe(144);
    const sourceOutliers = reports
      .filter(({ source }) => source.status === "SOURCE_CURRENT")
      .reduce((total, { report }) => total + report.clearLengthOutlierCount, 0);
    expect(sourceOutliers).toBe(6);
    const newCandidates = reports.filter(({ source }) =>
      ["UNRELEASED_CANDIDATE", "VERSIONED_REVISION_CANDIDATE"].includes(source.status),
    );
    expect(newCandidates.map(({ source }) => source.status)).toContain("UNRELEASED_CANDIDATE");
    expect(newCandidates.map(({ source }) => source.status)).toContain(
      "VERSIONED_REVISION_CANDIDATE",
    );
    expect(
      reports
        .filter(({ source }) => source.key.includes("_EXPANSION_"))
        .reduce((total, { report }) => total + report.questionCount, 0),
    ).toBe(120);
    for (const { source, report } of newCandidates) {
      expect(report.clearLengthOutlierCount, source.key).toBe(0);
    }
    const placement = reports.find(({ source }) => source.status === "DESIGN_ONLY_CANDIDATE")!;
    expect(placement.report.questionCount).toBeGreaterThan(0);
    expect(placement.report.needsEditorialReview).toBe(true);
  });

  it("flags both long and short correct-answer outliers, without changing answer IDs", () => {
    const long = assessMultipleChoicePackageQuality(
      [
        {
          key: "q-long",
          options: [
            { id: "a", text: "Kısa" },
            { id: "b", text: "Bir başka kısa seçenek" },
            { id: "c", text: "Doğru yanıtı açıklayan çok daha uzun bir seçenek" },
            { id: "d", text: "Diğer" },
          ],
          correctOptionId: "c",
        },
      ],
      { minimumQuestionCount: 1 },
    );
    const short = assessMultipleChoicePackageQuality(
      [
        {
          key: "q-short",
          options: [
            { id: "a", text: "Evet" },
            { id: "b", text: "Bir seçenek daha" },
            { id: "c", text: "Başka bir makul seçenek" },
            { id: "d", text: "Dördüncü bir seçenek" },
          ],
          correctOptionId: "a",
        },
      ],
      { minimumQuestionCount: 1 },
    );

    expect(long.correctUniqueLongestCount).toBe(1);
    expect(long.clearLengthOutlierCount).toBe(1);
    expect(short.correctUniqueShortestCount).toBe(1);
    expect(short.clearLengthOutlierCount).toBe(1);
    expect(long.questionReports[0]?.correctPosition).toBe("C");
    expect(short.questionReports[0]?.key).toBe("q-short");
  });

  it("reports same-content same-skill lexical repeat candidates and unverified answers", () => {
    const report = assessMultipleChoicePackageQuality([
      {
        key: "q-1",
        prompt: "Metindeki ana düşünce nedir?",
        contentKey: "text-1",
        skillCode: "RC_MAIN_IDEA",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "C" },
          { id: "d", text: "D" },
        ],
        correctOptionId: "a",
      },
      {
        key: "q-2",
        prompt: "Metindeki ana düşünce nedir?",
        contentKey: "text-1",
        skillCode: "RC_MAIN_IDEA",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "C" },
          { id: "d", text: "D" },
        ],
        correctOptionId: "a",
        editorialReviewStatus: "VERIFIED",
      },
    ]);

    expect(report.repeatedSkillQuestionPairs).toEqual([
      {
        firstKey: "q-1",
        secondKey: "q-2",
        contentKey: "text-1",
        skillCode: "RC_MAIN_IDEA",
        promptSimilarity: 1,
      },
    ]);
    expect(report.editorialReviewQuestionKeys).toEqual(["q-1"]);
    expect(report.needsEditorialReview).toBe(true);
  });

  it("flags a package-level answer-position bias without changing the answer key", () => {
    const questions = Array.from({ length: 8 }, (_, index) => ({
      key: `q-${index}`,
      options: [
        { id: "a", text: "Doğru seçenek" },
        { id: "b", text: "Yanlış seçenek bir" },
        { id: "c", text: "Yanlış seçenek iki" },
        { id: "d", text: "Yanlış seçenek üç" },
      ],
      correctOptionId: "a",
      editorialReviewStatus: "VERIFIED" as const,
    }));
    const report = assessMultipleChoicePackageQuality(questions);

    expect(report.correctPositionCounts).toEqual({ A: 8, B: 0, C: 0, D: 0 });
    expect(report.maxCorrectPositionRatio).toBe(1);
    expect(report.needsEditorialReview).toBe(true);
  });

  it("retains text, key, explanation and immutable version IDs in a deduplicated audit dossier", () => {
    const unique = collectUniqueMultipleChoiceQuestions(MULTIPLE_CHOICE_SOURCE_PACKAGES);
    expect(unique).toHaveLength(309);
    const allVersions = unique.flatMap((item) => item.versions);
    expect(allVersions).toHaveLength(447);
    expect(
      allVersions.filter((version) => typeof version.sourceVersionId === "string"),
    ).toHaveLength(420);
    expect(
      MULTIPLE_CHOICE_SOURCE_PACKAGES.reduce(
        (total, source) => total + source.questions.length,
        0,
      ) - allVersions.length,
    ).toBe(57);
    expect(
      allVersions.every(
        (version) =>
          version.sourceQuestionId && version.prompt && version.sourceText && version.explanation,
      ),
    ).toBe(true);
    const p0Question = unique.find((item) =>
      item.sourceQuestionId.endsWith(":fast-chunking-practice:fast-chunking-practice-1"),
    );
    expect(p0Question?.versions).toHaveLength(2);
    expect(
      p0Question?.versions.every(
        (version) =>
          version.sourceVersionId && version.sourceText && version.explanation && version.prompt,
      ),
    ).toBe(true);
    expect(p0Question?.versions.map((version) => version.sourceVersionStatus)).toContain(
      "REVISION_CANDIDATE",
    );

    const firstReal = unique.find((item) =>
      item.sourceQuestionId.includes("FIRST-REAL-CURRICULUM"),
    );
    expect(firstReal?.versions[0]?.sourceVersionId).toBeNull();
    expect(firstReal?.versions[0]?.sourceVersionStatus).toBe("VERSION_UNDECLARED");
    expect(MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS.map((gap) => gap.code)).toContain(
      "RUNTIME_TRAINING_BANK_NOT_ENUMERATED",
    );
    expect(MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS.map((gap) => gap.code)).toContain(
      "ACADEMIC_P0_IS_LEARNING_CONTRACT_NOT_QUESTION_BANK",
    );
    expect(MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS.map((gap) => gap.code)).not.toContain(
      "CYCLE3_RAIN_GARDEN_CANDIDATE_CONTENT_KEY_NOT_IN_BASE_PROGRAM",
    );

    const rainGardenQuestions = unique.filter((item) =>
      item.sourceQuestionId.includes("p1a-v3-evidence-practice:p1a-v3-evidence-practice-"),
    );
    expect(
      rainGardenQuestions.some((item) =>
        item.versions.some(
          (version) =>
            version.sourceVersionId?.endsWith("-v4") &&
            version.contentKey === "p1a-v3-evidence-practice" &&
            version.sourceText?.includes("yağmur bahçesine dönüştürüldü"),
        ),
      ),
    ).toBe(true);
  });

  it("merges identical version references but rejects conflicting definitions for one immutable version", () => {
    const base = {
      key: "q-1",
      sourceQuestionId: "pack:exercise:q-1",
      sourceVersionId: "question-v1",
      sourceVersionStatus: "REVISION_CANDIDATE" as const,
      prompt: "Metne göre ne oldu?",
      contentKey: "passage-1",
      skillCode: "RC_DETAIL",
      options: [
        { id: "a", text: "Doğru" },
        { id: "b", text: "Yanlış" },
      ],
      correctOptionId: "a",
      explanation: "Metin bu bilgiyi açıkça veriyor.",
    };

    const merged = collectUniqueMultipleChoiceQuestions([
      { key: "first-reference", status: "VERSIONED_REVISION_CANDIDATE", questions: [base] },
      {
        key: "second-reference",
        status: "VERSIONED_REVISION_CANDIDATE",
        questions: [{ ...base, sourceText: "Kaynak metin." }],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.versions).toHaveLength(1);
    expect(merged[0]?.versions[0]?.sourceText).toBe("Kaynak metin.");

    expect(() =>
      collectUniqueMultipleChoiceQuestions([
        { key: "first-reference", status: "VERSIONED_REVISION_CANDIDATE", questions: [base] },
        {
          key: "second-reference",
          status: "VERSIONED_REVISION_CANDIDATE",
          questions: [
            {
              ...base,
              options: [
                { id: "a", text: "Başka metin" },
                { id: "b", text: "Yanlış" },
              ],
            },
          ],
        },
      ]),
    ).toThrow("değişmez soru sürümü çakışan içerikle kataloglandı");
  });
});
