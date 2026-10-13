import { Prisma, type LearningAreaCode, type PilotEventType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError } from "../../lib/errors.js";
import { assertStudentScope, type OrganizationScope } from "../organization-admin/policy.js";

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const MAX_ACTIVITY_ROWS = 200;

export type AnalyticsRangeInput = { from?: Date; to?: Date };
export interface AnalyticsRange {
  from: Date;
  toExclusive: Date;
}

export function normalizeAnalyticsRange(
  input: AnalyticsRangeInput,
  now = new Date(),
): AnalyticsRange {
  const end = startOfUtcDay(input.to ?? now);
  const start = startOfUtcDay(
    input.from ?? new Date(end.getTime() - DEFAULT_RANGE_DAYS * 86_400_000),
  );
  const toExclusive = new Date(end.getTime() + 86_400_000);
  if (start >= toExclusive) throw new Error("Tarih aralığı geçersiz");
  if (toExclusive.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new Error(`Tarih aralığı en fazla ${MAX_RANGE_DAYS} gün olabilir`);
  }
  return { from: start, toExclusive };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function percentage(value: number, total: number): number | null {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : null;
}

function average(values: Array<number | null | undefined>): number | null {
  const usable = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return usable.length > 0
    ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10
    : null;
}

function studentWhere(
  scope: OrganizationScope,
  studentId?: string,
): Prisma.StudentProfileWhereInput {
  return {
    tenantId: scope.tenantId,
    ...(studentId ? { studentId } : {}),
    tenant: { deletedAt: null },
    student: {
      deletedAt: null,
      status: { not: "CLOSED" },
      ...(scope.role === "BRANCH_MANAGER"
        ? {
            enrollments: {
              some: {
                tenantId: scope.tenantId,
                status: "ACTIVE",
                deletedAt: null,
                class: { branchId: { in: scope.branchIds }, deletedAt: null },
              },
            },
          }
        : {}),
    },
  };
}

type StudentRow = {
  id: string;
  studentId: string;
  displayName: string;
  status: string;
  classNames: string[];
};

type StudentPagination = { skip: number; take: number };

async function loadScopedStudents(
  scope: OrganizationScope,
  studentId?: string,
  pagination?: StudentPagination,
): Promise<StudentRow[]> {
  const rows = await prisma.studentProfile.findMany({
    where: studentWhere(scope, studentId),
    select: {
      id: true,
      studentId: true,
      student: {
        select: {
          displayName: true,
          status: true,
          enrollments: {
            where: {
              tenantId: scope.tenantId,
              status: "ACTIVE",
              deletedAt: null,
              ...(scope.role === "BRANCH_MANAGER"
                ? { class: { branchId: { in: scope.branchIds }, deletedAt: null } }
                : { class: { deletedAt: null } }),
            },
            select: { class: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    ...(pagination ?? {}),
  });
  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    displayName: row.student.displayName,
    status: row.student.status,
    classNames: [...new Set(row.student.enrollments.map((enrollment) => enrollment.class.name))],
  }));
}

function featureForSession(session: {
  context: string;
  assignmentId: string | null;
  assessmentId: string | null;
  learningStepId: string | null;
}): string {
  if (session.assessmentId || session.context === "ASSESSMENT") return "Ölçme-Değerlendirme";
  if (session.assignmentId || session.context === "ASSIGNMENT") return "Ödevler";
  if (session.learningStepId) return "Öğrenme Yolu";
  return "Bağımsız Antrenman";
}

export const PILOT_EVENT_LABELS: Record<PilotEventType, string> = {
  SIGNUP_COMPLETED: "Kayıt",
  ONBOARDING_STARTED: "Başlangıç",
  ONBOARDING_COMPLETED: "Başlangıç tamamlandı",
  LEARNING_PATH_OPENED: "Öğrenme Yolu",
  TODAY_OPENED: "Günlük akış",
  EXERCISE_STARTED: "Alıştırma başladı",
  QUESTION_VIEWED: "Soru görüntüleme",
  QUESTION_ATTEMPTED: "Soru denemesi",
  QUESTION_ANSWERED: "Soru yanıtı",
  EXERCISE_COMPLETED: "Alıştırma tamamlandı",
  EXERCISE_ABANDONED: "Alıştırma bırakıldı",
  EXERCISE_RESUMED: "Alıştırma sürdürüldü",
  ASSESSMENT_STARTED: "Ölçme başladı",
  ASSESSMENT_COMPLETED: "Ölçme tamamlandı",
  REVIEW_STARTED: "Tekrar başladı",
  REVIEW_COMPLETED: "Tekrar tamamlandı",
  STREAK_STARTED: "Seri başladı",
  STREAK_CONTINUED: "Seri sürdü",
  TECHNICAL_ERROR: "Teknik hata",
  PREMIUM_INFO_VIEWED: "Plan bilgisi",
  PREMIUM_CTA_CLICKED: "Plan işlemi",
  LIMIT_REACHED: "Limit",
  PAYWALL_VIEWED: "Ödeme duvarı",
  PREMIUM_CHECKOUT_STARTED: "Ödeme başladı",
  PREMIUM_CHECKOUT_COMPLETED: "Ödeme tamamlandı",
  PREMIUM_CHECKOUT_FAILED: "Ödeme başarısız",
  SUBSCRIPTION_CANCELED: "Abonelik iptali",
};

function bucketStart(date: Date, unit: "day" | "week" | "month"): Date {
  const start = startOfUtcDay(date);
  if (unit === "month") return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (unit === "day") return start;
  const day = start.getUTCDay();
  return new Date(start.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000);
}

function usageBuckets(
  dates: Array<{ studentId: string; at: Date }>,
  unit: "day" | "week" | "month",
) {
  const buckets = new Map<string, { bucket: Date; students: Set<string>; events: number }>();
  for (const item of dates) {
    const bucket = bucketStart(item.at, unit);
    const key = bucket.toISOString();
    const current = buckets.get(key) ?? { bucket, students: new Set<string>(), events: 0 };
    current.students.add(item.studentId);
    current.events += 1;
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .sort((a, b) => a.bucket.getTime() - b.bucket.getTime())
    .map((item) => ({
      bucket: item.bucket,
      activeStudents: item.students.size,
      events: item.events,
    }));
}

export interface AnalyticsStudentListResponse {
  items: Array<StudentRow & { lastActivityAt: Date | null }>;
  total: number;
  page: number;
  pageSize: number;
}

export async function listAnalyticsStudents(
  scope: OrganizationScope,
  range: AnalyticsRange,
  page: number,
  pageSize: number,
): Promise<AnalyticsStudentListResponse> {
  const [pageRows, total] = await Promise.all([
    loadScopedStudents(scope, undefined, { skip: (page - 1) * pageSize, take: pageSize }),
    prisma.studentProfile.count({ where: studentWhere(scope) }),
  ]);
  if (pageRows.length === 0) return { items: [], total, page, pageSize };
  const ids = pageRows.map((row) => row.studentId);
  const [sessions, training, events, progress] = await Promise.all([
    prisma.exerciseSession.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        startedAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, startedAt: true },
    }),
    prisma.trainingSession.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        createdAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, createdAt: true },
    }),
    prisma.pilotEvent.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        occurredAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, occurredAt: true },
    }),
    prisma.studentLearningStepProgress.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        lastActivityAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, lastActivityAt: true },
    }),
  ]);
  const last = new Map<string, Date>();
  for (const row of [
    ...sessions.map((x) => ({ id: x.studentId, at: x.startedAt })),
    ...training.map((x) => ({ id: x.studentId, at: x.createdAt })),
    ...events.map((x) => ({ id: x.studentId, at: x.occurredAt })),
    ...progress.flatMap((x) =>
      x.lastActivityAt ? [{ id: x.studentId, at: x.lastActivityAt }] : [],
    ),
  ]) {
    const current = last.get(row.id);
    if (!current || row.at > current) last.set(row.id, row.at);
  }
  return {
    items: pageRows.map((row) => ({ ...row, lastActivityAt: last.get(row.studentId) ?? null })),
    total,
    page,
    pageSize,
  };
}

