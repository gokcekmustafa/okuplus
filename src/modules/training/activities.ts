import type { Prisma } from "@prisma/client";
import { validationError, notFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { startPersonalExercise } from "../student-learning/service.js";
import {
  loadTrainingRuntimeGraph,
  resolveTrainingRuntimeConfig,
  type TrainingActor,
} from "./runtime.js";
import { isIndependentTrainingSession } from "./session-origin.js";

export const TRAINING_ACTIVITY_CATALOG = [
  {
    id: "hizli-bul",
    title: "Hızlı Bul",
    description: "Metindeki hedef bilgiyi olabildiğince hızlı bul.",
    durationLabel: "Yaklaşık 1 dk",
    estimatedDurationSeconds: 60,
    family: "ATTENTION_BURST",
    competency: "FAST_ATTENTION",
  },
  {
    id: "kelime-avi",
    title: "Kelime Avı",
    description: "Metindeki hedef kelimeleri ve anlam bağlarını yakala.",
    durationLabel: "Yaklaşık 1 dk",
    estimatedDurationSeconds: 60,
    family: "RAPID_RECOGNITION",
    competency: "FAST_RECOGNITION",
  },
  {
    id: "anlami-yakala",
    title: "Anlamı Yakala",
    description: "Kısa parçanın ne anlattığını bul.",
    durationLabel: "Yaklaşık 2 dk",
    estimatedDurationSeconds: 120,
    family: "MAIN_IDEA",
    competency: "RC_MAIN_IDEA",
  },
  {
    id: "hafizada-tut",
    title: "Hafızada Tut",
    description: "Kısa bilgiyi oku, sonra hatırladığını yokla.",
    durationLabel: "Yaklaşık 1 dk",
    estimatedDurationSeconds: 60,
    family: "DETAIL_EVIDENCE",
    competency: "RC_DETAIL",
  },
  {
    id: "siralamayi-bul",
    title: "Sıralamayı Bul",
    description: "Cümlelerdeki anlam akışını ve doğru sırayı fark et.",
    durationLabel: "Yaklaşık 2 dk",
    estimatedDurationSeconds: 120,
    family: "PHRASE_CHUNKING",
    competency: "FAST_CHUNKING",
  },
  {
    id: "cikarimi-yakala",
    title: "Çıkarımı Yakala",
    description: "Metnin doğrudan söylemediği ama desteklediği sonucu bul.",
    durationLabel: "Yaklaşık 2 dk",
    estimatedDurationSeconds: 120,
    family: "INFERENCE",
    competency: "RC_INFERENCE",
  },
] as const;

export type TrainingActivityId = (typeof TRAINING_ACTIVITY_CATALOG)[number]["id"];

type ActivityActor = TrainingActor & { tenantId: string; platformRole: null };

function assertActivityStudent(actor: TrainingActor): asserts actor is ActivityActor {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw validationError("Bu uç yalnızca öğrencilere açıktır");
  }
}

function visibleTemplateWhere(actor: ActivityActor) {
  return {
    status: "PUBLISHED" as const,
    template: {
      deletedAt: null,
      status: "PUBLISHED" as const,
      OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
    },
  };
}

async function availableTemplateIds(actor: ActivityActor) {
  const rows = await prisma.exerciseTemplateVersion.findMany({
    where: visibleTemplateWhere(actor),
    select: { id: true, config: true },
    orderBy: [{ publishedAt: "desc" }, { version: "desc" }, { id: "asc" }],
  });
  const candidatesByFamily = new Map<string, string[]>();
  for (const row of rows) {
    const resolved = resolveTrainingRuntimeConfig("TRAINING", row.config);
    if (resolved.status !== "READY") continue;
    if (!TRAINING_ACTIVITY_CATALOG.some((activity) => activity.family === resolved.config.family)) {
      continue;
    }
    const candidates = candidatesByFamily.get(resolved.config.family) ?? [];
    candidates.push(row.id);
    candidatesByFamily.set(resolved.config.family, candidates);
  }

  const available = new Map<string, string>();
  await Promise.all(
    TRAINING_ACTIVITY_CATALOG.map(async (activity) => {
      for (const templateVersionId of candidatesByFamily.get(activity.family) ?? []) {
        try {
          await loadTrainingRuntimeGraph(templateVersionId, actor);
          available.set(activity.id, templateVersionId);
          return;
        } catch {
          // En yeni kayıt eksik/bozuksa aynı ailenin sonraki yayınlanmış
          // grafiğini dene; öğrenciye bozuk bir aktivite gösterme.
        }
      }
    }),
  );
  return available;
}

