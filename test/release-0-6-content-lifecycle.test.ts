import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLessonMetadata } from "../src/modules/lessons/contract.js";

type LessonManifestEntry = {
  key: string;
  family: string;
  skillCode: string;
  title: string;
  body: string;
  objective: string;
  explanation: string;
  workedExample: string;
  guidedPractice: string;
  completionLabel: string;
};

const manifest = JSON.parse(
  readFileSync(new URL("../content/release-0-6/lessons.json", import.meta.url), "utf8"),
) as LessonManifestEntry[];

describe("Release 0.6 lesson authoring contract", () => {
  it("defines exactly one meaningful lesson for each published training family", () => {
    expect(manifest).toHaveLength(6);
    expect(new Set(manifest.map((entry) => entry.family))).toEqual(
      new Set([
        "ATTENTION_BURST",
        "RAPID_RECOGNITION",
        "PHRASE_CHUNKING",
        "MAIN_IDEA",
        "DETAIL_EVIDENCE",
        "INFERENCE",
      ]),
    );
    for (const entry of manifest) {
      expect(entry.body.length).toBeGreaterThan(80);
      expect(entry.objective.length).toBeGreaterThan(10);
      expect(entry.explanation.length).toBeGreaterThan(20);
      expect(entry.workedExample.length).toBeGreaterThan(20);
      expect(entry.guidedPractice.length).toBeGreaterThan(15);
      expect(
        parseLessonMetadata({
          lessonType: "LEARNING_LESSON",
          contractVersion: 1,
          skillCode: entry.skillCode,
          objective: entry.objective,
          explanation: entry.explanation,
          workedExample: entry.workedExample,
          guidedPractice: entry.guidedPractice,
          exerciseTemplateVersionId: "published-template-version",
          completionLabel: entry.completionLabel,
        }),
      ).not.toBeNull();
    }
  });

  it("uses official lifecycle endpoints and never writes staging through SQL", () => {
    const source = readFileSync(
      new URL("../scripts/provision-staging-release-0-6-lessons.ts", import.meta.url),
      "utf8",
    );
    for (const endpoint of [
      "/admin/content-versions/",
      "/admin/contents/",
      "/admin/content-versions/",
    ]) {
      expect(source).toContain(endpoint);
    }
    expect(source).toContain("/review");
    expect(source).toContain("/approve");
    expect(source).toContain("/publish");
    expect(source).not.toContain("$executeRaw");
    expect(source).not.toContain("$queryRawUnsafe");
  });
});
