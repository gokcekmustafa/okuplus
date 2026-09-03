import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "attempt-test-pass-123!";

const TENANT_A = "99999990-0000-7000-8000-0000000000a1";
const TENANT_B = "99999990-0000-7000-8000-0000000000b1";
const STUDENT_A = "99999990-0000-7000-8000-000000000001";
const STUDENT_B = "99999990-0000-7000-8000-000000000002";
const SUPER_ADMIN = "99999990-0000-7000-8000-000000000099";
const CONTENT_A = "99999990-0000-7000-8000-0000000000c1";
const CONTENT_B = "99999990-0000-7000-8000-0000000000c2";
const TEMPLATE_A = "99999990-0000-7000-8000-0000000000d1";
const TEMPLATE_VERSION_A = "99999990-0000-7000-8000-0000000000d2";
const TEMPLATE_B = "99999990-0000-7000-8000-0000000000d3";
const TEMPLATE_VERSION_B = "99999990-0000-7000-8000-0000000000d4";
const QUESTION_A = "99999990-0000-7000-8000-0000000000e1";
const QUESTION_OE = "99999990-0000-7000-8000-0000000000e2";
const QUESTION_B = "99999990-0000-7000-8000-0000000000e3";
const SESSION_A = "99999990-0000-7000-8000-0000000000f1";
const SESSION_B = "99999990-0000-7000-8000-0000000000f2";

let QUESTION_VERSION_A = "";
let QUESTION_VERSION_OE = "";
let QUESTION_VERSION_B = "";

