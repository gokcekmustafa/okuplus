import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const section = (start: string, end: string) => {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt);
  if (startAt < 0 || endAt < 0) throw new Error("Missing app.js test section: " + start);
  return source.slice(startAt, endAt);
};

class FixtureElement {
  id = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FixtureElement[] = [];
  hidden = false;
  disabled = false;
  textContent = "";
  private markup = "";
  private classes = new Set<string>();
  onMarkup?: (value: string) => void;
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const enabled = force === undefined ? !this.classes.has(name) : force;
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
      return enabled;
    },
  };
  get innerHTML() {
    return this.markup;
  }
  set innerHTML(value: string) {
    this.markup = value;
    this.onMarkup?.(value);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  toggleAttribute(name: string, force?: boolean) {
    const enabled = force === undefined ? !this.attributes.has(name) : force;
    if (enabled) this.attributes.set(name, "");
    else this.attributes.delete(name);
    return enabled;
  }
  appendChild(child: FixtureElement) {
    this.children.push(child);
    return child;
  }
  querySelector() {
    return null;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const elements = new Map<string, FixtureElement>();
  const markupEvents: Array<{ id: string; value: string; overlay: string }> = [];
  const getElement = (id: string) => {
    let element = elements.get(id);
    if (!element) {
      element = new FixtureElement();
      element.id = id;
      element.classList.add("hidden");
      elements.set(id, element);
    }
    return element;
  };
  const body = new FixtureElement();
  body.appendChild = (child: FixtureElement) => {
    elements.set(child.id, child);
    body.children.push(child);
    return child;
  };
  const document = {
    body,
    querySelectorAll: () => [],
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: () => new FixtureElement(),
  };
  const overlayDisplay = () => getElement("station-transition-overlay").style.display || "none";
  [
    "page-dashboard",
    "page-exercise",
    "page-lessons",
    "lesson-detail",
    "lesson-layout",
    "lessons-status",
    "lessons-error",
    "lessons-heading",
    "lessons-description",
    "lessons-eyebrow",
    "lesson-list-title",
    "lesson-list-panel",
    "lessons-refresh",
    "learning-path-course-summary",
    "exercise-admin-card",
    "exercise-load-status",
    "exercise-retry-load",
    "exercise-gp",
    "exercise-content",
    "exercise-session-detail",
    "exercise-current-question",
    "exercise-session-info",
    "student-exercise-header",
    "exercise-page-kicker",
    "exercise-page-title",
    "exercise-page-description",
    "exercise-learning-path-context",
    "exercise-method",
    "training-activities-list",
    "student-reading-card",
    "exercise-training-instructions",
    "exercise-questions-card",
    "exercise-result-card",
  ].forEach(getElement);
  getElement("page-dashboard").classList.remove("hidden");
  getElement("exercise-content").innerHTML = "previous-station-content";
  getElement("exercise-session-detail").innerHTML = "previous-exercise-session";
  getElement("lesson-detail").onMarkup = (value) => {
    if (value) markupEvents.push({ id: "lesson-detail", value, overlay: overlayDisplay() });
  };
  getElement("exercise-content").onMarkup = (value) => {
    if (value) markupEvents.push({ id: "exercise-content", value, overlay: overlayDisplay() });
  };
  getElement("exercise-session-detail").onMarkup = (value) => {
    if (value)
      markupEvents.push({ id: "exercise-session-detail", value, overlay: overlayDisplay() });
  };
  getElement("exercise-current-question").onMarkup = (value) => {
    if (value)
      markupEvents.push({ id: "exercise-current-question", value, overlay: overlayDisplay() });
  };

  type DeferredRequest = ReturnType<typeof deferred<unknown>>;
  const startRequests: DeferredRequest[] = [];
  const assessmentRequests: DeferredRequest[] = [];
  const exerciseRequests: DeferredRequest[] = [];
  const exerciseQuestionRequests: DeferredRequest[] = [];
  const lessonRequests: DeferredRequest[] = [];
  const alerts: string[] = [];
  // The VM context intentionally exposes arbitrary app globals to the harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context: Record<string, any> = createContext({
    document,
    window: { crypto: { randomUUID: () => "fixture-session" } },
    PAGES: ["dashboard", "exercise", "lessons", "badges"],
    currentPage: "dashboard",
    currentPlatformRole: "STUDENT",
    isPlatformUser: false,
    learningPathContinuation: null,
    learningPathReturnPosition: null,
    learningPathTransitionRetryAction: null,
    learningPathTimingActive: false,
    learningPathTimingSequence: 0,
    learningPathTransitionSequence: 0,
    learningPathNavigationRevision: 0,
    learningPathFocusedLessonRevision: 0,
    learningPathNodeStartRequests: new Set<string>(),
    activeLearningStepNode: null,
    activeLearningStepVisualPosition: null,
    activeLearningStepNavigation: null,
    activeLearningStepNavigationFromStepId: null,
    learningPathEntryMode: false,
    stationTransitionRevision: 0,
    stationTransitionOwner: null,
    exercisePageLoadRevision: 0,
    pendingExercisePageLoad: null,
    exerciseLoading: false,
    exerciseBusy: false,
    exerciseSession: null,
    exerciseQuestions: [],
    exerciseAttempts: new Map(),
    currentExerciseQuestionIndex: 0,
    exerciseRequestedSessionId: null,
    exerciseMode: null,
    activeTrainingActivityId: null,
    exerciseScope: "tenant-a",
    dailyTrainingSessionId: null,
    dailyTrainingSummary: null,
    exerciseGamification: null,
    trainingActivitiesState: "idle",
    exerciseReviewMode: false,
    uiMotion: { cancel: vi.fn(), hasRoadmap: () => true },
    performance: { mark: vi.fn(), measure: vi.fn(), clearMarks: vi.fn(), clearMeasures: vi.fn() },
    insightScope: () => "student:tenant-a",
    $: getElement,
    alert: (message: string) => alerts.push(message),
    canAccessPage: () => true,
    setUserMenuOpen() {},
    setStudentMoreMenuOpen() {},
    setStudentBottomNavigation() {},
    closeSidebar() {},
    recordPilotTelemetry() {},
    clearLearningPathTransitionStatus() {},
    loadLearningPath: vi.fn(),
    loadEntitlements: vi.fn(),
    restoreLearningPathVisualPosition() {},
    captureLearningPathVisualPosition: () => null,
    setAsyncButtonState: (button: FixtureElement | null, busy: boolean, label: string) => {
      if (button) {
        button.disabled = busy;
        if (busy) button.textContent = label;
      }
    },
    parseResponse: async (value: unknown) => value,
    authenticatedFetch: (url: string) => {
      const request = deferred<unknown>();
      if (url === "/student/exercises/start") startRequests.push(request);
      else if (url.startsWith("/student/assessments/")) assessmentRequests.push(request);
      else if (url.startsWith("/student/learning-path/steps/")) lessonRequests.push(request);
      else throw new Error("Unexpected authenticated request: " + url);
      return request.promise;
    },
    fetchStudentExercise: () => {
      const request = deferred<unknown>();
      exerciseRequests.push(request);
      return request.promise;
    },
    exerciseApi: () => {
      const request = deferred<unknown>();
      exerciseQuestionRequests.push(request);
      return request.promise;
    },
    learningPathStepApi: () => {
      const request = deferred<unknown>();
      lessonRequests.push(request);
      return request.promise;
    },
    getStoredTokens: () => ({ tenantId: "tenant-a" }),
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    exerciseStorageKey: () => "exercise-test",
    nextDailyTrainingItem: () => null,
    fetchDailyTraining: vi.fn(),
    loadExerciseQuestions: vi.fn(),
    renderExerciseQuestion: () => {
      getElement("exercise-current-question").innerHTML = "first-question-content";
    },
    restoreExerciseAttempts() {},
    rememberExerciseSession() {},
    resetExerciseState() {},
    resetDailyTrainingState() {},
    refreshExerciseGamification: async () => {},
    renderTrainingActivities() {},
    renderStudentReading() {},
    renderStudentTrainingInstructions() {},
    renderLearningPathExerciseNavigation() {},
    currentFastReadingMeasurement: () => null,
    learningPathExerciseContextLabel: () => "Uygulama",
    formatDateTime: () => "30.10.2026",
    hideExerciseError() {},
    formatStudentError: (_error: unknown, fallback: string) => fallback,
    formatDailyTrainingError: () => "Alıştırma yüklenemedi.",
    isPremiumLimitError: () => false,
    setLessonPageMode() {},
    learningPathProgressLabel: () => "2 / 5",
    studentFacingLearningPathLabel: (value: string) => value,
    escapeHtml: (value: unknown) => String(value ?? ""),
    normalizeLearningPathNavigation: () => ({ previousStep: null, nextStep: null }),
    activeLearningPathNodeFromData: () => null,
    setLearningPathTransitionStatus() {},
    markLearningPathTiming() {},
    measureLearningPathTiming() {},
    roleHomePage: () => "dashboard",
  });
  runInContext(
    [
      section("function startLearningPathNodeFromMap(", "function ensureStationTransitionOverlay("),
      section("function ensureStationTransitionOverlay(", "window.startTodayLearningStep ="),
      section("window.startTodayAssessment = async function (", "window.startTodayExercise ="),
      section("function learningPathAdjacentSteps(", "async function loadFocusedLearningPathStep("),
      section(
        "async function loadFocusedLearningPathStep(",
        "function setLearningPathTransitionStatus(",
      ),
      section("async function loadExercisePage(", "function returnToExercisePath("),
      section("function applyExerciseQuestions(", "function renderExerciseQuestion("),
      section("function renderExerciseSession(", "function isFastReadingExercise("),
      section("function navigate(", "globalThis.__OKUPRATIK_NATIVE_BACK_HANDLER__"),
    ].join("\n"),
    context,
  );
  const originalStart = context.startLearningPathNode;
  context.startTasks = [];
  context.startLearningPathNode = (...args: unknown[]) => {
    const task = originalStart(...args);
    context.startTasks.push(task);
    return task;
  };
  const originalExerciseLoad = context.loadExercisePage;
  context.exerciseLoadTasks = [];
  context.loadExercisePage = (options: unknown) => {
    const task = originalExerciseLoad(options);
    context.exerciseLoadTasks.push(task);
    return task;
  };
  const originalLessonLoad = context.loadFocusedLearningPathStep;
  context.lessonLoadTasks = [];
  context.loadFocusedLearningPathStep = (revision: number | null) => {
    const task = originalLessonLoad(revision);
    context.lessonLoadTasks.push(task);
    return task;
  };
  return {
    context,
    getElement,
    overlayDisplay,
    startRequests,
    assessmentRequests,
    exerciseRequests,
    lessonRequests,
    markupEvents,
    alerts,
    exerciseQuestionRequests,
  };
}

