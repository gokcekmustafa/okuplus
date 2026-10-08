import { describe, expect, it } from "vitest";
import {
  resolveLearningPathNodeStatuses,
  resolveLearningPathStepEvidence,
} from "../src/modules/learning-path/service.js";

describe("learning path completion regression", () => {
  it("binds a shared template session to its exact learning step", () => {
    const evidence = resolveLearningPathStepEvidence(
      [
        { id: "step-a", exerciseTemplateVersionId: "template-v1", contentVersionId: null },
        { id: "step-b", exerciseTemplateVersionId: "template-v1", contentVersionId: null },
      ],
      [{ learningStepId: "step-a", templateVersionId: "template-v1" }],
      new Set(),
    );

    expect(evidence.get("step-a")?.completed).toBe(true);
    expect(evidence.get("step-b")?.completed).toBe(false);
  });

  it("does not use shared content as completion evidence for either step", () => {
    const evidence = resolveLearningPathStepEvidence(
      [
        { id: "step-a", exerciseTemplateVersionId: null, contentVersionId: "content-v1" },
        { id: "step-b", exerciseTemplateVersionId: null, contentVersionId: "content-v1" },
      ],
      [],
      new Set(["content-v1"]),
    );

    expect(evidence.get("step-a")?.contentCompleted).toBe(false);
    expect(evidence.get("step-b")?.contentCompleted).toBe(false);
    expect(evidence.get("step-a")?.completed).toBe(false);
    expect(evidence.get("step-b")?.completed).toBe(false);
  });

  it("keeps a completed step locked while its prerequisite is incomplete", () => {
    const statuses = resolveLearningPathNodeStatuses([
      { id: "step-a", prerequisiteIds: [], eligible: true, completed: false },
      { id: "step-b", prerequisiteIds: ["step-a"], eligible: true, completed: true },
    ]);

    expect(statuses.get("step-a")).toBe("active");
    expect(statuses.get("step-b")).toBe("locked");
  });

  it("does not allow a later completed step to skip a locked step", () => {
    const statuses = resolveLearningPathNodeStatuses([
      { id: "step-a", prerequisiteIds: [], eligible: true, completed: false },
      { id: "step-b", prerequisiteIds: ["step-a"], eligible: true, completed: false },
      { id: "step-c", prerequisiteIds: ["step-b"], eligible: true, completed: true },
    ]);

    expect(statuses.get("step-a")).toBe("active");
    expect(statuses.get("step-b")).toBe("locked");
    expect(statuses.get("step-c")).toBe("locked");
  });

  it("keeps completion decisions isolated when paths have separate scopes", () => {
    const pathA = resolveLearningPathNodeStatuses([
      { id: "path-a-step", prerequisiteIds: [], eligible: true, completed: true },
    ]);
    const pathB = resolveLearningPathNodeStatuses([
      { id: "path-b-step", prerequisiteIds: [], eligible: true, completed: false },
    ]);

    expect(pathA.get("path-a-step")).toBe("completed");
    expect(pathB.get("path-b-step")).toBe("active");
  });
});
