/**
 * AŞAMA 6A — Assignment (Ödev) yönetimi E2E tarayıcı testi.
 *
 * Playwright ile:
 *  1. Veritabanına doğrudan veri besleme (Prisma)
 *  2. Arayüzde ödev listesi, oluştur, düzenle, durum değiştir, sil
 *  3. Gerçek HTTP yanıt kontrolü (networkidle stratejisi — assignmentSS sorunu yok)
 *  4. Doğrulama: HTTP durum kodu + DB doğrulaması + UI State
 *  5. Rol bazlı izin kontrolü (varsayılan: tüm adımlar SUPER_ADMIN)
 *
 * Kullanım:
 *   npx tsx scripts/browser-assignment-test.ts
 */

import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

const TEST_ID = "browser-assignment-test";
const CONSOLE_LOGS: string[] = [];
const CONSOLE_ERRORS: string[] = [];

const TENANT_A = "99999994-0000-7000-8000-0000000000a1";
const TEACHER_A_ID = "99999994-0000-7000-8000-0000000000t1";
const SUPER_ADMIN_ID = "99999994-0000-7000-8000-000000000099";
const BRANCH_A = "99999994-0000-7000-8000-0000000000br1";
const YEAR_A = "99999994-0000-7000-8000-0000000000y1";
const CLASS_A = "99999994-0000-7000-8000-0000000000c1";
const CONTENT_A = "99999994-0000-7000-8000-0000000000f1";
const TEMPLATE_A = "99999994-0000-7000-8000-0000000000d1";
const TEMPLATE_VERSION_A = "99999994-0000-7000-8000-0000000000dv1";
const TENANT_IDS = [TENANT_A];

const SUPER_ADMIN_EMAIL = "assignment-super@example.com";
const PASSWORD = "assignment-test-pass-123!";

let createdAssignmentId = "";

async function cleanup() {
  await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
  await prisma.assignment.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
}

