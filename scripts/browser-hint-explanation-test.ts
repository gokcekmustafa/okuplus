import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const STUDENT_PASSWORD = "HintExplainE2E123!";
const RUN = Date.now();
const PREFIX = `HINT-EXPLAIN-${RUN}`;

const prisma = new PrismaClient();
let browser: Browser | undefined;
let skillId = "";
let contentId = "";
let contentVersionId = "";
let templateId = "";
let templateVersionId = "";
let sessionId = "";
let studentUserId = "";
let studentTenantId = "";
let otherUserId = "";
let otherTenantId = "";
const questionIds: string[] = [];
const questionVersionIds: string[] = [];

const contentTitle = `${PREFIX} Sessiz Deneyin Günlüğü`;
const contentBody = `Bir okulun arka bahçesinde kullanılmayan küçük bir alan vardı. Öğrenciler bu alanı yalnızca teneffüslerde görüyor, fakat orada nelerin değiştiğini düzenli olarak bilmiyordu. Fen kulübü, bahçeyi daha yakından tanımak için dört haftalık sessiz bir deney planladı.

İlk hafta öğrenciler alanın farklı bölümlerini çizdi, günün hangi saatlerinde gölge oluştuğunu not etti ve toprağın ne kadar kuru göründüğünü kaydetti. Bu kayıtlarda tek bir doğru cevap aramadılar. Amaç, gözlemlerini aynı düzen içinde biriktirmekti.

İkinci haftadan sonra ekip, notları karşılaştırınca bazı bölümlerin sabahları aydınlık, öğleden sonraları ise gölgeli olduğunu fark etti. Bu küçük ayrıntı, okul bahçesindeki oturma yerlerinin nereye konabileceği konusunda yeni bir soru doğurdu. Öğrenciler hemen karar vermek yerine bir hafta daha gözlem yapmaya karar verdi.

Dördüncü haftanın sonunda ekip, çizimleri, saat notlarını ve arkadaşlarının önerilerini bir araya getirdi. Sonuç, bahçeyi tek seferde değiştiren büyük bir proje değildi. Daha dikkatli bakmayı, kanıtları düzenlemeyi ve karar vermeden önce farklı gözlemleri karşılaştırmayı öğrenmişlerdi.

Bu deneyin asıl değeri, küçük bir soruyu sabırla incelemesiydi. Bir alanı iyileştirmek isteyenler için iyi başlangıç; önce bakmak, sonra kaydetmek ve eldeki kanıtı başkalarının fikirleriyle birlikte değerlendirmektir.

Bu yöntem, öğrencilerin yalnızca sonuca değil, sonuca götüren sürece de dikkat etmesini sağladı. Her kayıt yeni bir soru üretebilir; önemli olan soruyu acele etmeden, anlaşılır kanıtlarla incelemektir.`;

