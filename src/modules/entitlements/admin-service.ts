import { Prisma, type EntitlementScope } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateEntitlementInput,
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
  const existing = await prisma.entitlement.findUnique({
    where: { id },
    select: entitlementSelect,
  });
  if (!existing) throw notFoundError("Paket kaydı bulunamadı");
  const data: Prisma.EntitlementUpdateInput = {
    ...(input.plan !== undefined ? { plan: input.plan } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.effectiveAt !== undefined ? { effectiveAt: input.effectiveAt } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (Object.keys(data).length === 0) throw validationError("Güncellenecek paket alanı gerekli");
  const nextEffectiveAt = input.effectiveAt ?? existing.effectiveAt;
  const nextExpiresAt = input.expiresAt === undefined ? existing.expiresAt : input.expiresAt;
  if (nextExpiresAt && nextExpiresAt <= nextEffectiveAt) {
    throw validationError("Bitiş tarihi başlangıç tarihinden sonra olmalı");
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (input.active === true) {
      await tx.entitlement.updateMany({
        where: {
          tenantId: existing.tenantId,
          scope: existing.scope,
          userId: existing.userId,
          active: true,
          id: { not: id },
        },
        data: { active: false },
      });
    }
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
