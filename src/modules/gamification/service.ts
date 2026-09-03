import { Prisma, type PlatformRole, type PointEvent, type PointEventType } from "@prisma/client";
import { forbiddenError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export const POINT_RULES = {
  DAILY_LOGIN: 20,
  CORRECT_ANSWER: 10,
  EXERCISE_COMPLETED: 50,
} as const satisfies Record<"DAILY_LOGIN" | "CORRECT_ANSWER" | "EXERCISE_COMPLETED", number>;

const BASIC_BADGE_CODES = ["FIRST_EXERCISE", "TEN_CORRECT", "SEVEN_DAY_STREAK"] as const;
const RECENT_EVENT_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GamificationActor {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}

export interface AwardPointsInput {
  tenantId: string;
  studentId: string;
  eventType: keyof typeof POINT_RULES;
  dedupeKey: string;
  sourceType: string;
  sourceId: string;
  activityAt?: Date;
}

export interface AwardPointsResult {
  event: PointEvent;
  created: boolean;
}

export interface StudentGamificationData {
  totalPoints: number;
  currentDays: number;
  longestDays: number;
  lastActivityDate: Date | null;
  badges: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    icon: string | null;
    awardedAt: Date;
    sourceType: string | null;
    sourceId: string | null;
  }>;
  recentPointEvents: Array<{
    id: string;
    eventType: PointEventType;
    points: number;
    sourceType: string | null;
    sourceId: string | null;
    dedupeKey: string | null;
    createdAt: Date;
  }>;
}

