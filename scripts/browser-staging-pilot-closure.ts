import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { validateStagingBaseUrl } from "./browser-student-full-e2e-policy.js";

const BASE_URL = (process.env.BASE_URL?.trim() ?? "").replace(/\/$/u, "");
const EMAIL = process.env.STAGING_STUDENT_EMAIL?.trim().toLowerCase() ?? "";
const PASSWORD = process.env.STAGING_STUDENT_PASSWORD ?? "";
const CHROME_PATH =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 430, height: 932 },
] as const;

type TelemetryRecord = { eventType: string; clientEventId: string; status: number };

function requireConfig(): void {
  validateStagingBaseUrl(BASE_URL);
  if (!/^[^@\s]+@[^@\s]+\.invalid$/u.test(EMAIL)) {
    throw new Error("STAGING_STUDENT_EMAIL must be a .invalid synthetic email");
  }
  if (!PASSWORD) throw new Error("STAGING_STUDENT_PASSWORD is not configured");
}

export async function waitForStudentApp(page: Page): Promise<void> {
  await page.waitForSelector("#view-app:not(.hidden)", { timeout: 30000 });
  await page.waitForTimeout(500);
}

export async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const emailInput = page.locator("#login-email");
  const passwordInput = page.locator("#login-password");
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/auth/login") && candidate.request().method() === "POST",
    { timeout: 30000 },
  );
  const loginButton = page.getByRole("button", { name: "Giriş yap", exact: true });
  await loginButton.waitFor({ state: "visible", timeout: 30_000 });
  await loginButton.click();
  assert.equal((await response).status(), 200, "staging login failed");
  await waitForStudentApp(page);
}

async function layoutMetrics(page: Page) {
  return await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
    };
    const controls = [...document.querySelectorAll("button, input, select, textarea")]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.id, width: rect.width, height: rect.height };
      });
    const bottomNav = [...document.querySelectorAll(".bottom-nav-item")]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
    return {
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      controls,
      bottomNav,
    };
  });
}

export async function assertMobileSurface(
  page: Page,
  viewport: (typeof VIEWPORTS)[number],
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForStudentApp(page);
  const metrics = await layoutMetrics(page);
  assert.ok(
    metrics.documentWidth <= metrics.viewport + 1 && metrics.bodyWidth <= metrics.viewport + 1,
    `horizontal overflow at ${viewport.width}px`,
  );
  assert.ok(
    metrics.bottomNav.every((control) => control.width >= 44 && control.height >= 44),
    `bottom navigation touch target failure at ${viewport.width}px`,
  );
  const criticalIds = new Set([
    "start-daily-training",
    "refresh-today-training",
    "dashboard-progress-retry",
    "exercise-retry-load",
    "pilot-support-open",
    "pilot-bug-open",
  ]);
  const criticalControls = metrics.controls.filter((control) => criticalIds.has(control.id));
  assert.ok(
    criticalControls.every((control) => control.width >= 44 && control.height >= 44),
    `critical touch target failure at ${viewport.width}px`,
  );
  const visibleTechnicalText = await page.locator("body").innerText();
  assert.doesNotMatch(visibleTechnicalText, /stack trace|database_url|at object\.|node_modules/i);
}

export async function verifySupportAndBugReport(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Profil", exact: true }).click();
  await page.waitForSelector("#page-settings:not(.hidden)", { timeout: 10000 });

  const feedbackResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/pilot/feedback") && response.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.locator("#pilot-support-open").click();
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "visible", timeout: 5000 });
  const feedbackDialogText = await page.locator("#pilot-report-dialog").innerText();
  assert.doesNotMatch(feedbackDialogText, /stack trace|database_url|at object\.|node_modules/i);
  assert.equal(
    await page
      .locator("#pilot-report-lead")
      .innerText()
      .then((text) => /şifre|token/i.test(text)),
    true,
  );
  await page.locator("#pilot-report-message").fill("Pilot kapanış geri bildirimi.");
  await page.locator("#pilot-report-submit").click();
  assert.equal((await feedbackResponse).status(), 200, "feedback submit failed");
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "hidden", timeout: 10000 });
  assert.match(await page.locator("#pilot-support-status").innerText(), /iletildi/i);

  const bugResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/pilot/bug-reports") &&
      response.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.locator("#pilot-bug-open").click();
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "visible", timeout: 5000 });
  const bugDialogText = await page.locator("#pilot-report-dialog").innerText();
  assert.doesNotMatch(bugDialogText, /stack trace|database_url|at object\.|node_modules/i);
  await page.locator("#pilot-report-message").fill("Pilot kapanış bug raporu.");
  await page.locator("#pilot-report-submit").click();
  assert.equal((await bugResponse).status(), 200, "bug report submit failed");
  await page.locator("#pilot-report-dialog[open]").waitFor({ state: "hidden", timeout: 10000 });
  assert.match(await page.locator("#pilot-support-status").innerText(), /iletildi/i);
}

