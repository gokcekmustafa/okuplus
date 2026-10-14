import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("../src/modules/lessons/service.ts", import.meta.url), "utf8");
const learningPathService = readFileSync(
  new URL("../src/modules/learning-path/service.ts", import.meta.url),
  "utf8",
);
const studentLearningService = readFileSync(
  new URL("../src/modules/student-learning/service.ts", import.meta.url),
  "utf8",
);
const sessionService = readFileSync(
  new URL("../src/modules/sessions/service.ts", import.meta.url),
  "utf8",
);
const assessmentService = readFileSync(
  new URL("../src/modules/assessments/service.ts", import.meta.url),
  "utf8",
);
const routes = readFileSync(new URL("../src/modules/lessons/routes.ts", import.meta.url), "utf8");

describe("roadmap lesson flow contract", () => {
  it("resolves lesson content through the canonical accessible learning step", () => {
    expect(service).toContain("assertLearningStepAccessible(actor, stepId)");
    expect(service).toContain('node.type !== "TEACHING" && node.type !== "SMALL_STUDY"');
    expect(service).toContain("findLessonForContentVersion(node.contentVersionId, actor)");
  });

  it("pins lesson resolution to the requested published content version", () => {
    expect(service).toContain('versions: { some: { id: contentVersionId, status: "PUBLISHED" } }');
    expect(service).toContain(
      'where: { id: contentVersionId, status: "PUBLISHED" },\n        take: 1',
    );
    expect(service).not.toContain('currentVersion: { id: contentVersionId, status: "PUBLISHED" }');
  });

  it("completes only the addressed step and returns the server-selected next step", () => {
    expect(service).toContain("await completeLearningStep(actor, stepId)");
    expect(service).toContain("nextStep: await getNextLearningStepAfter(actor, stepId)");
    expect(service).not.toContain("nextStep = request");
  });

  it("exposes only server-authorized direct neighbors for replay navigation", () => {
    expect(service).toContain("getLearningStepNavigation(actor, stepId)");
    expect(service).toContain("navigation: await getLearningStepNavigation(actor, stepId)");
    expect(learningPathService).toContain(
      "getLearningStepNavigation(actor, currentStepId)).nextStep",
    );
    expect(
      readFileSync(new URL("../src/modules/learning-path/index.ts", import.meta.url), "utf8"),
    ).toContain("getLearningStepNavigation");
  });

  it("exposes only the canonical focused learning-path lesson endpoints", () => {
    expect(routes).toContain('"/student/learning-path/steps/:stepId/lesson"');
    expect(routes).toContain('"/student/learning-path/steps/:stepId/lesson/complete"');
    expect(routes).not.toContain('"/student/lessons"');
    expect(service).not.toContain("listStudentLessons");
    expect(service).not.toContain("completeStudentLesson");
  });

  it("keeps exercise replay navigation server-authoritative and progress-neutral", () => {
    expect(studentLearningService).toContain("navigationFromStepId");
    expect(studentLearningService).toContain("assertLearningStepAdjacent");
    expect(studentLearningService).toContain("learningPathNavigation");
    expect(studentLearningService).toContain(
      "if (result.isNew && !independentTraining && !replay)",
    );
    expect(sessionService).toContain("!isLearningPathReplaySession(session.deviceInfo)");
  });

  it("does not apply the first-time prerequisite lock to a completed replay", () => {
    expect(studentLearningService).toContain(
      "if (learningStep.matched && !learningStep.unlocked && !replay)",
    );
  });

  it("reuses the server-authorized roadmap node when starting a path exercise", () => {
    expect(studentLearningService).toContain(
      "let authorizedLearningStep: { id: string } | null = null;",
    );
    expect(studentLearningService).toContain(
      "authorizedLearningStep = await assertLearningPathTemplateAccessible",
    );
    expect(studentLearningService).toContain(": authorizedLearningStep");
    expect(studentLearningService).toContain("stepId: authorizedLearningStep.id");
    expect(studentLearningService).toContain(
      "return assertLearningTemplateAccessible(actor, templateVersionId)",
    );
  });

  it("rejects navigation targets that are not the immediate server-authorized neighbor", () => {
    expect(learningPathService).toContain(
      "const target = [navigation.previousStep, navigation.nextStep]",
    );
    expect(learningPathService).toContain("Bu öğrenme adımı mevcut durağın komşusu değil");
    expect(studentLearningService).toContain("navigationTargetStepId");
  });

  it("keeps assessment steps inside the same authoritative navigation contract", () => {
    expect(assessmentService).toContain("assertLearningStepAdjacent");
    expect(assessmentService).toContain("navigationTargetStepId");
    expect(assessmentService).toContain(
      "Öğrenme yolu navigasyon hedefi bu değerlendirmeyle eşleşmiyor",
    );
  });
});
