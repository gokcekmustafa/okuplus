import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("../src/modules/lessons/service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/lessons/routes.ts", import.meta.url), "utf8");

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
});
