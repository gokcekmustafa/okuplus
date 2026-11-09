import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const homeCode = source.slice(
  source.indexOf("function renderHomeInsights("),
  source.indexOf("const DEVELOPMENT_SKILL_CARDS"),
);
const usableStart = source.indexOf("function isUsableLearningPathNode(");
const usableCode = source.slice(usableStart, source.indexOf("\n}", usableStart) + 2);
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const homeStyles = readFileSync(new URL("../public/student-home.css", import.meta.url), "utf8");

function harness() {
  type Element = {
    innerHTML: string;
    textContent: string;
    disabled: boolean;
    style: { width: string };
    attrs: Map<string, string>;
    classList: { remove: ReturnType<typeof vi.fn> };
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
    querySelector: () => { textContent: string };
  };
  const elements = new Map<string, Element>();
  const get = (id: string) => {
    if (!elements.has(id)) {
      const attrs = new Map<string, string>();
      const label = { textContent: "" };
      elements.set(id, {
        innerHTML: "",
        textContent: "",
        disabled: false,
        style: { width: "" },
        attrs,
        classList: { remove: vi.fn() },
        setAttribute: (name, value) => {
          attrs.set(name, value);
        },
        removeAttribute: (name) => {
          attrs.delete(name);
        },
        querySelector: () => label,
      });
    }
    return elements.get(id)!;
  };
  let scope = "student:fixture";
  const start = vi.fn();
  const context = createContext({
    $: get,
    escapeHtml: (value: string) =>
      String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
    isPlatformUser: false,
    studentHomeNextNode: null,
    studentHomeNextScope: null,
    insightScope: () => scope,
    currentPage: "dashboard",
    startLearningPathNodeFromMap: start,
  });
  runInContext(usableCode + "\n" + homeCode, context);
  return {
    get,
    start,
    context,
    changeScope: () => {
      scope = "another-student";
    },
    render: (path: unknown, progress: unknown = null, history: unknown = null) =>
      runInContext(
        `renderHomeInsights(${JSON.stringify(path)}, ${JSON.stringify(progress)}, ${JSON.stringify(history)})`,
        context,
      ),
    activate: () => runInContext("startStudentHomeNext()", context),
  };
}
const active = {
  id: "server-step-3",
  type: "PRACTICE",
  status: "active",
  label: "Anlamayı Geliştirme",
  templateVersionId: "server-template-3",
};
const pathData = {
  currentLevel: { name: "3. Seviye" },
  routeProgress: { completed: 2, total: 3, percent: 67 },
  paths: [
    {
      path: { title: "Temel Beceriler" },
      nodes: [{ ...active, id: "locked-step", status: "locked" }, active],
    },
  ],
  today: { recentActivity: [] },
};

describe("student home", () => {
  it("keeps the standard name, theme and notification controls on the home top bar", () => {
    expect(html).not.toContain("student-home-profile");
    expect(html).toContain('id="user-menu-toggle"');
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('class="student-home-notifications"');
    expect(homeStyles).not.toMatch(
      /\.student-shell \.app-main:has\(#page-dashboard:not\(\.hidden\)\) \.topbar-user\s*\{\s*display:\s*none/iu,
    );
    expect(homeStyles).toMatch(
      /\.student-shell \.student-home-notifications\s*\{\s*display:\s*block/iu,
    );
  });

  it("opens the server-unlocked Learning Path station, not independent training", () => {
    const h = harness();
    h.render(pathData);
    h.activate();
    expect(h.start).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "server-step-3",
        templateVersionId: "server-template-3",
        status: "active",
      }),
      h.get("home-start-next"),
    );
    expect(h.get("home-start-next").disabled).toBe(false);
    expect(h.get("home-work-percent").textContent).toBe("%67");
    expect(h.get("home-work-description").textContent).toContain("3 istasyondan 2");
  });
  it("does not open locked, unavailable or another student's cached station", () => {
    const h = harness();
    h.render({ ...pathData, paths: [{ nodes: [{ ...active, status: "locked" }] }] });
    h.activate();
    expect(h.get("home-start-next").disabled).toBe(true);
    expect(h.start).not.toHaveBeenCalled();
    h.render({ ...pathData, paths: [{ nodes: [{ ...active, availability: "UNAVAILABLE" }] }] });
    h.activate();
    expect(h.get("home-start-next").disabled).toBe(true);
    expect(h.start).not.toHaveBeenCalled();
    h.render(pathData);
    h.changeScope();
    h.activate();
    expect(h.start).not.toHaveBeenCalled();
  });
  it("uses actual comprehension measurements rather than a general accuracy score", () => {
    const h = harness();
    h.render(pathData, {
      summary: { accuracy: 0.95 },
      items: [
        { skillCode: "FR_SPEED", fluencyWcpm: 162 },
        {
          skillCode: "RC_MAIN_IDEA",
          skillName: "Ana Fikir",
          accuracy: 0.78,
          lastAttemptAt: "2026-11-05",
        },
      ],
    });
    expect(h.get("home-insights-values").innerHTML).toContain("162");
    expect(h.get("home-insights-values").innerHTML).toContain("%78");
    expect(h.get("home-insights-values").innerHTML).not.toContain("%95");
  });
  it("shows recorded activity scores and leaves unknown measurements unscored", () => {
    const h = harness();
    h.render(pathData, null, {
      items: [
        {
          id: "history-1",
          status: "COMPLETED",
          templateVersion: { template: { title: "Ormanların Önemi" } },
          scoreSummary: { averageScore: 0.8 },
        },
        { id: "history-2", status: "COMPLETED", title: "Temiz Hava" },
      ],
    });
    const activity = h.get("home-recent-activity").innerHTML;
    expect(activity).toContain("Ormanların Önemi");
    expect(activity).toContain("%80");
    expect(activity.match(/home-activity-score/g)).toHaveLength(1);
    expect(h.get("home-insights-values").innerHTML).toContain("Henüz ölçülmedi");
  });
  it("presents empty states without fake zero scores or an enabled start button", () => {
    const h = harness();
    h.render(
      { paths: [], today: { recentActivity: [] } },
      { items: [], summary: { accuracy: 0.9 } },
    );
    expect(h.get("home-work-percent").textContent).toBe("—");
    expect(h.get("home-work-progress").attrs.has("aria-valuenow")).toBe(false);
    expect(h.get("home-insights-values").innerHTML).not.toContain("%90");
    expect(h.get("home-insights-values").innerHTML).toContain("Henüz belirlenmedi");
    expect(h.get("home-start-next").disabled).toBe(true);
    expect(h.get("home-recent-activity").innerHTML).toContain("Henüz çalışma kaydın yok");
  });
  it("keeps four primary destinations and secondary features reachable", () => {
    const nav = html.match(/<nav id="student-bottom-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect([...nav.matchAll(/data-bottom-page="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "dashboard",
      "lessons",
      "progress",
      "settings",
    ]);
    for (const page of ["exercise", "assignments", "assessments", "badges"])
      expect(html).toContain(`data-user-menu-page="${page}" data-student`);
  });
});
