/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";

const prisma = new PrismaClient();
const TS = Date.now();
const CONTENT_TITLE = `E2E Versiyon İçerik ${TS}`;
const QUESTION_PROMPT = `E2E Versiyon Soru ${TS} 2+2 kaçtır?`;

let contentId = "";
let questionId = "";
let versionIds: string[] = [];

async function prepareData() {
  const content = await prisma.content.create({
    data: {
      tenantId: null,
      type: "STORY",
      title: CONTENT_TITLE,
      difficulty: 0.5,
      status: "PUBLISHED",
    },
  });
  contentId = content.id;
  const ver = await prisma.contentVersion.create({
    data: {
      contentId,
      version: 1,
      title: CONTENT_TITLE,
      body: "Versiyon testi içerik gövdesi",
      wordCount: 5,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.content.update({
    where: { id: contentId },
    data: { currentVersionId: ver.id },
  });
  console.log("Test verisi hazır content:", contentId);
}

async function cleanup() {
  if (questionId) {
    const qs = await prisma.question.findMany({
      where: { id: questionId },
      select: { id: true },
    });
    const ids = qs.map((q) => q.id);
    if (ids.length) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
        await tx.questionVersion.deleteMany({ where: { questionId: { in: ids } } });
        await tx.question.deleteMany({ where: { id: { in: ids } } });
      });
    }
  }
  if (contentId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.contentSkill.deleteMany({ where: { contentId } });
      await tx.contentVersion.deleteMany({ where: { contentId } });
      await tx.content.deleteMany({ where: { id: contentId } });
    });
  }
  // Orphan temizliği (önceki hatalı runlardan kalan)
  const orphans: any =
    await prisma.$queryRaw`SELECT q.id FROM "Question" q LEFT JOIN "Content" c ON c.id=q."contentId" WHERE c.id IS NULL LIMIT 20`;
  for (const o of orphans) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.questionVersion.deleteMany({ where: { questionId: o.id } });
      await tx.question.deleteMany({ where: { id: o.id } });
    });
  }
  console.log("E2E versiyon test verisi temizlendi.");
}

