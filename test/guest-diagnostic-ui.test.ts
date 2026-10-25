import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8").replace(/\r\n/gu, "\n");
const index = readFileSync("public/index.html", "utf8");
const styles = readFileSync("public/styles.css", "utf8");
const guestClient = readFileSync("public/guest-diagnostic-client.js", "utf8");

describe("guest-first diagnostic frontend", () => {
  it("shows an explicit guest landing while preserving the authenticated session gate", () => {
    expect(app).toContain('setGuestPhase("intro");');
    expect(app).toContain(
      '$("guest-start")?.addEventListener("click", () => void startGuestDiagnostic());',
    );
    expect(app).toContain('$("guest-header-login-btn")?.addEventListener("click", showLogin);');
    expect(app).toContain("const me = await fetchMe(accessToken, tenantId);");
    expect(app).toContain("showDashboard(me);");
    expect(app).toContain("return guestDiagnosticClient.request(path, options);");
    expect(index).toContain('id="view-guest"');
    expect(index).toContain('id="guest-intro"');
    expect(index).toContain('id="guest-start"');
    expect(index).toContain('id="guest-header-login-btn"');
    expect(index).toContain('id="guest-question-view"');
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
    expect(app).not.toContain("isCorrect:");
    expect(app).not.toContain("correctAnswer:");
  });

  it("keeps the guest token out of browser storage and preserves the auth gate", () => {
    expect(app).toContain("__Host-oku_guest_csrf");
    expect(app).toContain("sessionStorage.setItem(GUEST_SESSION_STORAGE_KEY");
    expect(app).not.toContain("oku.guestToken");
    expect(guestClient).toContain('credentials: nativeMobileRuntime ? "omit" : "include"');
    expect(guestClient).toContain("secureStorage.setItem");
    expect(guestClient).not.toContain("localStorage");
    expect(guestClient).not.toContain("sessionStorage");
    expect(guestClient).toContain("headers[NATIVE_TOKEN_HEADER] = credential.token");
    expect(index).toContain('id="guest-signup-btn"');
    expect(index).toContain('id="guest-login-btn"');
    expect(index).toContain('id="login-form"');
    expect(index).toContain('id="signup-form"');
    expect(index).toContain('id="guest-diagnostic-card"');
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

  it("communicates fast reading and comprehension goals before the diagnostic starts", () => {
    expect(index).toContain("Daha hızlı oku");
    expect(index).toContain("daha iyi anla");
    expect(index).toContain("HIZLI OKUMA + OKUDUĞUNU ANLAMA");
    expect(index).toContain('id="guest-skill-grid"');
    expect(index).toContain('class="guest-nav"');
    expect(index).toContain('class="guest-phone-frame"');
    expect(index).toContain("Ana fikri yakala");
    expect(index).toContain("Ayrıntıları seç");
    expect(index).toContain("Çıkarım yap");
    expect(index).toContain("Becerini birlikte keşfedelim");
    expect(app).toContain('$("guest-skill-grid")?.classList.toggle("hidden", phase !== "intro");');
    expect(app).toContain("hızlı okuma ve okuduğunu anlama becerilerine uygun");
  });

  it("switches to a focused single-screen diagnostic without changing the answer flow", () => {
    expect(index).toContain('class="guest-landing-stage"');
    expect(index).toContain('class="guest-hero-art"');
    expect(app).toContain(
      '$("view-guest")?.classList.toggle("guest-diagnostic-mode", phase !== "intro");',
    );
    expect(styles).toContain(".guest-diagnostic-mode #guest-question-view:not(.hidden)");
    expect(styles).toContain("height: 100dvh");
    expect(styles).toContain("overflow: auto");
  });

  it("keeps student practice focused and compresses mobile answer choices without visible scrollbars", () => {
    expect(app).toContain('$("page-lessons")?.classList.toggle("is-focused-lesson", focused);');
    expect(app).not.toContain('<p class="insight-eyebrow">ŞİMDİKİ DURAĞIN</p>');
    expect(app).not.toContain('class="lesson-flow"');
    expect(styles).toContain(".student-shell #page-exercise > .page-head");
    expect(styles).toContain("grid-template-columns: 1fr;");
    expect(styles).toContain("max-height: none;");
    expect(styles).toContain("overflow: visible;");
    expect(styles).toContain("#exercise-questions-card::-webkit-scrollbar");
    expect(styles).toContain("scrollbar-width: none");
  });
});