const questionSpecs = [
  {
    type: "MULTIPLE_CHOICE" as const,
    prompt: "Bu metnin ana düşüncesi aşağıdakilerden hangisidir?",
    options: [
      { id: "a", text: "Okul bahçeleri yalnızca teneffüslerde kullanılmalıdır.", position: 0 },
      {
        id: "b",
        text: "Bir alanı iyileştirmeden önce düzenli gözlem ve kanıt karşılaştırması yapılmalıdır.",
        position: 1,
      },
      { id: "c", text: "Fen kulübü her okulda aynı projeyi uygulamalıdır.", position: 2 },
      {
        id: "d",
        text: "Bahçedeki bütün oturma yerleri öğleden sonra gölgede kalmalıdır.",
        position: 3,
      },
    ],
    correctAnswer: {
      type: "MULTIPLE_CHOICE",
      correctOptionIds: ["b"],
      allowMultiple: false,
      partialCredit: false,
    },
    hint: "Son paragrafta iyi bir başlangıç için sıralanan üç adıma dikkat et.",
    explanation:
      "Metin, bir alanı değiştirmeden önce bakmayı, kayıt tutmayı ve kanıtları karşılaştırmayı öneriyor.",
    difficulty: 0.5,
  },
  {
    type: "MULTIPLE_CHOICE" as const,
    prompt: "Öğrenciler neden bir hafta daha gözlem yapmaya karar verdi?",
    options: [
      { id: "a", text: "Gözlemleri karşılaştırınca yeni bir soru ortaya çıktı.", position: 0 },
      { id: "b", text: "Bahçedeki bütün bitkiler kurudu.", position: 1 },
      { id: "c", text: "Teneffüs saatleri değiştirildi.", position: 2 },
      { id: "d", text: "Çizim yapmayı bırakmak istediler.", position: 3 },
    ],
    correctAnswer: {
      type: "MULTIPLE_CHOICE",
      correctOptionIds: ["a"],
      allowMultiple: false,
      partialCredit: false,
    },
    hint: "Üçüncü paragrafta yeni sorunun hangi gözlemden sonra doğduğunu bul.",
    explanation:
      "Farklı saatlerdeki gölge durumunu karşılaştırınca oturma yerleriyle ilgili yeni bir soru oluştu; ekip bu yüzden acele etmedi.",
    difficulty: 0.42,
  },
  {
    type: "OPEN_ENDED" as const,
    prompt:
      "Metne göre bir alanı iyileştirmeye başlamadan önce hangi iki davranış önemlidir? Kısaca açıklayınız.",
    options: [],
    correctAnswer: {
      type: "OPEN_ENDED",
      expectedAnswer: "Gözlem yapmak, kayıt tutmak ve kanıtları karşılaştırmak",
      acceptableVariants: ["önce gözlemlemek ve elde edilen bilgileri değerlendirmek"],
      rubric: [
        { criteria: "Düzenli gözlem veya kayıt tutmayı belirtir", points: 0.5 },
        { criteria: "Kanıtları karşılaştırıp karar vermeyi belirtir", points: 0.5 },
      ],
      caseSensitive: false,
    },
    hint: "Metnin son cümlesinde karar vermeden önce yapılması önerilen adımları kendi cümlenle kur.",
    explanation:
      "Beklenen yanıt, önce gözlem ve kayıt yapmayı; ardından kanıtları karşılaştırarak karar vermeyi içermelidir.",
    difficulty: 0.66,
  },
];

function wordCount(value: string): number {
  return value.trim().split(/\s+/).length;
}

