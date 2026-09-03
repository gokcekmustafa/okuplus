import { Prisma, type PilotEventType, type PilotFeedbackCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import type { PilotBugReportInput, PilotEventInput, PilotFeedbackInput } from "./schemas.js";

type StudentActor = { userId: string; tenantId: string | null };

function requireTenant(actor: StudentActor): string {
  if (!actor.tenantId) throw forbiddenError("Pilot için tenant context gerekli");
  return actor.tenantId;
}

async function assertStudent(actor: StudentActor): Promise<string> {
  const tenantId = requireTenant(actor);
  const membership = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId: actor.userId,
      role: "STUDENT",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { tenantId: true },
  });
  if (!membership) throw forbiddenError("Aktif öğrenci tenant üyeliği gerekli");
  return tenantId;
}

async function assertContext(
  actor: StudentActor,
  tenantId: string,
  context: { sessionId?: string; questionVersionId?: string },
): Promise<void> {
  if (context.sessionId) {
    const session = await prisma.exerciseSession.findFirst({
      where: { id: context.sessionId, tenantId, studentId: actor.userId },
      select: { id: true, templateVersionId: true },
    });
    if (!session) throw notFoundError("Pilot oturumu bulunamadı");
    if (context.questionVersionId) {
      const relation = await prisma.exerciseTemplateVersionQuestion.findFirst({
        where: {
          templateVersionId: session.templateVersionId,
          questionVersionId: context.questionVersionId,
        },
        select: { questionVersionId: true },
      });
      if (!relation) throw validationError("Soru bu pilot oturumuna ait değil");
    }
  } else if (context.questionVersionId) {
    const question = await prisma.questionVersion.findUnique({
      where: { id: context.questionVersionId },
      select: { id: true },
    });
    if (!question) throw notFoundError("Pilot soru sürümü bulunamadı");
  }
}

export async function recordPilotEvent(actor: StudentActor, input: PilotEventInput) {
  const tenantId = await assertStudent(actor);
  await assertContext(actor, tenantId, input);
  const existing = await prisma.pilotEvent.findUnique({
    where: {
      tenantId_studentId_clientEventId: {
        tenantId,
        studentId: actor.userId,
        clientEventId: input.clientEventId,
      },
    },
  });
  if (existing) {
    if (existing.eventType !== input.eventType) {
      throw conflictError("Pilot event id farklı bir event için zaten kullanılmış");
    }
    return { created: false, event: toEventResponse(existing) };
  }
  try {
    const event = await prisma.pilotEvent.create({
      data: {
        tenantId,
        studentId: actor.userId,
        eventType: input.eventType as PilotEventType,
        clientEventId: input.clientEventId,
        sessionId: input.sessionId ?? null,
        questionVersionId: input.questionVersionId ?? null,
      },
    });
    return { created: true, event: toEventResponse(event) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.pilotEvent.findUnique({
        where: {
          tenantId_studentId_clientEventId: {
            tenantId,
            studentId: actor.userId,
            clientEventId: input.clientEventId,
          },
        },
      });
      if (replay?.eventType === input.eventType)
        return { created: false, event: toEventResponse(replay) };
    }
    throw error;
  }
}

export async function createPilotFeedback(actor: StudentActor, input: PilotFeedbackInput) {
  const tenantId = await assertStudent(actor);
  await assertContext(actor, tenantId, input);
  const existing = await prisma.pilotFeedback.findUnique({
    where: {
      tenantId_studentId_clientFeedbackId: {
        tenantId,
        studentId: actor.userId,
        clientFeedbackId: input.clientFeedbackId,
      },
    },
  });
  if (existing) {
    if (existing.category !== input.category)
      throw conflictError("Feedback id farklı bir kayıt için zaten kullanılmış");
    return { created: false, feedback: toFeedbackResponse(existing) };
  }
  const feedback = await prisma.pilotFeedback.create({
    data: {
      tenantId,
      studentId: actor.userId,
      clientFeedbackId: input.clientFeedbackId,
      category: input.category as PilotFeedbackCategory,
      rating: input.rating ?? null,
      message: input.message?.trim() || null,
      sessionId: input.sessionId ?? null,
      questionVersionId: input.questionVersionId ?? null,
    },
  });
  return { created: true, feedback: toFeedbackResponse(feedback) };
}

