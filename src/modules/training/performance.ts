import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  ADAPTIVE_TRAINING_FAMILIES,
  deriveAdaptivePerformance,
  type AdaptiveDifficulty,
  type AdaptiveFamily,
  type AdaptivePerformanceState,
  type AdaptiveSession,
} from "./adaptive-selector.js";
import { resolveTrainingRuntimeConfig } from "./runtime.js";

export const TRAINING_SKILL_PRESENTATION = [
  { family: "ATTENTION_BURST", competency: "FAST_ATTENTION", label: "Dikkat" },
  { family: "RAPID_RECOGNITION", competency: "FAST_RECOGNITION", label: "Hızlı Tanıma" },
  { family: "PHRASE_CHUNKING", competency: "FAST_CHUNKING", label: "Cümle Gruplama" },
  { family: "MAIN_IDEA", competency: "RC_MAIN_IDEA", label: "Ana Fikir" },
  { family: "DETAIL_EVIDENCE", competency: "RC_DETAIL", label: "Detay" },
  { family: "INFERENCE", competency: "RC_INFERENCE", label: "Çıkarım" },
] as const;

export type TrainingPerformanceActor = {
  userId: string;
  tenantId: string;
};

export type TrainingProgressSkill = {
  family: AdaptiveFamily;
  competency: string;
  label: string;
  masteryState: "NOT_STARTED" | "PRACTICING" | "DEVELOPING" | "STABLE" | "NEEDS_REVIEW";
  scoredAttemptCount: number;
  recentAccuracy: number | null;
  recent5Accuracy: number | null;
  exposureCount: number;
  sessionCount: number;
  averageResponseTimeMs: number | null;
  lastActivityAt: Date | string | null;
  trend: "DEVELOPING" | "STABLE" | "NEEDS_REVIEW" | null;
  mastery: boolean;
};

export type TrainingPerformanceSnapshot = {
  performance: AdaptivePerformanceState;
  sessionCount: number;
  completedSessionCount: number;
  completedTrainingSessionCount: number;
  scoredAttemptCount: number;
  correctCount: number;
};

export function emptyTrainingPerformanceSnapshot(): TrainingPerformanceSnapshot {
  return {
    performance: deriveAdaptivePerformance([]),
    sessionCount: 0,
    completedSessionCount: 0,
    completedTrainingSessionCount: 0,
    scoredAttemptCount: 0,
    correctCount: 0,
  };
}

type TrainingSessionRow = {
  id: string;
  status: AdaptiveSession["status"];
  templateVersionId: string;
  startedAt: Date;
  completedAt: Date | null;
  templateVersion: { config: Prisma.JsonValue | null };
  trainingSessionItem: {
    family: string;
    competency: string;
    difficulty: string;
    templateVersionId: string;
    trainingSession: { id: string; status: string } | null;
  } | null;
  attempts: Array<{
    rawScore: number | null;
    isCorrect: boolean | null;
    timeSpentMs: number | null;
    answeredAt: Date;
  }>;
};

function isAdaptiveFamily(value: string): value is AdaptiveFamily {
  return (ADAPTIVE_TRAINING_FAMILIES as readonly string[]).includes(value);
}

function isAdaptiveDifficulty(value: string): value is AdaptiveDifficulty {
  return value === "FOUNDATION" || value === "DEVELOPING" || value === "CHALLENGING";
}

function sessionActivityAt(row: TrainingSessionRow): Date {
  return row.attempts.at(-1)?.answeredAt ?? row.completedAt ?? row.startedAt;
}

/**
 * Tek sorguda yalnız bireysel, puanlanan Training oturumlarını yükler.
 * assignment/assessment oturumları ve Placement burada bilinçli olarak dışarıda
 * bırakılır. Runtime config yalnız published version snapshot'tan çözülür.
 */
