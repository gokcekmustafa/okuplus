import { describe, expect, it } from "vitest";
import {
  buildHintRepairPlan,
  type RuntimeQuestionRow,
} from "../scripts/provision-staging-runtime-question-hints.ts";

function row(overrides: Partial<RuntimeQuestionRow> = {}): RuntimeQuestionRow {
  return {
    questionId: "question-1",
    questionVersionId: "question-version-1",
    contentVersionId: "content-version-1",
    version: 1,
    status: "PUBLISHED",
    skillCode: "FAST_ATTENTION",
    prompt: "Soru",
    options: [{ id: "a", text: "A" }],
    correctAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["a"] },
    explanation: "Açıklama",
    hint: null,
    difficulty: 0.25,
    ...overrides,
  };
}

const hints = new Map([["FAST_ATTENTION", "Başlık ve tekrar eden anahtar sözcüklere odaklan."]]);

describe("staging runtime question hint repair plan", () => {
  it("keeps a published question with a hint idempotently unchanged", () => {
    const plan = buildHintRepairPlan([row({ hint: "Mevcut ipucu" })], hints);

    expect(plan).toEqual([
      expect.objectContaining({ action: "NOOP", questionVersionId: "question-version-1" }),
    ]);
  });

  it("creates one next version when the published version has no hint", () => {
    const plan = buildHintRepairPlan([row()], hints);

    expect(plan).toEqual([
      expect.objectContaining({
        action: "CREATE",
        questionId: "question-1",
        hint: "Başlık ve tekrar eden anahtar sözcüklere odaklan.",
      }),
    ]);
  });

  it("resumes the single matching partial version without creating a duplicate", () => {
    const plan = buildHintRepairPlan(
      [
        row(),
        row({
          questionVersionId: "question-version-2",
          version: 2,
          status: "REVIEW",
          hint: "Başlık ve tekrar eden anahtar sözcüklere odaklan.",
        }),
      ],
      hints,
    );

    expect(plan).toEqual([
      expect.objectContaining({ action: "RESUME", questionVersionId: "question-version-2" }),
    ]);
  });

  it("fails closed when partial versions are ambiguous or hint source is missing", () => {
    expect(() =>
      buildHintRepairPlan(
        [
          row(),
          row({
            questionVersionId: "question-version-2",
            version: 2,
            status: "DRAFT",
            hint: hints.get("FAST_ATTENTION"),
          }),
          row({
            questionVersionId: "question-version-3",
            version: 3,
            status: "REVIEW",
            hint: hints.get("FAST_ATTENTION"),
          }),
        ],
        hints,
      ),
    ).toThrow("birden fazla aktif taslak");

    expect(() => buildHintRepairPlan([row({ skillCode: "UNKNOWN" })], hints)).toThrow(
      "canonical hint kaynağı yok",
    );
  });
});
