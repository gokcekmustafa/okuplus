import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../scripts/provision-staging-release-0-5-e2e.ts", import.meta.url),
  "utf8",
);
const runnerSource = readFileSync(
  new URL("../scripts/browser-student-full-e2e.ts", import.meta.url),
  "utf8",
);

describe("staging Release 0.5 E2E fixture", () => {
  it("uses the official account/onboarding API and is staging-only", () => {
    expect(source).toContain('"/auth/signup"');
    expect(source).toContain('"/auth/login"');
    expect(source).toContain('"/student/onboarding/complete"');
    expect(source).toContain('"/account/entitlements"');
    expect(source).toContain(".invalid");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("DATABASE_URL");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("DELETE");
    expect(source).not.toContain("UPDATE");
  });

  it("does not log credentials or tokens", () => {
    expect(source).not.toContain("console.log(email");
    expect(source).not.toContain("console.log(password");
    expect(source).not.toContain("console.log(session");
    expect(source).not.toContain("console.log(accessToken");
  });

  it("keeps a first-wrong question retryable before completion", () => {
    expect(runnerSource).toContain("retryQuestionIds");
    expect(runnerSource).toContain("retryAnswerForQuestion");
    expect(runnerSource).toContain("!hadRetryPending");
    expect(runnerSource).toContain("questionAttempts.length === 1");
    expect(runnerSource).toContain("-retry");
    expect(runnerSource).toContain("!candidate.attemptedQuestionIds.has(entry.questionVersionId)");
    expect(runnerSource).toContain("!entry.attemptedQuestionIds.has(question.questionVersionId)");
    expect(runnerSource).toContain("ilk yanlış cevap UI doğrulaması için yeni fixture gerekir");
  });

  it("waits for the requested question and retries a promoted daily item", () => {
    expect(runnerSource).toContain("async function loadBrowserExerciseQuestion");
    expect(runnerSource).toContain("expectedId");
    expect(runnerSource).toContain("attempt < 2");
    expect(runnerSource).toContain("exercise-load-status");
    expect(runnerSource).toContain("page.waitForResponse");
    expect(runnerSource).toContain("/student/sessions/${encodeURIComponent(sessionId)}/questions");
    expect(runnerSource).toContain('"Tekrar Cevapla"');
    expect(runnerSource).toContain("async function isVisibleBrowserExerciseQuestion");
    expect(runnerSource).toContain("isVisibleBrowserExerciseQuestion(page, questionVersionId)");
    expect(runnerSource).toContain("loadBrowserExerciseQuestion(\n      feedbackPage,");
  });

  it("does not charge first-render time for a second SPA shell", () => {
    expect(runnerSource).toContain("async function probeExerciseRender");
    expect(runnerSource).toContain("page.context().newPage()");
    expect(runnerSource).toContain("reuseAuthenticatedPage: entry.item.position === 1");
    expect(runnerSource).toContain('checkpoint.rendered = "PASS"');
  });

  it("passes timing state explicitly into daily completion work", () => {
    expect(runnerSource).toContain("runId: string,");
    expect(runnerSource).toContain("budget: AttemptBudget,");
    expect(runnerSource).toContain("timings: E2eTimings,");
    expect(runnerSource).toContain("checkpoints: ItemCheckpoint[],");
    expect(runnerSource).not.toContain("firstQuestion.questionVersionId, report.timings");
    expect(runnerSource).toContain("report.timings");
    expect(runnerSource).toContain("itemCheckpoints,");
  });

  it("creates the authenticated page from an explicit browser context", () => {
    expect(runnerSource).toContain("browser.newContext");
    expect(runnerSource).toContain("browserContext.newPage");
    expect(runnerSource).not.toContain("browser.newPage");
  });

  it("waits for the settled dashboard before the inline feedback probe", () => {
    expect(runnerSource).toContain("await waitForStudentAppReady(page)");
    expect(runnerSource).toContain("const feedbackPage = await page.context().newPage()");
    expect(runnerSource).toContain("await waitForStudentAppReady(feedbackPage)");
    expect(runnerSource).toContain('await page.waitForLoadState("domcontentloaded"');
    expect(runnerSource).toContain("probeInlineFeedback(page, uiCandidate, budget");
    expect(runnerSource).toContain('"inline feedback session state"');
    expect(runnerSource).toContain("candidate.attemptedQuestionIds = attemptedIds(sessionData)");
    expect(runnerSource).toContain("candidate.retryQuestionIds = retryQuestionIds(sessionData)");
  });

  it("verifies the selected answer before submitting the browser probe", () => {
    expect(runnerSource).toContain("input[data-exercise-opt]:checked");
    expect(runnerSource).toContain('getAttribute("aria-checked") !== "true"');
    expect(runnerSource).toContain("question.questionVersionId");
    expect(runnerSource).toContain('loadStatus !== "Alıştırma yükleniyor…"');
    expect(runnerSource).toContain("function recordAttemptState");
    expect(runnerSource).toContain("const hadRetryPending = entry.retryQuestionIds.has");
    expect(runnerSource).toContain("retryQuestionIds.delete(questionVersionId)");
  });

  it("waits for the authenticated student shell before isolated browser probes", () => {
    expect(runnerSource).toContain("async function waitForStudentAppReady");
    expect(runnerSource).toContain('app.classList.contains("student-shell")');
    expect(runnerSource).toContain('"/student/onboarding"');
    expect(runnerSource).toContain('button.nav-item[data-page="dashboard"]');
    expect(runnerSource).toContain('page.waitForLoadState("domcontentloaded"');
    expect(runnerSource).toContain("async function readBrowserExerciseState");
    expect(runnerSource).toContain("Browser exercise question yüklenemedi (expected=");
    expect(runnerSource).toContain("await waitForStudentAppReady(renderPage)");
  });

  it("prints the final report before Playwright cleanup can block", () => {
    const reportIndex = runnerSource.indexOf("console.log(JSON.stringify(report, null, 2))");
    const cleanupIndex = runnerSource.indexOf(
      "if (page) await page.close().catch(() => undefined)",
    );
    expect(reportIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeGreaterThan(reportIndex);
  });

  it("covers Release 0.6 teaching, baseline, insight, security, and telemetry paths", () => {
    expect(runnerSource).toContain("async function runRelease06Coverage");
    expect(runnerSource).toContain('"/student/lessons"');
    expect(runnerSource).toContain('"/student/baseline"');
    expect(runnerSource).toContain('"/student/progress"');
    expect(runnerSource).toContain('"/student/history?page=1&pageSize=5"');
    expect(runnerSource).toContain("Unauthenticated protected path");
    expect(runnerSource).toContain("baselineSnapshot");
    expect(runnerSource).toContain("exposureStartedAt");
    expect(runnerSource).toContain("__wrongAnswerRetryObserved");
    expect(runnerSource).toContain("concurrentCompletions");
  });
});
