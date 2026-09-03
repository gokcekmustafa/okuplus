/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const STUDENT_PASSWORD = "PilotE2E123!";
const RUN = Date.now();
const PREFIX = `PILOT-8G5-${RUN}`;

const prisma = new PrismaClient();
let browser: Browser | undefined;
let studentUserId = "";
let studentTenantId = "";
let skillId = "";
let levelId = "";
let contentId = "";
let contentVersionId = "";
let templateId = "";
let templateVersionId = "";
let sessionId = "";
const questionIds: string[] = [];
const questionVersionIds: string[] = [];

const contentTitle = `${PREFIX} Şehrin Görünmeyen Serinlik Haritası`;
const contentBody = `Bir yaz günü aynı şehirde iki sokağı düşünün. Biri koyu asfaltla kaplı, binalar birbirine yakın ve neredeyse hiç gölge yok. Diğerinde ağaçlar, küçük bahçeler ve açık renkli yüzeyler bulunuyor. Termometreler aynı havayı ölçse de bu iki sokağın hissettirdiği sıcaklık birbirinden farklı olabilir. Bu farkı anlamak için bilim insanları, şehirlerin serinlik haritasını çıkarmaya çalışıyor.

Kentlerde asfalt, beton ve çatılar güneşten gelen enerjinin önemli bir bölümünü emer. Bu yüzeyler ısındıkça çevrelerine ısı verir; böylece şehir merkezleri, yakınındaki daha yeşil alanlardan daha sıcak hâle gelebilir. Bu olaya kentsel ısı adası etkisi denir. Etki yalnızca gündüz görülmez; gün boyunca depolanan ısı akşam saatlerinde de yavaşça açığa çıkabilir.

Ağaçlar bu haritanın önemli işaretleridir. Geniş yapraklı bir ağaç önce doğrudan gölge sağlar. Ayrıca kökleriyle aldığı suyun bir bölümünü yapraklarından atmosfere bırakır. Evapotranspirasyon adı verilen bu süreç, çevrenin serinlemesine katkıda bulunur. Çim, çalı ve başka bitkiler de benzer yollarla yüzey sıcaklığını azaltabilir.

Uydu görüntüleri, araştırmacıların hangi bölgelerin daha fazla ısındığını görmesine yardım eder. Fakat harita tek başına çözüm değildir. Bir okul bahçesine ağaç dikilecekse suya erişim, yerel iklim, güvenli yürüme alanı ve bitkinin köklerinin ihtiyaçları birlikte düşünülmelidir. En iyi plan, ölçüm verisini yerel bilgiyi dinlemekle birleştirir.

Sonuç olarak serin bir şehir yalnızca daha çok beton döşemekle kurulmaz. Gölgeyi, su döngüsünü ve yeşil alanları birlikte düşünen tasarım kararları, insanların aynı kenti daha rahat deneyimlemesine yardımcı olabilir.`;

type QuestionSpec = {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN_ENDED" | "MATCHING" | "FILL_BLANK";
  objective: string;
  prompt: string;
  options: any[];
  correctAnswer: any;
  hint: string;
  explanation: string;
  difficulty: number;
  browserAnswer: any;
};

