import type { Prisma, PlatformRole } from "@prisma/client";
import { forbiddenError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
  ADAPTIVE_TRAINING_FAMILIES,
  type AdaptiveFamily,
  type AdaptiveSignal,
} from "./adaptive-selector.js";
import { loadTrainingPerformance, TRAINING_SKILL_PRESENTATION } from "./performance.js";
import { resolveTrainingRuntimeConfig } from "./runtime.js";

export const REVIEW_COOLDOWN_HOURS = 24;
const REVIEW_COOLDOWN_MS = REVIEW_COOLDOWN_HOURS * 60 * 60 * 1000;

export type ReviewActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

export type ReviewReason =
  | "MASTERY_NEEDS_REVIEW"
  | "CONSECUTIVE_FAILURE"
  | "LOW_ACCURACY"
  | "OVERDUE_LOW_PERFORMANCE"
  | "INSUFFICIENT_MASTERY"
  | "OLDER_ACTIVITY";

export type ReviewPriority = "CRITICAL" | "HIGH" | "STANDARD";

export interface ReviewItem {
  skillId: string;
  skillName: string;
  skillCode: string;
  family: AdaptiveFamily;
  competency: string;
  difficulty: "FOUNDATION" | "DEVELOPING" | "CHALLENGING";
  templateVersionId: string;
  templateTitle: string;
  templateVersion: number;
  lastAttemptAt: Date;
  accuracy: number | null;
  priority: ReviewPriority;
  reason: ReviewReason;
}

export interface StudentReviewResponse {
  mode: "REVIEW";
  available: boolean;
  cooldownHours: number;
  items: ReviewItem[];
  blocked: {
    cooldown: number;
    activeSession: number;
    insufficientVariation: number;
    noPublishedSource: number;
  };
}

type ReviewCandidateRow = {
  id: string;
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  config: Prisma.JsonValue | null;
  template: { id: string; title: string; skillId: string | null; tenantId: string | null };
  contents: Array<{ contentVersionId: string }>;
  questions: Array<{ questionVersionId: string }>;
};

type CompletedSourceRow = {
  id: string;
  templateVersionId: string;
  completedAt: Date | null;
  templateVersion: {
    config: Prisma.JsonValue | null;
    contents: Array<{ contentVersionId: string }>;
    questions: Array<{ questionVersionId: string }>;
  };
};

type CandidateSearchOptions = {
  excludedTemplateVersionIds?: ReadonlySet<string>;
};

export function isReviewEligible(lastActivityAt: Date | null, now: Date): boolean {
  return Boolean(lastActivityAt && lastActivityAt.getTime() <= now.getTime() - REVIEW_COOLDOWN_MS);
}

function isAdaptiveFamily(value: string): value is AdaptiveFamily {
  return (ADAPTIVE_TRAINING_FAMILIES as readonly string[]).includes(value);
}

function isFiniteDate(value: Date | string | null): value is Date | string {
  return value !== null && Number.isFinite(new Date(value).getTime());
}

export function reviewReasonForSignal(
  signal: Pick<
    AdaptiveSignal,
    | "masteryState"
    | "consecutiveFailures"
    | "recent5Accuracy"
    | "accuracy"
    | "scoredCount"
    | "mastery"
    | "lastActivityAt"
  >,
  now: Date,
): ReviewReason | null {
  if (signal.masteryState === "NEEDS_REVIEW") return "MASTERY_NEEDS_REVIEW";
  if (signal.consecutiveFailures >= 2) return "CONSECUTIVE_FAILURE";
  if (signal.recent5Accuracy !== null && signal.recent5Accuracy < 0.6) {
    return "LOW_ACCURACY";
  }
  if (!isFiniteDate(signal.lastActivityAt)) return null;
  if (!isReviewEligible(new Date(signal.lastActivityAt), now)) return null;
  if (signal.accuracy !== null && signal.accuracy < 0.75) return "OVERDUE_LOW_PERFORMANCE";
  if (signal.scoredCount > 0 && !signal.mastery) return "INSUFFICIENT_MASTERY";
  return null;
}

export function priorityForReviewReason(reason: ReviewReason): ReviewPriority {
  if (reason === "MASTERY_NEEDS_REVIEW") return "CRITICAL";
  if (reason === "CONSECUTIVE_FAILURE" || reason === "LOW_ACCURACY") return "HIGH";
  return "STANDARD";
}

