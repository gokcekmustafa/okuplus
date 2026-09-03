/**
 * AŞAMA 7A — Assessment (Ölçme & Değerlendirme) E2E tarayıcı testi.
 *
 * Playwright ile:
 *  1. Veritabanına doğrudan veri besleme (Prisma)
 *  2. Arayüzde değerlendirme listesi, oluştur, düzenle, durum değiştir, sil
 *  3. Gerçek HTTP yanıt kontrolü
 *  4. Doğrulama: HTTP durum kodu + DB doğrulaması + UI State
 *
 * Kullanım:
 *   npx tsx scripts/browser-assessment-test.ts
 */

import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

const TEST_ID = "browser-assessment-test";

const TENANT_A = "99999994-0000-7000-8000-0000000000a1";
const SUPER_ADMIN_ID = "99999994-0000-7000-8000-000000000099";
const CONTENT_A = "99999994-0000-7000-8000-0000000000f1";
const TEMPLATE_A = "99999994-0000-7000-8000-0000000000d1";
const TEMPLATE_VERSION_A = "99999994-0000-7000-8000-0000000000dv1";

const SUPER_ADMIN_EMAIL = "assessment-browser-super@example.com";
const PASSWORD = "assessment-browser-test-pass-123!";

let createdAssessmentId = "";