async function api(path: string, token?: string, method = "GET", payload?: unknown) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (payload !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(payload);
  }
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${method} ${path} → ${response.status}: ${body?.error?.message ?? "İstek başarısız"}`,
    );
  }
  return { status: response.status, body, data: body?.data };
}

async function rawApi(path: string, token: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function loginToken(email: string, password: string): Promise<string> {
  const result = await api("/auth/login", undefined, "POST", { email, password });
  const token = result.data?.tokens?.accessToken;
  assert.equal(typeof token, "string", `${email} access token üretmedi`);
  return token;
}

async function createPilot(
  adminToken: string,
): Promise<{ studentEmail: string; otherEmail: string }> {
  assert.ok(
    wordCount(contentBody) >= 180 && wordCount(contentBody) <= 300,
    "Metin 180–300 kelime olmalı",
  );

  const skills = await api("/admin/skills?category=COMPREHENSION&page=1&pageSize=100", adminToken);
  const skill = skills.data?.items?.find(
    (item: { id?: string; code?: string }) => !/E2E|LEARN|8e-/i.test(item.code ?? ""),
  );
  if (!skill?.id) throw new Error("Mevcut COMPREHENSION skill bulunamadı");
  skillId = skill.id;

  const content = await api("/admin/contents", adminToken, "POST", {
    tenantId: null,
    type: "PASSAGE",
    title: contentTitle,
    difficulty: 0.56,
  });
  contentId = content.data.id;
  const version = await api(`/admin/contents/${contentId}/versions`, adminToken, "POST", {
    title: contentTitle,
    body: contentBody,
    license: "Original OKU+ 8G-6 pilot.",
    changelog: `${PREFIX} original content; hint/explanation editorial review.`,
  });
  contentVersionId = version.data.id;
  assert.equal(version.data.wordCount, wordCount(contentBody));
  await api(`/admin/content-versions/${contentVersionId}/review`, adminToken, "POST");
  await api(`/admin/content-versions/${contentVersionId}/publish`, adminToken, "POST");
  await api(`/admin/contents/${contentId}/skills`, adminToken, "PUT", { skillIds: [skillId] });

  for (const [position, spec] of questionSpecs.entries()) {
    const question = await api(`/admin/contents/${contentId}/questions`, adminToken, "POST", {
      contentId,
      position,
      type: spec.type,
      skillId,
      prompt: spec.prompt,
      options: spec.options,
      correctAnswer: spec.correctAnswer,
      hint: spec.hint,
      explanation: spec.explanation,
      difficulty: spec.difficulty,
    });
    const questionId = question.data.id;
    const questionVersionId = question.data.currentVersion?.id ?? question.data.versions?.[0]?.id;
    assert.ok(questionVersionId, `QuestionVersion ${position} oluşturulmadı`);
    questionIds.push(questionId);
    questionVersionIds.push(questionVersionId);
    await api(`/admin/questions/versions/${questionVersionId}/review`, adminToken, "POST");
    await api(`/admin/questions/versions/${questionVersionId}/publish`, adminToken, "POST");
  }

  const template = await api("/admin/templates", adminToken, "POST", {
    tenantId: null,
    title: `${PREFIX} Hint ve Açıklama Alıştırması`,
    type: "COMPREHENSION",
    skillId,
    config: {
      pilot: true,
      topic: "Okul yaşamı > Gözlem ve kanıt",
      objective: "Bir metindeki kanıtları düzenleyerek dikkatli karar vermeyi açıklamak.",
      ageBand: "13–17",
      editorialReview: "Human review required before production promotion",
    },
  });
  templateId = template.data.id;
  templateVersionId = template.data.versions?.[0]?.id;
  assert.ok(templateVersionId, "TemplateVersion oluşturulmadı");
  await api(`/admin/template-versions/${templateVersionId}/contents`, adminToken, "PUT", {
    contents: [{ contentVersionId, position: 0 }],
  });
  await api(`/admin/template-versions/${templateVersionId}/questions`, adminToken, "PUT", {
    questions: questionVersionIds.map((questionVersionId, position) => ({
      questionVersionId,
      position,
    })),
  });
  await api(`/admin/template-versions/${templateVersionId}/review`, adminToken, "POST");
  await api(`/admin/template-versions/${templateVersionId}/publish`, adminToken, "POST");

  const studentEmail = `${PREFIX.toLowerCase()}-student@example.com`;
  const otherEmail = `${PREFIX.toLowerCase()}-other@example.com`;
  const student = await api("/auth/signup", undefined, "POST", {
    email: studentEmail,
    password: STUDENT_PASSWORD,
    displayName: `${PREFIX} Öğrenci`,
    platform: "WEB",
  });
  studentUserId = student.data?.user?.id ?? "";
  studentTenantId = student.data?.tenantContext?.tenantId ?? "";
  assert.ok(studentUserId && studentTenantId, "Pilot öğrenci personal context oluşturmadı");
  const other = await api("/auth/signup", undefined, "POST", {
    email: otherEmail,
    password: STUDENT_PASSWORD,
    displayName: `${PREFIX} Diğer Öğrenci`,
    platform: "WEB",
  });
  otherUserId = other.data?.user?.id ?? "";
  otherTenantId = other.data?.tenantContext?.tenantId ?? "";
  assert.ok(otherUserId && otherTenantId, "İkinci öğrenci personal context oluşturmadı");

  console.log(
    `AUTHORING PASS: skill=${skill.code} content=${contentId} contentVersion=${contentVersionId} questions=${questionIds.length}`,
  );
  console.log(`AUTHORING PASS: template=${templateId} templateVersion=${templateVersionId}`);
  return { studentEmail, otherEmail };
}

async function completeOnboarding(page: Page): Promise<void> {
  await page.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 15000 });
  await page.fill("#onboard-displayName", `${PREFIX} Öğrenci`);
  await page.fill("#onboard-birthYear", "2010");
  await page.click("#onboarding-next");
  await page.waitForSelector("#onboarding-step-2:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#onboard-level", { index: 1 });
  await page.click('[data-goal="COMPREHENSION"]');
  await page.click("#onboarding-next");
  await page.waitForSelector("#onboarding-step-3:not(.hidden)", { timeout: 5000 });
  await page.check("#onboard-consent-terms");
  await page.check("#onboard-consent-data");
  await page.check("#onboard-consent-parental");
  await page.click("#onboarding-complete");
  await page.waitForSelector("#onboarding-ready:not(.hidden)", { timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.viewport + 1 &&
      dimensions.bodyScrollWidth <= dimensions.viewport + 1,
    `${label} yatay taşma: ${JSON.stringify(dimensions)}`,
  );
  console.log(`${label} PASS: ${JSON.stringify(dimensions)}`);
}

async function assertDisclosure(page: Page, selector: string, expectedText: string): Promise<void> {
  const details = page.locator(selector);
  const summary = details.locator("summary");
  const targetId = await summary.getAttribute("aria-controls");
  assert.ok(targetId, `${selector} aria-controls eksik`);
  assert.equal(await page.locator(`#${targetId}`).count(), 1, `${selector} hedefi bulunamadı`);
  assert.equal(await summary.getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator(`#${targetId}`).isVisible(), false);
  await summary.focus();
  await page.keyboard.press("Enter");
  await assertEventually(async () => {
    assert.equal(await summary.getAttribute("aria-expanded"), "true");
    assert.ok(await page.locator(`#${targetId}`).isVisible());
    assert.ok((await page.locator(`#${targetId}`).textContent())?.includes(expectedText));
  });
  await page.keyboard.press("Enter");
  await assertEventually(async () => {
    assert.equal(await summary.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(`#${targetId}`).isVisible(), false);
  });
  await summary.click();
  await assertEventually(async () => {
    assert.equal(await summary.getAttribute("aria-expanded"), "true");
    assert.ok(await page.locator(`#${targetId}`).isVisible());
  });
}

