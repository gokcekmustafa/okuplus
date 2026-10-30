import { Prisma, type EntitlementScope } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type {
  ChangeManagedEntitlementPlanInput,
  CreateEntitlementInput,
  CreateManagedEntitlementInput,
  ListEntitlementsQuery,
  UpdateEntitlementInput,
} from "./admin-schemas.js";

const entitlementSelect = {
  id: true,
  userId: true,
  tenantId: true,
  scope: true,
  plan: true,
  active: true,
  source: true,
  effectiveAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, type: true, status: true } },
} satisfies Prisma.EntitlementSelect;

type EntitlementRecord = Prisma.EntitlementGetPayload<{ select: typeof entitlementSelect }>;

export async function listAdminEntitlements(query: ListEntitlementsQuery) {
  const rows = await prisma.entitlement.findMany({
    where: {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    },
    select: entitlementSelect,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toPublicEntitlement);
}

export async function createAdminEntitlement(input: CreateEntitlementInput, actorUserId: string) {
  const userId = input.userId ?? null;
  const context = await validateTarget(input.tenantId, input.scope, userId);
  const row = await prisma.$transaction(async (tx) => {
    await tx.entitlement.updateMany({
      where: {
        tenantId: input.tenantId,
        scope: input.scope,
        userId,
        active: true,
      },
      data: { active: false },
    });
    const created = await tx.entitlement.create({
      data: {
        tenantId: input.tenantId,
        userId,
        scope: input.scope,
        plan: input.plan,
        source: input.source,
        effectiveAt: input.effectiveAt ?? new Date(),
        expiresAt: input.expiresAt ?? null,
        active: input.active,
      },
      select: entitlementSelect,
    });
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantType === "ORGANIZATION" ? context.tenantId : null,
        actorUserId,
        action: "CREATE",
        entityType: "ENTITLEMENT",
        entityId: created.id,
        after: auditState(created),
      },
    });
    return created;
  });
  return toPublicEntitlement(row);
}

export async function updateAdminEntitlement(
  id: string,
  input: UpdateEntitlementInput,
  actorUserId: string,
) {
  const updated = await prisma.$transaction(async (tx) => {
    let existing = await tx.entitlement.findUnique({ where: { id }, select: entitlementSelect });
    if (!existing) throw notFoundError("Paket kaydı bulunamadı");
    await lockManagedEntitlementContext(tx, existing.tenantId, existing.scope, existing.userId);
    existing = await tx.entitlement.findUnique({ where: { id }, select: entitlementSelect });
    if (!existing) throw notFoundError("Paket kaydı bulunamadı");
    if (existing.source !== "ADMIN") {
      throw conflictError("Ödeme sağlayıcısı kaynaklı paket erişimi bu ekrandan değiştirilemez");
    }
    if (existing.scope !== "PERSONAL" || !existing.userId) {
      throw conflictError("Kurum kapsamındaki paket kullanıcı profilinden değiştirilemez");
    }
    const personalContext = await resolveUniquePersonalContext(tx, existing.userId);
    if (personalContext.tenantId !== existing.tenantId) {
      throw conflictError("Paketin bağlı olduğu kişisel çalışma alanı doğrulanamadı");
    }
    if (input.expiresAt === undefined && input.active !== false) {
      throw validationError("Uzatma tarihi veya erişimi sonlandırma işlemi gerekli");
    }
    const now = new Date();
    if (input.expiresAt !== undefined) {
      if (!existing.active || (existing.expiresAt && existing.expiresAt <= now)) {
        throw conflictError("Süresi dolmuş veya pasif paket uzatılamaz; yeni bir paket başlatın");
      }
      if (input.expiresAt && input.expiresAt <= existing.effectiveAt) {
        throw validationError("Bitiş tarihi başlangıç tarihinden sonra olmalı");
      }
      if (
        input.expiresAt === existing.expiresAt ||
        (existing.expiresAt === null && input.expiresAt !== null)
      ) {
        throw validationError("Yeni bitiş tarihi mevcut erişimi uzatmalıdır");
      }
      if (
        input.expiresAt !== null &&
        existing.expiresAt !== null &&
        input.expiresAt <= existing.expiresAt
      ) {
        throw validationError("Yeni bitiş tarihi mevcut tarihten ileri olmalı");
      }
    }
    const data: Prisma.EntitlementUpdateInput = {
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.active === false ? { active: false } : {}),
    };
    const row = await tx.entitlement.update({ where: { id }, data, select: entitlementSelect });
    await tx.auditLog.create({
      data: {
        tenantId: existing.tenant.type === "ORGANIZATION" ? existing.tenantId : null,
        actorUserId,
        action: "UPDATE",
        entityType: "ENTITLEMENT",
        entityId: id,
        before: auditState(existing),
        after: auditState(row),
      },
    });
    return row;
  });
  return toPublicEntitlement(updated);
}

