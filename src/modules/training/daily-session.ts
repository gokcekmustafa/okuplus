import { Prisma, type TrainingSessionItemStatus, type TrainingSessionStatus } from "@prisma/client";
import { forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { calendarDateKey, calendarDateStorage } from "../../lib/calendar.js";
import {
  ENTITLEMENT_FEATURES,
  entitlementLimitMessage,
  recordUsageInTransaction,
} from "../entitlements/index.js";
import {
  loadTrainingRuntimeGraph,
  resolveTrainingRuntimeConfig,
  type TrainingActor,
} from "./runtime.js";
import { loadTrainingPerformance } from "./performance.js";
import {
  ADAPTIVE_TRAINING_COMPOSITION,
  ADAPTIVE_TRAINING_FAMILIES,
  planFirstDayTraining,
  planAdaptiveTraining,
  type AdaptiveCandidate,
  type AdaptiveFamily,
  type AdaptivePerformanceState,
} from "./adaptive-selector.js";
import { recordTrainingSessionCompleted } from "../gamification/service.js";
import { findBestReviewCandidate } from "./review-candidates.js";

export const DAILY_TRAINING_COMPOSITION = ADAPTIVE_TRAINING_COMPOSITION;

export type DailyTrainingFamily = AdaptiveFamily;

export type DailyTrainingCandidate = AdaptiveCandidate;

export type DailyTrainingPlanItem = DailyTrainingCandidate & {
  position: number;
  adaptiveBand?: "WEAK" | "NORMAL" | "STRETCH";
  review?: boolean;
  reviewReason?: string;
};

export type DailyTrainingPlan = {
  version: 1;
  totalItems: number;
  firstDay: boolean;
  placementHandoff: boolean;
  items: DailyTrainingPlanItem[];
};

type DailySessionActor = TrainingActor & { tenantId: string };

type DailySessionWithItems = Prisma.TrainingSessionGetPayload<{
  include: {
    items: {
      orderBy: { position: "asc" };
      include: {
        templateVersion: { select: { version: true } };
        exerciseSession: { select: { status: true } };
      };
    };
  };
}>;

type DailyPlanFlags = Pick<DailyTrainingPlan, "firstDay" | "placementHandoff">;

function assertDailyStudent(actor: TrainingActor): asserts actor is DailySessionActor {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw forbiddenError("Günlük antrenman yalnızca aktif öğrenci tenant'ında kullanılabilir");
  }
}

export function utcSessionDate(now = new Date()): Date {
  return calendarDateStorage(now);
}

export function dailySessionDateKey(now = new Date()): string {
  return calendarDateKey(now);
}

/**
 * Pure deterministic planner. Daily V1 has one item per family; missing any
 * family is a hard planning error instead of silently repeating another graph.
 */
export function planDailyTraining(
  candidates: readonly DailyTrainingCandidate[],
): DailyTrainingPlan {
  const items: DailyTrainingPlanItem[] = [];
  for (const compositionItem of DAILY_TRAINING_COMPOSITION) {
    const familyCandidates = candidates
      .filter(
        (candidate) =>
          candidate.family === compositionItem.family &&
          candidate.competency === compositionItem.competency,
      )
      .filter(
        (candidate, index, all) =>
          all.findIndex((entry) => entry.templateVersionId === candidate.templateVersionId) ===
          index,
      );
    const candidate = familyCandidates[0];
    if (!candidate) {
      throw validationError(
        `${compositionItem.family} için günlük antrenmanda yayınlanmış egzersiz gerekli`,
      );
    }
    items.push({ ...candidate, position: compositionItem.position });
  }
  return { version: 1, totalItems: 6, firstDay: false, placementHandoff: false, items };
}

/**
 * Review is an optional reinforcement item. It is deliberately appended after
 * the six-item learning composition so it cannot displace a new family.
 */
export function appendReviewToDailyPlan(
  plan: DailyTrainingPlan,
  review: {
    templateVersionId: string;
    family: AdaptiveFamily;
    competency: string;
    difficulty: DailyTrainingCandidate["difficulty"];
    version?: number;
    publishedAt?: Date | string | null;
    reason: string;
  },
): DailyTrainingPlan {
  if (
    plan.firstDay ||
    plan.items.some((item) => item.templateVersionId === review.templateVersionId)
  ) {
    return plan;
  }
  const position = plan.items.length + 1;
  return {
    ...plan,
    totalItems: position,
    items: [
      ...plan.items,
      {
        templateVersionId: review.templateVersionId,
        family: review.family,
        competency: review.competency,
        difficulty: review.difficulty,
        version: review.version,
        publishedAt: review.publishedAt,
        position,
        review: true,
        reviewReason: review.reason,
        adaptiveBand: "WEAK",
      },
    ],
  };
}