const questionSpecs: QuestionSpec[] = [
  {
    type: "MULTIPLE_CHOICE",
    objective: "Metnin ana fikrini belirlemek",
    prompt: "Bu metnin ana fikri aşağıdakilerden hangisidir?",
    options: [
      { id: "a", text: "Uydu görüntüleri yalnızca hava tahmini için kullanılır.", position: 0 },
      {
        id: "b",
        text: "Şehirleri serinletmek için ısıyı, gölgeyi ve yeşil alanları birlikte düşünmek gerekir.",
        position: 1,
      },
      { id: "c", text: "Her okul bahçesine aynı tür ağaç dikilmelidir.", position: 2 },
      { id: "d", text: "Asfalt ve beton bütün şehirlerde aynı sıcaklığı oluşturur.", position: 3 },
    ],
    correctAnswer: {
      type: "MULTIPLE_CHOICE",
      correctOptionIds: ["b"],
      allowMultiple: false,
      partialCredit: false,
    },
    hint: "Metnin son paragrafında farklı bilgilerin nasıl bir araya getirildiğine bak.",
    explanation:
      "Metin; yüzeylerin ısınmasını, ağaçların gölgesini ve bitkilerin serinletici etkisini birlikte ele alıyor.",
    difficulty: 0.48,
    browserAnswer: ["b"],
  },
  {
    type: "TRUE_FALSE",
    objective: "Metindeki açık bir ayrıntıyı bulmak",
    prompt: "Metne göre gün boyunca depolanan ısı, akşam saatlerinde de açığa çıkabilir.",
    options: [],
    correctAnswer: { type: "TRUE_FALSE", answer: true },
    hint: "Kentsel ısı adası etkisini açıklayan paragrafın son cümlesini hatırla.",
    explanation:
      "Metin, yüzeylerin gün boyunca depoladığı ısının akşam saatlerinde yavaşça açığa çıkabileceğini söylüyor.",
    difficulty: 0.36,
    browserAnswer: true,
  },
  {
    type: "OPEN_ENDED",
    objective: "Neden-sonuç ilişkisini kısa ve kanıta dayalı açıklamak",
    prompt:
      "Bir okul bahçesinin serinlemesine yardımcı olacak iki özelliği metne dayanarak yazınız.",
    options: [],
    correctAnswer: {
      type: "OPEN_ENDED",
      expectedAnswer: "Ağaç gölgesi ve bitkilerin evapotranspirasyonu",
      acceptableVariants: ["gölge ve bitkilerin suyu atmosfere bırakması"],
      rubric: [
        { criteria: "Gölge etkisini belirtir", points: 0.5 },
        { criteria: "Bitkilerin su döngüsündeki serinletici etkisini belirtir", points: 0.5 },
      ],
      caseSensitive: false,
    },
    hint: "Metindeki ağaçların iki farklı serinletici etkisini kendi cümlelerinle birleştir.",
    explanation:
      "Beklenen yanıtta gölge ve bitkilerin suyu yapraklardan atmosfere bırakmasıyla oluşan serinletici katkı bulunmalıdır.",
    difficulty: 0.68,
    browserAnswer:
      "Ağaçların gölgesi ve bitkilerin suyu atmosfere bırakması serinlemeye yardımcı olur.",
  },
  {
    type: "MATCHING",
    objective: "Kavramları metindeki açıklamalarıyla eşleştirmek",
    prompt: "Aşağıdaki kavramları metindeki açıklamalarıyla eşleştiriniz.",
    options: [
      { id: "left-heat-island", text: "Kentsel ısı adası", matchGroup: "left", position: 0 },
      { id: "left-evapo", text: "Evapotranspirasyon", matchGroup: "left", position: 1 },
      {
        id: "right-heat-island",
        text: "Şehir merkezlerinin daha sıcak hâle gelmesi",
        matchGroup: "right",
        position: 2,
      },
      {
        id: "right-evapo",
        text: "Suyun yapraklardan atmosfere bırakılması",
        matchGroup: "right",
        position: 3,
      },
    ],
    correctAnswer: {
      type: "MATCHING",
      pairs: [
        { leftId: "left-heat-island", rightId: "right-heat-island" },
        { leftId: "left-evapo", rightId: "right-evapo" },
      ],
      partialCredit: true,
    },
    hint: "Bir kavramın anlamını bulmak için metindeki tanım cümlesine dön.",
    explanation:
      "Kentsel ısı adası şehirlerin yeşil alanlardan daha sıcak hâle gelmesini; evapotranspirasyon ise suyun yapraklardan atmosfere bırakılmasını anlatır.",
    difficulty: 0.59,
    browserAnswer: {
      "left-heat-island": "right-heat-island",
      "left-evapo": "right-evapo",
    },
  },
  {
    type: "FILL_BLANK",
    objective: "Temel bir terimi metinden doğru biçimde hatırlamak",
    prompt:
      "Şehir merkezlerinin çevresindeki daha yeşil alanlardan daha sıcak hâle gelmesine ________ etkisi denir.",
    options: [],
    correctAnswer: {
      type: "FILL_BLANK",
      blanks: [
        {
          blankId: "blank-term",
          acceptedAnswers: ["kentsel ısı adası", "kentsel ısı adası etkisi"],
          caseSensitive: false,
        },
      ],
      partialCredit: false,
    },
    hint: "Metnin ikinci paragrafındaki özel terimi aynen hatırla.",
    explanation: "Metin, bu durumu ‘kentsel ısı adası etkisi’ olarak adlandırıyor.",
    difficulty: 0.41,
    browserAnswer: { "blank-term": "kentsel ısı adası" },
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

async function loginToken(email: string, password: string): Promise<string> {
  const result = await api("/auth/login", undefined, "POST", { email, password });
  const token = result.data?.tokens?.accessToken;
  assert.equal(typeof token, "string", `${email} access token üretmedi`);
  return token;
}

async function preparePilot(adminToken: string): Promise<void> {
  assert.ok(
    wordCount(contentBody) >= 180 && wordCount(contentBody) <= 300,
    "Pilot metni 180–300 kelime bandında olmalı",
  );

  const skills = await api("/admin/skills?category=COMPREHENSION&page=1&pageSize=100", adminToken);
  const skill = skills.data?.items?.find((item: any) => !/E2E|LEARN|8e-/i.test(item.code));
  assert.ok(skill, "Mevcut, test dışı bir COMPREHENSION Skill bulunamadı");
  skillId = skill.id;

  const level = await api("/admin/levels", adminToken, "POST", {
    code: `${PREFIX}-LEVEL`,
    name: `${PREFIX} · 13–17 yaş pilot seviyesi`,
    gradeBand: "8–12",
    minScore: 0,
    maxScore: 100,
    difficultyMin: 0,
    difficultyMax: 1,
    displayOrder: 9000,
  });
  levelId = level.data.id;

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
    license: "Original OKU+ pilot; NASA/EPA factual basis.",
    changelog: `${PREFIX} original editorial pilot; source review recorded in docs/CONTENT_PILOT.md.`,
  });
  contentVersionId = version.data.id;
  assert.equal(
    version.data.wordCount,
    wordCount(contentBody),
    "ContentVersion wordCount servis tarafından hesaplanmadı",
  );
  await api(`/admin/content-versions/${contentVersionId}/review`, adminToken, "POST");
  await api(`/admin/content-versions/${contentVersionId}/publish`, adminToken, "POST");
  await api(`/admin/contents/${contentId}/skills`, adminToken, "PUT", { skillIds: [skill.id] });

  for (const [position, spec] of questionSpecs.entries()) {
    const question = await api(`/admin/contents/${contentId}/questions`, adminToken, "POST", {
      contentId,
      position,
      type: spec.type,
      skillId,
      prompt: spec.prompt,
      options: spec.options,
      correctAnswer: spec.correctAnswer,
      explanation: spec.explanation,
      hint: spec.hint,
      difficulty: spec.difficulty,
    });
    const questionId = question.data.id;
    const qvId = question.data.currentVersion?.id ?? question.data.versions?.[0]?.id;
    assert.ok(qvId, `Soru ${position + 1} için ilk QuestionVersion dönmedi`);
    questionIds.push(questionId);
    questionVersionIds.push(qvId);
    await api(`/admin/questions/versions/${qvId}/review`, adminToken, "POST");
    await api(`/admin/questions/versions/${qvId}/publish`, adminToken, "POST");
  }

  const template = await api("/admin/templates", adminToken, "POST", {
    tenantId: null,
    title: `${PREFIX} · Şehirlerin Serinlik Haritası`,
    type: "COMPREHENSION",
    skillId: skill.id,
    config: {
      pilot: true,
      topic: "Bilim > İklim ve şehir",
      objective:
        "Bilgilendirici bir metnin ana fikrini, ayrıntılarını ve kavramlarını kanıtla ilişkilendirerek anlamak.",
    },
  });
  templateId = template.data.id;
  templateVersionId = template.data.versions?.[0]?.id;
  assert.ok(templateVersionId, "İlk ExerciseTemplateVersion dönmedi");
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

  const signup = await api("/auth/signup", undefined, "POST", {
    email: `${PREFIX.toLowerCase()}@example.com`,
    password: STUDENT_PASSWORD,
    displayName: `${PREFIX} Öğrenci`,
    platform: "WEB",
  });
  const studentToken = signup.data?.tokens?.accessToken;
  studentUserId = signup.data?.user?.id ?? "";
  studentTenantId = signup.data?.tenantContext?.tenantId ?? "";
  assert.ok(
    studentToken && studentUserId && studentTenantId,
    "Pilot öğrenci kişisel context oluşturmadı",
  );

  const me = await api("/auth/me", studentToken);
  assert.equal(me.data?.user?.id, studentUserId, "Pilot öğrenci /auth/me ile doğrulanamadı");
  console.log(
    `AUTHORING PASS: level=${levelId} skill=${skill.code} content=${contentId} contentVersion=${contentVersionId}`,
  );
  console.log(
    `AUTHORING PASS: questions=${questionIds.length} template=${templateId} templateVersion=${templateVersionId}`,
  );
}