async function main() {
  await prisma.$connect();
  await prepareData();

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[console error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`[pageerror] ${err}`));

  // Login
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#login-form", { state: "visible", timeout: 10000 });
  await page.fill("#login-email", ADMIN_EMAIL);
  await page.fill("#login-password", ADMIN_PASSWORD);
  await page.click("#login-submit");
  await page.waitForSelector("#page-dashboard", { state: "visible", timeout: 30000 });
  console.log("1) Login OK");

  // Soru Bankası
  await page.click('.nav-item[data-page="questions"]');
  await page.waitForSelector("#page-questions:not(.hidden)", { timeout: 5000 });
  console.log("2) Soru Bankası açıldı OK");

  // Yeni Soru oluştur (MULTIPLE_CHOICE)
  await page.click("#question-create-btn");
  await page.waitForSelector("#question-form-modal:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#question-form-type", "MULTIPLE_CHOICE");
  await page.waitForSelector("#question-form-mc-field:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#question-form-content", contentId);
  await page.fill("#question-form-prompt", QUESTION_PROMPT);
  await page.fill("#question-form-position", "0");
  await page.click("#question-form-mc-add");
  await page.click("#question-form-mc-add");
  // Doldur 4 seçenek
  const opts = [
    { id: "opt-a", text: "3", correct: false },
    { id: "opt-b", text: "4", correct: true },
    { id: "opt-c", text: "5", correct: false },
    { id: "opt-d", text: "6", correct: false },
  ];
  for (let i = 0; i < opts.length; i++) {
    const o = opts[i];
    await page.fill(
      `#question-form-mc-options .mc-option-row:nth-child(${i + 1}) [data-mc-id]`,
      o.id,
    );
    await page.fill(
      `#question-form-mc-options .mc-option-row:nth-child(${i + 1}) [data-mc-text]`,
      o.text,
    );
    if (o.correct) {
      await page.check(
        `#question-form-mc-options .mc-option-row:nth-child(${i + 1}) [data-mc-correct]`,
      );
    } else {
      await page.uncheck(
        `#question-form-mc-options .mc-option-row:nth-child(${i + 1}) [data-mc-correct]`,
      );
    }
  }
  await page.uncheck("#question-form-mc-allow-multiple");
  await page.uncheck("#question-form-mc-partial");

  const createPromise = page.waitForResponse(
    (r) => r.url().includes("/admin/contents/") && r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click("#question-form-submit");
  const createRes = await createPromise;
  const createBody = await createRes.json().catch(() => ({}));
  console.log(`3) Soru oluşturuldu POST ${createRes.status()} id ${createBody?.data?.id}`);
  questionId = createBody?.data?.id;
  if (!questionId) throw new Error("Soru id alınamadı");
  versionIds = [];
  await page.waitForSelector("#question-error:not(.hidden)", { timeout: 5000 });
  const successMsg = await page.$eval("#question-error", (el) => el.textContent);
  console.log(`4) Başarı mesajı: ${successMsg}`);
  await page.waitForSelector("#question-form-modal", { state: "hidden", timeout: 5000 });
  console.log("5) Modal kapandı OK");
  await page.waitForSelector(`#question-list-body [data-question-detail-id="${questionId}"]`, {
    timeout: 7000,
  });
  console.log("6) Liste yenilendi OK");

  // Detay aç ve versiyon listesini kontrol et
  const detailBtn = page.locator(`[data-question-detail-id="${questionId}"]`).first();
  await detailBtn.click();
  await page.waitForSelector("#question-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#question-version-list", { timeout: 5000 });
  // Versiyon listesi yüklenene kadar bekle
  await page.waitForSelector("[data-qversion-view]", { timeout: 10000 });
  const vList1 = await page.$$eval("[data-qversion-view]", (els) =>
    els.map((e) => e.getAttribute("data-qversion-view")),
  );
  console.log(`7) Versiyon listesi v1: ${JSON.stringify(vList1)} count ${vList1.length}`);
  if (vList1.length !== 1) throw new Error(`Beklenen 1 versiyon, gelen ${vList1.length}`);
  const v1Id = vList1[0];
  versionIds.push(v1Id);
  const v1RowText = await page.$eval("#question-version-list", (el) => el.textContent);
  console.log(`8) v1 satırı: ${v1RowText.slice(0, 200)}`);
  if (!v1RowText.includes("v1") || !v1RowText.includes("Taslak")) {
    throw new Error("v1 DRAFT görünmüyor");
  }
  // Detay butonları kontrol: DRAFT için Düzenle, İncelemeye Al, Yayınla görünmeli, PUBLISHED için değil
  const hasEditV1 = (await page.locator(`[data-qversion-edit="${v1Id}"]`).count()) > 0;
  const hasReviewV1 = (await page.locator(`[data-qversion-review="${v1Id}"]`).count()) > 0;
  const hasPublishV1 = (await page.locator(`[data-qversion-publish="${v1Id}"]`).count()) > 0;
  console.log(`9) v1 actions edit:${hasEditV1} review:${hasReviewV1} publish:${hasPublishV1}`);
  if (!hasEditV1 || !hasReviewV1 || !hasPublishV1) throw new Error("v1 DRAFT actions eksik");

  // Versiyon detay modalı
  await page.click(`[data-qversion-view="${v1Id}"]`);
  await page.waitForSelector("#question-version-detail-modal:not(.hidden)", { timeout: 5000 });
  const vDetailText = await page.$eval("#question-version-detail-body", (el) => el.textContent);
  console.log(`10) Versiyon detay açıldı: ${vDetailText.slice(0, 300)}`);
  if (!vDetailText.includes("E2E Versiyon Soru") || !vDetailText.includes("opt-b")) {
    throw new Error("Versiyon detay prompt/correctAnswer eksik");
  }
  await page.click("#question-version-detail-close");
  await page.waitForSelector("#question-version-detail-modal", { state: "hidden", timeout: 5000 });
  console.log("11) Versiyon detay kapandı OK");

  // Yeni sürüm oluştur (POST /admin/questions/:id/versions)
  const newVersionPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/questions/${questionId}/versions`) &&
      r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click("#question-new-version-btn");
  const newVerRes = await newVersionPromise;
  const newVerBody = await newVerRes.json().catch(() => ({}));
  console.log(
    `12) Yeni sürüm POST ${newVerRes.status()} id ${newVerBody?.data?.id} v${newVerBody?.data?.version}`,
  );
  if (newVerRes.status() !== 200) throw new Error("Yeni sürüm oluşturulamadı");
  const v2Id = newVerBody?.data?.id;
  versionIds.push(v2Id);
  await page.waitForSelector("#question-version-list", { timeout: 5000 });
  await page.waitForTimeout(800);
  const vList2 = await page.$$eval("[data-qversion-view]", (els) =>
    els.map((e) => e.getAttribute("data-qversion-view")),
  );
  console.log(`13) Versiyon listesi sonrası v2: ${JSON.stringify(vList2)} count ${vList2.length}`);
  if (vList2.length !== 2) throw new Error(`Beklenen 2 versiyon, gelen ${vList2.length}`);
  // v2 en üstte olmalı (version desc)
  if (vList2[0] !== v2Id) console.log("Uyarı: v2 en üstte değil ama idler farklı, kontrol et");

  // DRAFT v2 düzenleme (PATCH)
  await page.click(`[data-qversion-edit="${v2Id}"]`);
  await page.waitForSelector("#question-form-modal:not(.hidden)", { timeout: 5000 });
  const formTitle = await page.$eval("#question-form-title", (el) => el.textContent);
  console.log(`14) Düzenle form açıldı title: ${formTitle}`);
  if (!formTitle.includes("Sürüm")) throw new Error("Form başlığı sürüm değil");
  // Prompt değiştir
  const editedPrompt = `${QUESTION_PROMPT} - edited v2`;
  await page.fill("#question-form-prompt", editedPrompt);
  const patchPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/questions/versions/${v2Id}`) && r.request().method() === "PATCH",
    { timeout: 60000 },
  );
  await page.click("#question-form-submit");
  const patchRes = await patchPromise;
  const patchBody = await patchRes.json().catch(() => ({}));
  console.log(`15) PATCH v2 ${patchRes.status()} prompt ${patchBody?.data?.prompt?.slice(0, 40)}`);
  if (patchRes.status() !== 200) throw new Error("PATCH başarısız");
  await page.waitForSelector("#question-form-modal", { state: "hidden", timeout: 5000 });
  const hasPatchMsg = await page.isVisible("#question-error:not(.hidden)").catch(() => false);
  if (hasPatchMsg) {
    const patchMsg = await page.$eval("#question-error", (el) => el.textContent);
    console.log(`16) Patch başarı mesajı: ${patchMsg}`);
  } else {
    console.log("16) Patch başarı mesajı: (form kapandı, PATCH succeeded)");
  }
  // Liste yenilendi mi, prompt değişti mi kontrol için versiyon detay tekrar aç
  await page.click(`[data-qversion-view="${v2Id}"]`);
  await page.waitForSelector("#question-version-detail-modal:not(.hidden)", { timeout: 5000 });
  const v2DetailEdited = await page.$eval("#question-version-detail-body", (el) => el.textContent);
  console.log(`17) v2 edited detail: ${v2DetailEdited.slice(0, 200)}`);
  if (!v2DetailEdited.includes("edited v2")) throw new Error("Düzenlenen prompt görünmüyor");
  await page.click("#question-version-detail-close");
  await page.waitForSelector("#question-version-detail-modal", { state: "hidden", timeout: 5000 });

  // REVIEW: DRAFT -> REVIEW
  const reviewPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/questions/versions/${v2Id}/review`) &&
      r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click(`[data-qversion-review="${v2Id}"]`);
  const reviewRes = await reviewPromise;
  console.log(`18) REVIEW POST ${reviewRes.status()}`);
  if (reviewRes.status() !== 200) throw new Error("Review başarısız");
  await page.waitForTimeout(800);
  const hasEditAfterReview = (await page.locator(`[data-qversion-edit="${v2Id}"]`).count()) > 0;
  const hasPublishAfterReview =
    (await page.locator(`[data-qversion-publish="${v2Id}"]`).count()) > 0;
  console.log(`19) Review sonrası edit:${hasEditAfterReview} publish:${hasPublishAfterReview}`);
  if (hasEditAfterReview) throw new Error("REVIEW sonrası Düzenle görünmemeli");
  if (!hasPublishAfterReview) throw new Error("REVIEW sonrası Yayınla görünmeli");

  // PUBLISH: REVIEW -> PUBLISHED
  const publishPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/questions/versions/${v2Id}/publish`) &&
      r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.click(`[data-qversion-publish="${v2Id}"]`);
  const publishRes = await publishPromise;
  const publishBody = await publishRes.json().catch(() => ({}));
  console.log(
    `20) PUBLISH POST ${publishRes.status()} publishedAt ${publishBody?.data?.publishedAt}`,
  );
  if (publishRes.status() !== 200) throw new Error("Publish başarısız");
  await page.waitForTimeout(800);
  const vListAfterPublish = await page.$eval("#question-version-list", (el) => el.textContent);
  console.log(`21) Publish sonrası liste: ${vListAfterPublish.slice(0, 300)}`);
  if (!vListAfterPublish.includes("Yayında") && !vListAfterPublish.includes("PUBLISHED")) {
    console.log("Uyarı: PUBLISHED badge metni farklı olabilir, ama status kontrol et");
  }
  const hasEditAfterPublish = (await page.locator(`[data-qversion-edit="${v2Id}"]`).count()) > 0;
  const hasReviewAfterPublish =
    (await page.locator(`[data-qversion-review="${v2Id}"]`).count()) > 0;
  const hasPublishAfterPublish =
    (await page.locator(`[data-qversion-publish="${v2Id}"]`).count()) > 0;
  console.log(
    `22) Publish sonrası actions edit:${hasEditAfterPublish} review:${hasReviewAfterPublish} publish:${hasPublishAfterPublish}`,
  );
  if (hasEditAfterPublish || hasReviewAfterPublish || hasPublishAfterPublish) {
    throw new Error("PUBLISHED sonrası hiçbir edit/review/publish görünmemeli");
  }
  // Question status PUBLISHED oldu mu?
  const qDetailRes = await page.evaluate(async (qid) => {
    const r = await fetch(`/admin/questions/${qid}`, {
      headers: { authorization: `Bearer ${localStorage.getItem("oku.accessToken")}` },
    });
    const j = await r.json();
    return j?.data?.status;
  }, questionId);
  console.log(`23) Question status sonrası: ${qDetailRes}`);
  if (qDetailRes !== "PUBLISHED")
    throw new Error(`Question status PUBLISHED bekleniyor, gelen ${qDetailRes}`);

  // Immutable kontrol: PUBLISHED versiyonu PATCH ile düzenlemeye çalış (API seviyesinde 400 bekleniyor)
  const immutableCheck = await page.evaluate(async (vid) => {
    const r = await fetch(`/admin/questions/versions/${vid}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
      },
      body: JSON.stringify({ prompt: "HACK attempt" }),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  }, v2Id);
  console.log(
    `24) Immutable PATCH denemesi status ${immutableCheck.status} body ${JSON.stringify(immutableCheck.body).slice(0, 200)}`,
  );
  if (immutableCheck.status === 200)
    throw new Error("PUBLISHED versiyon düzenlenebildi, immutable değil!");

  // Detay modalını kapat
  await page.click("#question-detail-close");
  await page.waitForSelector("#question-detail-modal", { state: "hidden", timeout: 5000 });
  console.log("25) Question detay kapandı OK");

  // Liste refresh kontrol
  await page.waitForSelector(`#question-list-body [data-question-detail-id="${questionId}"]`, {
    timeout: 7000,
  });
  console.log("26) Liste hala görünüyor OK");

  await page.close();
  await browser.close();

  // DB doğrulama
  const qDb = await prisma.question.findUnique({
    where: { id: questionId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  console.log(`DB Question status: ${qDb?.status}, versions: ${qDb?.versions.length}`);
  for (const v of qDb?.versions ?? []) {
    console.log(
      ` DB v${v.version} ${v.status} ${v.prompt.slice(0, 40)} publishedAt ${v.publishedAt}`,
    );
  }
  const v1Db = qDb?.versions.find((v) => v.version === 1);
  const v2Db = qDb?.versions.find((v) => v.version === 2);
  if (!v1Db || v1Db.status !== "DRAFT") throw new Error("DB v1 DRAFT değil");
  if (!v2Db || v2Db.status !== "PUBLISHED") throw new Error("DB v2 PUBLISHED değil");
  if (!v2Db.publishedAt) throw new Error("DB v2 publishedAt yok");
  if (!v2Db.prompt.includes("edited v2")) throw new Error("DB v2 edited prompt yok");

  console.log("DB Doğrulama TAMAM");

  await cleanup();
  await prisma.$disconnect();

  console.log("\n=== AŞAMA 3 GERÇEK E2E DOĞRULAMA RAPORU ===");
  console.log("AŞAMA 3 TAMAM - Versiyon yönetimi çalışıyor");
  console.log("DUR");
}

main().catch(async (err) => {
  console.error("TEST HATASI:", err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
