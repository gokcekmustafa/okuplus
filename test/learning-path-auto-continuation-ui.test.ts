import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const shared = section(
  "function learningPathStepElement(",
  "async function startLearningPathNode(",
);
const startNode = section(
  "async function startLearningPathNode(",
  "window.startTodayLearningStep =",
);
const transitionOverlay = section(
  "function ensureStationTransitionOverlay(",
  "async function startLearningPathNode(",
);
const startAssessment = section(
  "window.startTodayAssessment = async function (",
  "window.startTodayExercise =",
);
const transitionStatus = section(
  "function setLearningPathTransitionStatus(",
  "async function reconcileP0ToP1(",
);
const navigationHelpers = section("function studentBottomNavigationTarget(", "function navigate(");
const navigation = section("function navigate(", "globalThis.__OKUPRATIK_NATIVE_BACK_HANDLER__");
const usable = section(
  "function isUsableLearningPathNode(",
  "async function openAssignedP1FirstStep(",
);
const mapClickBinding = section(
  "function bindLearningPathMapNodeClicks(",
  "function renderLearningPathMap(",
);
const nodes = () => [
  { id: "35", status: "completed", type: "REINFORCEMENT", templateVersionId: "exercise-35" },
  { id: "36", status: "active", type: "TEACHING", contentVersionId: "content-36" },
];

function harness(stepId = "35") {
  const cache = new Map([["old-read", Promise.resolve({})]]);
  const button = { disabled: false };
  const statusClasses = new Set(["hidden"]);
  const status = {
    textContent: "",
    classList: {
      toggle: vi.fn((name: string, force: boolean) => {
        if (force) statusClasses.add(name);
        else statusClasses.delete(name);
      }),
      contains: (name: string) => statusClasses.has(name),
    },
  };
  const retryButton = {
    textContent: "Yeni öğrenme yolunu tekrar kontrol et",
    classList: { toggle: vi.fn() },
    disabled: false,
    setAttribute() {},
    removeAttribute() {},
  };
  let rectReads = 0;
  const stepElement = {
    getBoundingClientRect: () => ({ top: rectReads++ === 0 ? 240 : 18, bottom: 160, height: 142 }),
  };
  const stepButton = { dataset: { nodeId: stepId }, closest: () => stepElement };
  const container = {
    setAttribute() {},
    querySelector: () => ({}),
    querySelectorAll: () => [stepButton],
    innerHTML: "existing-learning-map",
  };
  const window = { scrollX: 0, scrollY: 300, scrollBy: vi.fn(), scrollTo: vi.fn() };
  const document = {
    visibilityState: "visible",
    querySelectorAll: () => [],
    scrollingElement: { scrollTop: 300 },
    documentElement: { style: { scrollBehavior: "smooth" } },
  };
  const context = createContext({
    learningPathContinuation: null,
    learningPathReturnPosition: null,
    learningPathTransitionRetryAction: null,
    learningPathTimingActive: false,
    learningPathTimingSequence: 0,
    learningPathTransitionSequence: 0,
    learningPathNavigationRevision: 0,
    stationTransitionRevision: 0,
    stationTransitionOwner: null,
    exercisePageLoadRevision: 0,
    pendingExercisePageLoad: null,
    learningPathNodeStartRequests: new Set<string>(),
    activeLearningStepNode: { id: stepId, status: "active" },
    activeLearningStepVisualPosition: null,
    activeLearningStepNavigation: null,
    activeLearningStepNavigationFromStepId: null,
    learningPathEntryMode: true,
    currentPage: "exercise",
    window: { ...window, crypto: { randomUUID: () => "test-transition-id" } },
    performance: {
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
    },
    scope: "student:tenant-a",
    insightScope: () => context.scope,
    insightRequestCache: () => cache,
    uiMotion: { cancel: vi.fn(), hasRoadmap: () => true },
    document,
    $: (id: string) =>
      id === "learning-path-transition-status"
        ? status
        : id === "learning-path-transition-retry"
          ? retryButton
          : id === "lesson-detail"
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
    beginLearningPathTiming: vi.fn(),
    newLearningPathTransitionSessionId: () => "path-test-transition-id",
    markLearningPathTiming: vi.fn(),
    measureLearningPathTiming: vi.fn(),
    exerciseMode: null,
    activeTrainingActivityId: null,
    loadLearningPath: vi.fn(),
    loadEntitlements() {},
    loadExercisePage() {},
    loadGamification() {},
    loadFocusedLearningPathStep() {},
    loadLessons() {},
    startLearningPathNode: vi.fn(async () => {}),
    isPremiumLimitError: () => false,
    formatStudentError: (_error: unknown, fallback: string) => fallback,
    authenticatedFetch: vi.fn(async () => ({ sessionId: "session-next" })),
    parseResponse: async (response: unknown) => response,
    alert: vi.fn(),
    learningPathStepApi: vi.fn(async () => ({ nextStep: nodes()[1] })),
    setAsyncButtonState: (target: typeof button | null, busy: boolean) => {
      if (target) target.disabled = busy;
    },
  });
  runInContext(
    shared +
      transitionOverlay +
      startNode +
      usable +
      transitionStatus +
      navigationHelpers +
      navigation,
    context,
  );
  const actualStartLearningPathNode = runInContext("startLearningPathNode", context) as (
    ...args: unknown[]
  ) => Promise<void>;
  runInContext(startAssessment, context);
  context.startLearningPathNode = vi.fn(async () => {});
  const run = (script: string) => runInContext(script, context);
  const complete = (fromId = stepId, nextId = "36") =>
    run(
      "returnToLearningPathAfterStep({id:" +
        JSON.stringify(fromId) +
        ',status:"active"}, {id:' +
        JSON.stringify(nextId) +
        "})",
    );
  return {
    context,
    cache,
    button,
    status,
    retryButton,
    container,
    document,
    window,
    stepElement,
    actualStartLearningPathNode,
    run,
    complete,
  };
}