async function completeOnboarding(studentPage: Page): Promise<void> {
  await studentPage.waitForSelector("#page-onboarding:not(.hidden)", { timeout: 15000 });
  await studentPage.fill("#onboard-displayName", `${PREFIX} Öğrenci`);
  await studentPage.fill("#onboard-birthYear", "2010");
  await studentPage.click("#onboarding-next");
  await studentPage.waitForSelector("#onboarding-step-2:not(.hidden)", { timeout: 5000 });
  await studentPage.selectOption("#onboard-level", levelId);
  await studentPage.click('[data-goal="COMPREHENSION"]');
  await studentPage.click("#onboarding-next");
  await studentPage.waitForSelector("#onboarding-step-3:not(.hidden)", { timeout: 5000 });
  await studentPage.check("#onboard-consent-terms");
  await studentPage.check("#onboard-consent-data");
  await studentPage.check("#onboard-consent-parental");
  await studentPage.click("#onboarding-complete");
  await studentPage.waitForSelector("#onboarding-ready:not(.hidden)", { timeout: 10000 });
  await studentPage.reload({ waitUntil: "networkidle" });
  await studentPage.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
}

async function assertNoHorizontalOverflow(studentPage: Page, label: string): Promise<void> {
  const overflow = await studentPage.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.viewport + 1 &&
      overflow.bodyScrollWidth <= overflow.viewport + 1,
    `${label} yatay taşma: ${JSON.stringify(overflow)}`,
  );
  console.log(`${label} PASS: ${JSON.stringify(overflow)}`);
}