/** Creates a manual grant. Personal tenant resolution is server-side and fails closed on ambiguity. */
export async function createManagedAdminEntitlement(
  input: CreateManagedEntitlementInput,
  actorUserId: string,
) {
  const row = await prisma.$transaction(async (tx) => {
    const context =
      input.scope === "PERSONAL"
        ? await resolveUniquePersonalContext(tx, input.userId!)
        : await resolveOrganizationContext(tx, input.tenantId!);
    const userId = input.scope === "PERSONAL" ? input.userId! : null;
    await lockManagedEntitlementContext(tx, context.tenantId, input.scope, userId);
    const now = new Date();
    const existing = await tx.entitlement.findMany({
      where: {
        tenantId: context.tenantId,
        scope: input.scope,
        userId,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: entitlementSelect,
    });
    if (existing.length) {
      throw conflictError(
        "Bu bağlamda devam eden veya planlanmış paket var; mevcut paketi değiştirin",
      );
    }
    const effectiveAt = input.effectiveAt ?? now;
    if (input.expiresAt && input.expiresAt <= effectiveAt) {
      throw validationError("Bitiş tarihi başlangıç tarihinden sonra olmalı");
    }
    const created = await tx.entitlement.create({
      data: {
        tenantId: context.tenantId,
        userId,
        scope: input.scope,
        plan: input.plan,
        source: "ADMIN",
        effectiveAt,
        expiresAt: input.expiresAt ?? null,
        active: true,
      },
      select: entitlementSelect,
    });
    await writeEntitlementAudit(
      tx,
      actorUserId,
      created.tenant.type === "ORGANIZATION" ? context.tenantId : null,
      "CREATE",
      created.id,
      null,
      created,
    );
    return created;
  });
  return toPublicEntitlement(row);
}

/** Plan changes create a new immutable grant and close the previous one at the transition date. */
export async function changeManagedAdminEntitlementPlan(
  id: string,
  input: ChangeManagedEntitlementPlanInput,
  actorUserId: string,
) {
  const rows = await prisma.$transaction(async (tx) => {
    let existing = await tx.entitlement.findUnique({ where: { id }, select: entitlementSelect });
    if (!existing) throw notFoundError("Paket kaydı bulunamadı");
    await lockManagedEntitlementContext(tx, existing.tenantId, existing.scope, existing.userId);
    existing = await tx.entitlement.findUnique({ where: { id }, select: entitlementSelect });
    if (!existing) throw notFoundError("Paket kaydı bulunamadı");
    if (
      existing.source !== "ADMIN" ||
      !existing.active ||
      existing.scope !== "PERSONAL" ||
      !existing.userId
    ) {
      throw conflictError("Yalnızca etkin kişisel yönetici paketleri değiştirilebilir");
    }
    const now = new Date();
    if (existing.effectiveAt > now || (existing.expiresAt && existing.expiresAt <= now)) {
      throw conflictError("Yalnızca şu anda etkin paket değiştirilebilir");
    }
    const context = await resolveUniquePersonalContext(tx, existing.userId);
    if (context.tenantId !== existing.tenantId) {
      throw conflictError("Paketin bağlı olduğu kişisel çalışma alanı doğrulanamadı");
    }
    if (input.effectiveAt < now) throw validationError("Değişiklik başlangıcı geçmişte olamaz");
    const conflicting = await tx.entitlement.findMany({
      where: {
        tenantId: existing.tenantId,
        scope: "PERSONAL",
        userId: existing.userId,
        active: true,
        id: { not: id },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    if (conflicting.length) {
      throw conflictError("Aynı bağlamda başka bir etkin paket kaydı bulundu");
    }
    const nextExpiresAt = input.expiresAt === undefined ? existing.expiresAt : input.expiresAt;
    if (nextExpiresAt && nextExpiresAt <= input.effectiveAt) {
      throw validationError("Yeni bitiş tarihi başlangıç tarihinden sonra olmalı");
    }

    const oldExpiresAt = existing.expiresAt;
    const closed = await tx.entitlement.update({
      where: { id },
      data: {
        expiresAt:
          oldExpiresAt === null || input.effectiveAt < oldExpiresAt
            ? input.effectiveAt
            : oldExpiresAt,
      },
      select: entitlementSelect,
    });
    const created = await tx.entitlement.create({
      data: {
        userId: existing.userId,
        tenantId: existing.tenantId,
        scope: "PERSONAL",
        plan: input.plan,
        source: "ADMIN",
        active: true,
        effectiveAt: input.effectiveAt,
        expiresAt: nextExpiresAt,
      },
      select: entitlementSelect,
    });
    await writeEntitlementAudit(tx, actorUserId, null, "UPDATE", closed.id, existing, closed);
    await writeEntitlementAudit(tx, actorUserId, null, "CREATE", created.id, null, created);
    return { closed, created };
  });
  return { previous: toPublicEntitlement(rows.closed), current: toPublicEntitlement(rows.created) };
}

async function lockManagedEntitlementContext(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scope: EntitlementScope,
  userId: string | null,
) {
  const lockKey = `managed-entitlement:${tenantId}:${scope}:${userId ?? "organization"}`;
  await tx.$queryRaw`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;
}

async function resolveUniquePersonalContext(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, deletedAt: null, status: "ACTIVE", platformRole: null },
    select: { id: true },
  });
  if (!user) throw notFoundError("Etkin bireysel kullanıcı bulunamadı");
  const memberships = await tx.membership.findMany({
    where: { userId, tenant: { type: "INDIVIDUAL" } },
    select: {
      tenantId: true,
      role: true,
      status: true,
      deletedAt: true,
      tenant: { select: { id: true, type: true, status: true, deletedAt: true } },
    },
  });
  const contexts = new Map(memberships.map((item) => [item.tenantId, item.tenant]));
  if (contexts.size !== 1) {
    throw conflictError(
      contexts.size === 0
        ? "Kullanıcının kişisel çalışma alanı bulunamadı"
        : "Birden fazla kişisel çalışma alanı bulundu; önce veri bütünlüğü incelenmeli",
    );
  }
  const tenant = [...contexts.values()][0]!;
  const validStudentMembership = memberships.some(
    (item) =>
      item.tenantId === tenant.id &&
      item.role === "STUDENT" &&
      item.status === "ACTIVE" &&
      item.deletedAt === null,
  );
  if (tenant.deletedAt || tenant.status !== "ACTIVE" || !validStudentMembership) {
    throw conflictError("Kişisel çalışma alanı güvenle doğrulanamadı; paket işlemi durduruldu");
  }
  return { tenantId: tenant.id, tenantType: "INDIVIDUAL" as const };
}

async function resolveOrganizationContext(tx: Prisma.TransactionClient, tenantId: string) {
  const tenant = await tx.tenant.findFirst({
    where: { id: tenantId, type: "ORGANIZATION", status: "ACTIVE", deletedAt: null },
    select: { id: true, type: true },
  });
  if (!tenant) throw notFoundError("Etkin kurum bulunamadı");
  return { tenantId: tenant.id, tenantType: tenant.type };
}

async function writeEntitlementAudit(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  tenantId: string | null,
  action: "CREATE" | "UPDATE",
  entityId: string,
  before: EntitlementRecord | null,
  after: EntitlementRecord,
) {
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      action,
      entityType: "ENTITLEMENT",
      entityId,
      ...(before ? { before: auditState(before) } : {}),
      after: auditState(after),
    },
  });
}

async function validateTarget(tenantId: string, scope: EntitlementScope, userId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, type: true },
  });
  if (!tenant) throw notFoundError("Kurum bulunamadı");
  if (scope === "PERSONAL") {
    if (tenant.type !== "INDIVIDUAL" || !userId) {
      throw validationError(
        "Kişisel paket yalnızca bireysel kurum ve kullanıcı için tanımlanabilir",
      );
    }
    const membership = await prisma.membership.findFirst({
      where: { tenantId, userId, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (!membership) throw validationError("Kullanıcının bu bireysel kurumda aktif üyeliği yok");
  } else if (tenant.type !== "ORGANIZATION" || userId !== null) {
    throw validationError("Kurum paketinde kullanıcı seçilemez");
  }
  return { tenantId: tenant.id, tenantType: tenant.type };
}

function toPublicEntitlement(row: EntitlementRecord) {
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    tenantType: row.tenant.type,
    scope: row.scope,
    plan: row.plan,
    active: row.active,
    source: row.source,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function auditState(row: EntitlementRecord): Prisma.InputJsonValue {
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    scope: row.scope,
    plan: row.plan,
    active: row.active,
    source: row.source,
    effectiveAt: row.effectiveAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