function priorityRank(priority: ReviewPriority): number {
  return priority === "CRITICAL" ? 0 : priority === "HIGH" ? 1 : 2;
}

export function sortReviewItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((left, right) => {
    const priority = priorityRank(left.priority) - priorityRank(right.priority);
    if (priority !== 0) return priority;
    const accuracy = (left.accuracy ?? 1) - (right.accuracy ?? 1);
    if (accuracy !== 0) return accuracy;
    const age = left.lastAttemptAt.getTime() - right.lastAttemptAt.getTime();
    if (age !== 0) return age;
    const family = left.family.localeCompare(right.family);
    if (family !== 0) return family;
    return left.templateVersionId.localeCompare(right.templateVersionId);
  });
}

function sourceFingerprint(source: {
  contents: Array<{ contentVersionId: string }>;
  questions: Array<{ questionVersionId: string }>;
}): string {
  const contentIds = source.contents.map((item) => item.contentVersionId).sort();
  const questionIds = source.questions.map((item) => item.questionVersionId).sort();
  return `content:${contentIds.join(",")}|questions:${questionIds.join(",")}`;
}

function candidateOrder(left: ReviewCandidateRow, right: ReviewCandidateRow): number {
  const leftDate = left.publishedAt?.getTime() ?? left.createdAt.getTime();
  const rightDate = right.publishedAt?.getTime() ?? right.createdAt.getTime();
  if (leftDate !== rightDate) return leftDate - rightDate;
  if (left.version !== right.version) return left.version - right.version;
  return left.id.localeCompare(right.id);
}

function requireTenant(actor: ReviewActor): string {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw forbiddenError("Bu uç yalnızca öğrencilere açıktır");
  }
  return actor.tenantId;
}

function resolveCandidateFamily(config: Prisma.JsonValue | null): {
  family: AdaptiveFamily;
  competency: string;
  difficulty: ReviewItem["difficulty"];
} | null {
  const resolved = resolveTrainingRuntimeConfig("TRAINING", config);
  if (resolved.status !== "READY" || !isAdaptiveFamily(resolved.config.family)) return null;
  return {
    family: resolved.config.family,
    competency: resolved.config.competency,
    difficulty: resolved.config.difficulty,
  };
}