export async function loadTrainingPerformance(
  actor: TrainingPerformanceActor,
): Promise<TrainingPerformanceSnapshot> {
  const rows = (await prisma.exerciseSession.findMany({
    where: {
      tenantId: actor.tenantId,
      studentId: actor.userId,
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
      assignmentId: null,
      assessmentId: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      templateVersionId: true,
      startedAt: true,
      completedAt: true,
      templateVersion: { select: { config: true } },
      trainingSessionItem: {
        select: {
          family: true,
          competency: true,
          difficulty: true,
          templateVersionId: true,
          trainingSession: { select: { id: true, status: true } },
        },
      },
      attempts: {
        orderBy: [{ answeredAt: "asc" }, { id: "asc" }],
        select: { rawScore: true, isCorrect: true, timeSpentMs: true, answeredAt: true },
      },
    },
  })) as TrainingSessionRow[];

  const sessions: AdaptiveSession[] = [];
  for (const row of rows) {
    const resolved = resolveTrainingRuntimeConfig("TRAINING", row.templateVersion.config);
    if (resolved.status !== "READY") continue;
    const family = row.trainingSessionItem?.family ?? resolved.config.family;
    const competency = row.trainingSessionItem?.competency ?? resolved.config.competency;
    const difficulty = row.trainingSessionItem?.difficulty ?? resolved.config.difficulty;
    if (!isAdaptiveFamily(family) || !isAdaptiveDifficulty(difficulty)) continue;

    // rawScore varlığı puanlanmış cevap kontratıdır. isCorrect tek başına
    // legacy/OPEN_ENDED veriyi progress'e sokmamalıdır.
    const attempts = row.attempts.filter(
      (attempt) => typeof attempt.rawScore === "number" && Number.isFinite(attempt.rawScore),
    );
    sessions.push({
      sessionId: row.id,
      family,
      competency,
      difficulty,
      exposureId: row.trainingSessionItem?.templateVersionId ?? row.templateVersionId,
      status: row.status,
      attempts,
      lastActivityAt: sessionActivityAt(row),
    });
  }

  const performance = deriveAdaptivePerformance(sessions);
  const scoredAttemptCount = sessions.reduce(
    (total, session) => total + session.attempts.length,
    0,
  );
  const correctCount = sessions.reduce(
    (total, session) =>
      total + session.attempts.filter((attempt) => (attempt.rawScore ?? 0) >= 1).length,
    0,
  );
  const completedTrainingSessionCount = new Set(
    rows
      .filter((row) => row.trainingSessionItem?.trainingSession?.status === "COMPLETED")
      .map((row) => row.trainingSessionItem!.trainingSession!.id),
  ).size;
  return {
    performance,
    sessionCount: sessions.length,
    completedSessionCount: sessions.filter((session) => session.status === "COMPLETED").length,
    completedTrainingSessionCount,
    scoredAttemptCount,
    correctCount,
  };
}

export function toTrainingProgressSummary(snapshot: TrainingPerformanceSnapshot) {
  return {
    version: 1 as const,
    sessionCount: snapshot.completedSessionCount,
    completedTrainingSessionCount: snapshot.completedTrainingSessionCount,
    scoredAttemptCount: snapshot.scoredAttemptCount,
    correctCount: snapshot.correctCount,
    accuracy:
      snapshot.scoredAttemptCount > 0 ? snapshot.correctCount / snapshot.scoredAttemptCount : null,
    skills: TRAINING_SKILL_PRESENTATION.map((definition) => {
      const signal = snapshot.performance[definition.family];
      return {
        family: definition.family,
        competency: definition.competency,
        label: definition.label,
        masteryState: signal.masteryState,
        scoredAttemptCount: signal.scoredCount,
        recentAccuracy: signal.recentAccuracy,
        recent5Accuracy: signal.recent5Accuracy,
        exposureCount: signal.exposureCount,
        sessionCount: signal.scoredSessionCount,
        averageResponseTimeMs: signal.averageResponseTimeMs,
        lastActivityAt: signal.lastActivityAt,
        trend: signal.trend,
        mastery: signal.mastery,
      } satisfies TrainingProgressSkill;
    }),
  };
}