export async function createPilotBugReport(actor: StudentActor, input: PilotBugReportInput) {
  const tenantId = await assertStudent(actor);
  await assertContext(actor, tenantId, input);
  const existing = await prisma.pilotBugReport.findUnique({
    where: {
      tenantId_studentId_clientBugId: {
        tenantId,
        studentId: actor.userId,
        clientBugId: input.clientBugId,
      },
    },
  });
  if (existing) {
    if (existing.category !== input.category)
      throw conflictError("Bug id farklı bir kayıt için zaten kullanılmış");
    return { created: false, bug: toBugResponse(existing) };
  }
  const bug = await prisma.pilotBugReport.create({
    data: {
      tenantId,
      studentId: actor.userId,
      clientBugId: input.clientBugId,
      category: input.category,
      description: input.description.trim(),
      sessionId: input.sessionId ?? null,
      questionVersionId: input.questionVersionId ?? null,
    },
  });
  return { created: true, bug: toBugResponse(bug) };
}

function toEventResponse(event: {
  id: string;
  eventType: PilotEventType;
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    id: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
  };
}

function toFeedbackResponse(feedback: {
  id: string;
  category: PilotFeedbackCategory;
  rating: number | null;
  message: string | null;
  createdAt: Date;
}) {
  return {
    id: feedback.id,
    category: feedback.category,
    rating: feedback.rating,
    message: feedback.message,
    createdAt: feedback.createdAt,
  };
}

function toBugResponse(bug: {
  id: string;
  category: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: bug.id,
    category: bug.category,
    status: bug.status,
    createdAt: bug.createdAt,
    updatedAt: bug.updatedAt,
  };
}

type MetricEvent = { eventType: PilotEventType; studentId: string; occurredAt: Date };

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function retentionRate(events: MetricEvent[], days: number, now: Date): number | null {
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);
  const firstSeen = new Map<string, string>();
  const daysByStudent = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.occurredAt < windowStart) continue;
    const day = event.occurredAt.toISOString().slice(0, 10);
    const first = firstSeen.get(event.studentId);
    if (!first || day < first) firstSeen.set(event.studentId, day);
    const set = daysByStudent.get(event.studentId) ?? new Set<string>();
    set.add(day);
    daysByStudent.set(event.studentId, set);
  }
  if (firstSeen.size === 0) return null;
  let retained = 0;
  for (const [studentId, first] of firstSeen) {
    const target = new Date(`${first}T00:00:00.000Z`);
    target.setUTCDate(target.getUTCDate() + days);
    if (daysByStudent.get(studentId)?.has(target.toISOString().slice(0, 10))) retained++;
  }
  return rate(retained, firstSeen.size);
}

