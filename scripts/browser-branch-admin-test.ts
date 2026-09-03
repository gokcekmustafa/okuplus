import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

/**
 * Şube yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: Şubeler menüsü görünür, şube sayfası, Yeni Şube (yalnızca
 * ORGANIZATION kurumlar), müdür listesi yükleme, şube oluşturma, detay,
 * istatistikler, müdür atama/değiştirme/kaldırma, düzenleme, durum değiştirme
 * (Aktif/Pasif/Kapalı), soft-delete ve silinenin listeden kaybolması akışları
 * çalışır. INDIVIDUAL kurum yeni şube formunda görünmemelidir. Normal tenant
 * kullanıcısı için Şubeler menüsü GÖRÜNMEMELİDİR. Responsive kontrol dahil.
 *
 * Test verisi (tenant/müdürler/öğretmen/akademik yıl/sınıf) script başında
 * hazırlanır ve script sonunda silinir; kalıcı seed verisine dokunulmaz.
 */
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@okuplus.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-pass-123";

const prisma = new PrismaClient();

const TS = Date.now();
const ORG_NAME = "E2E Şube Okulu";
const IND_NAME = "E2E Şube Bireysel";
const MANAGER_1 = { name: "E2E Müdür 1", email: `e2e-mudur-1-${TS}@example.com` };
const MANAGER_2 = { name: "E2E Müdür 2", email: `e2e-mudur-2-${TS}@example.com` };
const TEACHER_EMAIL = `e2e-sube-ogretmen-${TS}@example.com`;

let orgTenantId = "";
let indTenantId = "";
let branchCode = "";
let branchName = "";
let branchUpdatedName = "";

async function prepareData() {
  // ORGANIZATION kurum + 2 şube müdürü (BRANCH_MANAGER üyelikleriyle).
  let orgTenant = await prisma.tenant.findFirst({ where: { name: ORG_NAME } });
  if (!orgTenant) {
    orgTenant = await prisma.tenant.create({
      data: { type: "ORGANIZATION", name: ORG_NAME, slug: `e2e-sube-okulu-${TS}` },
    });
  }
  orgTenantId = orgTenant.id;

  // INDIVIDUAL kurum (formda görünmeme testi için).
  let indTenant = await prisma.tenant.findFirst({ where: { name: IND_NAME } });
  if (!indTenant) {
    indTenant = await prisma.tenant.create({
      data: { type: "INDIVIDUAL", name: IND_NAME, slug: `e2e-sube-bireysel-${TS}` },
    });
  }
  indTenantId = indTenant.id;

  for (const m of [MANAGER_1, MANAGER_2]) {
    let user = await prisma.user.findFirst({ where: { email: m.email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: m.email, displayName: m.name, passwordHash: "e2e-no-login" },
      });
    }
    const hasMembership = await prisma.membership.findFirst({
      where: { userId: user.id, tenantId: orgTenantId, role: "BRANCH_MANAGER" },
    });
    if (!hasMembership) {
      await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId: orgTenantId,
          role: "BRANCH_MANAGER",
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });
    }
  }

  console.log("Test verisi hazır (ORGANIZATION/INDIVIDUAL tenant + 2 şube müdürü).");
}

async function cleanup() {
  const ids = [orgTenantId, indTenantId].filter(Boolean);
  if (ids.length === 0) return;

  await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.teacherBranchMembership.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.enrollment.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.class.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.branch.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: ids } } });

  const managerUserIds = (
    await prisma.user.findMany({
      where: { email: { in: [MANAGER_1.email, MANAGER_2.email, TEACHER_EMAIL] } },
      select: { id: true },
    })
  ).map((u) => u.id);
  if (managerUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: managerUserIds } } });
  }
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  console.log("E2E test verisi temizlendi.");
}

