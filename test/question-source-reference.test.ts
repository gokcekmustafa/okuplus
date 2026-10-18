import { describe, expect, it } from "vitest";
import {
  createQuestionSchema,
  createQuestionVersionSchema,
  updateQuestionVersionSchema,
} from "../src/modules/questions/schemas.js";

const question = {
  contentId: "content-1",
  position: 0,
  type: "MULTIPLE_CHOICE",
  prompt: "Metne göre hangisi doğrudur?",
  options: [
    { id: "a", text: "İlk seçenek", position: 0 },
    { id: "b", text: "İkinci seçenek", position: 1 },
  ],
  correctAnswer: {
    type: "MULTIPLE_CHOICE",
    correctOptionIds: ["a"],
    allowMultiple: false,
    partialCredit: false,
  },
};

describe("question source reference editing", () => {
  it("accepts an optional bounded source reference on create and version revisions", () => {
    expect(
      createQuestionSchema.parse({ ...question, sourceReference: "  https://example.org/source  " })
        .sourceReference,
    ).toBe("https://example.org/source");
    expect(
      createQuestionVersionSchema.parse({ sourceReference: "Kaynak: kitap 1" }).sourceReference,
    ).toBe("Kaynak: kitap 1");
    expect(updateQuestionVersionSchema.parse({ sourceReference: null }).sourceReference).toBeNull();
  });

  it("rejects oversized source references rather than silently truncating them", () => {
    const invalid = "x".repeat(2001);
    expect(createQuestionSchema.safeParse({ ...question, sourceReference: invalid }).success).toBe(
      false,
    );
    expect(createQuestionVersionSchema.safeParse({ sourceReference: invalid }).success).toBe(false);
    expect(updateQuestionVersionSchema.safeParse({ sourceReference: invalid }).success).toBe(false);
  });
});
