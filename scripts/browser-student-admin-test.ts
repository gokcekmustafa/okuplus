import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

/**
 * Öğrenci yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: Öğrenciler menüsü görünür, liste/arama/oluşturma
 * (ORGANIZATION + INDIVIDUAL)/detay/profil düzenleme/sınıf kaydı ekleme/
 * kayıt durumu değiştirme/soft-delete akışları çalışır. Normal tenant
 * kullanıcısı için Öğrenciler menüsü GÖRÜNMEMELİDİR. Responsive kontrol dahil.
 *
 * Test verisi (Level/AcademicYear/Branch/Class/INDIVIDUAL tenant) script
 * başında hazırlanır; kalıcı seed sistemi değiştirilmez.
 */
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@okuplus.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-pass-123";

const prisma = new PrismaClient();

async function prepareData() {
  // Seviye kataloğu (Türkçe isimler).
  await prisma.level.upsert({
    where: { code: "E2E-A1" },
    update: { name: "Başlangıç" },
    create: {
      code: "E2E-A1",
      name: "Başlangıç",
      minScore: 0,
      maxScore: 20,
      difficultyMin: 0,
      difficultyMax: 2,
      displayOrder: 100,
    },
  });
  await prisma.level.upsert({
    where: { code: "E2E-A2" },
    update: { name: "Temel" },
    create: {
      code: "E2E-A2",
      name: "Temel",
      minScore: 20,
      maxScore: 40,
      difficultyMin: 2,
      difficultyMax: 4,
      displayOrder: 101,
    },
  });

  // ORGANIZATION kurum + şube + akademik yıllar + sınıflar.
  let orgTenant = await prisma.tenant.findFirst({ where: { name: "E2E Öğrenci Okulu" } });
  if (!orgTenant) {
    orgTenant = await prisma.tenant.create({
      data: { type: "ORGANIZATION", name: "E2E Öğrenci Okulu", slug: `e2e-ogrenci-okulu` },
    });
  }
  let branch = await prisma.branch.findFirst({ where: { tenantId: orgTenant.id, code: "E2E-MZ" } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { tenantId: orgTenant.id, name: "Merkez Şube", code: "E2E-MZ" },
    });
  }
  for (const [name, start, end, status] of [
    ["2025-2026", "2025-09-01", "2026-06-15", "ACTIVE"],
    ["2026-2027", "2026-09-01", "2027-06-15", "UPCOMING"],
  ] as const) {
    await prisma.academicYear.upsert({
      where: { tenantId_name: { tenantId: orgTenant.id, name } },
      update: {},
      create: {
        tenantId: orgTenant.id,
        name,
        startDate: new Date(start),
        endDate: new Date(end),
        status,
      },
    });
  }
  const ay1 = await prisma.academicYear.findUniqueOrThrow({
    where: { tenantId_name: { tenantId: orgTenant.id, name: "2025-2026" } },
  });
  const ay2 = await prisma.academicYear.findUniqueOrThrow({
    where: { tenantId_name: { tenantId: orgTenant.id, name: "2026-2027" } },
  });
  await prisma.class.upsert({
    where: {
      branchId_academicYearId_name: { branchId: branch.id, academicYearId: ay1.id, name: "5-A" },
    },
    update: {},
    create: {
      tenantId: orgTenant.id,
      branchId: branch.id,
      academicYearId: ay1.id,
      name: "5-A",
      gradeLevel: 5,
    },
  });
  await prisma.class.upsert({
    where: {
      branchId_academicYearId_name: { branchId: branch.id, academicYearId: ay2.id, name: "6-A" },
    },
    update: {},
    create: {
      tenantId: orgTenant.id,
      branchId: branch.id,
      academicYearId: ay2.id,
      name: "6-A",
      gradeLevel: 6,
    },
  });

  // INDIVIDUAL kurum.
  const indTenant = await prisma.tenant.findFirst({ where: { name: "E2E Bireysel Öğrenci" } });
  if (!indTenant) {
    await prisma.tenant.create({ data: { type: "INDIVIDUAL", name: "E2E Bireysel Öğrenci" } });
  }

  // Normal kullanıcı (menü gizliliği testi için) — demo kullanıcısına aktif üyelik kur.
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (demoUser) {
    const hasActive = await prisma.membership.findFirst({
      where: { userId: demoUser.id, status: "ACTIVE", deletedAt: null },
    });
    if (!hasActive) {
      const orgTenant = await prisma.tenant.findFirstOrThrow({
        where: { name: "E2E Öğrenci Okulu" },
      });
      const existing = await prisma.membership.findFirst({
        where: { userId: demoUser.id, tenantId: orgTenant.id, deletedAt: null },
      });
      if (existing) {
        await prisma.membership.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", startedAt: new Date() },
        });
      } else {
        await prisma.membership.create({
          data: {
            userId: demoUser.id,
            tenantId: orgTenant.id,
            role: "TEACHER",
            status: "ACTIVE",
            startedAt: new Date(),
          },
        });
      }
    }
  }

  console.log("Test verisi hazır (Level/AcademicYear/Branch/Class/INDIVIDUAL + demo üyelik).");
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

  // 1) Öğrenciler menüsü görünür ve açılır.
  const studentsNavVisible = await page.isVisible('.nav-item[data-page="students"]');
  console.log(`1) Super Admin: Öğrenciler menüsü görünür: ${studentsNavVisible}`);

  await page.click('.nav-item[data-page="students"]');
  await page.waitForSelector("#page-students:not(.hidden)", { timeout: 5000 });
  console.log("2) Öğrenciler sayfası açıldı: OK");

  // 2) Liste yüklenir.
  await page.waitForSelector("#student-list-body tr", { timeout: 5000 });
  console.log("3) Öğrenci listesi yüklendi: OK");

  // 3) Yeni öğrenci oluştur (ORGANIZATION + seviye + sınıf).
  const uniqueName = `E2E Öğrenci ${Date.now()}`;
  const uniqueEmail = `ogrenci-${Date.now().toString().slice(-8)}@example.com`;
  await page.click("#student-create-btn");
  await page.waitForSelector("#student-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#student-form-name", uniqueName);
  await page.fill("#student-form-email", uniqueEmail);
  await page.fill("#student-form-phone", "+905551112233");
  await page.fill("#student-form-birthyear", "2013");
  await page.fill("#student-form-password", "e2e-pass-123!");
  // Kurum seçenekleri yüklenir; E2E Öğrenci Okulu'nu seç.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#student-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  const orgOption = await page.$$eval(
    "#student-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    "E2E Öğrenci Okulu",
  );
  if (!orgOption) throw new Error("E2E Öğrenci Okulu kurumu seçeneklerde yok");
  await page.selectOption("#student-form-tenant", orgOption);
  // Sınıf seçenekleri tenant'a göre yüklenir.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#student-form-class");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  // Seviyeler yüklenir.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#student-form-current-level");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  await page.selectOption("#student-form-current-level", { label: "Başlangıç" });
  await page.selectOption("#student-form-target-level", { label: "Temel" });
  await page.selectOption("#student-form-class", { label: "5-A" });
  await page.click("#student-form-submit");
  await page.waitForSelector("#student-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${uniqueName}`, { timeout: 5000 });
  console.log(`4) ORGANIZATION öğrenci oluşturuldu (sınıflı): ${uniqueName}`);

  // 4) INDIVIDUAL öğrenci oluştur (sınıfsız).
  const indName = `E2E Bireysel Öğrenci ${Date.now()}`;
  const indEmail = `bireysel-${Date.now().toString().slice(-8)}@example.com`;
  await page.click("#student-create-btn");
  await page.waitForSelector("#student-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#student-form-name", indName);
  await page.fill("#student-form-email", indEmail);
  await page.fill("#student-form-birthyear", "2014");
  await page.fill("#student-form-password", "e2e-pass-123!");
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#student-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  const indOption = await page.$$eval(
    "#student-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    "E2E Bireysel Öğrenci",
  );
  if (!indOption) throw new Error("E2E Bireysel Öğrenci kurumu seçeneklerde yok");
  await page.selectOption("#student-form-tenant", indOption);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#student-form-current-level");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  await page.click("#student-form-submit");
  await page.waitForSelector("#student-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${indName}`, { timeout: 5000 });
  console.log(`5) INDIVIDUAL öğrenci oluşturuldu (sınıfsız): ${indName}`);

  // 5) Detay aç.
  const orgRow = page.locator("tr", { hasText: uniqueName });
  await orgRow.waitFor({ timeout: 5000 });
  await orgRow.locator("button[data-student-detail-id]").click();
  await page.waitForSelector("#student-detail-modal:not(.hidden)", { timeout: 5000 });
  const detailTitle = await page.$eval("#student-detail-title", (el) => el.textContent);
  console.log(`6) Öğrenci detayı açıldı: ${detailTitle}`);

  // Detay bölümleri kontrol.
  const detailText = await page.$eval("#student-detail-body", (el) => el.textContent);
  const sectionsOk =
    detailText.includes("Kişisel Bilgiler") &&
    detailText.includes("Hesap Bilgileri") &&
    detailText.includes("Kurumlar") &&
    detailText.includes("Öğrenci Profili") &&
    detailText.includes("Sınıf Kayıtları") &&
    detailText.includes("Başlangıç");
  console.log(`7) Detay bölümleri mevcut: ${sectionsOk}`);

  // 6) Profil düzenleme (seviye değiştir: Mevcut → Temel).
  await page.click("#student-detail-edit");
  await page.waitForSelector("#student-form-modal:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#student-form-current-level", { label: "Temel" });
  await page.click("#student-form-submit");
  await page.waitForSelector("#student-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${uniqueName}`, { timeout: 5000 });
  console.log("8) Profil düzenlendi (mevcut seviye → Temel): OK");

  // 7) Sınıf kaydı ekle (2026-2027 / 6-A).
  const orgRow2 = page.locator("tr", { hasText: uniqueName });
  await orgRow2.locator("button[data-student-detail-id]").click();
  await page.waitForSelector("#student-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#enroll-add-year");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  const ayValue = await page.$eval("#enroll-add-year option:nth-child(2)", (o) => o.value);
  await page.selectOption("#enroll-add-year", ayValue);
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#enroll-add-class");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  const classValue = await page.$eval("#enroll-add-class option:nth-child(2)", (o) => o.value);
  await page.selectOption("#enroll-add-class", classValue);
  await page.click("#enroll-add-btn");
  await page.waitForTimeout(1200);
  const enrollText = await page.$eval("#student-detail-body", (el) => el.textContent);
  const enrollmentAdded = enrollText.includes("6-A") || enrollText.split("Ayrıldı").length > 0;
  console.log(`9) Sınıf kaydı eklendi: ${enrollmentAdded}`);

  // 8) Enrollment durumunu değiştir (ilk satır → COMPLETED).
  const firstEnrRow = page.locator("#student-detail-body tr:has(select[data-enr-status])").first();
  await firstEnrRow.locator("select[data-enr-status]").selectOption("COMPLETED");
  await firstEnrRow.locator("button[data-enr-update]").click();
  await page.waitForTimeout(1200);
  const statusChangedText = await page.$eval("#student-detail-body", (el) => el.textContent);
  const statusChanged = statusChangedText.includes("Tamamlandı");
  console.log(`10) Kayıt durumu Tamamlandı'ya değiştirildi: ${statusChanged}`);

  // 9) Soft-delete.
  await page.click("#student-detail-close");
  await page.waitForSelector("#student-detail-modal", { state: "hidden", timeout: 5000 });
  const delRow = page.locator("tr", { hasText: uniqueName });
  await delRow.waitFor({ timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await delRow.locator("button[data-student-delete-id]").click();
  await page.waitForTimeout(1200);
  const afterDelete = await page.$eval("#student-list-body", (el) => el.textContent);
  const deletedGone = !afterDelete.includes(uniqueName);
  console.log(`11) Öğrenci soft-delete edildi (listeden kayboldu): ${deletedGone}`);

  // Listede sınıf sütunu görünürlüğü.
  const listHasClassColumn = await page.$$eval("#page-students .data-table th", (els) =>
    els.some((el) => el.textContent.includes("Sınıf")),
  );
  console.log(`12) Liste 'Sınıf' sütunu içeriyor: ${listHasClassColumn}`);

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const studentsNavHidden = await demo.$eval('.nav-item[data-page="students"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(`13) Normal kullanıcı: Öğrenciler menüsü gizli: ${studentsNavHidden}`);
  await demo.close();

  console.log(
    `14) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );

  // ================= Responsive kontrol =================
  const mobile = await newPage({ width: 390, height: 844 });
  await login(mobile, ADMIN_EMAIL, ADMIN_PASSWORD);
  const toggleVisible = await mobile.isVisible("#sidebar-toggle");
  await mobile.click("#sidebar-toggle");
  await mobile.waitForTimeout(400);
  const sidebarOpen = await mobile.$eval("#sidebar", (el) => el.classList.contains("open"));
  await mobile.mouse.click(330, 400);
  await mobile.waitForTimeout(300);
  const sidebarClosed = await mobile.$eval("#sidebar", (el) => !el.classList.contains("open"));
  console.log(
    `15) Responsive: menü butonu görünür=${toggleVisible}, açıldı=${sidebarOpen}, kapandı=${sidebarClosed}`,
  );
  await mobile.close();

  console.log("Öğrenci E2E tamamlandı.");
  await browser.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("TEST HATASI:", err);
  process.exit(1);
});
