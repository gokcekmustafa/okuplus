import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const code = source.slice(
  source.indexOf("function lessonApi("),
  source.indexOf("function setupLessonEvents("),
);

function harness() {
  const elements = new Map<string, { innerHTML: string; textContent: string }>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "" });
    return elements.get(id)!;
  };
  const context = createContext({
    $: get,
    escapeHtml: (value: string) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    selectedLessonId: null,
    lessonData: [],
  });
  runInContext(code, context);
  return { context, get, run: (script: string) => runInContext(script, context) };
}

describe("student lesson UI", () => {
  it("renders the Turkish teaching flow and the exercise handoff", () => {
    const h = harness();
    h.run(
      `renderLessonDetail({id:'lesson-1',title:'Ana fikri bul',objective:'Metnin ana düşüncesini fark et',explanation:'Önemli düşüncenin tekrarlarına bak.',workedExample:'Başlık ve tekrar eden ifadeleri karşılaştır.',guidedPractice:'Şimdi kısa metinde ana fikri seç.',exerciseTemplateVersionId:'version-1',completionLabel:'Dersi tamamladım',completion:{completed:false}})`,
    );
    const html = h.get("lesson-detail").innerHTML;
    expect(html).toContain("Kısa anlatım");
    expect(html).toContain("Örnek");
    expect(html).toContain("Şimdi sen dene");
    expect(html).toContain("Egzersize geç");
  });

  it("shows a truthful empty state when no published lesson is available", () => {
    const h = harness();
    h.run("renderLessonList([])");
    expect(h.get("lesson-list").innerHTML).toContain("yayınlanmış ders bulunmuyor");
    expect(h.get("lesson-detail").innerHTML).toContain("Bir ders seçtiğinde");
  });
});
