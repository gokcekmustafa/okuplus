import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

/**
 * Öğretmen yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: Öğretmenler menüsü görünür, liste, öğretmen oluşturma
 * (ORGANIZATION), detay, şube ekleme, sınıf atama, düzenleme, durum
 * değiştirme, soft-delete akışları çalışır. INDIVIDUAL kurumda öğretmen
 * oluşturma engellenir (form uyarısı + backend). Normal tenant kullanıcısı
 * için Öğretmenler menüsü GÖRÜNMEMELİDİR. Responsive kontrol dahil.
 *
 * Test verisi (Branch/AcademicYear/Class/INDIVIDUAL tenant) script başında
 * hazırlanır; kalıcı seed sistemi değiştirilmez.
 */
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE_URL = "http://127.0.0.1:3000";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@okuplus.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-123";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@okuplus.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-pass-123";

const prisma = new PrismaClient();

async function prepareData() {
  // ORGANIZATION kurum + şube + akademik yıllar + sınıflar.
  let orgTenant = await prisma.tenant.findFirst({ where: { name: "E2E Öğretmen Okulu" } });
  if (!orgTenant) {
    orgTenant = await prisma.tenant.create({
      data: { type: "ORGANIZATION", name: "E2E Öğretmen Okulu", slug: `e2e-ogretmen-okulu` },
    });
  }
  let branch = await prisma.branch.findFirst({ where: { tenantId: orgTenant.id, code: "E2E-MZ" } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { tenantId: orgTenant.id, name: "E2E Merkez Şube", code: "E2E-MZ" },
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

  // INDIVIDUAL kurum (öğretmen engeli testi için).
  const indTenant = await prisma.tenant.findFirst({ where: { name: "E2E Öğretmen Bireysel" } });
  if (!indTenant) {
    await prisma.tenant.create({ data: { type: "INDIVIDUAL", name: "E2E Öğretmen Bireysel" } });
  }

  // Normal kullanıcı (menü gizliliği testi için) — demo kullanıcısına aktif üyelik kur.
  const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (demoUser) {
    const hasActive = await prisma.membership.findFirst({
      where: { userId: demoUser.id, status: "ACTIVE", deletedAt: null },
    });
    if (!hasActive) {
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

  console.log("Test verisi hazır (Branch/AcademicYear/Class/INDIVIDUAL + demo üyelik).");
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

  // 1) Öğretmenler menüsü görünür ve açılır.
  const teachersNavVisible = await page.isVisible('.nav-item[data-page="teachers"]');
  console.log(`1) Super Admin: Öğretmenler menüsü görünür: ${teachersNavVisible}`);

  await page.click('.nav-item[data-page="teachers"]');
  await page.waitForSelector("#page-teachers:not(.hidden)", { timeout: 5000 });
  console.log("2) Öğretmenler sayfası açıldı: OK");

  // 2) Liste yüklenir.
  await page.waitForSelector("#teacher-list-body tr", { timeout: 5000 });
  console.log("3) Öğretmen listesi yüklendi: OK");

  // 3) Yeni öğretmen oluştur (ORGANIZATION).
  const teacherName = `E2E Öğretmen ${Date.now()}`;
  const teacherEmail = `ogretmen-${Date.now().toString().slice(-8)}@example.com`;
  await page.click("#teacher-create-btn");
  await page.waitForSelector("#teacher-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#teacher-form-name", teacherName);
  await page.fill("#teacher-form-email", teacherEmail);
  await page.fill("#teacher-form-phone", "+905551112233");
  await page.fill("#teacher-form-birthyear", "1985");
  await page.fill("#teacher-form-password", "e2e-pass-123!");
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#teacher-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  const orgOption = await page.$$eval(
    "#teacher-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    "E2E Öğretmen Okulu",
  );
  if (!orgOption) throw new Error("E2E Öğretmen Okulu kurumu seçeneklerde yok");
  await page.selectOption("#teacher-form-tenant", orgOption);
  await page.click("#teacher-form-submit");
  await page.waitForSelector("#teacher-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${teacherName}`, { timeout: 5000 });
  console.log(`4) ORGANIZATION öğretmeni oluşturuldu: ${teacherName}`);

  // 4) Detay aç + şube ekle.
  const teacherRow = page.locator("tr", { hasText: teacherName });
  await teacherRow.waitFor({ timeout: 5000 });
  await teacherRow.locator("button[data-teacher-detail-id]").click();
  await page.waitForSelector("#teacher-detail-modal:not(.hidden)", { timeout: 5000 });

  const detailTitle = await page.$eval("#teacher-detail-title", (el) => el.textContent);
  console.log(`5) Öğretmen detayı açıldı: ${detailTitle}`);

  // Detay bölümleri kontrol.
  const detailText = await page.$eval("#teacher-detail-body", (el) => el.textContent);
  const sectionsOk =
    detailText.includes("Kişisel Bilgiler") &&
    detailText.includes("Hesap Bilgileri") &&
    detailText.includes("Kurumlar") &&
    detailText.includes("Şube Üyelikleri") &&
    detailText.includes("Sınıf Atamaları");
  console.log(`6) Detay bölümleri mevcut: ${sectionsOk}`);

  // Şube seçenekleri yüklenir ve şube eklenir.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#tbranch-add-branch");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  const branchValue = await page.$eval("#tbranch-add-branch option:nth-child(2)", (o) => o.value);
  await page.selectOption("#tbranch-add-branch", branchValue);
  await page.click("[data-tbranch-add]");
  await page.waitForTimeout(1200);
  const afterBranchAdd = await page.$eval("#teacher-detail-body", (el) => el.textContent);
  const branchAdded = afterBranchAdd.includes("E2E Merkez Şube");
  console.log(`7) Şube üyeliği eklendi: ${branchAdded}`);

  // Sınıf atama.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#teacher-class-select");
      return sel && sel.options.length > 1;
    },
    { timeout: 5000 },
  );
  const classValue = await page.$eval("#teacher-class-select option:nth-child(2)", (o) => o.value);
  await page.selectOption("#teacher-class-select", classValue);
  await page.fill("#teacher-class-subject", "Matematik");
  await page.click("[data-tclass-add]");
  await page.waitForTimeout(1200);
  const afterClassAdd = await page.$eval("#teacher-detail-body", (el) => el.textContent);
  const classAssigned = afterClassAdd.includes("Matematik");
  console.log(`8) Sınıf ataması eklendi (Matematik): ${classAssigned}`);

  // Şube üyeliği durumu değiştirme (ACTIVE → INACTIVE → Uygula).
  const branchRow = page.locator("#teacher-detail-body tr", { hasText: "E2E Merkez Şube" }).first();
  await branchRow.locator("select[data-tbranch-status]").selectOption("INACTIVE");
  await branchRow.locator("[data-tbranch-update]").click();
  await page.waitForTimeout(1200);
  const afterBranchStatus = await page.$eval("#teacher-detail-body", (el) => el.textContent);
  const branchStatusChanged = afterBranchStatus.includes("Pasif");
  console.log(`9) Şube üyeliği durumu Pasif'e değiştirildi: ${branchStatusChanged}`);

  // Sınıf ataması kaldırma (soft delete).
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("[data-tclass-remove]").first().click();
  await page.waitForTimeout(1200);
  const afterClassRemove = await page.$eval("#teacher-detail-body", (el) => el.textContent);
  const classRemoved = !afterClassRemove.includes("Matematik");
  const removeError = await page.$eval("#teacher-error", (el) => el.textContent).catch(() => "");
  console.log(
    `10) Sınıf ataması kaldırıldı: ${classRemoved}${removeError ? ` (hata: ${removeError})` : ""}`,
  );

  // 5) Düzenleme (durum değişikliği: Aktif → Askıda).
  await page.click("#teacher-detail-edit");
  await page.waitForSelector("#teacher-form-modal:not(.hidden)", { timeout: 5000 });
  await page.selectOption("#teacher-form-status", "SUSPENDED");
  await page.click("#teacher-form-submit");
  await page.waitForSelector("#teacher-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForTimeout(800);
  const statusBadge = await page.$eval(
    `#teacher-list-body tr:has-text("${teacherName}")`,
    (el) => el.textContent,
  );
  const statusChanged = statusBadge.includes("Askıda");
  console.log(`11) Öğretmen durumu Askıda'ya değiştirildi: ${statusChanged}`);

  // 6) Soft-delete.
  const delRow = page.locator("tr", { hasText: teacherName });
  await delRow.waitFor({ timeout: 5000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await delRow.locator("button[data-teacher-delete-id]").click();
  await page.waitForTimeout(1200);
  const afterDelete = await page.$eval("#teacher-list-body", (el) => el.textContent);
  const deletedGone = !afterDelete.includes(teacherName);
  console.log(`12) Öğretmen soft-delete edildi (listeden kayboldu): ${deletedGone}`);

  // 7) INDIVIDUAL kurumda öğretmen oluşturma engellenir.
  await page.click("#teacher-create-btn");
  await page.waitForSelector("#teacher-form-modal:not(.hidden)", { timeout: 5000 });
  await page.fill("#teacher-form-name", "E2E Bireysel Hoca");
  await page.fill("#teacher-form-email", `bireysel-${Date.now().toString().slice(-8)}@example.com`);
  await page.fill("#teacher-form-password", "e2e-pass-123!");
  await page.waitForFunction(
    () => {
      const sel = document.querySelector("#teacher-form-tenant");
      return sel && sel.options.length > 1 && sel.options[0].value === "";
    },
    { timeout: 5000 },
  );
  const indOption = await page.$$eval(
    "#teacher-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    "E2E Öğretmen Bireysel",
  );
  if (!indOption) throw new Error("E2E Öğretmen Bireysel kurumu seçeneklerde yok");
  await page.selectOption("#teacher-form-tenant", indOption);
  // Form uyarısı görünür.
  const hintVisible = await page.isVisible("#teacher-form-individual-hint");
  await page.click("#teacher-form-submit");
  await page.waitForTimeout(600);
  const hintError = await page.$eval("#teacher-form-error", (el) => el.textContent);
  const modalStillOpen = await page.$eval("#teacher-form-modal", (el) =>
    el.classList.contains("hidden"),
  );
  const blockedOk = hintVisible && hintError.includes("Bireysel kurumda") && !modalStillOpen;
  console.log(
    `13) INDIVIDUAL kurumda öğretmen engeli: uyarı=${hintVisible}, mesaj="${hintError}", engellendi=${blockedOk}`,
  );
  await page.click("#teacher-form-cancel");
  await page.waitForSelector("#teacher-form-modal", { state: "hidden", timeout: 5000 });

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const teachersNavHidden = await demo.$eval('.nav-item[data-page="teachers"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(`14) Normal kullanıcı: Öğretmenler menüsü gizli: ${teachersNavHidden}`);
  await demo.close();

  console.log(
    `15) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
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
    `16) Responsive: menü butonu görünür=${toggleVisible}, açıldı=${sidebarOpen}, kapandı=${sidebarClosed}`,
  );
  await mobile.close();

  console.log("Öğretmen E2E tamamlandı.");
  await browser.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("TEST HATASI:", err);
  process.exit(1);
});