async function seed() {
  // Clean leftover
  await prisma.exerciseSession.deleteMany({ where: { tenantId: TENANT_A } });
  await prisma.assessmentResult.deleteMany({ where: { tenantId: TENANT_A } });
  await prisma.assessment.deleteMany({ where: { tenantId: TENANT_A } });

  await prisma.tenant.upsert({
    where: { id: TENANT_A },
    update: {},
    create: {
      id: TENANT_A,
      name: "Browser Assessment Org",
      type: "ORGANIZATION",
      status: "ACTIVE",
    },
  });

  const { ScryptPasswordHasher } = await import("../src/modules/auth/index.js");
  const hasher = new ScryptPasswordHasher();
  const passwordHash = await hasher.hash(PASSWORD);

  await prisma.user.upsert({
    where: { id: SUPER_ADMIN_ID },
    update: {
      email: SUPER_ADMIN_EMAIL,
      displayName: "Browser Super Admin",
      passwordHash,
      platformRole: "SUPER_ADMIN",
      status: "ACTIVE",
    },
    create: {
      id: SUPER_ADMIN_ID,
      email: SUPER_ADMIN_EMAIL,
      displayName: "Browser Super Admin",
      passwordHash,
      platformRole: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  await prisma.content.upsert({
    where: { id: CONTENT_A },
    update: {},
    create: {
      id: CONTENT_A,
      tenantId: TENANT_A,
      title: "Browser Assessment Content",
      type: "PASSAGE",
      difficulty: 1.0,
    },
  });

  await prisma.exerciseTemplate.upsert({
    where: { id: TEMPLATE_A },
    update: {},
    create: {
      id: TEMPLATE_A,
      tenantId: TENANT_A,
      contentId: CONTENT_A,
      title: "Browser Assessment Template",
      type: "COMPREHENSION",
      status: "PUBLISHED",
    },
  });

  await prisma.exerciseTemplateVersion.upsert({
    where: { id: TEMPLATE_VERSION_A },
    update: {},
    create: { id: TEMPLATE_VERSION_A, templateId: TEMPLATE_A, version: 1, status: "PUBLISHED" },
  });

  console.log(`  [seed] Veritabanı hazır (${TEST_ID})`);
}

async function main() {
  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  const successes: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    console.log("\n🎯 AŞAMA 7A — Assessment (Ölçme & Değerlendirme) E2E Testi");
    console.log("=".repeat(60));
    console.log(`  BASE_URL: ${BASE_URL}`);
    console.log(`  Test ID: ${TEST_ID}`);

    // 1. DB prepare
    console.log("\n📊 Veritabanı hazırlanıyor...");
    await seed();

    // 2. Launch browser
    console.log("\n🌐 Tarayıcı başlatılıyor...");
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // 3. Open page
    console.log("\n📄 Sayfa açılıyor...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 4. Login
    console.log("🔑 Auth token ekleniyor...");
    const loginRes = await page.evaluate(
      async (creds) => {
        const res = await fetch("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: creds.email, password: creds.password }),
        });
        if (!res.ok) return { ok: false, status: res.status };
        const body = await res.json();
        const tokens = body.data?.tokens;
        if (!tokens?.accessToken) return { ok: false, status: 401 };
        localStorage.setItem("oku.accessToken", tokens.accessToken);
        localStorage.setItem("oku.refreshToken", tokens.refreshToken);
        localStorage.setItem("oku.tenantId", creds.tenantId);
        return { ok: true, status: res.status };
      },
      { email: SUPER_ADMIN_EMAIL, password: PASSWORD, tenantId: TENANT_A },
    );

    if (!loginRes.ok) throw new Error(`Login başarısız: ${loginRes.status}`);
    console.log("    ✓ Token eklendi");

    // --- Step 1: Empty list ---
    console.log("\n📡 [1/12] GET /admin/assessments — boş liste...");
    const r1 = await page.evaluate(async () => {
      const res = await fetch("/admin/assessments", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    });
    if (r1.status !== 200) throw new Error(`Step 1 failed: status=${r1.status}`);
    console.log(`    ✓ status=200, total=${r1.body.data.total}`);
    passed++;
    successes.push("[1] GET /admin/assessments boş liste");

    // --- Step 2: Create assessment ---
    console.log("\n📡 [2/12] POST /admin/assessments — oluştur...");
    const r2 = await page.evaluate(
      async (params) => {
        const res = await fetch("/admin/assessments", {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: "E2E Test Değerlendirmesi",
            type: "PLACEMENT",
            config: {
              templateId: params.templateId,
              templateVersionId: params.templateVersionId,
              questionCount: 5,
            },
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { templateId: TEMPLATE_A, templateVersionId: TEMPLATE_VERSION_A },
    );
    if (r2.status !== 200) throw new Error(`Step 2 failed: status=${r2.status}`);
    createdAssessmentId = r2.body.data.id;
    if (!createdAssessmentId) throw new Error("Step 2: no id returned");
    console.log(`    ✓ id=${createdAssessmentId}, status=${r2.body.data.status}`);
    passed++;
    successes.push("[2] POST /admin/assessments oluştur");

    // --- Step 3: DB validation ---
    console.log("\n📡 [3/12] DB doğrulama...");
    const dbA = await prisma.assessment.findUnique({ where: { id: createdAssessmentId } });
    if (!dbA) throw new Error("Step 3: Assessment not in DB");
    if (dbA.status !== "DRAFT") throw new Error(`Step 3: Expected DRAFT, got ${dbA.status}`);
    console.log(`    ✓ DB status=${dbA.status}`);
    passed++;
    successes.push("[3] DB doğrulama");

    // --- Step 4: Navigate to assessments page ---
    console.log("\n📡 [4/12] UI — değerlendirme sayfasına git...");
    await page.evaluate(() => {
      document.querySelectorAll(".nav-item").forEach((el) => {
        if (el.getAttribute("data-page") === "assessments") el.click();
      });
    });
    await page.waitForTimeout(3000);
    const listText = await page.textContent("#assessment-list-body");
    if (!listText?.includes("E2E Test Değerlendirmesi"))
      throw new Error("Step 4: Assessment not visible in UI");
    console.log(`    ✓ UI list visible`);
    passed++;
    successes.push("[4] UI list visible");

    // --- Step 5: Update title ---
    console.log("\n📡 [5/12] PUT /admin/assessments/:id — başlık güncelle...");
    const r5 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assessments/${id}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "E2E Updated" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssessmentId);
    if (r5.status !== 200) throw new Error(`Step 5 failed: status=${r5.status}`);
    if (r5.body.data.title !== "E2E Updated") throw new Error("Step 5: title not updated");
    console.log(`    ✓ title updated`);
    passed++;
    successes.push("[5] PUT update title");

    // --- Step 6: DRAFT → PUBLISHED ---
    console.log("\n📡 [6/12] PATCH status DRAFT → PUBLISHED...");
    const r6 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assessments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssessmentId);
    if (r6.status !== 200) throw new Error(`Step 6 failed: status=${r6.status}`);
    if (r6.body.data.status !== "PUBLISHED")
      throw new Error(`Step 6: Expected PUBLISHED, got ${r6.body.data.status}`);
    console.log(`    ✓ status=PUBLISHED`);
    passed++;
    successes.push("[6] DRAFT→PUBLISHED");

    // --- Step 7: Invalid transition PUBLISHED → DRAFT ---
    console.log("\n📡 [7/12] PATCH status PUBLISHED → DRAFT (hata bekleniyor)...");
    const r7 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assessments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      return { status: res.status };
    }, createdAssessmentId);
    if (r7.status < 400) throw new Error(`Step 7: Expected 4xx, got ${r7.status}`);
    console.log(`    ✓ status=${r7.status} (hata — beklenen)`);
    passed++;
    successes.push("[7] Invalid transition rejected");

    // --- Step 8: PUBLISHED → ARCHIVED ---
    console.log("\n📡 [8/12] PATCH status PUBLISHED → ARCHIVED...");
    const r8 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assessments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssessmentId);
    if (r8.status !== 200) throw new Error(`Step 8 failed: status=${r8.status}`);
    if (r8.body.data.status !== "ARCHIVED")
      throw new Error(`Step 8: Expected ARCHIVED, got ${r8.body.data.status}`);
    console.log(`    ✓ status=ARCHIVED`);
    passed++;
    successes.push("[8] PUBLISHED→ARCHIVED");

    // --- Step 9: Archived cannot be edited ---
    console.log("\n📡 [9/12] PUT archived assessment (hata bekleniyor)...");
    const r9 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assessments/${id}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Should Fail" }),
      });
      return { status: res.status };
    }, createdAssessmentId);
    if (r9.status < 400) throw new Error(`Step 9: Expected 4xx, got ${r9.status}`);
    console.log(`    ✓ status=${r9.status} (hata — beklenen)`);
    passed++;
    successes.push("[9] Archived edit rejected");

    // --- Step 10: Create + soft-delete DRAFT ---
    console.log("\n📡 [10/12] POST + DELETE soft-delete...");
    const r10 = await page.evaluate(
      async (params) => {
        const createRes = await fetch("/admin/assessments", {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: "To Delete",
            config: { templateId: params.templateId, templateVersionId: params.templateVersionId },
          }),
        });
        if (!createRes.ok) return { status: createRes.status };
        const created = await createRes.json();
        const delRes = await fetch(`/admin/assessments/${created.data.id}`, {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        return { createStatus: createRes.status, delStatus: delRes.status, id: created.data.id };
      },
      { templateId: TEMPLATE_A, templateVersionId: TEMPLATE_VERSION_A },
    );
    if (r10.createStatus !== 200) throw new Error(`Step 10 create failed: ${r10.createStatus}`);
    if (r10.delStatus !== 200) throw new Error(`Step 10 delete failed: ${r10.delStatus}`);
    const deletedInDb = await prisma.assessment.findUnique({ where: { id: r10.id } });
    if (!deletedInDb?.deletedAt) throw new Error("Step 10: deletedAt not set");
    console.log(`    ✓ created + soft-deleted`);
    passed++;
    successes.push("[10] Soft-delete DRAFT");

    // --- Step 11: DB final check ---
    console.log("\n📡 [11/12] DB final doğrulama...");
    const dbFinal = await prisma.assessment.findUnique({ where: { id: createdAssessmentId } });
    if (!dbFinal) throw new Error("Step 11: Assessment not found");
    if (dbFinal.status !== "ARCHIVED")
      throw new Error(`Step 11: Expected ARCHIVED, got ${dbFinal.status}`);
    console.log(`    ✓ DB status=${dbFinal.status}`);
    passed++;
    successes.push("[11] DB final");

    // --- Step 12: UI refresh shows item ---
    console.log("\n📡 [12/12] UI refresh...");
    await page.evaluate(() => {
      document.querySelectorAll(".nav-item").forEach((el) => {
        if (el.getAttribute("data-page") === "assessments") el.click();
      });
    });
    await page.waitForTimeout(3000);
    const finalText = await page.textContent("#assessment-list-body");
    if (!finalText?.includes("E2E Updated")) throw new Error("Step 12: Updated item not visible");
    console.log(`    ✓ UI shows updated item`);
    passed++;
    successes.push("[12] UI refresh");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failed++;
    failures.push(message);
    console.error(`\n❌ HATA: ${message}`);
  } finally {
    // Cleanup
    await prisma.exerciseSession.deleteMany({ where: { tenantId: TENANT_A } });
    await prisma.assessmentResult.deleteMany({ where: { tenantId: TENANT_A } });
    await prisma.assessment.deleteMany({ where: { tenantId: TENANT_A } });

    if (browser) await browser.close();
    await prisma.$disconnect();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "=".repeat(60));
    console.log(`📊 SONUÇ: ${passed} başarılı / ${failed} başarısız (${elapsed}s)`);
    if (successes.length > 0) {
      console.log("✅ Başarılı:");
      for (const s of successes) console.log(`   - ${s}`);
    }
    if (failures.length > 0) {
      console.log("❌ Başarısız:");
      for (const f of failures) console.log(`   - ${f}`);
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
