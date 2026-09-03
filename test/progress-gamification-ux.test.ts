import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const code = source.slice(
  source.indexOf("function insightScope()"),
  source.indexOf(
    "// ---------- Ölçme & Değerlendirme ----------",
    source.indexOf("function insightScope()"),
  ),
);
function harness() {
  const elements = new Map<string, ReturnType<typeof element>>();
  function element() {
    return {
      textContent: "",
      innerHTML: "",
      disabled: false,
      classList: { add() {}, remove() {} },
      replaceChildren() {
        this.innerHTML = "";
      },
      setAttribute() {},
      close() {},
    };
  }
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const storage = new Map<string, string>();
  const context = createContext({
    $: get,
    escapeHtml: (s: string) => s.replaceAll("<", "&lt;"),
    getStoredTokens: () => ({ accessToken: "token", tenantId: "personal" }),
    insightsIdentity: "student:personal",
    progressRequest: 0,
    gamificationRequest: 0,
    historyRequest: 0,
    insightHistoryPage: 1,
    insightAwards: [],
    insightNewAwards: new Map(),
    isPlatformUser: false,
    sessionStorage: {
      getItem: (k: string) => storage.get(k) || null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  runInContext(code, context);
  return { get, context, run: (s: string) => runInContext(s, context) };
}
describe("progress/gamification production UI helpers", () => {
  it("keeps UTC reporting week boundaries on the correct calendar date", () => {
    const h = harness();
    expect(h.run('insightDate("2026-09-06T23:59:59.999Z", false, true)')).toBe("06.09.2026");
  });
  it("distinguishes missing accuracy from zero and formats milliseconds as seconds", () => {
    const h = harness();
    expect(h.run("formatAccuracy(null)")).toBe("—");
    expect(h.run("formatAccuracy(0)")).toBe("0%");
    expect(h.run("formatAvgTime(null)")).toBe("");
    expect(h.run("formatAvgTime(12000)")).toBe("12 sn");
    expect(h.run("formatAvgTime(500)")).toBe("0,5 sn");
  });
  it("keeps real accuracy and counts without inventing mastery or null time", () => {
    const h = harness();
    h.run(
      `renderProgressList([{skillId:'a',skillName:'Ana fikir',sessionCount:1,attemptCount:3,correctCount:1,accuracy:.5,avgTimeMs:null}])`,
    );
    const html = h.get("progress-skills").innerHTML;
    expect(html).toContain("50%");
    expect(html).not.toContain("skill-time");
    expect(html).not.toContain("mastery");
  });
  it("does not celebrate existing badges on first visit or repeat them after refresh", () => {
    const h = harness();
    expect(h.run(`observeInsightAwards({badges:[{id:'old'}]}).size`)).toBe(0);
    expect(h.run(`observeInsightAwards({badges:[{id:'old'},{id:'new'}]}).has('new')`)).toBe(true);
    h.run("insightNewAwards.clear()");
    expect(h.run(`observeInsightAwards({badges:[{id:'old'},{id:'new'}]}).size`)).toBe(0);
  });
  it("isolates badge observations between students and contexts", () => {
    const h = harness();
    h.run(`observeInsightAwards({badges:[]});insightsIdentity='student:organization'`);
    expect(h.run(`observeInsightAwards({badges:[{id:'org-award'}]}).size`)).toBe(0);
  });
  it("discards late progress responses after account/context reset", async () => {
    const h = harness();
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    h.context.pending = pending;
    h.run("insightApi=()=>pending");
    const load = h.run("loadProgress()");
    h.run("resetInsights()");
    release({ items: [], summary: {}, badges: [] });
    await load;
    expect(h.get("progress-summary").innerHTML).toBe("");
    expect(h.get("progress-skills").innerHTML).toBe("");
  });
  it("shows only earned badges and handles missing description without claiming success", () => {
    const h = harness();
    h.run(
      `renderGamification({totalPoints:0,currentDays:0,longestDays:0,lastActivityDate:null,badges:[],recentPointEvents:[]})`,
    );
    expect(h.get("gamification-badges").innerHTML).toContain("Henüz kazanılmış rozet yok");
    expect(h.get("gamification-badges").innerHTML).not.toContain("data-badge-index");
    expect(h.get("gamification-total-points").textContent).toBe("0");
  });
});
