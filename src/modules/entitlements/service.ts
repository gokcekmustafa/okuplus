import {
  Prisma,
  type EntitlementPlan,
  type EntitlementScope,
  type PlatformRole,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, validationError } from "../../lib/errors.js";
import { iyzicoCheckoutConfigured } from "../billing/config.js";

export const ENTITLEMENT_FEATURES = {
  PRACTICE: "PRACTICE",
  PRACTICE_QUESTION: "PRACTICE_QUESTION",
  REVIEW: "REVIEW",
  LEARNING_PATH: "LEARNING_PATH",
  ASSESSMENT: "ASSESSMENT",
  PROGRESS: "PROGRESS",
  GAMIFICATION: "GAMIFICATION",
  ADS_ENABLED: "ADS_ENABLED",
} as const;

export type EntitlementFeature = (typeof ENTITLEMENT_FEATURES)[keyof typeof ENTITLEMENT_FEATURES];

export interface EntitlementActor {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}

export interface FeatureEntitlement {
  feature: EntitlementFeature;
  allowed: boolean;
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  resetAt: string;
  reason: string | null;
}

export interface EntitlementSnapshot {
  scope: EntitlementScope;
  tenant: { id: string; type: "INDIVIDUAL" | "ORGANIZATION" };
  plan: {
    code: EntitlementPlan;
    label: string;
    active: boolean;
    source: string;
    effectiveAt: string | null;
    expiresAt: string | null;
  };
  timezone: string;
  usageDate: string;
  features: Record<EntitlementFeature, FeatureEntitlement>;
  premium: {
    paymentAvailable: boolean;
    ctaLabel: string;
    activeCapabilities: string[];
    plannedCapabilities: string[];
  };
}

type EntitlementDb = PrismaClientLike | Prisma.TransactionClient;
type PrismaClientLike = typeof prisma;

type FeaturePolicy = {
  allowed: boolean;
  dailyLimit: number | null;
  reason: string | null;
};

const DEFAULT_TIMEZONE = "UTC";
const FREE_DAILY_PRACTICE_LIMIT = 3;
const FREE_DAILY_QUESTION_LIMIT = 20;

function premiumCheckoutAvailable(): boolean {
  return iyzicoCheckoutConfigured({
    IYZICO_API_KEY: process.env.IYZICO_API_KEY ?? "",
    IYZICO_SECRET_KEY: process.env.IYZICO_SECRET_KEY ?? "",
    IYZICO_BASE_URL: process.env.IYZICO_BASE_URL ?? "",
    IYZICO_MERCHANT_ID: process.env.IYZICO_MERCHANT_ID ?? "",
    IYZICO_CHECKOUT_CALLBACK_URL: process.env.IYZICO_CHECKOUT_CALLBACK_URL ?? "",
    IYZICO_SUBSCRIPTION_PLAN_MONTHLY: process.env.IYZICO_SUBSCRIPTION_PLAN_MONTHLY ?? "",
    IYZICO_SUBSCRIPTION_PLAN_YEARLY: process.env.IYZICO_SUBSCRIPTION_PLAN_YEARLY ?? "",
  });
}

const PLAN_POLICIES: Record<EntitlementPlan, Record<EntitlementFeature, FeaturePolicy>> = {
  PLAN_FREE: {
    PRACTICE: { allowed: true, dailyLimit: FREE_DAILY_PRACTICE_LIMIT, reason: null },
    PRACTICE_QUESTION: { allowed: true, dailyLimit: FREE_DAILY_QUESTION_LIMIT, reason: null },
    REVIEW: { allowed: true, dailyLimit: null, reason: null },
    LEARNING_PATH: { allowed: true, dailyLimit: null, reason: null },
    ASSESSMENT: { allowed: true, dailyLimit: null, reason: null },
    PROGRESS: { allowed: true, dailyLimit: null, reason: null },
    GAMIFICATION: { allowed: true, dailyLimit: null, reason: null },
    ADS_ENABLED: {
      allowed: false,
      dailyLimit: null,
      reason: "Reklam sistemi bu aşamada etkin değil",
    },
  },
  PLAN_PREMIUM: {
    PRACTICE: { allowed: true, dailyLimit: null, reason: null },
    PRACTICE_QUESTION: { allowed: true, dailyLimit: null, reason: null },
    REVIEW: { allowed: true, dailyLimit: null, reason: null },
    LEARNING_PATH: { allowed: true, dailyLimit: null, reason: null },
    ASSESSMENT: { allowed: true, dailyLimit: null, reason: null },
    PROGRESS: { allowed: true, dailyLimit: null, reason: null },
    GAMIFICATION: { allowed: true, dailyLimit: null, reason: null },
    ADS_ENABLED: {
      allowed: false,
      dailyLimit: null,
      reason: "Reklam sistemi bu aşamada etkin değil",
    },
  },
};