function visibleTemplateWhere(actor: DailySessionActor): Prisma.ExerciseTemplateVersionWhereInput {
  return {
    status: "PUBLISHED",
    template: {
      deletedAt: null,
      status: "PUBLISHED",
      OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
    },
  };
}

async function loadAdaptivePerformance(
  actor: DailySessionActor,
): Promise<AdaptivePerformanceState> {
  return (await loadTrainingPerformance(actor)).performance;
}

async function loadDailyPlan(
  actor: DailySessionActor,
  seed: string,
  flags: DailyPlanFlags,
): Promise<DailyTrainingPlan> {
  const candidates = await prisma.exerciseTemplateVersion.findMany({
    where: visibleTemplateWhere(actor),
    select: { id: true, config: true, publishedAt: true, version: true },
    orderBy: [{ publishedAt: "desc" }, { version: "desc" }, { id: "asc" }],
  });

  const runtimeCandidates: DailyTrainingCandidate[] = [];
  for (const candidate of candidates) {
    const resolved = resolveTrainingRuntimeConfig("TRAINING", candidate.config);
    if (resolved.status !== "READY") continue;
    const config = resolved.config;
    if (!ADAPTIVE_TRAINING_FAMILIES.includes(config.family)) {
      continue;
    }
    runtimeCandidates.push({
      templateVersionId: candidate.id,
      family: config.family,
      competency: config.competency,
      difficulty: config.difficulty,
      version: candidate.version,
      publishedAt: candidate.publishedAt,
    });
  }

  const adaptivePlan = flags.firstDay
    ? planFirstDayTraining(runtimeCandidates, seed)
    : planAdaptiveTraining(runtimeCandidates, await loadAdaptivePerformance(actor), seed);
  let plan: DailyTrainingPlan = {
    version: 1,
    totalItems: 6,
    ...flags,
    items: adaptivePlan.items.map(({ band, ...item }) => ({
      ...item,
      adaptiveBand: band,
    })),
  };
  // The selected graphs are independent read-only validations. Running them
  // together avoids making first-training start wait on six serial graph loads.
  await Promise.all(
    plan.items.map((item) => loadTrainingRuntimeGraph(item.templateVersionId, actor)),
  );
  if (!flags.firstDay) {
    const review = await findBestReviewCandidate(
      actor,
      new Set(plan.items.map((item) => item.templateVersionId)),
    );
    if (review) plan = appendReviewToDailyPlan(plan, review);
  }
  return plan;
}

function dailySessionInclude() {
  return {
    items: {
      orderBy: { position: "asc" as const },
      include: {
        templateVersion: { select: { version: true } },
        exerciseSession: { select: { status: true } },
      },
    },
  } as const;
}

function toDailySessionResponse(session: DailySessionWithItems) {
  const composition = session.composition;
  const compositionItems =
    typeof composition === "object" &&
    composition !== null &&
    "items" in composition &&
    Array.isArray(composition.items)
      ? composition.items
      : [];
  const firstDay =
    typeof composition === "object" && composition !== null && "firstDay" in composition
      ? composition.firstDay === true
      : false;
  const placementHandoff =
    typeof composition === "object" && composition !== null && "placementHandoff" in composition
      ? composition.placementHandoff === true
      : false;
  const items = session.items.map((item) => ({
    ...(() => {
      const planItem = compositionItems.find(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          "position" in entry &&
          entry.position === item.position,
      );
      return {
        review:
          typeof planItem === "object" && planItem !== null && "review" in planItem
            ? planItem.review === true
            : false,
        reviewReason:
          typeof planItem === "object" &&
          planItem !== null &&
          "reviewReason" in planItem &&
          typeof planItem.reviewReason === "string"
            ? planItem.reviewReason
            : null,
      };
    })(),
    id: item.id,
    position: item.position,
    family: item.family,
    competency: item.competency,
    difficulty: item.difficulty,
    templateVersionId: item.templateVersionId,
    templateVersion: item.templateVersion,
    exerciseSessionId: item.exerciseSessionId,
    status: item.status,
    exerciseSessionStatus: item.exerciseSession?.status ?? null,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
  }));
  const currentItem = items.find((item) => item.status !== "COMPLETED") ?? null;
  return {
    id: session.id,
    tenantId: session.tenantId,
    studentId: session.studentId,
    sessionDate: session.sessionDate,
    status: session.status,
    composition: session.composition,
    completedAt: session.completedAt,
    totalItems: session.totalItems,
    completedItems: session.completedItems,
    totalGP: session.totalGP,
    firstDay,
    placementHandoff,
    items,
    currentItemId: currentItem?.id ?? null,
  };
}

