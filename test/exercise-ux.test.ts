import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../public/design-system.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const exerciseCode = source.slice(
  source.indexOf("function exerciseApi("),
  source.indexOf("function setupExerciseEvents("),
);

function harness() {
  const elements = new Map<string, ReturnType<typeof element>>();
  function element() {
    return {
      textContent: "",
      innerHTML: "",
      disabled: false,
      style: { display: "" },
      className: "",
      classList: { add() {}, remove() {}, toggle() {} },
      querySelectorAll: () => [],
      querySelector: () => null,
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
    };
  }
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const context = createContext({
    uiMotion: { enter() {} },
    $: get,
    escapeHtml: (value: string) => value.replaceAll("<", "&lt;"),
    exerciseSession: { id: "session", status: "IN_PROGRESS" },
    exerciseAttempts: new Map(),
    exerciseQuestionTelemetry: new Map(),
    exerciseRetryingQuestionVersionId: null,
    exerciseGamification: null,
    dailyTrainingSummary: null,
    exerciseReviewMode: false,
    exerciseAwaitingNext: false,
    exerciseBusy: false,
    exerciseLoading: false,
    exerciseQuestions: [{ questionVersionId: "q1" }],
    currentExerciseQuestionIndex: 0,
    isPlatformUser: false,
    learningPathEntryMode: false,
    activeLearningStepNode: null,
    activeLearningStepVisualPosition: null,
    learningPathContinuation: null,
    learningPathNavigationRevision: 0,
    learningPathTransitionSequence: 0,
    learningPathTimingActive: false,
    learningPathTimingSequence: 0,
    learningPathCompletionTimingMarked: false,
    window: { crypto: { randomUUID: () => "test-transition-id" } },
    performance: {
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
    },
    currentPage: "exercise",
    insightScope: () => "student:tenant",
    insightRequestCache: () => new Map(),
    pendingP1CycleReconcile: null,
    setLearningPathTransitionStatus: vi.fn(),
  });
  runInContext(
    source.slice(
      source.indexOf("function learningPathStepElement("),
      source.indexOf("async function startLearningPathNode("),
    ),
    context,
  );
  runInContext(exerciseCode, context);
  return { context, get, run: (code: string) => runInContext(code, context) };
}

function answerCard(optionId: string) {
  const classes = new Set<string>();
  const input = { value: optionId };
  return {
    classes,
    card: {
      dataset: {} as Record<string, string>,
      tabIndex: 0,
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
        toggle() {},
      },
      querySelector: () => input,
      setAttribute() {},
    },
  };
}

type SessionRenderFixture = {
  id?: string;
  studentId?: string;
  templateVersionId?: string;
  status?: string;
  learningStepId?: string;
  sessionType?: string;
  assessmentId?: string | null;
  scoreSummary?: { attempted?: number; totalQuestions?: number } | null;
  templateVersion?: {
    version?: number;
    template?: { title?: string };
    training?: { family?: string; rendererKey?: string };
    contents?: Array<{ contentVersion?: { title?: string; body?: string } }>;
  };
};

type SessionRenderElement = {
  innerHTML: string;
  textContent: string;
  style: { display: string };
  classList: { toggle(): void; add(): void; remove(): void };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
  parentElement: { setAttribute(): void };
};

function sessionRenderHarness(session: SessionRenderFixture, stepType = "PRACTICE") {
  const elements = new Map<string, SessionRenderElement>();
  const get = (id: string) => {
    if (!elements.has(id)) {
      const attributes = new Map<string, string>();
      elements.set(id, {
        innerHTML: "",
        textContent: "",
        style: { display: "" },
        classList: { toggle() {}, add() {}, remove() {} },
        setAttribute(name: string, value: string) {
          attributes.set(name, value);
        },
        removeAttribute(name: string) {
          attributes.delete(name);
        },
        getAttribute(name: string) {
          return attributes.get(name) ?? null;
        },
        parentElement: { setAttribute() {} },
      });
    }
    return elements.get(id);
  };
  const renderSession = source.slice(
    source.indexOf("function renderExerciseSession()"),
    source.indexOf("function isFastReadingExercise()"),
  );
  const context = createContext({
    $: get,
    isPlatformUser: false,
    learningPathEntryMode: true,
    activeLearningStepNode: {
      id: "step-53",
      type: stepType,
      status: "active",
      unitTitle: "Okuduğunu Anlama",
      learningPathPosition: 53,
      learningPathTotal: 132,
    },
    exerciseSession: session,
    exerciseQuestions: [{ questionVersionId: "question-1" }],
    currentExerciseQuestionIndex: 0,
    dailyTrainingSummary: null,
    dailyTrainingSessionId: null,
    learningPathProgressLabel: (
      node: { learningPathPosition?: number; learningPathTotal?: number } | null,
    ) =>
      node?.learningPathPosition
        ? `${node.learningPathPosition} / ${node.learningPathTotal}`
        : null,
    learningPathExerciseContextLabel: (node: { unitTitle?: string } | null) =>
      `${node?.unitTitle ?? ""} · Uygulama`,
    escapeHtml: (value: unknown) => String(value ?? ""),
    renderStudentReading(readingSession: SessionRenderFixture) {
      get("student-reading-card").style.display = readingSession?.templateVersion?.contents?.length
        ? "block"
        : "none";
    },
    renderStudentTrainingInstructions(element: { style: { display: string } }) {
      element.style.display = "block";
    },
    currentFastReadingMeasurement: () => null,
    formatDateTime: () => "26 Ekim 2026",
    renderExerciseResult() {},
    renderLearningPathExerciseNavigation() {},
    renderTrainingActivities() {},
  });
  runInContext(renderSession, context);
  return {
    get,
    render: () => runInContext("renderExerciseSession()", context),
  };
}

