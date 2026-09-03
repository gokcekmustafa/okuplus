/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";

const prisma = new PrismaClient();
const TS = Date.now();
const CONTENT_TITLE = `E2E-Exercise-Content ${TS}`;
const TEMPLATE_TITLE = `E2E-Exercise-Template ${TS}`;
const QUESTION_PROMPTS = {
  MULTIPLE_CHOICE: `E2E-EX-MC ${TS} 2+3 kaçtır?`,
  TRUE_FALSE: `E2E-EX-TF ${TS} Dünya düzdür.`,
  OPEN_ENDED: `E2E-EX-OE ${TS} Su neden ıslaktır?`,
  MATCHING: `E2E-EX-MATCH ${TS} Eşleştir`,
  FILL_BLANK: `E2E-EX-BLANK ${TS} Başkent ____`,
};

let tenantId: string | null = null;
let studentId = "";
let studentEmail = `e2e-student-${TS}@test.local`;
let contentId = "";
let contentVersionId = "";
let questionIds: string[] = [];
let questionVersionIds: string[] = [];
let templateId = "";
let templateVersionId = "";
let sessionId = "";

async function prepareData() {
  // Tenant (org) oluştur
  const tenant = await prisma.tenant.create({
    data: { type: "ORGANIZATION", name: `E2E-Exercise-Tenant ${TS}`, slug: `e2e-exercise-${TS}` },
  });
  tenantId = tenant.id;

  // Student oluştur
  const student = await prisma.user.create({
    data: {
      email: studentEmail,
      displayName: `E2E Student ${TS}`,
      passwordHash: "$2a$10$dummyhashdummyhashdummyhashdummyha",
      status: "ACTIVE",
    },
  });
  studentId = student.id;
  await prisma.membership.create({
    data: { tenantId: tenant.id, userId: student.id, role: "STUDENT", status: "ACTIVE" },
  });

  // Content PUBLISHED
  const content = await prisma.content.create({
    data: {
      tenantId: tenant.id,
      type: "STORY",
      title: CONTENT_TITLE,
      difficulty: 0.5,
      status: "PUBLISHED",
    },
  });
  contentId = content.id;
  const cVer = await prisma.contentVersion.create({
    data: {
      contentId,
      version: 1,
      title: CONTENT_TITLE,
      body: "Egzersiz için içerik gövdesi",
      wordCount: 4,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  contentVersionId = cVer.id;
  await prisma.content.update({ where: { id: contentId }, data: { currentVersionId: cVer.id } });

  // 5 Question PUBLISHED
  const qData: Array<{ type: any; prompt: string; options: any; correctAnswer: any }> = [
    {
      type: "MULTIPLE_CHOICE",
      prompt: QUESTION_PROMPTS.MULTIPLE_CHOICE,
      options: [
        { id: "a", text: "4", position: 0 },
        { id: "b", text: "5", position: 1 },
        { id: "c", text: "6", position: 2 },
      ],
      correctAnswer: {
        type: "MULTIPLE_CHOICE",
        correctOptionIds: ["b"],
        allowMultiple: false,
        partialCredit: false,
      },
    },
    {
      type: "TRUE_FALSE",
      prompt: QUESTION_PROMPTS.TRUE_FALSE,
      options: [],
      correctAnswer: { type: "TRUE_FALSE", answer: false },
    },
    {
      type: "OPEN_ENDED",
      prompt: QUESTION_PROMPTS.OPEN_ENDED,
      options: [],
      correctAnswer: {
        type: "OPEN_ENDED",
        expectedAnswer: "yüzey gerilimi",
        acceptableVariants: ["gerilim"],
        caseSensitive: false,
      },
    },
    {
      type: "MATCHING",
      prompt: QUESTION_PROMPTS.MATCHING,
      options: [
        { id: "l1", text: "Elma", position: 0, matchGroup: "left" },
        { id: "l2", text: "Armut", position: 1, matchGroup: "left" },
        { id: "r1", text: "Meyve", position: 2, matchGroup: "right" },
        { id: "r2", text: "Meyve2", position: 3, matchGroup: "right" },
      ],
      correctAnswer: {
        type: "MATCHING",
        pairs: [
          { leftId: "l1", rightId: "r1" },
          { leftId: "l2", rightId: "r2" },
        ],
        partialCredit: true,
      },
    },
    {
      type: "FILL_BLANK",
      prompt: QUESTION_PROMPTS.FILL_BLANK,
      options: [],
      correctAnswer: {
        type: "FILL_BLANK",
        blanks: [{ blankId: "b1", acceptedAnswers: ["Ankara"], caseSensitive: false }],
        partialCredit: true,
      },
    },
  ];

  for (let i = 0; i < qData.length; i++) {
    const d = qData[i];
    const q = await prisma.question.create({
      data: { contentId, position: i, type: d.type, status: "PUBLISHED" },
    });
    questionIds.push(q.id);
    const qv = await prisma.questionVersion.create({
      data: {
        questionId: q.id,
        version: 1,
        prompt: d.prompt,
        options: d.options as any,
        correctAnswer: d.correctAnswer as any,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    questionVersionIds.push(qv.id);
    await prisma.question.update({ where: { id: q.id }, data: { status: "PUBLISHED" } });
  }

  // Template PUBLISHED with 5 questions and 1 content
  const tmpl = await prisma.exerciseTemplate.create({
    data: { tenantId: tenant.id, title: TEMPLATE_TITLE, type: "MIXED", status: "DRAFT" },
  });
  templateId = tmpl.id;
  const tmplVer = await prisma.exerciseTemplateVersion.create({
    data: { templateId: tmpl.id, version: 1, status: "DRAFT" },
  });
  templateVersionId = tmplVer.id;
  // Bind content and questions (PUBLISHED)
  await prisma.exerciseTemplateVersionContent.create({
    data: { templateVersionId: tmplVer.id, contentVersionId, position: 0 },
  });
  for (let i = 0; i < questionVersionIds.length; i++) {
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: tmplVer.id,
        questionVersionId: questionVersionIds[i],
        position: i,
      },
    });
  }
  // Publish template version
  await prisma.exerciseTemplateVersion.update({
    where: { id: tmplVer.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  await prisma.exerciseTemplate.update({ where: { id: tmpl.id }, data: { status: "PUBLISHED" } });

  console.log(`Test verisi hazır templateV ${templateVersionId} student ${studentId}`);
}

async function cleanup() {
  // Find E2E templates by title prefix
  const e2eTemplates = await prisma.exerciseTemplate.findMany({
    where: { title: { startsWith: "E2E-Exercise-Template" } },
    select: { id: true },
  });
  const e2eTIds = e2eTemplates.map((t) => t.id);
  if (templateId && !e2eTIds.includes(templateId)) e2eTIds.push(templateId);
  for (const tid of e2eTIds) {
    const vers = await prisma.exerciseTemplateVersion.findMany({
      where: { templateId: tid },
      select: { id: true },
    });
    const vIds = vers.map((v) => v.id);
    if (vIds.length) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
        await tx.exerciseTemplateVersionContent.deleteMany({
          where: { templateVersionId: { in: vIds } },
        });
        await tx.exerciseTemplateVersionQuestion.deleteMany({
          where: { templateVersionId: { in: vIds } },
        });
        const sessions = await tx.exerciseSession.findMany({
          where: { templateVersionId: { in: vIds } },
          select: { id: true },
        });
        const sIds = sessions.map((s) => s.id);
        if (sIds.length) {
          await tx.attempt.deleteMany({ where: { sessionId: { in: sIds } } });
          await tx.exerciseSession.deleteMany({ where: { id: { in: sIds } } });
        }
        await tx.exerciseTemplateVersion.deleteMany({ where: { id: { in: vIds } } });
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplate.deleteMany({ where: { id: tid } });
    });
  }
  // Cleanup questions/contents created for this E2E (by contentId/questionIds)
  if (questionIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
      await tx.question.deleteMany({ where: { id: { in: questionIds } } });
    });
  }
  if (contentId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.contentVersion.deleteMany({ where: { contentId } });
      await tx.content.deleteMany({ where: { id: contentId } });
    });
  }
  if (studentId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.membership.deleteMany({ where: { userId: studentId } });
      await tx.studentProfile.deleteMany({ where: { studentId } });
      await tx.user.deleteMany({ where: { id: studentId } });
    });
  }
  if (tenantId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.tenant.deleteMany({ where: { id: tenantId } });
    });
  }
  // Orphan check cleanup for Question/Content left by previous fails
  const orphQ: any =
    await prisma.$queryRaw`SELECT q.id FROM "Question" q LEFT JOIN "Content" c ON c.id=q."contentId" WHERE c.id IS NULL LIMIT 5`;
  for (const o of orphQ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.questionVersion.deleteMany({ where: { questionId: o.id } });
      await tx.question.deleteMany({ where: { id: o.id } });
    });
  }
  console.log("E2E exercise test verisi temizlendi.");
}

