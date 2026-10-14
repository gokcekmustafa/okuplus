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

  it("reads already-published P1-A metadata from the pre-version contract safely", () => {
    const legacyP1ALesson = {
      ...validLesson(),
      contractVersion: undefined,
      programId: "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE",
      routeFamily: "P1-A",
    };

    delete (legacyP1ALesson as { contractVersion?: unknown }).contractVersion;

    expect(parseLessonMetadata(legacyP1ALesson)).toMatchObject({
      contractVersion: 1,
      programId: "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE",
      routeFamily: "P1-A",
    });
  });

  it("does not treat an unversioned non-canonical envelope as a lesson", () => {
    const legacyP1ALesson = { ...validLesson(), routeFamily: "P1-A" };
    delete (legacyP1ALesson as { contractVersion?: unknown }).contractVersion;

    expect(parseLessonMetadata(legacyP1ALesson)).toBeNull();
  });

  it("accepts a published content-only teaching lesson without an exercise template", () => {
    expect(
      parseLessonMetadata({
        ...validLesson(),
        programId: "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE",
        routeFamily: "P1-A",
        exerciseTemplateVersionId: null,
      }),
    ).toMatchObject({
      contractVersion: 1,
      exerciseTemplateVersionId: null,
    });
  });

  it("accepts the versioned Cycle 2 P1-A lesson envelope", () => {
    expect(
      parseLessonMetadata({
        ...validLesson(),
        contractVersion: 2,
        programId: "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-2",
        routeFamily: "P1-A-CYCLE-2",
        exerciseTemplateVersionId: null,
      }),
    ).toMatchObject({
      contractVersion: 2,
      programId: "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-2",
      routeFamily: "P1-A-CYCLE-2",
    });
  });

  it("rejects an unknown versioned route family", () => {
    expect(parseLessonMetadata({ ...validLesson(), routeFamily: "P1-A-CYCLE-99" })).toBeNull();
  });
});
