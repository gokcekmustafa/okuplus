import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  buildPlannedLearningRouteNodes,
  LEARNING_ROUTE_CYCLES,
  learningRouteStationCategory,
} from "../src/curriculum/learning-route-catalog.js";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

function articleForNode(container: { innerHTML: string }, id: string): string {
  const buttonIndex = container.innerHTML.indexOf(`data-node-id="${id}"`);
  const articleStart = container.innerHTML.lastIndexOf("<article", buttonIndex);
  const articleEnd = container.innerHTML.indexOf("</article>", buttonIndex) + "</article>".length;
  return container.innerHTML.slice(articleStart, articleEnd);
}

describe("student dashboard release 0.4", () => {
  it("keeps the current learning-map row visible without disabling lazy rendering for other rows", () => {
    expect(styles).toMatch(
      /\.student-shell\s+#learning-path-card\s+\.learning-map-v6-step\s*\{[^}]*content-visibility:\s*auto\s*;?[^}]*\}/u,
    );
    expect(styles).toMatch(
      /\.student-shell\s+#learning-path-card\s+\.learning-map-v6-step\.is-current\s*\{[^}]*content-visibility:\s*visible\s*;?[^}]*\}/u,
    );
  });

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
    const container = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
    const context = createContext({
      $: (id: string) => (id === "learning-path" ? container : { textContent: "0" }),
      escapeHtml: (value: unknown) => String(value).replaceAll("<", "&lt;"),
      learningPathContinuation: null,
      learningPathReturnPosition: null,
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
          {
            id: "current",
            status: "active",
            type: "ASSESSMENT",
            availability: "READY",
            label: "Ana düşünceyi bul",
          },
          {
            id: "future",
            status: "locked",
            type: "PRACTICE",
            stationCategory: "FAST_READING",
            availability: "READY",
          },
          {
            id: "unavailable",
            status: "completed",
            type: "REINFORCEMENT",
            stationCategory: "MULTI_SKILL_ASSESSMENT",
            availability: "UNAVAILABLE",
          },
        ],
      },
    ];
    context.plannedPaths = [
      {
        path: { area: "READING_COMPREHENSION", code: "EDUCATION_V2_P1_A_PLANNED" },
        nodes: [
          {
            id: "planned-authored",
            status: "locked",
            type: "PRACTICE",
            availability: "UNAVAILABLE",
            planningStatus: "AUTHORED_UNRELEASED",
            stationCategory: "COMMON_STRATEGIES",
            label: "Duyuruda gereken bilgiyi hızlı bul",
          },
          {
            id: "planned-empty",
            status: "locked",
            type: "PLANNED",
            availability: "UNAVAILABLE",
            planningStatus: "CONTENT_NOT_AUTHORED",
            label: "Henüz içerik tanımlanmadı",
          },
          {
            id: "planned-graph",
            status: "locked",
            type: "PRACTICE",
            availability: "UNAVAILABLE",
            planningStatus: "GRAPH_NOT_AVAILABLE",
            stationCategory: "INTEGRATED_PRACTICE",
            label: "Kanıt ve aktarım · Adım 1",
          },
        ],
      },
    ];
    expect(
      runInContext("learningPathEntriesFromData({paths:groups, plannedPaths})", context),
    ).toHaveLength(7);
    context.groups = context.groups.concat(context.plannedPaths);
    runInContext("renderLearningPathMap(groups, {name:'Mevcut seviye'})", context);
    const button = (id: string) =>
      container.innerHTML.match(new RegExp(`<button[^>]*data-node-id="${id}"[^>]*>`))?.[0] ?? "";
    expect(button("completed")).not.toContain(" disabled");
    expect(button("current")).toContain('aria-current="step"');
    expect(button("current")).not.toContain(" disabled");
    expect(container.innerHTML).toContain('class="learning-map-v6-current"');
    expect(container.innerHTML).toContain("Ana düşünceyi bul");
    expect(container.innerHTML).toContain("data-learning-map-current");
    expect(button("future")).toContain(" disabled");
    expect(button("unavailable")).toContain(" disabled");
    expect(button("planned-authored")).toContain(" disabled");
    expect(button("planned-empty")).toContain(" disabled");
    expect(button("planned-graph")).toContain(" disabled");
    expect(container.innerHTML).toContain("Kilitli");
    expect(container.innerHTML).toContain("İçerik hazırlanıyor");
    expect(container.innerHTML).toContain("Bu durak henüz hazır değil");
    expect(container.innerHTML).not.toContain("Yayın grafiği hazırlanıyor");
    expect(container.innerHTML).toContain("Duyuruda gereken bilgiyi hızlı bul");
    const futureMarkup = articleForNode(container, "future");
    expect(futureMarkup).toContain("area-fast");
    expect(futureMarkup).toContain('class="learning-map-v6-area">Hızlı Okuma</span>');
    expect(futureMarkup).toContain('class="learning-map-v6-lock" aria-label="Kilitli"');
    expect(futureMarkup).not.toContain('class="learning-map-v6-state">Kilitli</span>');
    expect(articleForNode(container, "current")).toContain("kind-checkpoint");
    expect(futureMarkup).toContain("kind-practice");
    expect(articleForNode(container, "unavailable")).toContain("kind-reinforcement");
    expect(articleForNode(container, "planned-authored")).toContain("Ortak Stratejiler");
    expect(articleForNode(container, "planned-graph")).toContain("Bütünleşik Uygulama");
    expect(container.innerHTML).toContain("Beceri Değerlendirmesi");
    expect(styles).toContain("content-visibility: auto");
    expect(styles).toContain("contain-intrinsic-size: auto 142px");
    expect(styles).toContain(".learning-map-v6-step.kind-practice .learning-map-v6-kind");
    expect(styles).toContain(".learning-map-v6-step.kind-reinforcement .learning-map-v6-kind");
    expect(styles).toContain(".learning-map-v6-step.kind-checkpoint .learning-map-v6-kind");
    expect(styles).toContain(".learning-path-step-type.kind-practice");
    expect(styles).toContain(".learning-path-step-type.kind-reinforcement");
    expect(styles).toContain(".learning-path-step-type.kind-checkpoint");
    expect(runInContext("learningPathCourseStepTypeClass({type:'PRACTICE'})", context)).toBe(
      "kind-practice",
    );
    expect(runInContext("learningPathCourseStepTypeClass({type:'REINFORCEMENT'})", context)).toBe(
      "kind-reinforcement",
    );
    expect(runInContext("learningPathCourseStepTypeClass({type:'ASSESSMENT'})", context)).toBe(
      "kind-checkpoint",
    );
    expect(
      runInContext("learningPathCourseStatusLabel('locked', plannedPaths[0].nodes[0])", context),
    ).toBe("İçerik hazırlanıyor");
    expect(
      runInContext("learningPathCourseStatusLabel('locked', plannedPaths[0].nodes[1])", context),
    ).toBe("İçerik planlanıyor");
    expect(
      runInContext("learningPathCourseStatusLabel('locked', plannedPaths[0].nodes[2])", context),
    ).toBe("Yayın grafiği hazırlanıyor");
    context.groups[0].nodes[1].status = "completed";
    runInContext("renderLearningPathMap(groups, {name:'Mevcut seviye'})", context);
    expect(button("current")).toContain('aria-current="step"');
    expect(button("future")).not.toContain('aria-current="step"');
    expect(button("unavailable")).not.toContain('aria-current="step"');
  });

  it("keeps the 22 + 25 real route stations ahead of every planned position", () => {
    const p0Nodes = Array.from({ length: 22 }, (_, index) => ({
      id: `p0-step-${index + 1}`,
      learningPathCode: "EDUCATION_V2_P0_COMMON_G8_12",
      code: `P0_STEP_${index + 1}`,
      type: "TEACHING",
      status: "completed",
      availability: "READY",
    }));
    const p1Cycles = LEARNING_ROUTE_CYCLES.filter(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence <= 3,
    ).sort((left, right) => left.sequence - right.sequence);
    const realGroups = [
      {
        path: { area: "COMMON", code: "EDUCATION_V2_P0_COMMON_G8_12" },
        nodes: p0Nodes,
      },
      ...p1Cycles.map((cycle) => ({
        path: { area: "READING_COMPREHENSION", code: cycle.pathCode },
        nodes: cycle.manifest.steps.map((step) => ({
          id: `cycle-${cycle.sequence}-step-${step.order}`,
          learningPathCode: cycle.pathCode,
          code: step.stableKey,
          type: step.type,
          status: "completed",
          availability: "READY",
        })),
      })),
    ];
    const visibleCount = realGroups.reduce((count, group) => count + group.nodes.length, 0);
    const plannedNodes = buildPlannedLearningRouteNodes({
      currentPathCode: p1Cycles.at(-1)!.pathCode,
      visibleStationCount: visibleCount,
    });
    const plannedGroup = {
      path: { area: "READING_COMPREHENSION", code: "EDUCATION_V2_P1_A_PLANNED" },
      nodes: plannedNodes,
    };
    const container = { innerHTML: "", querySelectorAll: () => [] };
    const context = createContext({
      $: (id: string) => (id === "learning-path" ? container : { textContent: "0" }),
      escapeHtml: (value: unknown) => String(value).replaceAll("<", "&lt;"),
      learningPathContinuation: null,
      learningPathReturnPosition: null,
      insightsIdentity: "student:tenant",
      uiMotion: {
        enhanceRoadmap: () => Promise.resolve({ cancelled: false }),
        enhanceProgress() {},
      },
      continueAfterLearningPathMotion() {},
      realGroups,
      plannedGroup,
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
    runInContext("renderLearningPathMap(realGroups.concat([plannedGroup]), null)", context);

    const nodeAtStation = (station: number) => {
      const articleStart = container.innerHTML.indexOf(`data-station-number="${station}"`);
      expect(articleStart, `station ${station} should render`).toBeGreaterThanOrEqual(0);
      const buttonStart = container.innerHTML.indexOf("<button", articleStart);
      const buttonEnd = container.innerHTML.indexOf(">", buttonStart);
      return container.innerHTML.slice(buttonStart, buttonEnd + 1);
    };
    expect(visibleCount).toBe(47);
    expect(container.innerHTML.match(/data-station-number="/gu)).toHaveLength(300);
    expect(nodeAtStation(1)).toContain('data-node-id="p0-step-1"');
    expect(nodeAtStation(22)).toContain('data-node-id="p0-step-22"');
    expect(nodeAtStation(23)).toContain('data-node-id="cycle-1-step-1"');
    expect(nodeAtStation(47)).toContain('data-node-id="cycle-3-step-7"');
    expect(nodeAtStation(48)).toContain('data-node-id="planned:A:4:1"');
    for (const station of [103, 127, 128]) {
      expect(nodeAtStation(station)).toContain(" disabled");
      expect(nodeAtStation(station)).not.toContain("cycle-3-step");
    }
    expect(nodeAtStation(47)).toContain("completed");
    expect(container.innerHTML).toContain("İçerik hazırlanıyor");

    const cycle4 = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.routeFamily === "A" && cycle.sequence === 4,
    );
    expect(cycle4).toBeDefined();
    realGroups.push({
      path: { area: "READING_COMPREHENSION", code: cycle4!.pathCode },
      nodes: cycle4!.manifest.steps.map((step, index) => ({
        id: `cycle-4-step-${step.order}`,
        learningPathCode: cycle4!.pathCode,
        code: step.stableKey,
        type: step.type,
        stationCategory: learningRouteStationCategory(
          cycle4!.pathCode,
          `${cycle4!.programId}:${step.stableKey}`,
        ),
        status: index === 0 ? "active" : "locked",
        availability: "READY",
      })),
    });
    plannedGroup.nodes = buildPlannedLearningRouteNodes({
      currentPathCode: cycle4!.pathCode,
      visibleStationCount: 52,
    });
    runInContext("renderLearningPathMap(realGroups.concat([plannedGroup]), null)", context);
    expect(nodeAtStation(48)).toContain('data-node-id="cycle-4-step-1"');
    const station48Markup = articleForNode(container, "cycle-4-step-1");
    const station48Category = learningRouteStationCategory(
      cycle4!.pathCode,
      `${cycle4!.programId}:${cycle4!.manifest.steps[0]!.stableKey}`,
    );
    expect(station48Category).toBeTruthy();
    const categoryLabels: Record<string, string> = {
      FAST_READING: "Hızlı Okuma",
      READING_COMPREHENSION: "Okuduğunu Anlama",
      COMMON_STRATEGIES: "Ortak Stratejiler",
      INTEGRATED_PRACTICE: "Bütünleşik Uygulama",
      MULTI_SKILL_ASSESSMENT: "Beceri Değerlendirmesi",
    };
    expect(station48Markup).toContain(
      `<span class="learning-map-v6-area">${categoryLabels[station48Category!]}</span>`,
    );
    expect(nodeAtStation(48)).toContain('aria-current="step"');
    expect(nodeAtStation(48)).not.toContain(" disabled");
    expect(nodeAtStation(52)).toContain('data-node-id="cycle-4-step-5"');
    expect(nodeAtStation(53)).toContain('data-node-id="planned:A:5:1"');

    for (const cycle of LEARNING_ROUTE_CYCLES.filter(
      (candidate) =>
        candidate.routeFamily === "A" && candidate.sequence >= 5 && candidate.sequence <= 20,
    )) {
      realGroups.push({
        path: { area: "READING_COMPREHENSION", code: cycle.pathCode },
        nodes: cycle.manifest.steps.map((step) => ({
          id: `cycle-${cycle.sequence}-step-${step.order}`,
          learningPathCode: cycle.pathCode,
          code: step.stableKey,
          type: step.type,
          stationCategory: learningRouteStationCategory(
            cycle.pathCode,
            `${cycle.programId}:${step.stableKey}`,
          ),
          status: "locked",
          availability: "READY",
        })),
      });
    }
    plannedGroup.nodes = buildPlannedLearningRouteNodes({
      currentPathCode: LEARNING_ROUTE_CYCLES.find(
        (cycle) => cycle.routeFamily === "A" && cycle.sequence === 20,
      )!.pathCode,
      visibleStationCount: 132,
    });
    runInContext("renderLearningPathMap(realGroups.concat([plannedGroup]), null)", context);
    for (const cycle of LEARNING_ROUTE_CYCLES.filter(
      (candidate) =>
        candidate.routeFamily === "A" && candidate.sequence >= 4 && candidate.sequence <= 20,
    )) {
      for (const step of cycle.manifest.steps) {
        const category = learningRouteStationCategory(
          cycle.pathCode,
          `${cycle.programId}:${step.stableKey}`,
        );
        expect(category, `${cycle.pathCode}/${step.stableKey}`).toBeTruthy();
        const station = 47 + (cycle.sequence - 4) * 5 + step.order;
        expect(articleForNode(container, `cycle-${cycle.sequence}-step-${step.order}`)).toContain(
          `<span class="learning-map-v6-area">${categoryLabels[category!]}</span>`,
        );
        expect(nodeAtStation(station)).toContain(
          `data-node-id="cycle-${cycle.sequence}-step-${step.order}"`,
        );
      }
    }
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
    expect(app).toMatch(
      /import \{\s*createGoogleLoginDiagnostic,\s*formatGoogleLoginError,\s*formatLoginError,\s*setupPasswordVisibilityToggle,\s*\} from "\.\/auth-ui\.js";/u,
    );
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
