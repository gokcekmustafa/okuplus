import { describe, expect, it } from "vitest";
import { parseLessonMetadata } from "../src/modules/lessons/contract.js";

const validLesson = () => ({
  lessonType: "LEARNING_LESSON",
  contractVersion: 1,
  skillCode: "RC_MAIN_IDEA",
  objective: "Ana fikri belirlemek",
  explanation: "Metnin genel mesajını bul.",
  workedExample: "Önce tekrar eden düşünceleri işaretle.",
  guidedPractice: "Şimdi kısa metinde ana fikri seç.",
  exerciseTemplateVersionId: "template-version-1",
});

describe("published learning lesson contract", () => {
  it("accepts Turkish instructional content metadata", () => {
    expect(parseLessonMetadata(validLesson())).toMatchObject({
      lessonType: "LEARNING_LESSON",
      contractVersion: 1,
      completionLabel: "Dersi tamamladım",
    });
  });

  it("fails closed when the runtime binding is missing", () => {
    const lesson = validLesson();
    delete (lesson as { exerciseTemplateVersionId?: string }).exerciseTemplateVersionId;
    expect(parseLessonMetadata(lesson)).toBeNull();
  });

  it("rejects unknown metadata fields so arbitrary content is not treated as a lesson", () => {
    expect(parseLessonMetadata({ ...validLesson(), runtimeOnly: true })).toBeNull();
  });
});
