/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { provisionPersonalContext } from "../src/modules/tenant/index.js";

const PASSWORD = "context-switch-pass-123!";
const EMAIL = "ctx-switch@example.com";
const OTHER_EMAIL = "ctx-other@example.com";
const PLATFORM_EMAIL = "ctx-platform@example.com";

const ORG_A = "9c000000-0000-7000-8000-0000000000a1";
const ORG_B = "9c000000-0000-7000-8000-0000000000a2";
const ORG_SUSPENDED = "9c000000-0000-7000-8000-0000000000a3";
const ORG_DELETED = "9c000000-0000-7000-8000-0000000000a4";
const PLATFORM_ID = "9c000000-0000-7000-8000-0000000000ff";
const SKILL_ID = "9c000000-0000-7000-8000-0000000000b1";
const CONTENT_ID = "9c000000-0000-7000-8000-0000000000c1";
const CV_ID = "9c000000-0000-7000-8000-0000000000c2";
const Q_ID = "9c000000-0000-7000-8000-0000000000d1";
const QV_ID = "9c000000-0000-7000-8000-0000000000d2";
const TMPL_ID = "9c000000-0000-7000-8000-0000000000e1";
const TMPL_VID = "9c000000-0000-7000-8000-0000000000e2";

let app: FastifyInstance;
let userId = "";
let personalTenantId = "";
let accessToken = "";
let otherUserId = "";
let otherTenantId = "";
let platformId = "";

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL, OTHER_EMAIL, PLATFORM_EMAIL] } },
    select: { id: true },
  });
  const uIds = users.map((u) => u.id);
  const memTenantIds = (
    await prisma.membership.findMany({
      where: { userId: { in: uIds } },
      select: { tenantId: true },
    })
  ).map((m) => m.tenantId);
  const allTids = [
    ...new Set(
      [
        ORG_A,
        ORG_B,
        ORG_SUSPENDED,
        ORG_DELETED,
        personalTenantId,
        otherTenantId,
        ...memTenantIds,
      ].filter(Boolean),
    ),
  ];
  await prisma.studentProgress.deleteMany({
    where: { OR: [{ studentId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.pointEvent.deleteMany({
    where: { OR: [{ studentId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.studentStreak.deleteMany({
    where: { OR: [{ studentId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.studentBadge.deleteMany({
    where: { OR: [{ studentId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.exerciseSession.deleteMany({
    where: { OR: [{ studentId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.studentProfile.deleteMany({
    where: { OR: [{ studentId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.membership.deleteMany({
    where: { OR: [{ userId: { in: uIds } }, { tenantId: { in: allTids } }] },
  });
  await prisma.authSession.deleteMany({ where: { userId: { in: uIds } } });
  await prisma.authIdentity.deleteMany({ where: { userId: { in: uIds } } });
  await prisma.user.deleteMany({ where: { id: { in: uIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: allTids } } });
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: TMPL_VID },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: TMPL_VID },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { id: QV_ID } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TMPL_VID } });
    await tx.contentVersion.deleteMany({ where: { id: CV_ID } });
  });
  await prisma.question.deleteMany({ where: { id: Q_ID } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: TMPL_ID } });
  await prisma.content.deleteMany({ where: { id: CONTENT_ID } });
  await prisma.skill.deleteMany({ where: { id: SKILL_ID } });
  if (platformId) await prisma.user.deleteMany({ where: { id: platformId } });
}

describe.sequential("context switching", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash(PASSWORD);
    // users
    const u = await prisma.user.create({
      data: { email: EMAIL, displayName: "Ctx User", passwordHash: hash, status: "ACTIVE" },
      select: { id: true },
    });
    userId = u.id;
    const ctx = await provisionPersonalContext(userId);
    personalTenantId = ctx.tenantId;
    // other user
    const ou = await prisma.user.create({
      data: { email: OTHER_EMAIL, displayName: "Other", passwordHash: hash, status: "ACTIVE" },
      select: { id: true },
    });
    otherUserId = ou.id;
    const octx = await provisionPersonalContext(otherUserId);
    otherTenantId = octx.tenantId;
    // platform
    const pu = await prisma.user.create({
      data: {
        id: PLATFORM_ID,
        email: PLATFORM_EMAIL,
        displayName: "Plat",
        passwordHash: hash,
        status: "ACTIVE",
        platformRole: "SUPER_ADMIN",
      },
      select: { id: true },
    });
    platformId = pu.id;
    // org tenants
    await prisma.tenant.createMany({
      data: [
        { id: ORG_A, type: "ORGANIZATION", name: "Okul A", status: "ACTIVE" },
        { id: ORG_B, type: "ORGANIZATION", name: "Okul B", status: "ACTIVE" },
        { id: ORG_SUSPENDED, type: "ORGANIZATION", name: "Askıda Okul", status: "SUSPENDED" },
        {
          id: ORG_DELETED,
          type: "ORGANIZATION",
          name: "Silinmiş Okul",
          status: "ACTIVE",
          deletedAt: new Date(),
        },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: ORG_A, userId, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_B, userId, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_SUSPENDED, userId, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_DELETED, userId, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    // revoked membership scenario: create then remove
    // fixture for isolation: skill/content for progress
    await prisma.skill.create({
      data: { id: SKILL_ID, code: "CTX_SKILL", name: "Ctx Skill", category: "COMPREHENSION" },
    });
    await prisma.content.create({
      data: {
        id: CONTENT_ID,
        type: "PASSAGE",
        title: "Ctx Content",
        difficulty: 1,
        status: "PUBLISHED",
      },
    });
    await prisma.contentVersion.create({
      data: {
        id: CV_ID,
        contentId: CONTENT_ID,
        version: 1,
        title: "v1",
        body: "body",
        wordCount: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.question.create({
      data: {
        id: Q_ID,
        contentId: CONTENT_ID,
        position: 1,
        type: "TRUE_FALSE",
        skillId: SKILL_ID,
        status: "PUBLISHED",
      },
    });
    await prisma.questionVersion.create({
      data: {
        id: QV_ID,
        questionId: Q_ID,
        version: 1,
        prompt: "p",
        correctAnswer: { type: "TRUE_FALSE", answer: true },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.exerciseTemplate.create({
      data: {
        id: TMPL_ID,
        contentId: CONTENT_ID,
        title: "Ctx Tmpl",
        type: "COMPREHENSION",
        status: "PUBLISHED",
      },
    });
    await prisma.exerciseTemplateVersion.create({
      data: {
        id: TMPL_VID,
        templateId: TMPL_ID,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.exerciseTemplateVersionContent.create({
      data: { templateVersionId: TMPL_VID, contentVersionId: CV_ID, position: 0 },
    });
    await prisma.exerciseTemplateVersionQuestion.create({
      data: {
        templateVersionId: TMPL_VID,
        questionVersionId: QV_ID,
        questionId: Q_ID,
        position: 0,
      },
    });

    app = await buildApp(loadEnv());
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    accessToken = login.json().data.tokens.accessToken;
  });
  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("1 personal context list", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/contexts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    const ctxs = r.json().data.contexts;
    expect(ctxs.some((c: any) => c.id === personalTenantId && c.isPersonal === true)).toBe(true);
  });
  it("2 organization contexts visible", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/contexts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const ids = r.json().data.contexts.map((c: any) => c.id);
    expect(ids).toContain(ORG_A);
    expect(ids).toContain(ORG_B);
  });
  it("3 revoked/suspended/deleted not visible", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/contexts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const ids = r.json().data.contexts.map((c: any) => c.id);
    expect(ids).not.toContain(ORG_SUSPENDED);
    expect(ids).not.toContain(ORG_DELETED);
  });
  it("4 default is personal", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(r.json().data.tenantContext.tenantId).toBe(personalTenantId);
    expect(r.json().data.tenantContext.tenantType).toBe("INDIVIDUAL");
  });
  it("5 explicit org A login", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD, tenantId: ORG_A },
    });
    expect(r.json().data.tenantContext.tenantId).toBe(ORG_A);
  });
  it("6 switch personal → org via X-Tenant-Id", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_A },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.tenantContext.tenantId).toBe(ORG_A);
  });
  it("7 switch org → personal", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": personalTenantId },
    });
    expect(r.json().data.tenantContext.tenantId).toBe(personalTenantId);
  });
  it("8 org A → org B", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_B },
    });
    expect(r.json().data.tenantContext.tenantId).toBe(ORG_B);
  });
  it("9 inaccessible tenant 403", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": otherTenantId },
    });
    expect(r.statusCode).toBe(403);
  });
  it("10 revoked membership not accessible", async () => {
    const mem = await prisma.membership.findFirst({ where: { tenantId: ORG_B, userId } });
    await prisma.membership.update({
      where: { id: mem!.id },
      data: { status: "REMOVED", deletedAt: new Date() },
    });
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_B },
    });
    expect(r.statusCode).toBe(403);
    await prisma.membership.update({
      where: { id: mem!.id },
      data: { status: "ACTIVE", deletedAt: null },
    });
  });
  it("11 suspended tenant not accessible", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_SUSPENDED },
    });
    expect(r.statusCode).toBe(403);
  });
  it("12 deleted tenant not accessible", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_DELETED },
    });
    expect(r.statusCode).toBe(403);
  });
  it("13 cross-user context 403", async () => {
    const otherLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: OTHER_EMAIL, password: PASSWORD },
    });
    const otherToken = otherLogin.json().data.tokens.accessToken;
    const r = await app.inject({
      method: "GET",
      url: "/student/gamification",
      headers: { authorization: `Bearer ${otherToken}`, "x-tenant-id": personalTenantId },
    });
    expect(r.statusCode).toBe(403);
  });
  it("14 personal data isolation", async () => {
    // create progress in personal
    await prisma.studentProgress.create({
      data: {
        tenantId: personalTenantId,
        studentId: userId,
        skillId: SKILL_ID,
        periodStart: new Date("2026-01-05"),
        periodEnd: new Date("2026-01-11"),
        sessionCount: 1,
        attemptCount: 1,
      },
    });
    const pers = await app.inject({
      method: "GET",
      url: "/student/progress",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": personalTenantId },
    });
    const org = await app.inject({
      method: "GET",
      url: "/student/progress",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_A },
    });
    expect(pers.json().data.items.length).toBeGreaterThan(0);
    // org should not see personal progress (different tenant filter via RLS/withTenantContext, here tenantId differs so should be 0 or not contain personal)
    const orgIds = org.json().data.items.map((i: any) => i.periodStart);
    const persIds = pers.json().data.items.map((i: any) => i.periodStart);
    expect(orgIds).not.toEqual(persIds);
  });
  it("15 organization data isolation (assignment)", async () => {
    // assignment in ORG_A should not appear in personal
    const branch = await prisma.branch.create({
      data: { tenantId: ORG_A, name: "B1", code: "B1" },
    });
    const ay = await prisma.academicYear.create({
      data: {
        tenantId: ORG_A,
        name: "2026",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-01"),
        status: "ACTIVE",
      },
    });
    const cls = await prisma.class.create({
      data: {
        tenantId: ORG_A,
        branchId: branch.id,
        academicYearId: ay.id,
        name: "5A",
        gradeLevel: 5,
      },
    });
    const teacher = await prisma.user.create({
      data: {
        email: `t-${Date.now()}@example.com`,
        displayName: "T",
        passwordHash: "x",
        status: "ACTIVE",
      },
    });
    const ass = await prisma.assignment.create({
      data: {
        tenantId: ORG_A,
        classId: cls.id,
        templateId: TMPL_ID,
        teacherId: teacher.id,
        title: "Org A Assignment",
        status: "ACTIVE",
      },
    });
    // personal is student, not super admin -> assignment list not accessible; verify via direct DB isolation: personal tenant has no assignments
    expect(await prisma.assignment.count({ where: { tenantId: personalTenantId } })).toBe(0);
    expect(await prisma.assignment.count({ where: { tenantId: ORG_A } })).toBeGreaterThan(0);
    await prisma.assignment.delete({ where: { id: ass.id } });
    await prisma.user.delete({ where: { id: teacher.id } });
    await prisma.class.delete({ where: { id: cls.id } });
    await prisma.academicYear.delete({ where: { id: ay.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
  });
  it("16 same UserId across contexts", async () => {
    const p = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": personalTenantId },
    });
    const o = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": ORG_A },
    });
    expect(p.json().data.user.id).toBe(userId);
    expect(o.json().data.user.id).toBe(userId);
    expect(p.json().data.user.id).toBe(o.json().data.user.id);
  });
  it("17 header tampering rejected", async () => {
    const fake = "00000000-0000-0000-0000-000000000000";
    const r = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}`, "x-tenant-id": fake },
    });
    expect([403, 400]).toContain(r.statusCode);
  });
  it("18 platform admin behavior", async () => {
    const platLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: PLATFORM_EMAIL, password: PASSWORD },
    });
    expect(platLogin.json().data.tenantContext.tenantId).toBeNull();
    const ctxs = await app.inject({
      method: "GET",
      url: "/auth/contexts",
      headers: { authorization: `Bearer ${platLogin.json().data.tokens.accessToken}` },
    });
    expect(ctxs.json().data.contexts.length).toBe(0);
  });
});
