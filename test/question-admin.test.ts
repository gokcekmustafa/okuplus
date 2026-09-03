import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const hasher = new ScryptPasswordHasher();
const PASSWORD = "question-test-pass-123!";
const SUPER_ADMIN_ID = "99999996-0000-7000-8000-000000000001";
const CONTENT_EDITOR_ID = "99999996-0000-7000-8000-000000000002";
const NORMAL_USER_ID = "99999996-0000-7000-8000-000000000003";
const TENANT_A = "99999996-0000-7000-8000-0000000000a1";
const TENANT_B = "99999996-0000-7000-8000-0000000000b1";
const CONTENT_A = "99999996-0000-7000-8000-0000000000c1";
const CONTENT_B = "99999996-0000-7000-8000-0000000000c2";
const USERS = [SUPER_ADMIN_ID, CONTENT_EDITOR_ID, NORMAL_USER_ID];
const CONTENTS = [CONTENT_A, CONTENT_B];

function payload(type: string, position: number): Record<string, unknown> {
  const base = { position, type, prompt: `${type} soru metni` };
  switch (type) {
    case "MULTIPLE_CHOICE":
      return {
        ...base,
        options: [
          { id: "a", text: "A", position: 0 },
          { id: "b", text: "B", position: 1 },
        ],
        correctAnswer: {
          type,
          correctOptionIds: ["a"],
          allowMultiple: false,
          partialCredit: false,
        },
      };
    case "TRUE_FALSE":
      return { ...base, options: [], correctAnswer: { type, answer: true } };
    case "OPEN_ENDED":
      return {
        ...base,
        options: [],
        correctAnswer: {
          type,
          expectedAnswer: "yanıt",
          rubric: [{ criteria: "doğruluk", points: 1 }],
        },
      };
    case "MATCHING":
      return {
        ...base,
        options: [
          { id: "left", text: "Sol", position: 0 },
          { id: "right", text: "Sağ", position: 1 },
        ],
        correctAnswer: { type, pairs: [{ leftId: "left", rightId: "right" }], partialCredit: true },
      };
    case "FILL_BLANK":
      return {
        ...base,
        options: [],
        correctAnswer: {
          type,
          blanks: [{ blankId: "blank-1", acceptedAnswers: ["cevap"] }],
          partialCredit: false,
        },
      };
    default:
      throw new Error(`Bilinmeyen soru tipi: ${type}`);
  }
}

async function cleanup(): Promise<void> {
  await prisma.studentBadge.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.pointEvent.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await prisma.studentStreak.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  const questions = await prisma.question.findMany({
    where: { OR: [{ contentId: { in: CONTENTS } }, { createdById: { in: USERS } }] },
    select: { id: true },
  });
  const questionIds = questions.map(({ id }) => id);
  await prisma.$transaction(async (tx) => {
    // Yalnızca bu testin QuestionVersion kayıtları published immutable trigger'ına takılabilir.
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    if (questionIds.length) {
      await tx.questionVersionMedia.deleteMany({
        where: { questionVersion: { questionId: { in: questionIds } } },
      });
      await tx.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
      await tx.question.deleteMany({ where: { id: { in: questionIds } } });
    }
    await tx.content.deleteMany({ where: { id: { in: CONTENTS } } });
    await tx.membership.deleteMany({
      where: { OR: [{ userId: { in: USERS } }, { tenantId: { in: [TENANT_A, TENANT_B] } }] },
    });
    await tx.user.deleteMany({ where: { id: { in: USERS } } });
    await tx.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
  });
}

