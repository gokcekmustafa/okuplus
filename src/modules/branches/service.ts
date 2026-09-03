import { Prisma, type BranchStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateBranchInput,
  ListBranchesQuery,
  UpdateBranchInput,
  UpdateBranchManagerInput,
  UpdateBranchStatusInput,
} from "./schemas.js";

/**
 * Şube yönetimi servisi (yalnızca SUPER_ADMIN).
 *
 * Şube oluşturma kuralları:
 *  - Tenant var olmalı, soft-delete edilmemiş olmalı (aksi halde 404).
 *  - Tenant tipi ORGANIZATION olmalı (INDIVIDUAL → 400).
 *  - Tenant durumu ACTIVE olmalı (SUSPENDED/CLOSED → 400).
 *  - Şube kodu tenant içinde tektir (`@@unique([tenantId, code])`).
 *  - Şube adı tenant içinde silinmemiş kayıtlar için tektir
 *    (`uq_branch_active_name` partial unique index). Soft-delete edilmiş bir
 *    şubenin adı yeniden kullanılabilir.
 *  - Müdür (managerUserId) opsiyoneldir; verilirse kullanıcı silinmemiş,
 *    ACTIVE durumda ve ilgili tenant'ta ACTIVE Membership + BRANCH_MANAGER
 *    rolüne sahip olmalıdır (cross-tenant atama engellenir).
 *
 * Şube silme SOFT-DELETE'tir (deletedAt); fiziksel silme yoktur. Sınıf,
 * öğretmen üyeliği ve tarihçe korunur. CLOSED durumu silme değildir;
 * şube CLOSED olsa bile yönetilebilir kalır.
 */

const BRANCH_LIST_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  code: true,
  address: true,
  phone: true,
  status: true,
  managerUserId: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
  manager: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.BranchSelect;

const BRANCH_DETAIL_SELECT = {
  ...BRANCH_LIST_SELECT,
  manager: { select: { id: true, displayName: true, email: true, status: true, deletedAt: true } },
} satisfies Prisma.BranchSelect;

export interface BranchListItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  status: BranchStatus;
  managerUserId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  classCount: number;
  teacherCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchListResult {
  items: BranchListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BranchDetail extends BranchListItem {
  tenantStatus: string;
  manager: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    deletedAt: Date | null;
  } | null;
}

export interface BranchManagerOption {
  id: string;
  displayName: string;
  email: string | null;
}

export async function listBranches(query: ListBranchesQuery): Promise<BranchListResult> {
  const { search, tenantId, status, page, pageSize } = query;

  const where: Prisma.BranchWhereInput = {
    deletedAt: null,
    tenant: { deletedAt: null },
    ...(tenantId ? { tenantId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      select: BRANCH_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.branch.count({ where }),
  ]);

  // Şube başına aktif sınıf / aktif öğretmen üyeliği sayıları.
  const branchIds = rows.map((r) => r.id);
  const [classGroups, teacherGroups] =
    branchIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.class.groupBy({
            by: ["branchId"],
            where: {
              branchId: { in: branchIds },
              deletedAt: null,
              tenant: { deletedAt: null },
            },
            _count: { _all: true },
          }),
          prisma.teacherBranchMembership.groupBy({
            by: ["branchId"],
            where: {
              branchId: { in: branchIds },
              status: "ACTIVE",
              deletedAt: null,
              tenant: { deletedAt: null },
            },
            _count: { _all: true },
          }),
        ]);
  const classCountBy = new Map(classGroups.map((g) => [g.branchId, g._count._all]));
  const teacherCountBy = new Map(teacherGroups.map((g) => [g.branchId, g._count._all]));

  return {
    items: rows.map(({ tenant, manager, ...b }) => ({
      id: b.id,
      tenantId: tenant.id,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      tenantType: tenant.type,
      name: b.name,
      code: b.code,
      address: b.address,
      phone: b.phone,
      status: b.status,
      managerUserId: b.managerUserId,
      managerName: manager ? manager.displayName : null,
      managerEmail: manager ? manager.email : null,
      classCount: classCountBy.get(b.id) ?? 0,
      teacherCount: teacherCountBy.get(b.id) ?? 0,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getBranch(id: string): Promise<BranchDetail> {
  const row = await prisma.branch.findFirst({
    where: { id, deletedAt: null, tenant: { deletedAt: null } },
    select: BRANCH_DETAIL_SELECT,
  });
  if (!row) {
    throw notFoundError("Şube bulunamadı");
  }

  const [classCount, teacherCount] = await Promise.all([
    prisma.class.count({ where: { branchId: id, deletedAt: null } }),
    prisma.teacherBranchMembership.count({
      where: { branchId: id, status: "ACTIVE", deletedAt: null },
    }),
  ]);

  return toDetail(row, classCount, teacherCount);
}

export async function createBranch(input: CreateBranchInput): Promise<BranchDetail> {
  const tenant = await prisma.tenant.findFirst({ where: { id: input.tenantId, deletedAt: null } });
  if (!tenant) {
    throw notFoundError("Kurum bulunamadı");
  }
  if (tenant.type === "INDIVIDUAL") {
    throw validationError("Bireysel kurumda şube oluşturulamaz");
  }
  if (tenant.status !== "ACTIVE") {
    throw validationError("Kurum aktif değil; şube oluşturulamaz");
  }

  if (input.managerUserId) {
    await assertManagerEligible(input.managerUserId, tenant.id);
  }

  try {
    const created = await prisma.branch.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        code: input.code,
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.managerUserId !== undefined && input.managerUserId !== null
          ? { managerUserId: input.managerUserId }
          : {}),
      },
      select: { id: true },
    });
    return await getBranch(created.id);
  } catch (err) {
    throw translateBranchError(err);
  }
}

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<BranchDetail> {
  const branch = await prisma.branch.findFirst({
    where: { id, deletedAt: null, tenant: { deletedAt: null } },
    select: { id: true },
  });
  if (!branch) {
    throw notFoundError("Şube bulunamadı");
  }

  try {
    await prisma.branch.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
    return await getBranch(id);
  } catch (err) {
    throw translateBranchError(err);
  }
}