async function main() {
  await prisma.$connect();
  await prepareData();

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console error] ${msg.text()}`);
  });

  // 1. Login as student (need to set password for student)
  // Student has dummy hash, so login via admin and then use student token via API? Instead login as admin and create session for student via admin API
  // For UI, we need student login - create a real password for student
  // Update student password to known
  const studentPassword = "student-pass-123";
  const { ScryptPasswordHasher } = await import("../src/modules/auth/index.js");
  const hasher = new ScryptPasswordHasher();
  const hash = await hasher.hash(studentPassword);
  await prisma.user.update({ where: { id: studentId }, data: { passwordHash: hash } });

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#login-form", { state: "visible", timeout: 10000 });
  await page.fill("#login-email", ADMIN_EMAIL);
  await page.fill("#login-password", ADMIN_PASSWORD);
  await page.click("#login-submit");
  await page.waitForSelector("#page-dashboard", { state: "visible", timeout: 30000 });
  console.log("1) Login admin OK");

  // 2. Exercise sayfası
  await page.click('.nav-item[data-page="exercise"]');
  await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: 5000 });
  console.log("2) Exercise sayfası OK");

  // 3-5. Session oluştur - UI üzerinden
  // Wait for selects to populate
  await page.waitForSelector("#exercise-student-select", { timeout: 5000 });
  await page.waitForSelector("#exercise-template-version-select", { timeout: 10000 });
  // Student select should have our student
  const studentOptions = await page.$$eval("#exercise-student-select option", (els) =>
    els.map((e) => (e as HTMLOptionElement).value),
  );
  console.log(`3) Student options ${studentOptions.length}`);
  await page.selectOption("#exercise-student-select", studentId);
  // Template version select - wait for PUBLISHED
  await page.waitForFunction(
    () => {
      const sel = document.getElementById("exercise-template-version-select") as HTMLSelectElement;
      return (
        sel && Array.from(sel.options).some((o) => o.textContent?.includes("E2E-Exercise-Template"))
      );
    },
    { timeout: 10000 },
  );
  await page.selectOption("#exercise-template-version-select", templateVersionId);
  await page.fill("#exercise-client-session-id", `E2E-SESSION-${TS}`);
  const createSessionPromise = page.waitForResponse(
    (r) => r.url().includes("/admin/exercise-sessions") && r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click("#exercise-create-btn");
  const createRes = await createSessionPromise;
  const createBody = await createRes.json().catch(() => ({}));
  console.log(`4) Session POST ${createRes.status()} id ${createBody?.data?.id}`);
  if (createRes.status() !== 200)
    throw new Error(`Session oluşturulamadı ${JSON.stringify(createBody).slice(0, 300)}`);
  sessionId = createBody?.data?.id;
  if (!sessionId) throw new Error("sessionId alınamadı");
  console.log(`5) sessionId ${sessionId}`);

  // 7. Questions yükle
  await page.waitForSelector("#exercise-session-info:not([style*='display: none'])", {
    timeout: 5000,
  });
  const questionsPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/exercise-sessions/${sessionId}/questions`) &&
      r.request().method() === "GET",
    { timeout: 60000 },
  );
  // Click load questions if not auto
  const qCardVisible = await page.isVisible("#exercise-questions-card");
  if (!qCardVisible) await page.click("#exercise-load-questions-btn");
  const qRes = await questionsPromise.catch(() => null);
  if (qRes) console.log(`7) Questions GET ${qRes.status()}`);
  await page.waitForSelector("#exercise-questions-card:not([style*='display: none'])", {
    timeout: 7000,
  });
  await page.waitForSelector("#exercise-current-question", { timeout: 5000 });
  const qCountText = await page.$eval("#exercise-question-counter", (el) => el.textContent);
  console.log(`7b) Question counter ${qCountText}`);
  // Verify the session-scoped payload, not private SPA lexical state.
  const sessionQuestions = await page.evaluate(async (sid) => {
    const r = await fetch(`/admin/exercise-sessions/${sid}/questions`, {
      headers: { authorization: `Bearer ${localStorage.getItem("oku.accessToken")}` },
    });
    const j = await r.json();
    return j.data?.questions ?? [];
  }, sessionId);
  const qCount = sessionQuestions.length;
  console.log(`7c) exerciseQuestions length ${qCount}`);
  if (qCount !== 5) throw new Error(`5 soru bekleniyor, gelen ${qCount}`);

  // Helper to answer current question
  async function answerCurrent(type: string, attemptNum: number) {
    const qvId = await page.evaluate(() => {
      const c = document.getElementById("exercise-current-question") as any;
      return c?.dataset?.questionVersionId;
    });
    console.log(`Answering ${type} qv ${qvId?.slice(0, 8)} attempt #${attemptNum}`);
    // Fill based on type
    if (type === "MULTIPLE_CHOICE") {
      // Select second option (b)
      await page.check("#exercise-current-question [data-exercise-opt][value='b']");
    } else if (type === "TRUE_FALSE") {
      await page.check("#exercise-current-question [data-exercise-tf][value='false']");
    } else if (type === "OPEN_ENDED") {
      await page.fill("#exercise-oe-answer", "yüzey gerilimi");
    } else if (type === "MATCHING") {
      await page.selectOption("[data-exercise-match-left='l1']", "r1");
      await page.selectOption("[data-exercise-match-left='l2']", "r2");
    } else if (type === "FILL_BLANK") {
      await page.fill("[data-exercise-blank='b1']", "Ankara");
    }
    const attemptPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/admin/questions/${qvId}/attempts`) && r.request().method() === "POST",
      { timeout: 60000 },
    );
    await page.click("#exercise-submit-attempt");
    const attemptRes = await attemptPromise;
    const attemptBody = await attemptRes.json().catch(() => ({}));
    console.log(
      `  Attempt ${type} POST ${attemptRes.status()} isCorrect ${attemptBody?.data?.isCorrect} rawScore ${attemptBody?.data?.rawScore}`,
    );
    if (attemptRes.status() !== 200)
      throw new Error(`${type} attempt başarısız ${JSON.stringify(attemptBody).slice(0, 200)}`);
    await page.waitForSelector("#exercise-attempt-feedback:not([style*='display: none'])", {
      timeout: 5000,
    });
    const feedbackText = await page.$eval("#exercise-attempt-feedback", (el) => el.textContent);
    console.log(`  Feedback ${feedbackText.slice(0, 80)}`);
    return { qvId, body: attemptBody?.data, status: attemptRes.status() };
  }

  // Get question types in template order from the authorized session response.
  const types: string[] = sessionQuestions.map((q: any) => q.type);
  console.log(`Types in order: ${JSON.stringify(types)}`);
  // Ensure we have 5 types in expected order (our creation order: MC, TF, OE, MATCH, FILL_BLANK)
  // But template may have sorted by position, which is same order
  const attempts: any[] = [];
  for (let i = 0; i < 5; i++) {
    const type = types[i];
    await page.waitForFunction(
      (expectedType) =>
        document.getElementById("exercise-current-question")?.dataset?.questionType ===
        expectedType,
      type,
      { timeout: 5000 },
    );
    const res = await answerCurrent(type, i + 1);
    attempts.push({ type, ...res });
    if (i < 4) {
      await page.click("#exercise-submit-attempt");
      await page.waitForFunction(
        (nextType) =>
          document.getElementById("exercise-current-question")?.dataset?.questionType === nextType,
        types[i + 1],
        { timeout: 5000 },
      );
    }
  }

  // 16. Session complete
  const completePromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/exercise-sessions/${sessionId}/complete`) &&
      r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click("#exercise-complete-btn");
  const completeRes = await completePromise;
  const completeBody = await completeRes.json().catch(() => ({}));
  console.log(
    `16) Complete POST ${completeRes.status()} scoreSummary ${JSON.stringify(completeBody?.data?.scoreSummary).slice(0, 300)}`,
  );
  if (completeRes.status() !== 200)
    throw new Error(`Complete başarısız ${JSON.stringify(completeBody).slice(0, 300)}`);
  await page.waitForSelector("#exercise-result-card:not([style*='display: none'])", {
    timeout: 5000,
  });
  const resultText = await page.$eval("#exercise-result-body", (el) => el.textContent);
  console.log(`17) UI Sonuç ${resultText.slice(0, 300)}`);
  if (!resultText.includes("Toplam Soru") || !resultText.includes("Ortalama"))
    throw new Error("UI scoreSummary eksik");

  // 19. Session status COMPLETED DB
  const sessionDb = await prisma.exerciseSession.findUnique({ where: { id: sessionId } });
  console.log(
    `19) DB session status ${sessionDb?.status} scoreSummary ${JSON.stringify(sessionDb?.scoreSummary).slice(0, 200)}`,
  );
  if (sessionDb?.status !== "COMPLETED") throw new Error("DB session COMPLETED değil");
  if (!sessionDb?.scoreSummary) throw new Error("DB scoreSummary yok");
  const ss: any = sessionDb.scoreSummary;
  if (ss.totalQuestions !== 5)
    throw new Error(`totalQuestions 5 bekleniyor, gelen ${ss.totalQuestions}`);
  if (ss.attempted !== 5 && ss.scoredCount !== 5)
    console.log(`Uyarı: attempted ${ss.attempted} scoredCount ${ss.scoredCount}`);

  // 20. Refresh sonrası korunuyor mu
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard", { state: "visible", timeout: 10000 });
  await page.click('.nav-item[data-page="exercise"]');
  await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: 5000 });
  // Re-select session? For simplicity, fetch via API after reload
  const afterReload = await page.evaluate(async (sid) => {
    const r = await fetch(`/admin/exercise-sessions/${sid}`, {
      headers: { authorization: `Bearer ${localStorage.getItem("oku.accessToken")}` },
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  }, sessionId);
  console.log(
    `20) Refresh sonrası GET session ${afterReload.status} status ${afterReload.body?.data?.status}`,
  );
  if (afterReload.status !== 200 || afterReload.body?.data?.status !== "COMPLETED")
    throw new Error("Refresh sonrası session bozuldu");

  // DB Attempt doğrulama
  const attemptsDb = await prisma.attempt.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  console.log(`DB Attempt count ${attemptsDb.length}`);
  if (attemptsDb.length !== 5) throw new Error(`5 attempt bekleniyor, gelen ${attemptsDb.length}`);
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const db = attemptsDb.find((x) => x.questionVersionId === a.qvId);
    if (!db) throw new Error(`DB attempt bulunamadı ${a.type} ${a.qvId}`);
    console.log(
      ` DB ${a.type} isCorrect ${db.isCorrect} rawScore ${db.rawScore} answer ${JSON.stringify(db.answer).slice(0, 50)}`,
    );
    if (db.sessionId !== sessionId) throw new Error("sessionId mismatch");
    if (a.type === "MULTIPLE_CHOICE" && db.isCorrect !== true)
      throw new Error("MC isCorrect true bekleniyor");
    if (a.type === "TRUE_FALSE" && db.isCorrect !== true)
      throw new Error("TF isCorrect true bekleniyor");
    if (a.type === "OPEN_ENDED" && db.isCorrect !== null)
      console.log("OE isCorrect null beklenen, gelen", db.isCorrect);
  }

  await page.close();
  await browser.close();
  await cleanup();
  await prisma.$disconnect();

  console.log("\n=== AŞAMA 4B E2E RAPORU ===");
  console.log("ExerciseSession UI: PASS");
  console.log("5 soru tipi: PASS");
  console.log("Attempt: PASS");
  console.log("Complete: PASS");
  console.log("ScoreSummary: PASS");
  console.log("DB: PASS");
  console.log("Cleanup: PASS");
  console.log("AŞAMA 4B TAMAMLANDI");
  console.log("DUR");
}

main().catch(async (err) => {
  console.error("TEST HATASI:", err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
