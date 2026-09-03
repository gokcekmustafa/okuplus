import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
let activeBrowser: Browser | undefined;
const EMAIL = `path-e2e-${Date.now()}@example.com`;
const PASS = "PathE2E123!";
const SKILL_A = `path-e2e-skill-a-${Date.now()}`;
const SKILL_B = `path-e2e-skill-b-${Date.now()}`;
const CONTENT_ID = `path-e2e-content-${Date.now()}`;
const CV_ID = `path-e2e-cv-${Date.now()}`;
const Q_ID = `path-e2e-q-${Date.now()}`;
const QV_ID = `path-e2e-qv-${Date.now()}`;
const TMPL_A = `path-e2e-tmpl-a-${Date.now()}`;
const TMPL_AV = `path-e2e-tmpl-av-${Date.now()}`;
const TMPL_B = `path-e2e-tmpl-b-${Date.now()}`;
const TMPL_BV = `path-e2e-tmpl-bv-${Date.now()}`;
const LEVEL_ID = `path-e2e-level-${Date.now()}`;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function seed() {
  await prisma.skill.createMany({
    data: [
      {
        id: SKILL_A,
        code: `P_A_${Date.now()}`,
        name: "Path A",
        category: "MAIN_IDEA",
        displayOrder: 1,
      },
      {
        id: SKILL_B,
        code: `P_B_${Date.now()}`,
        name: "Path B",
        category: "DETAIL",
        displayOrder: 2,
      },
    ],
  });
  await prisma.level.create({
    data: {
      id: LEVEL_ID,
      code: `PL_${Date.now()}`,
      name: "Seviye 1",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0,
      difficultyMax: 5,
      displayOrder: 1,
    },
  });
  await prisma.content.create({
    data: {
      id: CONTENT_ID,
      type: "PASSAGE",
      title: "Path E2E Content",
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
      body: "hello path",
      wordCount: 2,
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
      skillId: SKILL_A,
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
  await prisma.exerciseTemplate.createMany({
    data: [
      {
        id: TMPL_A,
        contentId: CONTENT_ID,
        title: "Tmpl A",
        type: "COMPREHENSION",
        skillId: SKILL_A,
        status: "PUBLISHED",
      },
      {
        id: TMPL_B,
        contentId: CONTENT_ID,
        title: "Tmpl B",
        type: "COMPREHENSION",
        skillId: SKILL_B,
        status: "PUBLISHED",
      },
    ],
  });
  await prisma.exerciseTemplateVersion.createMany({
    data: [
      { id: TMPL_AV, templateId: TMPL_A, version: 1, status: "PUBLISHED", publishedAt: new Date() },
      {
        id: TMPL_BV,
        templateId: TMPL_B,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() + 1000),
      },
    ],
  });
  await prisma.exerciseTemplateVersionContent.createMany({
    data: [
      { templateVersionId: TMPL_AV, contentVersionId: CV_ID, position: 0 },
      { templateVersionId: TMPL_BV, contentVersionId: CV_ID, position: 0 },
    ],
  });
  await prisma.exerciseTemplateVersionQuestion.createMany({
    data: [
      { templateVersionId: TMPL_AV, questionVersionId: QV_ID, questionId: Q_ID, position: 0 },
      { templateVersionId: TMPL_BV, questionVersionId: QV_ID, questionId: Q_ID, position: 0 },
    ],
  });
}
async function cleanup(uid?: string, tid?: string) {
  if (uid) {
    await prisma.attempt.deleteMany({ where: { session: { studentId: uid } } });
    await prisma.exerciseSession.deleteMany({ where: { studentId: uid } });
    await prisma.studentProgress.deleteMany({ where: { studentId: uid } });
    await prisma.pointEvent.deleteMany({ where: { studentId: uid } });
    await prisma.studentStreak.deleteMany({ where: { studentId: uid } });
    await prisma.studentBadge.deleteMany({ where: { studentId: uid } });
    await prisma.consent.deleteMany({ where: { userId: uid } });
    await prisma.studentProfile.deleteMany({ where: { studentId: uid } });
    await prisma.membership.deleteMany({ where: { userId: uid } });
    await prisma.authSession.deleteMany({ where: { userId: uid } });
    await prisma.user.deleteMany({ where: { id: uid } });
    if (tid) {
      await prisma.pointEvent.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
  }
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: { in: [TMPL_AV, TMPL_BV] } },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: { in: [TMPL_AV, TMPL_BV] } },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { id: QV_ID } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: { in: [TMPL_AV, TMPL_BV] } } });
    await tx.contentVersion.deleteMany({ where: { id: CV_ID } });
  });
  await prisma.question.deleteMany({ where: { id: Q_ID } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: { in: [TMPL_A, TMPL_B] } } });
  await prisma.content.deleteMany({ where: { id: CONTENT_ID } });
  await prisma.skill.deleteMany({
    where: { id: { in: [SKILL_A, SKILL_B] } },
  });
  await prisma.level.deleteMany({ where: { id: LEVEL_ID } });
}

