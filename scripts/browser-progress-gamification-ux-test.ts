import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIR = ".tmp/verification-8f4";
const prefix = `pgux-${Date.now()}`;
const ids = {
  org: prefix + "-org",
  content: prefix + "-content",
  template: prefix + "-template",
  version: prefix + "-version",
  skills: [prefix + "-a", prefix + "-b"],
  level: prefix + "-level",
  questions: [0, 1, 2, 3].map((n) => prefix + "-q" + n),
  versions: [0, 1, 2, 3].map((n) => prefix + "-qv" + n),
};
const EMAIL = prefix + "@example.com",
  OTHER = prefix + "-other@example.com",
  PASS = "ProgressUx123!";
const users: string[] = [],
  tenants: string[] = [ids.org];
let createdBadge = "";
const evidence: Record<string, unknown> = { fixtures: ids, checks: [], requests: [] };
async function databaseBaseline() {
  return {
    tenant: await prisma.tenant.findUnique({ where: { id: "test-tenant" } }),
    content: await prisma.content.findUnique({ where: { id: "test-content" } }),
    orphanPoints: await prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM "PointEvent" p LEFT JOIN "User" u ON p."studentId"=u.id LEFT JOIN "Tenant" t ON p."tenantId"=t.id WHERE u.id IS NULL OR t.id IS NULL`,
    orphanStreaks: await prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM "StudentStreak" p LEFT JOIN "User" u ON p."studentId"=u.id LEFT JOIN "Tenant" t ON p."tenantId"=t.id WHERE u.id IS NULL OR t.id IS NULL`,
  };
}
type Auth = {
  user: { id: string };
  tokens: { accessToken: string };
  tenantContext: { tenantId: string };
};
const headers = (a: Auth, tenant = a.tenantContext.tenantId) => ({
  authorization: "Bearer " + a.tokens.accessToken,
  "x-tenant-id": tenant,
});
async function seed() {
  await prisma.tenant.create({
    data: { id: ids.org, name: "UX Deneme Okulu", type: "ORGANIZATION" },
  });
  await prisma.skill.createMany({
    data: ids.skills.map((id, i) => ({
      id,
      code: prefix.toUpperCase() + i,
      name: i ? "Detayları Anlama" : "Ana Fikri Bulma",
      category: "COMPREHENSION" as const,
      displayOrder: 90 + i,
    })),
  });
  await prisma.level.create({
    data: {
      id: ids.level,
      code: prefix,
      name: "Okuma Başlangıç",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0,
      difficultyMax: 5,
      displayOrder: 99,
    },
  });
  await prisma.content.create({
    data: {
      id: ids.content,
      type: "PASSAGE",
      title: "İlerleme UX metni",
      status: "PUBLISHED",
      difficulty: 1,
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: ids.template,
      title: "Okuma keşfi",
      type: "COMPREHENSION",
      skillId: ids.skills[0],
      status: "PUBLISHED",
      contentId: ids.content,
    },
  });
  await prisma.exerciseTemplateVersion.create({
    data: {
      id: ids.version,
      templateId: ids.template,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  for (let i = 0; i < 4; i++) {
    await prisma.question.create({
      data: {
        id: ids.questions[i],
        contentId: ids.content,
        position: i,
        type: i === 2 ? "OPEN_ENDED" : "TRUE_FALSE",
        skillId: ids.skills[i === 3 ? 1 : 0],
        status: "PUBLISHED",
      },
    });
    await prisma.questionVersion.create({
      data: {
        id: ids.versions[i],
        questionId: ids.questions[i],
        version: 1,
        prompt: i === 2 ? "Ana fikri yaz." : "Okumak bir beceridir.",
        correctAnswer:
          i === 2
            ? { type: "OPEN_ENDED", expectedAnswer: "okuma" }
            : { type: "TRUE_FALSE", answer: true },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: ids.version,
        questionVersionId: ids.versions[i],
        questionId: ids.questions[i],
        position: i,
      },
    });
  }
  const badge = await prisma.badge.findUnique({ where: { code: "FIRST_EXERCISE" } });
  if (!badge) {
    createdBadge = prefix + "-badge";
    await prisma.badge.create({
      data: {
        id: createdBadge,
        code: "FIRST_EXERCISE",
        name: "İlk Çalışma",
        description: "İlk alıştırmanı tamamladın.",
        icon: "🏅",
        status: "ACTIVE",
      },
    });
  } else assert.equal(badge.status, "ACTIVE");
}
async function signup(page: Page, email: string) {
  const res = await page.request.post(BASE + "/auth/signup", {
    data: { email, password: PASS, displayName: "İlerleme Öğrencisi" },
  });
  assert.equal(res.status(), 201);
  const a: Auth = (await res.json()).data;
  users.push(a.user.id);
  tenants.push(a.tenantContext.tenantId);
  await prisma.studentProfile.update({
    where: { tenantId_studentId: { tenantId: a.tenantContext.tenantId, studentId: a.user.id } },
    data: { onboardingCompletedAt: new Date(), currentLevelId: ids.level },
  });
  await prisma.membership.create({
    data: { tenantId: ids.org, userId: a.user.id, role: "STUDENT", status: "ACTIVE" },
  });
  return a;
}
async function complete(page: Page, a: Auth, tenant: string, allCorrect = false) {
  const h = headers(a, tenant);
  const start = await page.request.post(BASE + "/student/exercises/start", {
    headers: h,
    data: { templateVersionId: ids.version, clientSessionId: crypto.randomUUID() },
  });
  assert.equal(start.status(), 200);
  const sid = (await start.json()).data.sessionId;
  const attempts = [];
  for (let i = 0; i < 4; i++) {
    const answer = i === 2 ? "okuma" : i === 1 ? (!allCorrect ? false : true) : true;
    const timeSpentMs = i === 2 || i === 3 ? undefined : allCorrect ? 5000 : 12000;
    const response = await page.request.post(
      BASE + "/admin/questions/" + ids.versions[i] + "/attempts",
      {
        headers: h,
        data: { sessionId: sid, answer, clientAttemptId: crypto.randomUUID(), timeSpentMs },
      },
    );
    assert.equal(response.status(), 200);
    const payload = (await response.json()).data;
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: payload.id } });
    assert.deepEqual(row.answer, answer);
    assert.equal(row.tenantId, tenant);
    attempts.push({
      http: response.status(),
      id: row.id,
      answer: row.answer,
      score: row.rawScore,
      timeSpentMs: row.timeSpentMs,
    });
  }
  const result = await page.request.post(BASE + "/admin/exercise-sessions/" + sid + "/complete", {
    headers: h,
  });
  assert.equal(result.status(), 200);
  for (let i = 0; i < 30; i++) {
    if (
      (await prisma.studentProgress.count({
        where: { tenantId: tenant, studentId: a.user.id },
      })) === 2
    )
      break;
    await page.waitForTimeout(100);
  }
  assert.equal(
    await prisma.studentProgress.count({ where: { tenantId: tenant, studentId: a.user.id } }),
    2,
  );
  return { sid, attempts };
}
async function goto(page: Page, name: "progress" | "badges") {
  await page
    .locator(
      `.bottom-nav-item[data-bottom-page="${name}"]:visible, .nav-item[data-page="${name}"]:visible`,
    )
    .click();
  await page.waitForFunction(
    (name) =>
      document
        .getElementById(name === "progress" ? "progress-status" : "gamification-status")
        ?.textContent?.includes("güncel") ||
      !document
        .getElementById(name === "progress" ? "progress-error" : "gamification-error")
        ?.classList.contains("hidden"),
    name,
  );
}
async function layout(page: Page, name: string) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    buttons: [...document.querySelectorAll(".page-view:not(.hidden) button")]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => ({ h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })),
  }));
  assert.equal(metrics.overflow, false);
  assert.ok(
    metrics.buttons.every((b) => b.h >= 48 && b.w >= 48),
    JSON.stringify(metrics),
  );
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  evidence[name] = metrics;
}
async function cleanup() {
  // Discover only exact run-owned emails, even if signup partially failed.
  const found = await prisma.user.findMany({ where: { email: { in: [EMAIL, OTHER] } } });
  for (const u of found) if (!users.includes(u.id)) users.push(u.id);
  const ms = await prisma.membership.findMany({
    where: { userId: { in: users }, tenant: { type: "INDIVIDUAL" } },
  });
  for (const m of ms) if (!tenants.includes(m.tenantId)) tenants.push(m.tenantId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.studentBadge.deleteMany({ where: { studentId: { in: users } } });
    await tx.pointEvent.deleteMany({ where: { studentId: { in: users } } });
    await tx.studentStreak.deleteMany({ where: { studentId: { in: users } } });
    await tx.studentProgress.deleteMany({ where: { studentId: { in: users } } });
    await tx.attempt.deleteMany({ where: { session: { studentId: { in: users } } } });
    await tx.sessionContentVersion.deleteMany({ where: { session: { studentId: { in: users } } } });
    await tx.exerciseSession.deleteMany({ where: { studentId: { in: users } } });
    await tx.consent.deleteMany({ where: { userId: { in: users } } });
    await tx.studentProfile.deleteMany({ where: { studentId: { in: users } } });
    await tx.authSession.deleteMany({ where: { userId: { in: users } } });
    await tx.authIdentity.deleteMany({ where: { userId: { in: users } } });
    await tx.membership.deleteMany({ where: { userId: { in: users } } });
    await tx.user.deleteMany({ where: { id: { in: users } } });
    await tx.tenant.deleteMany({ where: { id: { in: tenants } } });
    await tx.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: ids.version },
    });
    await tx.questionVersion.deleteMany({ where: { id: { in: ids.versions } } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: ids.version } });
    await tx.question.deleteMany({ where: { id: { in: ids.questions } } });
    await tx.exerciseTemplate.deleteMany({ where: { id: ids.template } });
    await tx.content.deleteMany({ where: { id: ids.content } });
    await tx.skill.deleteMany({ where: { id: { in: ids.skills } } });
    await tx.level.deleteMany({ where: { id: ids.level } });
    if (createdBadge) await tx.badge.deleteMany({ where: { id: createdBadge } });
  });
  const remaining = await Promise.all([
    prisma.user.count({ where: { id: { in: users } } }),
    prisma.tenant.count({ where: { id: { in: tenants } } }),
    prisma.exerciseSession.count({ where: { templateVersionId: ids.version } }),
    prisma.attempt.count({ where: { questionVersionId: { in: ids.versions } } }),
    prisma.studentProgress.count({ where: { skillId: { in: ids.skills } } }),
    prisma.pointEvent.count({ where: { studentId: { in: users } } }),
    prisma.studentStreak.count({ where: { studentId: { in: users } } }),
    prisma.studentBadge.count({ where: { studentId: { in: users } } }),
    prisma.questionVersion.count({ where: { id: { in: ids.versions } } }),
    prisma.question.count({ where: { id: { in: ids.questions } } }),
    prisma.skill.count({ where: { id: { in: ids.skills } } }),
  ]);
  assert.ok(remaining.every((n) => n === 0));
  evidence.cleanup = { status: "PASS", remaining };
  console.log("PASS cleanup/orphan", remaining);
}
async function main() {
  let browser: Browser | undefined, page: Page | undefined;
  await mkdir(DIR, { recursive: true });
  const baseline = await databaseBaseline();
  try {
    await seed();
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/student/")) requests.push(new URL(r.url()).pathname);
    });
    const a = await signup(page, EMAIL),
      b = await signup(page, OTHER);
    await page.goto(BASE);
    await page.fill("#login-email", EMAIL);
    await page.fill("#login-password", PASS);
    const login = page.waitForResponse((r) => r.url().endsWith("/auth/login"));
    await page.click("#login-submit");
    const lr = await login;
    assert.equal(lr.status(), 200);
    await page.waitForSelector(`#learning-path [data-template="${ids.version}"]`);
    await goto(page, "progress");
    assert.match(await page.locator("#progress-skills").innerText(), /İlk adımın/);
    assert.equal(await page.locator("#progress-accuracy").innerText(), "—");
    await goto(page, "badges");
    assert.equal(await page.locator("[data-badge-index]").count(), 0);
    assert.equal(await page.locator("#badge-celebration").innerText(), "");
    const personal = await complete(page, a, a.tenantContext.tenantId);
    evidence.personal = personal;
    await page.click("#gamification-refresh");
    await page.waitForSelector("[data-badge-index]");
    assert.match(await page.locator("#badge-celebration").innerText(), /Yeni bir rozet/);
    const g = await (
      await page.request.get(BASE + "/student/gamification", { headers: headers(a) })
    ).json();
    const total = await prisma.pointEvent.aggregate({
      where: { studentId: a.user.id, tenantId: a.tenantContext.tenantId },
      _sum: { points: true },
    });
    assert.equal(g.data.totalPoints, total._sum.points);
    assert.equal(
      await page.locator("#gamification-total-points").innerText(),
      String(total._sum.points),
    );
    const streak = await prisma.studentStreak.findFirstOrThrow({
      where: { studentId: a.user.id, tenantId: a.tenantContext.tenantId },
    });
    assert.equal(g.data.lastActivityDate, streak.lastActivityDate?.toISOString());
    assert.equal(
      await page.locator("#gamification-current-days").innerText(),
      String(streak.currentDays),
    );
    await page.locator("[data-badge-index]").first().press("Enter");
    await page.waitForSelector("#badge-detail[open]");
    assert.match(await page.locator("#badge-detail-source").innerText(), new RegExp(personal.sid));
    const award = await prisma.studentBadge.findFirstOrThrow({
      where: { studentId: a.user.id, tenantId: a.tenantContext.tenantId },
      include: { badge: true },
    });
    assert.equal(await page.locator("#badge-detail-title").innerText(), award.badge.name);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#badge-detail").isVisible(), false);
    await layout(page, "badges-mobile");
    const before = requests.length;
    await goto(page, "progress");
    const calls = requests.slice(before);
    assert.equal(calls.filter((p) => p === "/student/progress").length, 1);
    assert.equal(calls.filter((p) => p === "/student/gamification").length, 1);
    assert.equal(calls.filter((p) => p === "/student/history").length, 1);
    assert.equal(calls.filter((p) => p === "/student/learning-path").length, 1);
    evidence.pageRequests = calls;
    assert.equal(await page.locator("#progress-accuracy").innerText(), "67%");
    assert.equal(await page.locator("#progress-sessions").innerText(), "1");
    assert.equal(await page.locator("#progress-attempts").innerText(), "4");
    assert.equal(await page.locator("#progress-correct").innerText(), "2");
    assert.equal(await page.locator("#topbar-xp").innerText(), String(total._sum.points));
    const rows = await prisma.studentProgress.findMany({
      where: { studentId: a.user.id, tenantId: a.tenantContext.tenantId },
    });
    for (const row of rows) {
      const card = page.locator(`[data-skill-id="${row.skillId}"]`);
      assert.equal(
        await card.locator(".skill-accuracy").innerText(),
        Math.round(row.accuracy! * 100) + "%",
      );
      assert.equal(await card.locator(".skill-attempts").innerText(), String(row.attemptCount));
      assert.equal(await card.locator(".skill-sessions").innerText(), String(row.sessionCount));
      assert.equal(await card.locator(".skill-correct").innerText(), String(row.correctCount));
      if (row.avgTimeMs !== null)
        assert.match(await card.locator(".skill-time").innerText(), /12 sn/);
      else assert.equal(await card.locator(".skill-time").count(), 0);
    }
    assert.match(await page.locator("#progress-history").innerText(), /Okuma keşfi/);
    assert.match(await page.locator("#progress-history").innerText(), /Tamamlandı/);
    assert.match(await page.locator("#progress-path").innerText(), /Okuma Başlangıç/);
    evidence.progress = {
      rows,
      summary: { sessionCount: 1, attemptCount: 4, correctCount: 2, accuracy: 2 / 3 },
      xp: total._sum.points,
      streak,
      award,
    };
    await layout(page, "progress-mobile");
    await page.setViewportSize({ width: 1280, height: 800 });
    await layout(page, "progress-desktop");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".insight-bar span")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.reload();
    await page.waitForSelector(`#learning-path [data-template="${ids.version}"]`);
    await page.click("#home-progress-link");
    await page.waitForFunction(
      () => document.getElementById("progress-accuracy")?.textContent === "67%",
    );
    await page.route("**/student/progress", (route) => route.abort("failed"), { times: 1 });
    await page.click("#progress-refresh");
    await page.waitForSelector("#progress-error:not(.hidden)");
    assert.equal(await page.locator("#progress-skills").innerText(), "");
    await page.click("#progress-refresh");
    await page.waitForSelector(".skill-progress-card");
    const organization = await complete(page, a, ids.org, true);
    evidence.organization = organization;
    await page.selectOption("#context-switcher", ids.org);
    await page.waitForSelector("#page-dashboard:not(.hidden)");
    await goto(page, "progress");
    assert.equal(await page.locator("#progress-accuracy").innerText(), "100%");
    assert.match(await page.locator("#progress-path").innerText(), /Seviyen henüz belirlenmedi/);
    assert.match(
      await page.locator(`[data-skill-id="${ids.skills[0]}"] .skill-time`).innerText(),
      /5 sn/,
    );
    assert.notEqual(await page.locator("#progress-xp").innerText(), String(total._sum.points));
    await goto(page, "badges");
    await layout(page, "badges-desktop");
    assert.equal(await page.locator("#badge-celebration").innerText(), "");
    const otherProgress = await page.request.get(BASE + "/student/progress", {
      headers: headers(b, ids.org),
    });
    assert.equal(otherProgress.status(), 200);
    assert.equal((await otherProgress.json()).data.summary.attemptCount, 0);
    const otherGamma = await page.request.get(BASE + "/student/gamification", {
      headers: headers(b, ids.org),
    });
    assert.equal(otherGamma.status(), 200);
    assert.equal((await otherGamma.json()).data.totalPoints, 0);
    const otherHistory = await page.request.get(BASE + "/student/history", {
      headers: headers(b, ids.org),
    });
    assert.equal(otherHistory.status(), 200);
    assert.equal((await otherHistory.json()).data.total, 0);
    const orgHistory = await page.request.get(BASE + "/student/history", {
      headers: headers(a, ids.org),
    });
    const orgItems = (await orgHistory.json()).data.items as Array<{ id: string }>;
    assert.ok(orgItems.some((s) => s.id === organization.sid));
    assert.ok(orgItems.every((s) => s.id !== personal.sid));
    const denied = await page.request.get(BASE + "/student/sessions/" + personal.sid, {
      headers: headers(b),
    });
    assert.ok([403, 404].includes(denied.status()));
    const foreign = await page.request.get(BASE + "/student/progress", {
      headers: headers(a, b.tenantContext.tenantId),
    });
    assert.ok([403, 404].includes(foreign.status()));
    await page.selectOption("#context-switcher", a.tenantContext.tenantId);
    await page.waitForSelector("#page-dashboard:not(.hidden)");
    await goto(page, "progress");
    assert.equal(await page.locator("#progress-accuracy").innerText(), "67%");
    assert.deepEqual(errors, []);
    evidence.status = "PASS";
    evidence.pageErrors = errors;
    evidence.security =
      "PASS same-org user isolation; foreign personal tenant denied; context return restored";
    console.log(
      "PASS progress/gamification UX: real API/DB, metrics, badges, history, mobile/desktop, keyboard, refresh, organization/personal separation",
    );
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = String(error);
    if (page) {
      evidence.dom = await page.locator("body").innerText();
      await page.screenshot({ path: DIR + "/failure.png", fullPage: true });
    }
    throw error;
  } finally {
    await browser?.close();
    try {
      await cleanup();
      assert.deepEqual(await databaseBaseline(), baseline);
      evidence.protectedDataAndOrphans = { status: "PASS unchanged", baseline };
    } finally {
      await writeFile(DIR + "/evidence.json", JSON.stringify(evidence, null, 2));
      await prisma.$disconnect();
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