async function main() {
  await prisma.$connect();
  await prepareData();

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const consoleErrors = [];

  async function newPage(viewport = null) {
    const page = await browser.newPage({ viewport: viewport ?? { width: 1280, height: 800 } });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    return page;
  }

  async function login(page, email, password) {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", email);
    await page.fill("#login-password", password);
    await page.click("#login-submit");
    await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  }

  // ================= Super Admin =================
  const page = await newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // 1) Şubeler menüsü görünür ve açılır.
  const branchesNavVisible = await page.isVisible('.nav-item[data-page="branches"]');
  console.log(`1) Super Admin: Şubeler menüsü görünür: ${branchesNavVisible}`);

  await page.click('.nav-item[data-page="branches"]');
  await page.waitForSelector("#page-branches:not(.hidden)", { timeout: 5000 });
  const pageTitle = await page.$eval("#page-branches h2", (el) => el.textContent);
  console.log(`2) Şubeler sayfası açıldı: ${pageTitle}`);

  // Liste boş durumda yüklenir.
  await page.waitForSelector("#branch-list-body tr", { timeout: 5000 });
  console.log("3) Şube listesi yüklendi: OK");

  // 4) Yeni Şube: yalnızca ORGANIZATION kurumlar görünür.
  await page.click("#branch-create-btn");
  await page.waitForSelector("#branch-form-modal:not(.hidden)", { timeout: 5000 });
  const formTitle = await page.$eval("#branch-form-title", (el) => el.textContent);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#branch-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  const tenantOptions = await page.$$eval("#branch-form-tenant option", (els) =>
    els.map((o) => o.textContent),
  );
  const orgPresent = tenantOptions.some((t) => t.includes(ORG_NAME));
  const indAbsent = !tenantOptions.some((t) => t.includes(IND_NAME));
  const orgOption = await page.$$eval(
    "#branch-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    ORG_NAME,
  );
  if (!orgOption) throw new Error("E2E Şube Okulu kurumu seçeneklerde yok");
  console.log(
    `4) Yeni Şube modalı "${formTitle}": ORGANIZATION görünür=${orgPresent}, INDIVIDUAL gizli=${indAbsent}`,
  );

  // 5) Kurum seçilince şube müdürleri yüklenir.
  await page.selectOption("#branch-form-tenant", orgOption);
  await page.waitForFunction(
    (name) => {
      const sel = document.querySelector("#branch-form-manager");
      return (
        sel &&
        sel.options.length > 1 &&
        Array.from(sel.options).some((o) => o.textContent.includes(name))
      );
    },
    MANAGER_1.name,
    { timeout: 5000 },
  );
  const managerOptionsCount = await page.$$eval("#branch-form-manager option", (els) => els.length);
  console.log(`5) Müdür listesi yüklendi (${managerOptionsCount} seçenek, E2E Müdür 1 mevcut): OK`);

  // 6) Şube oluştur (müdür atamadan).
  branchName = `E2E Şube ${TS}`;
  branchUpdatedName = `E2E Şube Güncel ${TS}`;
  branchCode = `E2E-${TS}`;
  await page.fill("#branch-form-name", branchName);
  await page.fill("#branch-form-code", branchCode);
  await page.fill("#branch-form-address", "Test Adres Mah. No:1");
  await page.fill("#branch-form-phone", "+905550000000");
  await page.click("#branch-form-submit");
  await page.waitForSelector("#branch-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${branchName}`, { timeout: 5000 });
  console.log(`6) Şube oluşturuldu: ${branchName} (kod: ${branchCode})`);

  // 7) Liste satırında görünür.
  const rowText = await page.$eval(
    `#branch-list-body tr:has-text("${branchName}")`,
    (el) => el.textContent,
  );
  const rowOk =
    rowText.includes(branchCode) && rowText.includes(ORG_NAME) && rowText.includes("Aktif");
  console.log(
    `7) Liste satırı: kod=${rowText.includes(branchCode)}, kurum=${rowText.includes(ORG_NAME)}, durum=Aktif => ${rowOk}`,
  );

  // İstatistikler için şubeye sınıf + öğretmen üyeliği ekle (prisma ile).
  const created = await prisma.branch.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: orgTenantId, code: branchCode } },
  });
  const ay = await prisma.academicYear.create({
    data: {
      tenantId: orgTenantId,
      name: `E2E-${TS}`,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-06-15"),
      status: "ACTIVE",
    },
  });
  await prisma.class.create({
    data: {
      tenantId: orgTenantId,
      branchId: created.id,
      academicYearId: ay.id,
      name: `E2E-Sinif-${TS}`,
      gradeLevel: 7,
    },
  });
  const teacher = await prisma.user.create({
    data: { email: TEACHER_EMAIL, displayName: "E2E Şube Öğretmeni", passwordHash: "e2e-no-login" },
  });
  await prisma.teacherBranchMembership.create({
    data: {
      tenantId: orgTenantId,
      branchId: created.id,
      teacherId: teacher.id,
      status: "ACTIVE",
    },
  });

  // 8) Detay açılır.
  await page.locator("tr", { hasText: branchName }).locator("[data-branch-detail-id]").click();
  await page.waitForSelector("#branch-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#branch-detail-manager");
      return sel && sel.options.length > 0;
    },
    null,
    { timeout: 5000 },
  );
  const detailText = await page.$eval("#branch-detail-body", (el) => el.textContent);
  const detailOk =
    detailText.includes("Şube Bilgileri") &&
    detailText.includes("İstatistikler") &&
    detailText.includes("Şube Müdürü") &&
    detailText.includes("Şube Durumu") &&
    detailText.includes("Atanmamış");
  const statsOk = detailText.includes("Sınıf sayısı") && detailText.includes("Öğretmen sayısı");
  console.log(`8) Detay bölümleri mevcut: ${detailOk}, istatistikler mevcut: ${statsOk}`);

  // 9) Müdür atama (E2E Müdür 1).
  await page.waitForFunction(
    (name) => {
      const sel = document.querySelector("#branch-detail-manager");
      return sel && Array.from(sel.options).some((o) => o.textContent.includes(name));
    },
    MANAGER_1.name,
    { timeout: 5000 },
  );
  const m1Value = await page.$$eval(
    "#branch-detail-manager option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    MANAGER_1.name,
  );
  await page.selectOption("#branch-detail-manager", m1Value);
  await page.click("[data-branch-manager-assign]");
  await page.waitForFunction(
    (name) => {
      const body = document.querySelector("#branch-detail-body");
      return body && body.textContent.includes(name) && !body.textContent.includes("Atanmamış");
    },
    MANAGER_1.name,
    { timeout: 5000 },
  );
  const afterAssign = await page.$eval("#branch-detail-body", (el) => el.textContent);
  console.log(`9) Müdür atandı (${MANAGER_1.name}): ${afterAssign.includes(MANAGER_1.name)}`);

  // 10) Düzenleme: tenant/müdür alanları gizli, ad/kod/adres/telefon güncellenir.
  await page.click("#branch-detail-edit");
  await page.waitForSelector("#branch-form-modal:not(.hidden)", { timeout: 5000 });
  const editTitle = await page.$eval("#branch-form-title", (el) => el.textContent);
  const tenantHidden = await page.$eval("#branch-form-tenant", (el) =>
    el.closest("label.field").classList.contains("hidden"),
  );
  const managerFieldHidden = await page.$eval("#branch-form-manager-field", (el) =>
    el.classList.contains("hidden"),
  );
  await page.fill("#branch-form-name", branchUpdatedName);
  await page.fill("#branch-form-code", branchCode);
  await page.fill("#branch-form-address", "Güncel Adres Mah. No:2");
  await page.click("#branch-form-submit");
  await page.waitForSelector("#branch-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${branchUpdatedName}`, { timeout: 5000 });
  console.log(
    `10) Düzenleme ("${editTitle}"): tenant alanı gizli=${tenantHidden}, müdür alanı gizli=${managerFieldHidden}, ad güncellendi`,
  );

  // 11) Durum değiştirme: Aktif -> Pasif -> Aktif.
  await page
    .locator("tr", { hasText: branchUpdatedName })
    .locator("[data-branch-detail-id]")
    .click();
  await page.waitForSelector("#branch-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#branch-detail-status", { timeout: 5000 });
  await page.selectOption("#branch-detail-status", "INACTIVE");
  // Re-render sonrası yeni select düğümünü bekler (eski select + eski guard eşleşmesini önler).
  await page.evaluate(() => {
    window.__branchStatusSelect = document.querySelector("#branch-detail-status");
  });
  await page.click("[data-branch-status-apply]");
  await page.waitForFunction(
    () => {
      const status = document.querySelector("#branch-detail-status");
      return status && status !== window.__branchStatusSelect && status.value === "INACTIVE";
    },
    null,
    { timeout: 10000 },
  );
  const afterInactive = await page.$eval("#branch-detail-body", (el) => el.textContent);
  console.log(`11a) Durum Pasif'e değiştirildi: ${afterInactive.includes("Pasif")}`);

  await page.selectOption("#branch-detail-status", "ACTIVE");
  await page.evaluate(() => {
    window.__branchStatusSelect = document.querySelector("#branch-detail-status");
  });
  await page.click("[data-branch-status-apply]");
  await page.waitForFunction(
    () => {
      const status = document.querySelector("#branch-detail-status");
      return status && status !== window.__branchStatusSelect && status.value === "ACTIVE";
    },
    null,
    { timeout: 10000 },
  );
  const statusDetail = await page.$eval("#branch-detail-body", (el) => el.textContent);
  console.log(`11b) Durum Aktif'e geri döndü => ${statusDetail.includes("Aktif")}`);

  // 12) Müdür değiştirme (E2E Müdür 2) + kaldırma.
  await page.waitForFunction(
    (name) => {
      const sel = document.querySelector("#branch-detail-manager");
      return sel && Array.from(sel.options).some((o) => o.textContent.includes(name));
    },
    MANAGER_2.name,
    { timeout: 5000 },
  );
  const m2Value = await page.$$eval(
    "#branch-detail-manager option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    MANAGER_2.name,
  );
  await page.selectOption("#branch-detail-manager", m2Value);
  await page.click("[data-branch-manager-assign]");
  await page.waitForFunction(
    (name) => {
      const body = document.querySelector("#branch-detail-body");
      return body && body.textContent.includes(name);
    },
    MANAGER_2.name,
    { timeout: 5000 },
  );
  const changed = await page.$eval("#branch-detail-body", (el) => el.textContent);
  console.log(`12a) Müdür değiştirildi (${MANAGER_2.name}): ${changed.includes(MANAGER_2.name)}`);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("[data-branch-manager-remove]");
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#branch-detail-body");
      return body && body.textContent.includes("Atanmamış");
    },
    null,
    { timeout: 5000 },
  );
  const afterRemove = await page.$eval("#branch-detail-body", (el) => el.textContent);
  console.log(`12b) Müdür kaldırıldı (Atanmamış): ${afterRemove.includes("Atanmamış")}`);

  // 13) Soft-delete.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("#branch-detail-delete");
  await page.waitForSelector("#branch-detail-modal", { state: "hidden", timeout: 10000 });
  await page.waitForTimeout(1200);

  // 14) Silinen şube listeden kaybolur.
  const afterDelete = await page.$eval("#branch-list-body", (el) => el.textContent);
  const deletedGone = !afterDelete.includes(branchUpdatedName);
  console.log(`13/14) Şube soft-delete edildi, listeden kayboldu: ${deletedGone}`);

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const branchesNavHidden = await demo.$eval('.nav-item[data-page="branches"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(`15) Normal kullanıcı: Şubeler menüsü gizli: ${branchesNavHidden}`);
  await demo.close();

  // ================= Responsive kontrol =================
  const mobile = await newPage({ width: 390, height: 844 });
  await login(mobile, ADMIN_EMAIL, ADMIN_PASSWORD);
  const toggleVisible = await mobile.isVisible("#sidebar-toggle");
  await mobile.click("#sidebar-toggle");
  await mobile.waitForTimeout(400);
  const sidebarOpen = await mobile.$eval("#sidebar", (el) => el.classList.contains("open"));
  const branchesNavInSidebar = await mobile.isVisible('.nav-item[data-page="branches"]');
  await mobile.mouse.click(330, 400);
  await mobile.waitForTimeout(300);
  const sidebarClosed = await mobile.$eval("#sidebar", (el) => !el.classList.contains("open"));
  console.log(
    `16) Responsive: menü butonu görünür=${toggleVisible}, açıldı=${sidebarOpen}, Şubeler menüsü görünür=${branchesNavInSidebar}, kapandı=${sidebarClosed}`,
  );
  await mobile.close();

  console.log(
    `17) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );

  console.log("Şube E2E tamamlandı.");
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
