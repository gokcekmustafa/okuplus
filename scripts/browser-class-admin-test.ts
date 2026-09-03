import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

/**
 * Sınıf yönetimi — gerçek tarayıcı (Chrome/Edge) E2E testi.
 *
 * Super Admin ile: Sınıflar menüsü görünür, sınıf sayfası, Yeni Sınıf
 * (kurum/şube/akademik yıl/kademe), bireysel kurum uyarısı, sınıf oluşturma,
 * liste satırı, detay bölümleri, öğrenci ekleme/kaldırma, öğretmen
 * atama/kaldırma, düzenleme (tenant/şube/yıl sabit), durum değiştirme
 * (Aktif/Arşivlenmiş), soft-delete ve silinenin listeden kaybolması akışları
 * çalışır. Normal tenant kullanıcısı için Sınıflar menüsü GÖRÜNMEMELİDİR.
 * Responsive kontrol dahil.
 *
 * Test verisi (tenant/şube/akademik yıl/öğretmen/öğrenci) script başında
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
const ORG_NAME = "E2E Sınıf Okulu";
const IND_NAME = "E2E Sınıf Bireysel";
const TEACHER_EMAIL = `e2e-sinif-ogretmen-${TS}@example.com`;
const STUDENT_EMAIL = `e2e-sinif-ogrenci-${TS}@example.com`;

let orgTenantId = "";
let indTenantId = "";
let branchId = "";
let branchName = "";
let yearName = "";
let className = "";
let classUpdatedName = "";

async function prepareData() {
  // ORGANIZATION kurum + şube + akademik yıl.
  let orgTenant = await prisma.tenant.findFirst({ where: { name: ORG_NAME } });
  if (!orgTenant) {
    orgTenant = await prisma.tenant.create({
      data: { type: "ORGANIZATION", name: ORG_NAME, slug: `e2e-sinif-okulu-${TS}` },
    });
  }
  orgTenantId = orgTenant.id;

  // INDIVIDUAL kurum (formda uyarı testi için).
  let indTenant = await prisma.tenant.findFirst({ where: { name: IND_NAME } });
  if (!indTenant) {
    indTenant = await prisma.tenant.create({
      data: { type: "INDIVIDUAL", name: IND_NAME, slug: `e2e-sinif-bireysel-${TS}` },
    });
  }
  indTenantId = indTenant.id;

  const ay = await prisma.academicYear.create({
    data: {
      tenantId: orgTenantId,
      name: `E2E-${TS}`,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-06-15"),
      status: "ACTIVE",
    },
  });
  yearName = ay.name;

  const branch = await prisma.branch.create({
    data: {
      tenantId: orgTenantId,
      name: `E2E Şube ${TS}`,
      code: `E2E-${TS}`,
      status: "ACTIVE",
    },
  });
  branchId = branch.id;
  branchName = branch.name;

  // Öğretmen: user + TEACHER üyeliği + şube üyeliği (class-scoped atama için).
  let teacher = await prisma.user.findFirst({ where: { email: TEACHER_EMAIL } });
  if (!teacher) {
    teacher = await prisma.user.create({
      data: {
        email: TEACHER_EMAIL,
        displayName: "E2E Sınıf Öğretmeni",
        passwordHash: "e2e-no-login",
      },
    });
  }
  await prisma.membership.create({
    data: {
      userId: teacher.id,
      tenantId: orgTenantId,
      role: "TEACHER",
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
  await prisma.teacherBranchMembership.create({
    data: { tenantId: orgTenantId, branchId, teacherId: teacher.id, status: "ACTIVE" },
  });

  // Öğrenci: user + STUDENT üyeliği + StudentProfile (kayıt ekleme testi için).
  let student = await prisma.user.findFirst({ where: { email: STUDENT_EMAIL } });
  if (!student) {
    student = await prisma.user.create({
      data: {
        email: STUDENT_EMAIL,
        displayName: "E2E Sınıf Öğrencisi",
        passwordHash: "e2e-no-login",
      },
    });
  }
  await prisma.membership.create({
    data: {
      userId: student.id,
      tenantId: orgTenantId,
      role: "STUDENT",
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
  await prisma.studentProfile.create({
    data: { tenantId: orgTenantId, studentId: student.id, startedAt: new Date() },
  });

  console.log(
    "Test verisi hazır (ORG/INDIVIDUAL tenant + şube + akademik yıl + öğretmen + öğrenci).",
  );
}

async function cleanup() {
  const ids = [orgTenantId, indTenantId].filter(Boolean);
  if (ids.length === 0) return;

  await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.enrollment.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.teacherBranchMembership.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.class.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.studentProfile.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.academicYear.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.branch.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: ids } } });

  const userEmails = [TEACHER_EMAIL, STUDENT_EMAIL];
  const userIds = (
    await prisma.user.findMany({ where: { email: { in: userEmails } }, select: { id: true } })
  ).map((u) => u.id);
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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
    page.on("response", (r) => {
      if (r.status() >= 500) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    return page;
  }

  async function login(page, email, password) {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", email);
    await page.fill("#login-password", password);
    await page.click("#login-submit");
    await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
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

  // ================= Super Admin =================
  const page = await newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // 1) Sınıflar menüsü görünür ve açılır.
  const classesNavVisible = await page.isVisible('.nav-item[data-page="classes"]');
  console.log(`1) Super Admin: Sınıflar menüsü görünür: ${classesNavVisible}`);

  await page.click('.nav-item[data-page="classes"]');
  await page.waitForSelector("#page-classes:not(.hidden)", { timeout: 5000 });
  const pageTitle = await page.$eval("#page-classes h2", (el) => el.textContent);
  console.log(`2) Sınıflar sayfası açıldı: ${pageTitle}`);

  // Liste boş durumda yüklenir.
  await page.waitForSelector("#class-list-body tr", { timeout: 5000 });
  console.log("3) Sınıf listesi yüklendi: OK");

  // 4) Yeni Sınıf modalı açılır ve kurum listesi yüklenir.
  await page.click("#class-create-btn");
  await page.waitForSelector("#class-form-modal:not(.hidden)", { timeout: 5000 });
  const formTitle = await page.$eval("#class-form-title", (el) => el.textContent);
  await waitForOptions(page, "#class-form-tenant", 2);
  const orgOption = await page.$$eval(
    "#class-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    ORG_NAME,
  );
  const indOption = await page.$$eval(
    "#class-form-tenant option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    IND_NAME,
  );
  if (!orgOption || !indOption) throw new Error("Sınıf formunda kurum seçenekleri bulunamadı");
  console.log(`4) Yeni Sınıf modalı "${formTitle}": kurum listesi yüklendi`);

  // 5) ORGANIZATION kurum seçilince şube + akademik yıl yüklenir.
  await page.selectOption("#class-form-tenant", orgOption);
  await waitForOptions(page, "#class-form-branch", 2);
  await waitForOptions(page, "#class-form-year", 2);
  const branchOptions = await page.$$eval("#class-form-branch option", (els) =>
    els.map((o) => o.textContent),
  );
  const yearOptions = await page.$$eval("#class-form-year option", (els) =>
    els.map((o) => o.textContent),
  );
  const branchLoaded = branchOptions.some((b) => b.includes(branchName));
  const yearLoaded = yearOptions.some((y) => y.includes(yearName));
  const branchSelectEnabled = await page.$eval("#class-form-branch", (el) => !el.disabled);
  console.log(
    `5) ORGANIZATION kurum seçildi: şube yüklendi=${branchLoaded}, akademik yıl yüklendi=${yearLoaded}, şube seçimi aktif=${branchSelectEnabled}`,
  );

  // 6) INDIVIDUAL kurum seçilince uyarı görünür, şube/yıl pasifleşir.
  await page.selectOption("#class-form-tenant", indOption);
  await page.waitForSelector("#class-form-individual-hint:not(.hidden)", { timeout: 5000 });
  const hintText = await page.$eval("#class-form-individual-hint", (el) => el.textContent);
  const branchDisabled = await page.$eval("#class-form-branch", (el) => el.disabled);
  const yearDisabled = await page.$eval("#class-form-year", (el) => el.disabled);
  console.log(
    `6) Bireysel kurum uyarısı: "${hintText}", şube pasif=${branchDisabled}, akademik yıl pasif=${yearDisabled}`,
  );

  // 7) Tekrar ORGANIZATION seçilip sınıf oluşturulur.
  className = `E2E Sınıf ${TS}`;
  classUpdatedName = `E2E Sınıf Güncel ${TS}`;
  await page.selectOption("#class-form-tenant", orgOption);
  await waitForOptions(page, "#class-form-branch", 2);
  await waitForOptions(page, "#class-form-year", 2);
  const branchValue = await page.$$eval(
    "#class-form-branch option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    branchName,
  );
  const yearValue = await page.$$eval(
    "#class-form-year option",
    (els, name) => {
      const opt = els.find((o) => o.textContent.includes(name));
      return opt ? opt.value : "";
    },
    yearName,
  );
  await page.selectOption("#class-form-branch", branchValue);
  await page.selectOption("#class-form-year", yearValue);
  await page.fill("#class-form-name", className);
  await page.selectOption("#class-form-grade", "5");
  await page.click("#class-form-submit");
  await page.waitForSelector("#class-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${className}`, { timeout: 5000 });
  console.log(`7) Sınıf oluşturuldu: ${className} (5. sınıf)`);

  // 8) Liste satırı: kurum, şube, akademik yıl, kademe, durum.
  const rowText = await page.$eval(
    `#class-list-body tr:has-text("${className}")`,
    (el) => el.textContent,
  );
  const rowOk =
    rowText.includes(ORG_NAME) &&
    rowText.includes(branchName) &&
    rowText.includes(yearName) &&
    rowText.includes("5. sınıf") &&
    rowText.includes("Aktif");
  console.log(
    `8) Liste satırı: kurum=${rowText.includes(ORG_NAME)}, şube=${rowText.includes(branchName)}, yıl=${rowText.includes(yearName)}, kademe=5. sınıf, durum=Aktif => ${rowOk}`,
  );

  // 9) Detay açılır ve bölümler mevcut.
  await page.locator("tr", { hasText: className }).locator("[data-class-detail-id]").click();
  await page.waitForSelector("#class-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#class-detail-students tr", { timeout: 5000 });
  await page.waitForSelector("#class-detail-teachers tr", { timeout: 5000 });
  const detailText = await page.$eval("#class-detail-body", (el) => el.textContent);
  const sectionsOk =
    detailText.includes("Sınıf Bilgileri") &&
    detailText.includes("Kurum / Şube") &&
    detailText.includes("Akademik Yıl") &&
    detailText.includes("Sınıf Durumu") &&
    detailText.includes("Öğrenciler") &&
    detailText.includes("Öğretmenler");
  console.log(`9) Detay bölümleri mevcut: ${sectionsOk}`);

  // 10) Öğrenci eklenir (picker'dan) ve listede görünür.
  await waitForOptions(page, "#class-detail-student", 2);
  const studentOption = await page.$$eval("#class-detail-student option", (els) => {
    const opt = els.find((o) => o.textContent.includes("E2E Sınıf Öğrencisi"));
    return opt ? opt.value : "";
  });
  if (!studentOption) throw new Error("Öğrenci seçeneklerde yok");
  await page.selectOption("#class-detail-student", studentOption);
  await page.click("[data-class-student-add]");
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#class-detail-students");
      return body && body.textContent.includes("E2E Sınıf Öğrencisi");
    },
    null,
    { timeout: 7000 },
  );
  const studentsText = await page.$eval("#class-detail-students", (el) => el.textContent);
  console.log(`10) Öğrenci kaydı eklendi: ${studentsText.includes("E2E Sınıf Öğrencisi")}`);

  // 11) Öğretmen atanır (picker'dan + ders) ve listede görünür.
  await waitForOptions(page, "#class-detail-teacher", 2);
  const teacherOption = await page.$$eval("#class-detail-teacher option", (els) => {
    const opt = els.find((o) => o.textContent.includes("E2E Sınıf Öğretmeni"));
    return opt ? opt.value : "";
  });
  if (!teacherOption) throw new Error("Öğretmen seçeneklerde yok");
  await page.selectOption("#class-detail-teacher", teacherOption);
  await page.fill("#class-detail-subject", "Matematik");
  await page.click("[data-class-teacher-add]");
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#class-detail-teachers");
      return body && body.textContent.includes("E2E Sınıf Öğretmeni");
    },
    null,
    { timeout: 7000 },
  );
  const teachersText = await page.$eval("#class-detail-teachers", (el) => el.textContent);
  console.log(
    `11) Öğretmen atandı: ${teachersText.includes("E2E Sınıf Öğretmeni")}, ders=Matematik => ${teachersText.includes("Matematik")}`,
  );

  // 12) Öğretmen kaldırılır (onay ile) ve listeden kaybolur.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("[data-class-tremove]");
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#class-detail-teachers");
      return body && !body.textContent.includes("E2E Sınıf Öğretmeni");
    },
    null,
    { timeout: 7000 },
  );
  const afterTeacherRemove = await page.$eval("#class-detail-teachers", (el) => el.textContent);
  console.log(`12) Öğretmen kaldırıldı: ${!afterTeacherRemove.includes("E2E Sınıf Öğretmeni")}`);

  // 13) Düzenleme: tenant/şube/yıl alanları gizli, ad + kademe güncellenir.
  await page.click("#class-detail-edit");
  await page.waitForSelector("#class-form-modal:not(.hidden)", { timeout: 5000 });
  const editTitle = await page.$eval("#class-form-title", (el) => el.textContent);
  const tenantHidden = await page.$eval("#class-form-tenant-field", (el) =>
    el.classList.contains("hidden"),
  );
  const branchHidden = await page.$eval("#class-form-branch-field", (el) =>
    el.classList.contains("hidden"),
  );
  const yearHidden = await page.$eval("#class-form-year-field", (el) =>
    el.classList.contains("hidden"),
  );
  await page.fill("#class-form-name", classUpdatedName);
  await page.selectOption("#class-form-grade", "6");
  await page.click("#class-form-submit");
  await page.waitForSelector("#class-form-modal", { state: "hidden", timeout: 10000 });
  await page.waitForSelector(`text=${classUpdatedName}`, { timeout: 5000 });
  console.log(
    `13) Düzenleme ("${editTitle}"): tenant gizli=${tenantHidden}, şube gizli=${branchHidden}, yıl gizli=${yearHidden}, ad+kademe güncellendi`,
  );

  // 14) Durum değiştirme: Aktif -> Arşivlenmiş.
  await page.locator("tr", { hasText: classUpdatedName }).locator("[data-class-detail-id]").click();
  await page.waitForSelector("#class-detail-modal:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#class-detail-status", { timeout: 5000 });
  await page.selectOption("#class-detail-status", "ARCHIVED");
  await page.evaluate(() => {
    window.__classStatusSelect = document.querySelector("#class-detail-status");
  });
  await page.click("[data-class-status-apply]");
  await page.waitForFunction(
    () => {
      const status = document.querySelector("#class-detail-status");
      return status && status !== window.__classStatusSelect && status.value === "ARCHIVED";
    },
    null,
    { timeout: 10000 },
  );
  await page.waitForFunction(
    () => {
      const body = document.querySelector("#class-list-body");
      return body && body.textContent.includes("Arşivlenmiş");
    },
    null,
    { timeout: 7000 },
  );
  const afterArchived = await page.$eval("#class-detail-body", (el) => el.textContent);
  const listArchived = await page.$eval("#class-list-body", (el) => el.textContent);
  console.log(
    `14) Durum Arşivlenmiş'e değiştirildi: detay=${afterArchived.includes("Arşivlenmiş")}, listede=${listArchived.includes("Arşivlenmiş")}`,
  );

  // 15) Soft-delete (onay ile) ve listeden kaybolur.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("#class-detail-delete");
  await page.waitForSelector("#class-detail-modal", { state: "hidden", timeout: 10000 });
  await page.waitForTimeout(1200);
  const afterDelete = await page.$eval("#class-list-body", (el) => el.textContent);
  const deletedGone = !afterDelete.includes(classUpdatedName);
  console.log(`15) Sınıf soft-delete edildi, listeden kayboldu: ${deletedGone}`);

  await page.close();

  // ================= Normal tenant kullanıcısı =================
  const demo = await newPage();
  await login(demo, DEMO_EMAIL, DEMO_PASSWORD);
  const classesNavHidden = await demo.$eval('.nav-item[data-page="classes"]', (el) =>
    el.classList.contains("hidden"),
  );
  console.log(`16) Normal kullanıcı: Sınıflar menüsü gizli: ${classesNavHidden}`);
  await demo.close();

  // ================= Responsive kontrol =================
  const mobile = await newPage({ width: 390, height: 844 });
  await login(mobile, ADMIN_EMAIL, ADMIN_PASSWORD);
  const toggleVisible = await mobile.isVisible("#sidebar-toggle");
  await mobile.click("#sidebar-toggle");
  await mobile.waitForTimeout(400);
  const sidebarOpen = await mobile.$eval("#sidebar", (el) => el.classList.contains("open"));
  const classesNavInSidebar = await mobile.isVisible('.nav-item[data-page="classes"]');
  await mobile.mouse.click(330, 400);
  await mobile.waitForTimeout(300);
  const sidebarClosed = await mobile.$eval("#sidebar", (el) => !el.classList.contains("open"));
  console.log(
    `17) Responsive: menü butonu görünür=${toggleVisible}, açıldı=${sidebarOpen}, Sınıflar menüsü görünür=${classesNavInSidebar}, kapandı=${sidebarClosed}`,
  );
  await mobile.close();

  console.log(
    `18) console hataları: ${consoleErrors.length === 0 ? "yok" : consoleErrors.join(" | ")}`,
  );

  console.log("Sınıf E2E tamamlandı.");
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