async function loadReviewCandidates(tenantId: string): Promise<ReviewCandidateRow[]> {
  const rows = await prisma.exerciseTemplateVersion.findMany({
    where: {
      status: "PUBLISHED",
      template: {
        status: "PUBLISHED",
        deletedAt: null,
        OR: [{ tenantId: null }, { tenantId }],
      },
      contents: {
        some: {
          contentVersion: {
            status: "PUBLISHED",
            content: { status: "PUBLISHED", deletedAt: null },
          },
        },
      },
      questions: {
        some: {
          questionVersion: {
            status: "PUBLISHED",
            question: { status: "PUBLISHED", deletedAt: null },
          },
        },
      },
    },
    select: {
      id: true,
      version: true,
      publishedAt: true,
      createdAt: true,
      config: true,
      template: { select: { id: true, title: true, skillId: true, tenantId: true } },
      contents: { select: { contentVersionId: true } },
      questions: { select: { questionVersionId: true } },
    },
    orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return rows.filter((row): row is ReviewCandidateRow =>
    Boolean(resolveCandidateFamily(row.config)),
  );
}

async function loadCompletedSources(actor: ReviewActor, tenantId: string) {
  return (await prisma.exerciseSession.findMany({
    where: {
      studentId: actor.userId,
      tenantId,
      status: "COMPLETED",
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
      assignmentId: null,
      assessmentId: null,
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      templateVersionId: true,
      completedAt: true,
      templateVersion: {
        select: {
          config: true,
          contents: { select: { contentVersionId: true } },
          questions: { select: { questionVersionId: true } },
        },
      },
    },
  })) as CompletedSourceRow[];
}

function latestSourceByFamily(sources: readonly CompletedSourceRow[]) {
  const result = new Map<AdaptiveFamily, CompletedSourceRow>();
  for (const source of sources) {
    const resolved = resolveCandidateFamily(source.templateVersion.config);
    if (resolved && !result.has(resolved.family)) result.set(resolved.family, source);
  }
  return result;
}

function chooseCandidate(
  candidates: readonly ReviewCandidateRow[],
  family: AdaptiveFamily,
  latestSource: CompletedSourceRow | undefined,
  activeTemplateVersionIds: ReadonlySet<string>,
  recentExposureIds: ReadonlySet<string>,
  excludedTemplateVersionIds: ReadonlySet<string>,
): ReviewCandidateRow | null {
  const latestFingerprint = latestSource ? sourceFingerprint(latestSource.templateVersion) : null;
  return (
    [...candidates]
      .filter((candidate) => resolveCandidateFamily(candidate.config)?.family === family)
      .sort(candidateOrder)
      .find(
        (candidate) =>
          !activeTemplateVersionIds.has(candidate.id) &&
          !recentExposureIds.has(candidate.id) &&
          !excludedTemplateVersionIds.has(candidate.id) &&
          candidate.id !== latestSource?.templateVersionId &&
          sourceFingerprint(candidate) !== latestFingerprint,
      ) ?? null
  );
}

export async function findReviewCandidates(
  actor: ReviewActor,
  options: CandidateSearchOptions = {},
): Promise<{ items: ReviewItem[]; blocked: StudentReviewResponse["blocked"] }> {
  const tenantId = requireTenant(actor);
  const snapshot = await loadTrainingPerformance({ ...actor, tenantId });
  const [sources, activeSessions, candidates] = await Promise.all([
    loadCompletedSources(actor, tenantId),
    prisma.exerciseSession.findMany({
      where: { studentId: actor.userId, tenantId, status: "IN_PROGRESS" },
      select: { templateVersionId: true },
    }),
    loadReviewCandidates(tenantId),
  ]);

  const latestByFamily = latestSourceByFamily(sources);
  const activeIds = new Set(activeSessions.map((session) => session.templateVersionId));
  const excludedIds = options.excludedTemplateVersionIds ?? new Set<string>();
  const blocked: StudentReviewResponse["blocked"] = {
    cooldown: 0,
    activeSession: 0,
    insufficientVariation: 0,
    noPublishedSource: 0,
  };
  const items: ReviewItem[] = [];

  for (const definition of TRAINING_SKILL_PRESENTATION) {
    const signal = snapshot.performance[definition.family];
    const reason = reviewReasonForSignal(signal, new Date());
    if (!reason) {
      if (signal.lastActivityAt) blocked.cooldown += 1;
      continue;
    }

    const latestSource = latestByFamily.get(definition.family);
    const candidate = chooseCandidate(
      candidates,
      definition.family,
      latestSource,
      activeIds,
      new Set(signal.recentExposureIds),
      excludedIds,
    );
    if (!candidate) {
      const familyCandidates = candidates.filter(
        (entry) => resolveCandidateFamily(entry.config)?.family === definition.family,
      );
      if (familyCandidates.some((entry) => activeIds.has(entry.id))) blocked.activeSession += 1;
      else if (latestSource) blocked.insufficientVariation += 1;
      else blocked.noPublishedSource += 1;
      continue;
    }

    const resolved = resolveCandidateFamily(candidate.config);
    if (!resolved) continue;
    const lastAttemptAt = isFiniteDate(signal.lastActivityAt)
      ? new Date(signal.lastActivityAt)
      : new Date(0);
    items.push({
      skillId: candidate.template.skillId ?? "",
      skillName: definition.label,
      skillCode: definition.competency,
      family: definition.family,
      competency: resolved.competency,
      difficulty: resolved.difficulty,
      templateVersionId: candidate.id,
      templateTitle: candidate.template.title,
      templateVersion: candidate.version,
      lastAttemptAt,
      accuracy: signal.accuracy,
      priority: priorityForReviewReason(reason),
      reason,
    });
  }

  return { items: sortReviewItems(items), blocked };
}

export async function getStudentReview(actor: ReviewActor): Promise<StudentReviewResponse> {
  const result = await findReviewCandidates(actor);
  return {
    mode: "REVIEW",
    available: result.items.length > 0,
    cooldownHours: REVIEW_COOLDOWN_HOURS,
    items: result.items,
    blocked: result.blocked,
  };
}

export async function findBestReviewCandidate(
  actor: ReviewActor,
  excludedTemplateVersionIds: ReadonlySet<string> = new Set(),
): Promise<ReviewItem | null> {
  const result = await findReviewCandidates(actor, { excludedTemplateVersionIds });
  return result.items[0] ?? null;
}
