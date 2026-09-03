/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function loginViaUI(page: any, email: string, pass: string) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.fill("#login-email", email);
  await page.fill("#login-password", pass);
  const login = page.waitForResponse((r: any) => r.url().endsWith("/auth/login"));
  const onboarding =
    email === "demo@okuplus.dev"
      ? page.waitForResponse((r: any) => r.url().endsWith("/student/onboarding"))
      : null;
  await page.click("#login-submit");
  if ((await login).status() !== 200) throw new Error("UI login failed");
  if (onboarding) {
    const response = await onboarding;
    if (response.status() !== 200) throw new Error("Onboarding state failed");
    const state = (await response.json()).data;
    if (!state.completed) {
      // Shell navigation is available before onboarding; do not change demo consent/profile.
      await page.waitForSelector("#page-onboarding:not(.hidden)");
      await page.click(
        '.nav-item[data-page="dashboard"]:visible, .bottom-nav-item[data-bottom-page="dashboard"]:visible',
      );
    }
  }
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
}

async function main() {
  console.log("🎯 Student Shell E2E");
  // ensure demo user exists and has gamification data; use existing demo@okuplus.dev
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    // === Student mobile ===
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await loginViaUI(mobile, "demo@okuplus.dev", "demo-pass-123");
    const shellMobile = await mobile.$eval("#view-app", (el) =>
      el.classList.contains("student-shell"),
    );
    console.log("1 student shell mobile", shellMobile ? "PASS" : "FAIL");
    if (!shellMobile) throw new Error("student shell not applied mobile");
    const topbarXp = await mobile
      .$eval("#topbar-gamification", (el) => !el.classList.contains("hidden"))
      .catch(() => false);
    console.log("2 topbar gamification mobile", topbarXp ? "PASS" : "FAIL");
    if (!topbarXp) throw new Error("topbar gamification hidden");
    const xpText = await mobile.textContent("#topbar-xp");
    const streakText = await mobile.textContent("#topbar-streak");
    console.log(`3 XP=${xpText} streak=${streakText}`);
    // context switcher: student personal -> should be hidden if only 1 context, but demo may have 1; check not error
    const ctxHidden = await mobile
      .$eval("#context-switcher", (el) => el.classList.contains("hidden"))
      .catch(() => true);
    console.log(`4 context switcher hidden=${ctxHidden} (ok if single)`);
    // bottom nav visible mobile
    const bottomVisible = await mobile
      .$eval(
        "#student-bottom-nav",
        (el) => !el.classList.contains("hidden") && getComputedStyle(el).display !== "none",
      )
      .catch(() => false);
    console.log("5 bottom nav mobile visible", bottomVisible ? "PASS" : "FAIL");
    if (!bottomVisible) throw new Error("bottom nav not visible mobile");
    const bottomItems = await mobile.$$eval(".bottom-nav-item", (els) => els.length);
    console.log(`6 bottom nav items ${bottomItems}`);
    if (bottomItems !== 7) throw new Error("bottom nav should have 7");
    for (const el of await mobile.$$(".bottom-nav-item")) {
      const box = await el.boundingBox();
      if (!box || box.height < 48 || box.width < 48) throw new Error("touch target <48");
    }
    console.log("7 touch target 48 ok");
    const currentNav = await mobile.$eval('.bottom-nav-item[data-bottom-page="dashboard"]', (el) =>
      el.getAttribute("aria-current"),
    );
    if (currentNav !== "page") throw new Error("active bottom nav missing aria-current");
    for (const selector of ["#context-switcher", "#logout-btn"]) {
      const box = await mobile.$eval(selector, (el) => {
        const r = el.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          visible:
            getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden",
        };
      });
      if (box.visible && box.height < 48) throw new Error(`${selector} touch target <48`);
    }
    console.log("7a active nav ARIA + context/logout touch targets PASS");
    // navigate via bottom nav
    await mobile.click('.bottom-nav-item[data-bottom-page="progress"]');
    await mobile.waitForSelector("#page-progress:not(.hidden)", { timeout: 5000 });
    console.log("8 navigate progress via bottom nav PASS");
    await mobile.click('.bottom-nav-item[data-bottom-page="badges"]');
    await mobile.waitForSelector("#page-badges:not(.hidden)", { timeout: 5000 });
    console.log("9 badges PASS");
    await mobile.click('.bottom-nav-item[data-bottom-page="settings"]');
    await mobile.waitForSelector("#page-settings:not(.hidden)", { timeout: 5000 });
    console.log("10 profile/settings PASS");
    // exercise
    await mobile.click('.bottom-nav-item[data-bottom-page="exercise"]');
    await mobile.waitForSelector("#page-exercise:not(.hidden)", { timeout: 5000 });
    console.log("11 exercise PASS");
    // dashboard again
    await mobile.click('.bottom-nav-item[data-bottom-page="dashboard"]');
    await mobile.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 5000 });
    console.log("12 dashboard via bottom nav PASS");
    // desktop student
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await loginViaUI(desktop, "demo@okuplus.dev", "demo-pass-123");
    const shellDesktop = await desktop.$eval("#view-app", (el) =>
      el.classList.contains("student-shell"),
    );
    console.log("13 student shell desktop", shellDesktop ? "PASS" : "FAIL");
    if (!shellDesktop) throw new Error("student shell not applied desktop");
    const sidebarVisibleDesktop = await desktop.$eval(
      ".sidebar",
      (el) => getComputedStyle(el).display !== "none",
    );
    console.log(`14 desktop sidebar visible ${sidebarVisibleDesktop}`);
    if (!sidebarVisibleDesktop) throw new Error("desktop sidebar hidden");
    const bottomHiddenDesktop = await desktop.$eval(
      "#student-bottom-nav",
      (el) => el.classList.contains("hidden") || getComputedStyle(el).display === "none",
    );
    console.log(`15 bottom nav hidden desktop ${bottomHiddenDesktop ? "PASS" : "FAIL"}`);
    if (!bottomHiddenDesktop) throw new Error("desktop bottom nav visible");
    // admin regression
    const adminPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await loginViaUI(adminPage, "admin@okuplus.dev", "admin-pass-123");
    const adminShell = await adminPage.$eval("#view-app", (el) =>
      el.classList.contains("student-shell"),
    );
    console.log(`16 admin shell should be false ${!adminShell ? "PASS" : "FAIL"}`);
    if (adminShell) throw new Error("admin should not have student-shell");
    const adminSidebar = await adminPage.$eval(
      ".sidebar",
      (el) => getComputedStyle(el).display !== "none",
    );
    console.log(`17 admin sidebar visible ${adminSidebar ? "PASS" : "FAIL"}`);
    if (!adminSidebar) throw new Error("admin sidebar hidden");
    const adminBottomHidden = await adminPage.$eval("#student-bottom-nav", (el) =>
      el.classList.contains("hidden"),
    );
    console.log(`18 admin bottom nav hidden ${adminBottomHidden ? "PASS" : "FAIL"}`);
    if (!adminBottomHidden) throw new Error("admin bottom nav visible");
    console.log("✅ STUDENT SHELL E2E PASS");
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
