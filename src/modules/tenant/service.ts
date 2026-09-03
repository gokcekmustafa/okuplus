import { Prisma, type Tenant, type TenantType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError } from "../../lib/errors.js";
import type {
  CreateTenantInput,
  ListTenantsQuery,
  UpdateTenantInput,
  UpdateTenantStatusInput,
} from "./schemas.js";

/**
 * Tenant / Kurum yönetimi servisi (yalnızca platform yetkilileri için).
 *
 * Tenant tablosunda RLS yoktur; erişim route katmanındaki requirePlatformRole
 * guard'ıyla sınırlanır. Bu servis prisma singleton'ı (süper kullanıcı)
 * üzerinden çalışır; RLS'i bypass eden YENİ bir mekanizma içermez.
 */

export interface TenantListItem {
  id: string;
  type: TenantType;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  status: Tenant["status"];
  createdAt: Date;
  updatedAt: Date;
  membershipCount: number;
}

export interface TenantListResult {
  items: TenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const LIST_SELECT = {
  id: true,
  type: true,
  name: true,
  slug: true,
  logoUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true } },
} satisfies Prisma.TenantSelect;

const DETAIL_SELECT = {
  id: true,
  type: true,
  name: true,
  slug: true,
  logoUrl: true,
  settings: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: {
    select: {
      memberships: true,
      branches: true,
      classes: true,
      contents: true,
      assignments: true,
    },
  },
} satisfies Prisma.TenantSelect;

export interface TenantDetail {
  id: string;
  type: TenantType;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  settings: unknown;
  status: Tenant["status"];
  createdAt: Date;
  updatedAt: Date;
  counts: {
    memberships: number;
    branches: number;
    classes: number;
    contents: number;
    assignments: number;
  };
}

export async function listTenants(query: ListTenantsQuery): Promise<TenantListResult> {
  const { search, status, page, pageSize } = query;

  const where: Prisma.TenantWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    items: rows.map(({ _count, ...t }) => ({ ...t, membershipCount: _count.memberships })),
    total,
    page,
    pageSize,
  };
}

export async function getTenant(id: string): Promise<TenantDetail> {
  const row = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    select: DETAIL_SELECT,
  });

  if (!row) {
    throw notFoundError("Kurum bulunamadı");
  }

  const { _count, deletedAt: _deletedAt, ...rest } = row;
  return {
    ...rest,
    counts: {
      memberships: _count.memberships,
      branches: _count.branches,
      classes: _count.classes,
      contents: _count.contents,
      assignments: _count.assignments,
    },
  };
}

export async function createTenant(input: CreateTenantInput): Promise<TenantDetail> {
  const data: Prisma.TenantCreateInput = {
    type: input.type,
    name: input.name,
    ...(input.slug !== undefined && input.slug !== null ? { slug: input.slug } : {}),
    ...(input.logoUrl !== undefined && input.logoUrl !== null ? { logoUrl: input.logoUrl } : {}),
    ...(input.settings !== undefined && input.settings !== null
      ? { settings: input.settings as Prisma.InputJsonValue }
      : {}),
  };

  try {
    await assertSlugAvailable(input.slug ?? null);
    const created = await prisma.tenant.create({ data, select: DETAIL_SELECT });
    return toDetail(created);
  } catch (err) {
    throw translateCreateError(err);
  }
}

export async function updateTenant(id: string, input: UpdateTenantInput): Promise<TenantDetail> {
  const existing = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw notFoundError("Kurum bulunamadı");
  }

  if ("slug" in input && input.slug !== existing.slug) {
    await assertSlugAvailable(input.slug ?? null, id);
  }

  const data: Prisma.TenantUpdateInput = {
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    ...(input.settings !== undefined
      ? {
          settings:
            input.settings === null ? Prisma.DbNull : (input.settings as Prisma.InputJsonValue),
        }
      : {}),
  };

  try {
    const updated = await prisma.tenant.update({ where: { id }, data, select: DETAIL_SELECT });
    return toDetail(updated);
  } catch (err) {
    throw translateUpdateError(err);
  }
}

export async function updateTenantStatus(
  id: string,
  input: UpdateTenantStatusInput,
): Promise<TenantDetail> {
  const existing = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw notFoundError("Kurum bulunamadı");
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: { status: input.status },
    select: DETAIL_SELECT,
  });
  return toDetail(updated);
}

export async function softDeleteTenant(id: string): Promise<{ id: string; deletedAt: Date }> {
  const existing = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw notFoundError("Kurum bulunamadı");
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteTenant: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// -------- özel yardımcılar --------

async function assertSlugAvailable(slug: string | null, excludeId?: string): Promise<void> {
  if (!slug) return;

  const clash = await prisma.tenant.findFirst({
    where: {
      type: "ORGANIZATION",
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (clash) {
    throw conflictError("Bu slug zaten kullanımda");
  }
}

function toDetail(row: {
  id: string;
  type: TenantType;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  settings: unknown;
  status: Tenant["status"];
  createdAt: Date;
  updatedAt: Date;
  _count: {
    memberships: number;
    branches: number;
    classes: number;
    contents: number;
    assignments: number;
  };
}): TenantDetail {
  const { _count, ...rest } = row;
  return {
    ...rest,
    counts: {
      memberships: _count.memberships,
      branches: _count.branches,
      classes: _count.classes,
      contents: _count.contents,
      assignments: _count.assignments,
    },
  };
}

function translateCreateError(err: unknown): never {
  if (isUniqueViolation(err, "uq_tenant_slug_org")) {
    throw conflictError("Bu slug zaten kullanımda");
  }
  throw err;
}

function translateUpdateError(err: unknown): never {
  if (isUniqueViolation(err, "uq_tenant_slug_org")) {
    throw conflictError("Bu slug zaten kullanımda");
  }
  throw err;
}

function isUniqueViolation(err: unknown, index: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).some((t) => String(t).toLowerCase().includes(index.toLowerCase()))
  );
}
