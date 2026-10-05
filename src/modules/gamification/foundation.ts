import {
  Prisma,
  type GamificationEvent,
  type GamificationEventType,
  type PlatformRole,
  type PointEventType,
} from "@prisma/client";
import {
  calendarDateKey,
  calendarDateStorage,
  configuredCalendarTimezone,
} from "../../lib/calendar.js";
import { conflictError, forbiddenError, validationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export const GAMIFICATION_EVENT_TYPES = [
  "ASSIGNMENT_COMPLETED",
  "TRAINING_COMPLETED",
  "LEARNING_ACTIVITY_COMPLETED",
] as const satisfies readonly GamificationEventType[];

export const GAMIFICATION_REWARD_RULES = {
  ASSIGNMENT_COMPLETED: {
    code: "ASSIGNMENT_COMPLETED_BASE",
    points: 60,
    reasonCode: "ASSIGNMENT_COMPLETED",
  },
  TRAINING_COMPLETED: {
    code: "TRAINING_COMPLETED_BASE",
    points: 15,
    reasonCode: "TRAINING_COMPLETED",
  },
  LEARNING_ACTIVITY_COMPLETED: {
    code: "LEARNING_ACTIVITY_COMPLETED_BASE",
    points: 10,
    reasonCode: "LEARNING_ACTIVITY_COMPLETED",
  },
} as const satisfies Record<
  GamificationEventType,
  { code: string; points: number; reasonCode: string }
>;

const POINT_EVENT_TYPES: Record<GamificationEventType, PointEventType> = {
  ASSIGNMENT_COMPLETED: "ASSIGNMENT_COMPLETED",
  TRAINING_COMPLETED: "TRAINING_COMPLETED",
  LEARNING_ACTIVITY_COMPLETED: "LEARNING_ACTIVITY_COMPLETED",
};

/** Catalog only. Definitions are deliberately not seeded by the migration. */
export const FOUNDATION_ACHIEVEMENT_CATALOG = [
  {
    code: "FIRST_ASSIGNMENT",
    name: "İlk ödev",
    description: "İlk ödevini tamamladın.",
  },
  {
    code: "FIRST_STUDY",
    name: "İlk çalışma",
    description: "İlk uygun öğrenme çalışmanı tamamladın.",
  },
  {
    code: "FIVE_STUDIES",
    name: "5 çalışma",
    description: "Beş uygun öğrenme çalışmasını tamamladın.",
  },
] as const;

const STUDY_EVENT_TYPES: GamificationEventType[] = [
  "TRAINING_COMPLETED",
  "LEARNING_ACTIVITY_COMPLETED",
];
const STREAK_EVENT_TYPES: GamificationEventType[] = ["ASSIGNMENT_COMPLETED", ...STUDY_EVENT_TYPES];
const MAX_SERIALIZATION_RETRIES = 3;

export interface GamificationEventInput {
  tenantId: string;
  studentId: string;
  eventType: GamificationEventType;
  sourceType: string;
  sourceReference: string;
  idempotencyKey: string;
  occurredAt?: Date;
  timezone?: string;
  metadata?: Prisma.InputJsonValue;
}

type NormalizedGamificationEventInput = {
  tenantId: string;
  studentId: string;
  eventType: GamificationEventType;
  sourceType: string;
  sourceReference: string;
  idempotencyKey: string;
  occurredAt: Date;
  timezone: string;
  metadata?: Prisma.InputJsonValue;
};

export interface GamificationStreakSnapshot {
  currentDays: number;
  longestDays: number;
  lastActivityDate: Date | null;
  timezone: string;
}

export interface GamificationEventResult {
  event: Pick<
    GamificationEvent,
    "id" | "eventType" | "sourceType" | "sourceReference" | "createdAt"
  >;
  created: boolean;
  pointsAwarded: number;
  streak: GamificationStreakSnapshot | null;
  achievementsAwarded: Array<{
    code: string;
    name: string;
    description: string | null;
    awardedAt: Date;
  }>;
}

export interface GamificationSummary {
  studentId: string;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
  badges: Array<{
    code: string;
    name: string;
    description: string | null;
    awardedAt: Date;
  }>;
}

export interface GamificationStudentActor {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}

export interface GamificationTeacherActor {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function normalizeText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw validationError(`${label} gerekli`);
  return normalized;
}

function resolveEventDate(value: Date | undefined): Date {
  const result = value ?? new Date();
  if (Number.isNaN(result.getTime())) throw validationError("Geçerli bir etkinlik zamanı gerekli");
  return result;
}

function resolveTimezone(value: string | undefined): string {
  return configuredCalendarTimezone(value);
}

function dateDifferenceInDays(current: Date, previous: Date): number {
  return Math.round((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));
}

export interface GamificationStreakTransitionInput {
  previousDate: Date | null;
  previousCurrentDays: number;
  previousLongestDays: number;
  activityDate: Date;
}

export function calculateGamificationStreakTransition(input: GamificationStreakTransitionInput): {
  currentDays: number;
  longestDays: number;
  lastActivityDate: Date;
} {
  const activityDate = calendarDateStorage(input.activityDate, "UTC");
  if (!input.previousDate) {
    return {
      currentDays: 1,
      longestDays: Math.max(1, input.previousLongestDays),
      lastActivityDate: activityDate,
    };
  }

  const previousDate = calendarDateStorage(input.previousDate, "UTC");
  const difference = dateDifferenceInDays(activityDate, previousDate);
  if (difference <= 0) {
    return {
      currentDays: input.previousCurrentDays,
      longestDays: input.previousLongestDays,
      lastActivityDate: previousDate,
    };
  }

  const currentDays = difference === 1 ? input.previousCurrentDays + 1 : 1;
  return {
    currentDays,
    longestDays: Math.max(input.previousLongestDays, currentDays),
    lastActivityDate: activityDate,
  };
}

function isStreakEligible(eventType: GamificationEventType): boolean {
  return STREAK_EVENT_TYPES.includes(eventType);
}

function eventMatchesInput(
  event: GamificationEvent,
  input: Pick<
    GamificationEventInput,
    "tenantId" | "studentId" | "eventType" | "sourceType" | "sourceReference" | "idempotencyKey"
  >,
): boolean {
  return (
    event.tenantId === input.tenantId &&
    event.studentId === input.studentId &&
    event.eventType === input.eventType &&
    event.sourceType === input.sourceType &&
    event.sourceReference === input.sourceReference &&
    event.idempotencyKey === input.idempotencyKey
  );
}

async function findExistingEvent(
  client: Prisma.TransactionClient | typeof prisma,
  input: Pick<
    GamificationEventInput,
    "tenantId" | "studentId" | "eventType" | "sourceType" | "sourceReference" | "idempotencyKey"
  >,
): Promise<GamificationEvent | null> {
  const byIdempotency = await client.gamificationEvent.findFirst({
    where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
  });
  if (byIdempotency) {
    if (!eventMatchesInput(byIdempotency, input)) {
      throw conflictError("Idempotency anahtarı başka bir gamification etkinliğine ait");
    }
    return byIdempotency;
  }

  const bySource = await client.gamificationEvent.findFirst({
    where: {
      tenantId: input.tenantId,
      studentId: input.studentId,
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
    },
  });
  if (bySource && !eventMatchesInput(bySource, input)) {
    throw conflictError("Gamification kaynak etkinliği farklı bir idempotency anahtarıyla işlendi");
  }
  return bySource;
}

async function assertActiveStudent(
  client: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  studentId: string,
): Promise<void> {
  const membership = await client.membership.findFirst({
    where: {
      tenantId,
      userId: studentId,
      role: "STUDENT",
      status: "ACTIVE",
      deletedAt: null,
      tenant: { status: "ACTIVE", deletedAt: null },
      user: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true },
  });
  if (!membership) throw forbiddenError("Aktif öğrenci üyeliği gerekli");
}

async function readStreak(
  client: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  studentId: string,
): Promise<GamificationStreakSnapshot | null> {
  const streak = await client.gamificationStreakState.findUnique({
    where: { tenantId_studentId: { tenantId, studentId } },
    select: {
      currentDays: true,
      longestDays: true,
      lastActivityDate: true,
      timezone: true,
    },
  });
  return streak;
}

async function duplicateResult(
  client: Prisma.TransactionClient,
  event: GamificationEvent,
): Promise<GamificationEventResult> {
  const [pointEvent, streak, achievements] = await Promise.all([
    client.pointEvent.findFirst({
      where: { tenantId: event.tenantId, gamificationEventId: event.id },
      select: { points: true },
    }),
    readStreak(client, event.tenantId, event.studentId),
    client.studentAchievement.findMany({
      where: { tenantId: event.tenantId, studentId: event.studentId, sourceEventId: event.id },
      select: {
        awardedAt: true,
        achievementDefinition: { select: { code: true, name: true, description: true } },
      },
    }),
  ]);
  return {
    event,
    created: false,
    pointsAwarded: pointEvent?.points ?? 0,
    streak,
    achievementsAwarded: achievements.map((award) => ({
      ...award.achievementDefinition,
      awardedAt: award.awardedAt,
    })),
  };
}

async function applyStreak(
  client: Prisma.TransactionClient,
  event: GamificationEvent,
): Promise<GamificationStreakSnapshot | null> {
  if (!isStreakEligible(event.eventType))
    return readStreak(client, event.tenantId, event.studentId);

  const activityDate = calendarDateStorage(event.occurredAt, event.timezone);
  const inserted = await client.gamificationStreakDay.createMany({
    data: {
      tenantId: event.tenantId,
      studentId: event.studentId,
      activityDate,
      timezone: event.timezone,
      sourceEventId: event.id,
    },
    skipDuplicates: true,
  });

  const existing = await client.gamificationStreakState.findUnique({
    where: { tenantId_studentId: { tenantId: event.tenantId, studentId: event.studentId } },
  });
  if (inserted.count === 0) {
    return existing
      ? {
          currentDays: existing.currentDays,
          longestDays: existing.longestDays,
          lastActivityDate: existing.lastActivityDate,
          timezone: existing.timezone,
        }
      : null;
  }

  if (!existing) {
    const created = await client.gamificationStreakState.create({
      data: {
        tenantId: event.tenantId,
        studentId: event.studentId,
        currentDays: 1,
        longestDays: 1,
        lastActivityDate: activityDate,
        timezone: event.timezone,
      },
    });
    return created;
  }

  const transition = calculateGamificationStreakTransition({
    previousDate: existing.lastActivityDate,
    previousCurrentDays: existing.currentDays,
    previousLongestDays: existing.longestDays,
    activityDate,
  });
  const updated = await client.gamificationStreakState.update({
    where: { tenantId_studentId: { tenantId: event.tenantId, studentId: event.studentId } },
    data: {
      currentDays: transition.currentDays,
      longestDays: transition.longestDays,
      lastActivityDate: transition.lastActivityDate,
      timezone: event.timezone,
    },
  });
  return updated;
}

async function applyAchievements(
  client: Prisma.TransactionClient,
  event: GamificationEvent,
): Promise<GamificationEventResult["achievementsAwarded"]> {
  const [assignmentCount, studyCount] = await Promise.all([
    client.gamificationEvent.count({
      where: {
        tenantId: event.tenantId,
        studentId: event.studentId,
        eventType: "ASSIGNMENT_COMPLETED",
      },
    }),
    client.gamificationEvent.count({
      where: {
        tenantId: event.tenantId,
        studentId: event.studentId,
        eventType: { in: STUDY_EVENT_TYPES },
      },
    }),
  ]);

  const qualifiedCodes = new Set<string>();
  if (assignmentCount >= 1) qualifiedCodes.add("FIRST_ASSIGNMENT");
  if (studyCount >= 1) qualifiedCodes.add("FIRST_STUDY");
  if (studyCount >= 5) qualifiedCodes.add("FIVE_STUDIES");
  if (qualifiedCodes.size === 0) return [];

  const definitions = await client.achievementDefinition.findMany({
    where: { active: true, code: { in: [...qualifiedCodes] } },
    select: { id: true, code: true, name: true, description: true },
  });
  if (definitions.length === 0) return [];

  const existing = await client.studentAchievement.findMany({
    where: {
      tenantId: event.tenantId,
      studentId: event.studentId,
      achievementDefinitionId: { in: definitions.map((definition) => definition.id) },
    },
    select: { achievementDefinitionId: true },
  });
  const existingIds = new Set(existing.map((award) => award.achievementDefinitionId));
  const toCreate = definitions.filter((definition) => !existingIds.has(definition.id));
  if (toCreate.length > 0) {
    await client.studentAchievement.createMany({
      data: toCreate.map((definition) => ({
        tenantId: event.tenantId,
        studentId: event.studentId,
        achievementDefinitionId: definition.id,
        sourceEventId: event.id,
      })),
      skipDuplicates: true,
    });
  }

  const awarded = await client.studentAchievement.findMany({
    where: {
      tenantId: event.tenantId,
      studentId: event.studentId,
      achievementDefinitionId: { in: toCreate.map((definition) => definition.id) },
      sourceEventId: event.id,
    },
    select: {
      awardedAt: true,
      achievementDefinition: { select: { code: true, name: true, description: true } },
    },
  });
  return awarded.map((award) => ({ ...award.achievementDefinition, awardedAt: award.awardedAt }));
}

async function processInTransaction(
  input: NormalizedGamificationEventInput,
  client: Prisma.TransactionClient,
): Promise<GamificationEventResult> {
  await assertActiveStudent(client, input.tenantId, input.studentId);
  const existing = await findExistingEvent(client, input);
  if (existing) return duplicateResult(client, existing);

  const eventData: Prisma.GamificationEventUncheckedCreateInput = {
    tenantId: input.tenantId,
    studentId: input.studentId,
    eventType: input.eventType,
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    timezone: input.timezone,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
  const inserted = await client.gamificationEvent.createMany({
    data: eventData,
    skipDuplicates: true,
  });
  const event = await findExistingEvent(client, input);
  if (!event) throw new Error("Gamification event could not be persisted");
  if (inserted.count === 0) return duplicateResult(client, event);

  const rule = GAMIFICATION_REWARD_RULES[event.eventType];
  const pointEventType = POINT_EVENT_TYPES[event.eventType];
  await client.pointEvent.createMany({
    data: {
      tenantId: event.tenantId,
      studentId: event.studentId,
      eventType: pointEventType,
      points: rule.points,
      reasonCode: rule.reasonCode,
      sourceType: "GAMIFICATION_EVENT",
      sourceId: event.sourceReference,
      gamificationEventId: event.id,
      dedupeKey: `gamification:${event.id}:${rule.code}`,
    },
    skipDuplicates: true,
  });
  const pointEvent = await client.pointEvent.findFirst({
    where: { tenantId: event.tenantId, gamificationEventId: event.id },
    select: { points: true },
  });
  const streak = await applyStreak(client, event);
  const achievementsAwarded = await applyAchievements(client, event);

  return {
    event,
    created: true,
    pointsAwarded: pointEvent?.points ?? 0,
    streak,
    achievementsAwarded,
  };
}

async function processOnce(
  input: NormalizedGamificationEventInput,
): Promise<GamificationEventResult> {
  return prisma.$transaction((client) => processInTransaction(input, client), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

/**
 * Server-side event entry point. No student-facing write route exists, so a
 * client cannot mint points or achievements. Existing modules may emit a
 * signal here later without importing or changing their business rules.
 */
export async function processGamificationEvent(
  input: GamificationEventInput,
  transactionClient?: Prisma.TransactionClient,
): Promise<GamificationEventResult> {
  const normalized = {
    ...input,
    tenantId: normalizeText(input.tenantId, "Tenant kimliği"),
    studentId: normalizeText(input.studentId, "Öğrenci kimliği"),
    sourceType: normalizeText(input.sourceType, "Kaynak türü"),
    sourceReference: normalizeText(input.sourceReference, "Kaynak referansı"),
    idempotencyKey: normalizeText(input.idempotencyKey, "Idempotency anahtarı"),
    occurredAt: resolveEventDate(input.occurredAt),
    timezone: resolveTimezone(input.timezone),
  };

  if (transactionClient) return processInTransaction(normalized, transactionClient);

  for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await processOnce(normalized);
    } catch (error) {
      if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_RETRIES - 1) continue;
      if (!isUniqueViolation(error)) throw error;
      const existing = await findExistingEvent(prisma, normalized);
      if (!existing) throw error;
      return prisma.$transaction((client) => duplicateResult(client, existing));
    }
  }
  throw new Error("Gamification event transaction could not complete");
}

export interface AssignmentGamificationOutcome {
  pointsAwarded: number;
  currentStreak: number;
  longestStreak: number;
  badges: Array<{
    code: string;
    name: string;
    description: string | null;
    awardedAt: Date;
  }>;
}

export async function getAssignmentGamificationOutcome(
  tenantId: string,
  studentId: string,
  assignmentId: string,
): Promise<AssignmentGamificationOutcome | null> {
  const event = await prisma.gamificationEvent.findFirst({
    where: {
      tenantId,
      studentId,
      eventType: "ASSIGNMENT_COMPLETED",
      sourceType: "ASSIGNMENT",
      sourceReference: assignmentId,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!event) return null;

  const [pointEvent, streak, awards] = await Promise.all([
    prisma.pointEvent.findFirst({
      where: { tenantId, studentId, gamificationEventId: event.id },
      select: { points: true },
    }),
    prisma.gamificationStreakState.findUnique({
      where: { tenantId_studentId: { tenantId, studentId } },
      select: { currentDays: true, longestDays: true },
    }),
    prisma.studentAchievement.findMany({
      where: { tenantId, studentId, sourceEventId: event.id },
      select: {
        awardedAt: true,
        achievementDefinition: { select: { code: true, name: true, description: true } },
      },
      orderBy: [{ awardedAt: "asc" }, { id: "asc" }],
    }),
  ]);

  return {
    pointsAwarded: pointEvent?.points ?? 0,
    currentStreak: streak?.currentDays ?? 0,
    longestStreak: streak?.longestDays ?? 0,
    badges: awards.map((award) => ({ ...award.achievementDefinition, awardedAt: award.awardedAt })),
  };
}

async function readFoundationSummary(
  tenantId: string,
  studentId: string,
): Promise<GamificationSummary> {
  const [points, streak, awards] = await Promise.all([
    prisma.pointEvent.aggregate({ where: { tenantId, studentId }, _sum: { points: true } }),
    readStreak(prisma, tenantId, studentId),
    prisma.studentAchievement.findMany({
      where: { tenantId, studentId },
      select: {
        awardedAt: true,
        achievementDefinition: { select: { code: true, name: true, description: true } },
      },
      orderBy: [{ awardedAt: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    studentId,
    totalPoints: points._sum.points ?? 0,
    currentStreak: streak?.currentDays ?? 0,
    longestStreak: streak?.longestDays ?? 0,
    lastActivityDate: streak?.lastActivityDate ?? null,
    badges: awards.map((award) => ({ ...award.achievementDefinition, awardedAt: award.awardedAt })),
  };
}

export async function getStudentGamificationFoundation(
  actor: GamificationStudentActor,
): Promise<GamificationSummary> {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw forbiddenError("Gamification ekranı yalnızca öğrencilere açıktır");
  }
  await assertActiveStudent(prisma, actor.tenantId, actor.userId);
  return readFoundationSummary(actor.tenantId, actor.userId);
}

async function assertTeacherStudentAccess(
  actor: GamificationTeacherActor,
  studentId: string,
): Promise<void> {
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");
  const teacherMembership = await prisma.membership.findFirst({
    where: {
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: "TEACHER",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!teacherMembership) throw forbiddenError("Bu işlem için aktif öğretmen yetkiniz yok");

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId: actor.tenantId,
      studentId,
      status: "ACTIVE",
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
      class: {
        status: "ACTIVE",
        deletedAt: null,
        teacherAssignments: {
          some: {
            tenantId: actor.tenantId,
            teacherId: actor.userId,
            status: "ACTIVE",
            deletedAt: null,
          },
        },
      },
    },
    select: { id: true },
  });
  if (!enrollment) throw forbiddenError("Bu öğrenci için öğretmen erişiminiz yok");
}

export async function getTeacherGamificationSummary(
  actor: GamificationTeacherActor,
  studentId: string,
): Promise<GamificationSummary> {
  const normalizedStudentId = normalizeText(studentId, "Öğrenci kimliği");
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");
  await assertTeacherStudentAccess(actor, normalizedStudentId);
  return readFoundationSummary(actor.tenantId, normalizedStudentId);
}

export function formatGamificationActivityDate(date: Date, timezone?: string): string {
  return calendarDateKey(date, resolveTimezone(timezone));
}
