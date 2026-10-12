import { describe, expect, it } from "vitest";
import { EDUCATION_V2_P0_PROGRAM } from "../src/curriculum/education-v2-p0-program.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "../src/curriculum/education-v2-p1-a-program.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "../src/curriculum/education-v2-p1-bcd-program.js";
import { FIRST_REAL_CURRICULUM_PACK } from "../src/curriculum/first-real-pack.js";
import {
  assessOptionLengthQuality,
  normalizedOptionLength,
} from "../src/curriculum/option-length-quality.js";

type EducationQuestion = {
  key: string;
  options: readonly { id: string; text: string }[];
  correctOptionId: string;
};

function educationQuestions(): EducationQuestion[] {
  return [
    ...EDUCATION_V2_P0_PROGRAM.exercises.flatMap((exercise) => exercise.questions),
    ...EDUCATION_V2_P1_A_PROGRAM.exercises.flatMap((exercise) => exercise.questions),
    ...EDUCATION_V2_P1_BCD_PROGRAMS.flatMap((program) =>
      program.exercises.flatMap((exercise) => exercise.questions),
    ),
  ];
}

describe("multiple-choice option length quality", () => {
  it("normalizes whitespace and punctuation without requiring equal text lengths", () => {
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

  it("flags a clear correct-answer length cue for editorial review", () => {
    const quality = assessOptionLengthQuality({
      correctOptionId: "a",
      options: [
        { id: "a", text: "Metindeki bütün kanıtları birlikte değerlendiren açıklama" },
        { id: "b", text: "Kısa seçenek" },
        { id: "c", text: "Başka seçenek" },
        { id: "d", text: "Yanlış" },
      ],
    });

    expect(quality?.correctIsLongest).toBe(true);
    expect(quality?.clearOutlier).toBe(true);
  });

  it("keeps all current MC source manifests free of clear length outliers", () => {
    const education = educationQuestions();
    const independent = FIRST_REAL_CURRICULUM_PACK.contents
      .flatMap((content) => content.questions)
      .filter((question) => question.type === "MULTIPLE_CHOICE")
      .map((question) => ({
        options: question.options,
        correctOptionId: question.correctAnswer.correctOptionIds[0]!,
      }));

    const all = [...education, ...independent];
    expect(all).toHaveLength(106);
    expect(
      all.filter((question) => assessOptionLengthQuality(question)?.clearOutlier),
    ).toHaveLength(0);
  });
});
