import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLessonMetadata } from "../src/modules/lessons/contract.js";
import {
  buildPublishedLessonReplacementInput,
  buildRequestHeaders,
  publishedLessonNeedsRebind,
  selectResumableVersion,
} from "../scripts/provision-staging-release-0-6-lessons.js";

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

  it("does not send an empty JSON body for bodyless lifecycle POSTs", () => {
    const headers = buildRequestHeaders(
      { "content-type": "application/json", "x-auth-transport": "cookie" },
      false,
    );

    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("x-auth-transport")).toBe("cookie");
  });

  it("keeps JSON content type for lifecycle requests with a body", () => {
    const headers = buildRequestHeaders({ "x-auth-transport": "cookie" }, true);

    expect(headers.get("content-type")).toBe("application/json");
  });

  it("resumes a partially created content when its only draft version has no current pointer", () => {
    expect(
      selectResumableVersion(null, [{ id: "version-1", status: "DRAFT" }], "attention-burst"),
    ).toEqual({ id: "version-1", status: "DRAFT" });
  });

  it("fails closed when a partial content has ambiguous or published versions", () => {
    expect(() => selectResumableVersion(null, [], "attention-burst")).toThrow("belirsiz");
    expect(() =>
      selectResumableVersion(null, [{ id: "version-1", status: "PUBLISHED" }], "attention-burst"),
    ).toThrow("belirsiz");
  });

  it("detects stale published template bindings and preserves published content on repair", () => {
    const lesson = manifest[0]!;
    const metadata = (exerciseTemplateVersionId: string) => ({
      lessonType: "LEARNING_LESSON",
      contractVersion: 1,
      skillCode: lesson.skillCode,
      objective: lesson.objective,
      explanation: lesson.explanation,
      workedExample: lesson.workedExample,
      guidedPractice: lesson.guidedPractice,
      exerciseTemplateVersionId,
      completionLabel: lesson.completionLabel,
    });
    expect(publishedLessonNeedsRebind(metadata("old"), "new")).toBe(true);
    expect(publishedLessonNeedsRebind(metadata("new"), "new")).toBe(false);

    const replacement = buildPublishedLessonReplacementInput(
      {
        title: "Mevcut ders başlığı",
        body: "Yayınlanmış ders gövdesi",
        license: "CC BY",
        changelog: "previous",
        metadata: metadata("old"),
      },
      lesson,
      "new-template",
    );

    expect(replacement.title).toBe("Mevcut ders başlığı");
    expect(replacement.body).toBe("Yayınlanmış ders gövdesi");
    expect(replacement.license).toBe("CC BY");
    expect(replacement.metadata.exerciseTemplateVersionId).toBe("new-template");
  });
});
