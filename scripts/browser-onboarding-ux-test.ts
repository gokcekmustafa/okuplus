import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
const email = "onboard-ux-" + Date.now() + "@example.com";
const password = "OnboardUX123!";
let userId: string | undefined;
let tenantId: string | undefined;

async function cleanup() {
  if (!userId) return;
  await prisma.consent.deleteMany({ where: { userId } });
  await prisma.pointEvent.deleteMany({ where: { studentId: userId } });
  await prisma.studentProgress.deleteMany({ where: { studentId: userId } });
  await prisma.studentStreak.deleteMany({ where: { studentId: userId } });
  await prisma.studentBadge.deleteMany({ where: { studentId: userId } });
  await prisma.assessmentResult.deleteMany({ where: { studentId: userId } });
  await prisma.attempt.deleteMany({ where: { session: { studentId: userId } } });
  await prisma.exerciseSession.deleteMany({ where: { studentId: userId } });
  await prisma.studentProfile.deleteMany({ where: { studentId: userId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.authSession.deleteMany({ where: { userId } });
  await prisma.authIdentity.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
  userId = undefined;
  tenantId = undefined;
}

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.click("#show-signup-btn");
    await page.fill("#signup-display-name", "Onboarding UX");
    await page.fill("#signup-email", email);
    await page.fill("#signup-password", password);
    await page.click("#signup-submit");
    await page.waitForSelector("#page-onboarding:not(.hidden)");
    userId = (await prisma.user.findUnique({ where: { email } }))?.id;
    tenantId = (await prisma.membership.findFirst({ where: { userId: userId! } }))?.tenantId;

    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 390)
      throw new Error("mobile horizontal overflow");
    if ((await page.locator(".onboarding-dot").count()) !== 3)
      throw new Error("progress indicator missing");
    if ((await page.locator(".goal-card").count()) !== 4) throw new Error("goal cards missing");
    if ((await page.locator("#onboarding-next").getAttribute("class"))?.includes("hidden"))
      throw new Error("primary CTA hidden");

    await page.fill("#onboard-displayName", "");
    await page.locator("#onboarding-next").click();
    await page.waitForTimeout(150);
    if (!(await page.locator("#onboarding-error").isVisible()))
      throw new Error("validation missing");

    await page.fill("#onboard-displayName", "Onboarding UX");
    await page.click("#onboarding-next");
    await page.waitForTimeout(500);
    await page.locator('[data-goal="COMPREHENSION"]').press("Enter");
    if ((await page.locator('[data-goal="COMPREHENSION"]').getAttribute("aria-checked")) !== "true")
      throw new Error("keyboard goal selection failed");

    await page.setViewportSize({ width: 1280, height: 800 });
    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 1280)
      throw new Error("desktop horizontal overflow");
    if ((await page.locator(".onboarding-card").getAttribute("class")) !== "onboarding-card card")
      throw new Error("onboarding card missing");
    console.log("✅ ONBOARDING UX E2E PASS (mobile, desktop, keyboard, validation, progress)");
  } finally {
    await browser.close();
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("FAIL", error);
  await cleanup();
  await prisma.$disconnect();
  process.exitCode = 1;
});
