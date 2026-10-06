import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("../src/modules/lessons/service.ts", import.meta.url), "utf8");
const learningPathService = readFileSync(
  new URL("../src/modules/learning-path/service.ts", import.meta.url),
  "utf8",
);
const routes = readFileSync(new URL("../src/modules/lessons/routes.ts", import.meta.url), "utf8");

describe("roadmap lesson flow contract", () => {
  it("resolves lesson content through the canonical accessible learning step", () => {
    expect(service).toContain("assertLearningStepAccessible(actor, stepId)");
    expect(service).toContain('node.type !== "TEACHING" && node.type !== "SMALL_STUDY"');
    expect(service).toContain("findLessonForContentVersion(node.contentVersionId, actor)");
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

  it("exposes dedicated focused lesson endpoints beside the legacy catalog", () => {
    expect(routes).toContain('"/student/learning-path/steps/:stepId/lesson"');
    expect(routes).toContain('"/student/learning-path/steps/:stepId/lesson/complete"');
    expect(routes).toContain('"/student/lessons"');
  });
});