export async function getPilotMetrics(input: { tenantId: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  const eventWhere = {
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    occurredAt: { gte: from, lte: now },
  } as const;
  const [events, attempts, sessionCounts, onboardingCompleted, feedbackCount, bugCount] =
    await Promise.all([
      prisma.pilotEvent.findMany({
        where: eventWhere,
        select: { eventType: true, studentId: true, occurredAt: true },
      }),
      prisma.attempt.findMany({
        where: {
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          answeredAt: { gte: from, lte: now },
        },
        select: { isCorrect: true, sessionId: true, questionVersionId: true },
      }),
      prisma.exerciseSession.groupBy({
        by: ["status"],
        where: {
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          startedAt: { gte: from, lte: now },
        },
        _count: { _all: true },
      }),
      prisma.studentProfile.count({
        where: {
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          onboardingCompletedAt: { gte: from, lte: now },
        },
      }),
      prisma.pilotFeedback.count({
        where: {
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          createdAt: { gte: from, lte: now },
        },
      }),
      prisma.pilotBugReport.count({
        where: {
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          createdAt: { gte: from, lte: now },
        },
      }),
    ]);
  const metricEvents = events as MetricEvent[];
  const byType = new Map<PilotEventType, number>();
  for (const event of metricEvents)
    byType.set(event.eventType, (byType.get(event.eventType) ?? 0) + 1);
  const activeStudents = new Set(metricEvents.map((event) => event.studentId)).size;
  const scoredAttempts = attempts.filter((attempt) => attempt.isCorrect !== null);
  const correctAttempts = scoredAttempts.filter((attempt) => attempt.isCorrect === true).length;
  const attemptCounts = new Map<string, number>();
  for (const attempt of attempts) {
    const key = `${attempt.sessionId}:${attempt.questionVersionId}`;
    attemptCounts.set(key, (attemptCounts.get(key) ?? 0) + 1);
  }
  const retryAttempts = [...attemptCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const sessions = new Map(sessionCounts.map((row) => [row.status, row._count._all]));
  const starts = byType.get("EXERCISE_STARTED") ?? 0;
  const completions = byType.get("EXERCISE_COMPLETED") ?? 0;
  const questionAttempts = byType.get("QUESTION_ATTEMPTED") ?? 0;
  const technicalErrorCount = byType.get("TECHNICAL_ERROR") ?? 0;
  const premiumInfoViewed = byType.get("PREMIUM_INFO_VIEWED") ?? 0;
  const premiumCtaClicked = byType.get("PREMIUM_CTA_CLICKED") ?? 0;
  const limitReached = byType.get("LIMIT_REACHED") ?? 0;
  const paywallViewed = byType.get("PAYWALL_VIEWED") ?? 0;
  const operator = {
    // This is the number of pilot students observed by the current window,
    // not the size of the deployment allowlist.
    pilotUsers: activeStudents,
    activeUsers: activeStudents,
    onboardingCompletions: onboardingCompleted,
    exerciseStarts: starts,
    exerciseCompletions: completions,
    technicalErrorCount,
    feedbackCount,
    bugReportCount: bugCount,
    premiumInfoViewed,
    premiumCtaClicked,
    limitReached,
    paywallViewed,
  };
  return {
    window: { from, to: now, days: 30 },
    acquisition: { signupCompletion: byType.get("SIGNUP_COMPLETED") ?? 0 },
    activation: {
      onboardingCompletion: onboardingCompleted,
      firstExerciseStarted: new Set(
        metricEvents
          .filter((event) => event.eventType === "EXERCISE_STARTED")
          .map((event) => event.studentId),
      ).size,
      firstExerciseCompleted: new Set(
        metricEvents
          .filter((event) => event.eventType === "EXERCISE_COMPLETED")
          .map((event) => event.studentId),
      ).size,
    },
    engagement: {
      activeStudents,
      sessions:
        (sessions.get("IN_PROGRESS") ?? 0) +
        (sessions.get("COMPLETED") ?? 0) +
        (sessions.get("ABANDONED") ?? 0),
      sessionsPerUser: rate(
        (sessions.get("IN_PROGRESS") ?? 0) +
          (sessions.get("COMPLETED") ?? 0) +
          (sessions.get("ABANDONED") ?? 0),
        activeStudents,
      ),
      exercisesPerUser: rate(completions, activeStudents),
      exerciseStarts: starts,
      exerciseCompletions: completions,
      questions: questionAttempts,
      questionsPerUser: rate(questionAttempts, activeStudents),
      activeDays: new Set(
        metricEvents.map(
          (event) => `${event.studentId}:${event.occurredAt.toISOString().slice(0, 10)}`,
        ),
      ).size,
    },
    learning: {
      accuracy: rate(correctAttempts, scoredAttempts.length),
      completionRate: rate(completions, starts),
      retryRate: rate(retryAttempts, attempts.length),
      reviewUsage: byType.get("REVIEW_STARTED") ?? 0,
    },
    retention: {
      d1: retentionRate(metricEvents, 1, now),
      d7: retentionRate(metricEvents, 7, now),
      d14: retentionRate(metricEvents, 14, now),
    },
    habit: {
      streakStarts: byType.get("STREAK_STARTED") ?? 0,
      streakContinuations: byType.get("STREAK_CONTINUED") ?? 0,
    },
    ux: {
      resumeRate: rate(byType.get("EXERCISE_RESUMED") ?? 0, starts),
      abandonment: byType.get("EXERCISE_ABANDONED") ?? 0,
      technicalErrorRate: rate(technicalErrorCount, metricEvents.length),
      premium: { premiumInfoViewed, premiumCtaClicked, limitReached, paywallViewed },
    },
    reports: { feedbackCount, bugReportCount: bugCount },
    operator,
    dataStatus: activeStudents === 0 ? "NO_PILOT_DATA" : "PILOT_DATA_ONLY",
  };
}

export async function listPilotReports(input: {
  tenantId: string | null;
  kind: "feedback" | "bug";
  limit: number;
}) {
  const where = input.tenantId ? { tenantId: input.tenantId } : {};
  if (input.kind === "feedback") {
    const rows = await prisma.pilotFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        studentId: true,
        category: true,
        rating: true,
        message: true,
        sessionId: true,
        questionVersionId: true,
        createdAt: true,
      },
    });
    return { kind: input.kind, items: rows };
  }
  const rows = await prisma.pilotBugReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: input.limit,
    select: {
      id: true,
      studentId: true,
      category: true,
      description: true,
      status: true,
      sessionId: true,
      questionVersionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { kind: input.kind, items: rows };
}