describe("exercise UX state from production frontend", () => {
  it("keeps completed station results in focus instead of repeating the reading passage", () => {
    const h = sessionRenderHarness({
      id: "session-1",
      studentId: "student-1",
      templateVersionId: "template-version-1",
      status: "COMPLETED",
      learningStepId: "step-53",
      scoreSummary: { attempted: 3, totalQuestions: 3 },
      templateVersion: {
        version: 1,
        template: { title: "Metin kanıtını bul" },
        training: { family: "DETAIL_EVIDENCE", rendererKey: "MULTIPLE_CHOICE" },
        contents: [
          { contentVersion: { title: "Metin", body: "Sonuçtan önce tekrarlanan metin." } },
        ],
      },
    });

    h.render();

    expect(h.get("student-reading-card").style.display).toBe("none");
    expect(h.get("exercise-training-instructions").style.display).toBe("none");
    expect(h.get("exercise-questions-card").style.display).toBe("none");
    expect(h.get("exercise-result-card").style.display).toBe("block");
  });

  it("keeps reading visible while an active session is being answered", () => {
    const h = sessionRenderHarness({
      id: "session-1",
      studentId: "student-1",
      templateVersionId: "template-version-1",
      status: "IN_PROGRESS",
      learningStepId: "step-53",
      templateVersion: {
        version: 1,
        template: { title: "Metin kanıtını bul" },
        training: { family: "DETAIL_EVIDENCE", rendererKey: "MULTIPLE_CHOICE" },
        contents: [{ contentVersion: { title: "Metin", body: "Okunacak metin." } }],
      },
    });

    h.render();

    expect(h.get("student-reading-card").style.display).toBe("block");
    expect(h.get("exercise-training-instructions").style.display).toBe("block");
    expect(h.get("exercise-questions-card").style.display).toBe("block");
    expect(h.get("exercise-result-card").style.display).toBe("none");
  });

  it("sets a visual station type for all supported learning-path activity modes", () => {
    const types = ["TEACHING", "SMALL_STUDY", "PRACTICE", "REINFORCEMENT", "ASSESSMENT"];
    for (const type of types) {
      const h = sessionRenderHarness(
        {
          id: "session-1",
          studentId: "student-1",
          templateVersionId: "template-version-1",
          status: "IN_PROGRESS",
          sessionType: type === "ASSESSMENT" ? "ASSESSMENT" : "PRACTICE",
          assessmentId: type === "ASSESSMENT" ? "assessment-1" : null,
          learningStepId: "step-53",
          templateVersion: {
            version: 1,
            template: { title: "Uygulama" },
            training: { family: "DETAIL_EVIDENCE", rendererKey: "MULTIPLE_CHOICE" },
            contents: [],
          },
        },
        type,
      );
      h.render();
      expect(h.get("exercise-learning-path-context").getAttribute("data-station-type")).toBe(type);
    }
  });

  it("does not label a null score as wrong or award invented GP", () => {
    const h = harness();
    h.run('showExerciseFeedback({ id: "a", isCorrect: null, rawScore: null })');
    expect(h.get("exercise-attempt-feedback").className).toContain("pending");
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("Değerlendirme bekleniyor");
    expect(h.get("exercise-attempt-feedback").innerHTML).not.toContain("GP");
    expect(h.context.exerciseAwaitingNext).toBe(true);
  });

  it("loads the current daily child session even when the daily summary exists", () => {
    expect(source).toContain("if (id) {");
    expect(source).not.toContain("if (id && !dailyTrainingSummary) {");
  });

  it("keeps the production answer lock and pending feedback contracts", () => {
    expect(source).toContain('setExerciseSubmitButtonState(true, "Cevap kontrol ediliyor…")');
    expect(source).toContain('button.setAttribute("aria-busy", "true")');
    expect(source).toContain("q.allowMultiple === true");
    expect(styles).toContain('label.answer-card[aria-disabled="true"]:hover');
    expect(styles).toContain('label.answer-card[aria-disabled="true"]:focus-visible');
  });

  it("shows only points linked to this actual attempt", () => {
    const h = harness();
    h.context.exerciseGamification = {
      recentPointEvents: [
        { sourceType: "ATTEMPT", sourceId: "other", points: 100 },
        { sourceType: "ATTEMPT", sourceId: "a", points: 7 },
      ],
    };
    h.run('showExerciseFeedback({ id: "a", isCorrect: true, rawScore: 1 })');
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("+7 GP");
    expect(h.get("exercise-attempt-feedback").innerHTML).not.toContain("+10 GP");
    expect(h.get("exercise-attempt-feedback").innerHTML).not.toContain("100 GP");
  });

  it("renders a single success title and keeps attempt points and score in one summary row", () => {
    const h = harness();
    h.context.exerciseGamification = {
      recentPointEvents: [{ sourceType: "ATTEMPT", sourceId: "a", points: 7 }],
    };
    h.run(`showExerciseFeedback({
      id: "a",
      isCorrect: true,
      rawScore: 1,
      feedback: { message: "✓ Güzel yakaladın." },
    })`);

    const html = h.get("exercise-attempt-feedback").innerHTML;
    const summary = html.match(/<div class="feedback-panel-summary">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect((html.match(/Güzel yakaladın\./g) ?? []).length).toBe(1);
    expect(summary).toContain("✓ Güzel yakaladın.");
    expect(summary).toContain("+7 GP");
    expect(summary).toContain("Puan: 1.00");
    expect(summary).not.toContain("+10 GP");
    expect(designSystem).toContain("@media (max-width: 360px)");
    expect(designSystem).toContain("feedback-panel-summary > strong");
  });

  it("uses the product's Turkish inline feedback contract", () => {
    const h = harness();
    h.run(
      'showExerciseFeedback({ id: "correct", questionVersionId: "q1", isCorrect: true, rawScore: 1 })',
    );
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("✓ Güzel yakaladın.");

    h.run(
      'showExerciseFeedback({ id: "wrong", questionVersionId: "q1", isCorrect: false, rawScore: 0, feedback: "İpucu" })',
    );
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("Tekrar düşün.");
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("İpucu");
  });

  it("colors multiple-choice options only from the server's evaluated attempt", () => {
    const h = harness();
    const correct = answerCard("option-a");
    const wrong = answerCard("option-b");
    const currentQuestion = h.get("exercise-current-question");
    currentQuestion.dataset = { questionVersionId: "q1" };
    currentQuestion.querySelectorAll = (selector: string) =>
      selector === "label.answer-card" ? [correct.card, wrong.card] : [];
    h.context.exerciseQuestions = [
      {
        questionVersionId: "q1",
        type: "MULTIPLE_CHOICE",
        options: [
          { id: "option-a", text: "Doğru seçenek" },
          { id: "option-b", text: "Yanlış seçenek" },
        ],
      },
    ];

    h.run(
      'applyExerciseAnswerFeedback({ questionVersionId: "q1", answer: ["option-b"], isCorrect: null }, exerciseQuestions[0])',
    );
    h.run(
      'applyExerciseAnswerFeedback({ questionVersionId: "q1", answer: ["option-b"] }, exerciseQuestions[0])',
    );
    expect(correct.classes.has("correct")).toBe(false);
    expect(wrong.classes.has("wrong")).toBe(false);

    h.run(
      'showExerciseFeedback({ id: "attempt-correct", questionVersionId: "q1", answer: ["option-a"], isCorrect: true, rawScore: 1 })',
    );
    expect(correct.classes.has("correct")).toBe(true);
    expect(wrong.classes.has("wrong")).toBe(false);

    h.run(
      'showExerciseFeedback({ id: "attempt-retry", questionVersionId: "q1", answer: ["option-b"], isCorrect: false, responseOrder: 1, rawScore: 0 })',
    );
    expect(wrong.classes.has("wrong")).toBe(true);
    // The server withholds the key on the retryable first error.
    expect(correct.classes.has("correct")).toBe(false);
    expect(h.get("exercise-attempt-feedback").className).toContain("retry");

    h.run(`showExerciseFeedback({
      id: "attempt-final",
      questionVersionId: "q1",
      answer: ["option-b"],
      isCorrect: false,
      responseOrder: 2,
      rawScore: 0,
      correctAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["option-a"] },
    })`);
    expect(wrong.classes.has("wrong")).toBe(true);
    expect(correct.classes.has("correct")).toBe(true);
    expect(h.get("exercise-attempt-feedback").className).toContain("final-wrong");
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("Bu defa olmadı.");
  });

  it("clears answer colors when a new question is rendered and when retrying", () => {
    const h = harness();
    const correct = answerCard("option-a");
    const wrong = answerCard("option-b");
    const currentQuestion = h.get("exercise-current-question");
    currentQuestion.querySelectorAll = (selector: string) =>
      selector === "label.answer-card" ? [correct.card, wrong.card] : [];
    correct.classes.add("correct");
    wrong.classes.add("wrong");

    h.run("clearExerciseAnswerFeedback()");

    expect(correct.classes.has("correct")).toBe(false);
    expect(wrong.classes.has("wrong")).toBe(false);
    const renderStart = source.slice(
      source.indexOf("function renderExerciseQuestion()"),
      source.indexOf("function lockExerciseInputs("),
    );
    expect(renderStart).toContain("clearExerciseAnswerFeedback();");
    expect(renderStart).toContain('if (feedbackEl) feedbackEl.style.display = "none";');
  });

  it("keeps answer and feedback states strongly contrasted in both themes", () => {
    expect(designSystem).toContain(".app .feedback-panel.correct");
    expect(designSystem).toContain("color: var(--ui-success);");
    expect(designSystem).toContain(".app .feedback-panel.retry");
    expect(designSystem).toContain(".app .feedback-panel.final-wrong");
    expect(designSystem).toContain("color: var(--ui-danger);");
    expect(designSystem).toContain("label.answer-card.correct");
    expect(designSystem).toContain("label.answer-card.wrong");
    expect(designSystem).toContain("#exercise-attempt-feedback.feedback-panel.final-wrong");
    expect(designSystem).toContain("label.answer-card.selected.wrong");
    expect(designSystem).toContain(':root[data-theme="dark"]');
  });

  it("uses the updated failure copy and hides structured feedback internals", () => {
    const h = harness();
    h.context.exerciseQuestions = [
      {
        questionVersionId: "q1",
        options: [{ id: "b", text: "Anlamlı kelime grubu" }],
      },
    ];
    h.run(`showExerciseFeedback({
      id: "wrong-2",
      questionVersionId: "q1",
      responseOrder: 2,
      isCorrect: false,
      rawScore: 0,
      feedback: {
        message: "Bu kez olmadı.",
        explanation: "Anlamlı grup, cümledeki ilişkiyi koruyan doğal kelime birliğidir.",
        revealedAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["b"] },
      },
      correctAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["b"] },
    })`);
    const html = h.get("exercise-attempt-feedback").innerHTML;
    expect(html).toContain("Bu defa olmadı.");
    expect(html).not.toContain("Bu kez olmadı.");
    expect(html).toContain("Anlamlı grup, cümledeki ilişkiyi koruyan doğal kelime birliğidir.");
    expect(html).toContain("Anlamlı kelime grubu");
    expect(html).not.toContain("revealedAnswer");
    expect(html).not.toContain("correctOptionIds");
    expect(html).not.toContain("[object Object]");
    expect(h.run('exerciseFeedbackText("Bu kez olmadı.")')).toBe("");
  });

  it.each([false, true])(
    "keeps wrong-answer feedback inline without an overlay (fast reading: %s)",
    async (fastReading) => {
      const h = harness();
      let detail: unknown = null;
      h.context.showCelebration = (payload: { detail?: unknown }) => {
        detail = payload.detail;
      };
      h.run(`
      exerciseRequest = null;
      crypto = { randomUUID: () => "request-id" };
      $("exercise-current-question").dataset = { questionVersionId: "q1", questionType: "OPEN_ENDED" };
      $("exercise-current-question").querySelector = () => ({ value: "Yanıt" });
      exerciseApi = async () => ({});
      parseResponse = async () => ({
        id: "attempt",
        questionVersionId: "q1",
        isCorrect: false,
        rawScore: 0,
        responseOrder: 1,
        feedback: { message: "Kısa açıklama" },
      });
      refreshExerciseGamification = async () => null;
      recordPilotTelemetry = () => {};
      isFastReadingExercise = () => false;
      isDailyTrainingExercise = () => false;
    `);

      h.context.isFastReadingExercise = () => fastReading;

      await h.run("handleExerciseSubmitAttempt()");

      expect(detail).toBeNull();
      expect(h.get("exercise-attempt-feedback").innerHTML).toContain("Kısa açıklama");
      expect(String(detail)).not.toContain("[object Object]");
    },
  );

  it("encodes session and question identifiers before placing them in request paths", () => {
    expect(source).toContain("`/questions/${encodeURIComponent(questionVersionId)}/attempts`");
    expect(source).toContain("sessionId = exerciseSession?.id");
    expect(source).toContain("`/exercise-sessions/${encodeURIComponent(sessionId)}/questions`");
    expect(source).toContain(
      "exerciseApi(`/exercise-sessions/${encodeURIComponent(exerciseSession.id)}/complete`",
    );
  });

  it("reuses questions already returned by the student session endpoint", () => {
    expect(source).toContain(
      "if (Array.isArray(session.questions)) applyExerciseQuestions(session.questions)",
    );
    expect(source).toContain("function applyExerciseQuestions(questions)");
  });

  it("keeps the station marker visible while its start request is pending", () => {
    expect(source).toContain('button.matches(".learning-map-v6-node")');
    expect(styles).toContain(".learning-map-v6-node.is-pending .learning-map-v6-marker");
    expect(styles).toContain("okuplus-map-v6-loading-fill");
    expect(styles).toContain("animation: okuplus-map-v6-loading-fill 1.15s ease-in-out infinite");
    expect(designSystem).not.toContain(".learning-map-v6-marker-wrap::after");
  });

  it("shows exercise navigation only when replaying a completed Learning Path station", () => {
    const h = harness();
    h.context.learningPathEntryMode = true;
    h.context.exerciseSession.learningStepId = "active-step";
    h.context.activeLearningStepNavigation = {
      previousStep: { id: "previous-step", status: "completed" },
      nextStep: { id: "next-step", status: "active" },
    };
    h.context.activeLearningStepNode = { id: "active-step", status: "active" };

    h.run("renderLearningPathExerciseNavigation()");
    expect(h.get("exercise-learning-path-navigation").innerHTML).toBe("");

    h.context.activeLearningStepNode.status = "completed";
    h.run("renderLearningPathExerciseNavigation()");
    const html = h.get("exercise-learning-path-navigation").innerHTML;
    expect(html).toContain("data-learning-path-previous");
    expect(html).toContain("data-learning-path-next");
  });

  it("keeps answered but unscored items pending even when summary flag is false", () => {
    const h = harness();
    h.context.exerciseSession.scoreSummary = {
      totalQuestions: 5,
      attempted: 5,
      scoredCount: 4,
      totalRawScore: 0,
      averageScore: 0,
      pendingEvaluation: false,
    };
    h.run("renderExerciseResult()");
    expect(h.get("exercise-result-body").innerHTML).toContain(
      "1 cevap için değerlendirme bekleniyor",
    );
    expect(h.get("exercise-result-body").innerHTML).toContain("0%");
    expect(h.get("exercise-result-body").innerHTML).toContain("Öğrenme Yoluna Dön");
  });

  it("keeps secondary independent-training results collapsed and labels scored answers accurately", () => {
    const h = harness();
    h.context.exerciseMode = "activity";
    h.context.exerciseSession = {
      id: "training-session",
      status: "COMPLETED",
      scoreSummary: {
        totalQuestions: 3,
        attempted: 3,
        scoredCount: 2,
        totalRawScore: 1.5,
        averageScore: 0.75,
      },
    };
    h.run("renderExerciseResult()");
    const html = h.get("exercise-result-body").innerHTML;

    expect(html).toContain("Değerlendirilen cevapların ortalaması");
    expect(html).toContain('class="station-completion-mark"');
    expect(html).toContain("Aktiviteyi tamamladın!");
    expect(html).not.toContain("🎉");
    expect(html).toContain('class="exercise-result-details"');
    expect(html).toContain("<summary>Çalışma ayrıntıları</summary>");
    expect(html).toContain("Puanlanan cevap");
    expect(html).not.toContain("Doğru cevap");
    expect(html).not.toMatch(/<details[^>]*\bopen\b/u);
  });

  it("reconciles with server attempts without leaking a different attempt's score", () => {
    const h = harness();
    h.context.exerciseAttempts.set("q1", { id: "old", isCorrect: true, rawScore: 1 });
    h.run(
      'restoreExerciseAttempts({ attempts: [{ id: "new", questionVersionId: "q1", isCorrect: null }] })',
    );
    const attempt = h.context.exerciseAttempts.get("q1");
    expect(attempt.id).toBe("new");
    expect(attempt.isCorrect).toBeNull();
    expect(attempt.rawScore).toBeUndefined();
  });

  it("keeps the latest retry when server history is not ordered", () => {
    const h = harness();
    h.run(
      'restoreExerciseAttempts({ attempts: [{ id: "retry", questionVersionId: "q1", responseOrder: 2, isCorrect: true }, { id: "first", questionVersionId: "q1", responseOrder: 1, isCorrect: false }] })',
    );
    const attempt = h.context.exerciseAttempts.get("q1");
    expect(attempt.id).toBe("retry");
    expect(attempt.responseOrder).toBe(2);
    expect(attempt.isCorrect).toBe(true);
  });

  it("renders learning path exercise navigation at the bottom with direct neighbors only", () => {
    const h = harness();
    h.context.learningPathEntryMode = true;
    h.context.exerciseSession = { id: "session", status: "IN_PROGRESS", learningStepId: "step-2" };
    h.context.activeLearningStepNode = { id: "step-2", status: "completed" };
    h.context.activeLearningStepNavigation = {
      previousStep: { id: "step-1", status: "completed" },
      nextStep: { id: "step-3", status: "active" },
    };
    h.run("renderLearningPathExerciseNavigation()");
    const html = h.get("exercise-learning-path-navigation").innerHTML;
    expect(html).toContain("data-learning-path-previous");
    expect(html).toContain("data-learning-path-next");
    expect(html.indexOf("data-learning-path-previous")).toBeLessThan(
      html.indexOf("data-learning-path-next"),
    );
    expect(index.indexOf('id="exercise-result-card"')).toBeLessThan(
      index.indexOf('id="exercise-learning-path-navigation"'),
    );
    expect(index).toContain('class="exercise-result-kicker">ÇALIŞMA SONUCU</p>');
    expect(index).toContain("Bu soruyu yanıtla");
    expect(styles).toContain(".learning-path-exercise-navigation [data-learning-path-next]");
  });

  it("keeps Next hidden when the immediate learning path neighbor is locked", () => {
    const h = harness();
    h.context.learningPathEntryMode = true;
    h.context.exerciseSession = { id: "session", status: "IN_PROGRESS", learningStepId: "step-2" };
    h.context.activeLearningStepNode = { id: "step-2", status: "completed" };
    h.context.activeLearningStepNavigation = {
      previousStep: { id: "step-1", status: "completed" },
      nextStep: null,
    };
    h.run("renderLearningPathExerciseNavigation()");
    const html = h.get("exercise-learning-path-navigation").innerHTML;
    expect(html).toContain("data-learning-path-previous");
    expect(html).not.toContain("data-learning-path-next");
  });

  it("allows replay navigation with an unanswered exercise", () => {
    const h = harness();
    h.context.learningPathEntryMode = true;
    h.context.exerciseSession = { id: "session", status: "IN_PROGRESS", learningStepId: "step-2" };
    h.context.activeLearningStepNode = { id: "step-2", status: "completed" };
    h.context.exerciseAttempts = new Map();
    h.context.activeLearningStepNavigation = {
      previousStep: { id: "step-1", status: "completed" },
      nextStep: { id: "step-3", status: "active" },
    };
    h.run("restoreExerciseAttempts({ attempts: [] }); renderLearningPathExerciseNavigation()");
    expect(h.context.exerciseAttempts.size).toBe(0);
    expect(h.get("exercise-learning-path-navigation").innerHTML).toContain(
      "data-learning-path-next",
    );
  });

  it("returns to the roadmap after completing a roadmap exercise", async () => {
    const h = harness();
    h.context.learningPathEntryMode = true;
    h.context.exerciseSession = {
      id: "session",
      status: "IN_PROGRESS",
      learningStepId: "step-20",
    };
    h.context.activeLearningStepNode = { id: "step-20", status: "active" };
    h.context.activeLearningStepNavigation = null;
    // A previous independent Training activity must not change the return
    // destination of a Learning Path exercise.
    h.context.exerciseMode = "activity";
    h.context.insightNewAwards = new Map();
    h.context.insightsIdentity = "test";
    h.context.normalizeLearningPathNavigation = (navigation: unknown) => navigation;
    h.run(`
      fetchStudentExercise = async () => ({
        id: "session",
        status: "COMPLETED",
        learningStepId: "step-20",
        nextLearningStep: { id: "step-21", status: "active" },
      });
      exerciseApi = async () => ({});
      parseResponse = async () => ({
        id: "session",
        status: "COMPLETED",
        learningStepId: "step-20",
        nextLearningStep: { id: "step-21", status: "active" },
      });
      refreshExerciseGamification = async () => null;
      showCelebration = () => {};
      recordPilotTelemetry = () => {};
      rememberExerciseSession = () => {};
      resetDailyTrainingState = () => {};
      resetExerciseState = () => {};
      renderExerciseSession = () => {};
      navigate = (page) => { lastNavigatedPage = page; };
    `);
    h.get("learning-path").scrollIntoView = () => {};

    await h.run("handleExerciseComplete()");

    expect(h.context.lastNavigatedPage).toBe("dashboard");
    expect(h.context.learningPathEntryMode).toBe(false);
  });

  it("uses the persisted step link to return even if the entry mode flag was lost", async () => {
    const h = harness();
    h.context.learningPathEntryMode = false;
    h.context.exerciseSession = {
      id: "session",
      status: "IN_PROGRESS",
      learningStepId: "step-20",
    };
    h.context.activeLearningStepNode = { id: "step-20", status: "active" };
    h.context.activeLearningStepNavigation = null;
    h.context.refreshExerciseGamification = async () => {
      throw new Error("optional points request failed");
    };
    h.context.showCelebration = () => {
      throw new Error("optional presentation failed");
    };
    h.context.fetchStudentExercise = async () => ({ id: "session", status: "IN_PROGRESS" });
    h.context.exerciseApi = async () => ({});
    h.context.parseResponse = async () => ({
      id: "session",
      status: "COMPLETED",
      learningStepId: "step-20",
      scoreSummary: { totalQuestions: 1 },
    });
    h.context.recordPilotTelemetry = () => {};
    h.context.rememberExerciseSession = () => {};
    h.context.resetDailyTrainingState = () => {};
    h.context.resetExerciseState = () => {};
    h.context.renderExerciseSession = () => {};
    h.context.normalizeLearningPathNavigation = (navigation: unknown) => navigation;
    h.context.navigate = (page: string) => {
      h.context.lastNavigatedPage = page;
    };
    h.get("learning-path").scrollIntoView = () => {};

    await h.run("handleExerciseComplete()");

    expect(h.context.lastNavigatedPage).toBe("dashboard");
    expect(h.context.learningPathEntryMode).toBe(false);
    expect(h.get("exercise-attempt-error").textContent).not.toContain("tamamlanamadı");
  });

  it.each(["response", "recovery"])(
    "returns a confirmed guided %s through the same roadmap continuation",
    async (mode) => {
      const h = harness();
      const original = { id: "session", status: "IN_PROGRESS", learningStepId: "step-35" };
      h.context.exerciseSession = original;
      h.context.activeLearningStepNode = { id: "step-35", status: "active" };
      h.context.exerciseApi = async () => {
        if (mode === "recovery") throw new Error("response lost");
        return {};
      };
      // A reduced response must not erase the original server-provided step link.
      const completed = { id: "session", status: "COMPLETED" };
      h.context.parseResponse = async () => completed;
      h.context.fetchStudentExercise = async () => completed;
      h.context.rememberExerciseSession = () => {};
      h.context.resetDailyTrainingState = () => {};
      h.context.resetExerciseState = () => {};
      h.context.renderExerciseSession = () => {
        throw new Error("result UI must not block return");
      };
      h.context.navigate = (page: string, options: unknown) => {
        h.context.lastNavigation = { page, options };
      };
      await h.run("handleExerciseComplete()");
      expect(h.context.lastNavigation).toMatchObject({
        page: "dashboard",
        options: {
          continuation: {
            fromId: "step-35",
            nextId: null,
            scope: "student:tenant",
            clientSessionId: "path-test-transition-id",
            starting: false,
          },
        },
      });
      expect(original.status).toBe("IN_PROGRESS");
    },
  );

  it("returns to the route immediately and leaves cycle reconciliation to the fresh route load", async () => {
    const h = harness();
    const original = { id: "session", status: "IN_PROGRESS", learningStepId: "step-52" };
    const node = {
      id: "step-52",
      status: "active",
      learningPathId: "cycle-8",
      learningPathCode: "EDUCATION_V2_P1_A_CYCLE_8",
    };
    h.context.originalSession = original;
    h.context.node = node;
    h.context.exerciseSession = {
      id: "session",
      status: "COMPLETED",
      learningStepId: "step-52",
      nextLearningStep: null,
    };
    h.context.reconcileP1ToNextCycle = vi.fn(async () => ({ outcome: "ASSIGNED" }));
    h.context.returnToLearningPathAfterGuidedExercise = vi.fn();

    await h.run("finishGuidedExerciseCompletion(originalSession, node, () => true, false)");

    expect(h.context.reconcileP1ToNextCycle).not.toHaveBeenCalled();
    expect(h.context.returnToLearningPathAfterGuidedExercise).toHaveBeenCalledExactlyOnceWith(
      { ...node, id: "step-52" },
      null,
      false,
    );
  });

  it.each(["assignment", "independent", "daily"])(
    "does not continue a %s session on the roadmap",
    async (kind) => {
      const h = harness();
      h.context.exerciseSession = {
        id: "session",
        status: "IN_PROGRESS",
        learningStepId: "step-35",
        ...(kind === "assignment" ? { assignmentId: "assignment" } : {}),
        ...(kind === "independent" ? { deviceInfo: { source: "INDEPENDENT_TRAINING" } } : {}),
      };
      h.context.returnToLearningPathAfterGuidedExercise = () => {
        throw new Error("unexpected return");
      };
      h.context.exerciseSession.status = "COMPLETED";
      expect(
        await h.run(
          `finishGuidedExerciseCompletion(exerciseSession, null, () => true, ${kind === "daily"})`,
        ),
      ).toBe(false);
    },
  );

  it.each(["server-source", "completed-node"])(
    "does not reconcile a replay identified by %s",
    async (evidence) => {
      const h = harness();
      h.context.originalSession = {
        id: "session",
        status: "IN_PROGRESS",
        learningStepId: "step-31",
        ...(evidence === "server-source" ? { deviceInfo: { source: "LEARNING_PATH_REPLAY" } } : {}),
      };
      h.context.exerciseSession = { id: "session", status: "COMPLETED", learningStepId: "step-31" };
      h.context.node = {
        id: "step-31",
        status: evidence === "completed-node" ? "completed" : "active",
        learningPathId: "p1",
        learningPathCode: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_G8_12",
      };
      h.context.reconcileP1ToNextCycle = vi.fn();
      h.context.returnToLearningPathAfterGuidedExercise = vi.fn();
      await h.run("finishGuidedExerciseCompletion(originalSession, node, () => true, false)");
      expect(h.context.reconcileP1ToNextCycle).not.toHaveBeenCalled();
      expect(h.context.returnToLearningPathAfterGuidedExercise).toHaveBeenCalledExactlyOnceWith(
        h.context.node,
        null,
        true,
      );
    },
  );

  it("ignores completion responses after the student has navigated elsewhere", async () => {
    const h = harness();
    let resolve!: (value: unknown) => void;
    h.context.exerciseSession.learningStepId = "step-35";
    h.context.exerciseApi = () =>
      new Promise((done) => {
        resolve = done;
      });
    h.context.parseResponse = async () => ({ id: "session", status: "COMPLETED" });
    const pending = h.run("handleExerciseComplete()");
    h.context.learningPathNavigationRevision++;
    resolve({});
    await pending;
    expect(h.context.exerciseSession.status).toBe("IN_PROGRESS");
  });

  it("opens the final Learning Path station as a terminal checkpoint", () => {
    expect(source).toContain('if (type === "NEXT_LEARNING")');
    expect(source).toContain("renderLearningPathTerminalStep(node)");
    expect(source).toContain("data-learning-terminal-complete");
    expect(source).toContain("/student/learning-path/steps/");
  });

  it("does not block a focused lesson on a supplementary path reload", () => {
    const start = source.indexOf("async function loadFocusedLearningPathStep(");
    const end = source.indexOf("async function completeLearningPathTerminalStep()", start);
    const focusedLoader = source.slice(start, end);
    expect(focusedLoader.match(/await insightApi\("learning-path"\)/g) ?? []).toHaveLength(1);
  });

  it("ignores reentrant submit and complete calls while a request is pending", async () => {
    const h = harness();
    h.context.exerciseBusy = true;
    await h.run("handleExerciseSubmitAttempt()");
    await h.run("handleExerciseComplete()");
    expect(h.get("exercise-attempt-feedback").innerHTML).toBe("");
    expect(h.context.exerciseAwaitingNext).toBe(false);
  });

  it("does not make confirmed answer feedback wait for the optional points request", async () => {
    const h = harness();
    h.run(`
      exerciseRequest = null;
      crypto = { randomUUID: () => "request-id" };
      $("exercise-current-question").dataset = { questionVersionId: "q1", questionType: "OPEN_ENDED" };
      $("exercise-current-question").querySelector = () => ({ value: "My answer" });
      exerciseApi = async () => ({});
      parseResponse = async () => ({ id: "attempt", isCorrect: null, rawScore: null });
      refreshExerciseGamification = () => new Promise(() => {});
    `);
    await h.run("handleExerciseSubmitAttempt()");
    expect(h.get("exercise-attempt-feedback").className).toContain("pending");
    expect(h.get("exercise-submit-attempt").disabled).toBe(false);
    expect(h.context.exerciseBusy).toBe(false);
  });

  it("reconciles a completed session when the completion response is lost", async () => {
    const h = harness();
    let reads = 0;
    h.context.fetchStudentExercise = async () => {
      reads += 1;
      return { id: "session", status: "COMPLETED", scoreSummary: { totalQuestions: 1 } };
    };
    h.context.exerciseApi = async () => {
      throw new Error("response lost after server completion");
    };
    h.context.renderExerciseSession = () => {};
    h.context.recordPilotTelemetry = () => {};
    h.context.refreshExerciseGamification = async () => null;
    h.run("isDailyTrainingExercise = () => false");

    await h.run("handleExerciseComplete()");

    expect(reads).toBe(1);
    expect(h.context.exerciseSession.status).toBe("COMPLETED");
    expect(h.get("exercise-attempt-error").textContent).not.toContain("tamamlanamadı");
  });

  it("sends the normal completion directly without a redundant preflight read", async () => {
    const h = harness();
    let reads = 0;
    let completionCalls = 0;
    h.context.fetchStudentExercise = async () => {
      reads += 1;
      return { id: "session", status: "IN_PROGRESS" };
    };
    h.context.exerciseApi = async () => {
      completionCalls += 1;
      return {};
    };
    h.context.parseResponse = async () => ({
      id: "session",
      status: "COMPLETED",
      scoreSummary: { totalQuestions: 1 },
    });
    h.context.refreshExerciseGamification = async () => null;
    h.context.recordPilotTelemetry = () => {};
    h.context.renderExerciseSession = () => {};

    await h.run("handleExerciseComplete()");

    expect(completionCalls).toBe(1);
    expect(reads).toBe(0);
    expect(h.context.exerciseSession.status).toBe("COMPLETED");
  });

  it("does not turn a post-completion UI error into an exercise failure", async () => {
    const h = harness();
    h.context.fetchStudentExercise = async () => ({ id: "session", status: "IN_PROGRESS" });
    h.context.exerciseApi = async () => ({});
    h.context.parseResponse = async () => ({
      id: "session",
      status: "COMPLETED",
      scoreSummary: { totalQuestions: 1 },
    });
    h.context.refreshExerciseGamification = async () => null;
    h.context.showCelebration = () => {
      throw new Error("optional presentation failed");
    };
    h.context.recordPilotTelemetry = () => {};

    await h.run("handleExerciseComplete()");

    expect(h.context.exerciseSession.status).toBe("COMPLETED");
    expect(h.get("exercise-attempt-error").textContent).not.toContain("tamamlanamadı");
  });

  it("explains the safe server completion guard instead of hiding it behind a generic retry", () => {
    const h = harness();
    const message = h.run("formatExerciseCompletionError({ status: 400 })");
    expect(message).toContain("tüm soruları yanıtla");
    expect(message).not.toContain("HTTP");
  });
});