export async function updateBranchStatus(
  id: string,
  input: UpdateBranchStatusInput,
): Promise<BranchDetail> {
  const branch = await prisma.branch.findFirst({
    where: { id, deletedAt: null, tenant: { deletedAt: null } },
    select: { id: true },
  });
  if (!branch) {
    throw notFoundError("Şube bulunamadı");
  }

  await prisma.branch.update({
    where: { id },
    data: { status: input.status },
  });
  return await getBranch(id);
}

export async function updateBranchManager(
  id: string,
  input: UpdateBranchManagerInput,
): Promise<BranchDetail> {
  const branch = await prisma.branch.findFirst({
    where: { id, deletedAt: null, tenant: { deletedAt: null } },
    select: { id: true, tenantId: true },
  });
  if (!branch) {
    throw notFoundError("Şube bulunamadı");
  }

  if (input.managerUserId === null) {
    await prisma.branch.update({
      where: { id },
      data: { managerUserId: null },
    });
    return await getBranch(id);
  }

  await assertManagerEligible(input.managerUserId, branch.tenantId);
  await prisma.branch.update({
    where: { id },
    data: { managerUserId: input.managerUserId },
  });
  return await getBranch(id);
}

export async function softDeleteBranch(id: string): Promise<{ id: string; deletedAt: Date }> {
  const branch = await prisma.branch.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!branch) {
    throw notFoundError("Şube bulunamadı");
  }

  const updated = await prisma.branch.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteBranch: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// ---------- Müdür seçimi (okuma amaçlı lookup) ----------

export async function listBranchManagers(tenantId: string): Promise<BranchManagerOption[]> {
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!tenant) {
    throw notFoundError("Kurum bulunamadı");
  }
  // Bireysel kurumda şube müdürü kavramı yoktur.
  if (tenant.type === "INDIVIDUAL") {
    return [];
  }

  const memberships = await prisma.membership.findMany({
    where: {
      tenantId,
      role: "BRANCH_MANAGER",
      status: "ACTIVE",
      deletedAt: null,
      user: { deletedAt: null, status: "ACTIVE" },
    },
    select: {
      userId: true,
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return memberships.map((m) => ({
    id: m.user.id,
    displayName: m.user.displayName,
    email: m.user.email,
  }));
}

// ---------- Yardımcılar ----------

async function assertManagerEligible(managerUserId: string, tenantId: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: managerUserId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!user) {
    throw validationError("Müdür olarak atanacak kullanıcı bulunamadı");
  }
  if (user.status !== "ACTIVE") {
    throw validationError("Müdür olarak atanacak kullanıcı aktif değil");
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: managerUserId,
      tenantId,
      role: "BRANCH_MANAGER",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) {
    throw validationError("Seçilen kullanıcı bu kurumda aktif şube müdürü değil");
  }
}

function toDetail(
  row: {
    id: string;
    tenantId: string;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    status: BranchStatus;
    managerUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    tenant: { id: string; name: string; type: string; status: string; deletedAt: Date | null };
    manager: {
      id: string;
      displayName: string;
      email: string | null;
      status: string;
      deletedAt: Date | null;
    } | null;
  },
  classCount: number,
  teacherCount: number,
): BranchDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant.deletedAt ? `${row.tenant.name} (silindi)` : row.tenant.name,
    tenantType: row.tenant.type,
    tenantStatus: row.tenant.status,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    status: row.status,
    managerUserId: row.managerUserId,
    managerName: row.manager ? row.manager.displayName : null,
    managerEmail: row.manager ? row.manager.email : null,
    manager: row.manager,
    classCount,
    teacherCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function translateBranchError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target)
        ? String(err.meta.target)
        : String(err.meta?.target ?? "");
      if (
        target.toLowerCase().includes("uq_branch_active_name") ||
        target.toLowerCase().includes("name")
      ) {
        throw conflictError("Bu kurumda aynı ada sahip aktif bir şube zaten mevcut");
      }
      if (target.toLowerCase().includes("code")) {
        throw conflictError("Bu kurumda bu şube kodu zaten kullanımda");
      }
      throw conflictError("Kayıt çakışması");
    }
  }
  throw err;
}
