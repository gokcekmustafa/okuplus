import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const section = (start: string, end: string) =>
  app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

function classList(initial: string[] = []) {
  const names = new Set(initial);
  return {
    add: (name: string) => names.add(name),
    remove: (name: string) => names.delete(name),
    contains: (name: string) => names.has(name),
    toggle: (name: string, force?: boolean) => {
      const next = force ?? !names.has(name);
      if (next) names.add(name);
      else names.delete(name);
      return next;
    },
  };
}

function viewHarness() {
  const page = { classList: classList() };
  const switcher = {
    classList: classList(),
    querySelectorAll: () => buttons,
  };
  const map = { classList: classList() };
  const list = { classList: classList(["hidden"]) };
  const buttons = [
    {
      dataset: { learningPathView: "map" },
      disabled: false,
      attributes: {} as Record<string, string>,
      setAttribute(name: string, value: string) {
        this.attributes[name] = value;
      },
    },
    {
      dataset: { learningPathView: "list" },
      disabled: false,
      attributes: {} as Record<string, string>,
      setAttribute(name: string, value: string) {
        this.attributes[name] = value;
      },
    },
  ];
  const loadMap = vi.fn();
  const loadList = vi.fn(async () => {});
  const continuation = { scope: "student:a", ready: false };
  const context = createContext({
    currentPage: "lessons",
    learningPathViewMode: "map",
    learningPathNavigationRevision: 0,
    learningPathContinuation: null as typeof continuation | null,
    learningPathTransitionRetryAction: null,
    insightScope: () => "student:a",
    window: { scrollTo: vi.fn() },
    document: { documentElement: { style: { scrollBehavior: "smooth" } } },
    $: (id: string) =>
      ({
        "page-lessons": page,
        "learning-path-view-switch": switcher,
        "learning-path-map-view": map,
        "learning-path-list-view": list,
      })[id],
    loadLearningPath: loadMap,
    loadLessons: loadList,
  });
  runInContext(section("function syncLearningPathView(", "function setLessonPageMode("), context);
  return { context, page, switcher, map, list, buttons, loadMap, loadList, continuation };
}