export interface AnalyticsOverviewResponse {
  period: { from: Date; to: Date };
  definitions: { activeStudent: string; duration: string; startedNotContinued: string };
  overview: {
    registeredStudents: number;
    activeStudents: number;
    exerciseSessions: number;
    trainingSessions: number;
    averageExerciseDurationMs: number | null;
    startedNotContinuedStudents: number;
    technicalErrors: number;
    featureUsage: Array<{ feature: string; sessions: number; students: number }>;
    usageByDay: Array<{ bucket: Date; activeStudents: number; events: number }>;
    usageByWeek: Array<{ bucket: Date; activeStudents: number; events: number }>;
    usageByMonth: Array<{ bucket: Date; activeStudents: number; events: number }>;
  };
  dataAvailability: {
    pilotEvents: boolean;
    exerciseDurations: boolean;
    historicalEventStream: boolean;
  };
}

export async function getAnalyticsOverview(
  scope: OrganizationScope,
  range: AnalyticsRange,
): Promise<AnalyticsOverviewResponse> {
  const students = await loadScopedStudents(scope);
  const ids = students.map((student) => student.studentId);
  const base = {
    period: { from: range.from, to: new Date(range.toExclusive.getTime() - 1) },
    definitions: {
      activeStudent:
        "Seçilen dönemde sunucuya kaydedilmiş en az bir öğrenci etkinliği olan öğrenci",
      duration: "Tamamlanan ExerciseSession kayıtlarındaki server-side timeSpentMs ortalaması",
      startedNotContinued:
        "Dönemde başlayıp tamamlanma durumu olmayan ExerciseSession/TrainingSession öğrencisi",
    },
  };
  if (ids.length === 0)
    return {
      ...base,
      overview: {
        registeredStudents: 0,
        activeStudents: 0,
        exerciseSessions: 0,
        trainingSessions: 0,
        averageExerciseDurationMs: null,
        startedNotContinuedStudents: 0,
        technicalErrors: 0,
        featureUsage: [],
        usageByDay: [],
        usageByWeek: [],
        usageByMonth: [],
      },
      dataAvailability: {
        pilotEvents: false,
        exerciseDurations: false,
        historicalEventStream: false,
      },
    };
  const [sessions, training, events, progress] = await Promise.all([
    prisma.exerciseSession.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        startedAt: { gte: range.from, lt: range.toExclusive },
      },
      select: {
        studentId: true,
        context: true,
        assignmentId: true,
        assessmentId: true,
        learningStepId: true,
        status: true,
        startedAt: true,
        timeSpentMs: true,
      },
    }),
    prisma.trainingSession.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        createdAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, status: true, createdAt: true },
    }),
    prisma.pilotEvent.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        occurredAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, eventType: true, occurredAt: true },
    }),
    prisma.studentLearningStepProgress.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: { in: ids },
        lastActivityAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { studentId: true, lastActivityAt: true },
    }),
  ]);
  const activeIds = new Set<string>();
  const usageDates: Array<{ studentId: string; at: Date }> = [];
  for (const row of sessions) {
    activeIds.add(row.studentId);
    usageDates.push({ studentId: row.studentId, at: row.startedAt });
  }
  for (const row of training) {
    activeIds.add(row.studentId);
    usageDates.push({ studentId: row.studentId, at: row.createdAt });
  }
  for (const row of events) {
    activeIds.add(row.studentId);
    usageDates.push({ studentId: row.studentId, at: row.occurredAt });
  }
  for (const row of progress)
    if (row.lastActivityAt) {
      activeIds.add(row.studentId);
      usageDates.push({ studentId: row.studentId, at: row.lastActivityAt });
    }
  const featureMap = new Map<string, { sessions: number; students: Set<string> }>();
  for (const session of sessions) {
    const feature = featureForSession(session);
    const item = featureMap.get(feature) ?? { sessions: 0, students: new Set<string>() };
    item.sessions += 1;
    item.students.add(session.studentId);
    featureMap.set(feature, item);
  }
  if (training.length > 0) {
    const item = featureMap.get("Bağımsız Antrenman") ?? {
      sessions: 0,
      students: new Set<string>(),
    };
    item.sessions += training.length;
    for (const row of training) item.students.add(row.studentId);
    featureMap.set("Bağımsız Antrenman", item);
  }
  const durations = sessions
    .filter((session) => session.status === "COMPLETED")
    .map((session) => session.timeSpentMs);
  const unfinishedIds = new Set([
    ...sessions
      .filter((session) => session.status !== "COMPLETED")
      .map((session) => session.studentId),
    ...training
      .filter((session) => session.status !== "COMPLETED")
      .map((session) => session.studentId),
  ]);
  return {
    ...base,
    overview: {
      registeredStudents: students.length,
      activeStudents: activeIds.size,
      exerciseSessions: sessions.length,
      trainingSessions: training.length,
      averageExerciseDurationMs: average(durations),
      startedNotContinuedStudents: unfinishedIds.size,
      technicalErrors: events.filter((event) => event.eventType === "TECHNICAL_ERROR").length,
      featureUsage: [...featureMap.entries()]
        .map(([feature, item]) => ({
          feature,
          sessions: item.sessions,
          students: item.students.size,
        }))
        .sort((a, b) => b.sessions - a.sessions),
      usageByDay: usageBuckets(usageDates, "day"),
      usageByWeek: usageBuckets(usageDates, "week"),
      usageByMonth: usageBuckets(usageDates, "month"),
    },
    dataAvailability: {
      pilotEvents: events.length > 0,
      exerciseDurations: durations.some((value) => value !== null),
      historicalEventStream: events.length > 0,
    },
  };
}

