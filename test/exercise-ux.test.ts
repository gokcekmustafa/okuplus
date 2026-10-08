import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
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
  });
  runInContext(exerciseCode, context);
  return { context, get, run: (code: string) => runInContext(code, context) };
}

describe("exercise UX state from production frontend", () => {
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
    expect(styles).toContain(".learning-path-exercise-navigation [data-learning-path-next]");
  });

  it("keeps Next hidden when the immediate learning path neighbor is locked", () => {
    const h = harness();
    h.context.learningPathEntryMode = true;
    h.context.exerciseSession = { id: "session", status: "IN_PROGRESS", learningStepId: "step-2" };
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
    h.context.exerciseMode = null;
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

  it("opens the final Learning Path station as a terminal checkpoint", () => {
    expect(source).toContain('if (type === "NEXT_LEARNING")');
    expect(source).toContain("renderLearningPathTerminalStep(node)");
    expect(source).toContain("data-learning-terminal-complete");
    expect(source).toContain("/student/learning-path/steps/");
  });

  it("does not block a focused lesson on a supplementary path reload", () => {
    const start = source.indexOf("async function loadFocusedLearningPathStep()");
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
});
