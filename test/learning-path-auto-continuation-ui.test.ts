import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const shared = section(
  "function returnToLearningPathAfterStep(",
  "async function startLearningPathNode(",
);
const navigation = section(
  "function navigate(page",
  "globalThis.__OKUPRATIK_NATIVE_BACK_HANDLER__",
);
const usable = section(
  "function isUsableLearningPathNode(",
  "async function openAssignedP1FirstStep(",
);
const nodes = () => [
  { id: "35", status: "completed", type: "REINFORCEMENT", templateVersionId: "exercise-35" },
  { id: "36", status: "active", type: "TEACHING", contentVersionId: "content-36" },
];

function harness() {
  const cache = new Map([["old-read", Promise.resolve({})]]);
  const button = { disabled: false };
  const container = { setAttribute() {}, querySelector: () => ({}), innerHTML: "" };
  const context = createContext({
    learningPathContinuation: null,
    learningPathNavigationRevision: 0,
    activeLearningStepNode: { id: "35", status: "active" },
    activeLearningStepNavigation: null,
    activeLearningStepNavigationFromStepId: null,
    learningPathEntryMode: true,
    currentPage: "exercise",
    scope: "student:tenant-a",
    insightScope: () => context.scope,
    insightRequestCache: () => cache,
    uiMotion: { cancel: vi.fn(), hasRoadmap: () => true },
    document: { visibilityState: "visible", querySelectorAll: () => [] },
    $: (id: string) =>
      id === "lesson-detail"
        ? { querySelector: () => button }
        : id === "learning-path"
          ? container
          : null,
    PAGES: ["dashboard", "exercise", "lessons", "badges"],
    canAccessPage: () => true,
    isPlatformUser: false,
    setUserMenuOpen() {},
    closeSidebar() {},
    recordPilotTelemetry() {},
    loadLearningPath: vi.fn(),
    loadEntitlements() {},
    loadExercisePage() {},
    loadGamification() {},
    loadFocusedLearningPathStep() {},
    loadLessons() {},
    startLearningPathNode: vi.fn(async () => {}),
    parseResponse: async (response: unknown) => response,
    learningPathStepApi: vi.fn(async () => ({ nextStep: nodes()[1] })),
    setAsyncButtonState: (target: typeof button, busy: boolean) => {
      target.disabled = busy;
    },
  });
  runInContext(shared + usable + navigation, context);
  const run = (script: string) => runInContext(script, context);
  const complete = () => run('returnToLearningPathAfterStep({id:"35",status:"active"}, {id:"36"})');
  return { context, cache, button, container, run, complete };
}

