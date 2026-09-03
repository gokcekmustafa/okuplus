import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import {
  ENTITLEMENT_FEATURES,
  entitlementUsageDate,
  canAccess,
  getEntitlements,
  recordUsage,
  requireFeatureAccess,
  type EntitlementActor,
} from "../src/modules/entitlements/index.js";

const PASSWORD = "entitlement-test-pass-123!";
const USER_ID = "8h1-entitlement-user";
const PERSONAL_TENANT_ID = "8h1-entitlement-personal";
const ORG_TENANT_ID = "8h1-entitlement-org";
const SKILL_ID = "8h1-entitlement-skill";
const CONTENT_ID = "8h1-entitlement-content";
const CONTENT_VERSION_ID = "8h1-entitlement-content-version";
const QUESTION_ID = "8h1-entitlement-question";
const QUESTION_VERSION_ID = "8h1-entitlement-question-version";
const TEMPLATE_ID = "8h1-entitlement-template";
const TEMPLATE_VERSION_ID = "8h1-entitlement-template-version";

let app: FastifyInstance;
let accessToken = "";

const personalActor: EntitlementActor = {
  userId: USER_ID,
  tenantId: PERSONAL_TENANT_ID,
  platformRole: null,
};
const orgActor: EntitlementActor = {
  userId: USER_ID,
  tenantId: ORG_TENANT_ID,
  platformRole: null,
};

