/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "session-test-pass-123!";

const TENANT_A = "99999981-0000-7000-8000-0000000000a1";
const TENANT_B = "99999981-0000-7000-8000-0000000000b1";
const STUDENT_A = "99999981-0000-7000-8000-000000000001";
const STUDENT_B = "99999981-0000-7000-8000-000000000002";
const SUPER_ADMIN = "99999981-0000-7000-8000-000000000099";
const CONTENT_A = "99999981-0000-7000-8000-0000000000c1";
const CONTENT_B = "99999981-0000-7000-8000-0000000000c2";
const TEMPLATE_A = "99999981-0000-7000-8000-0000000000d1";
const TEMPLATE_UNPUB = "99999981-0000-7000-8000-0000000000d3";
const TEMPLATE_B = "99999981-0000-7000-8000-0000000000d5";
const TEMPLATE_VERSION_A = "99999981-0000-7000-8000-0000000000d2";
const TEMPLATE_VERSION_UNPUB = "99999981-0000-7000-8000-0000000000d4";
const TEMPLATE_VERSION_B = "99999981-0000-7000-8000-0000000000d6";
const TEMPLATE_VERSION_UNPUB_Q = "99999981-0000-7000-8000-0000000000d7";
const QUESTION_A = "99999981-0000-7000-8000-0000000000e1";
const QUESTION_OE = "99999981-0000-7000-8000-0000000000e2";
const QUESTION_UNPUB = "99999981-0000-7000-8000-0000000000e3";
const QUESTION_B = "99999981-0000-7000-8000-0000000000e4";

let QV_A = "";
let QV_OE = "";
let QV_UNPUB = "";
let QV_B = "";

