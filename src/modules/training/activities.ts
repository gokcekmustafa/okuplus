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

const TRAINING_DIFFICULTY_ORDER = {
  FOUNDATION: 0,
  DEVELOPING: 1,
  CHALLENGING: 2,
} as const;

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

export type TrainingActivityPackageStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";

export type TrainingActivityPackage = {
  packageNumber: number;
  templateVersionId: string;
  templateVersionIds: string[];
  difficulty: keyof typeof TRAINING_DIFFICULTY_ORDER;
  questionCount: number;
};

// A package is a unique published question/content graph. Editorial versions
// with the same graph are aliases of one package, so publishing a duplicate
// revision cannot create fake extra progress for the student.

export type TrainingActivityPackageProgress = {
  completedPackages: number;
  totalPackages: number;
  currentPackageNumber: number | null;
  currentPackageStatus: TrainingActivityPackageStatus | null;
  currentSessionId: string | null;
  packages: Array<{
    packageNumber: number;
    difficulty: TrainingActivityPackage["difficulty"];
    questionCount: number;
    status: TrainingActivityPackageStatus;
    sessionId: string | null;
  }>;
};

export type TrainingActivitySessionSnapshot = {
  id: string;
  templateVersionId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  averageScore: number | null;
  attemptCount: number;
  lastActivityAt: string;
  completedAt: string | null;
};

type ActivityActor = TrainingActor & { tenantId: string; platformRole: null };

type LegacyActivityProgress = {
  sessionId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  averageScore: number | null;
  attemptCount: number;
  lastActivityAt: string;
  completedAt: string | null;
};

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

function graphSignature(graph: Awaited<ReturnType<typeof loadTrainingRuntimeGraph>>): string {
  return JSON.stringify(
    graph.questions.map((question) => ({
      contentVersionId: question.contentVersionId,
      questionVersionId: question.questionVersionId,
    })),
  );
}

function packageSortValue(value: Date | null): number {
  return value?.getTime() ?? 0;
}

async function availableActivityPackages(actor: ActivityActor) {
  const rows = await prisma.exerciseTemplateVersion.findMany({
    where: visibleTemplateWhere(actor),
    select: { id: true, version: true, publishedAt: true, config: true },
    orderBy: [{ publishedAt: "asc" }, { version: "asc" }, { id: "asc" }],
  });
  const candidatesByFamily = new Map<
    string,
    Array<{ id: string; version: number; publishedAt: Date | null; config: unknown }>
  >();
  for (const row of rows) {
    const resolved = resolveTrainingRuntimeConfig("TRAINING", row.config);
    if (resolved.status !== "READY") continue;
    if (!TRAINING_ACTIVITY_CATALOG.some((activity) => activity.family === resolved.config.family)) {
      continue;
    }
    const candidates = candidatesByFamily.get(resolved.config.family) ?? [];
    candidates.push(row);
    candidatesByFamily.set(resolved.config.family, candidates);
  }

  const available = new Map<TrainingActivityId, TrainingActivityPackage[]>();
  await Promise.all(
    TRAINING_ACTIVITY_CATALOG.map(async (activity) => {
      const validCandidates: Array<{
        templateVersionId: string;
        difficulty: TrainingActivityPackage["difficulty"];
        publishedAt: Date | null;
        version: number;
        signature: string;
        questionCount: number;
      }> = [];
      for (const candidate of candidatesByFamily.get(activity.family) ?? []) {
        try {
          const graph = await loadTrainingRuntimeGraph(candidate.id, actor);
          const resolved = resolveTrainingRuntimeConfig("TRAINING", candidate.config);
          if (resolved.status !== "READY") continue;
          validCandidates.push({
            templateVersionId: candidate.id,
            difficulty: resolved.config.difficulty,
            publishedAt: candidate.publishedAt,
            version: candidate.version,
            signature: graphSignature(graph),
            questionCount: graph.questions.length,
          });
        } catch {
          // Yayınlanmış ama eksik/bozuk graph öğrenciye paket olarak gösterilmez.
        }
      }

      validCandidates.sort((left, right) => {
        const byDifficulty =
          TRAINING_DIFFICULTY_ORDER[left.difficulty] - TRAINING_DIFFICULTY_ORDER[right.difficulty];
        if (byDifficulty !== 0) return byDifficulty;
        const byPublishedAt =
          packageSortValue(left.publishedAt) - packageSortValue(right.publishedAt);
        if (byPublishedAt !== 0) return byPublishedAt;
        if (left.version !== right.version) return left.version - right.version;
        return left.templateVersionId.localeCompare(right.templateVersionId);
      });

      const packages: TrainingActivityPackage[] = [];
      const packageBySignature = new Map<string, TrainingActivityPackage>();
      for (const candidate of validCandidates) {
        const existing = packageBySignature.get(candidate.signature);
        if (existing) {
          existing.templateVersionIds.push(candidate.templateVersionId);
          continue;
        }
        const activityPackage = {
          packageNumber: packages.length + 1,
          templateVersionId: candidate.templateVersionId,
          templateVersionIds: [candidate.templateVersionId],
          difficulty: candidate.difficulty,
          questionCount: candidate.questionCount,
        } satisfies TrainingActivityPackage;
        packages.push(activityPackage);
        packageBySignature.set(candidate.signature, activityPackage);
      }
      available.set(activity.id, packages);
    }),
  );
  return available;
}

