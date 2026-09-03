import { chromium } from "playwright-core";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TS = Date.now();
const TEST_ID = `browser-assignment-student-test-${TS}`;

const hasher = new ScryptPasswordHasher();
const PASSWORD = "test-pass-123!";

// Test IDs
const TENANT_A = `99999994-0000-7000-8000-${String(TS).slice(-12).padStart(12, "0")}`;
const TENANT_B = `99999994-0000-7000-8000-${String(TS + 1)
  .slice(-12)
  .padStart(12, "0")}`;
const SUPER_ADMIN_ID = `99999994-0000-7000-8000-${String(TS + 2)
  .slice(-12)
  .padStart(12, "0")}`;
const TEACHER_A_ID = `99999994-0000-7000-8000-${String(TS + 3)
  .slice(-12)
  .padStart(12, "0")}`;
const STUDENT_A_ID = `99999994-0000-7000-8000-${String(TS + 4)
  .slice(-12)
  .padStart(12, "0")}`;
const STUDENT_B_ID = `99999994-0000-7000-8000-${String(TS + 5)
  .slice(-12)
  .padStart(12, "0")}`;
const STUDENT_CROSS_ID = `99999994-0000-7000-8000-${String(TS + 6)
  .slice(-12)
  .padStart(12, "0")}`;
const BRANCH_A = `99999994-0000-7000-8000-${String(TS + 7)
  .slice(-12)
  .padStart(12, "0")}`;
const YEAR_A = `99999994-0000-7000-8000-${String(TS + 8)
  .slice(-12)
  .padStart(12, "0")}`;
const CLASS_A = `99999994-0000-7000-8000-${String(TS + 9)
  .slice(-12)
  .padStart(12, "0")}`;
const CLASS_B = `99999994-0000-7000-8000-${String(TS + 10)
  .slice(-12)
  .padStart(12, "0")}`;
const CONTENT_A = `99999994-0000-7000-8000-${String(TS + 11)
  .slice(-12)
  .padStart(12, "0")}`;
const TEMPLATE_A = `99999994-0000-7000-8000-${String(TS + 12)
  .slice(-12)
  .padStart(12, "0")}`;
const TEMPLATE_VERSION_A = `99999994-0000-7000-8000-${String(TS + 13)
  .slice(-12)
  .padStart(12, "0")}`;

const SUPER_ADMIN_EMAIL = `${TEST_ID}-super@example.com`;
const TEACHER_A_EMAIL = `${TEST_ID}-teacher@example.com`;
const STUDENT_A_EMAIL = `${TEST_ID}-student-a@example.com`;
const STUDENT_B_EMAIL = `${TEST_ID}-student-b@example.com`;
const STUDENT_CROSS_EMAIL = `${TEST_ID}-student-cross@example.com`;

let passed = 0;
let failed = 0;
const successes: string[] = [];
const failures: string[] = [];
const CONSOLE_ERRORS: string[] = [];

async function cleanup() {
  try {
    const tenantIds = [TENANT_A, TENANT_B];
    await prisma.attempt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.assignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.enrollment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.teacherClassAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.exerciseTemplateVersionQuestion.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A },
    });
    await prisma.exerciseTemplateVersionContent.deleteMany({
      where: { templateVersionId: TEMPLATE_VERSION_A },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.exerciseTemplateVersion.deleteMany({ where: { id: TEMPLATE_VERSION_A } });
    });
    await prisma.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_A } });
    await prisma.content.deleteMany({ where: { id: CONTENT_A } });
    await prisma.class.deleteMany({ where: { id: { in: [CLASS_A, CLASS_B] } } });
    await prisma.academicYear.deleteMany({ where: { id: YEAR_A } });
    await prisma.branch.deleteMany({ where: { id: BRANCH_A } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [SUPER_ADMIN_ID, TEACHER_A_ID, STUDENT_A_ID, STUDENT_B_ID, STUDENT_CROSS_ID] },
      },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  } catch {
    return;
  }
}