const LIMITED_FEATURES = new Set<EntitlementFeature>([
  ENTITLEMENT_FEATURES.PRACTICE,
  ENTITLEMENT_FEATURES.PRACTICE_QUESTION,
]);

const ENTITLEMENT_FEATURE_SET = new Set<string>(Object.values(ENTITLEMENT_FEATURES));

function assertEntitlementFeature(feature: string): asserts feature is EntitlementFeature {
  if (!ENTITLEMENT_FEATURE_SET.has(feature)) {
    throw validationError("Geçersiz entitlement özelliği", { feature });
  }
}

function configuredTimezone(): string {
  const candidate = process.env.ENTITLEMENT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function dateParts(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}

export function entitlementUsageDate(date = new Date(), timezone = configuredTimezone()): string {
  const parts = dateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = dateParts(date, timezone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function resetAt(date: Date, timezone: string): string {
  const current = dateParts(date, timezone);
  let candidate = Date.UTC(
    Number(current.year),
    Number(current.month) - 1,
    Number(current.day) + 1,
    0,
    0,
    0,
  );
  for (let i = 0; i < 3; i += 1) {
    candidate =
      Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) + 1, 0, 0, 0) -
      timezoneOffsetMs(new Date(candidate), timezone);
  }
  return new Date(candidate).toISOString();
}

function planLabel(plan: EntitlementPlan): string {
  return plan === "PLAN_PREMIUM" ? "Premium" : "Ücretsiz";
}

function featureLabel(feature: EntitlementFeature): string {
  if (feature === ENTITLEMENT_FEATURES.PRACTICE) return "alıştırma";
  if (feature === ENTITLEMENT_FEATURES.PRACTICE_QUESTION) return "soru";
  return "kullanım";
}

async function resolveScope(
  actor: EntitlementActor,
  client: EntitlementDb = prisma,
): Promise<{
  tenantId: string;
  scope: EntitlementScope;
  tenantType: "INDIVIDUAL" | "ORGANIZATION";
}> {
  if (!actor.tenantId) throw forbiddenError("Aktif tenant context gerekli");
  const tenant = await client.tenant.findFirst({
    where: { id: actor.tenantId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, type: true },
  });
  if (!tenant) throw forbiddenError("Aktif tenant context bulunamadı");

  if (actor.platformRole === null) {
    const membership = await client.membership.findFirst({
      where: {
        tenantId: tenant.id,
        userId: actor.userId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!membership) throw forbiddenError("Bu tenant için aktif üyelik gerekli");
  }

  return {
    tenantId: tenant.id,
    scope: tenant.type === "INDIVIDUAL" ? "PERSONAL" : "ORGANIZATION",
    tenantType: tenant.type,
  };
}

async function currentGrant(
  actor: EntitlementActor,
  scope: EntitlementScope,
  tenantId: string,
  now: Date,
  client: EntitlementDb,
) {
  return client.entitlement.findFirst({
    where: {
      tenantId,
      scope,
      active: true,
      effectiveAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(scope === "PERSONAL" ? { userId: actor.userId } : { userId: null }),
    },
    select: {
      id: true,
      plan: true,
      active: true,
      source: true,
      effectiveAt: true,
      expiresAt: true,
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
}

async function usageCounts(
  actor: EntitlementActor,
  tenantId: string,
  usageDate: string,
  client: EntitlementDb,
): Promise<Map<EntitlementFeature, number>> {
  const rows = await client.entitlementUsage.groupBy({
    by: ["feature"],
    where: {
      tenantId,
      userId: actor.userId,
      usageDate,
      feature: { in: [...LIMITED_FEATURES] },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.feature as EntitlementFeature, row._count._all]));
}

async function loadSnapshot(
  actor: EntitlementActor,
  client: EntitlementDb,
  now = new Date(),
): Promise<EntitlementSnapshot> {
  const context = await resolveScope(actor, client);
  const timezone = configuredTimezone();
  const usageDate = entitlementUsageDate(now, timezone);
  const [grant, counts] = await Promise.all([
    // 8H-2 deliberately keeps Premium personal-only. Organization scope is
    // still resolved and quota-protected, but has no active Premium grant.
    context.scope === "PERSONAL"
      ? currentGrant(actor, context.scope, context.tenantId, now, client)
      : Promise.resolve(null),
    usageCounts(actor, context.tenantId, usageDate, client),
  ]);
  const plan = grant?.plan ?? "PLAN_FREE";
  const policies = PLAN_POLICIES[plan];
  const features = Object.fromEntries(
    (Object.keys(ENTITLEMENT_FEATURES) as Array<keyof typeof ENTITLEMENT_FEATURES>).map((key) => {
      const feature = ENTITLEMENT_FEATURES[key];
      const policy = policies[feature];
      const usedToday = counts.get(feature) ?? 0;
      return [
        feature,
        {
          feature,
          allowed: policy.allowed,
          dailyLimit: policy.dailyLimit,
          usedToday,
          remainingToday:
            policy.dailyLimit === null ? null : Math.max(0, policy.dailyLimit - usedToday),
          resetAt: resetAt(now, timezone),
          reason: policy.reason,
        },
      ];
    }),
  ) as Record<EntitlementFeature, FeatureEntitlement>;

  return {
    scope: context.scope,
    tenant: { id: context.tenantId, type: context.tenantType },
    plan: {
      code: plan,
      label: planLabel(plan),
      active: true,
      source: grant?.source ?? "DEFAULT",
      effectiveAt: grant?.effectiveAt.toISOString() ?? null,
      expiresAt: grant?.expiresAt?.toISOString() ?? null,
    },
    timezone,
    usageDate,
    features,
    premium: {
      paymentAvailable: premiumCheckoutAvailable(),
      ctaLabel: premiumCheckoutAvailable() ? "Premium'u sandbox'ta dene" : "Premium hakkında bilgi",
      activeCapabilities: ["Sınırsız alıştırma", "Sınırsız soru"],
      plannedCapabilities: ["ADS_FREE", "ADVANCED_PROGRESS", "ADVANCED_REVIEW", "PREMIUM_CONTENT"],
    },
  };
}

export async function getEntitlements(
  actor: EntitlementActor,
  client: EntitlementDb = prisma,
): Promise<EntitlementSnapshot> {
  return loadSnapshot(actor, client);
}

export async function getCurrentPlan(
  actor: EntitlementActor,
  client: EntitlementDb = prisma,
): Promise<EntitlementPlan> {
  return (await loadSnapshot(actor, client)).plan.code;
}

export async function canAccess(
  actor: EntitlementActor,
  feature: EntitlementFeature,
  client: EntitlementDb = prisma,
): Promise<FeatureEntitlement> {
  assertEntitlementFeature(feature);
  const snapshot = await loadSnapshot(actor, client);
  return snapshot.features[feature];
}

export async function checkLimit(
  actor: EntitlementActor,
  feature: EntitlementFeature,
  client: EntitlementDb = prisma,
): Promise<FeatureEntitlement> {
  return canAccess(actor, feature, client);
}

export interface UsageResult extends FeatureEntitlement {
  consumed: boolean;
  idempotent: boolean;
}

async function recordUsageInTransactionCore(
  tx: Prisma.TransactionClient,
  actor: EntitlementActor,
  feature: EntitlementFeature,
  idempotencyKey: string,
  now: Date,
): Promise<UsageResult> {
  assertEntitlementFeature(feature);
  if (!idempotencyKey.trim() || idempotencyKey.length > 200) {
    throw validationError("Entitlement kullanım anahtarı geçersiz");
  }
  const context = await resolveScope(actor, tx);
  const timezone = configuredTimezone();
  const usageDate = entitlementUsageDate(now, timezone);
  const grant =
    context.scope === "PERSONAL"
      ? await currentGrant(actor, context.scope, context.tenantId, now, tx)
      : null;
  const plan = grant?.plan ?? "PLAN_FREE";
  const policy = PLAN_POLICIES[plan][feature];

  if (!policy.allowed) {
    return {
      feature,
      allowed: false,
      dailyLimit: policy.dailyLimit,
      usedToday: 0,
      remainingToday: 0,
      resetAt: resetAt(now, timezone),
      reason: policy.reason,
      consumed: false,
      idempotent: false,
    };
  }

  if (policy.dailyLimit === null || !LIMITED_FEATURES.has(feature)) {
    return {
      feature,
      allowed: true,
      dailyLimit: null,
      usedToday: 0,
      remainingToday: null,
      resetAt: resetAt(now, timezone),
      reason: null,
      consumed: false,
      idempotent: false,
    };
  }

  const lockKey = `entitlement:${context.tenantId}:${actor.userId}:${feature}:${usageDate}`;
  await tx.$queryRaw`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;

  const uniqueWhere = {
    tenantId_userId_feature_usageDate_idempotencyKey: {
      tenantId: context.tenantId,
      userId: actor.userId,
      feature,
      usageDate,
      idempotencyKey,
    },
  } as const;
  const existing = await tx.entitlementUsage.findUnique({
    where: uniqueWhere,
    select: { id: true },
  });
  if (existing) {
    const usedToday = await tx.entitlementUsage.count({
      where: { tenantId: context.tenantId, userId: actor.userId, feature, usageDate },
    });
    return {
      feature,
      allowed: true,
      dailyLimit: policy.dailyLimit,
      usedToday,
      remainingToday: Math.max(0, policy.dailyLimit - usedToday),
      resetAt: resetAt(now, timezone),
      reason: null,
      consumed: false,
      idempotent: true,
    };
  }

  const usedToday = await tx.entitlementUsage.count({
    where: { tenantId: context.tenantId, userId: actor.userId, feature, usageDate },
  });
  if (usedToday >= policy.dailyLimit) {
    return {
      feature,
      allowed: false,
      dailyLimit: policy.dailyLimit,
      usedToday,
      remainingToday: 0,
      resetAt: resetAt(now, timezone),
      reason: `Günlük ücretsiz ${featureLabel(feature)} hakkı doldu`,
      consumed: false,
      idempotent: false,
    };
  }

  await tx.entitlementUsage.create({
    data: {
      userId: actor.userId,
      tenantId: context.tenantId,
      feature,
      usageDate,
      timezone,
      idempotencyKey,
    },
  });
  const nextUsed = usedToday + 1;
  return {
    feature,
    allowed: true,
    dailyLimit: policy.dailyLimit,
    usedToday: nextUsed,
    remainingToday: Math.max(0, policy.dailyLimit - nextUsed),
    resetAt: resetAt(now, timezone),
    reason: null,
    consumed: true,
    idempotent: false,
  };
}

export async function recordUsage(
  actor: EntitlementActor,
  feature: EntitlementFeature,
  idempotencyKey: string,
  now = new Date(),
): Promise<UsageResult> {
  return prisma.$transaction((tx) =>
    recordUsageInTransactionCore(tx, actor, feature, idempotencyKey, now),
  );
}

export async function recordUsageInTransaction(
  tx: Prisma.TransactionClient,
  actor: EntitlementActor,
  feature: EntitlementFeature,
  idempotencyKey: string,
  now = new Date(),
): Promise<UsageResult> {
  return recordUsageInTransactionCore(tx, actor, feature, idempotencyKey, now);
}

export function entitlementLimitMessage(feature: EntitlementFeature): string {
  return `Günlük ücretsiz ${featureLabel(feature)} hakkın doldu. Premium ile ${featureLabel(feature)} kullanımını günlük limit olmadan sürdürebilirsin.`;
}

export async function enforceUsage(
  actor: EntitlementActor,
  feature: EntitlementFeature,
  idempotencyKey: string,
  now = new Date(),
): Promise<UsageResult> {
  const result = await recordUsage(actor, feature, idempotencyKey, now);
  if (!result.allowed) {
    throw forbiddenError(entitlementLimitMessage(feature), {
      feature,
      plan: "PLAN_FREE",
      dailyLimit: result.dailyLimit,
      usedToday: result.usedToday,
      remainingToday: result.remainingToday,
      resetAt: result.resetAt,
    });
  }
  return result;
}

export async function requireFeatureAccess(
  actor: EntitlementActor,
  feature: EntitlementFeature,
): Promise<FeatureEntitlement> {
  const result = await canAccess(actor, feature);
  if (!result.allowed) {
    throw forbiddenError(result.reason ?? "Bu özellik hesabınız için etkin değil", {
      feature,
    });
  }
  return result;
}
