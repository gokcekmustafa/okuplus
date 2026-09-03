import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

/**
 * İçerik Yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: İçerikler/Beceriler/Seviyeler menüleri görünür; içerik
 * listesi (arama/kapsam/kurum/tür/durum/beceri filtreleri), global ve kurum
 * kapsamında içerik oluşturma, kapsam rozetleri, yeni sürüm (canlı kelime
 * sayısı), Taslak → İnceleme → Yayın akışı, yayınlanmış sürümün
 * düzenlenememesi (UI + API 400), yayın sonrası yeni sürüm, beceri
 * bağlama/çıkarma, içerik durumu (Yayınlanamaz uyarısı / Arşivlenmiş /
 * Taslak), başlık düzenleme, soft-delete (onaylı), beceri kataloğu
 * (oluşturma/düzenleme/silme + kullanımda olan silinemez), seviye kataloğu
 * (oluşturma/düzenleme/silme) akışları çalışır. Normal tenant kullanıcısı
 * için yönetim menüleri GÖRÜNMEMELİDİR. Responsive (390px) kontrol dahil.
 *
 * Test verisi (tenant + beceri + seviye + içerik) script başında hazırlanır
 * ve script sonunda silinir; TRUNCATE kullanılmaz, kalıcı seed/demo verisine
 * dokunulmaz. PUBLISHED sürümlerin immutable trigger'ı nedeniyle içerik
 * temizliği transaction içinde session_replication_role=replica ile yapılır.
 */
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@okuplus.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-pass-123";

const prisma = new PrismaClient();

const TS = Date.now();
const ORG_NAME = "E2E İçerik Okulu";
const SKILL_A_CODE = `E2E-BECERI-A-${TS}`;
const SKILL_B_CODE = `E2E-BECERI-B-${TS}`;
const LEVEL_CODE = `E2E-SEVIYE-${TS}`;
const GLOBAL_TITLE = `E2E İçerik Global ${TS}`;
const TENANT_TITLE = `E2E İçerik Kurum ${TS}`;

let tenantId = "";
let skillAName = "";
let skillBName = "";
let levelName = "";
let publishedVersionId = "";

async function prepareData() {
  let tenant = await prisma.tenant.findFirst({ where: { name: ORG_NAME } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { type: "ORGANIZATION", name: ORG_NAME, slug: `e2e-icerik-okulu-${TS}` },
    });
  }
  tenantId = tenant.id;
  console.log("Test verisi hazır (E2E kurum).");
}

async function cleanup() {
  // PUBLISHED ContentVersion'lar immutable trigger (manual/007) ile silinemez;
  // temizlik yalnızca bu testin kendi içeriklerine özel, transaction içinde
  // session_replication_role=replica ile yapılır (TRUNCATE değil, hedefli deleteMany).
  const contentRows = await prisma.content.findMany({
    where: { title: { startsWith: "E2E İçerik" } },
    select: { id: true },
  });
  const contentIds = contentRows.map((r) => r.id);
  if (contentIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.contentSkill.deleteMany({ where: { contentId: { in: contentIds } } });
      await tx.contentVersion.deleteMany({ where: { contentId: { in: contentIds } } });
      await tx.content.deleteMany({ where: { id: { in: contentIds } } });
    });
  }

  const skillRows = await prisma.skill.findMany({
    where: { code: { startsWith: "E2E-BECERI-" } },
    select: { id: true },
  });
  if (skillRows.length > 0) {
    await prisma.skill.deleteMany({ where: { id: { in: skillRows.map((r) => r.id) } } });
  }

  const levelRows = await prisma.level.findMany({
    where: { code: LEVEL_CODE },
    select: { id: true },
  });
  if (levelRows.length > 0) {
    await prisma.level.deleteMany({ where: { id: { in: levelRows.map((r) => r.id) } } });
  }

  if (tenantId) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  console.log("E2E test verisi temizlendi.");
}

