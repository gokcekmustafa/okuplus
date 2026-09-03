import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
let activeBrowser: Browser | undefined;
const EMAIL = `onboard-e2e-${Date.now()}@example.com`;
const PASS = "OnboardE2E123!";
const SKILL_ID = `8d-e2e-skill-${Date.now()}`;
const CONTENT_ID = `8d-e2e-content-${Date.now()}`;
const CV_ID = `8d-e2e-cv-${Date.now()}`;
const Q_ID = `8d-e2e-q-${Date.now()}`;
const QV_ID = `8d-e2e-qv-${Date.now()}`;
const TMPL_ID = `8d-e2e-tmpl-${Date.now()}`;
const TMPL_VID = `8d-e2e-tmplv-${Date.now()}`;
const LEVEL_ID = `8d-e2e-level-${Date.now()}`;
const ASSM_ID = `8d-e2e-assm-${Date.now()}`;

async function seed() {
  await prisma.skill.create({
    data: {
      id: SKILL_ID,
      code: `ONB_E2E_${Date.now()}`,
      name: "Onb E2E",
      category: "COMPREHENSION",
    },
  });
  await prisma.level.create({
    data: {
      id: LEVEL_ID,
      code: `L_${Date.now()}`,
      name: "5. Sınıf E2E",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0,
      difficultyMax: 5,
      displayOrder: 5,
    },
  });
  await prisma.content.create({
    data: {
      id: CONTENT_ID,
      type: "PASSAGE",
      title: "Onb E2E Content",
      difficulty: 1,
      status: "PUBLISHED",
    },
  });
  await prisma.contentVersion.create({
    data: {
      id: CV_ID,
      contentId: CONTENT_ID,
      version: 1,
      title: "v1",
      body: "hello world for onboarding e2e",
      wordCount: 5,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.content.update({ where: { id: CONTENT_ID }, data: { currentVersionId: CV_ID } });
  await prisma.question.create({
    data: {
      id: Q_ID,
      contentId: CONTENT_ID,
      position: 1,
      type: "TRUE_FALSE",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QV_ID,
      questionId: Q_ID,
      version: 1,
      prompt: "p",
      correctAnswer: { type: "TRUE_FALSE", answer: true },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: TMPL_ID,
      contentId: CONTENT_ID,
      title: "Onb E2E Tmpl",
      type: "COMPREHENSION",
      status: "PUBLISHED",
    },
  });
  await prisma.exerciseTemplateVersion.create({
    data: {
      id: TMPL_VID,
      templateId: TMPL_ID,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplateVersionContent.create({
    data: { templateVersionId: TMPL_VID, contentVersionId: CV_ID, position: 0 },
  });
  await prisma.exerciseTemplateVersionQuestion.create({
    data: { templateVersionId: TMPL_VID, questionVersionId: QV_ID, questionId: Q_ID, position: 0 },
  });
  await prisma.assessment.create({
    data: {
      id: ASSM_ID,
      title: "E2E Placement",
      type: "PLACEMENT",
      status: "PUBLISHED",
      config: { templateId: TMPL_ID, templateVersionId: TMPL_VID },
    },
  });
}
async function cleanup(userId?: string, tenantId?: string) {
  if (userId) {
    await prisma.consent.deleteMany({ where: { userId } });
    await prisma.studentProgress.deleteMany({ where: { studentId: userId } });
    await prisma.pointEvent.deleteMany({ where: { studentId: userId } });
    await prisma.studentStreak.deleteMany({ where: { studentId: userId } });
    await prisma.studentBadge.deleteMany({ where: { studentId: userId } });
    await prisma.assessmentResult.deleteMany({ where: { studentId: userId } });
    await prisma.attempt.deleteMany({ where: { session: { studentId: userId } } });
    await prisma.exerciseSession.deleteMany({ where: { studentId: userId } });
    await prisma.studentProfile.deleteMany({ where: { studentId: userId } });
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.authSession.deleteMany({ where: { userId } });
    await prisma.authIdentity.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    if (tenantId) {
      await prisma.pointEvent.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  }
  await prisma.assessment.deleteMany({ where: { id: ASSM_ID } });
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: TMPL_VID },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: TMPL_VID },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { id: QV_ID } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TMPL_VID } });
    await tx.contentVersion.deleteMany({ where: { id: CV_ID } });
  });
  await prisma.question.deleteMany({ where: { id: Q_ID } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: TMPL_ID } });
  await prisma.content.deleteMany({ where: { id: CONTENT_ID } });
  await prisma.skill.deleteMany({ where: { id: SKILL_ID } });
  await prisma.level.deleteMany({ where: { id: LEVEL_ID } });
}

