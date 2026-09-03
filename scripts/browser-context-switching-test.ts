import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const prisma = new PrismaClient();
const ORG_A = "9c000000-0000-7000-8000-0000000000a1";
const EMAIL = `ctx-e2e-${Date.now()}@example.com`;
const PASS = "CtxE2ePass123!";
let tenantPersonal = "";
async function main() {
  console.log("🎯 Context switching E2E");
  // seed org
  await prisma.tenant.upsert({
    where: { id: ORG_A },
    update: { name: "E2E Org A", status: "ACTIVE", deletedAt: null },
    create: { id: ORG_A, type: "ORGANIZATION", name: "E2E Org A", status: "ACTIVE" },
  });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console error", m.text());
  });
  page.on("pageerror", (e) => console.log("pageerror", e));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // signup
  await page.click("#show-signup-btn");
  await page.fill("#signup-display-name", "Ctx E2E");
  await page.fill("#signup-email", EMAIL);
  await page.fill("#signup-password", PASS);
  await page.click("#signup-submit");
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 10000 });
  console.log("1 signup+personal dashboard OK");
  const personalTenant = await page.evaluate(() => localStorage.getItem("oku.tenantId"));
  tenantPersonal = personalTenant || "";
  console.log(" personal tenant", tenantPersonal);
  // add org membership directly via prisma (simulate invitation accepted)
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  await prisma.membership.create({
    data: { tenantId: ORG_A, userId: user!.id, role: "STUDENT", status: "ACTIVE" },
  });
  console.log("2 org membership added");
  // fetch contexts via browser
  const ctxs = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const r = await fetch("/auth/contexts", { headers: { authorization: `Bearer ${t}` } });
    return { status: r.status, body: await r.json() };
  });
  console.log("3 contexts", ctxs.status, JSON.stringify(ctxs.body).slice(0, 500));
  if (ctxs.status !== 200 || ctxs.body.data.contexts.length < 2)
    throw new Error("contexts list failed");
  console.log(" contexts list OK personal+org");
  // reload to trigger loadContextsAndRender (showDashboard called on restoreSession)
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-dashboard:not(.hidden)", { timeout: 5000 });
  // check UI switcher appears (contexts>1)
  await page.waitForSelector("#context-switcher:not(.hidden)", { timeout: 5000 }).catch(() => {
    throw new Error("context switcher not visible");
  });
  console.log("4 UI switcher visible OK");
  // switch to org via UI
  await page.selectOption("#context-switcher", ORG_A);
  await page.waitForTimeout(1500);
  const topTenant = await page.textContent("#topbar-tenant");
  console.log("5 after switch to org topbar", topTenant);
  if (!topTenant?.includes("E2E Org")) throw new Error("topbar not org");
  const storedAfterOrg = await page.evaluate(() => localStorage.getItem("oku.tenantId"));
  if (storedAfterOrg !== ORG_A) throw new Error("localStorage not org");
  console.log("6 localStorage org OK");
  // verify /auth/me reflects org
  const meOrg = await page.evaluate(async (tid) => {
    const t = localStorage.getItem("oku.accessToken");
    const r = await fetch("/auth/me", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tid },
    });
    return { status: r.status, body: await r.json() };
  }, ORG_A);
  if (meOrg.body.data.tenantContext.tenantId !== ORG_A) throw new Error("me org mismatch");
  console.log("7 /auth/me org OK");
  // switch back to personal
  await page.selectOption("#context-switcher", tenantPersonal);
  await page.waitForTimeout(1500);
  const topPersonal = await page.textContent("#topbar-tenant");
  console.log("8 back to personal topbar", topPersonal);
  if (!topPersonal?.includes("Kişisel")) throw new Error("not personal");
  console.log("9 personal data isolation check via progress");
  const progPersonal = await page.evaluate(async (tid) => {
    const t = localStorage.getItem("oku.accessToken");
    const r = await fetch("/student/progress", {
      headers: { authorization: `Bearer ${t}`, "x-tenant-id": tid },
    });
    return r.status;
  }, tenantPersonal);
  console.log(" progress personal status", progPersonal);
  // unauthorized tenant
  const bad = await page.evaluate(async () => {
    const t = localStorage.getItem("oku.accessToken");
    const r = await fetch("/auth/me", {
      headers: {
        authorization: `Bearer ${t}`,
        "x-tenant-id": "00000000-0000-0000-0000-000000000099",
      },
    });
    return r.status;
  });
  if (![403, 400].includes(bad)) throw new Error("unauthorized not rejected");
  console.log("10 unauthorized tenant rejected OK");
  // cleanup
  await prisma.membership.deleteMany({ where: { userId: user!.id, tenantId: ORG_A } });
  await prisma.studentProgress.deleteMany({ where: { studentId: user!.id } });
  await prisma.pointEvent.deleteMany({ where: { studentId: user!.id } });
  await prisma.studentStreak.deleteMany({ where: { studentId: user!.id } });
  await prisma.studentBadge.deleteMany({ where: { studentId: user!.id } });
  await prisma.studentProfile.deleteMany({ where: { studentId: user!.id } });
  await prisma.membership.deleteMany({ where: { userId: user!.id } });
  await prisma.user.delete({ where: { id: user!.id } });
  await prisma.tenant.deleteMany({ where: { id: tenantPersonal } });
  console.log("cleanup done");
  await browser.close();
  await prisma.$disconnect();
  console.log("✅ CONTEXT SWITCHING E2E PASS");
}
main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