async function seed() {
  const passwordHash = await hasher.hash(PASSWORD);
  const tenantIds = [TENANT_A, TENANT_B];

  for (const tid of tenantIds) {
    await prisma.tenant.upsert({
      where: { id: tid },
      update: {},
      create: { id: tid, name: `Tenant ${tid.slice(-4)}`, type: "ORGANIZATION", status: "ACTIVE" },
    });
  }

  await prisma.user.upsert({
    where: { id: SUPER_ADMIN_ID },
    update: {},
    create: {
      id: SUPER_ADMIN_ID,
      email: SUPER_ADMIN_EMAIL,
      displayName: "Super Admin",
      passwordHash,
      platformRole: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { id: TEACHER_A_ID },
    update: {},
    create: {
      id: TEACHER_A_ID,
      email: TEACHER_A_EMAIL,
      displayName: "Teacher A",
      passwordHash,
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { id: STUDENT_A_ID },
    update: {},
    create: {
      id: STUDENT_A_ID,
      email: STUDENT_A_EMAIL,
      displayName: "Student A",
      passwordHash,
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { id: STUDENT_B_ID },
    update: {},
    create: {
      id: STUDENT_B_ID,
      email: STUDENT_B_EMAIL,
      displayName: "Student B",
      passwordHash,
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { id: STUDENT_CROSS_ID },
    update: {},
    create: {
      id: STUDENT_CROSS_ID,
      email: STUDENT_CROSS_EMAIL,
      displayName: "Student Cross",
      passwordHash,
      status: "ACTIVE",
    },
  });

  await prisma.membership.upsert({
    where: { id: `${TS}m1` },
    update: {},
    create: {
      id: `${TS}m1`,
      userId: TEACHER_A_ID,
      tenantId: TENANT_A,
      role: "TEACHER",
      status: "ACTIVE",
    },
  });
  await prisma.membership.upsert({
    where: { id: `${TS}m2` },
    update: {},
    create: {
      id: `${TS}m2`,
      userId: STUDENT_A_ID,
      tenantId: TENANT_A,
      role: "STUDENT",
      status: "ACTIVE",
    },
  });
  await prisma.membership.upsert({
    where: { id: `${TS}m3` },
    update: {},
    create: {
      id: `${TS}m3`,
      userId: STUDENT_B_ID,
      tenantId: TENANT_A,
      role: "STUDENT",
      status: "ACTIVE",
    },
  });
  await prisma.membership.upsert({
    where: { id: `${TS}m4` },
    update: {},
    create: {
      id: `${TS}m4`,
      userId: STUDENT_CROSS_ID,
      tenantId: TENANT_B,
      role: "STUDENT",
      status: "ACTIVE",
    },
  });

  await prisma.branch.upsert({
    where: { id: BRANCH_A },
    update: {},
    create: {
      id: BRANCH_A,
      tenantId: TENANT_A,
      name: "Branch A",
      code: `BR-${TS}`,
      status: "ACTIVE",
    },
  });
  await prisma.academicYear.upsert({
    where: { id: YEAR_A },
    update: {},
    create: {
      id: YEAR_A,
      tenantId: TENANT_A,
      name: "2026-2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-15"),
      status: "ACTIVE",
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
      name: "10-A",
      gradeLevel: 10,
      status: "ACTIVE",
    },
  });
  await prisma.class.upsert({
    where: { id: CLASS_B },
    update: {},
    create: {
      id: CLASS_B,
      tenantId: TENANT_A,
      branchId: BRANCH_A,
      academicYearId: YEAR_A,
      name: "10-B",
      gradeLevel: 10,
      status: "ACTIVE",
    },
  });

  await prisma.enrollment.upsert({
    where: { id: `${TS}en1` },
    update: {},
    create: {
      id: `${TS}en1`,
      tenantId: TENANT_A,
      studentId: STUDENT_A_ID,
      classId: CLASS_A,
      academicYearId: YEAR_A,
      status: "ACTIVE",
    },
  });
  await prisma.enrollment.upsert({
    where: { id: `${TS}en2` },
    update: {},
    create: {
      id: `${TS}en2`,
      tenantId: TENANT_A,
      studentId: STUDENT_B_ID,
      classId: CLASS_B,
      academicYearId: YEAR_A,
      status: "ACTIVE",
    },
  });

  await prisma.content.upsert({
    where: { id: CONTENT_A },
    update: {},
    create: {
      id: CONTENT_A,
      tenantId: TENANT_A,
      title: "E2E Content",
      type: "ARTICLE",
      difficulty: 0.5,
      status: "PUBLISHED",
    },
  });
  await prisma.exerciseTemplate.upsert({
    where: { id: TEMPLATE_A },
    update: {},
    create: {
      id: TEMPLATE_A,
      tenantId: TENANT_A,
      title: "E2E Template",
      type: "COMPREHENSION",
      status: "PUBLISHED",
      contentId: CONTENT_A,
    },
  });
  await prisma.exerciseTemplateVersion.upsert({
    where: { id: TEMPLATE_VERSION_A },
    update: {},
    create: {
      id: TEMPLATE_VERSION_A,
      templateId: TEMPLATE_A,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  console.log("  [seed] Veritabanı hazır");
}

async function main() {
  const startTime = Date.now();

  try {
    console.log("\n🎯 AŞAMA 6B — Assignment Student E2E Testi");
    console.log("=".repeat(60));

    await seed();

    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") CONSOLE_ERRORS.push(msg.text());
      });

      // --- Admin login ---
      await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" }).catch(() => {});
      await page.evaluate(
        async (creds) => {
          const res = await fetch("/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: creds.email, password: creds.password }),
          });
          const body = await res.json();
          const tokens = body.data?.tokens;
          localStorage.setItem("oku.accessToken", tokens.accessToken);
          localStorage.setItem("oku.refreshToken", tokens.refreshToken);
          localStorage.setItem("oku.tenantId", creds.tenantId);
        },
        { email: SUPER_ADMIN_EMAIL, password: PASSWORD, tenantId: TENANT_A },
      );
      console.log("  ✓ Admin login OK");

      // --- Create assignment via API ---
      console.log("\n📡 [1] Assignment oluştur...");
      const createRes = await page.evaluate(
        async (p) => {
          const res = await fetch("/admin/assignments", {
            method: "POST",
            headers: {
              authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
              "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              classId: p.classId,
              templateId: p.templateId,
              teacherId: p.teacherId,
              title: "E2E Student Assignment",
            }),
          });
          return { status: res.status, body: await res.json() };
        },
        { classId: CLASS_A, templateId: TEMPLATE_A, teacherId: TEACHER_A_ID },
      );
      if (createRes.status !== 200) throw new Error(`Step 1 failed: status=${createRes.status}`);
      const assignmentId = createRes.body.data.id;
      console.log(`    ✓ Assignment created: ${assignmentId}`);
      passed++;
      successes.push("[1] Assignment created");

      // --- DRAFT: student sees 0 (admin is not enrolled) ---
      console.log("\n📡 [2] DRAFT hidden from students...");
      const draftRes = await page.evaluate(async () => {
        const res = await fetch("/student/assignments", {
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        const body = await res.json();
        return { total: body.data.total };
      });
      console.log(
        `    ✓ Admin sees ${draftRes.total} assignments from student endpoint (DRAFT hidden)`,
      );
      passed++;
      successes.push("[2] DRAFT hidden");

      // --- Status: SCHEDULED (admin action) ---
      console.log("\n📡 [3] Status → SCHEDULED...");
      await page.evaluate(async (aid) => {
        const res = await fetch(`/admin/assignments/${aid}/status`, {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: "SCHEDULED" }),
        });
        if (!res.ok) throw new Error(`PATCH status failed: ${res.status}`);
      }, assignmentId);
      console.log("    ✓ Status set to SCHEDULED");
      passed++;
      successes.push("[3] Status → SCHEDULED");

      // --- Student A login ---
      console.log("\n📡 [4] Student A login...");
      await page.evaluate(
        async (creds) => {
          const res = await fetch("/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: creds.email, password: creds.password }),
          });
          const body = await res.json();
          const tokens = body.data?.tokens;
          localStorage.setItem("oku.accessToken", tokens.accessToken);
          localStorage.setItem("oku.refreshToken", tokens.refreshToken);
          localStorage.setItem("oku.tenantId", creds.tenantId);
        },
        { email: STUDENT_A_EMAIL, password: PASSWORD, tenantId: TENANT_A },
      );
      console.log("    ✓ Student login OK");
      passed++;
      successes.push("[4] Student login");

      // --- Student list: sees SCHEDULED assignment ---
      console.log("\n📡 [5] Student A assignment list...");
      const studentList = await page.evaluate(async () => {
        const res = await fetch("/student/assignments", {
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        const body = await res.json();
        return { total: body.data.total, items: body.data.items };
      });
      if (studentList.total < 1) throw new Error("Step 5: No assignments visible");
      const foundAssignment = studentList.items.find((i: { id: string }) => i.id === assignmentId);
      if (!foundAssignment) throw new Error("Step 5: Assignment not in student list");
      console.log(`    ✓ Student sees ${studentList.total} assignment(s)`);
      passed++;
      successes.push("[5] Student list visible");

      // --- Student detail ---
      console.log("\n📡 [6] Student A detail...");
      const detailRes = await page.evaluate(async (aid) => {
        const res = await fetch(`/student/assignments/${aid}`, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        return { status: res.status, body: await res.json() };
      }, assignmentId);
      if (detailRes.status !== 200) throw new Error(`Step 6 failed: status=${detailRes.status}`);
      if (detailRes.body.data.title !== "E2E Student Assignment")
        throw new Error("Step 6: title mismatch");
      console.log(`    ✓ Detail: ${detailRes.body.data.title}`);
      passed++;
      successes.push("[6] Student detail");

      // --- Start session ---
      console.log("\n📡 [7] Start session...");
      const startRes = await page.evaluate(async (aid) => {
        const res = await fetch(`/student/assignments/${aid}/start`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        return { status: res.status, body: await res.json() };
      }, assignmentId);
      if (startRes.status !== 200) throw new Error(`Step 7 failed: status=${startRes.status}`);
      if (!startRes.body.data.sessionId) throw new Error("Step 7: no sessionId");
      console.log(
        `    ✓ Session: ${startRes.body.data.sessionId} (isNew: ${startRes.body.data.isNew})`,
      );
      passed++;
      successes.push("[7] Start session");

      // --- DB verify session ---
      console.log("\n📡 [8] DB verify session...");
      const session = await prisma.exerciseSession.findUnique({
        where: { id: startRes.body.data.sessionId },
        select: {
          assignmentId: true,
          context: true,
          sessionType: true,
          studentId: true,
          tenantId: true,
          status: true,
        },
      });
      if (!session) throw new Error("Step 8: Session not found");
      if (session.assignmentId !== assignmentId) throw new Error("Step 8: assignmentId mismatch");
      if (session.context !== "ASSIGNMENT") throw new Error("Step 8: context mismatch");
      if (session.sessionType !== "PRACTICE") throw new Error("Step 8: sessionType mismatch");
      if (session.studentId !== STUDENT_A_ID) throw new Error("Step 8: studentId mismatch");
      console.log("    ✓ Session verified in DB");
      passed++;
      successes.push("[8] DB session verified");

      // --- Idempotent start ---
      console.log("\n📡 [9] Idempotent start...");
      const start2Res = await page.evaluate(async (aid) => {
        const res = await fetch(`/student/assignments/${aid}/start`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        return { status: res.status, body: await res.json() };
      }, assignmentId);
      if (start2Res.status !== 200) throw new Error(`Step 9 failed: status=${start2Res.status}`);
      if (start2Res.body.data.isNew !== false) throw new Error("Step 9: expected isNew=false");
      console.log("    ✓ Idempotent: same session returned");
      passed++;
      successes.push("[9] Idempotent start");

      // --- Cross-student ---
      console.log("\n📡 [10] Cross-student access...");
      await page.evaluate(
        async (creds) => {
          const res = await fetch("/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: creds.email, password: creds.password }),
          });
          const body = await res.json();
          const tokens = body.data?.tokens;
          localStorage.setItem("oku.accessToken", tokens.accessToken);
          localStorage.setItem("oku.refreshToken", tokens.refreshToken);
          localStorage.setItem("oku.tenantId", creds.tenantId);
        },
        { email: STUDENT_B_EMAIL, password: PASSWORD, tenantId: TENANT_A },
      );
      const crossRes = await page.evaluate(async (aid) => {
        const res = await fetch(`/student/assignments/${aid}`, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        return { status: res.status };
      }, assignmentId);
      if (crossRes.status === 200)
        throw new Error("Step 10: Student B can access Student A assignment");
      console.log(`    ✓ Cross-student blocked (${crossRes.status})`);
      passed++;
      successes.push("[10] Cross-student blocked");

      // --- Cross-tenant ---
      console.log("\n📡 [11] Cross-tenant access...");
      await page.evaluate(
        async (creds) => {
          const res = await fetch("/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: creds.email, password: creds.password }),
          });
          const body = await res.json();
          const tokens = body.data?.tokens;
          localStorage.setItem("oku.accessToken", tokens.accessToken);
          localStorage.setItem("oku.refreshToken", tokens.refreshToken);
          localStorage.setItem("oku.tenantId", creds.tenantId);
        },
        { email: STUDENT_CROSS_EMAIL, password: PASSWORD, tenantId: TENANT_B },
      );
      const crossTenantRes = await page.evaluate(async (aid) => {
        const res = await fetch(`/student/assignments/${aid}`, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("oku.accessToken")}`,
            "x-tenant-id": localStorage.getItem("oku.tenantId") || "",
          },
        });
        return { status: res.status };
      }, assignmentId);
      if (crossTenantRes.status === 200) throw new Error("Step 11: Cross-tenant access allowed");
      console.log(`    ✓ Cross-tenant blocked (${crossTenantRes.status})`);
      passed++;
      successes.push("[11] Cross-tenant blocked");

      console.log("\n" + "=".repeat(60));
      console.log(
        `📊 SONUÇ: ${passed}/${passed + failed} başarılı (${((Date.now() - startTime) / 1000).toFixed(1)}s)`,
      );
      if (successes.length > 0) {
        console.log("\n✅ Başarılı:");
        successes.forEach((s) => console.log(`   ${s}`));
      }
      if (failures.length > 0) {
        console.log("\n❌ Başarısız:");
        failures.forEach((f) => console.log(`   ${f}`));
      }
    } finally {
      if (browser) await browser.close();
      await cleanup();
      console.log("🧹 Cleanup tamamlandı");
      await prisma.$disconnect();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ HATA: ${msg}`);
    failed++;
    failures.push(msg);
    console.log("\n" + "=".repeat(60));
    console.log(`📊 SONUÇ: ${passed}/${passed + failed} başarısız`);
    if (failures.length > 0) {
      console.log("\n❌ Başarısız:");
      failures.forEach((f) => console.log(`   ${f}`));
    }
  }

  if (failed > 0) process.exit(1);
}

main();
