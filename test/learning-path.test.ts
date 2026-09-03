/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { provisionPersonalContext } from "../src/modules/tenant/index.js";

const PASSWORD = "path-pass-123!";
const EMAIL = "path-8f2@example.com";
const OTHER_EMAIL = "path-other-8f2@example.com";
const SKILL_A = "8f200000-0000-7000-8000-0000000000a1";
const SKILL_B = "8f200000-0000-7000-8000-0000000000a2";
const CONTENT_ID = "8f200000-0000-7000-8000-0000000000c1";
const CV_ID = "8f200000-0000-7000-8000-0000000000c2";
const Q_ID = "8f200000-0000-7000-8000-0000000000d1";
const QV_ID = "8f200000-0000-7000-8000-0000000000d2";
const TMPL_A = "8f200000-0000-7000-8000-0000000000e1";
const TMPL_AV = "8f200000-0000-7000-8000-0000000000e2";
const TMPL_B = "8f200000-0000-7000-8000-0000000000e3";
const TMPL_BV = "8f200000-0000-7000-8000-0000000000e4";
const LEVEL_ID = "8f200000-0000-7000-8000-0000000000f1";

let app: FastifyInstance;
let userId = "";
let personalTenantId = "";
let token = "";
let otherToken = "";

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const uIds = [...new Set([...users.map((u) => u.id), userId].filter(Boolean))];
  const tids = (
    await prisma.membership.findMany({
      where: { userId: { in: uIds } },
      select: { tenantId: true },
    })
  ).map((m) => m.tenantId);
  const allTids = [...new Set([...tids, personalTenantId].filter(Boolean))];
  await prisma.attempt.deleteMany({ where: { tenantId: { in: allTids } } });
  await prisma.exerciseSession.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.studentBadge.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: uIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: uIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: uIds } } });
  await prisma.user.deleteMany({ where: { id: { in: uIds } } });
  await prisma.tenant.deleteMany({
    where: { id: { in: allTids.filter((id) => id !== personalTenantId) } },
  });
  // keep personal tenant for other tests? delete only test tenants
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: { in: [TMPL_AV, TMPL_BV] } },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: { in: [TMPL_AV, TMPL_BV] } },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { id: QV_ID } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: { in: [TMPL_AV, TMPL_BV] } } });
    await tx.contentVersion.deleteMany({ where: { id: CV_ID } });
  });
  await prisma.question.deleteMany({ where: { id: Q_ID } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: { in: [TMPL_A, TMPL_B] } } });
  await prisma.content.deleteMany({ where: { id: CONTENT_ID } });
  await prisma.skill.deleteMany({ where: { id: { in: [SKILL_A, SKILL_B] } } });
  await prisma.level.deleteMany({ where: { id: LEVEL_ID } });
  // personal tenant will be cleaned via user delete cascade? ensure
  if (personalTenantId) {
    const remaining = await prisma.tenant.findUnique({ where: { id: personalTenantId } });
    if (remaining) {
      await prisma.studentProfile.deleteMany({ where: { tenantId: personalTenantId } });
      await prisma.tenant.deleteMany({ where: { id: personalTenantId } });
    }
  }
}