async function assertEventually(check: () => Promise<void>, attempts = 20): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index++) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

async function runBrowserFlow(studentEmail: string, studentToken: string): Promise<void> {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.fill("#login-email", studentEmail);
  await page.fill("#login-password", STUDENT_PASSWORD);
  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith("/auth/login") && response.request().method() === "POST",
  );
  await page.click("#login-submit");
  assert.equal((await loginResponse).status(), 200, "Öğrenci browser login başarısız");
  await completeOnboarding(page);
  console.log("1) LOGIN + ONBOARDING PASS");

  // A skill with more than one published template is rendered as content nodes;
  // a skill with a single template keeps the legacy skill-node representation.
  const node = page
    .locator(`[data-node-id="${templateVersionId}"], [data-node-id="${skillId}"]`)
    .first();
  await node.waitFor({ state: "visible", timeout: 10000 });
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/student/exercises/start") && response.request().method() === "POST",
  );
  await node.click();
  const startBody = await (await startResponse).json();
  sessionId = startBody.data?.sessionId ?? "";
  assert.ok(sessionId, "Learning path session başlatmadı");
  await page.waitForSelector("#page-exercise:not(.hidden)", { timeout: 10000 });
  await page.waitForSelector("#exercise-questions-card", { state: "visible", timeout: 10000 });
  await page.waitForSelector("#student-reading-card", { state: "visible", timeout: 10000 });
  assert.equal(await page.textContent("#student-reading-heading"), contentTitle);
  console.log("2) EXERCISE + READING DISCOVERY PASS");

  const questionPayload = await api(`/student/sessions/${sessionId}/questions`, studentToken);
  const questionJson = JSON.stringify(questionPayload.data);
  assert.ok(
    !questionJson.includes("correctAnswer"),
    "Student question response correctAnswer sızdırdı",
  );
  assert.ok(!questionJson.includes('"answer"'), "Student question response answer alanı sızdırdı");
  assert.equal(
    questionPayload.data?.questions?.length,
    3,
    "Student question response üç soru dönmedi",
  );
  assert.ok(
    questionPayload.data.questions.every((item: { hint?: unknown; explanation?: unknown }) =>
      Boolean(item.hint && item.explanation),
    ),
  );
  console.log("3) STUDENT API HINT/EXPLANATION + ANSWER SECRECY PASS");

  await page.waitForFunction(
    (expected) =>
      document
        .querySelector("#exercise-current-question")
        ?.getAttribute("data-question-version-id") === expected,
    questionVersionIds[0],
  );
  await assertDisclosure(page, ".exercise-hint", "Son paragrafta");
  const hintText = await page.locator(".exercise-hint p").textContent();
  assert.ok(!hintText?.includes("düzenli gözlem ve kanıt karşılaştırması"));
  assert.equal(
    (await page.locator(".exercise-hint summary").getAttribute("aria-controls")) !== null,
    true,
  );
  console.log("4) HINT BEFORE ANSWER + KEYBOARD/ARIA PASS");

  await page.locator('label.answer-card:has(input[data-exercise-opt][value="b"])').click();
  await page.click("#exercise-submit-attempt");
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#exercise-attempt-feedback")!).display !== "none",
  );
  assert.match((await page.textContent("#exercise-attempt-feedback")) ?? "", /Doğru/);
  assert.match((await page.textContent("#exercise-attempt-feedback")) ?? "", /Metin, bir alanı/);
  await assertDisclosure(page, ".exercise-explanation", "Metin, bir alanı");
  await assertNoOverflow(page, "MOBILE 390x844 CORRECT + DISCLOSURE");
  console.log("5) CORRECT ANSWER + EXPLANATION COLLAPSE/REOPEN PASS");
  await page.click("#exercise-submit-attempt");

  await page.waitForFunction(
    (expected) =>
      document
        .querySelector("#exercise-current-question")
        ?.getAttribute("data-question-version-id") === expected,
    questionVersionIds[1],
  );
  await assertDisclosure(page, ".exercise-hint", "Üçüncü paragrafta");
  await page.locator('label.answer-card:has(input[data-exercise-opt][value="b"])').click();
  await page.click("#exercise-submit-attempt");
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#exercise-attempt-feedback")!).display !== "none",
  );
  const wrongFeedback = (await page.textContent("#exercise-attempt-feedback")) ?? "";
  assert.match(wrongFeedback, /Tekrar düşün/);
  assert.match(wrongFeedback, /Farklı saatlerdeki gölge/);
  assert.ok(!wrongFeedback.includes("Yanlış yaptın"), "Utandırıcı yanlış cevap dili göründü");
  await assertDisclosure(page, ".exercise-explanation", "Farklı saatlerdeki gölge");
  console.log("6) WRONG ANSWER + TEACHING FEEDBACK PASS");
  await page.click("#exercise-submit-attempt");

  await page.waitForFunction(
    (expected) =>
      document
        .querySelector("#exercise-current-question")
        ?.getAttribute("data-question-version-id") === expected,
    questionVersionIds[2],
  );
  await assertDisclosure(page, ".exercise-hint", "son cümlesinde");
  await page.fill(
    "#exercise-oe-answer",
    "Önce gözlem yapmak, kayıt tutmak ve kanıtları karşılaştırmak gerekir.",
  );
  await page.click("#exercise-submit-attempt");
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#exercise-attempt-feedback")!).display !== "none",
  );
  const pendingFeedback = (await page.textContent("#exercise-attempt-feedback")) ?? "";
  assert.match(pendingFeedback, /Değerlendirme bekleniyor/);
  assert.doesNotMatch(pendingFeedback, /Doğru!/);
  assert.doesNotMatch(pendingFeedback, /Tekrar düşün/);
  await assertDisclosure(page, ".exercise-explanation", "Beklenen yanıt");
  console.log("7) OPEN_ENDED PENDING + EXPLANATION PASS");
  await page.click("#exercise-submit-attempt");
  await page.waitForSelector("#exercise-result-card", { state: "visible", timeout: 15000 });
  assert.match((await page.textContent("#exercise-result-body")) ?? "", /bekleyen/i);
  console.log("8) COMPLETION PASS");

  await page.setViewportSize({ width: 1280, height: 800 });
  await assertNoOverflow(page, "DESKTOP 1280x800 RESULT");
  const summaryMetrics = await page.evaluate(() => ({
    hintSummary: document.querySelector(".exercise-hint summary")?.getAttribute("aria-expanded"),
    explanationSummary: document
      .querySelector(".exercise-explanation summary")
      ?.getAttribute("aria-expanded"),
    feedbackLive: document.querySelector("#exercise-attempt-feedback")?.getAttribute("aria-live"),
  }));
  assert.equal(summaryMetrics.feedbackLive, "polite");
  console.log("9) ACCESSIBILITY + DESKTOP PASS");
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
}