async function runStudentBrowserFlow(): Promise<void> {
  const activeBrowser = await chromium.launch({ executablePath: CHROME, headless: true });
  browser = activeBrowser;
  const studentPage = await activeBrowser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors: string[] = [];
  studentPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const studentEmail = `${PREFIX.toLowerCase()}@example.com`;

  await studentPage.goto(BASE_URL, { waitUntil: "networkidle" });
  await studentPage.fill("#login-email", studentEmail);
  await studentPage.fill("#login-password", STUDENT_PASSWORD);
  const loginResponse = studentPage.waitForResponse(
    (response) => response.url().endsWith("/auth/login") && response.request().method() === "POST",
  );
  await studentPage.click("#login-submit");
  assert.equal((await loginResponse).status(), 200, "Öğrenci browser login başarısız");
  console.log("1) STUDENT LOGIN PASS");
  await completeOnboarding(studentPage);
  console.log("2) ONBOARDING PASS");

  const pathResponse = studentPage.waitForResponse(
    (response) =>
      response.url().endsWith("/student/learning-path") && response.request().method() === "GET",
  );
  await studentPage.reload({ waitUntil: "networkidle" });
  await pathResponse;
  const node = studentPage.locator(`[data-node-id="${skillId}"]`);
  await node.waitFor({ state: "visible", timeout: 10000 });
  assert.match(
    (await node.innerText()).toLocaleLowerCase("tr-TR"),
    /anlama|beceri|comprehension|ex ux/,
  );
  console.log("3) LEARNING PATH / CONTENT DISCOVERY PASS");
  await assertNoHorizontalOverflow(studentPage, "DESKTOP 1280x800");

  await studentPage.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(studentPage, "MOBILE 390x844");
  const startResponse = studentPage.waitForResponse(
    (response) =>
      response.url().endsWith("/student/exercises/start") && response.request().method() === "POST",
  );
  await node.click();
  const startBody = await (await startResponse).json();
  sessionId = startBody.data?.sessionId ?? "";
  assert.ok(sessionId, "Öğrenci learning path session başlatmadı");
  await studentPage.waitForSelector("#page-exercise:not(.hidden)", { timeout: 10000 });
  await studentPage.waitForSelector("#student-reading-card", { state: "visible", timeout: 10000 });
  const readingTitle = await studentPage.textContent("#student-reading-heading");
  const readingBody = await studentPage.textContent("#student-reading-body");
  assert.equal(readingTitle, contentTitle, "Öğrenci reading başlığı yanlış");
  assert.ok(readingBody?.includes("kentsel ısı adası"), "Öğrenci reading metnini göremedi");
  console.log("4) CONTENT OPEN / READING PASS");
  await assertNoHorizontalOverflow(studentPage, "MOBILE READING 390x844");

  await studentPage.waitForFunction(
    () => {
      const card = document.querySelector("#exercise-questions-card") as HTMLElement | null;
      const counter = document.querySelector("#exercise-question-counter") as HTMLElement | null;
      return Boolean(card && counter && getComputedStyle(card).display !== "none");
    },
    undefined,
    { timeout: 10000 },
  );
  const seenTypes: string[] = [];
  for (const [index, spec] of questionSpecs.entries()) {
    const questionVersionId = questionVersionIds[index];
    await studentPage.waitForFunction(
      (expected) =>
        document
          .querySelector("#exercise-current-question")
          ?.getAttribute("data-question-version-id") === expected,
      questionVersionId,
    );
    const current = studentPage.locator("#exercise-current-question");
    const type = await current.getAttribute("data-question-type");
    assert.equal(type, spec.type, `Soru ${index + 1} type yanlış`);
    seenTypes.push(type ?? "");
    if (spec.type === "MULTIPLE_CHOICE") {
      await studentPage
        .locator(
          `label.answer-card:has(input[data-exercise-opt][value="${spec.browserAnswer[0]}"])`,
        )
        .click();
    } else if (spec.type === "TRUE_FALSE") {
      await studentPage
        .locator(
          `label.answer-card:has(input[data-exercise-tf][value="${String(spec.browserAnswer)}"])`,
        )
        .click();
    } else if (spec.type === "OPEN_ENDED") {
      await studentPage.fill("#exercise-oe-answer", spec.browserAnswer);
    } else if (spec.type === "MATCHING") {
      for (const [leftId, rightId] of Object.entries(spec.browserAnswer)) {
        await studentPage.selectOption(`[data-exercise-match-left="${leftId}"]`, rightId as string);
      }
    } else if (spec.type === "FILL_BLANK") {
      await studentPage.fill(
        `[data-exercise-blank="blank-term"]`,
        spec.browserAnswer["blank-term"],
      );
    }
    await studentPage.click("#exercise-submit-attempt");
    await studentPage.waitForFunction(() => {
      const feedback = document.querySelector("#exercise-attempt-feedback") as HTMLElement | null;
      return Boolean(feedback && getComputedStyle(feedback).display !== "none");
    });
    const feedback = await studentPage.textContent("#exercise-attempt-feedback");
    assert.ok(
      feedback?.includes(spec.explanation),
      `Soru ${index + 1} explanation feedback'te görünmedi`,
    );
    console.log(`${5 + index}) QUESTION ${index + 1} / ${spec.type} / ATTEMPT + FEEDBACK PASS`);
    if (index < questionSpecs.length - 1) {
      await studentPage.click("#exercise-submit-attempt");
    }
  }
  assert.deepEqual(seenTypes, [
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "OPEN_ENDED",
    "MATCHING",
    "FILL_BLANK",
  ]);
  await studentPage.click("#exercise-submit-attempt");
  await studentPage.waitForSelector("#exercise-result-card", { state: "visible", timeout: 15000 });
  const resultText = (await studentPage.textContent("#exercise-result-body")) ?? "";
  assert.match(resultText, /5/);
  assert.match(resultText, /4/);
  assert.match(resultText, /bekleyen/i);
  console.log("10) COMPLETION / RESULT PASS");

  await studentPage.click("#exercise-return-path");
  await studentPage.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  await studentPage.waitForFunction(
    (skillId) =>
      Boolean(
        document.querySelector(`[data-node-id="${skillId}"]`)?.classList.contains("completed"),
      ),
    skillId,
  );
  const gamificationText = await studentPage.textContent("#today-stats");
  assert.match(gamificationText ?? "", /Streak:/);
  assert.match(gamificationText ?? "", /Puan:/);
  console.log("11) PROGRESS / XP / STREAK UI PASS");

  await studentPage.reload({ waitUntil: "networkidle" });
  await studentPage.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  await studentPage.waitForFunction(
    (skillId) =>
      Boolean(
        document.querySelector(`[data-node-id="${skillId}"]`)?.classList.contains("completed"),
      ),
    skillId,
  );
  console.log("12) REFRESH / PERSISTENCE PASS");
  if (consoleErrors.length) console.log(`Browser console errors: ${consoleErrors.join(" | ")}`);
}

