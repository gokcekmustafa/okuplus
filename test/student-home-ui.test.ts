import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const homeRenderer = appSource.slice(
  appSource.indexOf("function renderHomeInsights("),
  appSource.indexOf(
    "const DEVELOPMENT_SKILL_CARDS",
    appSource.indexOf("function renderHomeInsights("),
  ),
);
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const homeStyles = readFileSync(new URL("../public/student-home.css", import.meta.url), "utf8");

function harness() {
  type HomeElement = {
    innerHTML: string;
    classList: {
      add: (...args: unknown[]) => void;
      remove: (...args: unknown[]) => void;
      toggle: (...args: unknown[]) => void;
    };
  };
  const elements = new Map<string, HomeElement>();
  const get = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, {
        innerHTML: "",
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
      });
    }
    return elements.get(id);
  };
  const context = createContext({
    $: get,
    escapeHtml: (value: string) =>
      value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    formatAccuracy: (value: number) => `${Math.round(value * 100)}%`,
    isPlatformUser: false,
  });
  runInContext(homeRenderer, context);
  return {
    get,
    render: (path: unknown, progress: unknown) =>
      runInContext(
        `renderHomeInsights(${JSON.stringify(path)}, ${JSON.stringify(progress)})`,
        context,
      ),
  };
}

describe("student home", () => {
  it("renders the four reference destinations and keeps secondary pages reachable", () => {
    const nav = html.match(/<nav id="student-bottom-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const destinations = [
      ...nav.matchAll(/data-bottom-page="([^"]+)"[\s\S]*?bottom-nav-label">([^<]+)</gu),
    ].map(([, page, label]) => [page, label]);

    expect(destinations).toEqual([
      ["dashboard", "Ana Sayfa"],
      ["lessons", "Öğrenme Yolu"],
      ["progress", "Gelişim"],
      ["settings", "Profil"],
    ]);
    expect(html).toContain('data-user-menu-page="assignments" data-student');
    expect(html).toContain('data-user-menu-page="assessments" data-student');
    expect(html).toContain('data-user-menu-page="badges" data-student');
    expect(html).toContain('href="/student-home.css"');
    expect(homeStyles).toContain("env(safe-area-inset-bottom)");
  });

  it("uses supplied learning and measurement data without making up values", () => {
    const h = harness();
    h.render(
      {
        currentLevel: { name: "3. Seviye" },
        routeProgress: { completed: 2, total: 3, percent: 67 },
        paths: [{ nodes: [{ status: "active", label: "Temel Beceriler" }] }],
        today: { recentActivity: [{ title: "Ormanların Önemi", type: "EXERCISE" }] },
      },
      {
        items: [{ fluencyWcpm: 162, lastAttemptAt: "2026-11-05T10:00:00.000Z" }],
        summary: { accuracy: 0.78 },
      },
    );

    const summary = h.get("home-insights-values").innerHTML;
    expect(summary).toContain("3. Seviye");
    expect(summary).toContain("162 kelime/dk");
    expect(summary).toContain("78%");
    expect(summary).toContain("2 / 3 adım tamamlandı");
    expect(summary).toContain("Sıradaki: Temel Beceriler");
    expect(h.get("home-recent-activity").innerHTML).toContain("Ormanların Önemi");
    expect(summary).not.toContain("GP");
    expect(h.get("home-insights").classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("labels unavailable measurements instead of showing placeholder statistics", () => {
    const h = harness();
    h.render({ today: { recentActivity: [] } }, { items: [], summary: { accuracy: null } });

    const summary = h.get("home-insights-values").innerHTML;
    expect(summary).toContain("Henüz ölçülmedi");
    expect(summary).toContain("Henüz adım yok");
    expect(summary).not.toContain("%0");
    expect(h.get("home-recent-activity").innerHTML).toContain("Henüz çalışma kaydı yok.");
  });
});
