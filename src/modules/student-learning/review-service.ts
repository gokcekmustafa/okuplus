import { randomUUID } from "node:crypto";
import type { PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { createExerciseSession } from "../sessions/service.js";
import { forbiddenError, validationError } from "../../lib/errors.js";

/**
 * 8G-7 foundation policy.
 *
 * This is deliberately a conservative eligibility gate, not an interval
 * algorithm. A future ReviewSchedule can replace this policy without
 * changing the student-facing contract.
 */
export const REVIEW_COOLDOWN_HOURS = 24;
const REVIEW_COOLDOWN_MS = REVIEW_COOLDOWN_HOURS * 60 * 60 * 1000;

type ReviewActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

type ProgressRow = {
  skillId: string;
  skill: { name: string; code: string };
  accuracy: number | null;
  lastAttemptAt: Date;
  attemptCount: number;
};

type SourceRow = {
  templateVersionId: string;
  completedAt: Date | null;
  templateVersion: {
    template: { skillId: string | null };
    contents: Array<{ contentVersionId: string }>;
    questions: Array<{
      questionVersionId: string;
      questionVersion: { question: { skillId: string | null } };
    }>;
  };
  attempts: Array<{
    isCorrect: boolean | null;
    rawScore: number | null;
    answeredAt: Date;
    questionVersion: { question: { skillId: string | null } };
  }>;
};

type CandidateRow = {
  id: string;
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  template: { id: string; title: string; skillId: string | null; tenantId: string | null };
  contents: Array<{ contentVersionId: string }>;
  questions: Array<{ questionVersionId: string }>;
};

export type ReviewPriority = "HIGH" | "STANDARD";

export interface ReviewItem {
  skillId: string;
  skillName: string;
  skillCode: string;
  templateVersionId: string;
  templateTitle: string;
  templateVersion: number;
  lastAttemptAt: Date;
  accuracy: number | null;
  priority: ReviewPriority;
  reason: "LOW_ACCURACY" | "OLDER_ACTIVITY";
}

export interface StudentReviewResponse {
  mode: "FOUNDATION";
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

export function isReviewEligible(lastAttemptAt: Date | null, now: Date): boolean {
  return Boolean(lastAttemptAt && lastAttemptAt.getTime() <= now.getTime() - REVIEW_COOLDOWN_MS);
}

export function sortReviewItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((left, right) => {
    const priority = (left.priority === "HIGH" ? 0 : 1) - (right.priority === "HIGH" ? 0 : 1);
    if (priority !== 0) return priority;
    const accuracy = (left.accuracy ?? 1) - (right.accuracy ?? 1);
    if (accuracy !== 0) return accuracy;
    const age = left.lastAttemptAt.getTime() - right.lastAttemptAt.getTime();
    if (age !== 0) return age;
    return left.skillName.localeCompare(right.skillName, "tr");
  });
}

function requireTenant(actor: ReviewActor): string {
  if (!actor.tenantId) throw forbiddenError("Aktif tenant context gerekli");
  return actor.tenantId;
}

function sourceFingerprint(source: {
  contents: Array<{ contentVersionId: string }>;
  questions: Array<{ questionVersionId: string }>;
}): string {
  const contentIds = source.contents.map((item) => item.contentVersionId).sort();
  const questionIds = source.questions.map((item) => item.questionVersionId).sort();
  return `content:${contentIds.join(",")}|questions:${questionIds.join(",")}`;
}

function sourceSkill(source: SourceRow): string | null {
  return (
    source.templateVersion.template.skillId ??
    source.templateVersion.questions
      .map((item) => item.questionVersion.question.skillId)
      .find((skillId): skillId is string => Boolean(skillId)) ??
    null
  );
}

/**
 * Returns only student-owned, tenant-scoped review candidates.
 *
 * The candidate must have:
 * - at least one attempted question in a completed personal session;
 * - at least the conservative 24-hour cooldown;
 * - an active, published template/content/question source;
 * - a materially different published template composition from the latest
 *   source, so one five-question set is not presented as endless review.
 */
export async function getStudentReview(actor: ReviewActor): Promise<StudentReviewResponse> {
  const tenantId = requireTenant(actor);
  const now = new Date();

  const [sourceRows, activeSessions] = await Promise.all([
    prisma.exerciseSession.findMany({
      where: {
        studentId: actor.userId,
        tenantId,
        status: "COMPLETED",
        context: "INDIVIDUAL",
        assignmentId: null,
        assessmentId: null,
      },
      orderBy: { completedAt: "desc" },
      select: {
        templateVersionId: true,
        completedAt: true,
        templateVersion: {
          select: {
            template: { select: { skillId: true } },
            contents: { select: { contentVersionId: true } },
            questions: {
              select: {
                questionVersionId: true,
                questionVersion: { select: { question: { select: { skillId: true } } } },
              },
            },
          },
        },
        attempts: {
          select: {
            isCorrect: true,
            rawScore: true,
            answeredAt: true,
            questionVersion: { select: { question: { select: { skillId: true } } } },
          },
        },
      },
    }),
    prisma.exerciseSession.findMany({
      where: { studentId: actor.userId, tenantId, status: "IN_PROGRESS" },
      select: { templateVersionId: true },
    }),
  ]);

  const metricsBySkill = new Map<
    string,
    { attemptCount: number; scoredCount: number; correctCount: number; lastAttemptAt: Date | null }
  >();
  for (const source of sourceRows) {
    const fallbackSkillId = sourceSkill(source);
    for (const attempt of source.attempts) {
      const skillId = attempt.questionVersion.question.skillId ?? fallbackSkillId;
      if (!skillId) continue;
      const metric = metricsBySkill.get(skillId) ?? {
        attemptCount: 0,
        scoredCount: 0,
        correctCount: 0,
        lastAttemptAt: null,
      };
      metric.attemptCount += 1;
      if (attempt.rawScore !== null) {
        metric.scoredCount += 1;
        if (attempt.isCorrect === true) metric.correctCount += 1;
      }
      if (!metric.lastAttemptAt || attempt.answeredAt > metric.lastAttemptAt)
        metric.lastAttemptAt = attempt.answeredAt;
      metricsBySkill.set(skillId, metric);
    }
  }

  const skillIds = [...metricsBySkill.keys()];
  const skillRows = skillIds.length
    ? await prisma.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const skillById = new Map(skillRows.map((skill) => [skill.id, skill]));
  const progressBySkill = new Map<string, ProgressRow>();
  for (const [skillId, metric] of metricsBySkill) {
    const skill = skillById.get(skillId);
    if (!skill || !metric.lastAttemptAt) continue;
    progressBySkill.set(skillId, {
      skillId,
      skill: { name: skill.name, code: skill.code },
      accuracy: metric.scoredCount > 0 ? metric.correctCount / metric.scoredCount : null,
      lastAttemptAt: metric.lastAttemptAt,
      attemptCount: metric.attemptCount,
    });
  }

  const latestSourceBySkill = new Map<string, SourceRow>();
  for (const source of sourceRows) {
    const skillId = sourceSkill(source);
    if (skillId && !latestSourceBySkill.has(skillId)) latestSourceBySkill.set(skillId, source);
  }

  const reviewSkillIds = [...progressBySkill.keys()];
  const candidateRows = reviewSkillIds.length
    ? await prisma.exerciseTemplateVersion.findMany({
        where: {
          status: "PUBLISHED",
          template: {
            status: "PUBLISHED",
            deletedAt: null,
            skillId: { in: reviewSkillIds },
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
          template: { select: { id: true, title: true, skillId: true, tenantId: true } },
          contents: { select: { contentVersionId: true } },
          questions: { select: { questionVersionId: true } },
        },
        orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const candidatesBySkill = new Map<string, CandidateRow[]>();
  for (const candidate of candidateRows) {
    const skillId = candidate.template.skillId;
    if (!skillId) continue;
    const rows = candidatesBySkill.get(skillId) ?? [];
    rows.push(candidate);
    candidatesBySkill.set(skillId, rows);
  }

  const activeTemplateIds = new Set(activeSessions.map((session) => session.templateVersionId));
  const blocked: StudentReviewResponse["blocked"] = {
    cooldown: 0,
    activeSession: 0,
    insufficientVariation: 0,
    noPublishedSource: 0,
  };
  const items: ReviewItem[] = [];

  for (const [skillId, progress] of progressBySkill) {
    if (progress.attemptCount < 1 || !progress.lastAttemptAt) {
      blocked.noPublishedSource += 1;
      continue;
    }
    if (!isReviewEligible(progress.lastAttemptAt, now)) {
      blocked.cooldown += 1;
      continue;
    }

    const latestSource = latestSourceBySkill.get(skillId);
    const candidates = candidatesBySkill.get(skillId) ?? [];
    if (!latestSource || candidates.length === 0) {
      blocked.noPublishedSource += 1;
      continue;
    }
    const latestFingerprint = sourceFingerprint(latestSource.templateVersion);
    const candidate = candidates.find(
      (item) =>
        item.id !== latestSource.templateVersionId &&
        sourceFingerprint(item) !== latestFingerprint &&
        !activeTemplateIds.has(item.id),
    );
    if (!candidate) {
      if (candidates.some((item) => activeTemplateIds.has(item.id))) blocked.activeSession += 1;
      else blocked.insufficientVariation += 1;
      continue;
    }

    const lowAccuracy = progress.accuracy !== null && progress.accuracy < 0.8;
    items.push({
      skillId,
      skillName: progress.skill.name,
      skillCode: progress.skill.code,
      templateVersionId: candidate.id,
      templateTitle: candidate.template.title,
      templateVersion: candidate.version,
      lastAttemptAt: progress.lastAttemptAt,
      accuracy: progress.accuracy,
      priority: lowAccuracy ? "HIGH" : "STANDARD",
      reason: lowAccuracy ? "LOW_ACCURACY" : "OLDER_ACTIVITY",
    });
  }

  return {
    mode: "FOUNDATION",
    available: items.length > 0,
    cooldownHours: REVIEW_COOLDOWN_HOURS,
    items: sortReviewItems(items),
    blocked,
  };
}

export async function startStudentReview(
  actor: ReviewActor,
  input: { skillId?: string; templateVersionId?: string; clientSessionId?: string },
) {
  const queue = await getStudentReview(actor);
  const item = queue.items.find(
    (candidate) =>
      (!input.skillId || candidate.skillId === input.skillId) &&
      (!input.templateVersionId || candidate.templateVersionId === input.templateVersionId),
  );
  if (!item) throw validationError("Bu review öğesi artık uygun değil");

  const session = await createExerciseSession(
    {
      studentId: actor.userId,
      templateVersionId: item.templateVersionId,
      clientSessionId: input.clientSessionId ?? `review-${randomUUID()}`,
      context: "INDIVIDUAL",
      sessionType: "PRACTICE",
    },
    actor,
  );
  return {
    mode: "REVIEW" as const,
    sessionId: session.id,
    isNew: session.status === "IN_PROGRESS",
    item,
  };
}
