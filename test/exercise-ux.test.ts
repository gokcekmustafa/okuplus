import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
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
      classList: { add() {}, remove() {} },
      querySelectorAll: () => [],
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
    exerciseGamification: null,
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
  it("does not label a null score as wrong or award invented XP", () => {
    const h = harness();
    h.run('showExerciseFeedback({ id: "a", isCorrect: null, rawScore: null })');
    expect(h.get("exercise-attempt-feedback").className).toContain("pending");
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("Değerlendirme bekleniyor");
    expect(h.get("exercise-attempt-feedback").innerHTML).not.toContain("XP");
    expect(h.context.exerciseAwaitingNext).toBe(true);
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
    expect(h.get("exercise-attempt-feedback").innerHTML).toContain("+7 XP");
    expect(h.get("exercise-attempt-feedback").innerHTML).not.toContain("+10 XP");
    expect(h.get("exercise-attempt-feedback").innerHTML).not.toContain("100 XP");
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
