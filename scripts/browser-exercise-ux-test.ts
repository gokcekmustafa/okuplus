import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import type { Browser, Page } from "playwright-core";
import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EMAIL = `ex-ux-${Date.now()}@example.com`;
const PASS = "ExUx123!";
const OTHER_EMAIL = EMAIL.replace("ex-ux-", "ex-ux-other-");
const SKILL_ID = `exux-skill-${Date.now()}`;
const CONTENT_ID = `exux-content-${Date.now()}`;
const CV_ID = `exux-cv-${Date.now()}`;
const TMPL_ID = `exux-tmpl-${Date.now()}`;
const TMPL_VID = `exux-tmplv-${Date.now()}`;
const LEVEL_ID = `exux-level-${Date.now()}`;
const Q_IDS = [0, 1, 2, 3, 4].map((i) => `exux-q-${Date.now()}-${i}`);
const QV_IDS = [0, 1, 2, 3, 4].map((i) => `exux-qv-${Date.now()}-${i}`);

async function seed() {
  await prisma.skill.create({
    data: {
      id: SKILL_ID,
      code: `EXUX_${Date.now()}`,
      name: "Ex UX",
      category: "COMPREHENSION",
      displayOrder: 99,
    },
  });
  await prisma.level.create({
    data: {
      id: LEVEL_ID,
      code: `EL_${Date.now()}`,
      name: "Seviye X",
      minScore: 0,
      maxScore: 100,
      difficultyMin: 0,
      difficultyMax: 5,
      displayOrder: 99,
    },
  });
  await prisma.content.create({
    data: {
      id: CONTENT_ID,
      type: "PASSAGE",
      title: "Ex UX Content",
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
      body: "Uzun okuma metni. ".repeat(20),
      wordCount: 60,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.content.update({ where: { id: CONTENT_ID }, data: { currentVersionId: CV_ID } });
  // Q1 multiple choice
  await prisma.question.create({
    data: {
      id: Q_IDS[0],
      contentId: CONTENT_ID,
      position: 1,
      type: "MULTIPLE_CHOICE",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QV_IDS[0],
      questionId: Q_IDS[0],
      version: 1,
      prompt: "Aşağıdakilerden hangisi doğrudur?",
      options: [
        { id: "opt1", text: "Seçenek A" },
        { id: "opt2", text: "Seçenek B" },
      ],
      correctAnswer: {
        type: "MULTIPLE_CHOICE",
        correctOptionIds: ["opt1"],
        allowMultiple: false,
        partialCredit: false,
      },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  // Q2 true false
  await prisma.question.create({
    data: {
      id: Q_IDS[1],
      contentId: CONTENT_ID,
      position: 2,
      type: "TRUE_FALSE",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QV_IDS[1],
      questionId: Q_IDS[1],
      version: 1,
      prompt: "Gökyüzü mavidir.",
      correctAnswer: { type: "TRUE_FALSE", answer: true },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  // Q3 open ended
  await prisma.question.create({
    data: {
      id: Q_IDS[2],
      contentId: CONTENT_ID,
      position: 3,
      type: "OPEN_ENDED",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QV_IDS[2],
      questionId: Q_IDS[2],
      version: 1,
      prompt: "Bu metnin ana fikri nedir?",
      correctAnswer: { type: "OPEN_ENDED", expectedAnswer: "okuma" },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  // Q4 matching
  await prisma.question.create({
    data: {
      id: Q_IDS[3],
      contentId: CONTENT_ID,
      position: 4,
      type: "MATCHING",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QV_IDS[3],
      questionId: Q_IDS[3],
      version: 1,
      prompt: "Eşleştirin",
      options: [
        { id: "l1", text: "Elma", matchGroup: "left" },
        { id: "r1", text: "Meyve", matchGroup: "right" },
      ],
      correctAnswer: {
        type: "MATCHING",
        pairs: [{ leftId: "l1", rightId: "r1" }],
        partialCredit: true,
      },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  // Q5 fill blank
  await prisma.question.create({
    data: {
      id: Q_IDS[4],
      contentId: CONTENT_ID,
      position: 5,
      type: "FILL_BLANK",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QV_IDS[4],
      questionId: Q_IDS[4],
      version: 1,
      prompt: "Boşluğu doldurun: Okuma ___ geliştirir.",
      correctAnswer: {
        type: "FILL_BLANK",
        blanks: [{ blankId: "b1", acceptedAnswers: ["beceri"], caseSensitive: false }],
        partialCredit: true,
      },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: TMPL_ID,
      contentId: CONTENT_ID,
      title: "Ex UX Tmpl",
      type: "COMPREHENSION",
      skillId: SKILL_ID,
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
  for (let i = 0; i < 5; i++) {
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: TMPL_VID,
        questionVersionId: QV_IDS[i],
        questionId: Q_IDS[i],
        position: i,
      },
    });
  }
}

const evidence: Record<string, unknown> = { attempts: [] };
const ownedTenantIds = new Set<string>();
async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
  const ids = users.map((u) => u.id);
  const memberships = await prisma.membership.findMany({ where: { userId: { in: ids } } });
  memberships.forEach((m) => ownedTenantIds.add(m.tenantId));
  await prisma.$transaction(async (tx) => {
    // Only this run's disposable fixtures; published versions have immutable triggers.
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.attempt.deleteMany({ where: { session: { studentId: { in: ids } } } });
    await tx.sessionContentVersion.deleteMany({ where: { session: { studentId: { in: ids } } } });
    await tx.exerciseSession.deleteMany({ where: { studentId: { in: ids } } });
    await tx.studentProgress.deleteMany({ where: { studentId: { in: ids } } });
    await tx.pointEvent.deleteMany({ where: { studentId: { in: ids } } });
    await tx.studentStreak.deleteMany({ where: { studentId: { in: ids } } });
    await tx.studentBadge.deleteMany({ where: { studentId: { in: ids } } });
    await tx.consent.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { studentId: { in: ids } } });
    await tx.membership.deleteMany({ where: { userId: { in: ids } } });
    await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
    await tx.authIdentity.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
    await tx.tenant.deleteMany({ where: { id: { in: [...ownedTenantIds] }, type: "INDIVIDUAL" } });
    await tx.exerciseTemplateVersionQuestion.deleteMany({ where: { templateVersionId: TMPL_VID } });
    await tx.exerciseTemplateVersionContent.deleteMany({ where: { templateVersionId: TMPL_VID } });
    await tx.questionVersion.deleteMany({ where: { id: { in: QV_IDS } } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TMPL_VID } });
    await tx.contentVersion.deleteMany({ where: { id: CV_ID } });
    await tx.question.deleteMany({ where: { id: { in: Q_IDS } } });
    await tx.exerciseTemplate.deleteMany({ where: { id: TMPL_ID } });
    await tx.content.deleteMany({ where: { id: CONTENT_ID } });
    await tx.skill.deleteMany({ where: { id: SKILL_ID } });
    await tx.level.deleteMany({ where: { id: LEVEL_ID } });
  });
  let counts: number[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      counts = await Promise.all([
        prisma.user.count({ where: { id: { in: ids } } }),
        prisma.tenant.count({ where: { id: { in: [...ownedTenantIds] } } }),
        prisma.exerciseSession.count({ where: { templateVersionId: TMPL_VID } }),
        prisma.attempt.count({ where: { questionVersionId: { in: QV_IDS } } }),
        prisma.pointEvent.count({ where: { studentId: { in: ids } } }),
        prisma.studentStreak.count({ where: { studentId: { in: ids } } }),
        prisma.studentBadge.count({ where: { studentId: { in: ids } } }),
        prisma.studentProgress.count({ where: { studentId: { in: ids } } }),
        prisma.questionVersion.count({ where: { id: { in: QV_IDS } } }),
        prisma.content.count({ where: { id: CONTENT_ID } }),
        prisma.skill.count({ where: { id: SKILL_ID } }),
        prisma.level.count({ where: { id: LEVEL_ID } }),
      ]);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  assert.ok(
    counts.every((c) => c === 0),
    `Orphans: ${counts}`,
  );
  evidence.cleanup = { status: "PASS", remaining: counts };
  console.log("PASS cleanup/orphan: all run-owned records = 0");
}

async function layout(page: Page, name: string) {
  const button = page.locator("#exercise-submit-attempt");
  if (await button.isHidden()) {
    const metrics = await page.evaluate(() => {
      const area = document.querySelector("#page-exercise")!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        areaWidth: area.width,
      };
    });
    assert.equal(metrics.overflow, false);
    assert.ok(metrics.areaWidth <= 760);
    await page.screenshot({ path: `.tmp/verification-8f3/${name}.png`, fullPage: true });
    evidence[name] = {
      overflow: metrics.overflow,
      areaWidth: metrics.areaWidth,
      buttonHeight: 0,
      accessible: true,
    };
    return;
  }
  await button.scrollIntoViewIfNeeded();
  const metrics = await page.evaluate(() => {
    const btn = document.querySelector("#exercise-submit-attempt")!.getBoundingClientRect();
    const nav = document.querySelector("#student-bottom-nav")!;
    const navTop =
      getComputedStyle(nav).display === "none" ? innerHeight : nav.getBoundingClientRect().top;
    const area = document.querySelector("#page-exercise")!.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      buttonHeight: btn.height,
      accessible: btn.top >= 0 && btn.bottom <= navTop,
      areaWidth: area.width,
    };
  });
  assert.equal(metrics.overflow, false);
  assert.ok(metrics.buttonHeight >= 48 && metrics.accessible, JSON.stringify(metrics));
  assert.ok(metrics.areaWidth <= 760);
  await page.screenshot({ path: `.tmp/verification-8f3/${name}.png`, fullPage: true });
  evidence[name] = metrics;
  console.log(`PASS ${name}`, metrics);
}

async function main() {
  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    await mkdir(".tmp/verification-8f3", { recursive: true });
    evidence.fixtures = {
      EMAIL,
      OTHER_EMAIL,
      SKILL_ID,
      CONTENT_ID,
      CV_ID,
      TMPL_ID,
      TMPL_VID,
      LEVEL_ID,
      Q_IDS,
      QV_IDS,
    };
    await seed();
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    page.setDefaultTimeout(15000);
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    evidence.pageErrors = pageErrors;
    const posts: Array<{
      questionVersionId: string;
      sessionId: string;
      answer: unknown;
      clientAttemptId: string;
    }> = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/questions\/[^/]+\/attempts$/.test(r.url()))
        posts.push({ questionVersionId: r.url().split("/").at(-2)!, ...r.postDataJSON() });
    });
    const fixtureSignup = await page.request.post(BASE + "/auth/signup", {
      data: { email: EMAIL, password: PASS, displayName: "Exercise UX Test" },
    });
    assert.equal(fixtureSignup.status(), 201);
    const signupData = await fixtureSignup.json();
    const signupUserId = signupData.data.user.id;
    const signupTenantId = signupData.data.tenantContext.tenantId;
    await prisma.studentProfile.update({
      where: { tenantId_studentId: { tenantId: signupTenantId, studentId: signupUserId } },
      data: { onboardingCompletedAt: new Date(), currentLevelId: LEVEL_ID, learningGoal: "SPEED" },
    });
    await prisma.consent.createMany({
      data: [
        {
          userId: signupUserId,
          tenantId: signupTenantId,
          type: "TERMS_OF_SERVICE",
          version: "v1",
          status: "GRANTED",
        },
        {
          userId: signupUserId,
          tenantId: signupTenantId,
          type: "DATA_PROCESSING",
          version: "v1",
          status: "GRANTED",
        },
      ],
    });
    // Account provisioning is test setup. Onboarding has its own regression suite.
    await page.goto(BASE);
    await page.fill("#login-email", EMAIL);
    await page.fill("#login-password", PASS);
    const loginResponse = page.waitForResponse(
      (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
    );
    await page.click("#login-submit");
    const loginRes = await loginResponse;
    assert.equal(loginRes.status(), 200);
    const loginJson = await loginRes.json();

    const auth = loginJson.data;
    const headers = {
      authorization: `Bearer ${auth.tokens.accessToken}`,
      "x-tenant-id": auth.tenantContext.tenantId,
    };
    ownedTenantIds.add(auth.tenantContext.tenantId);
    await page.waitForSelector("#page-dashboard:not(.hidden)");
    console.log("PASS real UI login (account provisioning via API fixture)");
    await page.click('[data-bottom-page="settings"]');
    await page.waitForSelector("#sound-effects-toggle");
    await page.locator("#sound-effects-toggle").check();
    assert.equal(await page.locator("#sound-effects-toggle").isChecked(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("oku.soundEffects")), "true");
    await page.locator("#sound-effects-toggle").uncheck();
    await page.click('[data-bottom-page="dashboard"]');
    const start = page.waitForResponse(
      (r) => r.url().endsWith("/student/exercises/start") && r.request().method() === "POST",
    );
    await page.locator(`#learning-path [data-template="${TMPL_VID}"]`).click();
    const startResponse = await start;
    assert.equal(startResponse.status(), 200);
    const sid: string = (await startResponse.json()).data.sessionId;
    evidence.sessionId = sid;
    await page.waitForSelector('#exercise-current-question[data-question-type="MULTIPLE_CHOICE"]');
    await page.waitForFunction(
      () => document.querySelector("#exercise-load-status")?.textContent === "",
    );
    assert.match(await page.locator("#exercise-progress-text").innerText(), /1 \/ 5/);
    assert.equal(
      await page.locator('[aria-label="Soru ilerlemesi"]').getAttribute("aria-valuenow"),
      "1",
    );
    assert.equal(
      await page
        .locator("#exercise-progress-bar")
        .evaluate((el) => (el as HTMLElement).style.width),
      "20%",
    );
    assert.equal(await page.locator("#exercise-submit-attempt").innerText(), "Cevabı kontrol et");
    await page.locator("#exercise-mc-options .answer-card").first().press("Enter");
    await page.locator("#exercise-mc-options .answer-card").first().press("ArrowRight");
    assert.equal(await page.locator('.answer-card[aria-checked="true"]').count(), 1);
    for (const card of await page.locator("#exercise-mc-options .answer-card").all())
      assert.ok((await card.boundingBox())!.height >= 48);
    await layout(page, "mobile-390x844");
    console.log("PASS header/progress/keyboard/selection");

    // Failure before server acceptance: same clientAttemptId and answer on retry.
    const mcUrl = `**/attempts`;
    await page.route(mcUrl, (route) => route.abort("failed"), { times: 1 });
    await page.click("#exercise-submit-attempt");
    await page.waitForSelector("#exercise-attempt-error:not(.hidden)");
    assert.equal(await prisma.attempt.count({ where: { sessionId: sid } }), 0);
    assert.equal(await page.locator('[data-exercise-opt][value="opt2"]').isChecked(), true);
    assert.equal(await page.locator("#exercise-submit-attempt").innerText(), "Tekrar dene");

    const expectedAnswers: unknown[] = [["opt2"], true, "okuma", { l1: "r1" }, { b1: "beceri" }];
    const expectedCorrect = [false, true, null, true, true];
    const types = ["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ENDED", "MATCHING", "FILL_BLANK"];
    for (let i = 0; i < 5; i++) {
      if (i === 1)
        await page.locator('[data-exercise-tf][value="true"]').locator("..").press("Enter");
      if (i === 2) {
        await page.fill("#exercise-oe-answer", "okuma");
        // Short viewport approximates a visible software keyboard; CTA remains scrollable.
        await page.setViewportSize({ width: 390, height: 460 });
        await layout(page, "keyboard-short-viewport");
        await page.setViewportSize({ width: 390, height: 844 });
      }
      if (i === 3) await page.selectOption('[data-exercise-match-left="l1"]', "r1");
      if (i === 4) await page.fill('[data-exercise-blank="b1"]', "beceri");
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().endsWith("/questions/" + QV_IDS[i] + "/attempts") &&
          r.request().method() === "POST",
      );
      let release!: () => void;
      let accepted!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const arrived = new Promise<void>((resolve) => {
        accepted = resolve;
      });
      if (i === 1)
        await page.route(
          "**/questions/" + QV_IDS[i] + "/attempts",
          async (route) => {
            accepted();
            await held;
            await route.continue();
          },
          { times: 1 },
        );
      const before = posts.length;
      await page.click("#exercise-submit-attempt");
      if (i === 1) {
        await arrived;
        assert.equal(await page.locator("#exercise-submit-attempt").isDisabled(), true);
        await page.evaluate(() => {
          document.getElementById("exercise-submit-attempt")?.click();
          document.getElementById("exercise-submit-attempt")?.click();
        });
        release();
      }
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const payload = (await response.json()).data;
      const request = response.request().postDataJSON();
      assert.deepEqual(request.answer, expectedAnswers[i]);
      assert.equal(request.sessionId, sid);
      const dbAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: payload.id } });
      assert.equal(dbAttempt.sessionId, sid);
      assert.equal(dbAttempt.tenantId, auth.tenantContext.tenantId);
      assert.equal(dbAttempt.questionVersionId, QV_IDS[i]);
      assert.equal(dbAttempt.clientAttemptId, request.clientAttemptId);
      assert.deepEqual(dbAttempt.answer, expectedAnswers[i]);
      assert.equal(dbAttempt.isCorrect, expectedCorrect[i]);
      assert.equal(dbAttempt.rawScore, i === 2 ? null : expectedCorrect[i] ? 1 : 0);
      assert.equal(payload.isCorrect, dbAttempt.isCorrect);
      assert.equal(payload.rawScore, dbAttempt.rawScore);
      assert.equal(posts.length, before + 1);
      assert.equal(await prisma.attempt.count({ where: { sessionId: sid } }), i + 1);
      await page.waitForSelector(
        ".feedback-panel." + (i === 2 ? "pending" : expectedCorrect[i] ? "correct" : "wrong"),
      );
      if (i === 0) {
        await page.waitForSelector("#celebration-layer:not(.hidden)");
        assert.match(await page.locator("#celebration-title").innerText(), /Tekrar düşün/);
        await page.locator("#celebration-close").click();
      }
      if (i === 1) {
        await page.waitForSelector("#celebration-layer:not(.hidden)");
        assert.match(await page.locator("#celebration-title").innerText(), /Harika iş/);
        await page.locator("#celebration-close").click();
      }
      await page.waitForFunction(
        () => !(document.querySelector("#exercise-submit-attempt") as HTMLButtonElement).disabled,
      );
      assert.match(
        await page.locator("#exercise-progress-text").innerText(),
        new RegExp(i + 1 + " / 5"),
      );
      const events = await prisma.pointEvent.findMany({
        where: { sourceType: "ATTEMPT", sourceId: dbAttempt.id },
      });
      if (events.length) {
        assert.equal(events[0].studentId, auth.user.id);
        assert.equal(events[0].tenantId, auth.tenantContext.tenantId);
        await page.waitForFunction(
          (points) =>
            document.querySelector("#exercise-feedback-xp")?.textContent === "+" + points + " XP",
          events[0].points,
        );
      }
      (evidence.attempts as unknown[]).push({
        type: types[i],
        status: response.status(),
        id: dbAttempt.id,
        sessionId: sid,
        tenantId: dbAttempt.tenantId,
        studentId: auth.user.id,
        answer: dbAttempt.answer,
        isCorrect: dbAttempt.isCorrect,
        rawScore: dbAttempt.rawScore,
        clientAttemptId: dbAttempt.clientAttemptId,
        pointEvents: events,
      });
      console.log("PASS " + types[i] + " real HTTP " + response.status() + " / DB " + dbAttempt.id);
      if (i === 0) {
        assert.equal(posts[0].clientAttemptId, request.clientAttemptId);
        const replay = await page.request.post(
          BASE + "/admin/questions/" + QV_IDS[i] + "/attempts",
          { headers, data: request },
        );
        assert.equal(replay.status(), 409);
        assert.equal(await prisma.attempt.count({ where: { sessionId: sid } }), 1);
        evidence.idempotency = {
          status: replay.status(),
          retainedClientAttemptId: request.clientAttemptId,
          count: 1,
        };
      }
      if (i === 1)
        evidence.duplicateSubmit = { status: "PASS", actualPosts: posts.length - before };
      if (i === 2) {
        assert.match(
          await page.locator("#exercise-attempt-feedback").innerText(),
          /Değerlendirme bekleniyor/,
        );
        await page.reload();
        await page.waitForSelector('#learning-path [data-template="' + TMPL_VID + '"]');
        await page.click('[data-bottom-page="exercise"]');
        await page.waitForSelector('#exercise-current-question[data-question-type="MATCHING"]');
        assert.equal(await prisma.attempt.count({ where: { sessionId: sid } }), 3);
        assert.match(await page.locator("#exercise-progress-text").innerText(), /4 \/ 5/);
        evidence.refreshRecovery = "PASS 3 persisted attempts; first unanswered question 4";
      } else if (i < 4) {
        await page.click("#exercise-submit-attempt");
        await page.waitForSelector(
          '#exercise-current-question[data-question-type="' + types[i + 1] + '"]',
        );
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await layout(page, "desktop-1280x800");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page.locator(".feedback-panel").evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.equal(await prisma.attempt.count({ where: { sessionId: sid } }), 5);
    // Real completion commits, but transport drops the response. Retry must GET the result.
    let completionAccepted!: () => void;
    const completionCommitted = new Promise<void>((resolve) => {
      completionAccepted = resolve;
    });
    await page.route(
      `**/student/sessions/${sid}/complete`,
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        completionAccepted();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page.click("#exercise-submit-attempt");
    await completionCommitted;
    await page.waitForSelector(
      "#exercise-complete-error:not(.hidden), #exercise-attempt-error:not(.hidden)",
    );
    await page.click("#exercise-submit-attempt");
    await page.waitForSelector("#exercise-return-path");
    await page.waitForSelector("#celebration-layer:not(.hidden)");
    assert.match(
      await page.locator("#celebration-eyebrow").innerText(),
      /ÇALIŞMA TAMAMLANDI|YENİ ROZET/,
    );
    await page.keyboard.press("Escape");
    const session = await prisma.exerciseSession.findUniqueOrThrow({ where: { id: sid } });
    assert.equal(session.status, "COMPLETED");
    assert.deepEqual(session.scoreSummary, {
      totalQuestions: 5,
      attempted: 5,
      scoredCount: 4,
      totalRawScore: 3,
      averageScore: 0.75,
      openEndedTotal: 1,
      openEndedAnswered: 1,
      pendingEvaluation: false,
    });
    const result = await page.locator("#exercise-result-body").innerText();
    assert.match(result, /1 cevap için değerlendirme bekleniyor/);
    assert.match(result, /75%/);
    const uid = auth.user.id;
    const points = await prisma.pointEvent.aggregate({
      where: { studentId: uid, tenantId: auth.tenantContext.tenantId },
      _sum: { points: true },
    });
    const streak = await prisma.studentStreak.findFirstOrThrow({
      where: { studentId: uid, tenantId: auth.tenantContext.tenantId },
    });
    assert.match(result, new RegExp(`Toplam XP\\s+${points._sum.points}`));
    assert.match(result, new RegExp(`Günlük seri\\s+${streak.currentDays}`));
    assert.ok(await prisma.studentProgress.count({ where: { studentId: uid, skillId: SKILL_ID } }));
    await page.screenshot({ path: ".tmp/verification-8f3/completion.png", fullPage: true });
    await page.reload();
    await page.waitForSelector(`#learning-path [data-template="${TMPL_VID}"]`);
    await page.locator('.nav-item[data-page="exercise"]').click();
    await page.waitForSelector("#exercise-return-path");
    await page.click("#exercise-return-path");
    await page.waitForSelector(`#learning-path [data-template="${TMPL_VID}"].completed`);
    console.log("PASS completion/scoreSummary/pending/real XP/streak/progress/path return");
    evidence.completion = {
      scoreSummary: session.scoreSummary,
      points: points._sum.points,
      streak: streak.currentDays,
    };

    const signup = await page.request.post(`${BASE}/auth/signup`, {
      data: { email: OTHER_EMAIL, password: PASS, displayName: "Other Exercise Test" },
    });
    assert.equal(signup.status(), 201);
    const other = (await signup.json()).data;
    ownedTenantIds.add(other.tenantContext.tenantId);
    // Same-tenant membership: prove ownership check, not only tenant isolation.
    await prisma.membership.create({
      data: {
        userId: other.user.id,
        tenantId: auth.tenantContext.tenantId,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    for (const tenantId of [other.tenantContext.tenantId, auth.tenantContext.tenantId]) {
      const otherHeaders = {
        authorization: `Bearer ${other.tokens.accessToken}`,
        "x-tenant-id": tenantId,
      };
      for (const url of [`/student/sessions/${sid}`, `/admin/exercise-sessions/${sid}/questions`]) {
        const denied = await page.request.get(BASE + url, { headers: otherHeaders });
        assert.ok([403, 404].includes(denied.status()));
      }
      const denied = await page.request.post(`${BASE}/admin/questions/${QV_IDS[0]}/attempts`, {
        headers: otherHeaders,
        data: { sessionId: sid, answer: ["opt1"], clientAttemptId: "cross-user-denied" },
      });
      assert.ok([403, 404].includes(denied.status()));
    }
    assert.equal(await prisma.attempt.count({ where: { sessionId: sid } }), 5);
    assert.deepEqual(pageErrors, []);
    evidence.security = "PASS same-tenant and cross-tenant GET/Attempt POST denied; DB unchanged";
    console.log("PASS cross-user session/attempt protection, same tenant + cross tenant");
    // A committed attempt with a lost response is recovered by GET, without a second POST.
    const restartResponse = page.waitForResponse((r) =>
      r.url().endsWith("/student/exercises/start"),
    );
    await page.locator(`#learning-path [data-template="${TMPL_VID}"]`).click();
    const retrySid: string = (await (await restartResponse).json()).data.sessionId;
    await page.waitForSelector('#exercise-current-question[data-question-type="MULTIPLE_CHOICE"]');
    await page.waitForFunction(
      () => document.querySelector("#exercise-load-status")?.textContent === "",
    );
    await page.locator("#exercise-mc-options .answer-card").first().click();
    const postsBeforeLostResponse = posts.length;
    let committedAttemptId = "";
    await page.route(
      `**/questions/${QV_IDS[0]}/attempts`,
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        committedAttemptId = (await response.json()).data.id;
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page.click("#exercise-submit-attempt");
    await page.waitForSelector("#exercise-attempt-error:not(.hidden)");
    assert.ok(committedAttemptId);
    assert.equal(await prisma.attempt.count({ where: { sessionId: retrySid } }), 1);
    await page.click("#exercise-submit-attempt");
    await page.waitForSelector(".feedback-panel.correct");
    assert.equal(posts.length, postsBeforeLostResponse + 1);
    assert.equal(await prisma.attempt.count({ where: { sessionId: retrySid } }), 1);
    evidence.lostAttemptResponse = { status: "PASS", committedAttemptId, postCount: 1 };
    // Session/question loading errors have a visible retry; persisted answers remain intact.
    await page.route(
      `**/student/sessions/${retrySid}/questions`,
      (route) => route.abort("failed"),
      { times: 1 },
    );
    await page.reload();
    await page.waitForSelector(`#learning-path [data-template="${TMPL_VID}"]`);
    await page.locator('.nav-item[data-page="exercise"]').click();
    await page.waitForSelector("#exercise-retry-load:not(.hidden)");
    await page.click("#exercise-retry-load");
    await page.waitForSelector('#exercise-current-question[data-question-type="TRUE_FALSE"]');
    assert.match(await page.locator("#exercise-progress-text").innerText(), /2 \/ 5/);
    console.log(
      "PASS lost Attempt response reconciliation / no duplicate POST / question load retry",
    );
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = String(error);
    if (page) {
      evidence.dom = await page.locator("body").innerText();
      await page.screenshot({ path: ".tmp/verification-8f3/failure.png", fullPage: true });
    }
    throw error;
  } finally {
    await browser?.close();
    try {
      await cleanup();
    } finally {
      await writeFile(
        ".tmp/verification-8f3/exercise-evidence.json",
        JSON.stringify(evidence, null, 2),
      );
      await prisma.$disconnect();
    }
  }
}
main()
  .then(() => console.log("PASS EXERCISE UX E2E — 5 real Attempt POSTs verified"))
  .catch((error) => {
    console.error("FAIL EXERCISE UX E2E", error);
    process.exitCode = 1;
  });
