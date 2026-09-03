import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { provisionPersonalContext } from "../src/modules/tenant/index.js";

const PASSWORD = "onboarding-pass-123!";
const EMAIL = "onboard-8d@example.com";
const OTHER_EMAIL = "onboard-other-8d@example.com";

const SKILL_ID = "8d000000-0000-7000-8000-0000000000b1";
const CONTENT_ID = "8d000000-0000-7000-8000-0000000000c1";
const CV_ID = "8d000000-0000-7000-8000-0000000000c2";
const Q_ID = "8d000000-0000-7000-8000-0000000000d1";
const QV_ID = "8d000000-0000-7000-8000-0000000000d2";
const TMPL_ID = "8d000000-0000-7000-8000-0000000000e1";
const TMPL_VID = "8d000000-0000-7000-8000-0000000000e2";
const LEVEL_ID = "8d000000-0000-7000-8000-0000000000f1";
const ASSM_ID = "8d000000-0000-7000-8000-0000000000a1";

let app: FastifyInstance;
let userId = "";
let personalTenantId = "";
let accessToken = "";
let otherUserId = "";
let otherToken = "";

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const uIds = users.map((u) => u.id);
  if (uIds.length === 0 && !userId && !otherUserId) return;
  const allIds = [...new Set([...uIds, userId, otherUserId].filter(Boolean))];
  const memTids = (
    await prisma.membership.findMany({
      where: { userId: { in: allIds } },
      select: { tenantId: true },
    })
  ).map((m) => m.tenantId);
  const allTids = [...new Set([...memTids, personalTenantId].filter(Boolean))];
  await prisma.consent.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.studentBadge.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.attempt.deleteMany({ where: { tenantId: { in: allTids } } });
  await prisma.exerciseSession.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: allIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.authIdentity.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: allTids } } });
  await prisma.assessment.deleteMany({ where: { id: ASSM_ID } });
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
  await prisma.level.deleteMany({ where: { id: LEVEL_ID } });
  await prisma.authSession.deleteMany({ where: { userId: { in: allIds } } });
}

describe.sequential("onboarding", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash(PASSWORD);
    const u = await prisma.user.create({
      data: {
        email: EMAIL,
        displayName: "Onboard User",
        passwordHash: hash,
        status: "ACTIVE",
        birthYear: 2012,
      },
      select: { id: true },
    });
    userId = u.id;
    const ctx = await provisionPersonalContext(userId);
    personalTenantId = ctx.tenantId;
    const ou = await prisma.user.create({
      data: { email: OTHER_EMAIL, displayName: "Other", passwordHash: hash, status: "ACTIVE" },
      select: { id: true },
    });
    otherUserId = ou.id;
    await provisionPersonalContext(otherUserId);
    await prisma.skill.create({
      data: { id: SKILL_ID, code: "ONB_SKILL", name: "Onb Skill", category: "COMPREHENSION" },
    });
    await prisma.level.create({
      data: {
        id: LEVEL_ID,
        code: "L5",
        name: "5. Sınıf",
        minScore: 0,
        maxScore: 100,
        difficultyMin: 0,
        difficultyMax: 5,
        displayOrder: 5,
      },
    });
    await prisma.content.create({
      data: {
        id: CONTENT_ID,
        type: "PASSAGE",
        title: "Onb Content",
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
        body: "hello world content for onboarding",
        wordCount: 4,
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
        title: "Onb Tmpl",
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
    await prisma.assessment.create({
      data: {
        id: ASSM_ID,
        title: "Placement 8D",
        type: "PLACEMENT",
        status: "PUBLISHED",
        config: { templateId: TMPL_ID, templateVersionId: TMPL_VID },
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

  it("1 initial onboarding not completed", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.completed).toBe(false);
  });
  it("2 profile update", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: "/student/profile",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        displayName: "Onboard Updated",
        birthYear: 2011,
        currentLevelId: LEVEL_ID,
        learningGoal: "SPEED",
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.profile.displayName).toBe("Onboard Updated");
    expect(r.json().data.profile.learningGoal).toBe("SPEED");
  });
  it("3 consent create", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/student/consents",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "TERMS_OF_SERVICE", version: "v1" },
    });
    expect(r.statusCode).toBe(200);
  });
  it("4 consent idempotency", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/student/consents",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "TERMS_OF_SERVICE", version: "v1" },
    });
    expect(r.statusCode).toBe(200);
    const count = await prisma.consent.count({
      where: { userId, type: "TERMS_OF_SERVICE", version: "v1" },
    });
    expect(count).toBe(1);
  });
  it("5 onboarding complete fails without required consents", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/student/onboarding/complete",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(400);
  });
  it("6 grant second consent and complete", async () => {
    await app.inject({
      method: "POST",
      url: "/student/consents",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "DATA_PROCESSING", version: "v1" },
    });
    // minor needs parental
    const state = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const required = state.json().data.requiredConsents as string[];
    if (required.includes("PARENTAL_CONSENT")) {
      await app.inject({
        method: "POST",
        url: "/student/consents",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { type: "PARENTAL_CONSENT", version: "v1" },
      });
    }
    const r = await app.inject({
      method: "POST",
      url: "/student/onboarding/complete",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.completed).toBe(true);
  });
  it("7 completed user skips onboarding", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.json().data.completed).toBe(true);
    expect(r.json().data.completedAt).toBeTruthy();
  });
  it("8 resume onboarding (already completed stays)", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.json().data.profile.learningGoal).toBe("SPEED");
  });
  it("9 personal context", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
  });
  it("10 cross-user protection", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(r.json().data.profile.displayName).toBe("Other");
    expect(r.json().data.profile.displayName).not.toBe("Onboard Updated");
  });
  it("11 consent ownership", async () => {
    const otherCons = await prisma.consent.count({ where: { userId: otherUserId } });
    expect(otherCons).toBe(0);
    const myCons = await prisma.consent.count({ where: { userId } });
    expect(myCons).toBeGreaterThan(0);
  });
  it("12 placement launch", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding/placement",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.assessmentId).toBe(ASSM_ID);
  });
  it("13 quick-start launch", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding/quick-start",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.templateVersionId).toBe(TMPL_VID);
  });
  it("14 invalid profile input", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: "/student/profile",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displayName: "" },
    });
    expect(r.statusCode).toBe(400);
  });
  it("15 duplicate completion idempotent", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/student/onboarding/complete",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.completed).toBe(true);
  });
  it("16 levels endpoint", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding/levels",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.levels.length).toBeGreaterThan(0);
  });
  it("17 logout/relogin state persists", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });
    const newToken = login.json().data.tokens.accessToken;
    const r = await app.inject({
      method: "GET",
      url: "/student/onboarding",
      headers: { authorization: `Bearer ${newToken}` },
    });
    expect(r.json().data.completed).toBe(true);
  });
});