async function cleanup(): Promise<void> {
  await prisma.studentBadge.deleteMany({ where: { studentId: USER_ID } });
  await prisma.pointEvent.deleteMany({ where: { studentId: USER_ID } });
  await prisma.studentStreak.deleteMany({ where: { studentId: USER_ID } });
  await prisma.studentProgress.deleteMany({ where: { studentId: USER_ID } });
  await prisma.entitlementUsage.deleteMany({ where: { userId: USER_ID } });
  await prisma.entitlement.deleteMany({
    where: { tenantId: { in: [PERSONAL_TENANT_ID, ORG_TENANT_ID] } },
  });
  await prisma.attempt.deleteMany({ where: { tenantId: PERSONAL_TENANT_ID } });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { studentId: USER_ID } },
  });
  await prisma.exerciseSession.deleteMany({ where: { studentId: USER_ID } });
  await prisma.studentProfile.deleteMany({ where: { studentId: USER_ID } });
  await prisma.membership.deleteMany({ where: { userId: USER_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.tenant.deleteMany({
    where: { id: { in: [PERSONAL_TENANT_ID, ORG_TENANT_ID] } },
  });

  await prisma.exerciseTemplateVersionQuestion.deleteMany({
    where: { templateVersionId: TEMPLATE_VERSION_ID },
  });
  await prisma.exerciseTemplateVersionContent.deleteMany({
    where: { templateVersionId: TEMPLATE_VERSION_ID },
  });
  await prisma.content.updateMany({
    where: { id: CONTENT_ID },
    data: { currentVersionId: null },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.questionVersion.deleteMany({ where: { id: QUESTION_VERSION_ID } });
    await tx.exerciseTemplateVersion.deleteMany({ where: { id: TEMPLATE_VERSION_ID } });
    await tx.contentVersion.deleteMany({ where: { id: CONTENT_VERSION_ID } });
  });
  await prisma.question.deleteMany({ where: { id: QUESTION_ID } });
  await prisma.exerciseTemplate.deleteMany({ where: { id: TEMPLATE_ID } });
  await prisma.content.deleteMany({ where: { id: CONTENT_ID } });
  await prisma.skill.deleteMany({ where: { id: SKILL_ID } });
}

async function seed(): Promise<void> {
  await prisma.tenant.create({
    data: { id: PERSONAL_TENANT_ID, type: "INDIVIDUAL", name: "8H-1 Personal" },
  });
  await prisma.tenant.create({
    data: { id: ORG_TENANT_ID, type: "ORGANIZATION", name: "8H-1 Organization" },
  });
  const passwordHash = await new ScryptPasswordHasher().hash(PASSWORD);
  await prisma.user.create({
    data: { id: USER_ID, email: "8h1-entitlement@example.com", passwordHash, displayName: "8H-1" },
  });
  await prisma.membership.createMany({
    data: [
      { tenantId: PERSONAL_TENANT_ID, userId: USER_ID, role: "STUDENT", status: "ACTIVE" },
      { tenantId: ORG_TENANT_ID, userId: USER_ID, role: "STUDENT", status: "ACTIVE" },
    ],
  });
  await prisma.studentProfile.create({
    data: { tenantId: PERSONAL_TENANT_ID, studentId: USER_ID },
  });

  await prisma.skill.create({
    data: { id: SKILL_ID, code: "8H1_TEST_SKILL", name: "8H-1 test", category: "COMPREHENSION" },
  });
  await prisma.content.create({
    data: {
      id: CONTENT_ID,
      type: "PASSAGE",
      title: "8H-1 entitlement içerik",
      difficulty: 0.4,
      status: "PUBLISHED",
    },
  });
  await prisma.contentVersion.create({
    data: {
      id: CONTENT_VERSION_ID,
      contentId: CONTENT_ID,
      version: 1,
      title: "8H-1 entitlement içerik v1",
      body: "Kişisel plan erişimi için TEST metni.",
      wordCount: 6,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.content.update({
    where: { id: CONTENT_ID },
    data: { currentVersionId: CONTENT_VERSION_ID },
  });
  await prisma.question.create({
    data: {
      id: QUESTION_ID,
      contentId: CONTENT_ID,
      position: 0,
      type: "TRUE_FALSE",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.questionVersion.create({
    data: {
      id: QUESTION_VERSION_ID,
      questionId: QUESTION_ID,
      version: 1,
      prompt: "Bu TEST entitlement içeriğidir.",
      correctAnswer: { type: "TRUE_FALSE", answer: true },
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplate.create({
    data: {
      id: TEMPLATE_ID,
      title: "8H-1 entitlement alıştırması",
      type: "COMPREHENSION",
      skillId: SKILL_ID,
      status: "PUBLISHED",
    },
  });
  await prisma.exerciseTemplateVersion.create({
    data: {
      id: TEMPLATE_VERSION_ID,
      templateId: TEMPLATE_ID,
      version: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.exerciseTemplateVersionContent.create({
    data: {
      templateVersionId: TEMPLATE_VERSION_ID,
      contentVersionId: CONTENT_VERSION_ID,
      position: 0,
    },
  });
  await prisma.exerciseTemplateVersionQuestion.create({
    data: {
      templateVersionId: TEMPLATE_VERSION_ID,
      questionVersionId: QUESTION_VERSION_ID,
      questionId: QUESTION_ID,
      position: 0,
    },
  });
}

function authHeaders(tenantId = PERSONAL_TENANT_ID) {
  return { authorization: `Bearer ${accessToken}`, "x-tenant-id": tenantId };
}

describe.sequential("8H-1 entitlement architecture", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await seed();
    app = await buildApp(loadEnv());
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "8h1-entitlement@example.com", password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    accessToken = login.json().data.tokens.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("defaults to FREE and exposes the mobile-ready contract", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/account/entitlements",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.scope).toBe("PERSONAL");
    expect(body.tenant.type).toBe("INDIVIDUAL");
    expect(body.plan).toMatchObject({ code: "PLAN_FREE", active: true, source: "DEFAULT" });
    expect(body.features.PRACTICE).toMatchObject({
      dailyLimit: 3,
      usedToday: 0,
      remainingToday: 3,
    });
    expect(body.features.PRACTICE_QUESTION).toMatchObject({
      dailyLimit: 20,
      usedToday: 0,
      remainingToday: 20,
    });
    expect(body.premium.paymentAvailable).toBe(false);
    expect(body.premium.activeCapabilities).toEqual(["Sınırsız alıştırma", "Sınırsız soru"]);
    expect(body.premium.plannedCapabilities).toEqual([
      "ADS_FREE",
      "ADVANCED_PROGRESS",
      "ADVANCED_REVIEW",
      "PREMIUM_CONTENT",
    ]);
    expect(body).not.toHaveProperty("trial");
    expect(body.timezone).toBe("UTC");
  });

  it("expired premium grant Free plana döner ve geçersiz/etkin olmayan özellikleri açmaz", async () => {
    await prisma.entitlement.create({
      data: {
        userId: USER_ID,
        tenantId: PERSONAL_TENANT_ID,
        scope: "PERSONAL",
        plan: "PLAN_PREMIUM",
        source: "8H2_EXPIRED_TEST_GRANT",
        effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    const expired = await getEntitlements(personalActor);
    expect(expired.plan.code).toBe("PLAN_FREE");
    await prisma.entitlement.deleteMany({
      where: { tenantId: PERSONAL_TENANT_ID, source: "8H2_EXPIRED_TEST_GRANT" },
    });

    await expect(canAccess(personalActor, "NOT_A_FEATURE" as never)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      requireFeatureAccess(personalActor, ENTITLEMENT_FEATURES.ADS_ENABLED),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces the server-side practice limit and ignores client plan tampering", async () => {
    const keys = ["start-1", "start-2", "start-3", "start-4"];
    const responses = [];
    for (const clientSessionId of keys) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/student/exercises/start",
          headers: authHeaders(),
          payload: {
            templateVersionId: TEMPLATE_VERSION_ID,
            clientSessionId,
            plan: "PLAN_PREMIUM",
            premium: true,
            remainingLimit: 999,
          },
        }),
      );
    }
    expect(responses.slice(0, 3).map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(responses[3].statusCode).toBe(403);
    expect(responses[3].json().error.message).toContain("Günlük ücretsiz alıştırma hakkın doldu");

    const replay = await app.inject({
      method: "POST",
      url: "/student/exercises/start",
      headers: authHeaders(),
      payload: {
        templateVersionId: TEMPLATE_VERSION_ID,
        clientSessionId: "start-1",
        premium: true,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.isNew).toBe(false);
    expect(
      await prisma.entitlementUsage.count({
        where: {
          userId: USER_ID,
          tenantId: PERSONAL_TENANT_ID,
          feature: ENTITLEMENT_FEATURES.PRACTICE,
        },
      }),
    ).toBe(3);
  });

  it("handles timezone date boundaries and idempotent usage", async () => {
    expect(entitlementUsageDate(new Date("2026-09-02T21:30:00.000Z"), "UTC")).toBe("2026-09-02");
    expect(entitlementUsageDate(new Date("2026-09-02T21:30:00.000Z"), "Europe/Istanbul")).toBe(
      "2026-09-03",
    );

    const now = new Date("2026-09-10T12:00:00.000Z");
    const first = await recordUsage(personalActor, ENTITLEMENT_FEATURES.PRACTICE, "same-key", now);
    const replay = await recordUsage(personalActor, ENTITLEMENT_FEATURES.PRACTICE, "same-key", now);
    expect(first.consumed).toBe(true);
    expect(replay.idempotent).toBe(true);
    expect(replay.usedToday).toBe(1);

    const nextDay = await recordUsage(
      personalActor,
      ENTITLEMENT_FEATURES.PRACTICE,
      "next-day-key",
      new Date("2026-09-11T00:01:00.000Z"),
    );
    expect(nextDay.allowed).toBe(true);
    expect(nextDay.usedToday).toBe(1);
  });

  it("serializes concurrent free question usage at the daily limit", async () => {
    const now = new Date("2026-09-12T12:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        recordUsage(
          personalActor,
          ENTITLEMENT_FEATURES.PRACTICE_QUESTION,
          `concurrent-${index}`,
          now,
        ),
      ),
    );
    expect(results.filter((result) => result.allowed).length).toBe(20);
    expect(results.filter((result) => !result.allowed).length).toBe(10);
    expect(
      await prisma.entitlementUsage.count({
        where: {
          userId: USER_ID,
          tenantId: PERSONAL_TENANT_ID,
          feature: ENTITLEMENT_FEATURES.PRACTICE_QUESTION,
          usageDate: "2026-09-12",
        },
      }),
    ).toBe(20);
  });

  it("keeps personal and organization plan scopes separate", async () => {
    await prisma.entitlement.create({
      data: {
        userId: USER_ID,
        tenantId: PERSONAL_TENANT_ID,
        scope: "PERSONAL",
        plan: "PLAN_PREMIUM",
        source: "TEST_MANUAL_GRANT",
        effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const personal = await getEntitlements(personalActor);
    const organizationBefore = await getEntitlements(orgActor);
    expect(personal.plan.code).toBe("PLAN_PREMIUM");
    expect(personal.features.PRACTICE.dailyLimit).toBeNull();
    const premiumUsage = await recordUsage(
      personalActor,
      ENTITLEMENT_FEATURES.PRACTICE,
      "premium-unlimited",
      new Date("2026-09-13T12:00:00.000Z"),
    );
    expect(premiumUsage.allowed).toBe(true);
    expect(premiumUsage.dailyLimit).toBeNull();
    expect(organizationBefore.scope).toBe("ORGANIZATION");
    expect(organizationBefore.plan.code).toBe("PLAN_FREE");

    await prisma.entitlement.create({
      data: {
        userId: null,
        tenantId: ORG_TENANT_ID,
        scope: "ORGANIZATION",
        plan: "PLAN_PREMIUM",
        source: "TEST_ORG_GRANT",
        effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const organization = await getEntitlements(orgActor);
    expect(organization.plan).toMatchObject({ code: "PLAN_FREE", source: "DEFAULT" });
    expect(organization.features.PRACTICE.dailyLimit).toBe(3);
  });
});