describe("question admin", () => {
  let app: FastifyInstance;

  const login = async (email: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data.tokens.accessToken as string;
  };
  const headers = async (email: string) => ({ authorization: `Bearer ${await login(email)}` });
  const adminHeaders = () => headers("questions-super@example.com");
  const editorHeaders = () => headers("questions-editor@example.com");
  const userHeaders = () => headers("questions-user@example.com");

  const createQuestion = async (type: string, position: number, contentId = CONTENT_A) => {
    const response = await app.inject({
      method: "POST",
      url: `/admin/contents/${contentId}/questions`,
      headers: await adminHeaders(),
      payload: { ...payload(type, position), contentId: CONTENT_B },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data;
  };

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const passwordHash = await hasher.hash(PASSWORD);
    await prisma.user.createMany({
      data: [
        {
          id: SUPER_ADMIN_ID,
          email: "questions-super@example.com",
          displayName: "Soru Süper",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
        {
          id: CONTENT_EDITOR_ID,
          email: "questions-editor@example.com",
          displayName: "Soru Editör",
          passwordHash,
          platformRole: "CONTENT_EDITOR",
        },
        {
          id: NORMAL_USER_ID,
          email: "questions-user@example.com",
          displayName: "Soru Kullanıcı",
          passwordHash,
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "ORGANIZATION", name: "Soru Test A" },
        { id: TENANT_B, type: "ORGANIZATION", name: "Soru Test B" },
      ],
    });
    await prisma.membership.create({
      data: { tenantId: TENANT_A, userId: NORMAL_USER_ID, role: "STUDENT", status: "ACTIVE" },
    });
    await prisma.content.createMany({
      data: [
        {
          id: CONTENT_A,
          tenantId: TENANT_A,
          type: "PASSAGE",
          title: "Soru İçeriği A",
          difficulty: 0.5,
        },
        {
          id: CONTENT_B,
          tenantId: TENANT_B,
          type: "PASSAGE",
          title: "Soru İçeriği B",
          difficulty: 0.5,
        },
      ],
    });
    app = await buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("kimliksiz istek 401, normal kullanıcı 403 döner", async () => {
    expect(
      (await app.inject({ method: "GET", url: `/admin/contents/${CONTENT_A}/questions` }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/admin/contents/${CONTENT_A}/questions`,
          headers: await userHeaders(),
        })
      ).statusCode,
    ).toBe(403);
  });

  it("CONTENT_EDITOR içerik altında soru oluşturabilir; URL contentId istemci gövdesini ezer", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/admin/contents/${CONTENT_A}/questions`,
      headers: await editorHeaders(),
      payload: { ...payload("MULTIPLE_CHOICE", 0), contentId: CONTENT_B },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.contentId).toBe(CONTENT_A);
  });

  it("beş soru tipi oluşturur ve Question CRUD uçları çalışır", async () => {
    const types = ["TRUE_FALSE", "OPEN_ENDED", "MATCHING", "FILL_BLANK"];
    for (let index = 0; index < types.length; index++)
      await createQuestion(types[index], index + 1);
    const listed = await app.inject({
      method: "GET",
      url: `/admin/contents/${CONTENT_A}/questions`,
      headers: await adminHeaders(),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toHaveLength(5);
    const question = listed.json().data[0];
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/admin/questions/${question.id}`,
          headers: await adminHeaders(),
        })
      ).statusCode,
    ).toBe(200);
    const updated = await app.inject({
      method: "PATCH",
      url: `/admin/questions/${question.id}`,
      headers: await adminHeaders(),
      payload: { skillId: null },
    });
    expect(updated.statusCode).toBe(200);
  });

  it("correctAnswer/options çapraz validasyonlarını reddeder", async () => {
    const unknownOption = payload("MULTIPLE_CHOICE", 20);
    (unknownOption.correctAnswer as { correctOptionIds: string[] }).correctOptionIds = ["missing"];
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/admin/contents/${CONTENT_A}/questions`,
          headers: await adminHeaders(),
          payload: unknownOption,
        })
      ).statusCode,
    ).toBe(400);
    const duplicateOptions = payload("MULTIPLE_CHOICE", 21);
    duplicateOptions.options = [
      { id: "a", text: "A", position: 0 },
      { id: "a", text: "B", position: 0 },
    ];
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/admin/contents/${CONTENT_A}/questions`,
          headers: await adminHeaders(),
          payload: duplicateOptions,
        })
      ).statusCode,
    ).toBe(400);
  });

  it("DRAFT düzenlenir, REVIEW/PUBLISHED immutable kalır ve v2 oluşturulur", async () => {
    const question = (
      await app.inject({
        method: "GET",
        url: `/admin/contents/${CONTENT_A}/questions`,
        headers: await adminHeaders(),
      })
    ).json().data[0];
    const versions = await app.inject({
      method: "GET",
      url: `/admin/questions/${question.id}/versions`,
      headers: await adminHeaders(),
    });
    expect(versions.statusCode).toBe(200);
    const v1 = versions.json().data[0];
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/admin/questions/versions/${v1.id}`,
          headers: await adminHeaders(),
          payload: { prompt: "Düzenlenmiş taslak" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/admin/questions/versions/${v1.id}/review`,
          headers: await adminHeaders(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/admin/questions/versions/${v1.id}`,
          headers: await adminHeaders(),
          payload: { prompt: "Geçersiz" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/admin/questions/versions/${v1.id}/publish`,
          headers: await adminHeaders(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/admin/questions/versions/${v1.id}`,
          headers: await adminHeaders(),
          payload: { prompt: "Geçersiz" },
        })
      ).statusCode,
    ).toBe(400);
    const v2 = await app.inject({
      method: "POST",
      url: `/admin/questions/${question.id}/versions`,
      headers: await adminHeaders(),
      payload: { prompt: "İkinci sürüm" },
    });
    expect(v2.statusCode).toBe(200);
    expect(v2.json().data.version).toBe(2);
  });

  it("sıralama transaction ile güncellenir, çakışma ve cross-tenant ilişki engellenir", async () => {
    const rows = (
      await app.inject({
        method: "GET",
        url: `/admin/contents/${CONTENT_A}/questions`,
        headers: await adminHeaders(),
      })
    ).json().data;
    const reordered = rows.map((question: { id: string }, index: number) => ({
      questionId: question.id,
      position: index + 30,
    }));
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/admin/contents/${CONTENT_A}/questions`,
          headers: await adminHeaders(),
          payload: { questions: reordered },
        })
      ).statusCode,
    ).toBe(200);
    const duplicate = [reordered[0], { ...reordered[1], position: reordered[0].position }];
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/admin/contents/${CONTENT_A}/questions`,
          headers: await adminHeaders(),
          payload: { questions: duplicate },
        })
      ).statusCode,
    ).toBe(400);
    const foreign = await createQuestion("MULTIPLE_CHOICE", 0, CONTENT_B);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/admin/contents/${CONTENT_A}/questions`,
          headers: await adminHeaders(),
          payload: { questions: [{ questionId: foreign.id, position: 99 }] },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("soru durumunu ve soft-delete'i uygular", async () => {
    const question = (
      await app.inject({
        method: "GET",
        url: `/admin/contents/${CONTENT_A}/questions`,
        headers: await adminHeaders(),
      })
    ).json().data[1];
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/admin/questions/${question.id}/status`,
          headers: await adminHeaders(),
          payload: { status: "ARCHIVED" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/admin/questions/${question.id}/status`,
          headers: await adminHeaders(),
          payload: { status: "DRAFT" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/admin/questions/${question.id}`,
          headers: await adminHeaders(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/admin/questions/${question.id}`,
          headers: await adminHeaders(),
        })
      ).statusCode,
    ).toBe(404);
  });
});