async function main() {
  await prisma.$connect();
  await prepareData();

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const consoleErrors: string[] = [];

  async function newPage(viewport = null) {
    const page = await browser.newPage({ viewport: viewport ?? { width: 1280, height: 800 } });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    page.on("response", (r) => {
      if (r.status() >= 500) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    return page;
  }

  async function login(page, email, password) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
        await page.fill("#login-email", email);
        await page.fill("#login-password", password);
        await page.click("#login-submit");
        await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 15000 });
        return;
      } catch (err) {
        lastErr = err;
        await page.waitForTimeout(3000);
      }
    }
    throw lastErr;
  }

  async function waitForOptions(page, selector, minOptions, timeout = 7000) {
    await page.waitForFunction(
      (arg) => {
        const el = document.querySelector(arg.selector);
        return el && el.options.length >= arg.min;
      },
      { selector, min: minOptions },
      { timeout },
    );
  }

  async function findOptionValue(page, selector, text) {
    return page.$$eval(
      `${selector} option`,
      (els, name) => {
        const opt = els.find((o) => o.textContent.includes(name));
        return opt ? opt.value : "";
      },
      text,
    );
  }

  async function createSkill(page, code, name) {
    await page.click("#skill-create-btn");
    await page.waitForSelector("#skill-form-modal:not(.hidden)", { timeout: 5000 });
    await page.fill("#skill-form-code", code);
    await page.fill("#skill-form-name", name);
    await page.selectOption("#skill-form-category", "MAIN_IDEA");
    await page.click("#skill-form-submit");
    await page.waitForSelector("#skill-form-modal", { state: "hidden", timeout: 10000 });
    await page.waitForSelector(`#skill-list-body tr:has-text("${code}")`, { timeout: 7000 });
  }

  async function createContent(page, { scope, title, type = "STORY", tenant = "" }) {
    await page.click("#content-create-btn");
    await page.waitForSelector("#content-form-modal:not(.hidden)", { timeout: 5000 });
    await page.selectOption("#content-form-scope", scope);
    if (scope === "TENANT") {
      await page.waitForSelector("#content-form-tenant-field:not(.hidden)", { timeout: 5000 });
      await waitForOptions(page, "#content-form-tenant", 2);
      const value = await findOptionValue(page, "#content-form-tenant", tenant);
      if (!value) throw new Error(`Kurum seçeneklerde yok: ${tenant}`);
      await page.selectOption("#content-form-tenant", value);
    }
    await page.selectOption("#content-form-type", type);
    await page.fill("#content-form-title-input", title);
    await page.fill("#content-form-difficulty", "0.5");
    await page.click("#content-form-submit");
    await page.waitForSelector("#content-form-modal", { state: "hidden", timeout: 10000 });
    await page.waitForSelector(`#content-list-body tr:has-text("${title}")`, { timeout: 7000 });
  }

  // ================= Super Admin =================
  const page = await newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // 1) İçerik / Beceri / Seviye menüleri görünür.
  const contentNavVisible = await page.isVisible('.nav-item[data-page="contents"]');
  const skillNavVisible = await page.isVisible('.nav-item[data-page="skills"]');
  const levelNavVisible = await page.isVisible('.nav-item[data-page="levels"]');
  console.log(
    `1) Super Admin menüleri: İçerikler=${contentNavVisible}, Beceriler=${skillNavVisible}, Seviyeler=${levelNavVisible}`,
  );

  // 2) Beceri sayfası: iki beceri oluşturulur.
  skillAName = `E2E Ana Fikir ${TS}`;
  skillBName = `E2E Ayrıntı ${TS}`;
  await page.click('.nav-item[data-page="skills"]');
  await page.waitForSelector("#page-skills:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#skill-list-body tr", { timeout: 5000 });
  await createSkill(page, SKILL_A_CODE, skillAName);
  await createSkill(page, SKILL_B_CODE, skillBName);
  console.log("2) Beceriler oluşturuldu:", `${SKILL_A_CODE} / ${SKILL_B_CODE}`);

  // 3) Seviye sayfası: seviye oluşturulur.
  levelName = `E2E Başlangıç ${TS}`;
  await page.click('.nav-item[data-page="levels"]');
  await page.waitForSelector("#page-levels:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#level-list-body tr", { timeout: 5000 });
  await page.click("#level-create-btn");
  await page.waitForSelector("#level-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#level-form-code", LEVEL_CODE);
  await page.fill("#level-form-name", levelName);
  await page.fill("#level-form-min-score", "0");
  await page.fill("#level-form-max-score", "100");
  await page.fill("#level-form-grade-band", "1-2. sınıf");
  await page.fill("#level-form-difficulty-min", "0");
  await page.fill("#level-form-difficulty-max", "2");
  await page.click("#level-form-submit");
  await page.waitForSelector("#level-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`#level-list-body tr:has-text("${LEVEL_CODE}")`, { timeout: 7000 });
  console.log(`3) Seviye oluşturuldu: ${LEVEL_CODE}`);

  // 4) İçerik sayfası: global + kurum içeriği oluşturulur.
  await page.click('.nav-item[data-page="contents"]');
  await page.waitForSelector("#page-contents:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#content-list-body tr", { timeout: 5000 });
  await createContent(page, { scope: "GLOBAL", title: GLOBAL_TITLE, type: "STORY" });
  await createContent(page, {
    scope: "TENANT",
    title: TENANT_TITLE,
    type: "PASSAGE",
    tenant: ORG_NAME,
  });
  console.log(`4) İçerikler oluşturuldu: global=${GLOBAL_TITLE}, kurum=${TENANT_TITLE}`);

  // 5) Liste satırı: kapsam rozetleri + tür + zorluk + durum.
  const rowText = await page.$eval(
    `#content-list-body tr:has-text("${GLOBAL_TITLE}")`,
    (el) => el.textContent,
  );
  const globalRowOk =
    rowText.includes("Global") && rowText.includes("Hikâye") && rowText.includes("%50");
  const tenantRowText = await page.$eval(
    `#content-list-body tr:has-text("${TENANT_TITLE}")`,
    (el) => el.textContent,
  );
  const tenantRowOk = tenantRowText.includes("Kurum") && tenantRowText.includes("Okuma Parçası");
  const pageInfo = await page.$eval("#content-page-info", (el) => el.textContent);
  console.log(
    `5) Liste satırları: global(Kapsam/Tür/Zorluk)=${globalRowOk}, kurum=${tenantRowOk}, bilgi=${pageInfo}`,
  );

  // 6) Kapsam filtresi: Kurum → yalnızca kurum içeriği; Global → yalnızca global.
  await page.selectOption("#content-scope-filter", "TENANT");
  await page.waitForSelector(`#content-list-body tr:has-text("${TENANT_TITLE}")`, {
    timeout: 7000,
  });
  await page.waitForTimeout(400);
  const scopeTenantList = await page.$eval("#content-list-body", (el) => el.textContent);
  const scopeTenantOk =
    scopeTenantList.includes(TENANT_TITLE) && !scopeTenantList.includes(GLOBAL_TITLE);
  await page.selectOption("#content-scope-filter", "GLOBAL");
  await page.waitForSelector(`#content-list-body tr:has-text("${GLOBAL_TITLE}")`, {
    timeout: 7000,
  });
  await page.waitForTimeout(400);
  const scopeGlobalList = await page.$eval("#content-list-body", (el) => el.textContent);
  const scopeGlobalOk =
    scopeGlobalList.includes(GLOBAL_TITLE) && !scopeGlobalList.includes(TENANT_TITLE);
  await page.selectOption("#content-scope-filter", "");
  await page.waitForSelector(`#content-list-body tr:has-text("${TENANT_TITLE}")`, {
    timeout: 7000,
  });
  console.log(`6) Kapsam filtresi: Kurum=${scopeTenantOk}, Global=${scopeGlobalOk}`);

  // 7) Kurum filtresi: E2E kurum seçilince yalnızca kurum içeriği.
  await waitForOptions(page, "#content-tenant-filter", 2);
  const tenantOption = await findOptionValue(page, "#content-tenant-filter", ORG_NAME);
  await page.selectOption("#content-tenant-filter", tenantOption);
  await page.waitForSelector(`#content-list-body tr:has-text("${TENANT_TITLE}")`, {
    timeout: 7000,
  });
  await page.waitForTimeout(400);
  const tenantFilterList = await page.$eval("#content-list-body", (el) => el.textContent);
  const tenantFilterOk =
    tenantFilterList.includes(TENANT_TITLE) && !tenantFilterList.includes(GLOBAL_TITLE);
  await page.selectOption("#content-tenant-filter", "");
  await page.waitForSelector(`#content-list-body tr:has-text("${GLOBAL_TITLE}")`, {
    timeout: 7000,
  });
  console.log(`7) Kurum filtresi: ${tenantFilterOk}`);

  // 8) Arama filtresi.
  await page.fill("#content-search", `Kurum ${TS}`);
  await page.waitForSelector(`#content-list-body tr:has-text("${TENANT_TITLE}")`, {
    timeout: 7000,
  });
  await page.waitForTimeout(400);
  const searchList = await page.$eval("#content-list-body", (el) => el.textContent);
  const searchOk = searchList.includes(TENANT_TITLE) && !searchList.includes(GLOBAL_TITLE);
  await page.fill("#content-search", "");
  await page.waitForSelector(`#content-list-body tr:has-text("${GLOBAL_TITLE}")`, {
    timeout: 7000,
  });
  console.log(`8) Arama filtresi: ${searchOk}`);

  // 9) Global içerik detayı: v1 sürümü oluşturulur (canlı kelime sayısı).
  await page.locator("tr", { hasText: GLOBAL_TITLE }).locator("[data-content-detail-id]").click();
  await page.waitForSelector("#content-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#content-version-history", { timeout: 5000 });
  const detailSections = await page.$eval("#content-detail-body", (el) => el.textContent);
  const sectionsOk =
    detailSections.includes("İçerik Bilgileri") &&
    detailSections.includes("Mevcut Sürüm") &&
    detailSections.includes("Beceriler") &&
    detailSections.includes("Sürüm Geçmişi") &&
    detailSections.includes("İçerik Durumu");
  console.log(`9) İçerik detayı bölümleri mevcut: ${sectionsOk}`);

  await page.click("#content-new-version-btn");
  await page.waitForSelector("#version-form-modal:not(.hidden)", { timeout: 5000 });
  const v1Body = "Bu ilk sürüm metni üç kelimedir.";
  await page.fill("#version-form-body", v1Body);
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector("#version-form-wordcount");
      return el && el.textContent.includes(expected);
    },
    "6 kelime",
    { timeout: 5000 },
  );
  await page.fill("#version-form-license", "CC BY 4.0");
  await page.fill("#version-form-changelog", "İlk taslak");
  const wordCountLive = await page.$eval("#version-form-wordcount", (el) => el.textContent);
  await page.click("#version-form-submit");
  await page.waitForSelector("#version-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector('#content-version-history .version-row:has-text("v1")', {
    timeout: 7000,
  });
  console.log(`10) v1 sürümü oluşturuldu; canlı kelime sayısı: ${wordCountLive}`);

  // 11) Taslak → İnceleme → Yayın akışı.
  await page.click("[data-version-review]");
  await page.waitForSelector('#content-version-history .version-row:has-text("İncelemede")', {
    timeout: 7000,
  });
  console.log("11) Sürüm incelemeye alındı (İncelemede).");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("[data-version-publish]");
  await page.waitForSelector('#content-version-history .version-row:has-text("Yayında")', {
    timeout: 10000,
  });
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#content-detail-body");
      return body && body.textContent.includes("Yayında") && body.textContent.includes("kelime");
    },
    null,
    { timeout: 7000 },
  );
  console.log("12) Sürüm yayınlandı (Yayında); mevcut sürümde kelime sayısı görünüyor.");

  // 13) Yayınlanmış sürüm düzenlenemez: Düzenle butonu yok + API 400.
  const publishedRow = page.locator('.version-row:has-text("v1")');
  const editButtonsOnPublished = await publishedRow.locator("[data-version-edit]").count();
  publishedVersionId = await page.$$eval("[data-version-view]", (els) => {
    const row = els.find((e) => e.closest(".version-row")?.textContent.includes("v1"));
    return row ? row.dataset.versionView : "";
  });
  const patchStatus = await page.evaluate(async (id) => {
    const token = localStorage.getItem("oku.accessToken");
    const res = await fetch(`/admin/content-versions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: "immutable olmamali" }),
    });
    return { status: res.status, message: (await res.json())?.error?.message ?? "" };
  }, publishedVersionId);
  console.log(
    `13) Yayınlanmış sürüm: Düzenle butonu yok=${editButtonsOnPublished === 0}, API düzenleme=HTTP ${patchStatus.status} (${patchStatus.message})`,
  );

  // 14) Beceri bağlama: beceri eklenir (chip görünür).
  await waitForOptions(page, "#content-skill-picker", 2);
  const skillAOption = await findOptionValue(page, "#content-skill-picker", skillAName);
  if (!skillAOption) throw new Error("Beceri seçeneklerde yok");
  await page.selectOption("#content-skill-picker", skillAOption);
  await page.click("[data-content-skill-add]");
  await page.waitForFunction(
    (name) => {
      const body = document.querySelector("#content-detail-body");
      return body && body.textContent.includes(name);
    },
    skillAName,
    { timeout: 7000 },
  );
  const skillBound = await page.$eval(
    "#content-detail-body",
    (el, name) => el.textContent.includes(name),
    skillAName,
  );
  console.log(`14) Beceri eklendi (chip): ${skillBound}`);

  // 15) Yayın sonrası yeni sürüm (v2), düzenleme ve tekrar yayın.
  await page.click("#content-new-version-btn");
  await page.waitForSelector("#version-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#version-form-body", "Bu ikinci sürümün metni iki kelime.");
  await page.fill("#version-form-changelog", "Gözden geçirilmiş");
  await page.click("#version-form-submit");
  await page.waitForSelector("#version-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector('#content-version-history .version-row:has-text("v2")', {
    timeout: 7000,
  });
  await page.click('#content-version-history .version-row:has-text("v2") [data-version-edit]');
  await page.waitForSelector("#version-form-modal:not(.hidden)", { timeout: 5000 });
  const editTitle = await page.$eval("#version-form-title", (el) => el.textContent);
  await page.fill("#version-form-body", "Bu ikinci sürüm düzenlenmiş üç kelimedir.");
  await page.click("#version-form-submit");
  await page.waitForSelector("#version-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector('#content-version-history .version-row:has-text("v2")', {
    timeout: 7000,
  });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.click('#content-version-history .version-row:has-text("v2") [data-version-publish]');
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#content-detail-body");
      return body && body.textContent.includes("v2") && body.textContent.includes("Yayında");
    },
    null,
    { timeout: 10000 },
  );
  console.log(`15) v2 oluşturuldu, "${editTitle}" ile düzenlendi ve yayınlandı (mevcut sürüm v2).`);

  await page.click("#content-detail-close");
  await page.waitForSelector("#content-detail-modal", { state: "hidden", timeout: 5000 });
  await page.waitForFunction(
    (title) => {
      const row = Array.from(document.querySelectorAll("#content-list-body tr")).find((r) =>
        r.textContent.includes(title),
      );
      return row && row.querySelectorAll("td")[4]?.textContent.trim() === "2";
    },
    GLOBAL_TITLE,
    { timeout: 7000 },
  );
  const currentVersionCell = await page.$eval(
    `#content-list-body tr:has-text("${GLOBAL_TITLE}") td:nth-child(5)`,
    (el) => el.textContent,
  );
  console.log(`16) Liste "Sürüm" sütunu (yayın sonrası): ${currentVersionCell}`);

  // 17) Kurum içeriği: yayınlanmamış içerik "Yayında" yapılamaz.
  await page.locator("tr", { hasText: TENANT_TITLE }).locator("[data-content-detail-id]").click();
  await page.waitForSelector("#content-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#content-detail-status", "PUBLISHED");
  await page.click("[data-content-status-apply]");
  await page.waitForSelector("#content-error:not(.hidden)", { timeout: 7000 });
  const publishErrText = await page.$eval("#content-error", (el) => el.textContent);
  const publishBlockedOk = publishErrText.includes("yayınlanamaz");
  console.log(
    `17) Yayınlanmamış içerik "Yayında" yapılamaz: ${publishBlockedOk} ("${publishErrText}")`,
  );

  // 18) Durum: Arşivlenmiş → Taslak.
  await page.selectOption("#content-detail-status", "ARCHIVED");
  await page.click("[data-content-status-apply]");
  await page.waitForFunction(
    () => {
      const list = document.querySelector("#content-list-body");
      const status = document.querySelector("#content-detail-status");
      return (
        status && status.value === "ARCHIVED" && list && list.textContent.includes("Arşivlenmiş")
      );
    },
    null,
    { timeout: 10000 },
  );
  await page.selectOption("#content-detail-status", "DRAFT");
  await page.click("[data-content-status-apply]");
  await page.waitForFunction(
    () => {
      const status = document.querySelector("#content-detail-status");
      return status && status.value === "DRAFT";
    },
    null,
    { timeout: 10000 },
  );
  console.log("18) Kurum içeriği durumu: Arşivlenmiş → Taslak geçişleri tamam.");

  // 19) Başlık düzenleme (global içerik).
  await page.click("#content-detail-close");
  await page.waitForSelector("#content-detail-modal", { state: "hidden", timeout: 5000 });
  await page.locator("tr", { hasText: GLOBAL_TITLE }).locator("[data-content-detail-id]").click();
  await page.waitForSelector("#content-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.click("#content-detail-edit");
  await page.waitForSelector("#content-form-modal:not(.hidden)", { timeout: 5000 });
  const editFormTitle = await page.$eval("#content-form-title", (el) => el.textContent);
  const scopeHiddenOnEdit = await page.$eval("#content-form-scope-field", (el) =>
    el.classList.contains("hidden"),
  );
  const typeHiddenOnEdit = await page.$eval("#content-form-type-field", (el) =>
    el.classList.contains("hidden"),
  );
  const newTitle = `E2E İçerik Güncel ${TS}`;
  await page.fill("#content-form-title-input", newTitle);
  await page.fill("#content-form-difficulty", "0.7");
  await page.click("#content-form-submit");
  await page.waitForSelector("#content-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`#content-list-body tr:has-text("${newTitle}")`, { timeout: 7000 });
  console.log(
    `19) Düzenleme ("${editFormTitle}"): kapsam gizli=${scopeHiddenOnEdit}, tür gizli=${typeHiddenOnEdit}, başlık güncellendi (${newTitle})`,
  );

  // 20) Beceri kataloğu: kullanımdaki beceri silinemez, kullanılmayan silinir.
  await page.click('.nav-item[data-page="skills"]');
  await page.waitForSelector("#page-skills:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#skill-list-body tr", { timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("tr", { hasText: SKILL_A_CODE }).locator("[data-skill-delete-id]").click();
  await page.waitForSelector("#skill-error:not(.hidden)", { timeout: 7000 });
  const inUseErr = await page.$eval("#skill-error", (el) => el.textContent);
  const inUseOk = inUseErr.includes("silinemez");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("tr", { hasText: SKILL_B_CODE }).locator("[data-skill-delete-id]").click();
  await page.waitForFunction(
    (code) => {
      const body = document.querySelector("#skill-list-body");
      return body && !body.textContent.includes(code);
    },
    SKILL_B_CODE,
    { timeout: 7000 },
  );
  console.log(
    `20) Kullanımdaki beceri silinemez: ${inUseOk} ("${inUseErr}"); kullanılmayan beceri silindi.`,
  );

  // 21) İçerikten beceri çıkarılır; sonra beceri silinebilir.
  await page.click('.nav-item[data-page="contents"]');
  await page.waitForSelector("#page-contents:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector(`#content-list-body tr:has-text("${newTitle}")`, { timeout: 7000 });
  await page.locator("tr", { hasText: newTitle }).locator("[data-content-detail-id]").click();
  await page.waitForSelector("#content-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector(`[data-skill-remove]`, { timeout: 7000 });
  await page.click("[data-skill-remove]");
  await page.waitForFunction(
    (name) => {
      const body = document.querySelector("#content-detail-body");
      return body && !body.textContent.includes(name);
    },
    skillAName,
    { timeout: 7000 },
  );
  await page.click("#content-detail-close");
  await page.waitForSelector("#content-detail-modal", { state: "hidden", timeout: 5000 });
  await page.click('.nav-item[data-page="skills"]');
  await page.waitForSelector("#page-skills:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#skill-list-body tr", { timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("tr", { hasText: SKILL_A_CODE }).locator("[data-skill-delete-id]").click();
  await page.waitForFunction(
    (code) => {
      const body = document.querySelector("#skill-list-body");
      return body && !body.textContent.includes(code);
    },
    SKILL_A_CODE,
    { timeout: 7000 },
  );
  console.log("21) Beceri içerikten çıkarıldı ve silindi.");

  // 22) Seviye düzenleme + silme.
  await page.click('.nav-item[data-page="levels"]');
  await page.waitForSelector("#page-levels:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#level-list-body tr", { timeout: 5000 });
  await page.locator("tr", { hasText: LEVEL_CODE }).locator("[data-level-edit-id]").click();
  await page.waitForSelector("#level-form-modal:not(.hidden)", { timeout: 5000 });
  const newLevelName = `E2E Gelişmiş ${TS}`;
  await page.fill("#level-form-name", newLevelName);
  await page.click("#level-form-submit");
  await page.waitForSelector("#level-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`#level-list-body tr:has-text("${newLevelName}")`, { timeout: 7000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("tr", { hasText: LEVEL_CODE }).locator("[data-level-delete-id]").click();
  await page.waitForFunction(
    (code) => {
      const body = document.querySelector("#level-list-body");
      return body && !body.textContent.includes(code);
    },
    LEVEL_CODE,
    { timeout: 7000 },
  );
  console.log(`22) Seviye düzenlendi ("${newLevelName}") ve silindi.`);

  // 23) Soft-delete (onay ile) ve listeden kaybolur.
  await page.click('.nav-item[data-page="contents"]');
  await page.waitForSelector("#page-contents:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector(`#content-list-body tr:has-text("${newTitle}")`, { timeout: 7000 });
  await page.locator("tr", { hasText: newTitle }).locator("[data-content-detail-id]").click();
  await page.waitForSelector("#content-detail-modal:not(.hidden)", { timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("#content-detail-delete");
  await page.waitForSelector("#content-detail-modal", { state: "hidden", timeout: 10000 });
  await page.waitForFunction(
    (title) => {
      const body = document.querySelector("#content-list-body");
      return body && !body.textContent.includes(title);
    },
    newTitle,
    { timeout: 7000 },
  );
  console.log("23) Yayınlı içerik soft-delete edildi, listeden kayboldu.");

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const contentsHidden = await demo.$eval('.nav-item[data-page="contents"]', (el) =>
    el.classList.contains("hidden"),
  );
  const skillsHidden = await demo.$eval('.nav-item[data-page="skills"]', (el) =>
    el.classList.contains("hidden"),
  );
  const levelsHidden = await demo.$eval('.nav-item[data-page="levels"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(
    `24) Normal kullanıcı: İçerikler gizli=${contentsHidden}, Beceriler gizli=${skillsHidden}, Seviyeler gizli=${levelsHidden}`,
  );
  await demo.close();

  // ================= Responsive kontrol (390px) =================
  const mobile = await newPage({ width: 390, height: 844 });
  await login(mobile, ADMIN_EMAIL, ADMIN_PASSWORD);
  const toggleVisible = await mobile.isVisible("#sidebar-toggle");
  await mobile.click("#sidebar-toggle");
  await mobile.waitForTimeout(400);
  const sidebarOpen = await mobile.$eval("#sidebar", (el) => el.classList.contains("open"));
  const contentsNavInSidebar = await mobile.isVisible('.nav-item[data-page="contents"]');
  await mobile.mouse.click(330, 400);
  await mobile.waitForTimeout(300);
  const sidebarClosed = await mobile.$eval("#sidebar", (el) => !el.classList.contains("open"));
  console.log(
    `25) Responsive (390px): menü butonu görünür=${toggleVisible}, açıldı=${sidebarOpen}, İçerikler menüsü görünür=${contentsNavInSidebar}, kapandı=${sidebarClosed}`,
  );
  await mobile.close();

  console.log(
    `26) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );

  console.log("İçerik Yönetimi E2E tamamlandı.");
  await browser.close();
  await cleanup();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("TEST HATASI:", err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
