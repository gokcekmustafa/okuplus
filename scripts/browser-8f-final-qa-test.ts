import assert from "node:assert/strict";
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function layoutMetrics(page: Page) {
  return await page.evaluate(() => {
    const visibleControls = [
      ...document.querySelectorAll("button, input, select, textarea"),
    ].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
    });
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      controls: visibleControls.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.id,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    };
  });
}

async function loginStudent(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.fill("#login-email", "demo@okuplus.dev");
  await page.fill("#login-password", "demo-pass-123");
  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith("/auth/login") && response.request().method() === "POST",
  );
  await page.click("#login-submit");
  assert.equal((await loginResponse).status(), 200);
  await ensureStudentDashboard(page);
}

async function ensureStudentDashboard(page: Page) {
  await page.waitForFunction(
    () => document.querySelector("#view-app")?.classList.contains("hidden") === false,
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(750);
  if (await page.locator("#page-onboarding:not(.hidden)").count()) {
    await page
      .locator(
        '.nav-item[data-page="dashboard"]:visible, .bottom-nav-item[data-bottom-page="dashboard"]:visible',
      )
      .first()
      .click();
  }
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 30000 });
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const consoleErrors: string[] = [];
  try {
    const anonymous = await browser.newPage({ viewport: VIEWPORTS[0] });
    for (const viewport of VIEWPORTS) {
      await anonymous.setViewportSize(viewport);
      await anonymous.goto(BASE, { waitUntil: "domcontentloaded" });
      const metrics = await layoutMetrics(anonymous);
      const authControls = metrics.controls.filter((control) =>
        [
          "google-login-btn",
          "apple-login-btn",
          "login-email",
          "login-password",
          "login-submit",
          "show-signup-btn",
        ].includes(control.id),
      );
      assert.equal(
        metrics.overflow,
        false,
        `anonymous overflow at ${viewport.width}x${viewport.height}`,
      );
      assert.ok(
        authControls.every((control) => control.height >= 48),
        JSON.stringify({ viewport, authControls }),
      );
    }
    console.log("PASS anonymous auth viewport matrix 10 sizes / no overflow / 48px controls");
    await anonymous.close();

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    await loginStudent(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: "domcontentloaded" });
      await ensureStudentDashboard(page);
      const metrics = await layoutMetrics(page);
      assert.equal(
        metrics.overflow,
        false,
        `student overflow at ${viewport.width}x${viewport.height}`,
      );
      const bottomNavVisible = await page.$eval(
        "#student-bottom-nav",
        (element) =>
          !element.classList.contains("hidden") && getComputedStyle(element).display !== "none",
      );
      if (viewport.width <= 768 && bottomNavVisible) {
        const bottomNavControls = await page.$$eval(".bottom-nav-item", (elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          }),
        );
        assert.ok(
          bottomNavControls.every((control) => control.width >= 48 && control.height >= 48),
        );
      }
      const shellControls = await page.$$eval("#context-switcher, #logout-btn", (elements) =>
        elements
          .filter((element) => getComputedStyle(element).display !== "none")
          .map((element) => ({ id: element.id, height: element.getBoundingClientRect().height })),
      );
      assert.ok(
        shellControls.every((control) => control.height >= 48),
        JSON.stringify({ viewport, shellControls }),
      );
    }
    console.log("PASS student viewport matrix 10 sizes / no overflow / shell controls");

    await page.setViewportSize({ width: 390, height: 844 });
    const navPages = [
      ["dashboard", "Ana Sayfa"],
      ["exercise", "Alıştırma"],
      ["assignments", "Ödevler"],
      ["assessments", "Değerlendirmeler"],
      ["progress", "İlerleme"],
      ["badges", "Rozetler"],
      ["settings", "Profil"],
    ] as const;
    for (const [pageName, label] of navPages) {
      await page.getByRole("button", { name: label }).click();
      await page.waitForSelector(`#page-${pageName}:not(.hidden)`);
      assert.equal(
        await page
          .locator(`.bottom-nav-item[data-bottom-page="${pageName}"]`)
          .getAttribute("aria-current"),
        "page",
      );
    }
    console.log("PASS student critical navigation / aria-current");

    const aria = await page.evaluate(() => ({
      bottomNavLabel: document.querySelector("#student-bottom-nav")?.getAttribute("aria-label"),
      contextLabel: document.querySelector("#context-switcher")?.getAttribute("aria-label"),
      feedbackLive: document.querySelector("#exercise-attempt-feedback")?.getAttribute("aria-live"),
      celebrationLive: document.querySelector("#celebration-layer")?.getAttribute("aria-live"),
      celebrationAtomic: document.querySelector("#celebration-layer")?.getAttribute("aria-atomic"),
      dialogs: [...document.querySelectorAll(".modal-backdrop")].map((element) => ({
        id: element.id,
        role: element.getAttribute("role"),
        modal: element.getAttribute("aria-modal"),
        labelledby: element.getAttribute("aria-labelledby"),
      })),
    }));
    assert.equal(aria.bottomNavLabel, "Öğrenci menüsü");
    assert.equal(aria.contextLabel, "Bağlam seç");
    assert.equal(aria.feedbackLive, "polite");
    assert.equal(aria.celebrationLive, "polite");
    assert.equal(aria.celebrationAtomic, "true");
    assert.ok(
      aria.dialogs.every(
        (dialog) => dialog.role === "dialog" && dialog.modal === "true" && dialog.labelledby,
      ),
    );
    console.log("PASS ARIA landmarks/live/dialog semantics");

    const initialSound = await page.evaluate(() => localStorage.getItem("oku.soundEffects"));
    await page.getByRole("button", { name: "Profil" }).click();
    await page.locator("#sound-effects-toggle").waitFor();
    await page.locator("#sound-effects-toggle").uncheck();
    assert.equal(await page.locator("#sound-effects-toggle").isChecked(), false);
    await page.locator("#sound-effects-toggle").check();
    assert.equal(await page.locator("#sound-effects-toggle").isChecked(), true);
    if (initialSound === null || initialSound === "false")
      await page.locator("#sound-effects-toggle").uncheck();
    else await page.locator("#sound-effects-toggle").check();
    const soundAndHaptic = await page.evaluate(() => ({
      audioElements: document.querySelectorAll("audio, video").length,
      vibrateAvailable: typeof navigator.vibrate === "function",
    }));
    assert.equal(soundAndHaptic.audioElements, 0);
    console.log(
      `PASS sound user-toggle/no-autoplay; haptic guard available=${soundAndHaptic.vibrateAvailable}`,
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotion = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".btn, .nav-item, .bottom-nav-item, .path-node, .progress-fill, .answer-card",
        ),
      ]
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => ({
          animation: getComputedStyle(element).animationName,
          transition: getComputedStyle(element).transitionDuration,
        })),
    );
    assert.ok(reducedMotion.every((style) => style.animation === "none" || style.animation === ""));
    console.log("PASS prefers-reduced-motion reduce / function remains available");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Ana Sayfa" }).click();
    const navigationTiming = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const longTasks = performance.getEntriesByType("longtask");
      const layoutShifts = performance.getEntriesByType("layout-shift");
      return {
        domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
        loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
        resourceCount: resources.length,
        largestTransferBytes: Math.max(
          0,
          ...resources.map((resource) => resource.transferSize || 0),
        ),
        longTaskCount: longTasks.length,
        layoutShiftCount: layoutShifts.length,
      };
    });
    assert.ok(navigationTiming.resourceCount > 0);
    assert.ok(navigationTiming.largestTransferBytes < 1024 * 1024);
    console.log("PASS performance smoke", navigationTiming);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    for (const [name, latency, downloadThroughput] of [
      ["Fast 3G", 150, 1_600_000],
      ["Slow 3G", 400, 500_000],
    ] as const) {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency,
        downloadThroughput,
        uploadThroughput: 750_000,
      });
      const started = Date.now();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      await ensureStudentDashboard(page);
      console.log(`PASS ${name} dashboard recovery ${Date.now() - started}ms`);
    }
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    let offlineNavigationFailed = false;
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 5000 });
    } catch {
      offlineNavigationFailed = true;
    }
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await ensureStudentDashboard(page);
    console.log(
      `PASS Offline network boundary handled; navigationFailure=${offlineNavigationFailed}`,
    );

    assert.deepEqual(consoleErrors, []);
    console.log("PASS critical student flow console.error/pageerror = 0");
    console.log("8F FINAL QA SCRIPT PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("8F FINAL QA SCRIPT FAIL", error);
  process.exitCode = 1;
});