async function cleanup() {
  await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.attempt.deleteMany({
    where: { sessionId: { in: [SESSION_A, SESSION_B] } },
  });
  await prisma.attempt.deleteMany({ where: { clientAttemptId: { startsWith: "att-99999990" } } });
  await prisma.sessionContentVersion.deleteMany({
    where: { sessionId: { in: [SESSION_A, SESSION_B] } },
  });
  await prisma.exerciseSession.deleteMany({ where: { id: { in: [SESSION_A, SESSION_B] } } });
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_B] } },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_B] } },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersionMedia.deleteMany({
      where: { questionVersion: { questionId: { in: [QUESTION_A, QUESTION_OE, QUESTION_B] } } },
    });
    await tx.questionVersion.deleteMany({
      where: { questionId: { in: [QUESTION_A, QUESTION_OE, QUESTION_B] } },
    });
  });
  await prisma.question.deleteMany({
    where: { id: { in: [QUESTION_A, QUESTION_OE, QUESTION_B] } },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.exerciseTemplateVersion.deleteMany({
      where: { id: { in: [TEMPLATE_VERSION_A, TEMPLATE_VERSION_B] } },
    });
  });
  await prisma.exerciseTemplate.deleteMany({
    where: { id: { in: [TEMPLATE_A, TEMPLATE_B] } },
  });
  await prisma.content.deleteMany({ where: { id: { in: [CONTENT_A, CONTENT_B] } } });
  await prisma.membership.deleteMany({
    where: { userId: { in: [STUDENT_A, STUDENT_B, SUPER_ADMIN] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [STUDENT_A, STUDENT_B, SUPER_ADMIN] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
}

describe("attempt", () => {
  let app: FastifyInstance;

  const login = async (email: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.tokens.accessToken as string;
  };
  const auth = async (email: string) => ({ authorization: `Bearer ${await login(email)}` });

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const hash = await hasher.hash(PASSWORD);
    await prisma.user.createMany({
      data: [
        {
          id: STUDENT_A,
          email: "attempt-student-a@example.com",
          displayName: "Öğrenci A",
          passwordHash: hash,
        },
        {
          id: STUDENT_B,
          email: "attempt-student-b@example.com",
          displayName: "Öğrenci B",
          passwordHash: hash,
        },
        {
          id: SUPER_ADMIN,
          email: "attempt-super@example.com",
          displayName: "Süper",
          passwordHash: hash,
          platformRole: "SUPER_ADMIN",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "ORGANIZATION", name: "Attempt Tenant A" },
        { id: TENANT_B, type: "ORGANIZATION", name: "Attempt Tenant B" },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: TENANT_A, userId: STUDENT_A, role: "STUDENT", status: "ACTIVE" },
        { tenantId: TENANT_B, userId: STUDENT_B, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    await prisma.content.createMany({
      data: [
        {
          id: CONTENT_A,
          tenantId: TENANT_A,
          type: "PASSAGE",
          title: "Attempt İçerik A",
          difficulty: 0.5,
        },
        {
          id: CONTENT_B,
          tenantId: TENANT_B,
          type: "PASSAGE",
          title: "Attempt İçerik B",
          difficulty: 0.5,
        },
      ],
    });

    // Questions
    await prisma.question.createMany({
      data: [
        { id: QUESTION_A, contentId: CONTENT_A, position: 0, type: "MULTIPLE_CHOICE" },
        { id: QUESTION_OE, contentId: CONTENT_A, position: 1, type: "OPEN_ENDED" },
        { id: QUESTION_B, contentId: CONTENT_B, position: 0, type: "MULTIPLE_CHOICE" },
      ],
    });
    const qvA = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION_A,
        version: 1,
        prompt: "Başkent?",
        options: [
          { id: "a", text: "Ankara", position: 0 },
          { id: "b", text: "İstanbul", position: 1 },
        ],
        correctAnswer: {
          type: "MULTIPLE_CHOICE",
          correctOptionIds: ["a"],
          allowMultiple: false,
          partialCredit: false,
        },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    QUESTION_VERSION_A = qvA.id;
    const qvOE = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION_OE,
        version: 1,
        prompt: "Açık uçlu soru",
        options: [],
        correctAnswer: { type: "OPEN_ENDED", expectedAnswer: "cevap" },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    QUESTION_VERSION_OE = qvOE.id;
    const qvB = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION_B,
        version: 1,
        prompt: "Tenant B sorusu",
        options: [
          { id: "a", text: "X", position: 0 },
          { id: "b", text: "Y", position: 1 },
        ],
        correctAnswer: {
          type: "MULTIPLE_CHOICE",
          correctOptionIds: ["b"],
          allowMultiple: false,
          partialCredit: false,
        },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    QUESTION_VERSION_B = qvB.id;

    // Templates
    await prisma.exerciseTemplate.createMany({
      data: [
        {
          id: TEMPLATE_A,
          tenantId: TENANT_A,
          title: "Şablon A",
          type: "COMPREHENSION",
          status: "PUBLISHED",
        },
        {
          id: TEMPLATE_B,
          tenantId: TENANT_B,
          title: "Şablon B",
          type: "COMPREHENSION",
          status: "PUBLISHED",
        },
      ],
    });
    await prisma.exerciseTemplateVersion.createMany({
      data: [
        {
          id: TEMPLATE_VERSION_A,
          templateId: TEMPLATE_A,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
        {
          id: TEMPLATE_VERSION_B,
          templateId: TEMPLATE_B,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      ],
    });
    await prisma.exerciseTemplateVersionQuestion.createMany({
      data: [
        {
          templateVersionId: TEMPLATE_VERSION_A,
          questionVersionId: QUESTION_VERSION_A,
          position: 0,
          questionId: QUESTION_A,
        },
        {
          templateVersionId: TEMPLATE_VERSION_A,
          questionVersionId: QUESTION_VERSION_OE,
          position: 1,
          questionId: QUESTION_OE,
        },
        {
          templateVersionId: TEMPLATE_VERSION_B,
          questionVersionId: QUESTION_VERSION_B,
          position: 0,
          questionId: QUESTION_B,
        },
      ],
    });

    // Sessions
    await prisma.exerciseSession.createMany({
      data: [
        {
          id: SESSION_A,
          tenantId: TENANT_A,
          studentId: STUDENT_A,
          templateVersionId: TEMPLATE_VERSION_A,
          status: "IN_PROGRESS",
          clientSessionId: "sess-cli-a",
        },
        {
          id: SESSION_B,
          tenantId: TENANT_B,
          studentId: STUDENT_B,
          templateVersionId: TEMPLATE_VERSION_B,
          status: "IN_PROGRESS",
          clientSessionId: "sess-cli-b",
        },
      ],
    });

    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("401 yetkisiz", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      payload: { sessionId: SESSION_A, answer: ["a"], clientAttemptId: "att-99999990-401" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("geçerli session + doğru cevap → Attempt oluşur, rawScore persist", async () => {
    const clientAttemptId = "att-99999990-ok1";
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: ["a"], clientAttemptId, timeSpentMs: 1234 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.isCorrect).toBe(true);
    expect(body.rawScore).toBe(1);
    expect(body.answer).toEqual(["a"]);
    const db = await prisma.attempt.findFirst({ where: { clientAttemptId } });
    expect(db).not.toBeNull();
    expect(db!.rawScore).toBe(1);
    expect(db!.isCorrect).toBe(true);
    expect(db!.tenantId).toBe(TENANT_A);
  });

  it("geçerli session + yanlış cevap → rawScore 0 kaydedilir", async () => {
    const clientAttemptId = "att-99999990-wrong1";
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: ["b"], clientAttemptId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isCorrect).toBe(false);
    expect(res.json().data.rawScore).toBe(0);
    const db = await prisma.attempt.findFirst({ where: { clientAttemptId } });
    expect(db!.rawScore).toBe(0);
    expect(db!.isCorrect).toBe(false);
  });

  it("OPEN_ENDED → rawScore null, isCorrect null", async () => {
    const clientAttemptId = "att-99999990-oe1";
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_OE}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: "serbest metin", clientAttemptId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.rawScore).toBeNull();
    expect(res.json().data.isCorrect).toBeNull();
    expect(res.json().data.feedback).toBe("Manuel değerlendirme gerekli");
    const db = await prisma.attempt.findFirst({ where: { clientAttemptId } });
    expect(db!.rawScore).toBeNull();
    expect(db!.isCorrect).toBeNull();
  });

  it("duplicate clientAttemptId → 409", async () => {
    const clientAttemptId = "att-99999990-dup1";
    const first = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: ["a"], clientAttemptId },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: ["b"], clientAttemptId },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.message).toMatch(/zaten kullanılmış/);
    // transaction: sadece bir kayıt olmalı
    const count = await prisma.attempt.count({ where: { clientAttemptId } });
    expect(count).toBe(1);
  });

  it("olmayan session → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: {
        sessionId: "00000000-0000-0000-0000-000000000000",
        answer: ["a"],
        clientAttemptId: "att-99999990-nosess",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("cross-tenant session → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_B, answer: ["a"], clientAttemptId: "att-99999990-cross-sess" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("cross-tenant question → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_B}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: ["b"], clientAttemptId: "att-99999990-cross-q" },
    });
    expect([403, 400]).toContain(res.statusCode); // şablon uyuşmazlığı 400 de olabilir
    // spesifik: soru şablona ait değil → 400 de kabul
    if (res.statusCode === 403) expect(res.json().error.message).toMatch(/kapsam/);
  });

  it("SUPER_ADMIN erişimi → başarılı", async () => {
    const clientAttemptId = "att-99999990-super1";
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-super@example.com"),
      payload: { sessionId: SESSION_A, answer: ["a"], clientAttemptId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.rawScore).toBe(1);
  });

  it("rawScore DB'de gerçekten 0–1 arasında persist", async () => {
    const clientAttemptId = "att-99999990-persist1";
    await app.inject({
      method: "POST",
      url: `/admin/questions/${QUESTION_VERSION_A}/attempts`,
      headers: await auth("attempt-student-a@example.com"),
      payload: { sessionId: SESSION_A, answer: ["a"], clientAttemptId },
    });
    const db = await prisma.attempt.findFirst({ where: { clientAttemptId } });
    expect(db!.rawScore).toBeGreaterThanOrEqual(0);
    expect(db!.rawScore).toBeLessThanOrEqual(1);
  });
});
