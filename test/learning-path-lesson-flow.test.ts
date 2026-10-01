import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("../src/modules/lessons/service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/lessons/routes.ts", import.meta.url), "utf8");
const learningPathService = readFileSync(
  new URL("../src/modules/learning-path/service.ts", import.meta.url),
  "utf8",
);
const trainingRoutes = readFileSync(
  new URL("../src/modules/training/routes.ts", import.meta.url),
  "utf8",
);
const assessmentService = readFileSync(
  new URL("../src/modules/assessments/service.ts", import.meta.url),
  "utf8",
);
const persistentPath = readFileSync(
  new URL("../src/modules/student-learning/persistent-path.ts", import.meta.url),
  "utf8",
);
const studentLearningService = readFileSync(
  new URL("../src/modules/student-learning/service.ts", import.meta.url),
  "utf8",
);

describe("roadmap lesson flow contract", () => {
  it("resolves lesson content through the canonical accessible learning step", () => {
    expect(service).toContain("assertLearningStepAccessible(actor, stepId)");
    expect(service).toContain('node.type !== "TEACHING" && node.type !== "SMALL_STUDY"');
    expect(service).toContain("findLessonForContentVersion(node.contentVersionId, actor)");
  });

  it("completes only the addressed step and returns the server-selected next step", () => {
    expect(service).toContain("await completeLearningStep(actor, stepId)");
    expect(service).toContain("nextStep: await getNextLearningStep(actor)");
    expect(service).not.toContain("nextStep = request");
  });

  it("exposes dedicated focused lesson endpoints beside the legacy catalog", () => {
    expect(routes).toContain('"/student/learning-path/steps/:stepId/lesson"');
    expect(routes).toContain('"/student/learning-path/steps/:stepId/lesson/complete"');
    expect(routes).toContain('"/student/lessons"');
  });

  it("keeps legacy lesson deep links behind the same roadmap content gate", () => {
    expect(service).toContain("assertLearningContentAccessible(actor, contentVersionId)");
    expect(service).not.toContain("resolveLearningStepForContent(contentVersionId, actor)");
    expect(service).toContain("completeLearningStepForContent(lesson.contentVersionId, actor, {");
    expect(service).not.toContain("contentVersionId: lesson.contentVersionId,\n  }).catch");
  });

  it("keeps assessment and training start routes behind the roadmap gate", () => {
    expect(learningPathService).toContain("assertLearningAssessmentAccessible");
    expect(assessmentService).toContain("await assertLearningAssessmentAccessible(");
    expect(trainingRoutes).toContain("enforceLearningPathOrder: true");
  });

  it("keeps the roadmap GET read-only and avoids a second path query for today", () => {
    expect(persistentPath).not.toContain("tx.studentLearningPath.upsert");
    expect(persistentPath).not.toContain("tx.studentLearningPath.update");
    expect(studentLearningService).toContain("getToday(actor, { nextLearningStep })");
    expect(learningPathService).toContain("...STUDENT_LEARNING_SESSION_FILTER");
  });
});