describe("student Learning Path map and list views", () => {
  it("keeps the real animated map and existing course browser on one student route", () => {
    const lessonsStart = html.indexOf('id="page-lessons"');
    const lessonsEnd = html.indexOf('id="page-assessments"', lessonsStart);
    const lessons = html.slice(lessonsStart, lessonsEnd);
    const dashboardStart = html.indexOf('id="page-dashboard"');
    const dashboardEnd = html.indexOf('id="page-organization-dashboard"', dashboardStart);
    const dashboard = html.slice(dashboardStart, dashboardEnd);

    expect(lessons.match(/id="learning-path-card"/gu)).toHaveLength(1);
    expect(lessons).toContain('id="learning-path-map-view"');
    expect(lessons).toContain('id="learning-path-list-view"');
    expect(lessons).toContain('id="lesson-list"');
    expect(lessons).toContain('id="lesson-detail"');
    expect(lessons.indexOf('id="learning-path-map-view"')).toBeLessThan(
      lessons.indexOf('id="learning-path-list-view"'),
    );
    expect(dashboard).not.toContain('id="learning-path-card"');
    expect(lessons).toMatch(/data-learning-path-view="map" aria-pressed="true">\s*Harita/u);
    expect(lessons).toMatch(
      /data-learning-path-view="list" aria-pressed="false">\s*Bölüm Listesi/u,
    );
  });

  it("switches views without changing path data and returns to the map by default", () => {
    const h = viewHarness();

    expect(h.context.setLearningPathView("list")).toBe(true);
    expect(h.context.learningPathViewMode).toBe("list");
    expect(h.map.classList.contains("hidden")).toBe(true);
    expect(h.list.classList.contains("hidden")).toBe(false);
    expect(h.buttons[1]?.attributes["aria-pressed"]).toBe("true");
    expect(h.context.window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0);
    expect(h.context.document.documentElement.style.scrollBehavior).toBe("smooth");
    expect(h.loadList).toHaveBeenCalledOnce();
    expect(h.loadMap).not.toHaveBeenCalled();

    expect(h.context.setLearningPathView("map")).toBe(true);
    expect(h.context.learningPathViewMode).toBe("map");
    expect(h.map.classList.contains("hidden")).toBe(false);
    expect(h.list.classList.contains("hidden")).toBe(true);
    expect(h.buttons[0]?.attributes["aria-pressed"]).toBe("true");
    expect(h.loadMap).toHaveBeenCalledOnce();
    expect(h.loadList).toHaveBeenCalledOnce();
  });

  it("keeps the list switch unavailable until server-confirmed map motion is ready", () => {
    const h = viewHarness();
    h.context.learningPathContinuation = h.continuation;
    h.context.syncLearningPathView();

    expect(h.buttons[1]?.disabled).toBe(true);
    expect(h.context.setLearningPathView("list")).toBe(false);
    expect(h.context.learningPathViewMode).toBe("map");

    h.continuation.ready = true;
    h.context.syncLearningPathView();
    expect(h.buttons[1]?.disabled).toBe(false);
    expect(h.context.setLearningPathView("list")).toBe(true);
    expect(h.context.learningPathViewMode).toBe("list");
  });

  it.each(["success", "failure"])(
    "ignores a late list %s after opening a lesson",
    async (outcome) => {
      const h = viewHarness();
      const status = { textContent: "", classList: classList() };
      const error = { textContent: "", classList: classList(["hidden"]) };
      const layout = { classList: classList(["hidden"]) };
      const lookup = h.context.$;
      h.context.$ = (id: string) =>
        ({ "lessons-status": status, "lessons-error": error, "lesson-layout": layout })[id] ||
        lookup(id);
      h.context.setLessonPageMode = vi.fn();
      h.context.renderLearningPathCourse = vi.fn();
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      h.context.insightApi = vi.fn(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      runInContext(
        section("async function loadLessons(", "function setupLessonEvents("),
        h.context,
      );
      const refresh = h.context.loadLessons({ scrollToTop: true });
      expect(layout.classList.contains("hidden")).toBe(false);
      h.context.setLearningPathView("map");
      h.page.classList.add("is-focused-lesson");
      h.context.learningPathEntryMode = true;
      h.context.activeLearningStepNode = { id: "active-lesson" };
      status.textContent = "Ders yükleniyor";
      if (outcome === "success") resolve({ nodes: [] });
      else reject(new Error("Request failed"));
      await refresh;
      expect(h.context.insightApi).toHaveBeenCalledExactlyOnceWith("learning-path");
      expect(h.context.renderLearningPathCourse).not.toHaveBeenCalled();
      expect(h.context.activeLearningStepNode).toEqual({ id: "active-lesson" });
      expect(h.page.classList.contains("is-focused-lesson")).toBe(true);
      expect(status.textContent).toBe("Ders yükleniyor");
      expect(error.classList.contains("hidden")).toBe(true);
      expect(h.context.window.scrollTo).not.toHaveBeenCalled();
    },
  );

  it("passes a completion origin to motion only once across map renders", () => {
    const continuation = { fromId: "step-1", ready: false, motionPresented: false };
    const position = { stepId: "step-1", viewportTop: 200 };
    const enhanceRoadmap = vi.fn((...args: unknown[]) => {
      const onStart = args[6] as (detail: { started: boolean }) => void;
      onStart({ started: true });
      return Promise.resolve();
    });
    const context = createContext({
      transition: { continuation, returnPosition: position },
      learningPathContinuation: continuation,
      learningPathReturnPosition: position,
      insightsIdentity: "student:a",
      nodes: [],
      container: {},
      uiMotion: { enhanceRoadmap },
      continueAfterLearningPathMotion: vi.fn(),
    });
    const wireMotion = section(
      "  const continuation = transition?.continuation",
      "  uiMotion.enhanceProgress",
    );
    runInContext(`{${wireMotion}}`, context);
    expect(enhanceRoadmap.mock.calls[0]?.slice(4, 6)).toEqual(["step-1", position]);
    expect(continuation.motionPresented).toBe(true);
    continuation.ready = true;
    runInContext(`{${wireMotion}}`, context);
    expect(enhanceRoadmap.mock.calls[1]?.slice(4, 6)).toEqual([null, null]);
    expect(context.learningPathContinuation).toBe(continuation);
  });
});