async function verifyDatabase(): Promise<void> {
  const [content, version, questions, questionVersions, template, templateVersion, session] =
    await Promise.all([
      prisma.content.findUnique({ where: { id: contentId }, include: { contentSkills: true } }),
      prisma.contentVersion.findUnique({ where: { id: contentVersionId } }),
      prisma.question.findMany({
        where: { id: { in: questionIds } },
        orderBy: { position: "asc" },
      }),
      prisma.questionVersion.findMany({ where: { id: { in: questionVersionIds } } }),
      prisma.exerciseTemplate.findUnique({ where: { id: templateId } }),
      prisma.exerciseTemplateVersion.findUnique({
        where: { id: templateVersionId },
        include: { contents: true, questions: true },
      }),
      prisma.exerciseSession.findUnique({ where: { id: sessionId }, include: { attempts: true } }),
    ]);
  assert.equal(content?.tenantId, null);
  assert.equal(content?.status, "PUBLISHED");
  assert.equal(content?.contentSkills.length, 1);
  assert.equal(version?.status, "PUBLISHED");
  assert.equal(version?.wordCount, wordCount(contentBody));
  assert.equal(questions.length, 3);
  assert.equal(questionVersions.length, 3);
  assert.ok(
    questionVersions.every((item) => item.status === "PUBLISHED" && item.hint && item.explanation),
  );
  assert.equal(template?.status, "PUBLISHED");
  assert.equal(templateVersion?.status, "PUBLISHED");
  assert.equal(templateVersion?.contents.length, 1);
  assert.equal(templateVersion?.questions.length, 3);
  assert.equal(session?.status, "COMPLETED");
  assert.equal(session?.attempts.length, 3);
  assert.equal(session?.attempts.filter((attempt) => attempt.isCorrect === true).length, 1);
  assert.equal(session?.attempts.filter((attempt) => attempt.isCorrect === false).length, 1);
  assert.equal(session?.attempts.filter((attempt) => attempt.isCorrect === null).length, 1);
  const progress = await prisma.studentProgress.findFirst({
    where: { studentId: studentUserId, tenantId: studentTenantId, skillId },
  });
  assert.ok(progress);
  assert.equal(progress.attemptCount, 3);
  assert.equal(progress.correctCount, 1);
  assert.equal(progress.accuracy, 0.5);
  console.log(
    `DB PASS: content/version published=${content?.id}/${version?.id} questions=${questionVersions.length} hint+explanation=3/3`,
  );
  console.log(
    `DB PASS: session=${session?.id} attempts=3 correct=1 wrong=1 pending=1 progress=${progress.attemptCount}/${progress.correctCount}`,
  );
}

