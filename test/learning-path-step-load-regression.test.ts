import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("learning path station ordering and legacy lesson compatibility", () => {
  it("keeps canonical P0 stations before the assigned P1 route", async () => {
    const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

    expect(app).toContain("function learningPathEntriesFromData(data)");
    expect(app).toContain("sortGuidedLearningNodes(learningPathEntriesFromData(data))");
    expect(app).toContain('String(entry.node?.learningPathCode || "").startsWith(');
    expect(app).toContain('"EDUCATION_V2_P1_"');
    expect(app).toContain("sortKey: phase");
    expect(app).toContain("originalIndex: index");
  });

  it("uses the same ordered node source for map and active-step selection", async () => {
    const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

    const activeStart = app.indexOf("function activeLearningPathNodeFromData(data)");
    const activeEnd = app.indexOf("async function startLearningPathNode", activeStart);
    const activeFunction = app.slice(activeStart, activeEnd);
    const mapStart = app.indexOf("function renderLearningPathMap(pathGroups, currentLevel)");
    const mapEnd = app.indexOf("async function loadLearningPath()", mapStart);
    const mapFunction = app.slice(mapStart, mapEnd);

    expect(activeFunction).toContain("sortGuidedLearningNodes(learningPathEntriesFromData(data))");
    expect(mapFunction).toContain("sortGuidedLearningNodes(");
    expect(mapFunction).toContain("learningPathEntriesFromData({ paths: groups })");
  });
});