async function verifyDatabase(): Promise<void> {
  const [level, content, version, questions, questionVersions, template, templateVersion, session] =
    await Promise.all([
      prisma.level.findUnique({ where: { id: levelId } }),
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
  assert.equal(level?.id, levelId);
  assert.equal(content?.tenantId, null);
  assert.equal(content?.status, "PUBLISHED");
  assert.equal(content?.contentSkills.length, 1);
  assert.equal(version?.status, "PUBLISHED");
  assert.equal(version?.wordCount, wordCount(contentBody));
  assert.equal(questions.length, 5);
  assert.equal(questionVersions.length, 5);
  assert.ok(questionVersions.every((item) => item.status === "PUBLISHED"));
  assert.equal(template?.status, "PUBLISHED");
  assert.equal(templateVersion?.status, "PUBLISHED");
  assert.equal(templateVersion?.contents.length, 1);
  assert.equal(templateVersion?.questions.length, 5);
  assert.equal(session?.status, "COMPLETED");
  assert.equal(session?.attempts.length, 5);
  assert.equal(session?.attempts.filter((attempt) => attempt.rawScore !== null).length, 4);
  assert.equal(session?.attempts.filter((attempt) => attempt.isCorrect === true).length, 4);

  let progress = await prisma.studentProgress.findFirst({
    where: {
      studentId: studentUserId,
      tenantId: studentTenantId,
      skillId: content?.contentSkills[0]?.skillId,
    },
  });
  for (let attempt = 0; !progress && attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    progress = await prisma.studentProgress.findFirst({
      where: {
        studentId: studentUserId,
        tenantId: studentTenantId,
        skillId: content?.contentSkills[0]?.skillId,
      },
    });
  }
  assert.ok(progress, "StudentProgress asenkron agregasyon sonrası oluşmadı");
  assert.equal(progress?.attemptCount, 5);
  assert.equal(progress?.correctCount, 4);
  assert.equal(progress?.accuracy, 1);

  const [pointEvents, streak, badges] = await Promise.all([
    prisma.pointEvent.findMany({ where: { studentId: studentUserId, tenantId: studentTenantId } }),
    prisma.studentStreak.findUnique({
      where: { tenantId_studentId: { tenantId: studentTenantId, studentId: studentUserId } },
    }),
    prisma.studentBadge.findMany({
      where: { studentId: studentUserId, tenantId: studentTenantId },
      include: { badge: true },
    }),
  ]);
  assert.ok(pointEvents.some((event) => event.eventType === "CORRECT_ANSWER" && event.sourceId));
  assert.ok(
    pointEvents.some(
      (event) => event.eventType === "EXERCISE_COMPLETED" && event.sourceId === sessionId,
    ),
  );
  assert.ok(pointEvents.reduce((sum, event) => sum + event.points, 0) >= 110);
  assert.ok((streak?.currentDays ?? 0) >= 1);
  assert.ok(badges.some((award) => award.badge.code === "FIRST_EXERCISE"));
  console.log(
    `DB PASS: published content/version=${content?.id}/${version?.id}, questions=${questions.length}, template/version=${template?.id}/${templateVersion?.id}`,
  );
  console.log(
    `DB PASS: session=${session?.id} attempts=${session?.attempts.length} progress=${progress?.attemptCount}/${progress?.correctCount} xp>=110 streak=${streak?.currentDays} badge=FIRST_EXERCISE`,
  );
}

async function cleanup(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The production schema intentionally protects immutable activity and
    // published versions. This transaction uses the exact captured pilot IDs
    // and disables only database triggers for cleanup; it never uses TRUNCATE.
    await tx.$executeRawUnsafe("SET LOCAL app.platform_role = 'SUPER_ADMIN'");
    await tx.$executeRawUnsafe("SET LOCAL app.user_id = '01a01485-484f-7c3d-ac91-97198d4a246d'");
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    if (studentUserId) {
      await tx.attempt.deleteMany({ where: { session: { studentId: studentUserId } } });
      await tx.studentProgress.deleteMany({ where: { studentId: studentUserId } });
      await tx.pointEvent.deleteMany({ where: { studentId: studentUserId } });
      await tx.studentBadge.deleteMany({ where: { studentId: studentUserId } });
      await tx.studentStreak.deleteMany({ where: { studentId: studentUserId } });
      await tx.consent.deleteMany({ where: { userId: studentUserId } });
      await tx.exerciseSession.deleteMany({ where: { studentId: studentUserId } });
      await tx.studentProfile.deleteMany({ where: { studentId: studentUserId } });
      await tx.membership.deleteMany({ where: { userId: studentUserId } });
      await tx.authSession.deleteMany({ where: { userId: studentUserId } });
      await tx.authIdentity.deleteMany({ where: { userId: studentUserId } });
      await tx.user.deleteMany({ where: { id: studentUserId } });
    }
    if (studentTenantId) await tx.tenant.deleteMany({ where: { id: studentTenantId } });
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
    if (levelId) await tx.level.deleteMany({ where: { id: levelId } });
  });
  const leftovers = {
    user: studentUserId ? await prisma.user.count({ where: { id: studentUserId } }) : 0,
    tenant: studentTenantId ? await prisma.tenant.count({ where: { id: studentTenantId } }) : 0,
    content: contentId ? await prisma.content.count({ where: { id: contentId } }) : 0,
    questions: questionIds.length
      ? await prisma.question.count({ where: { id: { in: questionIds } } })
      : 0,
    template: templateId ? await prisma.exerciseTemplate.count({ where: { id: templateId } }) : 0,
    level: levelId ? await prisma.level.count({ where: { id: levelId } }) : 0,
  };
  assert.deepEqual(leftovers, {
    user: 0,
    tenant: 0,
    content: 0,
    questions: 0,
    template: 0,
    level: 0,
  });
  console.log(
    "CLEANUP PASS: yalnızca pilot fixture kayıtları silindi; test-tenant/test-content ve TRUNCATE kullanılmadı.",
  );
}

async function main(): Promise<void> {
  await prisma.$connect();
  const adminToken = await loginToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log(`PILOT ${PREFIX} başladı: authoring API + browser student flow`);
  try {
    await preparePilot(adminToken);
    await runStudentBrowserFlow();
    await verifyDatabase();
    console.log("PILOT CONTENT / QUESTION / STUDENT FLOW PASS");
  } finally {
    await browser?.close();
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("PILOT FAIL:", error);
  process.exitCode = 1;
});
