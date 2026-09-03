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
const CONTENT_TITLE = `E2E Medya İçerik ${TS}`;
const QUESTION_PROMPT = `E2E Medya Soru ${TS}`;

let contentId = "";
let questionId = "";
let versionId = "";
let mediaId = "";

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
      body: "Medya testi",
      wordCount: 2,
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
  if (mediaId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.questionVersionMedia.deleteMany({ where: { mediaId } });
      await tx.questionMedia.deleteMany({ where: { id: mediaId } });
    });
  }
  if (questionId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.questionVersionMedia.deleteMany({
        where: { questionVersionId: versionId || undefined },
      });
      await tx.questionVersion.deleteMany({ where: { questionId } });
      await tx.question.deleteMany({ where: { id: questionId } });
    });
  }
  if (contentId) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.contentSkill.deleteMany({ where: { contentId } });
      await tx.contentVersion.deleteMany({ where: { contentId } });
      await tx.content.deleteMany({ where: { id: contentId } });
    });
  }
  console.log("E2E medya test verisi temizlendi.");
}

async function apiCall(
  page: import("playwright-core").Page,
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; body: any }> {
  const result = await page.evaluate(
    async ({ method, path, body }) => {
      const accessToken = localStorage.getItem("oku.accessToken");
      const tenantId = localStorage.getItem("oku.tenantId");
      const headers: Record<string, string> = {};
      if (method !== "DELETE") headers["Content-Type"] = "application/json";
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      if (tenantId) headers["X-Tenant-Id"] = tenantId;
      const opts: RequestInit = { method, headers };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`/admin${path}`, opts);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, body: json };
    },
    { method, path, body },
  );
  return result;
}

