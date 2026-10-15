import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("student dashboard release 0.4", () => {
  it("uses real student APIs for the dashboard summary", () => {
    expect(app).toContain('authenticatedFetch("/student/today"');
    expect(app).toContain("async function insightApi(path)");
    expect(app).toContain("const insightRequests = new Map()");
    expect(app).toContain("if (existing) return existing");
    expect(app).toContain(".then(parseResponse)");
    expect(app).toContain('const timeoutMs = path === "learning-path" ? 30000 : 15000');
    expect(app).toContain("signal: insightRequestSignal(path)");
    expect(app).toContain('err.requestId = res.headers.get("x-request-id")');
    expect(app).toContain('console.error("learning-path-load-failed"');
    expect(app).toContain("phase: learningPathPhase");
    expect(app).toContain('console.error("learning-path-render-failed"');
    expect(app).toContain('fetch("/student/learning-path/client-diagnostic"');
    expect(app).toContain("reportLearningPathClientError(error, learningPathPhase)");
    expect(app).toContain("pathGroups = pathGroups.filter");
    expect(app).toContain(
      'const paths = ["progress", "gamification", "history?page=1&pageSize=5", "learning-path"];',
    );
    expect(app).toContain('insightApi("learning-path")');
    expect(app).toContain('"/student/learning-path/steps/"');
    expect(app).toContain("loadFocusedLearningPathStep");
    expect(app).toContain("Dersi tamamla");
    expect(app).toContain("nextStep");
    expect(app).toContain("learningPathEntryMode");
    expect(app).not.toContain('if (visualStatus === "completed") return "Tekrar et";');
    expect(app).toContain('class="learning-map-v6-completed-state"');
    expect(app).toContain('fetch("/account/entitlements"');
    expect(app).toContain("function renderTrainingHome(data)");
    expect(app).toContain("function renderTodayData(data, scope)");
    expect(app).toContain("if (data.today) renderTodayData(data.today, scope);");
    expect(app).toContain("summary?.sessionCount");
  });

  it("renders only completed and active ready stations as clickable", () => {
    const container = { innerHTML: "", querySelectorAll: () => [] };
    const context = createContext({
      $: (id: string) => (id === "learning-path" ? container : { textContent: "0" }),
      escapeHtml: (value: unknown) => String(value).replaceAll("<", "&lt;"),
      learningPathContinuation: null,
      insightsIdentity: "student:tenant",
      uiMotion: {
        enhanceRoadmap: () => Promise.resolve({ cancelled: false }),
        enhanceProgress() {},
      },
      continueAfterLearningPathMotion() {},
    });
    runInContext(
      app.slice(
        app.indexOf("function learningPathStatusLabel("),
        app.indexOf("function returnToLearningPathAfterStep("),
      ) +
        app.slice(
          app.indexOf("function learningPathAreaLabel("),
          app.indexOf("async function loadLearningPath()"),
        ),
      context,
    );
    context.groups = [
      {
        path: { area: "READING_COMPREHENSION" },
        nodes: [
          { id: "completed", status: "completed", type: "TEACHING", availability: "READY" },
          { id: "current", status: "active", type: "TEACHING", availability: "READY" },
          { id: "future", status: "locked", type: "TEACHING", availability: "READY" },
          { id: "unavailable", status: "completed", type: "TEACHING", availability: "UNAVAILABLE" },
        ],
      },
    ];
    runInContext("renderLearningPathMap(groups, {name:'Mevcut seviye'})", context);
    const button = (id: string) =>
      container.innerHTML.match(new RegExp(`<button[^>]*data-node-id="${id}"[^>]*>`))?.[0] ?? "";
    expect(button("completed")).not.toContain(" disabled");
    expect(button("current")).toContain('aria-current="step"');
    expect(button("current")).not.toContain(" disabled");
    expect(button("future")).toContain(" disabled");
    expect(button("unavailable")).toContain(" disabled");
    expect(container.innerHTML).toContain("İçerik hazırlanıyor");
    context.groups[0].nodes[1].status = "completed";
    runInContext("renderLearningPathMap(groups, {name:'Mevcut seviye'})", context);
    expect(button("current")).toContain('aria-current="step"');
    expect(button("future")).not.toContain('aria-current="step"');
    expect(button("unavailable")).not.toContain('aria-current="step"');
  });

  it("uses the Learning Path response for the dashboard today card", () => {
    const dashboardStart = app.indexOf('if (page === "dashboard")');
    const dashboardEnd = app.indexOf('} else if (page === "premium-info")', dashboardStart);
    const dashboardNavigation = app.slice(dashboardStart, dashboardEnd);
    expect(dashboardNavigation).not.toContain("void loadToday();");
    expect(dashboardNavigation).toContain("void loadLearningPath();");
  });

  it("keeps empty or unmeasurable progress honest", () => {
    expect(app).toContain("formatAccuracy(summary?.accuracy)");
    expect(app).toContain(
      "Tamamlanan oturumların tüm cevapları. Doğruluk yalnızca puanlanan cevaplar üzerinden hesaplanır.",
    );
    expect(app).toContain("summary.scoredCount");
  });

  it("shows quota, next step, recent activity and accessible responsive states", () => {
    expect(index).toContain('id="today-card"');
    expect(index).toContain('id="home-insights"');
    expect(index).not.toContain('id="learning-path-summary"');
    expect(app).toContain("renderTrainingHome(data)");
    expect(app).toContain("renderHomeInsights(data)");
    expect(app).toContain("data.nextAction");
    expect(app).not.toContain("ADIM ADIM İLERLE");
    expect(app).not.toContain("Öğrenme haritan");
    expect(app).not.toContain("Bir durağı tamamla, sonraki durak açılsın.");
    expect(styles).toContain(".training-home-card");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(index).toContain('aria-live="polite"');
    expect(index).toContain('id="lesson-list-panel"');
    expect(index).toContain('id="lessons-heading"');
    expect(index).not.toContain('data-bottom-page="lessons"');
    expect(index).toContain('data-bottom-page="progress"');
    expect(index).toContain('data-bottom-page="exercise"');
    expect(index).toContain('data-bottom-page="assignments"');
    expect(index).toContain('data-bottom-page="assessments"');
    expect(index).toContain('data-bottom-page="badges"');
    expect(index).not.toContain('id="student-more-toggle"');
    expect(app).not.toContain("<span>ŞİMDİ</span>");
    expect(app).not.toContain("<b>BURADASIN</b>");
    expect(index).toContain('id="user-menu-toggle"');
    expect(index).toContain('data-user-menu-page="settings"');
    expect(index).toContain('data-user-menu-page="billing-account"');
    expect(index).toContain('id="theme-toggle"');
    expect(styles).toContain("#learning-path.learning-path::before");
  });

  it("keeps invalid login feedback visible after the request finishes", () => {
    expect(index).toContain('id="login-error"');
    expect(app).toContain("function formatLoginError(error)");
    expect(app).toContain("E-posta veya şifre yanlış. Bilgilerini kontrol edip tekrar dene.");
    expect(app).toContain('if (isLoading) $("login-error").classList.add("hidden");');
    expect(app).toContain('$("login-error").textContent = formatLoginError(err);');
  });

  it("persists the accessible light and dark theme toggle", () => {
    expect(app).toContain('theme: "oku.theme"');
    expect(app).toContain("function applyTheme(theme)");
    expect(app).toContain("document.documentElement.dataset.theme = resolvedTheme;");
    expect(app).toContain("localStorage.setItem(STORAGE_KEYS.theme, nextTheme);");
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain(".theme-toggle");
  });

  it("does not flash the dashboard while student onboarding is being resolved", () => {
    expect(app).toContain('if (isPlatform) {\n    navigate("dashboard");');
    expect(app).toContain("} else {\n    void maybeShowOnboarding();");
  });
});