function utcCalendarDay(date: Date): Date {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function calendarKey(date: Date): string {
  return utcCalendarDay(date).toISOString().slice(0, 10);
}

async function findStudentMembership(studentId: string, tenantId: string) {
  return prisma.membership.findFirst({
    where: {
      userId: studentId,
      tenantId,
      role: "STUDENT",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
}

export async function awardPoints(input: AwardPointsInput): Promise<AwardPointsResult> {
  const data = {
    tenantId: input.tenantId,
    studentId: input.studentId,
    eventType: input.eventType,
    points: POINT_RULES[input.eventType],
    dedupeKey: input.dedupeKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  };

  let event: PointEvent;
  try {
    event = await prisma.pointEvent.create({ data });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await prisma.pointEvent.findUnique({
      where: {
        tenantId_dedupeKey: { tenantId: input.tenantId, dedupeKey: input.dedupeKey },
      },
    });
    if (!existing) throw error;
    return { event: existing, created: false };
  }

  await updateStreak(input.tenantId, input.studentId, input.activityAt ?? event.createdAt);
  await evaluateBasicBadges(input.tenantId, input.studentId);
  return { event, created: true };
}

export async function updateStreak(tenantId: string, studentId: string, activityAt = new Date()) {
  const activityDay = utcCalendarDay(activityAt);
  const streak = await prisma.studentStreak.findUnique({
    where: { tenantId_studentId: { tenantId, studentId } },
  });

  if (!streak) {
    return prisma.studentStreak.create({
      data: {
        tenantId,
        studentId,
        currentDays: 1,
        longestDays: 1,
        lastActivityDate: activityDay,
      },
    });
  }

  const previousDay = streak.lastActivityDate ? utcCalendarDay(streak.lastActivityDate) : null;
  const difference = previousDay
    ? Math.round((activityDay.getTime() - previousDay.getTime()) / DAY_MS)
    : null;
  if (difference !== null && difference <= 0) return streak;

  const currentDays = difference === 1 ? streak.currentDays + 1 : 1;
  return prisma.studentStreak.update({
    where: { tenantId_studentId: { tenantId, studentId } },
    data: {
      currentDays,
      longestDays: Math.max(streak.longestDays, currentDays),
      lastActivityDate: activityDay,
    },
  });
}

export async function evaluateBasicBadges(tenantId: string, studentId: string): Promise<void> {
  const badges = await prisma.badge.findMany({
    where: { code: { in: [...BASIC_BADGE_CODES] }, status: "ACTIVE" },
    select: { id: true, code: true },
  });
  if (badges.length === 0) return;

  const [completedSession, correctCount, streak] = await Promise.all([
    prisma.exerciseSession.findFirst({
      where: { tenantId, studentId, status: "COMPLETED" },
      select: { id: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.pointEvent.count({ where: { tenantId, studentId, eventType: "CORRECT_ANSWER" } }),
    prisma.studentStreak.findUnique({
      where: { tenantId_studentId: { tenantId, studentId } },
      select: { currentDays: true, lastActivityDate: true },
    }),
  ]);
  const lastCorrect =
    correctCount >= 10
      ? await prisma.pointEvent.findFirst({
          where: { tenantId, studentId, eventType: "CORRECT_ANSWER" },
          select: { sourceId: true },
          orderBy: { createdAt: "desc" },
        })
      : null;

  for (const badge of badges) {
    let sourceType: string | null = null;
    let sourceId: string | null = null;
    if (badge.code === "FIRST_EXERCISE" && completedSession) {
      sourceType = "EXERCISE_SESSION";
      sourceId = completedSession.id;
    } else if (badge.code === "TEN_CORRECT" && correctCount >= 10) {
      sourceType = "ATTEMPT";
      sourceId = lastCorrect?.sourceId ?? null;
    } else if (badge.code === "SEVEN_DAY_STREAK" && (streak?.currentDays ?? 0) >= 7) {
      sourceType = "STREAK";
      sourceId = streak?.lastActivityDate ? calendarKey(streak.lastActivityDate) : null;
    }
    if (!sourceType) continue;

    await prisma.studentBadge.upsert({
      where: { tenantId_studentId_badgeId: { tenantId, studentId, badgeId: badge.id } },
      create: { tenantId, studentId, badgeId: badge.id, sourceType, sourceId },
      update: {},
    });
  }
}

export async function recordDailyLogin(
  studentId: string,
  tenantId: string | null,
  activityAt = new Date(),
): Promise<AwardPointsResult | null> {
  if (!tenantId || !(await findStudentMembership(studentId, tenantId))) return null;
  const day = calendarKey(activityAt);
  return awardPoints({
    tenantId,
    studentId,
    eventType: "DAILY_LOGIN",
    dedupeKey: `${tenantId}:${studentId}:daily-login:${day}`,
    sourceType: "AUTH_LOGIN",
    sourceId: day,
    activityAt,
  });
}

export async function recordCorrectAnswer(input: {
  tenantId: string;
  studentId: string;
  attemptId: string;
  answeredAt?: Date;
}): Promise<AwardPointsResult> {
  return awardPoints({
    tenantId: input.tenantId,
    studentId: input.studentId,
    eventType: "CORRECT_ANSWER",
    dedupeKey: `${input.tenantId}:${input.studentId}:correct-answer:${input.attemptId}`,
    sourceType: "ATTEMPT",
    sourceId: input.attemptId,
    activityAt: input.answeredAt,
  });
}

export async function recordExerciseCompleted(input: {
  tenantId: string;
  studentId: string;
  sessionId: string;
  completedAt?: Date;
}): Promise<AwardPointsResult> {
  return awardPoints({
    tenantId: input.tenantId,
    studentId: input.studentId,
    eventType: "EXERCISE_COMPLETED",
    dedupeKey: `${input.tenantId}:${input.studentId}:exercise-completed:${input.sessionId}`,
    sourceType: "EXERCISE_SESSION",
    sourceId: input.sessionId,
    activityAt: input.completedAt,
  });
}

export async function getStudentGamification(
  actor: GamificationActor,
): Promise<StudentGamificationData> {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw forbiddenError("Gamification ekranı yalnızca öğrencilere açıktır");
  }
  if (!(await findStudentMembership(actor.userId, actor.tenantId))) {
    throw forbiddenError("Aktif öğrenci üyeliği gerekli");
  }

  const scope = { tenantId: actor.tenantId, studentId: actor.userId };
  const [points, streak, awards, recentPointEvents] = await Promise.all([
    prisma.pointEvent.aggregate({ where: scope, _sum: { points: true } }),
    prisma.studentStreak.findUnique({
      where: { tenantId_studentId: scope },
      select: { currentDays: true, longestDays: true, lastActivityDate: true },
    }),
    prisma.studentBadge.findMany({
      where: scope,
      select: {
        id: true,
        awardedAt: true,
        sourceType: true,
        sourceId: true,
        badge: {
          select: { code: true, name: true, description: true, icon: true },
        },
      },
      orderBy: { awardedAt: "desc" },
    }),
    prisma.pointEvent.findMany({
      where: scope,
      select: {
        id: true,
        eventType: true,
        points: true,
        sourceType: true,
        sourceId: true,
        dedupeKey: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_EVENT_LIMIT,
    }),
  ]);

  return {
    totalPoints: points._sum.points ?? 0,
    currentDays: streak?.currentDays ?? 0,
    longestDays: streak?.longestDays ?? 0,
    lastActivityDate: streak?.lastActivityDate ?? null,
    badges: awards.map((award) => ({
      id: award.id,
      code: award.badge.code,
      name: award.badge.name,
      description: award.badge.description,
      icon: award.badge.icon,
      awardedAt: award.awardedAt,
      sourceType: award.sourceType,
      sourceId: award.sourceId,
    })),
    recentPointEvents,
  };
}