async function cleanup(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL app.platform_role = 'SUPER_ADMIN'");
    await tx.$executeRawUnsafe("SET LOCAL app.user_id = '01a01485-484f-7c3d-ac91-97198d4a246d'");
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    const userIds = [studentUserId, otherUserId].filter(Boolean);
    const tenantIds = [studentTenantId, otherTenantId].filter(Boolean);
    if (userIds.length) {
      await tx.attempt.deleteMany({ where: { session: { studentId: { in: userIds } } } });
      await tx.studentProgress.deleteMany({ where: { studentId: { in: userIds } } });
      await tx.pointEvent.deleteMany({ where: { studentId: { in: userIds } } });
      await tx.studentBadge.deleteMany({ where: { studentId: { in: userIds } } });
      await tx.studentStreak.deleteMany({ where: { studentId: { in: userIds } } });
      await tx.consent.deleteMany({ where: { userId: { in: userIds } } });
      await tx.exerciseSession.deleteMany({ where: { studentId: { in: userIds } } });
      await tx.studentProfile.deleteMany({ where: { studentId: { in: userIds } } });
      await tx.membership.deleteMany({ where: { userId: { in: userIds } } });
      await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await tx.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (tenantIds.length) await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    if (templateVersionId) {
      await tx.exerciseTemplateVersionContent.deleteMany({ where: { templateVersionId } });
      await tx.exerciseTemplateVersionQuestion.deleteMany({ where: { templateVersionId } });
      await tx.exerciseTemplateVersion.deleteMany({ where: { id: templateVersionId } });
    }
    if (templateId) await tx.exerciseTemplate.deleteMany({ where: { id: templateId } });
    if (questionVersionIds.length)
      await tx.questionVersion.deleteMany({ where: { id: { in: questionVersionIds } } });
    if (questionIds.length) await tx.question.deleteMany({ where: { id: { in: questionIds } } });
    if (contentId) await tx.contentSkill.deleteMany({ where: { contentId } });
    if (contentVersionId) await tx.contentVersion.deleteMany({ where: { id: contentVersionId } });
    if (contentId) await tx.content.deleteMany({ where: { id: contentId } });
  });
  const leftovers = await Promise.all([
    prisma.user.count({ where: { id: { in: [studentUserId, otherUserId] } } }),
    prisma.tenant.count({ where: { id: { in: [studentTenantId, otherTenantId] } } }),
    prisma.exerciseSession.count({ where: { id: sessionId } }),
    prisma.attempt.count({ where: { questionVersionId: { in: questionVersionIds } } }),
    prisma.questionVersion.count({ where: { id: { in: questionVersionIds } } }),
    prisma.question.count({ where: { id: { in: questionIds } } }),
    prisma.exerciseTemplate.count({ where: { id: templateId } }),
    prisma.contentVersion.count({ where: { id: contentVersionId } }),
    prisma.content.count({ where: { id: contentId } }),
  ]);
  assert.deepEqual(leftovers, new Array(leftovers.length).fill(0));
  console.log("CLEANUP PASS: targeted fixture cleanup; demo data and TRUNCATE untouched.");
}

