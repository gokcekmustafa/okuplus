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
    expect(runnerSource).toContain("-retry");
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

  it("probes every daily item in an isolated authenticated page", () => {
    expect(runnerSource).toContain("async function probeExerciseRender");
    expect(runnerSource).toContain("page.context().newPage()");
    expect(runnerSource).toContain("await probeExerciseRender(page, sessionId");
    expect(runnerSource).toContain('checkpoint.rendered = "PASS"');
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
    expect(runnerSource).toContain('await page.waitForLoadState("networkidle"');
    expect(runnerSource).toContain("probeInlineFeedback(page, uiCandidate, budget)");
  });

  it("verifies the selected answer before submitting the browser probe", () => {
    expect(runnerSource).toContain("input[data-exercise-opt]:checked");
    expect(runnerSource).toContain('getAttribute("aria-checked") !== "true"');
    expect(runnerSource).toContain("question.questionVersionId");
  });

  it("waits for the authenticated student shell before isolated browser probes", () => {
    expect(runnerSource).toContain("async function waitForStudentAppReady");
    expect(runnerSource).toContain('app.classList.contains("student-shell")');
    expect(runnerSource).toContain('"/student/onboarding"');
    expect(runnerSource).toContain('button.nav-item[data-page="dashboard"]');
    expect(runnerSource).toContain('page.waitForLoadState("networkidle"');
    expect(runnerSource).toContain("async function readBrowserExerciseState");
    expect(runnerSource).toContain("Browser exercise question yüklenemedi (expected=");
    expect(runnerSource).toContain("await waitForStudentAppReady(renderPage)");
  });
});