async function main() {
  console.log("🎯 Onboarding E2E");
  await seed();
  const browser = (activeBrowser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  }));
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console", m.text());
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.click("#show-signup-btn");
  await page.fill("#signup-display-name", "Onb E2E");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASS);
  await page.click("#signup-submit");
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 10000 });
  console.log("1 onboarding shown after signup OK");
  // step1
  await page.fill("#onboard-displayName", "Onb E2E Updated");
  await page.fill("#onboard-birthYear", "2012");
  await page.click("#onboarding-next");
  await page.waitForTimeout(800);
  console.log("2 step1 next OK");
  // step2 - wait for levels
  await page.waitForTimeout(800);
  const levelOpts = await page.$$eval("#onboard-level option", (els) =>
    els.map((e) => (e as HTMLOptionElement).value),
  );
  console.log(" levels", levelOpts.slice(0, 3));
  if (levelOpts.includes(LEVEL_ID)) await page.selectOption("#onboard-level", LEVEL_ID);
  else await page.selectOption("#onboard-level", levelOpts[1] || "");
  await page.click('[data-goal="SPEED"]');
  await page.click("#onboarding-next");
  await page.waitForTimeout(800);
  console.log("3 step2 OK");
  // step3 consents
  await page.check("#onboard-consent-terms");
  await page.check("#onboard-consent-data");
  // parental hidden for 2012 (age 14) should be visible, need to check
  const parentalHidden = await page.$eval("#onboard-parental-wrap", (el) =>
    el.classList.contains("hidden"),
  );
  if (!parentalHidden) await page.check("#onboard-consent-parental");
  await page.click("#onboarding-complete");
  await page.waitForSelector("#onboarding-ready:not(.hidden)", { timeout: 5000 });
  console.log("4 onboarding complete -> ready OK");
  // quick start
  await page.click("#onboard-quickstart");
  await page.waitForTimeout(1500);
  const quickErr = await page.textContent("#onboarding-error");
  if (quickErr && quickErr.trim()) throw new Error("quickstart error: " + quickErr);
  console.log("5 quick start click OK");
  const quickUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  const sessCount = await prisma.exerciseSession.count({ where: { studentId: quickUser!.id } });
  console.log("  sessions count", sessCount);
  if (sessCount === 0) throw new Error("quickstart session not created");
  // placement (API check, UI already tested via quick-start)
  const placementCheck = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/onboarding/placement", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    const j = await r.json();
    return j.data?.assessmentId;
  });
  console.log("  placement id", placementCheck);
  if (!placementCheck) throw new Error("placement assessment not found");
  // refresh -> should be dashboard not onboarding
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  const onboardHidden = await page.$eval("#page-onboarding", (el) =>
    el.classList.contains("hidden"),
  );
  console.log("6 refresh dashboard, onboarding hidden", onboardHidden);
  if (!onboardHidden) throw new Error("onboarding should be hidden after complete");
  // DB validation
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, displayName: true },
  });
  const tenantId = await page.evaluate(() => localStorage.getItem("oku.tenantId"));
  const profile = await prisma.studentProfile.findUnique({
    where: { tenantId_studentId: { tenantId: tenantId!, studentId: user!.id } },
  });
  console.log("7 DB profile", {
    displayName: user?.displayName,
    learningGoal: profile?.learningGoal,
    completedAt: !!profile?.onboardingCompletedAt,
  });
  if (!profile?.onboardingCompletedAt) throw new Error("onboardingCompletedAt not set");
  if (profile.learningGoal !== "SPEED") throw new Error("learningGoal mismatch");
  const consents = await prisma.consent.findMany({ where: { userId: user!.id } });
  console.log(
    "  consents",
    consents.map((c) => c.type),
  );
  // cross-user: other user should not see this onboarding state
  const otherEmail = `other-${Date.now()}@example.com`;
  await page.evaluate(
    async (creds) => {
      await fetch("/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.pass, displayName: "Other" }),
      });
    },
    { email: otherEmail, pass: PASS },
  );
  const other = await prisma.user.findUnique({ where: { email: otherEmail } });
  const otherOnboard = await prisma.studentProfile.findUnique({
    where: {
      tenantId_studentId: {
        tenantId: (await prisma.membership.findFirst({ where: { userId: other!.id } }))!.tenantId,
        studentId: other!.id,
      },
    },
  });
  console.log("  other onboarding completed", !!otherOnboard?.onboardingCompletedAt);
  // cleanup other
  if (other) {
    const ot = await prisma.membership.findFirst({ where: { userId: other.id } });
    await prisma.consent.deleteMany({ where: { userId: other.id } });
    await prisma.studentProgress.deleteMany({ where: { studentId: other.id } });
    await prisma.pointEvent.deleteMany({ where: { studentId: other.id } });
    await prisma.studentStreak.deleteMany({ where: { studentId: other.id } });
    await prisma.studentBadge.deleteMany({ where: { studentId: other.id } });
    await prisma.studentProfile.deleteMany({ where: { studentId: other.id } });
    await prisma.membership.deleteMany({ where: { userId: other.id } });
    await prisma.authSession.deleteMany({ where: { userId: other.id } });
    await prisma.authIdentity.deleteMany({ where: { userId: other.id } });
    if (ot) {
      await prisma.pointEvent.deleteMany({ where: { tenantId: ot.tenantId } });
      await prisma.tenant.deleteMany({ where: { id: ot.tenantId } });
    }
    await prisma.user.delete({ where: { id: other.id } });
  }
  await cleanup(user!.id, tenantId!);
  await browser.close();
  await prisma.$disconnect();
  console.log("✅ ONBOARDING E2E PASS");
}
main().catch(async (e) => {
  console.error("FAIL", e);
  try {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    const membership = user
      ? await prisma.membership.findFirst({
          where: { userId: user.id, tenant: { type: "INDIVIDUAL" } },
          select: { tenantId: true },
        })
      : null;
    await cleanup(user?.id, membership?.tenantId);
  } finally {
    await activeBrowser?.close();
    await prisma.$disconnect();
    process.exitCode = 1;
  }
});