async function main() {
  console.log("🎯 Learning Path E2E");
  await seed();
  const browser = (activeBrowser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  }));
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.click("#show-signup-btn");
  await page.fill("#signup-display-name", "Path E2E");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASS);
  await page.click("#signup-submit");
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 10000 });
  await page.fill("#onboard-displayName", "Path E2E");
  await page.fill("#onboard-birthYear", "2010");
  await page.click("#onboarding-next");
  await page.waitForTimeout(600);
  const opts = await page.$$eval("#onboard-level option", (els) =>
    els.map((e) => (e as HTMLOptionElement).value),
  );
  if (opts.includes(LEVEL_ID)) await page.selectOption("#onboard-level", LEVEL_ID);
  else await page.selectOption("#onboard-level", opts[1] || "");
  await page.click('[data-goal="SPEED"]');
  await page.click("#onboarding-next");
  await page.waitForTimeout(600);
  await page.check("#onboard-consent-terms");
  await page.check("#onboard-consent-data");
  const parentalHidden = await page.$eval("#onboard-parental-wrap", (el) =>
    el.classList.contains("hidden"),
  );
  if (!parentalHidden) await page.check("#onboard-consent-parental");
  await page.click("#onboarding-complete");
  await page.waitForSelector("#onboarding-ready:not(.hidden)", { timeout: 5000 });
  await page.click("#onboard-quickstart");
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  console.log("1 login+onboarding+dashboard OK");
  await page.waitForSelector("#learning-path", { timeout: 5000 });
  await page.waitForTimeout(1500);
  const raw = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/learning-path", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    const j = await r.json();
    return { status: r.status, body: j };
  });
  console.log(" raw", raw.status, JSON.stringify(raw.body).slice(0, 900));
  await page.waitForSelector("#learning-path .path-node", { timeout: 5000 });
  const nodes = await page.$$eval("#learning-path .path-node", (els) =>
    els.map((e) => ({ cls: e.className, label: e.getAttribute("aria-label") })),
  );
  console.log(`2 nodes ${nodes.length}`, nodes.map((n) => n.cls).join(" | "));
  if (nodes.length === 0) throw new Error("no nodes raw:" + JSON.stringify(raw.body).slice(0, 500));
  const active = nodes.filter((n) => n.cls.includes("active"));
  console.log(`3 active ${active.length}`);
  if (active.length === 0) throw new Error("no active");
  const completedBefore = nodes.filter((n) => n.cls.includes("completed")).length;
  console.log(`4 completed before ${completedBefore}`);
  const xp = await page.textContent("#topbar-xp").catch(() => null);
  console.log(`5 XP ${xp}`);
  const activeBtn = await page.$("#learning-path .path-node.active");
  if (!activeBtn) throw new Error("active btn not found");
  await activeBtn.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  const exerciseVisible = await page
    .$eval("#page-exercise", (el) => !el.classList.contains("hidden"))
    .catch(() => false);
  console.log(`6 node click exercise visible ${exerciseVisible}`);
  await page.click('.bottom-nav-item[data-bottom-page="dashboard"]');
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 5000 });
  console.log("7 return to path OK");
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  const tenantId = await page.evaluate(() => localStorage.getItem("oku.tenantId"));
  const sess = await prisma.exerciseSession.create({
    data: {
      tenantId: tenantId!,
      studentId: user!.id,
      templateVersionId: TMPL_AV,
      status: "COMPLETED",
      completedAt: new Date(),
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
    },
  });
  await prisma.studentProgress.create({
    data: {
      tenantId: tenantId!,
      studentId: user!.id,
      skillId: SKILL_A,
      periodStart: new Date("2026-01-05"),
      periodEnd: new Date("2026-01-11"),
      sessionCount: 1,
      attemptCount: 1,
    },
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#learning-path", { timeout: 5000 });
  await page.waitForSelector("#learning-path .path-node.completed", { timeout: 5000 });
  const nodes2 = await page.$$eval("#learning-path .path-node", (els) =>
    els.map((e) => e.className),
  );
  const completedAfter = nodes2.filter((c) => c.includes("completed")).length;
  console.log(`8 completed after ${completedAfter}`);
  if (completedAfter <= completedBefore) throw new Error("completed not increased");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  const pathVisibleDesktop = await page.$eval("#learning-path", (el) => !!el);
  console.log(`9 desktop path visible ${!!pathVisibleDesktop}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#learning-path", { timeout: 5000 });
  console.log("10 refresh persistence OK");
  const orgId = `path-org-${Date.now()}`;
  await prisma.tenant.create({
    data: { id: orgId, type: "ORGANIZATION", name: "Path Org", status: "ACTIVE" },
  });
  await prisma.membership.create({
    data: { tenantId: orgId, userId: user!.id, role: "STUDENT", status: "ACTIVE" },
  });
  const orgCtx = await page.evaluate(async (tid) => {
    const t = localStorage.getItem("oku.accessToken");
    const r = await fetch("/auth/me", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tid },
    });
    return r.status;
  }, orgId);
  console.log(`11 org context me ${orgCtx}`);
  const personalPath = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/learning-path", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    const j = await r.json();
    return j.data.nodes.length;
  });
  console.log(`12 personal path nodes ${personalPath}`);
  await prisma.membership.deleteMany({ where: { tenantId: orgId, userId: user!.id } });
  await prisma.tenant.deleteMany({ where: { id: orgId } });
  await prisma.exerciseSession.delete({ where: { id: sess.id } });
  await prisma.studentProgress.deleteMany({ where: { studentId: user!.id, skillId: SKILL_A } });
  const dbNodes = await prisma.skill.count();
  console.log(`13 DB skills ${dbNodes}`);
  const tid = await page.evaluate(() => localStorage.getItem("oku.tenantId"));
  await cleanup(user!.id, tid!);
  await browser.close();
  await prisma.$disconnect();
  console.log("✅ LEARNING PATH E2E PASS");
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