function activityIdFromDeviceInfo(value: Prisma.JsonValue | null): string | null {
  if (!isIndependentTrainingSession(value) || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const activityId = (value as { activityId?: unknown }).activityId;
  return typeof activityId === "string" && findTrainingActivity(activityId) ? activityId : null;
}

function averageScoreFromSummary(value: Prisma.JsonValue | null): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const averageScore = (value as { averageScore?: unknown }).averageScore;
  return typeof averageScore === "number" && Number.isFinite(averageScore) ? averageScore : null;
}

async function loadActivityProgress(actor: ActivityActor) {
  const rows = await prisma.exerciseSession.findMany({
    where: {
      tenantId: actor.tenantId,
      studentId: actor.userId,
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
      assignmentId: null,
      assessmentId: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      deviceInfo: true,
      scoreSummary: true,
      startedAt: true,
      completedAt: true,
      _count: { select: { attempts: true } },
    },
  });

  const progress = new Map<
    string,
    {
      sessionId: string;
      status: "IN_PROGRESS" | "COMPLETED";
      averageScore: number | null;
      attemptCount: number;
      lastActivityAt: string;
      completedAt: string | null;
    }
  >();
  for (const row of rows) {
    const activityId = activityIdFromDeviceInfo(row.deviceInfo);
    if (!activityId || progress.has(activityId)) continue;
    if (row.status !== "IN_PROGRESS" && row.status !== "COMPLETED") continue;
    progress.set(activityId, {
      sessionId: row.id,
      status: row.status,
      averageScore: averageScoreFromSummary(row.scoreSummary),
      attemptCount: row._count.attempts,
      lastActivityAt: (row.completedAt ?? row.startedAt).toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    });
  }
  return progress;
}

export function findTrainingActivity(activityId: string) {
  return TRAINING_ACTIVITY_CATALOG.find((activity) => activity.id === activityId);
}

export async function listTrainingActivities(actor: TrainingActor) {
  assertActivityStudent(actor);
  const [available, progress] = await Promise.all([
    availableTemplateIds(actor),
    loadActivityProgress(actor),
  ]);
  return {
    activities: TRAINING_ACTIVITY_CATALOG.map((activity) => ({
      id: activity.id,
      title: activity.title,
      description: activity.description,
      durationLabel: activity.durationLabel,
      estimatedDurationSeconds: activity.estimatedDurationSeconds,
      competency: activity.competency,
      available: available.has(activity.id),
      progress: progress.get(activity.id) ?? null,
    })),
  };
}

export async function startTrainingActivity(
  actor: TrainingActor,
  activityId: string,
  clientSessionId?: string,
) {
  assertActivityStudent(actor);
  const activity = findTrainingActivity(activityId);
  if (!activity) throw notFoundError("Antrenman aktivitesi bulunamadı");
  const templateVersionId = (await availableTemplateIds(actor)).get(activity.id);
  if (!templateVersionId) {
    throw notFoundError("Bu aktivite şu anda kullanıma hazır değil");
  }
  return startPersonalExercise(actor, {
    templateVersionId,
    clientSessionId,
    independentTraining: true,
    independentTrainingActivityId: activity.id,
  });
}