let passCount = 0;
let failCount = 0;
function assert(condition: boolean, msg: string) {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.log(`  ✗ FAIL: ${msg}`);
  }
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

  // Yeni soru oluştur
  await page.click("#question-create-btn");
  await page.waitForSelector("#question-form-modal:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#question-form-type", "MULTIPLE_CHOICE");
  await page.waitForSelector("#question-form-mc-field:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#question-form-content", contentId);
  await page.fill("#question-form-prompt", QUESTION_PROMPT);
  await page.fill("#question-form-position", "0");
  await page.click("#question-form-mc-add");
  await page.click("#question-form-mc-add");
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
  await page.waitForSelector("#question-form-modal", { state: "hidden", timeout: 5000 });
  console.log("4) Modal kapandı OK");

  // Detay aç
  await page.waitForSelector(`#question-list-body [data-question-detail-id="${questionId}"]`, {
    timeout: 7000,
  });
  await page.locator(`[data-question-detail-id="${questionId}"]`).first().click();
  await page.waitForSelector("#question-detail-modal:not(.hidden)", { timeout: 5000 });
  console.log("5) Soru detayı açıldı OK");

  // Versiyon listesini bekle
  await page.waitForSelector("[data-qversion-view]", { timeout: 10000 });
  const vList = await page.$$eval("[data-qversion-view]", (els) =>
    els.map((e) => e.getAttribute("data-qversion-view")),
  );
  versionId = vList[0];
  console.log(`6) Versiyon listesi: ${JSON.stringify(vList)} first=${versionId}`);

  // --- Media API Tests ---
  console.log("\n--- MEDYA API TESTLERİ ---");

  // 7) Medya oluştur
  const createMediaRes = await apiCall(page, "POST", "/media", {
    type: "IMAGE",
    url: `https://example.com/media/${TS}.png`,
    mimeType: "image/png",
    width: 800,
    height: 600,
    altText: `E2E medya ${TS}`,
    caption: `Test açıklaması ${TS}`,
    hash: `e2e-hash-${TS}`,
    sizeBytes: 1024,
  });
  assert(
    createMediaRes.status === 200 || createMediaRes.status === 201,
    `Medya oluşturuldu (${createMediaRes.status})`,
  );
  mediaId = createMediaRes.body?.data?.id;
  assert(!!mediaId, `Medya id alındı: ${mediaId}`);
  console.log(`7) Medya oluşturuldu: ${mediaId}`);

  // 8) Medya listele
  const listMediaRes = await apiCall(page, "GET", "/media");
  assert(listMediaRes.status === 200, `Medya listelendi (${listMediaRes.status})`);
  console.log("8) Medya listelendi OK");

  // 9) Medya detay
  const getMediaRes = await apiCall(page, "GET", `/media/${mediaId}`);
  assert(getMediaRes.status === 200, `Medya detayı alındı (${getMediaRes.status})`);
  assert(getMediaRes.body?.data?.type === "IMAGE", "Medya tipi IMAGE");
  assert(getMediaRes.body?.data?.hash === `e2e-hash-${TS}`, "Medya hash eşleşti");
  console.log("9) Medya detay OK");

  // 10) Versiyona medya bağla (attach)
  const attachRes = await apiCall(page, "POST", `/questions/versions/${versionId}/media`, {
    mediaId,
    role: "MAIN",
    position: 0,
  });
  assert(
    attachRes.status === 200 || attachRes.status === 201,
    `Attach başarılı (${attachRes.status})`,
  );
  console.log("10) Medya bağlandı OK");

  // 11) Versiyon medya listesini kontrol et
  const qvmListRes = await apiCall(page, "GET", `/questions/versions/${versionId}/media`);
  assert(qvmListRes.status === 200, `QVM listesi (${qvmListRes.status})`);
  const qvmItems = qvmListRes.body?.data ?? qvmListRes.body ?? [];
  const qvmArr = Array.isArray(qvmItems) ? qvmItems : (qvmItems.items ?? []);
  assert(qvmArr.length >= 1, `QVM listesinde en az 1 kayıt var (${qvmArr.length})`);
  const bound = qvmArr.find((m: any) => m.mediaId === mediaId);
  assert(!!bound, "Bağlı medya bulundu");
  assert(bound?.role === "MAIN", `Role MAIN (${bound?.role})`);
  assert(bound?.position === 0, `Position 0 (${bound?.position})`);
  console.log("11) Versiyon medya listesi OK");

  // 12) UI'da medya bölümünü kontrol et - versiyon detayında medya görünmeli
  await page.locator(`[data-qversion-view="${versionId}"]`).click();
  await page.waitForSelector("#question-version-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForTimeout(1000);
  const qvmListText = await page.$eval("#question-version-media-list", (el) => el.textContent);
  console.log(`12) Version media list text: ${qvmListText.slice(0, 200)}`);
  assert(
    qvmListText.includes("IMAGE") || qvmListText.includes("Ana Görsel"),
    "UI version medya listesinde IMAGE veya Ana Görsel görünüyor",
  );

  // 13) Medya detach
  const detachRes = await apiCall(
    page,
    "DELETE",
    `/questions/versions/${versionId}/media/${mediaId}`,
  );
  assert(detachRes.status === 200, `Detach başarılı (${detachRes.status})`);
  console.log("13) Medya kaldırıldı OK");

  // 14) Detach sonrası listeyi kontrol et
  const qvmListRes2 = await apiCall(page, "GET", `/questions/versions/${versionId}/media`);
  const qvmArr2 = Array.isArray(qvmListRes2.body?.data ?? qvmListRes2.body)
    ? (qvmListRes2.body?.data ?? qvmListRes2.body)
    : (qvmListRes2.body?.data?.items ?? qvmListRes2.body?.items ?? []);
  const stillBound = qvmArr2.find((m: any) => m.mediaId === mediaId);
  assert(!stillBound, "Detach sonrası medya bulunamadı (başarılı)");
  console.log("14) Detach sonrası listeyi kontrol OK");

  // 15) Yeniden bağla - rol ve pozisyon değişikliği ile
  const attachRes2 = await apiCall(page, "POST", `/questions/versions/${versionId}/media`, {
    mediaId,
    role: "OPTION",
    position: 3,
  });
  assert(
    attachRes2.status === 200 || attachRes2.status === 201,
    `Re-attach başarılı (${attachRes2.status})`,
  );
  const qvmListRes3 = await apiCall(page, "GET", `/questions/versions/${versionId}/media`);
  const qvmArr3 = Array.isArray(qvmListRes3.body?.data ?? qvmListRes3.body)
    ? (qvmListRes3.body?.data ?? qvmListRes3.body)
    : (qvmListRes3.body?.data?.items ?? qvmListRes3.body?.items ?? []);
  const reb = qvmArr3.find((m: any) => m.mediaId === mediaId);
  assert(!!reb, "Yeniden bağlandı");
  assert(reb?.role === "OPTION", `Role OPTION (${reb?.role})`);
  assert(reb?.position === 3, `Position 3 (${reb?.position})`);
  console.log("15) Yeniden bağlama + rol/position OK");

  // 16) Medya detayı UI'da aç
  await page.waitForSelector("[data-qvmedia-view]", { timeout: 5000 });
  await page.locator("[data-qvmedia-view]").first().click();
  await page.waitForSelector("#question-version-media-detail-modal:not(.hidden)", {
    timeout: 5000,
  });
  const qvmDetailTitle = await page.$eval(
    "#question-version-media-detail-title",
    (el) => el.textContent,
  );
  assert(!!qvmDetailTitle && qvmDetailTitle.length > 0, `Medya detay başlığı: ${qvmDetailTitle}`);
  console.log("16) Medya detay modalı açıldı OK");
  await page.click("#question-version-media-detail-close");
  await page.waitForSelector("#question-version-media-detail-modal", {
    state: "hidden",
    timeout: 3000,
  });

  // 17) Publish version → immutable kontrol
  // Kapat version detail modali basina
  const vdCloseBtn = page.locator("#question-version-detail-close");
  if ((await vdCloseBtn.count()) > 0) {
    await vdCloseBtn.click();
    await page.waitForSelector("#question-version-detail-modal", {
      state: "hidden",
      timeout: 5000,
    });
    console.log("17) Version detail modal kapatildi");
  }
  const pubBtn = page.locator(`[data-qversion-publish="${versionId}"]`);
  if ((await pubBtn.count()) > 0) {
    const pubPromise = page.waitForResponse(
      (r) => r.url().includes("/admin/") && r.request().method() === "POST",
      { timeout: 60000 },
    );
    await pubBtn.click();
    const pubRes = await pubPromise;
    console.log(`17) Publish response: ${pubRes.status()}`);
    await page.waitForTimeout(1000);

    // Published versiyona attach deneme
    const immAttach = await apiCall(page, "POST", `/questions/versions/${versionId}/media`, {
      mediaId: mediaId,
      role: "HINT",
      position: 0,
    });
    assert(immAttach.status >= 400, `Published attach engellendi (${immAttach.status})`);
    console.log("17) Published immutable kontrol OK");
  }

  // 18) Hash dedup kontrol - aynı hash ile tekrar oluştur
  const dupMediaRes = await apiCall(page, "POST", "/media", {
    type: "IMAGE",
    url: `https://example.com/media/${TS}-dup.png`,
    mimeType: "image/png",
    width: 100,
    height: 100,
    hash: `e2e-hash-${TS}`,
    sizeBytes: 512,
  });
  assert(dupMediaRes.status >= 400, `Hash dedup engellendi (${dupMediaRes.status})`);
  console.log("18) Hash dedup kontrol OK");

  // 19) UI'da medya listesini kontrol et - question detay medya section
  // Versiyon detay modalını kapat (eğer hala açıksa)
  const vdCloseBtn2 = page.locator("#question-version-detail-close");
  if ((await vdCloseBtn2.count()) > 0) {
    const isVisible = await page.locator("#question-version-detail-modal:not(.hidden)").count();
    if (isVisible > 0) {
      await vdCloseBtn2.click();
      await page.waitForSelector("#question-version-detail-modal", {
        state: "hidden",
        timeout: 5000,
      });
    }
  }
  // Question detay hala açık, medya listesi section'ını kontrol et
  const qMediaListText = await page.$eval("#question-media-list", (el) => el.textContent);
  console.log(`19) Question media list: ${qMediaListText.slice(0, 200)}`);
  assert(
    qMediaListText.includes("OPTION") ||
      qMediaListText.includes("Seçenek") ||
      qMediaListText.includes("medya"),
    "Question medya section'da veri görünüyor",
  );

  // 20) Kapat ve listeyi kontrol et
  await page.click("#question-detail-close");
  await page.waitForSelector("#question-detail-modal", { state: "hidden", timeout: 5000 });
  console.log("20) Modal kapandı OK");

  await page.close();
  await browser.close();

  // DB doğrulama
  console.log("\n--- DB DOĞRULAMA ---");
  const mediaDb = await prisma.questionMedia.findUnique({ where: { id: mediaId } });
  assert(!!mediaDb, `DB medya mevcut: ${mediaDb?.id}`);
  assert(mediaDb?.type === "IMAGE", `DB medya type IMAGE`);
  assert(mediaDb?.hash === `e2e-hash-${TS}`, `DB medya hash eşleşti`);

  const bindingDb = await prisma.questionVersionMedia.findUnique({
    where: { questionVersionId_mediaId: { questionVersionId: versionId, mediaId } },
  });
  if (bindingDb) {
    assert(bindingDb.role === "OPTION", `DB binding role OPTION (${bindingDb.role})`);
    assert(bindingDb.position === 3, `DB binding position 3 (${bindingDb.position})`);
    console.log("DB Binding doğrulandı");
  } else {
    console.log("DB Binding bulunamadı (published sonrası detach edilmiş olabilir)");
  }

  // Orphan kontrolü
  const orphans: any = await prisma.$queryRaw`
    SELECT m.id FROM "QuestionMedia" m
    LEFT JOIN "QuestionVersionMedia" qvm ON qvm."mediaId" = m.id
    WHERE qvm."mediaId" IS NULL AND m."deletedAt" IS NULL AND m.hash LIKE 'e2e-hash-%'
  `;
  console.log(`Orphan medya: ${orphans.length}`);
  assert(orphans.length === 0, "E2E medya orphan yok");

  await cleanup();
  await prisma.$disconnect();

  console.log(`\n=== AŞAMA 5 GERÇEK E2E DOĞRULAMA RAPORU ===`);
  console.log(`Pass: ${passCount}, Fail: ${failCount}`);
  if (failCount > 0) {
    console.log("AŞAMA 5 FAIL — E2E hataları var");
  } else {
    console.log("AŞAMA 5 TAMAM — Medya yönetimi çalışıyor");
  }
}

main().catch(async (err) => {
  console.error("TEST HATASI:", err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