describe.sequential("learning path", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash(PASSWORD);
    const u = await prisma.user.create({
      data: { email: EMAIL, displayName: "Path User", passwordHash: hash, status: "ACTIVE" },
      select: { id: true },
    });
    userId = u.id;
    const ctx = await provisionPersonalContext(userId);
    personalTenantId = ctx.tenantId;
    const ou = await prisma.user.create({
      data: { email: OTHER_EMAIL, displayName: "Other", passwordHash: hash, status: "ACTIVE" },
      select: { id: true },
    });
    await provisionPersonalContext(ou.id);
    await prisma.skill.createMany({
      data: [
        { id: SKILL_A, code: "PATH_A", name: "Path A", category: "MAIN_IDEA", displayOrder: 1 },
        { id: SKILL_B, code: "PATH_B", name: "Path B", category: "DETAIL", displayOrder: 2 },
      ],
    });
    await prisma.level.create({
      data: {
        id: LEVEL_ID,
        code: "PATH_L1",
        name: "Seviye 1",
        minScore: 0,
        maxScore: 100,
        difficultyMin: 0,
        difficultyMax: 5,
        displayOrder: 1,
      },
    });
    await prisma.studentProfile.update({
      where: { tenantId_studentId: { tenantId: personalTenantId, studentId: userId } },
      data: { currentLevelId: LEVEL_ID },
    });
    await prisma.content.create({
      data: {
        id: CONTENT_ID,
        type: "PASSAGE",
        title: "Path Content",
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
        body: "hello",
        wordCount: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.content.update({ where: { id: CONTENT_ID }, data: { currentVersionId: CV_ID } });
    await prisma.question.create({
      data: {
        id: Q_ID,
        contentId: CONTENT_ID,
        position: 1,
        type: "TRUE_FALSE",
        skillId: SKILL_A,
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
    await prisma.exerciseTemplate.createMany({
      data: [
        {
          id: TMPL_A,
          contentId: CONTENT_ID,
          title: "Tmpl A",
          type: "COMPREHENSION",
          skillId: SKILL_A,
          status: "PUBLISHED",
        },
        {
          id: TMPL_B,
          contentId: CONTENT_ID,
          title: "Tmpl B",
          type: "COMPREHENSION",
          skillId: SKILL_B,
          status: "PUBLISHED",
        },
      ],
    });
    await prisma.exerciseTemplateVersion.createMany({
      data: [
        {
          id: TMPL_AV,
          templateId: TMPL_A,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
        {
          id: TMPL_BV,
          templateId: TMPL_B,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() + 1000),
        },
      ],
    });
    await prisma.exerciseTemplateVersionContent.createMany({
      data: [
        { templateVersionId: TMPL_AV, contentVersionId: CV_ID, position: 0 },
        { templateVersionId: TMPL_BV, contentVersionId: CV_ID, position: 0 },
      ],
    });
    await prisma.exerciseTemplateVersionQuestion.createMany({
      data: [
        { templateVersionId: TMPL_AV, questionVersionId: QV_ID, questionId: Q_ID, position: 0 },
        { templateVersionId: TMPL_BV, questionVersionId: QV_ID, questionId: Q_ID, position: 0 },
      ],
    });
    app = await buildApp(loadEnv());
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    token = login.json().data.tokens.accessToken;
    const ologin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: OTHER_EMAIL, password: PASSWORD },
    });
    otherToken = ologin.json().data.tokens.accessToken;
  });
  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("node generation >0", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.nodes.length).toBeGreaterThan(0);
  });
  it("current node exists", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    const nodes = r.json().data.nodes;
    expect(nodes.some((n: any) => n.isCurrent)).toBe(true);
    expect(nodes.some((n: any) => n.status === "active")).toBe(true);
  });
  it("deterministic order", async () => {
    const a = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    const b = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(a.json().data.nodes.map((n: any) => n.id)).toEqual(
      b.json().data.nodes.map((n: any) => n.id),
    );
  });
  it("completed after session", async () => {
    // create completed session for skill A
    const sess = await prisma.exerciseSession.create({
      data: {
        tenantId: personalTenantId,
        studentId: userId,
        templateVersionId: TMPL_AV,
        status: "COMPLETED",
        completedAt: new Date(),
        context: "INDIVIDUAL",
        sessionType: "PRACTICE",
      },
      select: { id: true },
    });
    await prisma.studentProgress.create({
      data: {
        tenantId: personalTenantId,
        studentId: userId,
        skillId: SKILL_A,
        periodStart: new Date("2026-01-05"),
        periodEnd: new Date("2026-01-11"),
        sessionCount: 1,
        attemptCount: 1,
      },
    });
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    const nodes = r.json().data.nodes;
    expect(nodes.filter((n: any) => n.status === "completed").length).toBeGreaterThanOrEqual(1);
    expect(nodes.some((n: any) => n.status === "active")).toBe(true);
    await prisma.exerciseSession.delete({ where: { id: sess.id } });
    await prisma.studentProgress.deleteMany({ where: { studentId: userId, skillId: SKILL_A } });
  });
  it("personal context", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
  });
  it("cross-user protection", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    // other user has different progress, but should not see first user's completed
    expect(r.statusCode).toBe(200);
    const nodes = r.json().data.nodes;
    // other user has no progress, so first node active not completed
    const nodeA = nodes.find((n: any) => n.code === "PATH_A" || n.code.startsWith("PATH_A-"));
    expect(nodeA).toBeDefined();
    expect(nodeA!.status).not.toBe("completed");
  });
  it("level mapping", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.json().data.currentLevel?.code).toBe("PATH_L1");
  });
  it("skill label mapping", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/learning-path",
      headers: { authorization: `Bearer ${token}` },
    });
    const nodeA = r
      .json()
      .data.nodes.find((n: any) => n.code === "PATH_A" || n.code.startsWith("PATH_A-"));
    expect(nodeA).toBeDefined();
    expect(nodeA!.label).toBeTruthy();
    expect(typeof nodeA!.label).toBe("string");
  });
});
