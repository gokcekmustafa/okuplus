import { Prisma, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export interface StudentProgressItem {
  skillId: string;
  skillName: string;
  skillCode: string;
  skillCategory: string;
  sessionCount: number;
  attemptCount: number;
  correctCount: number;
  accuracy: number | null;
  avgTimeMs: number | null;
  fluencyWcpm: number | null;
  consistency: number | null;
  masteryScore: number | null;
  lastAttemptAt: Date | null;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface StudentProgressListResult {
  items: StudentProgressItem[];
  total: number;
  summary: {
    sessionCount: number;
    attemptCount: number;
    correctCount: number;
    scoredCount: number;
    accuracy: number | null;
  };
}

export async function listStudentProgress(actor: {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}): Promise<StudentProgressListResult> {
  const where: Prisma.StudentProgressWhereInput = {
    studentId: actor.userId,
  };
  if (actor.tenantId) {
    where.tenantId = actor.tenantId;
  }

  const rows = await prisma.studentProgress.findMany({
    where,
    select: {
      skillId: true,
      skill: { select: { name: true, code: true, category: true } },
      sessionCount: true,
      attemptCount: true,
      correctCount: true,
      accuracy: true,
      avgTimeMs: true,
      fluencyWcpm: true,
      consistency: true,
      masteryScore: true,
      lastAttemptAt: true,
      periodStart: true,
      periodEnd: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Read-only counts: do not sum per-skill session counts or average percentages.
  const sessionScope = {
    studentId: actor.userId,
    tenantId: actor.tenantId ?? undefined,
    status: "COMPLETED" as const,
  };
  const [sessionCount, attemptCount, scoredGroups] = await Promise.all([
    prisma.exerciseSession.count({ where: sessionScope }),
    prisma.attempt.count({ where: { session: sessionScope } }),
    prisma.attempt.groupBy({
      by: ["isCorrect"],
      where: { session: sessionScope, rawScore: { not: null } },
      _count: true,
    }),
  ]);
  const scoredCount = scoredGroups.reduce((sum, row) => sum + row._count, 0);
  const correctCount = scoredGroups.find((row) => row.isCorrect === true)?._count ?? 0;
  return {
    items: rows.map((r) => ({
      skillId: r.skillId,
      skillName: r.skill.name,
      skillCode: r.skill.code,
      skillCategory: r.skill.category,
      sessionCount: r.sessionCount,
      attemptCount: r.attemptCount,
      correctCount: r.correctCount,
      accuracy: r.accuracy,
      avgTimeMs: r.avgTimeMs,
      fluencyWcpm: r.fluencyWcpm,
      consistency: r.consistency,
      masteryScore: r.masteryScore,
      lastAttemptAt: r.lastAttemptAt,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
    })),
    total: rows.length,
    summary: {
      sessionCount,
      attemptCount,
      correctCount,
      scoredCount,
      accuracy: scoredCount ? correctCount / scoredCount : null,
    },
  };
}

export async function getStudentSkillProgress(
  skillId: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<StudentProgressItem | null> {
  const where: Prisma.StudentProgressWhereInput = {
    studentId: actor.userId,
    skillId,
  };
  if (actor.tenantId) {
    where.tenantId = actor.tenantId;
  }

  const row = await prisma.studentProgress.findFirst({
    where,
    select: {
      skillId: true,
      skill: { select: { name: true, code: true, category: true } },
      sessionCount: true,
      attemptCount: true,
      correctCount: true,
      accuracy: true,
      avgTimeMs: true,
      fluencyWcpm: true,
      consistency: true,
      masteryScore: true,
      lastAttemptAt: true,
    },
  });

  if (!row) return null;

  return {
    skillId: row.skillId,
    skillName: row.skill.name,
    skillCode: row.skill.code,
    skillCategory: row.skill.category,
    sessionCount: row.sessionCount,
    attemptCount: row.attemptCount,
    correctCount: row.correctCount,
    accuracy: row.accuracy,
    avgTimeMs: row.avgTimeMs,
    fluencyWcpm: row.fluencyWcpm,
    consistency: row.consistency,
    masteryScore: row.masteryScore,
    lastAttemptAt: row.lastAttemptAt,
  };
}