async function main(): Promise<void> {
  await prisma.$connect();
  const adminToken = await loginToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`PILOT ${PREFIX} başladı: real hint/explanation UI + DB verification`);
  try {
    const { studentEmail, otherEmail } = await createPilot(adminToken);
    const studentToken = await loginToken(studentEmail, STUDENT_PASSWORD);
    const otherToken = await loginToken(otherEmail, STUDENT_PASSWORD);
    await runBrowserFlow(studentEmail, studentToken);
    const crossUser = await rawApi(`/student/sessions/${sessionId}/questions`, otherToken);
    assert.ok(
      [403, 404].includes(crossUser.status),
      `Cross-user erişim açıldı: ${crossUser.status}`,
    );
    const crossTenant = await rawApi(`/student/sessions/${sessionId}/questions`, otherToken);
    assert.ok(
      [403, 404].includes(crossTenant.status),
      `Cross-tenant erişim açıldı: ${crossTenant.status}`,
    );
    console.log("10) CROSS-USER + CROSS-TENANT SECURITY PASS");
    const ownQuestions = await api(`/student/sessions/${sessionId}/questions`, studentToken);
    assert.equal(ownQuestions.data.questions.length, 3);
    await verifyDatabase();
    console.log("11) DB HINT/EXPLANATION/PENDING VERIFICATION PASS");
  } finally {
    await browser?.close();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log("✅ HINT + EXPLANATION E2E PASS");
}

main().catch((error) => {
  console.error("HINT + EXPLANATION E2E FAIL:", error);
  process.exitCode = 1;
});
