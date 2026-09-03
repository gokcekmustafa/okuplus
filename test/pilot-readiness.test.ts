import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { getPilotMetrics, isPilotAccessAllowed } from "../src/modules/pilot/index.js";

const RUN_TAG = Date.now().toString(36);
const TENANT_A = `8g10-${RUN_TAG}-tenant-a`;
const TENANT_B = `8g10-${RUN_TAG}-tenant-b`;
const STUDENT_A = `8g10-${RUN_TAG}-student-a`;
const STUDENT_B = `8g10-${RUN_TAG}-student-b`;
const ADMIN = `8g10-${RUN_TAG}-admin`;
const EMAIL_A = `pilot-a-${RUN_TAG}@example.com`;
const EMAIL_B = `pilot-b-${RUN_TAG}@example.com`;
const EMAIL_ADMIN = `pilot-admin-${RUN_TAG}@example.com`;
const PASSWORD = "pilot-readiness-pass-123!";
const USER_IDS = [STUDENT_A, STUDENT_B, ADMIN];
const TENANT_IDS = [TENANT_A, TENANT_B];

let app: FastifyInstance;
let tokenA = "";
let tokenB = "";
let adminToken = "";

async function cleanup(): Promise<void> {
  // The fixed IDs make retries deterministic. Remove any dependent test data
  // left by an interrupted run before recreating the pilot cohort.
  await prisma.pilotBugReport.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
  await prisma.pilotFeedback.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
  await prisma.pilotEvent.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
  await prisma.studentBadge.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.pointEvent.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.studentStreak.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.studentProgress.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.assessmentResult.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.attempt.deleteMany({ where: { session: { studentId: { in: USER_IDS } } } });
  await prisma.sessionContentVersion.deleteMany({
    where: { session: { studentId: { in: USER_IDS } } },
  });
  await prisma.exerciseSession.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.studentProfile.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: USER_IDS } } });
  await prisma.guardianship.deleteMany({
    where: { OR: [{ studentId: { in: USER_IDS } }, { guardianId: { in: USER_IDS } }] },
  });
  await prisma.teacherClassAssignment.deleteMany({ where: { teacherId: { in: USER_IDS } } });
  await prisma.teacherBranchMembership.deleteMany({ where: { teacherId: { in: USER_IDS } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.authIdentity.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.consent.deleteMany({ where: { userId: { in: USER_IDS } } });
  await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
}

async function login(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.tokens.accessToken as string;
}

function headers(token: string, tenantId: string) {
  return { authorization: `Bearer ${token}`, "x-tenant-id": tenantId };
}

describe.sequential("8G-10 pilot readiness", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const passwordHash = await new ScryptPasswordHasher().hash(PASSWORD);
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, type: "INDIVIDUAL", name: "Pilot A" },
        { id: TENANT_B, type: "INDIVIDUAL", name: "Pilot B" },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: STUDENT_A, email: EMAIL_A, displayName: "Pilot A", passwordHash },
        { id: STUDENT_B, email: EMAIL_B, displayName: "Pilot B", passwordHash },
        {
          id: ADMIN,
          email: EMAIL_ADMIN,
          displayName: "Pilot Admin",
          passwordHash,
          platformRole: "SUPER_ADMIN",
        },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: TENANT_A, userId: STUDENT_A, role: "STUDENT", status: "ACTIVE" },
        { tenantId: TENANT_B, userId: STUDENT_B, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PILOT_MODE: "on",
        PILOT_STUDENT_ACCESS: `${EMAIL_A},${EMAIL_B}`,
      }),
    );
    await app.ready();
    tokenA = await login(EMAIL_A);
    tokenB = await login(EMAIL_B);
    adminToken = await login(EMAIL_ADMIN);
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it("pilot access flag and allowlist enforce edilir", () => {
    expect(
      isPilotAccessAllowed(
        { NODE_ENV: "test", PILOT_MODE: "on", PILOT_STUDENT_ACCESS: EMAIL_A },
        { id: STUDENT_A, email: EMAIL_A },
      ),
    ).toBe(true);
    expect(
      isPilotAccessAllowed(
        { NODE_ENV: "test", PILOT_MODE: "on", PILOT_STUDENT_ACCESS: EMAIL_A },
        { id: STUDENT_B, email: EMAIL_B },
      ),
    ).toBe(false);
    expect(
      isPilotAccessAllowed(
        { NODE_ENV: "production", PILOT_MODE: "on", PILOT_STUDENT_ACCESS: "" },
        { id: STUDENT_A, email: EMAIL_A },
      ),
    ).toBe(false);
  });

  it("event creation, duplicate prevention ve invalid payload rejection çalışır", async () => {
    const event = await app.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenA, TENANT_A),
      payload: { eventType: "LEARNING_PATH_OPENED", clientEventId: "event-1" },
    });
    expect(event.statusCode).toBe(200);
    expect(event.json().data.created).toBe(true);

    const replay = await app.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenA, TENANT_A),
      payload: { eventType: "LEARNING_PATH_OPENED", clientEventId: "event-1" },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.created).toBe(false);
    expect(
      await prisma.pilotEvent.count({ where: { tenantId: TENANT_A, studentId: STUDENT_A } }),
    ).toBe(1);

    for (const [eventType, clientEventId] of [
      ["PREMIUM_INFO_VIEWED", "premium-info-1"],
      ["PREMIUM_CTA_CLICKED", "premium-cta-1"],
      ["LIMIT_REACHED", "limit-reached-1"],
      ["PAYWALL_VIEWED", "paywall-viewed-1"],
    ] as const) {
      const premiumEvent = await app.inject({
        method: "POST",
        url: "/student/pilot/events",
        headers: headers(tokenA, TENANT_A),
        payload: { eventType, clientEventId },
      });
      expect(premiumEvent.statusCode).toBe(200);
      expect(premiumEvent.json().data.created).toBe(true);
      const premiumReplay = await app.inject({
        method: "POST",
        url: "/student/pilot/events",
        headers: headers(tokenA, TENANT_A),
        payload: { eventType, clientEventId },
      });
      expect(premiumReplay.statusCode).toBe(200);
      expect(premiumReplay.json().data.created).toBe(false);
    }

    const invalid = await app.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenA, TENANT_A),
      payload: { eventType: "NOT_A_PILOT_EVENT", clientEventId: "event-invalid" },
    });
    expect(invalid.statusCode).toBe(400);

    const rawAnswer = await app.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenA, TENANT_A),
      payload: { eventType: "QUESTION_ANSWERED", clientEventId: "event-raw", answer: "raw" },
    });
    expect(rawAnswer.statusCode).toBe(400);
  });

  it("feedback ve bug report bounded/idempotent olarak oluşturulur", async () => {
    const feedback = await app.inject({
      method: "POST",
      url: "/student/pilot/feedback",
      headers: headers(tokenA, TENANT_A),
      payload: {
        clientFeedbackId: "feedback-1",
        category: "QUESTION_CLARITY",
        rating: 4,
        message: "Soru anlaşılırdı.",
      },
    });
    expect(feedback.statusCode).toBe(200);
    expect(feedback.json().data.created).toBe(true);
    const feedbackReplay = await app.inject({
      method: "POST",
      url: "/student/pilot/feedback",
      headers: headers(tokenA, TENANT_A),
      payload: {
        clientFeedbackId: "feedback-1",
        category: "QUESTION_CLARITY",
        rating: 4,
        message: "Soru anlaşılırdı.",
      },
    });
    expect(feedbackReplay.json().data.created).toBe(false);

    const bug = await app.inject({
      method: "POST",
      url: "/student/pilot/bug-reports",
      headers: headers(tokenA, TENANT_A),
      payload: {
        clientBugId: "bug-1",
        category: "UNCLEAR_QUESTION",
        description: "Bir soru kökü tekrar gözden geçirilmeli.",
      },
    });
    expect(bug.statusCode).toBe(200);
    expect(bug.json().data.bug.status).toBe("OPEN");
    expect(await prisma.pilotFeedback.count({ where: { studentId: STUDENT_A } })).toBe(1);
    expect(await prisma.pilotBugReport.count({ where: { studentId: STUDENT_A } })).toBe(1);
  });

  it("tenant/student isolation ve admin aggregate/report access korunur", async () => {
    const otherEvent = await app.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenB, TENANT_B),
      payload: { eventType: "TODAY_OPENED", clientEventId: "event-b-1" },
    });
    expect(otherEvent.statusCode).toBe(200);

    await prisma.studentProfile.upsert({
      where: { tenantId_studentId: { tenantId: TENANT_A, studentId: STUDENT_A } },
      create: { tenantId: TENANT_A, studentId: STUDENT_A, onboardingCompletedAt: new Date() },
      update: { onboardingCompletedAt: new Date() },
    });
    for (const [eventType, clientEventId] of [
      ["EXERCISE_STARTED", "event-start-1"],
      ["QUESTION_ATTEMPTED", "event-question-1"],
      ["EXERCISE_COMPLETED", "event-complete-1"],
      ["STREAK_STARTED", "event-streak-start-1"],
      ["TECHNICAL_ERROR", "event-error-1"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/student/pilot/events",
        headers: headers(tokenA, TENANT_A),
        payload: { eventType, clientEventId },
      });
      expect(response.statusCode).toBe(200);
    }

    const crossTenant = await app.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenB, TENANT_B),
      payload: { eventType: "TODAY_OPENED", clientEventId: "event-cross", sessionId: "not-owned" },
    });
    expect(crossTenant.statusCode).toBe(404);

    const studentAdminMetrics = await app.inject({
      method: "GET",
      url: "/admin/pilot/metrics",
      headers: headers(tokenA, TENANT_A),
    });
    expect(studentAdminMetrics.statusCode).toBe(403);

    const metrics = await app.inject({
      method: "GET",
      url: "/admin/pilot/metrics",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(metrics.statusCode).toBe(200);
    const metricsData = metrics.json().data;
    expect(metricsData.engagement.activeStudents).toBe(2);
    expect(metricsData.dataStatus).toBe("PILOT_DATA_ONLY");

    const scopedMetrics = await getPilotMetrics({ tenantId: TENANT_A });
    expect(scopedMetrics.activation.onboardingCompletion).toBe(1);
    expect(scopedMetrics.activation.firstExerciseStarted).toBe(1);
    expect(scopedMetrics.activation.firstExerciseCompleted).toBe(1);
    expect(scopedMetrics.engagement.exerciseStarts).toBe(1);
    expect(scopedMetrics.engagement.exerciseCompletions).toBe(1);
    expect(scopedMetrics.engagement.questions).toBe(1);
    expect(scopedMetrics.habit.streakStarts).toBe(1);
    expect(scopedMetrics.operator.pilotUsers).toBe(1);
    expect(scopedMetrics.operator.onboardingCompletions).toBe(1);
    expect(scopedMetrics.operator.technicalErrorCount).toBe(1);
    expect(scopedMetrics.operator.premiumInfoViewed).toBe(1);
    expect(scopedMetrics.operator.premiumCtaClicked).toBe(1);
    expect(scopedMetrics.operator.limitReached).toBe(1);
    expect(scopedMetrics.operator.paywallViewed).toBe(1);
    expect(scopedMetrics.operator.feedbackCount).toBe(1);
    expect(scopedMetrics.operator.bugReportCount).toBe(1);
    expect(scopedMetrics.ux.technicalErrorRate).toBeGreaterThan(0);

    const reports = await app.inject({
      method: "GET",
      url: "/admin/pilot/reports?kind=bug",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(reports.statusCode).toBe(200);
    expect(reports.json().data.items).toHaveLength(1);
    expect(reports.json().data.items[0]).not.toHaveProperty("email");

    const missingKind = await app.inject({
      method: "GET",
      url: "/admin/pilot/reports",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missingKind.statusCode).toBe(400);
  });

  it("pilot modu kapalıyken öğrenci pilot endpoint'i açılmaz", async () => {
    const disabledApp = await buildApp(loadEnv({ NODE_ENV: "test", PILOT_MODE: "off" }));
    await disabledApp.ready();
    const response = await disabledApp.inject({
      method: "POST",
      url: "/student/pilot/events",
      headers: headers(tokenA, TENANT_A),
      payload: { eventType: "TODAY_OPENED", clientEventId: "disabled-event" },
    });
    expect(response.statusCode).toBe(403);
    await disabledApp.close();
  });
});
