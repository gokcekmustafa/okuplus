import type { PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import {
  ENTITLEMENT_FEATURES,
  entitlementLimitMessage,
  recordUsageInTransaction,
} from "../entitlements/index.js";
import { getStudentReview, type StudentReviewResponse } from "./review-service.js";

function todayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export interface TodayResponse {
  date: string;
  completedToday: number;
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  activeSession: {
    id: string;
    assignmentId: string | null;
    assessmentId: string | null;
    templateVersionId: string;
    startedAt: Date;
  } | null;
  nextAction: { type: string; label: string; id: string | null; title: string | null };
  recentActivity: Array<{ id: string; type: string; title: string; completedAt: Date | null }>;
  review: StudentReviewResponse | null;
}

export async function getToday(actor: {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}): Promise<TodayResponse> {
  const tenantId = actor.tenantId;
  if (!tenantId && !actor.platformRole) throw forbiddenError("Tenant gerekli");
  const now = new Date();
  const { start, end } = todayBounds(now);

  const [
    completedToday,
    activeSession,
    streak,
    pointsAgg,
    recentSessions,
    assignments,
    assessments,
    templateVersion,
    review,
  ] = await Promise.all([
    prisma.exerciseSession.count({
      where: {
        studentId: actor.userId,
        tenantId: tenantId ?? undefined,
        status: "COMPLETED",
        completedAt: { gte: start, lt: end },
      },
    }),
    prisma.exerciseSession.findFirst({
      where: { studentId: actor.userId, tenantId: tenantId ?? undefined, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        assignmentId: true,
        assessmentId: true,
        templateVersionId: true,
        startedAt: true,
      },
    }),
    prisma.studentStreak
      .findFirst({ where: { studentId: actor.userId, tenantId: tenantId ?? undefined } })
      .catch(() => null),
    prisma.pointEvent.aggregate({
      where: { studentId: actor.userId, tenantId: tenantId ?? undefined },
      _sum: { points: true },
    }),
    prisma.exerciseSession.findMany({
      where: { studentId: actor.userId, tenantId: tenantId ?? undefined, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: {
        id: true,
        assignmentId: true,
        assessmentId: true,
        templateVersionId: true,
        completedAt: true,
        templateVersion: { select: { template: { select: { title: true } } } },
      },
    }),
    // assignment candidate: ACTIVE assignment where student enrolled and no completed session
    (async () => {
      if (!tenantId) return null;
      const candidate = await prisma.assignment.findFirst({
        where: {
          tenantId,
          status: "ACTIVE",
          deletedAt: null,
          class: {
            deletedAt: null,
            enrollments: { some: { studentId: actor.userId, status: "ACTIVE", deletedAt: null } },
          },
          template: { deletedAt: null },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true },
      });
      if (!candidate) return null;
      const hasCompleted = await prisma.exerciseSession.count({
        where: { assignmentId: candidate.id, studentId: actor.userId, status: "COMPLETED" },
      });
      if (hasCompleted > 0) return null;
      return candidate;
    })(),
    // assessment candidate: PUBLISHED where tenant matches and no result
    (async () => {
      const where: Record<string, unknown> = { deletedAt: null, status: "PUBLISHED" as const };
      if (tenantId) (where as { OR: unknown[] }).OR = [{ tenantId: null }, { tenantId }];
      const candidate = await prisma.assessment.findFirst({
        where: where as never,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true },
      });
      if (!candidate) return null;
      const hasResult = await prisma.assessmentResult.count({
        where: { assessmentId: candidate.id, studentId: actor.userId },
      });
      if (hasResult > 0) return null;
      return candidate;
    })(),
    prisma.exerciseTemplateVersion.findFirst({
      where: {
        status: "PUBLISHED",
        template: {
          status: "PUBLISHED",
          OR: [{ tenantId: null }, { tenantId: tenantId ?? undefined }],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, template: { select: { title: true } } },
    }),
    tenantId ? getStudentReview(actor) : Promise.resolve(null),
  ]);

  let nextAction: TodayResponse["nextAction"];
  if (activeSession)
    nextAction = {
      type: "RESUME_SESSION",
      label: "Devam Et",
      id: activeSession.id,
      title: "Yarım kalan çalışma",
    };
  else if (assignments)
    nextAction = {
      type: "ASSIGNMENT_START",
      label: "Ödeve Başla",
      id: assignments.id,
      title: assignments.title,
    };
  else if (assessments)
    nextAction = {
      type: "ASSESSMENT_START",
      label: "Değerlendirmeye Başla",
      id: assessments.id,
      title: assessments.title,
    };
  else if (templateVersion)
    nextAction = {
      type: "PERSONAL_EXERCISE",
      label: "Çalışmaya Başla",
      id: templateVersion.id,
      title: templateVersion.template.title,
    };
  else nextAction = { type: "NO_CONTENT", label: "İçerik bekleniyor", id: null, title: null };

  const recentActivity = recentSessions.map((s) => ({
    id: s.id,
    type: s.assignmentId ? "ASSIGNMENT" : s.assessmentId ? "ASSESSMENT" : "EXERCISE",
    title: s.templateVersion.template.title,
    completedAt: s.completedAt,
  }));

  return {
    date: start.toISOString().slice(0, 10),
    completedToday,
    currentStreak: (streak as { currentDays: number } | null)?.currentDays ?? 0,
    longestStreak: (streak as { longestDays: number } | null)?.longestDays ?? 0,
    totalPoints: pointsAgg._sum.points ?? 0,
    activeSession: activeSession ?? null,
    nextAction,
    recentActivity,
    review,
  };
}

const SKILL_LABEL: Record<string, string> = {
  MAIN_IDEA: "Ana Fikri Bul",
  DETAIL: "Detayları Yakala",
  INFERENCE: "Çıkarım Yap",
  VOCABULARY: "Kelimeleri Keşfet",
  FACTUAL: "Bilgiyi Bul",
  COMPREHENSION: "Anlama Becerisi",
};

export async function getLearningPath(actor: {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}) {
  const tenantId = actor.tenantId;
  // parallel base data
  const [allSkills, studentProgress, level, today] = await Promise.all([
    prisma.skill.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true, code: true, name: true, category: true, displayOrder: true },
    }),
    prisma.studentProgress.findMany({
      where: { studentId: actor.userId, tenantId: tenantId ?? undefined },
      select: { skillId: true, sessionCount: true, accuracy: true },
    }),
    (async () => {
      const p = await prisma.studentProfile.findFirst({
        where: { studentId: actor.userId, tenantId: tenantId ?? undefined },
        select: { currentLevelId: true },
      });
      if (!p?.currentLevelId) return null;
      return prisma.level.findUnique({
        where: { id: p.currentLevelId },
        select: { id: true, code: true, name: true },
      });
    })(),
    getToday(actor).catch(() => null),
  ]);
  // filter out E2E/test skills (code containing E2E, LEARN, 8e)
  let skills = allSkills.filter(
    (s) => !/E2E|LEARN|8e-|LEARN_/i.test(s.code) && !/E2E/i.test(s.name),
  );
  // if no real skills, fallback to all (still filter obvious test ones) or use templates as nodes
  let useTemplateNodes = false;
  if (skills.length === 0) {
    skills = allSkills.filter((s) => !/E2E/i.test(s.code));
    if (skills.length === 0) useTemplateNodes = true;
  }
  const progressMap = new Map(studentProgress.map((p) => [p.skillId, p]));
  // fetch templates for skills
  const templatesBySkill = new Map<
    string,
    Array<{ id: string; title: string; templateVersionId: string }>
  >();
  if (!useTemplateNodes && skills.length > 0) {
    const templates = await prisma.exerciseTemplate.findMany({
      where: {
        status: "PUBLISHED",
        skillId: { in: skills.map((s) => s.id) },
        OR: [{ tenantId: null }, { tenantId: tenantId ?? undefined }] as never,
      },
      select: { id: true, skillId: true, title: true },
      orderBy: { createdAt: "desc" },
    });
    const tvs = await prisma.exerciseTemplateVersion.findMany({
      where: {
        status: "PUBLISHED",
        templateId: { in: templates.map((template) => template.id) },
      },
      select: { id: true, templateId: true },
      orderBy: { createdAt: "desc" },
    });
    const tvByTemplate = new Map<string, string>();
    for (const version of tvs) {
      if (!tvByTemplate.has(version.templateId)) tvByTemplate.set(version.templateId, version.id);
    }
    for (const template of templates) {
      if (!template.skillId) continue;
      const templateVersionId = tvByTemplate.get(template.id);
      if (!templateVersionId) continue;
      const items = templatesBySkill.get(template.skillId) ?? [];
      items.push({ id: template.id, title: template.title, templateVersionId });
      templatesBySkill.set(template.skillId, items);
    }
  }
  const nodes: Array<{
    id: string;
    type: string;
    code: string;
    label: string;
    status: "completed" | "active" | "available" | "locked";
    progress: { sessionCount: number; accuracy: number | null } | null;
    templateVersionId: string | null;
    isCurrent: boolean;
  }> = [];
  if (useTemplateNodes) {
    const tvs = await prisma.exerciseTemplateVersion.findMany({
      where: {
        status: "PUBLISHED",
        template: {
          status: "PUBLISHED",
          OR: [{ tenantId: null }, { tenantId: tenantId ?? undefined }] as never,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 7,
      select: { id: true, template: { select: { id: true, title: true, skillId: true } } },
    });
    // determine completed via sessions for each templateVersion
    const sessionCounts = await prisma.exerciseSession.groupBy({
      by: ["templateVersionId"],
      where: {
        studentId: actor.userId,
        tenantId: tenantId ?? undefined,
        status: "COMPLETED",
        templateVersionId: { in: tvs.map((v) => v.id) },
      },
      _count: { _all: true },
    });
    const completedSet = new Set(
      sessionCounts.filter((c) => c._count._all > 0).map((c) => c.templateVersionId),
    );
    let foundActive = false;
    for (const tv of tvs) {
      const isCompleted = completedSet.has(tv.id);
      let status: (typeof nodes)[number]["status"] = "locked";
      if (isCompleted) status = "completed";
      else if (!foundActive) {
        status = "active";
        foundActive = true;
      } else status = "available";
      const isCurrent =
        today?.nextAction?.id === tv.id ||
        (today?.activeSession?.templateVersionId === tv.id && status === "active");
      nodes.push({
        id: tv.id,
        type: "TEMPLATE",
        code: tv.template.id,
        label: tv.template.title,
        status,
        progress: isCompleted ? { sessionCount: 1, accuracy: null } : null,
        templateVersionId: tv.id,
        isCurrent: isCurrent || status === "active",
      });
    }
    if (nodes.length === 0) {
      nodes.push({
        id: "empty",
        type: "EMPTY",
        code: "EMPTY",
        label: "Yakında yeni içerikler",
        status: "locked",
        progress: null,
        templateVersionId: null,
        isCurrent: false,
      });
    }
  } else {
    // skill-based nodes; a multi-content skill becomes one path node per template version.
    const hasMultipleTemplateNodes = Array.from(templatesBySkill.values()).some(
      (templates) => templates.length > 1,
    );
    let activeSkillId: string | null = null;
    if (today?.activeSession?.templateVersionId) {
      const atv = await prisma.exerciseTemplateVersion
        .findUnique({
          where: { id: today.activeSession.templateVersionId },
          select: { template: { select: { skillId: true } } },
        })
        .catch(() => null);
      activeSkillId = atv?.template.skillId ?? null;
    }
    if (hasMultipleTemplateNodes) {
      const templateVersionIds = Array.from(templatesBySkill.values())
        .flat()
        .map((template) => template.templateVersionId);
      const completedTemplates = await prisma.exerciseSession.groupBy({
        by: ["templateVersionId"],
        where: {
          studentId: actor.userId,
          tenantId: tenantId ?? undefined,
          status: "COMPLETED",
          templateVersionId: { in: templateVersionIds },
        },
        _count: { _all: true },
      });
      const completedSet = new Set(
        completedTemplates.filter((row) => row._count._all > 0).map((row) => row.templateVersionId),
      );
      let foundActive = false;
      for (const skill of skills) {
        const templates = templatesBySkill.get(skill.id) ?? [];
        for (const [index, template] of templates.entries()) {
          const isCompleted = completedSet.has(template.templateVersionId);
          let status: (typeof nodes)[number]["status"] = "locked";
          if (isCompleted) status = "completed";
          else if (!foundActive) {
            status = "active";
            foundActive = true;
          } else status = "available";
          const isCurrent =
            today?.nextAction?.id === template.templateVersionId ||
            today?.activeSession?.templateVersionId === template.templateVersionId ||
            (activeSkillId === skill.id && status === "active");
          nodes.push({
            id: template.templateVersionId,
            type: "CONTENT",
            code: `${skill.code}-${index + 1}`,
            label: template.title,
            status,
            progress: isCompleted ? { sessionCount: 1, accuracy: null } : null,
            templateVersionId: template.templateVersionId,
            isCurrent,
          });
        }
      }
      if (
        !nodes.some((node) => node.status === "active") &&
        nodes.some((node) => node.status === "available")
      ) {
        const firstAvailable = nodes.find((node) => node.status === "available");
        if (firstAvailable) firstAvailable.status = "active";
      }
    } else {
      let foundActive = false;
      for (const s of skills) {
        const prog = progressMap.get(s.id);
        const isCompleted = !!prog && prog.sessionCount > 0;
        const template = templatesBySkill.get(s.id)?.[0];
        const hasTemplate = !!template;
        let status: (typeof nodes)[number]["status"] = "locked";
        if (isCompleted) status = "completed";
        else if (!foundActive && hasTemplate) {
          status = "active";
          foundActive = true;
        } else if (hasTemplate) status = "available";
        else status = "locked";
        let isCurrent = status === "active";
        if (activeSkillId && activeSkillId === s.id) isCurrent = true;
        nodes.push({
          id: s.id,
          type: "SKILL",
          code: s.code,
          label: SKILL_LABEL[s.category as keyof typeof SKILL_LABEL] || s.name,
          status,
          progress: prog
            ? { sessionCount: prog.sessionCount, accuracy: prog.accuracy ?? null }
            : null,
          templateVersionId: template?.templateVersionId ?? null,
          isCurrent,
        });
      }
      if (
        !nodes.some((node) => node.status === "active") &&
        nodes.some((node) => node.status === "available")
      ) {
        const firstAvailable = nodes.find((node) => node.status === "available");
        if (firstAvailable) firstAvailable.status = "active";
      }
    }
  }
  const completed = nodes.filter((n) => n.status === "completed").length;
  const total = nodes.length;
  return {
    currentLevel: level,
    overallProgress: {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
    },
    nodes,
    today,
  };
}

export async function getHistory(
  actor: { userId: string; tenantId: string | null; platformRole: string | null },
  opts: { page: number; pageSize: number },
) {
  const where = { studentId: actor.userId, tenantId: actor.tenantId ?? undefined };
  const [items, total] = await Promise.all([
    prisma.exerciseSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        status: true,
        context: true,
        sessionType: true,
        assignmentId: true,
        assessmentId: true,
        templateVersionId: true,
        startedAt: true,
        completedAt: true,
        scoreSummary: true,
        templateVersion: { select: { template: { select: { title: true } } } },
      },
    }),
    prisma.exerciseSession.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function startPersonalExercise(
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
  input: { templateVersionId?: string; clientSessionId?: string },
) {
  const tenantId = actor.tenantId;
  if (!tenantId) throw forbiddenError("Tenant gerekli");
  const clientSessionId = input.clientSessionId?.trim() || null;
  if (clientSessionId && clientSessionId.length > 200) {
    throw validationError("clientSessionId en fazla 200 karakter olmalı");
  }
  let templateVersionId = input.templateVersionId;
  if (!templateVersionId) {
    const tv = await prisma.exerciseTemplateVersion.findFirst({
      where: {
        status: "PUBLISHED",
        template: { status: "PUBLISHED", OR: [{ tenantId: null }, { tenantId }] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!tv) throw validationError("Uygun şablon bulunamadı");
    templateVersionId = tv.id;
  } else {
    const tv = await prisma.exerciseTemplateVersion.findUnique({
      where: { id: templateVersionId },
      select: { status: true, template: { select: { tenantId: true, status: true } } },
    });
    if (!tv || tv.status !== "PUBLISHED" || tv.template.status !== "PUBLISHED")
      throw validationError("Şablon yayınlanmış olmalı");
    if (tv.template.tenantId && tv.template.tenantId !== tenantId)
      throw forbiddenError("Şablon tenant uyuşmazlığı");
  }
  return prisma.$transaction(async (tx) => {
    const requestLockKey = `exercise-start:${tenantId}:${actor.userId}:${clientSessionId ?? "no-client"}`;
    await tx.$queryRaw`
      SELECT 1::int AS acquired
      FROM pg_advisory_xact_lock(hashtextextended(${requestLockKey}, 0))
    `;

    // Recheck after the lock so a retried/concurrent start request cannot
    // create a second session or consume a second daily entitlement.
    if (clientSessionId) {
      const byClient = await tx.exerciseSession.findFirst({
        where: { studentId: actor.userId, tenantId, clientSessionId },
        select: { id: true },
      });
      if (byClient) return { sessionId: byClient.id, isNew: false };
    } else {
      const active = await tx.exerciseSession.findFirst({
        where: {
          tenantId,
          studentId: actor.userId,
          context: "INDIVIDUAL",
          sessionType: "PRACTICE",
          status: "IN_PROGRESS",
          assignmentId: null,
          assessmentId: null,
        },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (active) return { sessionId: active.id, isNew: false };
    }

    const usage = await recordUsageInTransaction(
      tx,
      actor,
      ENTITLEMENT_FEATURES.PRACTICE,
      `exercise:${clientSessionId ?? requestLockKey}`,
    );
    if (!usage.allowed) {
      throw forbiddenError(entitlementLimitMessage(ENTITLEMENT_FEATURES.PRACTICE), {
        feature: ENTITLEMENT_FEATURES.PRACTICE,
        plan: "PLAN_FREE",
        dailyLimit: usage.dailyLimit,
        usedToday: usage.usedToday,
        remainingToday: usage.remainingToday,
        resetAt: usage.resetAt,
      });
    }

    const created = await tx.exerciseSession.create({
      data: {
        tenantId,
        studentId: actor.userId,
        templateVersionId: templateVersionId!,
        context: "INDIVIDUAL",
        sessionType: "PRACTICE",
        status: "IN_PROGRESS",
        clientSessionId,
      },
      select: { id: true },
    });
    return { sessionId: created.id, isNew: true };
  });
}

export async function getStudentSession(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: string | null },
) {
  const session = await prisma.exerciseSession.findFirst({
    where: { id, studentId: actor.userId, tenantId: actor.tenantId ?? undefined },
    select: {
      id: true,
      status: true,
      context: true,
      sessionType: true,
      tenantId: true,
      studentId: true,
      templateVersionId: true,
      assignmentId: true,
      assessmentId: true,
      startedAt: true,
      completedAt: true,
      scoreSummary: true,
      templateVersion: {
        select: {
          id: true,
          template: { select: { id: true, title: true } },
          contents: {
            select: {
              position: true,
              contentVersion: {
                select: {
                  id: true,
                  contentId: true,
                  version: true,
                  title: true,
                  body: true,
                  wordCount: true,
                },
              },
            },
            orderBy: { position: "asc" },
          },
          questions: {
            select: {
              questionVersionId: true,
              position: true,
              questionVersion: { select: { id: true, prompt: true } },
            },
          },
        },
      },
      attempts: {
        select: { id: true, questionVersionId: true, isCorrect: true, answeredAt: true },
      },
    },
  });
  if (!session) throw notFoundError("Oturum bulunamadı");
  return session;
}