function activityIdFromDeviceInfo(value: Prisma.JsonValue | null): TrainingActivityId | null {
  if (!isIndependentTrainingSession(value) || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const activityId = (value as { activityId?: unknown }).activityId;
  if (typeof activityId !== "string") return null;
  return findTrainingActivity(activityId)?.id ?? null;
}

function averageScoreFromSummary(value: Prisma.JsonValue | null): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const averageScore = (value as { averageScore?: unknown }).averageScore;
  return typeof averageScore === "number" && Number.isFinite(averageScore) ? averageScore : null;
}

export function deriveActivityPackageProgress(
  packages: readonly TrainingActivityPackage[],
  sessions: readonly TrainingActivitySessionSnapshot[],
): TrainingActivityPackageProgress {
  const packageStates = packages.map((activityPackage, index) => {
    const packageSessions = sessions.filter((session) =>
      activityPackage.templateVersionIds.includes(session.templateVersionId),
    );
    const completed = packageSessions.find((session) => session.status === "COMPLETED") ?? null;
    const inProgress = packageSessions.find((session) => session.status === "IN_PROGRESS") ?? null;
    const priorIncomplete = packages.slice(0, index).some((priorPackage) => {
      const priorSessions = sessions.filter((session) =>
        priorPackage.templateVersionIds.includes(session.templateVersionId),
      );
      return !priorSessions.some((session) => session.status === "COMPLETED");
    });
    const status: TrainingActivityPackageStatus = completed
      ? "COMPLETED"
      : inProgress
        ? "IN_PROGRESS"
        : priorIncomplete
          ? "LOCKED"
          : "AVAILABLE";
    return {
      packageNumber: activityPackage.packageNumber,
      difficulty: activityPackage.difficulty,
      questionCount: activityPackage.questionCount,
      status,
      sessionId: inProgress?.id ?? completed?.id ?? null,
    };
  });

  const firstIncompleteIndex = packageStates.findIndex((item) => item.status !== "COMPLETED");
  const currentIndex =
    firstIncompleteIndex === -1 ? packageStates.length - 1 : firstIncompleteIndex;
  const current = currentIndex >= 0 ? packageStates[currentIndex] : null;
  return {
    completedPackages: packageStates.filter((item) => item.status === "COMPLETED").length,
    totalPackages: packageStates.length,
    currentPackageNumber: current?.packageNumber ?? null,
    currentPackageStatus: current?.status ?? null,
    currentSessionId: current?.status === "IN_PROGRESS" ? current.sessionId : null,
    packages: packageStates,
  };
}