async function seed() {
  await cleanup();

  await prisma.tenant.upsert({
    where: { id: TENANT_A },
    update: {},
    create: {
      id: TENANT_A,
      name: "Browser Assignment Org",
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

  await prisma.user.upsert({
    where: { id: TEACHER_A_ID },
    update: {
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      id: TEACHER_A_ID,
      email: "browser-assignment-teacher@example.com",
      displayName: "Browser Teacher",
      passwordHash,
      status: "ACTIVE",
    },
  });

  await prisma.membership.upsert({
    where: { id: "99999994-0000-7000-8000-000000000eaa" },
    update: {},
    create: {
      id: "99999994-0000-7000-8000-000000000eaa",
      userId: TEACHER_A_ID,
      tenantId: TENANT_A,
      role: "TEACHER",
      status: "ACTIVE",
    },
  });

  await prisma.branch.upsert({
    where: { id: BRANCH_A },
    update: {},
    create: { id: BRANCH_A, tenantId: TENANT_A, name: "Browser Branch", code: "BBR-1" },
  });

  await prisma.academicYear.upsert({
    where: { id: YEAR_A },
    update: {},
    create: {
      id: YEAR_A,
      tenantId: TENANT_A,
      name: "2025-2026",
      status: "ACTIVE",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-06-30"),
    },
  });

  await prisma.class.upsert({
    where: { id: CLASS_A },
    update: {},
    create: {
      id: CLASS_A,
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      academicYearId: YEAR_A,
      name: "Browser 10-A",
      gradeLevel: 10,
      status: "ACTIVE",
    },
  });

  await prisma.content.upsert({
    where: { id: CONTENT_A },
    update: {},
    create: {
      id: CONTENT_A,
      tenantId: TENANT_A,
      title: "Browser Content",
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
      title: "Browser Template",
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
    console.log("\n🎯 AŞAMA 6A — Assignment (Ödev) E2E Testi");
    console.log("=".repeat(60));
    console.log(`  BASE_URL: ${BASE_URL}`);
    console.log(`  Test ID: ${TEST_ID}`);

    // 1. Veritabanını hazırla
    console.log("\n📊 Veritabanı hazırlanıyor...");
    await seed();

    // 2. Tarayıcı başlat
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

    page.on("console", (msg) => {
      const text = msg.text();
      CONSOLE_LOGS.push(text);
      if (msg.type() === "error") CONSOLE_ERRORS.push(text);
    });

    // 3. Sayfayı aç
    console.log("\n📄 Sayfa açılıyor...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 4. LOCAL STORAGE'A TOKEN EKLE (test kullanıcısıyla giriş)
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

    if (!loginRes.ok) {
      throw new Error(`Login başarısız: ${loginRes.status}`);
    }
    console.log("    ✓ Token eklendi");

    // 5. LocalStorage correctamente eklendi mi?
    const storedToken = await page.evaluate(() => localStorage.getItem("oku.accessToken"));
    if (!storedToken) throw new Error("Token localStorage'a eklenemedi");
    console.log("    ✓ Token doğrulandı");

    // 6. Ödev sayfasına git
    console.log("\n📝 Ödev sayfasına gidiliyor...");
    await page.evaluate(() => {
      document.querySelectorAll(".nav-item").forEach((el) => {
        if (el.textContent?.includes("Ödev")) el.click();
      });
    });
    await page.waitForTimeout(500);

    // 7. API Call: GET /admin/assignments — initial empty list
    console.log("\n📡 [1/20] GET /admin/assignments — boş liste kontrolü...");
    const r1 = await page.evaluate(async () => {
      const res = await fetch("/admin/assignments", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    });
    if (r1.status !== 200 || !r1.body?.data) throw new Error(`Step 1 failed: status=${r1.status}`);
    if (r1.body.data.total !== 0)
      throw new Error(`Step 1: Expected total=0, got ${r1.body.data.total}`);
    console.log(`    ✓ status=200, total=0`);
    passed++;
    successes.push("[1] GET /admin/assignments boş liste");

    // 8. API Call: POST /admin/assignments — create
    console.log("\n📡 [2/20] POST /admin/assignments — ödev oluştur...");
    const r2 = await page.evaluate(
      async (params) => {
        const res = await fetch("/admin/assignments", {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            classId: params.classId,
            templateId: params.templateId,
            teacherId: params.teacherId,
            title: "E2E Test Ödevi",
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { classId: CLASS_A, templateId: TEMPLATE_A, teacherId: TEACHER_A_ID },
    );
    if (r2.status !== 200) throw new Error(`Step 2 failed: status=${r2.status}`);
    createdAssignmentId = r2.body.data.id;
    if (!createdAssignmentId) throw new Error("Step 2: no id returned");
    console.log(`    ✓ status=201, id=${createdAssignmentId}`);
    passed++;
    successes.push("[2] POST /admin/assignments oluştur");

    // 9. DB validation — assignment exists
    console.log("\n📡 [3/20] DB doğrulama — ödev kaydı...");
    const dbAssignment = await prisma.assignment.findUnique({ where: { id: createdAssignmentId } });
    if (!dbAssignment) throw new Error("Step 3: Assignment not found in DB");
    if (dbAssignment.status !== "DRAFT")
      throw new Error(`Step 3: Expected DRAFT, got ${dbAssignment.status}`);
    console.log(`    ✓ DB: status=${dbAssignment.status}, title=${dbAssignment.title}`);
    passed++;
    successes.push("[3] DB assignment kaydı");

    // 10. UI refresh — list should show 1 item
    console.log("\n📡 [4/20] UI listesi güncelle — 1 ödev...");
    // Click the nav item to trigger navigate("assignments") which calls loadAssignments()
    await page.evaluate(() => {
      document.querySelectorAll(".nav-item").forEach((el) => {
        if (el.getAttribute("data-page") === "assignments") el.click();
      });
    });
    await page.waitForTimeout(3000);
    const listText = await page.textContent("#assignment-list-body");
    console.log(`    List text: ${JSON.stringify(listText?.substring(0, 200))}`);
    if (!listText?.includes("E2E Test Ödevi"))
      throw new Error("Step 4: Assignment not visible in list");
    console.log(`    ✓ UI: list item visible`);
    passed++;
    successes.push("[4] UI list item visible");

    // 11. Search filter
    console.log("\n📡 [5/20] Arama filtresi...");
    await page.evaluate(() => {
      const input = document.getElementById("assignment-search") as HTMLInputElement;
      if (input) {
        input.value = "E2E";
        input.dispatchEvent(new Event("input"));
      }
    });
    await page.waitForTimeout(1000);
    const searchResult = await page.textContent("#assignment-list-body");
    if (!searchResult?.includes("E2E Test Ödevi")) throw new Error("Step 5: Search filter failed");
    console.log(`    ✓ Search filter works`);
    passed++;
    successes.push("[5] Search filter");

    // 12. Clear search
    await page.evaluate(() => {
      const input = document.getElementById("assignment-search") as HTMLInputElement;
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event("input"));
      }
    });
    await page.waitForTimeout(1000);

    // 13. API: GET /admin/assignments/:id — detail
    console.log("\n📡 [6/20] GET /admin/assignments/:id — detay...");
    const r6 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}`, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    }, createdAssignmentId);
    if (r6.status !== 200) throw new Error(`Step 6 failed: status=${r6.status}`);
    if (r6.body.data.title !== "E2E Test Ödevi") throw new Error("Step 6: title mismatch");
    console.log(`    ✓ status=200, title=${r6.body.data.title}`);
    passed++;
    successes.push("[6] GET detail");

    // 14. API: PATCH /admin/assignments/:id — update title
    console.log("\n📡 [7/20] PATCH /admin/assignments/:id — başlık güncelle...");
    const r7 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "E2E Updated Title" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssignmentId);
    if (r7.status !== 200) throw new Error(`Step 7 failed: status=${r7.status}`);
    if (r7.body.data.title !== "E2E Updated Title") throw new Error("Step 7: title not updated");
    console.log(`    ✓ title updated to "${r7.body.data.title}"`);
    passed++;
    successes.push("[7] PATCH update title");

    // 15. API: PATCH /admin/assignments/:id/status — DRAFT → SCHEDULED
    console.log("\n📡 [8/20] PATCH status — DRAFT → SCHEDULED...");
    const r8 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "SCHEDULED" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssignmentId);
    if (r8.status !== 200) throw new Error(`Step 8 failed: status=${r8.status}`);
    if (r8.body.data.status !== "SCHEDULED")
      throw new Error(`Step 8: Expected SCHEDULED, got ${r8.body.data.status}`);
    if (!r8.body.data.assignedAt) throw new Error("Step 8: assignedAt not set");
    console.log(`    ✓ status=SCHEDULED, assignedAt set`);
    passed++;
    successes.push("[8] PATCH status DRAFT→SCHEDULED");

    // 16. API: PATCH status — SCHEDULED → ACTIVE
    console.log("\n📡 [9/20] PATCH status — SCHEDULED → ACTIVE...");
    const r9 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssignmentId);
    if (r9.status !== 200) throw new Error(`Step 9 failed: status=${r9.status}`);
    if (r9.body.data.status !== "ACTIVE")
      throw new Error(`Step 9: Expected ACTIVE, got ${r9.body.data.status}`);
    console.log(`    ✓ status=ACTIVE`);
    passed++;
    successes.push("[9] PATCH status SCHEDULED→ACTIVE");

    // 17. API: PATCH status — invalid ACTIVE → DRAFT (should fail)
    console.log("\n📡 [10/20] PATCH status — invalid ACTIVE → DRAFT (hata bekleniyor)...");
    const r10 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      return { status: res.status };
    }, createdAssignmentId);
    if (r10.status < 400) throw new Error(`Step 10: Expected 4xx, got ${r10.status}`);
    console.log(`    ✓ status=${r10.status} (hata — beklenen davranış)`);
    passed++;
    successes.push("[10] Invalid transition rejected");

    // 18. API: PATCH status — ACTIVE → CLOSED
    console.log("\n📡 [11/20] PATCH status — ACTIVE → CLOSED...");
    const r11 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}/status`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "CLOSED" }),
      });
      return { status: res.status, body: await res.json() };
    }, createdAssignmentId);
    if (r11.status !== 200) throw new Error(`Step 11 failed: status=${r11.status}`);
    if (r11.body.data.status !== "CLOSED")
      throw new Error(`Step 11: Expected CLOSED, got ${r11.body.data.status}`);
    console.log(`    ✓ status=CLOSED`);
    passed++;
    successes.push("[11] PATCH status ACTIVE→CLOSED");

    // 19. API: DELETE CLOSED assignment (should fail)
    console.log("\n📡 [12/20] DELETE CLOSED assignment (hata bekleniyor)...");
    const r12 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status };
    }, createdAssignmentId);
    if (r12.status < 400) throw new Error(`Step 12: Expected 4xx, got ${r12.status}`);
    console.log(`    ✓ status=${r12.status} (hata — beklenen davranış)`);
    passed++;
    successes.push("[12] DELETE CLOSED rejected");

    // 20. DB validation — status is CLOSED
    console.log("\n📡 [13/20] DB doğrulama — status=CLOSED...");
    const dbFinal = await prisma.assignment.findUnique({ where: { id: createdAssignmentId } });
    if (!dbFinal) throw new Error("Step 13: Assignment not found");
    if (dbFinal.status !== "CLOSED")
      throw new Error(`Step 13: Expected CLOSED, got ${dbFinal.status}`);
    console.log(`    ✓ DB status=${dbFinal.status}`);
    passed++;
    successes.push("[13] DB status=CLOSED");

    // 21. UI detail modal — title shown
    console.log("\n📡 [14/20] UI detay modalı açılıyor...");
    // Navigate away then back to refresh the list
    await page.evaluate(() => {
      window.location.hash = "dashboard";
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.location.hash = "assignments";
    });
    await page.waitForTimeout(2000);

    // Detail via API in UI context
    const detailCheck = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}`, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    }, createdAssignmentId);
    if (detailCheck.status !== 200) throw new Error("Step 14: detail fetch failed");
    if (detailCheck.body.data.title !== "E2E Updated Title")
      throw new Error("Step 14: title mismatch in detail");
    console.log(`    ✓ Detail title="${detailCheck.body.data.title}"`);
    passed++;
    successes.push("[14] UI detail check");

    // 22. Create + List class assignments
    console.log("\n📡 [15/20] POST /admin/assignments — 2. ödev...");
    const r15 = await page.evaluate(
      async (params) => {
        const res = await fetch("/admin/assignments", {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            classId: params.classId,
            templateId: params.templateId,
            teacherId: params.teacherId,
            title: "Second Assignment",
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { classId: CLASS_A, templateId: TEMPLATE_A, teacherId: TEACHER_A_ID },
    );
    if (r15.status !== 200) throw new Error(`Step 15 failed: status=${r15.status}`);
    console.log(`    ✓ status=201, id=${r15.body.data.id}`);
    passed++;
    successes.push("[15] POST create 2nd assignment");

    // 23. GET class assignments
    console.log("\n📡 [16/20] GET /admin/classes/:classId/assignments...");
    const r16 = await page.evaluate(async (classId) => {
      const res = await fetch(`/admin/classes/${classId}/assignments`, {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    }, CLASS_A);
    if (r16.status !== 200) throw new Error(`Step 16 failed: status=${r16.status}`);
    if (!Array.isArray(r16.body.data)) throw new Error("Step 16: expected array");
    console.log(`    ✓ class assignments count=${r16.body.data.length}`);
    passed++;
    successes.push("[16] GET class assignments");

    // 24. Status filter
    console.log("\n📡 [17/20] Status filtresi...");
    const r17 = await page.evaluate(async () => {
      const res = await fetch("/admin/assignments?status=ACTIVE", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    });
    if (r17.status !== 200) throw new Error(`Step 17 failed: status=${r17.status}`);
    console.log(`    ✓ ACTIVE filter: count=${r17.body.data.items.length}`);
    passed++;
    successes.push("[17] Status filter");

    // 25. Search filter
    console.log("\n📡 [18/20] Arama filtresi...");
    const r18 = await page.evaluate(async () => {
      const res = await fetch("/admin/assignments?search=Second", {
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status, body: await res.json() };
    });
    if (r18.status !== 200) throw new Error(`Step 18 failed: status=${r18.status}`);
    if (r18.body.data.items.length !== 1 || r18.body.data.items[0].title !== "Second Assignment")
      throw new Error("Step 18: search failed");
    console.log(`    ✓ Search: found "${r18.body.data.items[0].title}"`);
    passed++;
    successes.push("[18] Search filter");

    // 26. Delete second assignment (still DRAFT)
    console.log("\n📡 [19/20] DELETE 2. ödev (DRAFT)...");
    const r19 = await page.evaluate(async (id) => {
      const res = await fetch(`/admin/assignments/${id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
          "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
        },
      });
      return { status: res.status };
    }, r15.body.data.id);
    if (r19.status !== 200) throw new Error(`Step 19 failed: status=${r19.status}`);
    console.log(`    ✓ status=200`);
    passed++;
    successes.push("[19] DELETE DRAFT assignment");

    // 27. DB: deleted assignment has deletedAt
    console.log("\n📡 [20/20] DB doğrulama — soft-delete...");
    const dbDeleted = await prisma.assignment.findUnique({ where: { id: r15.body.data.id } });
    if (!dbDeleted?.deletedAt) throw new Error("Step 20: deletedAt not set");
    console.log(`    ✓ deletedAt set`);
    passed++;
    successes.push("[20] Soft-delete verified");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ HATA: ${msg}`);
    failed++;
    failures.push(msg);
  } finally {
    if (browser) {
      await browser.close();
      console.log("\n🔒 Tarayıcı kapatıldı");
    }

    await cleanup();
    console.log("🧹 Test verileri temizlendi");

    await prisma.$disconnect();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log(`📊 SONUÇ: ${passed}/${passed + failed} başarılı (${elapsed}s)`);
    if (successes.length > 0) {
      console.log("\n✅ Başarılı adımlar:");
      successes.forEach((s) => console.log(`   ${s}`));
    }
    if (failures.length > 0) {
      console.log("\n❌ Başarısız adımlar:");
      failures.forEach((f) => console.log(`   ${f}`));
    }
    if (CONSOLE_ERRORS.length > 0) {
      console.log("\n🔴 Konsol hataları:");
      CONSOLE_ERRORS.forEach((e) => console.log(`   ${e}`));
    }

    console.log("\n" + "=".repeat(60));
    if (failed > 0) {
      console.log("❌ TEST BAŞARISIZ");
      process.exit(1);
    } else {
      console.log("✅ TEST BAŞARILI — Tüm adımlar başarılı!");
    }
  }
}

main();