describe("guided station completion → map → motion → next server-unlocked station", () => {
  it("recovers the latest completed cycle using the server route link, beyond station 40", async () => {
    const reconcile = vi.fn(async () => ({ outcome: "ASSIGNED" }));
    const fresh = { paths: [{ path: { id: "cycle-3" }, nodes: [{ id: "41", status: "active" }] }] };
    const context = createContext({
      reconcileP1ToNextCycle: reconcile,
      insightApi: vi.fn(async () => fresh),
      setLearningPathTransitionStatus: vi.fn(),
    });
    runInContext(
      section(
        "async function recoverCompletedP1CycleOnLearningPathLoad(",
        "async function freshLearningPathForTransition(",
      ),
      context,
    );
    context.data = {
      paths: [
        {
          path: {
            id: "cycle-1",
            code: "EDUCATION_V2_P1_A_FIRST",
            routeStatus: "COMPLETED",
            nextCycleCode: "EDUCATION_V2_P1_A_SECOND",
          },
          nodes: [{ status: "completed" }],
        },
        {
          path: {
            id: "cycle-2",
            code: "EDUCATION_V2_P1_A_SECOND",
            routeStatus: "ACTIVE",
            nextCycleCode: "EDUCATION_V2_P1_A_THIRD",
          },
          nodes: [{ status: "completed" }],
        },
      ],
      routeContinuation: { futureCycles: [{ publicationApproved: true, graphAvailable: true }] },
    };
    expect(await runInContext("recoverCompletedP1CycleOnLearningPathLoad(data)", context)).toBe(
      fresh,
    );
    expect(reconcile).toHaveBeenCalledExactlyOnceWith("cycle-2");
    context.data.routeContinuation.futureCycles[0].publicationApproved = false;
    reconcile.mockClear();
    expect(await runInContext("recoverCompletedP1CycleOnLearningPathLoad(data)", context)).toBe(
      context.data,
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("returns first, waits for movement, then starts exactly once with the exact source link", async () => {
    const h = harness();
    h.complete();
    expect(h.context.currentPage).toBe("dashboard");
    expect(h.context.loadLearningPath).toHaveBeenCalledOnce();
    expect(h.cache.size).toBe(0);
    expect(h.context.activeLearningStepNode).toBeNull();
    let finish!: (result: unknown) => void;
    h.context.settled = new Promise((done) => {
      finish = done;
    });
    h.context.nodes = nodes();
    const pending = h.run(
      "continueAfterLearningPathMotion(nodes, learningPathContinuation, settled)",
    );
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
    finish({ cancelled: false });
    await pending;
    expect(h.context.startLearningPathNode).toHaveBeenCalledExactlyOnceWith(nodes()[1], null, "35");
    await h.run("continueAfterLearningPathMotion(nodes, learningPathContinuation, settled)");
    expect(h.context.startLearningPathNode).toHaveBeenCalledOnce();
  });

  it.each([
    "incomplete",
    "locked",
    "gap",
    "missing",
    "content",
    "different-next",
    "earlier-active",
  ])("does not force access with a %s server map", async (kind) => {
    const h = harness();
    h.complete();
    const current = nodes();
    if (kind === "incomplete") current[0]!.status = "active";
    if (kind === "locked") current[1]!.status = "locked";
    if (kind === "gap")
      current.splice(1, 0, {
        id: "gap",
        status: "locked",
        type: "TEACHING",
        contentVersionId: "content",
      });
    if (kind === "missing") current.shift();
    if (kind === "content") current[1]!.contentVersionId = "";
    if (kind === "different-next") current[1]!.id = "37";
    if (kind === "earlier-active")
      current.unshift({
        id: "earlier",
        status: "active",
        type: "TEACHING",
        contentVersionId: "content",
      });
    h.context.nodes = current;
    await h.run(
      "continueAfterLearningPathMotion(nodes, learningPathContinuation, Promise.resolve({cancelled:false}))",
    );
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
  });

  it.each(["navigation", "click", "tenant", "hidden", "cancelled"])(
    "does not auto-open a stale station after %s",
    async (reason) => {
      const h = harness();
      h.complete();
      let finish!: (result: unknown) => void;
      h.context.settled = new Promise((done) => {
        finish = done;
      });
      h.context.nodes = nodes();
      const pending = h.run(
        "continueAfterLearningPathMotion(nodes, learningPathContinuation, settled)",
      );
      if (reason === "navigation") h.run('navigate("badges")');
      if (reason === "click") h.context.learningPathContinuation = null;
      if (reason === "tenant") h.context.scope = "student:tenant-b";
      if (reason === "hidden") h.context.document.visibilityState = "hidden";
      finish({ cancelled: reason === "cancelled" });
      await pending;
      expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
    },
  );

  it("returns a replay to the map without inventing progress or automatically starting another station", () => {
    const h = harness();
    h.run('returnToLearningPathAfterStep({id:"35",status:"completed"}, {id:"36"}, true)');
    expect(h.context.currentPage).toBe("dashboard");
    expect(h.context.learningPathContinuation).toBeNull();
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
  });

  it("routes a teaching completion through the same map rather than starting the next lesson directly", async () => {
    const h = harness();
    runInContext(
      section("async function completeFocusedLearningStep()", "async function loadLessons()"),
      h.context,
    );
    await h.run("completeFocusedLearningStep()");
    expect(h.context.learningPathStepApi).toHaveBeenCalledExactlyOnceWith("35", "/complete", {
      method: "POST",
      body: "{}",
    });
    expect(h.context.currentPage).toBe("dashboard");
    expect(h.context.learningPathContinuation).toMatchObject({ fromId: "35", nextId: "36" });
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
  });

  it("does not redirect a lesson completion after navigation away", async () => {
    const h = harness();
    let finish!: (data: unknown) => void;
    h.context.learningPathStepApi = () =>
      new Promise((done) => {
        finish = done;
      });
    runInContext(
      section("async function completeFocusedLearningStep()", "async function loadLessons()"),
      h.context,
    );
    const pending = h.run("completeFocusedLearningStep()");
    h.run('navigate("badges")');
    finish({ nextStep: nodes()[1] });
    await pending;
    expect(h.context.currentPage).toBe("badges");
    expect(h.context.learningPathContinuation).toBeNull();
  });

  it("returns the terminal checkpoint to the map after its existing server reconciliation", async () => {
    const h = harness();
    h.context.activeLearningStepNode = {
      id: "35",
      status: "active",
      type: "NEXT_LEARNING",
      learningPathId: "p0",
      learningPathCode: "EDUCATION_V2_P0_COMMON",
    };
    h.context.authenticatedFetch = vi.fn(async () => ({}));
    h.context.reconcileP0ToP1 = vi.fn(async () => ({ outcome: "ASSIGNED" }));
    h.context.pendingP1Reconcile = null;
    runInContext(
      section(
        "async function completeLearningPathTerminalStep()",
        "async function recoverCompletedP1CycleOnLearningPathLoad(",
      ),
      h.context,
    );
    await h.run("completeLearningPathTerminalStep()");
    expect(h.context.authenticatedFetch).toHaveBeenCalledExactlyOnceWith(
      "/student/learning-path/steps/35/complete",
      { method: "POST", body: "{}" },
    );
    expect(h.context.reconcileP0ToP1).toHaveBeenCalledExactlyOnceWith("p0");
    expect(h.context.currentPage).toBe("dashboard");
    expect(h.context.learningPathContinuation).toMatchObject({ fromId: "35", nextId: null });
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
  });

  it("discards an in-flight pre-completion map and refreshes before continuing", async () => {
    const h = harness();
    let finish!: (data: unknown) => void;
    h.context.currentPage = "dashboard";
    h.context.learningPathLoading = false;
    h.context.insightsIdentity = "student:tenant-a";
    h.context.insightApi = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finish = done;
          }),
      )
      .mockResolvedValue({ paths: [{ nodes: nodes() }] });
    h.context.clearLearningPathTransitionStatus = () => {};
    h.context.recoverCompletedP1CycleOnLearningPathLoad = async (data: unknown) => data;
    h.context.loadToday = () => {};
    h.context.renderHomeInsights = () => {};
    h.context.renderAcademicLearningModel = () => {};
    h.context.renderLearningPathMap = vi.fn();
    runInContext(
      section("async function loadLearningPath()", "function academicStatusLabel("),
      h.context,
    );
    const pending = h.run("loadLearningPath()");
    h.complete();
    finish({ paths: [{ nodes: [{ id: "35", status: "active" }] }] });
    await pending;
    expect(h.context.insightApi).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(h.context.renderLearningPathMap).toHaveBeenCalledExactlyOnceWith(
        [{ nodes: nodes() }],
        undefined,
      ),
    );
  });
});