async function verifyTelemetryRuntime(page: Page): Promise<TelemetryRecord[]> {
  const records: TelemetryRecord[] = [];
  const responseHandler = async (response: import("playwright-core").Response) => {
    if (!response.url().endsWith("/student/pilot/events")) return;
    const requestBody = response.request().postData();
    if (!requestBody) return;
    try {
      const payload = JSON.parse(requestBody) as { eventType?: string; clientEventId?: string };
      if (payload.eventType && payload.clientEventId)
        records.push({
          eventType: payload.eventType,
          clientEventId: payload.clientEventId,
          status: response.status(),
        });
    } catch {
      // The request body is intentionally not logged.
    }
  };
  page.on("response", responseHandler);

  await page.getByRole("button", { name: "Ana Sayfa", exact: true }).click();
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  await page.getByRole("button", { name: "İlerleme", exact: true }).click();
  await page.waitForSelector("#page-progress:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(750);

  const canonicalEvents = [
    ["ONBOARDING_STARTED", "onboarding-started"],
    ["ONBOARDING_COMPLETED", "onboarding-completed"],
    ["ASSESSMENT_STARTED", "placement-started"],
    ["ASSESSMENT_COMPLETED", "placement-completed"],
    ["EXERCISE_STARTED", "first-training-started"],
    ["EXERCISE_COMPLETED", "training-completed"],
    ["LEARNING_PATH_OPENED", "progress-viewed"],
    ["TODAY_OPENED", "return-session"],
  ] as const;
  const result = await page.evaluate(async (events) => {
    const accessToken = localStorage.getItem("oku.accessToken");
    const tenantId = localStorage.getItem("oku.tenantId");
    if (!accessToken || !tenantId) throw new Error("authenticated browser session missing");
    const responses: Array<{ eventType: string; clientEventId: string; status: number }> = [];
    for (const [eventType, semanticKey] of events) {
      const clientEventId = `pilot-closure-${semanticKey}-${crypto.randomUUID()}`;
      const response = await fetch("/student/pilot/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ eventType, clientEventId }),
      });
      responses.push({ eventType, clientEventId, status: response.status });
    }
    return responses;
  }, canonicalEvents);
  for (const item of result)
    assert.equal(item.status, 200, `telemetry failed for ${item.eventType}`);
  page.off("response", responseHandler);
  return result;
}

async function main(): Promise<void> {
  requireConfig();
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const unexpectedHttp: string[] = [];
  try {
    const page = await browser.newPage({ viewport: VIEWPORTS[0] });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.name));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400) unexpectedHttp.push(`${response.status()} ${response.url()}`);
    });

    await login(page);
    for (const viewport of VIEWPORTS) await assertMobileSurface(page, viewport);
    const telemetry = await verifyTelemetryRuntime(page);
    await verifySupportAndBugReport(page);

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(unexpectedHttp, []);
    console.log(
      JSON.stringify({
        status: "PASS",
        auth: "PASS",
        mobile: VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
        support: "PASS",
        bugReport: "PASS",
        telemetry: telemetry.map(({ eventType, status }) => ({ eventType, status })),
        consoleErrors: 0,
        pageErrors: 0,
        networkErrors: 0,
        unexpectedHttpErrors: 0,
        productionTouched: "NO",
      }),
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "pilot closure smoke failed";
    console.error(
      JSON.stringify({ status: "FAIL", message: message.slice(0, 240), productionTouched: "NO" }),
    );
    process.exitCode = 1;
  });
}