async function loadActivityProgress(
  actor: ActivityActor,
  packagesByActivity: Map<TrainingActivityId, TrainingActivityPackage[]>,
) {
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
    select: {
      id: true,
      templateVersionId: true,
      status: true,
      deviceInfo: true,
      scoreSummary: true,
      startedAt: true,
      completedAt: true,
      _count: { select: { attempts: true } },
    },
  });

  const sessionsByActivity = new Map<TrainingActivityId, TrainingActivitySessionSnapshot[]>();
  for (const row of rows) {
    const activityId = activityIdFromDeviceInfo(row.deviceInfo);
    if (!activityId) continue;
    if (row.status !== "IN_PROGRESS" && row.status !== "COMPLETED") continue;
    const activityPackages = packagesByActivity.get(activityId) ?? [];
    if (
      !activityPackages.some((activityPackage) =>
        activityPackage.templateVersionIds.includes(row.templateVersionId),
      )
    ) {
      continue;
    }
    const sessions = sessionsByActivity.get(activityId) ?? [];
    sessions.push({
      id: row.id,
      templateVersionId: row.templateVersionId,
      status: row.status,
      averageScore: averageScoreFromSummary(row.scoreSummary),
      attemptCount: row._count.attempts,
      lastActivityAt: (row.completedAt ?? row.startedAt).toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    });
    sessionsByActivity.set(activityId, sessions);
  }
  return new Map(
    TRAINING_ACTIVITY_CATALOG.map((activity) => {
      const sessions = sessionsByActivity.get(activity.id) ?? [];
      sessions.sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
      const packageProgress = deriveActivityPackageProgress(
        packagesByActivity.get(activity.id) ?? [],
        sessions,
      );
      const currentSession = packageProgress.currentSessionId
        ? (sessions.find((session) => session.id === packageProgress.currentSessionId) ?? null)
        : null;
      return [
        activity.id,
        {
          packageProgress,
          legacyProgress: currentSession
            ? ({
                sessionId: currentSession.id,
                status: currentSession.status,
                averageScore: currentSession.averageScore,
                attemptCount: currentSession.attemptCount,
                lastActivityAt: currentSession.lastActivityAt,
                completedAt: currentSession.completedAt,
              } satisfies LegacyActivityProgress)
            : null,
        },
      ] as const;
    }),
  );
}

export function findTrainingActivity(activityId: string) {
  return TRAINING_ACTIVITY_CATALOG.find((activity) => activity.id === activityId);
}

export async function listTrainingActivities(actor: TrainingActor) {
  assertActivityStudent(actor);
  const packagesByActivity = await availableActivityPackages(actor);
  const progress = await loadActivityProgress(actor, packagesByActivity);
  return {
    activities: TRAINING_ACTIVITY_CATALOG.map((activity) => {
      const packages = packagesByActivity.get(activity.id) ?? [];
      const activityProgress = progress.get(activity.id);
      return {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        durationLabel: activity.durationLabel,
        estimatedDurationSeconds: activity.estimatedDurationSeconds,
        competency: activity.competency,
        available: packages.length > 0,
        packageProgress: activityProgress?.packageProgress ?? null,
        progress: activityProgress?.legacyProgress ?? null,
      };
    }),
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
  const packagesByActivity = await availableActivityPackages(actor);
  const packages = packagesByActivity.get(activity.id) ?? [];
  if (packages.length === 0) {
    throw notFoundError("Bu aktivite şu anda kullanıma hazır değil");
  }
  const progress = await loadActivityProgress(actor, packagesByActivity);
  const packageProgress = progress.get(activity.id)?.packageProgress;
  const currentPackageNumber = packageProgress?.currentPackageNumber ?? 1;
  const currentPackage = packages[currentPackageNumber - 1] ?? packages[packages.length - 1];
  if (!currentPackage) throw notFoundError("Bu aktivite için yayınlanmış paket bulunamadı");
  if (packageProgress?.currentPackageStatus === "IN_PROGRESS" && packageProgress.currentSessionId) {
    return { sessionId: packageProgress.currentSessionId, isNew: false };
  }
  return startPersonalExercise(actor, {
    templateVersionId: currentPackage.templateVersionId,
    clientSessionId,
    independentTraining: true,
    independentTrainingActivityId: activity.id,
  });
}