async function cleanup() {
  await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.attempt.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { tenantId: { in: [TENANT_A, TENANT_B] } } },
  });
  await prisma.exerciseSession.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: {
      templateVersionId: {
        in: [
          TEMPLATE_VERSION_A,
          TEMPLATE_VERSION_UNPUB,
          TEMPLATE_VERSION_B,
          TEMPLATE_VERSION_UNPUB_Q,
        ],
      },
    },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: {
      templateVersionId: {
        in: [
          TEMPLATE_VERSION_A,
          TEMPLATE_VERSION_UNPUB,
          TEMPLATE_VERSION_B,
          TEMPLATE_VERSION_UNPUB_Q,
        ],
      },
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersionMedia.deleteMany({
      where: {
        questionVersion: {
          questionId: { in: [QUESTION_A, QUESTION_OE, QUESTION_UNPUB, QUESTION_B] },
        },
      },
    });
    await tx.questionVersion.deleteMany({
      where: { questionId: { in: [QUESTION_A, QUESTION_OE, QUESTION_UNPUB, QUESTION_B] } },
    });
    await tx.contentVersion.deleteMany({
      where: { contentId: { in: [CONTENT_A, CONTENT_B] } },
    });
  });
  await prisma.question.deleteMany({
    where: { id: { in: [QUESTION_A, QUESTION_OE, QUESTION_UNPUB, QUESTION_B] } },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.exerciseTemplateVersion.deleteMany({
      where: {
        id: {
          in: [
            TEMPLATE_VERSION_A,
            TEMPLATE_VERSION_UNPUB,
            TEMPLATE_VERSION_B,
            TEMPLATE_VERSION_UNPUB_Q,
          ],
        },
      },
    });
  });
  await prisma.exerciseTemplate.deleteMany({
    where: { id: { in: [TEMPLATE_A, TEMPLATE_UNPUB, TEMPLATE_B] } },
  });
  await prisma.content.deleteMany({ where: { id: { in: [CONTENT_A, CONTENT_B] } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.user.deleteMany({ where: { id: { in: [STUDENT_A, STUDENT_B, SUPER_ADMIN] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
}

describe("exercise session", () => {
  let app: FastifyInstance;
  let SESSION_A_ID = "";

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
          email: "session-student-a@example.com",
          displayName: "Öğr A",
          passwordHash: hash,
        },
        {
          id: STUDENT_B,
          email: "session-student-b@example.com",
          displayName: "Öğr B",
          passwordHash: hash,
        },
        {
          id: SUPER_ADMIN,
          email: "session-super@example.com",
          displayName: "Süper",
          passwordHash: hash,
          platformRole: "SUPER_ADMIN",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "ORGANIZATION", name: "Session Tenant A" },
        { id: TENANT_B, type: "ORGANIZATION", name: "Session Tenant B" },
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
          title: "Sess İçerik A",
          difficulty: 0.5,
        },
        {
          id: CONTENT_B,
          tenantId: TENANT_B,
          type: "PASSAGE",
          title: "Sess İçerik B",
          difficulty: 0.5,
        },
      ],
    });
    const cvA = await prisma.contentVersion.create({
      data: {
        contentId: CONTENT_A,
        version: 1,
        title: "CV A",
        body: "metin",
        wordCount: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    const cvB = await prisma.contentVersion.create({
      data: {
        contentId: CONTENT_B,
        version: 1,
        title: "CV B",
        body: "metin2",
        wordCount: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.question.createMany({
      data: [
        { id: QUESTION_A, contentId: CONTENT_A, position: 0, type: "MULTIPLE_CHOICE" },
        { id: QUESTION_OE, contentId: CONTENT_A, position: 1, type: "OPEN_ENDED" },
        { id: QUESTION_UNPUB, contentId: CONTENT_A, position: 2, type: "MULTIPLE_CHOICE" },
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
    QV_A = qvA.id;
    const qvOE = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION_OE,
        version: 1,
        prompt: "Açık uçlu",
        options: [],
        correctAnswer: { type: "OPEN_ENDED", expectedAnswer: "cevap" },
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    QV_OE = qvOE.id;
    const qvUnpub = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION_UNPUB,
        version: 1,
        prompt: "Unpub",
        options: [{ id: "a", text: "A", position: 0 }],
        correctAnswer: {
          type: "MULTIPLE_CHOICE",
          correctOptionIds: ["a"],
          allowMultiple: false,
          partialCredit: false,
        },
        status: "DRAFT",
      },
      select: { id: true },
    });
    QV_UNPUB = qvUnpub.id;
    const qvB = await prisma.questionVersion.create({
      data: {
        questionId: QUESTION_B,
        version: 1,
        prompt: "Tenant B sorusu",
        options: [{ id: "a", text: "X", position: 0 }],
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
    QV_B = qvB.id;

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
          id: TEMPLATE_UNPUB,
          tenantId: TENANT_A,
          title: "Şablon Unpub",
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
        { id: TEMPLATE_VERSION_UNPUB, templateId: TEMPLATE_UNPUB, version: 1, status: "DRAFT" },
        {
          id: TEMPLATE_VERSION_B,
          templateId: TEMPLATE_B,
          version: 1,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
        {
          id: TEMPLATE_VERSION_UNPUB_Q,
          templateId: TEMPLATE_A,
          version: 2,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      ],
    });
    await prisma.exerciseTemplateVersionQuestion.createMany({
      data: [
        {
          templateVersionId: TEMPLATE_VERSION_A,
          questionVersionId: QV_A,
          position: 0,
          questionId: QUESTION_A,
        },
        {
          templateVersionId: TEMPLATE_VERSION_A,
          questionVersionId: QV_OE,
          position: 1,
          questionId: QUESTION_OE,
        },
        {
          templateVersionId: TEMPLATE_VERSION_B,
          questionVersionId: QV_B,
          position: 0,
          questionId: QUESTION_B,
        },
        {
          templateVersionId: TEMPLATE_VERSION_UNPUB_Q,
          questionVersionId: QV_UNPUB,
          position: 0,
          questionId: QUESTION_UNPUB,
        },
      ],
    });
    await prisma.exerciseTemplateVersionContent.createMany({
      data: [
        { templateVersionId: TEMPLATE_VERSION_A, contentVersionId: cvA.id, position: 0 },
        { templateVersionId: TEMPLATE_VERSION_B, contentVersionId: cvB.id, position: 0 },
        { templateVersionId: TEMPLATE_VERSION_UNPUB_Q, contentVersionId: cvA.id, position: 0 },
      ],
    });

    app = await buildApp(loadEnv());
    await app.ready();

    // Başlangıç session'ı oluştur — diğer testlerde kullanılacak
    const res = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-student-a@example.com"),
      payload: {
        studentId: STUDENT_A,
        templateVersionId: TEMPLATE_VERSION_A,
        clientSessionId: "sess-99999981-init",
      },
    });
    expect(res.statusCode).toBe(200);
    SESSION_A_ID = res.json().data.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("geçerli published template → session oluştur", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-student-a@example.com"),
      payload: {
        studentId: STUDENT_A,
        templateVersionId: TEMPLATE_VERSION_A,
        clientSessionId: "sess-99999981-ok1",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.templateVersionId).toBe(TEMPLATE_VERSION_A);
    expect(res.json().data.studentId).toBe(STUDENT_A);
    expect(res.json().data.status).toBe("IN_PROGRESS");
  });

  it("unpublished template → reddedilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-student-a@example.com"),
      payload: { studentId: STUDENT_A, templateVersionId: TEMPLATE_VERSION_UNPUB },
    });
    expect(res.statusCode).toBe(400);
  });

  it("unpublished question → reddedilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-student-a@example.com"),
      payload: { studentId: STUDENT_A, templateVersionId: TEMPLATE_VERSION_UNPUB_Q },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/yayınlanmamış/);
  });

  it("cross-tenant template → reddedilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-student-a@example.com"),
      payload: { studentId: STUDENT_A, templateVersionId: TEMPLATE_VERSION_B },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cross-student session erişimi → reddedilir", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/exercise-sessions/${SESSION_A_ID}`,
      headers: await auth("session-student-b@example.com"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("session question listesi doğru", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/exercise-sessions/${SESSION_A_ID}/questions`,
      headers: await auth("session-student-a@example.com"),
    });
    expect(res.statusCode).toBe(200);
    const qs = res.json().data.questions;
    expect(qs.length).toBe(2);
    expect(qs.map((q: any) => q.questionVersionId).sort()).toEqual([QV_A, QV_OE].sort());
  });

  it("session dışındaki questionVersion'a Attempt → reddedilir", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QV_B}/attempts`,
      headers: await auth("session-student-a@example.com"),
      payload: { sessionId: SESSION_A_ID, answer: ["a"], clientAttemptId: "att-99999981-outside" },
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it("session + Attempt entegrasyonu", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/questions/${QV_A}/attempts`,
      headers: await auth("session-student-a@example.com"),
      payload: { sessionId: SESSION_A_ID, answer: ["a"], clientAttemptId: "att-99999981-sess-int" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.rawScore).toBe(1);
    const db = await prisma.attempt.findFirst({
      where: { clientAttemptId: "att-99999981-sess-int" },
    });
    expect(db).not.toBeNull();
    expect(db!.sessionId).toBe(SESSION_A_ID);
    expect(db!.rawScore).toBe(1);
  });

  it("session tamamlanması", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-student-a@example.com"),
      payload: {
        studentId: STUDENT_A,
        templateVersionId: TEMPLATE_VERSION_A,
        clientSessionId: "sess-99999981-complete",
      },
    });
    const sid = createRes.json().data.id;
    // bir soruya cevap ver
    await app.inject({
      method: "POST",
      url: `/admin/questions/${QV_A}/attempts`,
      headers: await auth("session-student-a@example.com"),
      payload: { sessionId: sid, answer: ["a"], clientAttemptId: "att-99999981-comp1" },
    });
    // OPEN_ENDED cevap
    await app.inject({
      method: "POST",
      url: `/admin/questions/${QV_OE}/attempts`,
      headers: await auth("session-student-a@example.com"),
      payload: { sessionId: sid, answer: "serbest", clientAttemptId: "att-99999981-comp2" },
    });
    const comp = await app.inject({
      method: "POST",
      url: `/admin/exercise-sessions/${sid}/complete`,
      headers: await auth("session-student-a@example.com"),
    });
    expect(comp.statusCode).toBe(200);
    expect(comp.json().data.status).toBe("COMPLETED");
    expect(comp.json().data.scoreSummary).toBeDefined();
    expect(comp.json().data.scoreSummary.totalQuestions).toBe(2);
    expect(comp.json().data.scoreSummary.attempted).toBe(2);
    expect(comp.json().data.scoreSummary.scoredCount).toBe(1); // OPEN_ENDED hariç
  });

  it("SUPER_ADMIN erişimi", async () => {
    // SUPER_ADMIN başka tenant session'ı görebilir
    const res = await app.inject({
      method: "GET",
      url: `/admin/exercise-sessions/${SESSION_A_ID}`,
      headers: await auth("session-super@example.com"),
    });
    expect(res.statusCode).toBe(200);
    // SUPER_ADMIN başka öğrenci adına session oluşturabilir
    const create = await app.inject({
      method: "POST",
      url: "/admin/exercise-sessions",
      headers: await auth("session-super@example.com"),
      payload: {
        studentId: STUDENT_B,
        templateVersionId: TEMPLATE_VERSION_B,
        clientSessionId: "sess-99999981-super",
      },
    });
    expect(create.statusCode).toBe(200);
  });
});
