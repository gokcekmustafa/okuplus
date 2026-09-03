import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
let activeBrowser: Browser | undefined;
const EMAIL = `learn-e2e-${Date.now()}@example.com`;
const PASS = "LearnE2E123!";
const SKILL_ID = `8e-learn-skill-${Date.now()}`;
const LEVEL_ID = `8e-learn-level-${Date.now()}`;
const CONTENT_ID = `8e-learn-content-${Date.now()}`;
const CV_ID = `8e-learn-cv-${Date.now()}`;
const Q_ID = `8e-learn-q-${Date.now()}`;
const QV_ID = `8e-learn-qv-${Date.now()}`;
const TMPL_ID = `8e-learn-tmpl-${Date.now()}`;
const TMPL_VID = `8e-learn-tmplv-${Date.now()}`;
async function seed() {
  await prisma.skill.create({
    data: {
      id: SKILL_ID,
      code: `LEARN_E2E_${Date.now()}`,
      name: "E2E Skill",
      category: "COMPREHENSION",
    },
  });
  await prisma.level.create({
    data: {
      id: LEVEL_ID,
      code: `L_${Date.now()}`,
      name: "5. Sınıf",
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
      title: "E2E Content",
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
      body: "hello e2e world",
      wordCount: 3,
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
      title: "E2E Tmpl",
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
}
async function cleanup(uid?: string, tid?: string) {
  if (uid) {
    await prisma.consent.deleteMany({ where: { userId: uid } });
    await prisma.attempt.deleteMany({ where: { session: { studentId: uid } } });
    await prisma.exerciseSession.deleteMany({ where: { studentId: uid } });
    await prisma.studentProgress.deleteMany({ where: { studentId: uid } });
    await prisma.pointEvent.deleteMany({ where: { studentId: uid } });
    await prisma.studentStreak.deleteMany({ where: { studentId: uid } });
    await prisma.studentBadge.deleteMany({ where: { studentId: uid } });
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
  console.log("🎯 Student Learning E2E");
  await seed();
  const browser = (activeBrowser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  }));
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.click("#show-signup-btn");
  await page.fill("#signup-display-name", "Learn E2E");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASS);
  await page.click("#signup-submit");
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 10000 });
  // quick onboarding
  await page.fill("#onboard-displayName", "Learn E2E");
  await page.fill("#onboard-birthYear", "2010");
  await page.click("#onboarding-next");
  await page.waitForTimeout(600);
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
  // after onboarding, should be able to see today
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  console.log("1 dashboard after onboarding OK");
  // check today card
  await page.waitForSelector("#today-card", { timeout: 5000 });
  const todayText = await page.textContent("#today-next-action");
  console.log(" today nextAction", todayText?.slice(0, 80));
  if (!todayText) throw new Error("today not loaded");
  // fetch today via API
  const todayApi = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/today", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    return { status: r.status, body: await r.json() };
  });
  console.log(" today API", todayApi.status, JSON.stringify(todayApi.body.data).slice(0, 300));
  if (todayApi.status !== 200) throw new Error("today API failed");
  // start personal exercise via API
  const start = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/exercises/start", {
      method: "POST",
      headers: {
        authorization: `Bearer ${t}`,
        "x-tenant-id": tenant || "",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    return { status: r.status, body: await r.json() };
  });
  console.log(" personal exercise start", start.status, start.body.data?.sessionId?.slice(0, 8));
  if (start.status !== 200) throw new Error("personal exercise start failed");
  const sessionId = start.body.data.sessionId;
  // resume check
  const today2 = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/today", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    return (await r.json()).data;
  });
  if (today2.nextAction.type !== "RESUME_SESSION") throw new Error("expected RESUME");
  console.log(" resume detected OK");
  // get session detail
  const sessDetail = await page.evaluate(async (sid) => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch(`/student/sessions/${sid}`, {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    return r.status;
  }, sessionId);
  if (sessDetail !== 200) throw new Error("get session failed");
  console.log(" session detail OK");
  // answer and complete
  const qRes = await page.evaluate(async (sid) => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch(`/admin/exercise-sessions/${sid}/questions`, {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    const j = await r.json();
    return j.data[0]?.questionVersionId;
  }, sessionId);
  await page.evaluate(
    async ({ sid, qvid }) => {
      const t = localStorage.getItem("oku.accessToken");
      const tenant = localStorage.getItem("oku.tenantId");
      await fetch(`/admin/questions/${qvid}/attempts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${t}`,
          "x-tenant-id": tenant || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sid,
          answer: true,
          clientAttemptId: "e2e-" + Date.now(),
        }),
      });
      await fetch(`/admin/exercise-sessions/${sid}/complete`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${t}`,
          "x-tenant-id": tenant || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
    },
    { sid: sessionId, qvid: qRes },
  );
  console.log(" complete OK");
  // history
  const hist = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const tenant = localStorage.getItem("oku.tenantId");
    const r = await fetch("/student/history?page=1&pageSize=5", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant || "" },
    });
    return { status: r.status, body: await r.json() };
  });
  if (hist.status !== 200 || hist.body.data.items.length === 0) throw new Error("history empty");
  console.log(" history OK", hist.body.data.total);
  // unauthorized
  const otherEmail = `other-learn-${Date.now()}@example.com`;
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
  const bad = await page.evaluate(
    async ({ sid, email, pass }) => {
      const otherLogin = await fetch("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      }).then((r) => r.json());
      const t = otherLogin.data.tokens.accessToken;
      const tenant = otherLogin.data.tenantContext.tenantId;
      const r = await fetch(`/student/sessions/${sid}`, {
        headers: { authorization: `Bearer ${t}`, "x-tenant-id": tenant },
      });
      return r.status;
    },
    { sid: sessionId, email: otherEmail, pass: PASS },
  );
  if (bad !== 404) throw new Error("cross-user not blocked");
  console.log(" cross-user blocked OK");
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
      await prisma.studentProgress.deleteMany({ where: { tenantId: ot.tenantId } });
      await prisma.tenant.deleteMany({ where: { id: ot.tenantId } });
    }
    await prisma.user.delete({ where: { id: other.id } });
  }
  const me = await prisma.user.findUnique({ where: { email: EMAIL } });
  const myTenant = await page.evaluate(() => localStorage.getItem("oku.tenantId"));
  await cleanup(me!.id, myTenant!);
  await browser.close();
  await prisma.$disconnect();
  console.log("✅ STUDENT LEARNING E2E PASS");
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
