import { chromium, type Browser, type Page } from "playwright-core";

const BASE_URLS = ["https://okuplus.vercel.app", "https://www.okuplus.online"] as const;
const REQUEST_TIMEOUT_MS = 30_000;
const READ_PATHS = [
  "/auth/me",
  "/student/today",
  "/student/progress",
  "/student/learning-path",
  "/student/history?page=1&pageSize=5",
  "/student/gamification",
  "/account/entitlements",
] as const;

type DomainReport = {
  baseUrl: string;
  login: "PASS" | "FAIL";
  authMe: "PASS" | "FAIL";
  dashboard: "PASS" | "FAIL";
  readPaths: "PASS" | "FAIL";
  navigation: "PASS" | "FAIL";
  logout: "PASS" | "FAIL";
  consoleErrors: number;
  pageErrors: number;
  failedRequests: number;
  httpErrors: number;
  blockedMutations: number;
  error: string | null;
};

type SmokeReport = {
  status: "PASS" | "FAIL";
  domains: DomainReport[];
  productionStateChanged: "NO";
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : "Browser smoke failed";
}

function requireCredentials(): { email: string; password: string } {
  const email = process.env.PRODUCTION_SMOKE_EMAIL?.trim();
  const password = process.env.PRODUCTION_SMOKE_PASSWORD;
  if (!email || !password) throw new Error("Production smoke credentials are not configured");
  return { email, password };
}

function isAllowedMutation(url: URL): boolean {
  return url.pathname === "/auth/login" || url.pathname === "/auth/logout";
}

async function apiStatus(page: Page, path: string): Promise<number> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, {
      credentials: "include",
      headers: { accept: "application/json", "x-auth-transport": "cookie" },
    });
    return response.status;
  }, path);
}

async function runDomain(
  browser: Browser,
  baseUrl: (typeof BASE_URLS)[number],
  credentials: { email: string; password: string },
): Promise<DomainReport> {
  const report: DomainReport = {
    baseUrl,
    login: "FAIL",
    authMe: "FAIL",
    dashboard: "FAIL",
    readPaths: "FAIL",
    navigation: "FAIL",
    logout: "FAIL",
    consoleErrors: 0,
    pageErrors: 0,
    failedRequests: 0,
    httpErrors: 0,
    blockedMutations: 0,
    error: null,
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    page.on("console", (message) => {
      if (message.type() === "error") report.consoleErrors += 1;
    });
    page.on("pageerror", () => {
      report.pageErrors += 1;
    });
    page.on("requestfailed", () => {
      report.failedRequests += 1;
    });
    page.on("request", (request) => {
      if (request.method() === "GET" || request.method() === "HEAD") return;
      let url: URL;
      try {
        url = new URL(request.url());
      } catch {
        report.blockedMutations += 1;
        return;
      }
      if (!isAllowedMutation(url)) report.blockedMutations += 1;
    });
    page.on("response", (response) => {
      if (response.status() >= 400) report.httpErrors += 1;
    });

    await page.goto(`${baseUrl}/`, {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });
    await page.waitForSelector("#login-form", { state: "visible", timeout: REQUEST_TIMEOUT_MS });
    const loginResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/auth/login" &&
        response.request().method() === "POST",
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await page.fill("#login-email", credentials.email);
    await page.fill("#login-password", credentials.password);
    await page.click("#login-submit");
    if ((await (await loginResponse).status()) !== 200) throw new Error("Production login failed");
    report.login = "PASS";
    await page.waitForSelector("#view-app:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    report.dashboard = "PASS";

    if ((await apiStatus(page, "/auth/me")) !== 200) throw new Error("/auth/me failed");
    report.authMe = "PASS";
    const statuses = await Promise.all(READ_PATHS.map((path) => apiStatus(page, path)));
    if (statuses.some((status) => status !== 200)) throw new Error("Production read path failed");
    report.readPaths = "PASS";

    const progressNav = page.locator('[data-page="progress"]');
    if ((await progressNav.count()) !== 1) throw new Error("Progress navigation missing");
    await progressNav.click();
    await page.waitForSelector("#page-progress:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    report.navigation = "PASS";

    const logoutResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/auth/logout" &&
        response.request().method() === "POST",
      { timeout: REQUEST_TIMEOUT_MS },
    );
    await page.click("#logout-btn");
    if ((await (await logoutResponse).status()) !== 200)
      throw new Error("Production logout failed");
    await page.waitForSelector("#view-login:not(.hidden)", {
      state: "visible",
      timeout: REQUEST_TIMEOUT_MS,
    });
    report.logout = "PASS";
    if (report.blockedMutations > 0)
      throw new Error("Unexpected production mutation request observed");
    if (report.consoleErrors || report.pageErrors || report.failedRequests || report.httpErrors) {
      throw new Error("Production browser diagnostics reported an error");
    }
  } catch (error) {
    report.error = errorMessage(error);
  } finally {
    await context.close().catch(() => undefined);
  }
  return report;
}

async function main(): Promise<void> {
  const credentials = requireCredentials();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
    headless: true,
    timeout: REQUEST_TIMEOUT_MS,
  });
  let domains: DomainReport[] = [];
  try {
    domains = await Promise.all(
      BASE_URLS.map((baseUrl) => runDomain(browser, baseUrl, credentials)),
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
  const report: SmokeReport = {
    status: domains.every(
      (domain) =>
        domain.login === "PASS" &&
        domain.authMe === "PASS" &&
        domain.dashboard === "PASS" &&
        domain.readPaths === "PASS" &&
        domain.navigation === "PASS" &&
        domain.logout === "PASS" &&
        domain.consoleErrors === 0 &&
        domain.pageErrors === 0 &&
        domain.failedRequests === 0 &&
        domain.httpErrors === 0 &&
        domain.blockedMutations === 0,
    )
      ? "PASS"
      : "FAIL",
    domains,
    productionStateChanged: "NO",
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "FAIL") process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.log(
    JSON.stringify(
      { status: "FAIL", error: errorMessage(error), productionStateChanged: "NO" },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