describe("guided station completion → map → motion → next server-unlocked station", () => {
  it("navigates safely when optional bottom-navigation elements are absent", () => {
    const h = harness();

    expect(() => {
      h.run("setStudentMoreMenuOpen(true)");
      h.run("setStudentMoreMenuOpen(false, true)");
      h.run('setStudentBottomNavigation("badges")');
      h.run('navigate("badges")');
    }).not.toThrow();
    expect(h.context.currentPage).toBe("badges");
    expect(h.context.learningPathNavigationRevision).toBe(1);
  });

  it("binds station opening to an explicit click on its map button", () => {
    const node = nodes()[1]!;
    let clickHandler: ((event: unknown) => void) | undefined;
    const button = {
      addEventListener: vi.fn((_type: string, handler: (event: unknown) => void) => {
        clickHandler = handler;
      }),
      getAttribute: (name: string) => (name === "data-node-id" ? node.id : null),
    };
    const startFromMap = vi.fn();
    const context = createContext({
      container: { querySelectorAll: () => [button] },
      nodes: [node],
      startLearningPathNodeFromMap: startFromMap,
    });
    runInContext(mapClickBinding, context);
    runInContext("bindLearningPathMapNodeClicks(container, nodes)", context);

    expect(button.addEventListener).toHaveBeenCalledOnce();
    expect(startFromMap).not.toHaveBeenCalled();
    clickHandler?.({ currentTarget: button });
    expect(startFromMap).toHaveBeenCalledExactlyOnceWith(node, button);
  });

  it("recovers the latest completed cycle using the server route link, beyond station 40", async () => {
    const reconcile = vi.fn(async () => ({ outcome: "ASSIGNED" }));
    const fresh = { paths: [{ path: { id: "cycle-3" }, nodes: [{ id: "41", status: "active" }] }] };
    const context = createContext({
      reconcileP1ToNextCycle: reconcile,
      insightApi: vi.fn(async () => fresh),
      setLearningPathTransitionStatus: vi.fn(),
      learningPathTimingSequence: 0,
      learningPathTimingActive: false,
      markLearningPathTiming: vi.fn(),
      measureLearningPathTiming: vi.fn(),
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

  it("keeps the next station ready after motion and starts only after an explicit tap", async () => {
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
    const routeNodes = nodes();
    routeNodes[1] = {
      ...routeNodes[1]!,
      type: "REINFORCEMENT",
      templateVersionId: "template-36",
    };
    h.context.nodes = routeNodes;
    const pending = h.run(
      "continueAfterLearningPathMotion(nodes, learningPathContinuation, settled)",
    );
    h.run("startLearningPathNodeFromMap(nodes[1], {disabled:false})");
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
    expect(h.context.authenticatedFetch).not.toHaveBeenCalled();
    finish({ cancelled: false });
    await pending;
    expect(h.context.learningPathContinuation).toMatchObject({
      ready: true,
      starting: false,
      targetNode: routeNodes[1],
    });
    expect(h.status.textContent).toBe("");
    expect(h.status.classList.contains("hidden")).toBe(true);
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
    expect(h.context.authenticatedFetch).not.toHaveBeenCalled();

    h.context.startLearningPathNode = vi.fn(h.actualStartLearningPathNode);
    h.run("startLearningPathNodeFromMap(nodes[1], {disabled:false})");
    h.run("startLearningPathNodeFromMap(nodes[1], {disabled:false})");
    expect(h.context.startLearningPathNode).toHaveBeenCalledExactlyOnceWith(
      routeNodes[1],
      expect.objectContaining({ disabled: true }),
      "35",
      { continuation: h.context.learningPathContinuation },
    );
    expect(h.context.authenticatedFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(h.context.authenticatedFetch.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      templateVersionId: "template-36",
      clientSessionId: "path-test-transition-id",
      navigationFromStepId: "35",
      navigationTargetStepId: "36",
    });
    await h.context.startLearningPathNode.mock.results[0]!.value;
    expect(h.context.currentPage).toBe("exercise");

    await h.run("continueAfterLearningPathMotion(nodes, learningPathContinuation, settled)");
    expect(h.context.startLearningPathNode).toHaveBeenCalledOnce();
  });

  it("keeps a middle station at its captured viewport position while returning to the map", () => {
    const h = harness("66");
    h.complete("66", "67");

    expect(h.context.currentPage).toBe("dashboard");
    expect(h.context.learningPathReturnPosition).toMatchObject({
      stepId: "66",
      scope: "student:tenant-a",
      viewportTop: 240,
    });
    expect(h.document.scrollingElement.scrollTop).toBe(78);
    expect(h.document.documentElement.style.scrollBehavior).toBe("smooth");
    expect(h.window.scrollBy).not.toHaveBeenCalled();
    expect(h.container.innerHTML).toBe("existing-learning-map");
  });

  it("keeps the captured map position without showing a success notification", () => {
    const h = harness("66");
    h.complete("66", "67");

    expect(h.status.textContent).toBe("");
    expect(h.status.classList.contains("hidden")).toBe(true);
    expect(h.context.learningPathReturnPosition).toMatchObject({ stepId: "66" });
    expect(h.document.scrollingElement.scrollTop).toBe(78);
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
    expect(h.context.learningPathReturnPosition).toMatchObject({ stepId: "35" });
    expect(h.context.startLearningPathNode).not.toHaveBeenCalled();
  });

  it("does not carry a completion anchor into a fresh page entry", () => {
    const h = harness();
    h.context.learningPathReturnPosition = {
      stepId: "35",
      scope: "student:tenant-a",
      viewportTop: 240,
    };
    h.run('navigate("dashboard")');
    expect(h.context.learningPathReturnPosition).toBeNull();
    expect(h.window.scrollBy).not.toHaveBeenCalled();

    const otherStudent = harness();
    otherStudent.context.scope = "student:tenant-b";
    otherStudent.context.learningPathReturnPosition = {
      stepId: "35",
      scope: "student:tenant-a",
      viewportTop: 240,
    };
    otherStudent.run('navigate("dashboard")');
    expect(otherStudent.context.learningPathReturnPosition).toBeNull();
    expect(otherStudent.document.scrollingElement.scrollTop).toBe(300);
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
    h.context.reportLearningPathClientError = () => {};
    h.context.renderAcademicLearningModel = () => {};
    h.context.renderLearningPathMap = vi.fn();
    runInContext(
      section("async function loadLearningPath()", "function academicStatusLabel("),
      h.context,
    );
    const pending = h.run("loadLearningPath()");
    h.complete();
    expect(h.container.innerHTML).toBe("existing-learning-map");
    expect(h.document.scrollingElement.scrollTop).toBe(78);
    finish({ paths: [{ nodes: [{ id: "35", status: "active" }] }] });
    await pending;
    expect(h.container.innerHTML).toBe("existing-learning-map");
    expect(h.context.insightApi).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(h.context.renderLearningPathMap).toHaveBeenCalledExactlyOnceWith(
        [{ nodes: nodes() }],
        undefined,
        expect.objectContaining({
          continuation: h.context.learningPathContinuation,
          returnPosition: h.context.learningPathReturnPosition,
          onMotionStart: expect.any(Function),
        }),
      ),
    );
  });

  it("measures stages and starts motion before delayed secondary dashboard rendering", async () => {
    const h = harness("66");
    let now = 0;
    const marks = new Map<string, number>();
    const measures = new Map<string, number>();
    const performance = {
      mark: (name: string) => marks.set(name, now),
      clearMarks: (name: string) => marks.delete(name),
      clearMeasures: (name: string) => measures.delete(name),
      measure: (name: string, start: string, end: string) => {
        const startAt = marks.get(start);
        const endAt = marks.get(end);
        if (startAt !== undefined && endAt !== undefined) measures.set(name, endAt - startAt);
      },
    };
    const rafQueue: Array<() => void> = [];
    h.context.performance = performance;
    h.context.window.requestAnimationFrame = (callback: () => void) => {
      rafQueue.push(callback);
      return rafQueue.length;
    };
    h.context.insightsIdentity = "student:tenant-a";
    h.context.currentPage = "dashboard";
    h.context.learningPathLoading = false;
    h.context.insightApi = vi.fn(async () => {
      now += 240;
      return { paths: [{ nodes: nodes() }], today: {}, academicProgram: { areas: [] } };
    });
    h.context.recoverCompletedP1CycleOnLearningPathLoad = vi.fn(async (data: unknown) => {
      now += 120;
      return data;
    });
    h.context.renderTodayData = vi.fn(() => {
      now += 80;
    });
    h.context.renderHomeInsights = vi.fn(() => {
      now += 180;
    });
    h.context.renderAcademicLearningModel = vi.fn(() => {
      now += 120;
    });
    h.context.renderLearningPathMap = vi.fn((_groups, _level, transition) => {
      now += 30;
      rafQueue.push(() => transition.onMotionStart({ animated: true, started: true }));
    });
    h.context.reportLearningPathClientError = vi.fn();
    h.context.loadToday = vi.fn();
    runInContext(
      section("async function loadLearningPath()", "function academicStatusLabel("),
      h.context,
    );
    h.run('beginLearningPathTiming(); markLearningPathTiming("completion-request-start")');
    now += 220;
    h.run("markLearningPathCompletionConfirmed()");
    h.complete("66", "67");
    const loading = h.run("loadLearningPath()");
    expect(h.status.textContent).toBe("");
    expect(h.status.classList.contains("hidden")).toBe(true);
    expect(h.document.scrollingElement.scrollTop).toBe(78);
    await loading;

    const prefix = "okupratik:learning-path-transition:";
    await vi.waitFor(() => {
      h.run("void 0");
      expect(marks.has(prefix + "cycle-recovery-end")).toBe(true);
    });
    expect(measures.get(prefix + "request")).toBe(240);
    expect(measures.get(prefix + "completion-request")).toBe(220);
    expect(measures.get(prefix + "cycle-recovery")).toBe(120);
    expect(measures.get(prefix + "map-render")).toBe(30);
    expect(h.context.renderHomeInsights).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(2);

    const firstFrame = rafQueue.splice(0);
    now += 16;
    firstFrame.forEach((callback) => callback());
    expect(marks.get(prefix + "motion-start")).toBe(626);
    expect(measures.get(prefix + "completion-to-motion")).toBe(406);
    expect(measures.get(prefix + "completion-action-to-motion")).toBe(626);
    expect(h.status.textContent).toBe("");
    expect(h.status.classList.contains("hidden")).toBe(true);
    expect(h.context.renderHomeInsights).not.toHaveBeenCalled();

    const secondFrame = rafQueue.splice(0);
    now += 16;
    secondFrame.forEach((callback) => callback());
    expect(h.context.renderTodayData).toHaveBeenCalledOnce();
    expect(h.context.renderHomeInsights).toHaveBeenCalledOnce();
    expect(h.context.renderAcademicLearningModel).toHaveBeenCalledOnce();
    expect(measures.get(prefix + "secondary-home-render")).toBe(380);

    const previousSerializedOrderMs = 220 + 240 + 120 + 80 + 180 + 120 + 30 + 16;
    const measuredMotionStartMs = measures.get(prefix + "completion-action-to-motion")!;
    expect(measuredMotionStartMs).toBe(626);
    expect(previousSerializedOrderMs).toBe(1006);
    expect(previousSerializedOrderMs - measuredMotionStartMs).toBe(380);
  });

  it("retries a failed next-station start with the same idempotency key and ignores duplicate clicks", async () => {
    const h = harness("66");
    h.complete("66", "67");
    const continuation = h.context.learningPathContinuation;
    continuation.targetNode = {
      ...nodes()[1],
      id: "67",
      type: "REINFORCEMENT",
      templateVersionId: "template-67",
    };
    continuation.ready = true;
    h.context.currentPage = "dashboard";
    h.context.startLearningPathNode = h.actualStartLearningPathNode;
    let finishRetry!: (value: unknown) => void;
    h.context.authenticatedFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockImplementationOnce(() => new Promise((resolve) => (finishRetry = resolve)));
    h.context.setAsyncButtonState = vi.fn();

    h.run("startLearningPathNodeFromMap(learningPathContinuation.targetNode, {disabled:false})");
    await vi.waitFor(() => expect(h.status.textContent).toContain("İlerlemen kaydedildi"));
    expect(h.status.textContent).toContain("İlerlemen kaydedildi");
    expect(h.retryButton.textContent).toBe("İstasyonu yeniden dene");
    expect(h.context.learningPathContinuation.starting).toBe(false);
    const firstBody = JSON.parse(h.context.authenticatedFetch.mock.calls[0]![1].body);

    const firstRetry = h.run("retryLearningPathTransition()");
    h.run("retryLearningPathTransition()");
    expect(h.context.authenticatedFetch).toHaveBeenCalledTimes(2);
    finishRetry({ sessionId: "session-67" });
    await firstRetry;
    await vi.waitFor(() => {
      h.run("void 0");
      expect(h.context.currentPage).toBe("exercise");
    });
    const retryBody = JSON.parse(h.context.authenticatedFetch.mock.calls[1]![1].body);
    expect(retryBody.clientSessionId).toBe(firstBody.clientSessionId);
    expect(retryBody.navigationFromStepId).toBe("66");
    expect(retryBody.navigationTargetStepId).toBe("67");
    expect(h.context.currentPage).toBe("exercise");
  });

  it("keeps a failed assessment start retryable when its helper catches the request error", async () => {
    const h = harness("66");
    const continuation = {
      fromId: "66",
      scope: "student:tenant-a",
      clientSessionId: "path-assessment-retry",
      starting: true,
    };
    h.context.learningPathContinuation = continuation;
    h.context.currentPage = "dashboard";
    h.context.authenticatedFetch = vi.fn(async () => {
      throw new Error("temporary network error");
    });

    await h.actualStartLearningPathNode(
      { id: "67", type: "ASSESSMENT", assessmentId: "assessment-67", status: "active" },
      null,
      "66",
      { continuation },
    );

    expect(h.context.authenticatedFetch).toHaveBeenCalledOnce();
    expect(continuation.starting).toBe(false);
    expect(h.status.textContent).toContain("İlerlemen kaydedildi");
    expect(h.retryButton.textContent).toBe("İstasyonu yeniden dene");
    expect(h.context.currentPage).toBe("dashboard");
  });
});