async function findOwnedDailySession(id: string, actor: DailySessionActor) {
  const session = await prisma.trainingSession.findFirst({
    where: { id, tenantId: actor.tenantId, studentId: actor.userId },
    include: dailySessionInclude(),
  });
  if (!session) throw notFoundError("Günlük antrenman bulunamadı");
  return session;
}

async function assertActiveStudentMembership(
  tx: Prisma.TransactionClient,
  actor: DailySessionActor,
): Promise<void> {
  const membership = await tx.membership.findFirst({
    where: {
      tenantId: actor.tenantId,
      userId: actor.userId,
      role: "STUDENT",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) throw forbiddenError("Bu tenant için aktif öğrenci üyeliği gerekli");
}

export async function startDailyTraining(actor: TrainingActor, now = new Date()) {
  assertDailyStudent(actor);
  const sessionDate = utcSessionDate(now);
  const sessionDateKey = dailySessionDateKey(now);
  const existingBeforeLock = await prisma.trainingSession.findUnique({
    where: {
      tenantId_studentId_sessionDate: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        sessionDate,
      },
    },
    include: dailySessionInclude(),
  });
  if (existingBeforeLock) return toDailySessionResponse(existingBeforeLock);
  const previousTrainingSession = await prisma.trainingSession.findFirst({
    where: { tenantId: actor.tenantId, studentId: actor.userId },
    select: { id: true },
  });
  const firstDay = !previousTrainingSession;
  const placementHandoff = firstDay
    ? Boolean(
        await prisma.assessmentResult.findFirst({
          where: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            assessment: { type: "PLACEMENT", deletedAt: null },
          },
          select: { id: true },
          orderBy: { completedAt: "desc" },
        }),
      )
    : false;
  const plan = await loadDailyPlan(actor, sessionDateKey, { firstDay, placementHandoff });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1::int AS acquired
      FROM pg_advisory_xact_lock(hashtextextended(${`training-session:${actor.tenantId}:${actor.userId}:${sessionDateKey}`}, 0))
    `;

    const existing = await tx.trainingSession.findUnique({
      where: {
        tenantId_studentId_sessionDate: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          sessionDate,
        },
      },
      include: dailySessionInclude(),
    });
    if (existing) return toDailySessionResponse(existing);

    await assertActiveStudentMembership(tx, actor);
    const usage = await recordUsageInTransaction(
      tx,
      actor,
      ENTITLEMENT_FEATURES.PRACTICE,
      `training-session:${actor.tenantId}:${actor.userId}:${sessionDateKey}`,
      now,
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

    const createdParent = await tx.trainingSession.create({
      data: {
        tenantId: actor.tenantId,
        studentId: actor.userId,
        sessionDate,
        status: "IN_PROGRESS",
        composition: plan as unknown as Prisma.InputJsonValue,
        totalItems: plan.totalItems,
        completedItems: 0,
        totalGP: 0,
      },
    });
    for (const item of plan.items) {
      const exerciseSession = await tx.exerciseSession.create({
        data: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          templateVersionId: item.templateVersionId,
          context: "INDIVIDUAL",
          sessionType: "PRACTICE",
          status: "IN_PROGRESS",
          clientSessionId: `training:${actor.tenantId}:${actor.userId}:${sessionDateKey}:${item.position}`,
        },
        select: { id: true },
      });
      await tx.trainingSessionItem.create({
        data: {
          trainingSession: { connect: { id: createdParent.id } },
          position: item.position,
          family: item.family,
          competency: item.competency,
          difficulty: item.difficulty,
          templateVersion: { connect: { id: item.templateVersionId } },
          exerciseSession: { connect: { id: exerciseSession.id } },
          status: item.position === 1 ? "IN_PROGRESS" : "PENDING",
          startedAt: item.position === 1 ? now : null,
        },
      });
    }
    const created = await tx.trainingSession.findUniqueOrThrow({
      where: { id: createdParent.id },
      include: dailySessionInclude(),
    });
    return toDailySessionResponse(created);
  });
}

export async function getDailyTrainingSession(id: string, actor: TrainingActor) {
  assertDailyStudent(actor);
  return toDailySessionResponse(await findOwnedDailySession(id, actor));
}

export async function syncTrainingSessionItem(exerciseSessionId: string): Promise<void> {
  let completion: {
    trainingSessionId: string;
    tenantId: string;
    studentId: string;
    completedAt: Date;
    basePoints: number;
  } | null = null;

  await prisma.$transaction(async (tx) => {
    // Serialise completion of the same child session. The point/streak award
    // is deliberately outside this transaction, so this lock ensures only
    // one transaction can observe the transition to a completed daily item.
    await tx.$queryRaw`
      SELECT 1::int AS acquired
      FROM pg_advisory_xact_lock(hashtextextended(${`training-item:${exerciseSessionId}`}, 0))
    `;
    const item = await tx.trainingSessionItem.findUnique({
      where: { exerciseSessionId },
      select: { id: true, trainingSessionId: true, status: true },
    });
    if (!item) return;

    // Different child completions can arrive concurrently. Serialize the
    // parent read/update as well, otherwise two final items may each observe
    // the other one as pending and leave the daily session incomplete.
    await tx.$queryRaw`
      SELECT 1::int AS acquired
      FROM pg_advisory_xact_lock(
        hashtextextended(${`training-session:${item.trainingSessionId}`}, 0)
      )
    `;

    if (item.status !== "COMPLETED") {
      await tx.trainingSessionItem.update({
        where: { id: item.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    const items = await tx.trainingSessionItem.findMany({
      where: { trainingSessionId: item.trainingSessionId },
      select: { status: true, exerciseSessionId: true },
    });
    const completedItems = items.filter((entry) => entry.status === "COMPLETED").length;
    const parent = await tx.trainingSession.findUnique({
      where: { id: item.trainingSessionId },
      select: { status: true, totalItems: true, tenantId: true, studentId: true },
    });
    if (!parent) return;
    const exerciseSessionIds = items.flatMap((entry) =>
      entry.exerciseSessionId ? [entry.exerciseSessionId] : [],
    );
    const attempts = exerciseSessionIds.length
      ? await tx.attempt.findMany({
          where: { sessionId: { in: exerciseSessionIds } },
          select: { id: true },
        })
      : [];
    const pointSources = [...exerciseSessionIds, ...attempts.map((attempt) => attempt.id)];
    const points = pointSources.length
      ? await tx.pointEvent.aggregate({
          where: {
            tenantId: parent.tenantId,
            studentId: parent.studentId,
            sourceId: { in: pointSources },
          },
          _sum: { points: true },
        })
      : { _sum: { points: null } };
    const isComplete = completedItems >= parent.totalItems && parent.totalItems > 0;
    const completedAt = new Date();
    if (isComplete) {
      completion = {
        trainingSessionId: item.trainingSessionId,
        tenantId: parent.tenantId,
        studentId: parent.studentId,
        completedAt,
        basePoints: points._sum.points ?? 0,
      };
    }
    if (!isComplete) {
      const next = await tx.trainingSessionItem.findFirst({
        where: { trainingSessionId: item.trainingSessionId, status: "PENDING" },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.trainingSessionItem.update({
          where: { id: next.id },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
      }
    }
    await tx.trainingSession.update({
      where: { id: item.trainingSessionId },
      data: {
        completedItems,
        totalGP: points._sum.points ?? 0,
        ...(isComplete && parent.status !== "COMPLETED"
          ? { status: "COMPLETED", completedAt }
          : {}),
      },
    });
  });

  const finalized = completion as {
    trainingSessionId: string;
    tenantId: string;
    studentId: string;
    completedAt: Date;
    basePoints: number;
  } | null;
  if (!finalized) return;
  const award = await recordTrainingSessionCompleted(finalized).catch(() => null);
  if (award) {
    await prisma.trainingSession.update({
      where: { id: finalized.trainingSessionId },
      data: { totalGP: finalized.basePoints + award.event.points },
    });
  }
}

export type DailyTrainingStatus = TrainingSessionStatus;
export type DailyTrainingItemStatus = TrainingSessionItemStatus;
