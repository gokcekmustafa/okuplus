import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");

describe("guest-first diagnostic frontend", () => {
  it("starts the guest flow when no authenticated session is available", () => {
    expect(app).toContain("void startGuestDiagnostic();");
    expect(app).toContain('fetch(path, { ...options, credentials: "include", headers })');
    expect(index).toContain('id="view-guest"');
    expect(index).toContain('id="guest-question-view"');
    expect(index).toContain('id="guest-answer-feedback"');
  });

  it("renders backend question data and submits only the guest answer contract", () => {
    expect(app).toContain('"/guest/diagnostics"');
    expect(app).toContain("/questions");
    expect(app).toContain("/answers");
    expect(app).toContain("/complete");
    expect(app).toContain("/result");
    expect(app).toContain("/claim");
    expect(app).toContain("/student/guest-diagnostic");
    expect(app).toContain("question.prompt");
    expect(app).toContain("question.options");
    expect(app).toContain("question.position");
    expect(app).toContain("question.skill");
    expect(app).toContain("question.difficulty");
    expect(app).toContain("clientAnswerId");
    expect(app).toContain("answer: guestDiagnosticState.selectedAnswerIds");
    expect(app).toContain("renderGuestFeedback(response?.feedback)");
    expect(app).toContain("setGuestAnswerOptionsDisabled(true)");
    expect(app).toContain('"Sonraki soru"');
    expect(app).not.toContain("isCorrect:");
    expect(app).not.toContain("correctAnswer:");
  });

  it("keeps the guest token out of browser storage and preserves the auth gate", () => {
    expect(app).toContain("__Host-oku_guest_csrf");
    expect(app).toContain("sessionStorage.setItem(GUEST_SESSION_STORAGE_KEY");
    expect(app).not.toContain("oku.guestToken");
    expect(index).toContain("Sonucun burada hazır.");
    expect(index).toContain('id="guest-signup-btn"');
    expect(index).toContain('id="guest-login-btn"');
    expect(index).toContain('id="login-form"');
    expect(index).toContain('id="signup-form"');
    expect(index).toContain('id="guest-diagnostic-card"');
    expect(index).toContain('id="guest-diagnostic-home-path"');
    expect(app).toContain('$("guest-diagnostic-home-path")?.addEventListener("click"');
  });

  it("provides responsive loading, error, question and result presentation", () => {
    expect(index).toContain('id="guest-loading"');
    expect(index).toContain('id="guest-error"');
    expect(index).toContain('id="guest-result-view"');
    expect(index).toContain('id="guest-result-count"');
    expect(index).toContain('role="progressbar"');
    expect(index).toContain("Bu kısa tanı yalnızca başlangıç için bir öneridir.");
    expect(styles).toContain(".guest-shell");
    expect(styles).toContain(".guest-answer-option");
    expect(styles).toContain("@media (max-width: 560px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
