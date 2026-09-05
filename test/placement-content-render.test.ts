import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const renderStart = source.indexOf("function renderStudentReading(");
const renderEnd = source.indexOf("function renderExerciseResult(", renderStart);
const renderCode = source.slice(renderStart, renderEnd);

type Content = {
  position: number;
  contentVersion: {
    id: string;
    contentId: string;
    title: string;
    body: string;
  };
};

function harness() {
  const elements = new Map<
    string,
    { style: { display: string }; textContent: string; innerHTML: string }
  >();
  const get = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, { style: { display: "" }, textContent: "", innerHTML: "" });
    }
    return elements.get(id)!;
  };
  const context = createContext({
    $: get,
    escapeHtml: (value: string) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    exerciseQuestions: [],
    currentExerciseQuestionIndex: 0,
  });
  runInContext(renderCode, context);
  return { context, get, run: (code: string) => runInContext(code, context) };
}

function session(): { templateVersion: { contents: Content[] } } {
  return {
    templateVersion: {
      contents: [
        {
          position: 0,
          contentVersion: {
            id: "content-version-a",
            contentId: "content-a",
            title: "Metin A",
            body: "İçerik A",
          },
        },
        {
          position: 1,
          contentVersion: {
            id: "content-version-b",
            contentId: "content-b",
            title: "Metin B",
            body: "İçerik B",
          },
        },
        {
          position: 2,
          contentVersion: {
            id: "content-version-c",
            contentId: "content-c",
            title: "Metin C",
            body: "İçerik C",
          },
        },
      ],
    },
  };
}

describe("placement question to content rendering", () => {
  it("renders Content B when Q2 is linked to Content B", () => {
    const h = harness();
    const s = session();
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-a", contentVersionId: "content-version-a" });`,
    );
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-b", contentVersionId: "content-version-b" });`,
    );

    expect(h.get("student-reading-heading").textContent).toBe("Metin B");
    expect(h.get("student-reading-body").innerHTML).toContain("İçerik B");
    expect(h.get("student-reading-body").innerHTML).not.toContain("İçerik A");
  });

  it("keeps Content A when consecutive questions use Content A", () => {
    const h = harness();
    const s = session();
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-a", contentVersionId: "content-version-a" });`,
    );
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-a", contentVersionId: "content-version-a" });`,
    );

    expect(h.get("student-reading-heading").textContent).toBe("Metin A");
    expect(h.get("student-reading-body").innerHTML).toContain("İçerik A");
  });

  it("updates passage on both B and C transitions", () => {
    const h = harness();
    const s = session();
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-b", contentVersionId: "content-version-b" });`,
    );
    expect(h.get("student-reading-heading").textContent).toBe("Metin B");
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-c", contentVersionId: "content-version-c" });`,
    );

    expect(h.get("student-reading-heading").textContent).toBe("Metin C");
    expect(h.get("student-reading-body").innerHTML).toContain("İçerik C");
    expect(h.get("student-reading-body").innerHTML).not.toContain("İçerik B");
  });

  it("uses the current question content after a reload", () => {
    const h = harness();
    const s = session();
    h.context.exerciseQuestions = [
      { contentId: "content-a", contentVersionId: "content-version-a" },
      { contentId: "content-b", contentVersionId: "content-version-b" },
    ];
    h.context.currentExerciseQuestionIndex = 1;
    h.run(`renderStudentReading(${JSON.stringify(s)});`);

    expect(h.get("student-reading-heading").textContent).toBe("Metin B");
    expect(h.get("student-reading-body").innerHTML).toContain("İçerik B");
  });

  it("does not keep a stale passage when the question mapping is unavailable", () => {
    const h = harness();
    const s = session();
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "content-a", contentVersionId: "content-version-a" });`,
    );
    h.run(
      `renderStudentReading(${JSON.stringify(s)}, { contentId: "missing-content", contentVersionId: "missing-version" });`,
    );

    expect(h.get("student-reading-card").style.display).toBe("none");
    expect(h.get("student-reading-body").innerHTML).toBe("");
  });
});
