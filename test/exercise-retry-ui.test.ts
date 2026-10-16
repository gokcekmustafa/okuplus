import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const feedbackTextStart = source.indexOf("function exerciseFeedbackText(feedback)");
const feedbackStart = source.indexOf("function showExerciseFeedback(data)");
const feedbackEnd = source.indexOf("async function handleExerciseSubmitAttempt()", feedbackStart);
const feedbackCode = source.slice(feedbackTextStart, feedbackEnd);

function feedbackHarness() {
  const feedback = { className: "", innerHTML: "", style: { display: "none" } };
  let buttonLabel = "";
  const context = createContext({
    $: (id: string) => (id === "exercise-attempt-feedback" ? feedback : null),
    exerciseQuestions: [
      {
        questionVersionId: "question-version-1",
        explanation: "Metindeki kanıtı yeniden incele.",
        options: [{ id: "correct", text: "Kanıta dayalı seçenek" }],
      },
      { questionVersionId: "question-version-2", explanation: "Açıklama." },
    ],
    exerciseGamification: null,
    currentExerciseQuestionIndex: 0,
    exerciseAwaitingNext: false,
    escapeHtml: (value: string) => value,
    syncExerciseDisclosures: () => undefined,
    uiMotion: { enter: () => undefined },
    lockExerciseInputs: () => undefined,
    setExerciseSubmitButtonState: (_disabled: boolean, label: string) => {
      buttonLabel = label;
    },
  });
  runInContext(feedbackCode, context);
  return {
    feedback,
    get buttonLabel() {
      return buttonLabel;
    },
    show: (data: Record<string, unknown>) =>
      runInContext(`showExerciseFeedback(${JSON.stringify(data)})`, context),
  };
}

describe("learning-path answer retry feedback", () => {
  it("offers exactly one retry after the first wrong answer", () => {
    const h = feedbackHarness();
    h.show({
      id: "attempt-1",
      questionVersionId: "question-version-1",
      isCorrect: false,
      responseOrder: 1,
    });

    expect(h.buttonLabel).toBe("Tekrar Cevapla");
    expect(h.feedback.innerHTML).toContain("Tekrar düşün.");
  });

  it("does not offer another retry after the second wrong answer", () => {
    const h = feedbackHarness();
    h.show({
      id: "attempt-2",
      questionVersionId: "question-version-1",
      isCorrect: false,
      responseOrder: 2,
      correctAnswer: ["correct"],
    });

    expect(h.buttonLabel).toBe("Devam Et");
    expect(h.buttonLabel).not.toBe("Tekrar Cevapla");
    expect(h.feedback.innerHTML).toContain("Bu defa olmadı.");
  });

  it("keeps the normal success message when the second answer is correct", () => {
    const h = feedbackHarness();
    h.show({
      id: "attempt-2",
      questionVersionId: "question-version-1",
      isCorrect: true,
      responseOrder: 2,
    });

    expect(h.buttonLabel).toBe("Devam Et");
    expect(h.feedback.innerHTML).toContain("Güzel yakaladın.");
  });
});