const node = (id: string, type = "PRACTICE") => ({
  id,
  status: "active",
  type,
  templateVersionId: "template-" + id,
  ...(type === "TEACHING" || type === "SMALL_STUDY" ? { contentVersionId: "content-" + id } : {}),
  ...(type === "ASSESSMENT" ? { assessmentId: "assessment-" + id } : {}),
});

async function flushUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Expected asynchronous station transition did not start");
}

describe("station transition overlay lifecycle", () => {
  it.each(["PRACTICE", "REINFORCEMENT"])(
    "%s keeps the old page covered until first content renders",
    async (type) => {
      const h = fixture();
      h.context.startLearningPathNodeFromMap(node("42", type), new FixtureElement());
      const task = h.context.startTasks[0];
      expect(h.overlayDisplay()).toBe("flex");
      expect(h.getElement("station-transition-overlay").style).toMatchObject({
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
      });
      expect(h.getElement("page-dashboard").classList.contains("hidden")).toBe(false);
      expect(h.getElement("exercise-content").innerHTML).toBe("previous-station-content");
      expect(h.getElement("exercise-session-detail").innerHTML).toBe("previous-exercise-session");

      h.startRequests[0]!.resolve({ sessionId: "session-42" });
      await flushUntil(() => h.exerciseRequests.length === 1);
      expect(h.context.currentPage).toBe("exercise");
      expect(h.overlayDisplay()).toBe("flex");
      expect(h.getElement("page-exercise").classList.contains("hidden")).toBe(false);
      expect(h.getElement("exercise-content").innerHTML).toBe("previous-station-content");
      expect(h.getElement("exercise-session-detail").innerHTML).toBe("previous-exercise-session");
      h.exerciseRequests[0]!.resolve({
        id: "session-42",
        learningStepId: "42",
        status: "IN_PROGRESS",
        studentId: "fixture-student",
        templateVersionId: "fixture-template",
        startedAt: "2026-10-30T00:00:00.000Z",
        questions: [{ id: "question-42", questionVersionId: "question-version-42" }],
      });
      await task;
      await h.context.exerciseLoadTasks[0];
      expect(h.markupEvents.at(-1)).toMatchObject({
        id: "exercise-session-detail",
        value: expect.stringContaining("session-"),
        overlay: "flex",
      });
      expect(
        h.markupEvents.find((event) => event.id === "exercise-current-question"),
      ).toMatchObject({
        value: "first-question-content",
        overlay: "flex",
      });
      expect(h.overlayDisplay()).toBe("none");
    },
  );

  it.each(["TEACHING", "SMALL_STUDY"])(
    "%s keeps the overlay until lesson DOM is rendered",
    async (type) => {
      const h = fixture();
      const task = h.context.startLearningPathNode(node("51", type), null);
      expect(h.overlayDisplay()).toBe("flex");
      expect(h.context.currentPage).toBe("lessons");
      expect(h.getElement("lesson-detail").innerHTML).toBe("");
      await flushUntil(() => h.lessonRequests.length === 1);
      expect(h.overlayDisplay()).toBe("flex");
      h.lessonRequests[0]!.resolve({
        learningStep: { id: "51", type, status: "active", unitTitle: "Döngü 1" },
        lesson: {
          title: "Yeni istasyon",
          objective: "Metindeki kanıtı bul.",
          explanation: "Önce metni oku.",
          workedExample: "Örnek kanıt.",
          guidedPractice: "Şimdi sen dene.",
        },
        navigation: {},
      });
      await task;
      await h.context.lessonLoadTasks[0];
      expect(h.markupEvents.at(-1)).toMatchObject({ id: "lesson-detail", overlay: "flex" });
      expect(h.getElement("lesson-detail").innerHTML).toContain("Yeni istasyon");
      expect(h.overlayDisplay()).toBe("none");
    },
  );

  it("uses the protected lifecycle for assessment start and session loading", async () => {
    const h = fixture();
    const task = h.context.startLearningPathNode(node("62", "ASSESSMENT"), null);
    expect(h.overlayDisplay()).toBe("flex");
    expect(h.assessmentRequests).toHaveLength(1);
    h.assessmentRequests[0]!.resolve({ sessionId: "assessment-session-62" });
    await flushUntil(() => h.exerciseRequests.length === 1);
    expect(h.overlayDisplay()).toBe("flex");
    h.exerciseRequests[0]!.resolve({
      id: "assessment-session-62",
      learningStepId: "62",
      assessmentId: "assessment-62",
      status: "IN_PROGRESS",
      studentId: "fixture-student",
      templateVersionId: "fixture-template",
      startedAt: "2026-10-30T00:00:00.000Z",
      questions: [{ id: "question-62", questionVersionId: "question-version-62" }],
    });
    await task;
    await h.context.exerciseLoadTasks[0];
    expect(h.markupEvents.at(-1)?.overlay).toBe("flex");
    expect(h.overlayDisplay()).toBe("none");
  });

  it("does not let a stale request hide a newer transition overlay", async () => {
    const h = fixture();
    const first = h.context.startLearningPathNode(node("70"), null);
    const oldRevision = h.context.stationTransitionOwner.revision;
    h.context.navigate("dashboard");
    expect(h.overlayDisplay()).toBe("none");
    const second = h.context.startLearningPathNode(node("71"), null);
    const newRevision = h.context.stationTransitionOwner.revision;
    expect(newRevision).toBeGreaterThan(oldRevision);
    expect(h.overlayDisplay()).toBe("flex");
    h.startRequests[0]!.resolve({ sessionId: "stale-session" });
    await first;
    expect(h.overlayDisplay()).toBe("flex");
    expect(h.context.stationTransitionOwner.revision).toBe(newRevision);
    h.startRequests[1]!.resolve({ sessionId: "current-session" });
    await flushUntil(() => h.exerciseRequests.length === 1);
    h.exerciseRequests[0]!.resolve({
      id: "current-session",
      learningStepId: "71",
      status: "IN_PROGRESS",
      studentId: "fixture-student",
      templateVersionId: "fixture-template",
      startedAt: "2026-10-30T00:00:00.000Z",
      questions: [{ id: "question-71", questionVersionId: "question-version-71" }],
    });
    await second;
    await h.context.exerciseLoadTasks[0];
    expect(h.overlayDisplay()).toBe("none");
  });

  it("discards a stale exercise response before it can render or close the current overlay", async () => {
    const h = fixture();
    const first = h.context.startLearningPathNode(node("90"), null);
    h.startRequests[0]!.resolve({ sessionId: "stale-session" });
    await flushUntil(() => h.exerciseRequests.length === 1);
    const staleLoad = h.context.exerciseLoadTasks[0];
    await first;
    h.exerciseRequests[0]!.resolve({
      id: "stale-session",
      learningStepId: "90",
      status: "IN_PROGRESS",
      studentId: "fixture-student",
      templateVersionId: "fixture-template",
      startedAt: "2026-10-30T00:00:00.000Z",
    });
    await flushUntil(() => h.exerciseQuestionRequests.length === 1);

    h.context.navigate("dashboard");
    const second = h.context.startLearningPathNode(node("91"), null);
    const ownerRevision = h.context.stationTransitionOwner.revision;
    h.startRequests[1]!.resolve({ sessionId: "current-session" });
    await second;

    expect(h.exerciseRequests).toHaveLength(1);
    expect(h.overlayDisplay()).toBe("flex");
    h.exerciseQuestionRequests[0]!.resolve({
      questions: [{ id: "stale-question", questionVersionId: "stale-question-version" }],
    });
    await staleLoad;
    await flushUntil(() => h.exerciseRequests.length === 2);
    expect(h.context.exerciseQuestions).toHaveLength(0);
    expect(h.context.stationTransitionOwner.revision).toBe(ownerRevision);
    expect(h.overlayDisplay()).toBe("flex");
    expect(h.markupEvents).toHaveLength(0);

    h.exerciseRequests[1]!.resolve({
      id: "current-session",
      learningStepId: "91",
      status: "IN_PROGRESS",
      studentId: "fixture-student",
      templateVersionId: "fixture-template",
      startedAt: "2026-10-30T00:00:00.000Z",
      questions: [{ id: "current-question", questionVersionId: "current-question-version" }],
    });
    await h.context.exerciseLoadTasks.at(-1);
    expect(h.markupEvents.at(-1)?.value).toContain("current-");
    expect(h.markupEvents.at(-1)?.overlay).toBe("flex");
    expect(h.overlayDisplay()).toBe("none");
  });

  it("closes on start error and permits a fresh retry transition", async () => {
    const h = fixture();
    const first = h.context.startLearningPathNode(node("81"), null);
    const firstRevision = h.context.stationTransitionOwner.revision;
    h.startRequests[0]!.reject(new Error("backend unavailable"));
    await first;
    expect(h.overlayDisplay()).toBe("none");
    expect(h.alerts).toContain("Bu istasyon şu anda açılamadı. Lütfen tekrar dene.");
    const retry = h.context.startLearningPathNode(node("81"), null);
    expect(h.context.stationTransitionOwner.revision).toBeGreaterThan(firstRevision);
    expect(h.overlayDisplay()).toBe("flex");
    h.startRequests[1]!.resolve({ sessionId: "retry-session" });
    await flushUntil(() => h.exerciseRequests.length === 1);
    h.exerciseRequests[0]!.resolve({
      id: "retry-session",
      learningStepId: "81",
      status: "IN_PROGRESS",
      studentId: "fixture-student",
      templateVersionId: "fixture-template",
      startedAt: "2026-10-30T00:00:00.000Z",
      questions: [{ id: "question-81", questionVersionId: "question-version-81" }],
    });
    await retry;
    await h.context.exerciseLoadTasks[0];
    expect(h.overlayDisplay()).toBe("none");
  });

  it("closes on exercise-load failure and keeps the station retryable", async () => {
    const h = fixture();
    const first = h.context.startLearningPathNode(node("82"), null);
    h.startRequests[0]!.resolve({ sessionId: "failed-load-session" });
    await flushUntil(() => h.exerciseRequests.length === 1);
    await first;
    h.exerciseRequests[0]!.reject(new Error("temporary exercise read failure"));
    await h.context.exerciseLoadTasks[0];
    expect(h.overlayDisplay()).toBe("none");
    expect(h.getElement("exercise-load-status").textContent).toBe(
      "Alıştırma yüklenemedi. Bağlantını kontrol edip tekrar dene.",
    );
    expect(h.getElement("exercise-retry-load").classList.contains("hidden")).toBe(false);

    const retry = h.context.startLearningPathNode(node("82"), null);
    expect(h.overlayDisplay()).toBe("flex");
    h.startRequests[1]!.resolve({ sessionId: "recovered-session" });
    await flushUntil(() => h.exerciseRequests.length === 2);
    h.exerciseRequests[1]!.resolve({
      id: "recovered-session",
      learningStepId: "82",
      status: "IN_PROGRESS",
      studentId: "fixture-student",
      templateVersionId: "fixture-template",
      startedAt: "2026-10-30T00:00:00.000Z",
      questions: [{ id: "recovered-question", questionVersionId: "recovered-question-version" }],
    });
    await retry;
    await h.context.exerciseLoadTasks.at(-1);
    expect(h.markupEvents.at(-1)?.value).toContain("recovere");
    expect(h.overlayDisplay()).toBe("none");
  });
});
