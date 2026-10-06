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
    if (!elements.has(id)) {
      elements.set(id, {
        innerHTML: "",
        textContent: "",
        classList: { add() {}, remove() {}, toggle() {} },
      });
    }
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

  it("renders a roadmap lesson as one focused step without a lesson catalog", () => {
    const h = harness();
    h.run(
      `renderFocusedLesson({title:'Hedefi belirle',objective:'Okumadan önce hedefini söyle',explanation:'Önce ne aradığını netleştir.',workedExample:'Başlığı ve soruyu birlikte incele.',guidedPractice:'Şimdi kendi hedefini yaz.',completion:{completed:false}},{type:'TEACHING',unitTitle:'Hızlı Okuma'})`,
    );
    const html = h.get("lesson-detail").innerHTML;
    expect(html).toContain("ŞİMDİKİ DURAĞIN");
    expect(html).toContain("Dersi tamamladım ve sonraki adıma geç");
    expect(html).not.toContain("Sana uygun dersler");
    expect(html).toContain("data-learning-step-complete");
  });

  it("shows only the direct next step on the first lesson and keeps it at the content bottom", () => {
    const h = harness();
    h.run(
      `renderFocusedLesson({id:'lesson-1',title:'İlk ders',objective:'Başla',explanation:'Anlatım',workedExample:'Örnek',guidedPractice:'Uygula',completion:{completed:true}},{id:'step-1',type:'TEACHING',status:'completed',unitTitle:'Başlangıç'},{previousStep:null,nextStep:{id:'step-2',type:'TEACHING',status:'active',title:'İkinci ders'}})`,
    );
    const html = h.get("lesson-detail").innerHTML;
    expect(html).not.toContain("data-learning-step-previous");
    expect(html).toContain("data-learning-step-next");
    expect(html.lastIndexOf('class="lesson-navigation"')).toBeGreaterThan(
      html.indexOf('id="lesson-detail-status"'),
    );
  });

  it("shows both direct neighbors in the middle of a replay", () => {
    const h = harness();
    h.run(
      `renderFocusedLesson({id:'lesson-2',title:'Orta ders',objective:'İlerle',explanation:'Anlatım',workedExample:'Örnek',guidedPractice:'Uygula',completion:{completed:true}},{id:'step-2',type:'TEACHING',status:'completed',unitTitle:'Başlangıç'},{previousStep:{id:'step-1',type:'TEACHING',status:'completed',title:'İlk ders'},nextStep:{id:'step-3',type:'TEACHING',status:'completed',title:'Son ders'}})`,
    );
    const html = h.get("lesson-detail").innerHTML;
    expect(html).toContain("data-learning-step-previous");
    expect(html).toContain("data-learning-step-next");
    expect(html).toContain("Önceki");
    expect(html).toContain("Sonraki");
  });

  it("does not expose a next button past a locked direct neighbor", () => {
    const h = harness();
    h.run(
      `renderFocusedLesson({id:'lesson-2',title:'Sınır dersi',objective:'İlerle',explanation:'Anlatım',workedExample:'Örnek',guidedPractice:'Uygula',completion:{completed:true}},{id:'step-2',type:'TEACHING',status:'completed',unitTitle:'Başlangıç'},{previousStep:{id:'step-1',type:'TEACHING',status:'completed',title:'İlk ders'},nextStep:{id:'step-3',type:'TEACHING',status:'locked',title:'Kilitli ders'}})`,
    );
    const html = h.get("lesson-detail").innerHTML;
    expect(html).toContain("data-learning-step-previous");
    expect(html).not.toContain("data-learning-step-next");
  });

  it("calculates adjacency without skipping a locked node", () => {
    const h = harness();
    const result = h.run(
      `learningPathAdjacentSteps([{id:'step-1',status:'completed'},{id:'step-2',status:'active'},{id:'step-3',status:'locked'},{id:'step-4',status:'active'}],'step-2')`,
    ) as { previousStep: { id: string } | null; nextStep: { id: string } | null };
    expect(result.previousStep?.id).toBe("step-1");
    expect(result.nextStep).toBeNull();
  });

  it("keeps replay continuation server-authoritative", () => {
    expect(source).toContain("exerciseSession.nextLearningStep");
    expect(source).toContain('id="exercise-next-step"');
    expect(source).toContain("function continueToNextLearningStep()");
  });

  it("does not dismiss modals through the backdrop and supports header drag", () => {
    expect(source).toContain("Backdrop clicks are intentionally inert");
    expect(source).toContain('header.addEventListener("pointerdown"');
    expect(source).toContain("aria-modal");
  });
});