type ActivityItem = { id: string; type: string; result: string | null; at: Date; source: string };

export interface AnalyticsStudentDetailResponse {
  student: {
    id: string;
    profileId: string;
    displayName: string;
    status: string;
    classNames: string[];
    currentLevel: { id: string; code: string; name: string } | null;
    targetLevel: { id: string; code: string; name: string } | null;
  };
  period: { from: Date; to: Date };
  journey: {
    paths: Array<{
      id: string;
      code: string;
      title: string;
      area: LearningAreaCode;
      version: number;
      status: string;
      currentStep: { id: string; stableKey: string; title: string; position: number } | null;
      steps: Array<{
        id: string;
        stableKey: string;
        title: string;
        position: number;
        type: string;
        status: string;
        lastActivityAt: Date | null;
      }>;
    }>;
    areas: Array<{
      area: LearningAreaCode;
      total: number;
      completed: number;
      inProgress: number;
      locked: number;
      percentage: number | null;
    }>;
    lastActivityAt: Date | null;
  };
  performance: {
    exerciseSessions: number;
    completedExercises: number;
    abandonedExercises: number;
    attempts: number;
    correct: number;
    wrong: number;
    correctRatio: number | null;
    baselineScore: number | null;
    latestMeasurementScore: number | null;
    improvementFromBaseline: number | null;
    readingSpeed: { available: boolean; points: Array<{ at: Date; value: number }> };
    readingComprehension: { available: boolean; points: Array<{ at: Date; value: number }> };
    skillsNeedingReview: Array<{ code: string; name: string; reason: string }>;
  };
  activity: { items: ActivityItem[]; total: number; truncated: boolean; limitations: string[] };
}

export async function getAnalyticsStudentDetail(
  scope: OrganizationScope,
  studentId: string,
  range: AnalyticsRange,
): Promise<AnalyticsStudentDetailResponse> {
  const profile = await assertStudentScope(scope, studentId);
  const visibleStudent = await loadScopedStudents(scope, studentId);
  if (!visibleStudent[0]) throw forbiddenError("Bu öğrenci analitiği için yetkiniz yok");
  const [
    paths,
    stepProgress,
    sessions,
    assignments,
    events,
    training,
    assessmentResults,
    baseline,
    studentProgress,
    recommendations,
    profileLevels,
  ] = await Promise.all([
    prisma.studentLearningPath.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        learningPath: { OR: [{ tenantId: null }, { tenantId: scope.tenantId }] },
      },
      select: {
        learningPath: {
          select: {
            id: true,
            code: true,
            title: true,
            area: true,
            version: true,
            status: true,
            units: {
              orderBy: { position: "asc" },
              select: {
                steps: {
                  where: { isActive: true },
                  orderBy: { position: "asc" },
                  select: { id: true, stableKey: true, title: true, position: true, type: true },
                },
              },
            },
          },
        },
        currentStep: { select: { id: true, stableKey: true, title: true, position: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.studentLearningStepProgress.findMany({
      where: { tenantId: scope.tenantId, studentId },
      select: { learningStepId: true, status: true, lastActivityAt: true, updatedAt: true },
    }),
    prisma.exerciseSession.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        startedAt: { gte: range.from, lt: range.toExclusive },
      },
      select: {
        id: true,
        context: true,
        assignmentId: true,
        assessmentId: true,
        learningStepId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        timeSpentMs: true,
        attempts: { select: { id: true, isCorrect: true, answeredAt: true } },
      },
      orderBy: { startedAt: "desc" },
      take: MAX_ACTIVITY_ROWS,
    }),
    prisma.studentAssignment.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        updatedAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { id: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_ACTIVITY_ROWS,
    }),
    prisma.pilotEvent.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        occurredAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { id: true, eventType: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
      take: MAX_ACTIVITY_ROWS,
    }),
    prisma.trainingSession.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        createdAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { id: true, status: true, createdAt: true, completedAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ACTIVITY_ROWS,
    }),
    prisma.assessmentResult.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        completedAt: { gte: range.from, lt: range.toExclusive },
      },
      select: { id: true, score: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: MAX_ACTIVITY_ROWS,
    }),
    prisma.studentBaseline.findUnique({
      where: { tenantId_studentId: { tenantId: scope.tenantId, studentId } },
      select: { sourceAssessmentResult: { select: { score: true } } },
    }),
    prisma.studentProgress.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        periodStart: { lt: range.toExclusive },
        periodEnd: { gt: range.from },
      },
      select: {
        skill: { select: { code: true, name: true } },
        fluencyWcpm: true,
        accuracy: true,
        periodEnd: true,
      },
      orderBy: { periodStart: "asc" },
      take: MAX_ACTIVITY_ROWS,
    }),
    prisma.assignmentRecommendation.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId,
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { skill: { select: { code: true, name: true } }, reason: true },
      orderBy: { generatedAt: "asc" },
      take: 50,
    }),
    prisma.studentProfile.findUnique({
      where: { tenantId_studentId: { tenantId: scope.tenantId, studentId } },
      select: {
        currentLevel: { select: { id: true, code: true, name: true } },
        targetLevel: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);
  const studentInfo = visibleStudent[0];
  const progressByStep = new Map(stepProgress.map((item) => [item.learningStepId, item]));
  const pathResponses = paths.map((enrollment) => {
    const { units, ...path } = enrollment.learningPath;
    return {
      ...path,
      currentStep: enrollment.currentStep,
      steps: units
        .flatMap((unit) => unit.steps)
        .map((step) => {
          const progress = progressByStep.get(step.id);
          return {
            ...step,
            status: progress?.status ?? "LOCKED",
            lastActivityAt: progress?.lastActivityAt ?? progress?.updatedAt ?? null,
          };
        }),
    };
  });
  const areaMap = new Map<
    LearningAreaCode,
    { total: number; completed: number; inProgress: number; locked: number }
  >();
  for (const path of pathResponses) {
    const area = areaMap.get(path.area) ?? { total: 0, completed: 0, inProgress: 0, locked: 0 };
    area.total += path.steps.length;
    for (const step of path.steps) {
      if (step.status === "COMPLETED") area.completed += 1;
      else if (step.status === "ACTIVE" || step.status === "IN_PROGRESS") area.inProgress += 1;
      else if (step.status === "LOCKED") area.locked += 1;
    }
    areaMap.set(path.area, area);
  }
  const lastActivityCandidates = [
    ...stepProgress.map((item) => item.lastActivityAt ?? item.updatedAt),
    ...sessions.map((item) => item.completedAt ?? item.startedAt),
    ...training.map((item) => item.completedAt ?? item.updatedAt),
    ...events.map((item) => item.occurredAt),
  ];
  const lastActivityAt =
    lastActivityCandidates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const allAttempts = sessions.flatMap((session) => session.attempts);
  const correct = allAttempts.filter((attempt) => attempt.isCorrect === true).length;
  const wrong = allAttempts.filter((attempt) => attempt.isCorrect === false).length;
  const measurementScores = assessmentResults
    .map((result) => result.score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const baselineScore = baseline?.sourceAssessmentResult.score ?? null;
  const latestMeasurementScore = measurementScores[0] ?? null;
  const speedPoints = studentProgress.flatMap((item) =>
    item.skill.code.startsWith("FAST_") && item.fluencyWcpm !== null
      ? [{ at: item.periodEnd, value: item.fluencyWcpm }]
      : [],
  );
  const comprehensionPoints = studentProgress.flatMap((item) =>
    item.skill.code.startsWith("RC_") && item.accuracy !== null
      ? [{ at: item.periodEnd, value: item.accuracy * 100 }]
      : [],
  );
  const activity: ActivityItem[] = [
    ...events.map((event) => ({
      id: event.id,
      type: PILOT_EVENT_LABELS[event.eventType],
      result: null,
      at: event.occurredAt,
      source: "PilotEvent",
    })),
    ...sessions.map((session) => ({
      id: session.id,
      type: `${featureForSession(session)} oturumu`,
      result: session.status,
      at: session.completedAt ?? session.startedAt,
      source: "ExerciseSession",
    })),
    ...training.map((session) => ({
      id: session.id,
      type: "Bağımsız Antrenman oturumu",
      result: session.status,
      at: session.completedAt ?? session.updatedAt,
      source: "TrainingSession",
    })),
    ...assignments.map((assignment) => ({
      id: assignment.id,
      type: "Ödev",
      result: assignment.status,
      at: assignment.updatedAt,
      source: "StudentAssignment",
    })),
    ...assessmentResults.map((result) => ({
      id: result.id,
      type: "Ölçme-Değerlendirme",
      result: result.score === null ? null : `${Math.round(result.score * 100)}%`,
      at: result.completedAt,
      source: "AssessmentResult",
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    student: {
      id: studentId,
      profileId: profile.id,
      displayName: studentInfo?.displayName ?? "Öğrenci",
      status: studentInfo?.status ?? "UNKNOWN",
      classNames: studentInfo?.classNames ?? [],
      currentLevel: profileLevels?.currentLevel ?? null,
      targetLevel: profileLevels?.targetLevel ?? null,
    },
    period: { from: range.from, to: new Date(range.toExclusive.getTime() - 1) },
    journey: {
      paths: pathResponses,
      areas: [...areaMap.entries()].map(([area, value]) => ({
        area,
        ...value,
        percentage: percentage(value.completed, value.total),
      })),
      lastActivityAt,
    },
    performance: {
      exerciseSessions: sessions.length,
      completedExercises: sessions.filter((session) => session.status === "COMPLETED").length,
      abandonedExercises: sessions.filter((session) =>
        ["ABANDONED", "EXPIRED"].includes(session.status),
      ).length,
      attempts: allAttempts.length,
      correct,
      wrong,
      correctRatio: percentage(correct, correct + wrong),
      baselineScore,
      latestMeasurementScore,
      improvementFromBaseline:
        baselineScore !== null && latestMeasurementScore !== null
          ? latestMeasurementScore - baselineScore
          : null,
      readingSpeed: {
        available: speedPoints.length > 0,
        points: speedPoints.map((item) => ({ at: item.at, value: item.value })),
      },
      readingComprehension: {
        available: comprehensionPoints.length > 0,
        points: comprehensionPoints.map((item) => ({ at: item.at, value: item.value })),
      },
      skillsNeedingReview: recommendations.map((item) => ({
        code: item.skill.code,
        name: item.skill.name,
        reason: item.reason,
      })),
    },
    activity: {
      items: activity.slice(0, MAX_ACTIVITY_ROWS),
      total: activity.length,
      truncated:
        activity.length > MAX_ACTIVITY_ROWS ||
        sessions.length >= MAX_ACTIVITY_ROWS ||
        events.length >= MAX_ACTIVITY_ROWS,
      limitations: [
        "Geçmişte event olarak tutulmamış istemci ekranları bu rapora eklenemez.",
        "Sınıf/kurum toplamları yalnızca mevcut yetki kapsamındaki öğrencilere göre hesaplanır.",
      ],
    },
  };
}
