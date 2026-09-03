import { Prisma, type Membership } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateMembershipInput,
  ListMembershipsQuery,
  UpdateMembershipInput,
} from "./schemas.js";

/**
 * Membership yönetimi servisi (yalnızca SUPER_ADMIN için).
 *
 * KURALLAR:
 *  - Bireysel kullanıcı kuralı: bir kullanıcı yalnızca bir INDIVIDUAL tenant'a
 *    üye olabilir (ACTIVE/PENDING). ORGANIZATION tenant'lara birden fazla üye
 *    olabilir. Bu kural app katmanında kontrol edilir; DB index'i (parcial
 *    unique) değiştirilmemiştir.
 *  - ACTIVE/PENDING duplicate: aynı tenant+user+role için DB'deki
 *    `uq_membership_active` partial unique index'i engeller (P2002 → conflict).
 *  - Bireysel hesap rol kuralı: INDIVIDUAL tenant'ta yalnızca bireysel rollere
 *    (STUDENT, PARENT) izin verilir; kurumsal roller (OWNER, ORG_ADMIN,
 *    BRANCH_MANAGER, TEACHER) kullanılamaz.
 */

const INDIVIDUAL_ALLOWED_ROLES = new Set(["STUDENT", "PARENT"]);

function assertIndividualRole(tenantType: string, role: string): void {
  if (tenantType === "INDIVIDUAL" && !INDIVIDUAL_ALLOWED_ROLES.has(role)) {
    throw validationError(
      "Bireysel kurumda yalnızca bireysel roller (Öğrenci, Veli) kullanılabilir",
    );
  }
}

const MEMBERSHIP_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  role: true,
  status: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { name: true, type: true, status: true, deletedAt: true } },
  user: { select: { displayName: true, email: true } },
} satisfies Prisma.MembershipSelect;

export interface MembershipRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  tenantStatus: string;
  userId: string;
  userDisplayName: string;
  userEmail: string | null;
  role: Membership["role"];
  status: Membership["status"];
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipListResult {
  items: MembershipRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listMemberships(query: ListMembershipsQuery): Promise<MembershipListResult> {
  const { tenantId, userId, role, status, search, page, pageSize } = query;

  const where: Prisma.MembershipWhereInput = {
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { user: { displayName: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { tenant: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      select: MEMBERSHIP_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.membership.count({ where }),
  ]);

  return { items: rows.map(toMembershipRow), total, page, pageSize };
}

export async function createMembership(input: CreateMembershipInput): Promise<MembershipRow> {
  const tenant = await prisma.tenant.findFirst({ where: { id: input.tenantId, deletedAt: null } });
  if (!tenant) {
    throw notFoundError("Kurum bulunamadı");
  }

  const user = await prisma.user.findFirst({ where: { id: input.userId, deletedAt: null } });
  if (!user) {
    throw notFoundError("Kullanıcı bulunamadı");
  }

  // Bireysel hesap rol kuralı: INDIVIDUAL tenant'ta kurumsal roller kullanılamaz.
  assertIndividualRole(tenant.type, input.role);

  // Bireysel kullanıcı kuralı: INDIVIDUAL tenant'a ikinci üyelik engellenir.
  if (tenant.type === "INDIVIDUAL" && (input.status === "ACTIVE" || input.status === "PENDING")) {
    const existingIndividual = await prisma.membership.findFirst({
      where: {
        userId: input.userId,
        status: { in: ["ACTIVE", "PENDING"] },
        tenant: { type: "INDIVIDUAL", deletedAt: null },
      },
      select: { tenantId: true },
    });
    if (existingIndividual) {
      throw conflictError("Bir kullanıcı yalnızca bir bireysel (INDIVIDUAL) kuruma üye olabilir");
    }
  }

  const now = new Date();
  try {
    const created = await prisma.membership.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        role: input.role,
        status: input.status,
        startedAt: input.status === "ACTIVE" ? now : null,
      },
      select: MEMBERSHIP_SELECT,
    });
    return toMembershipRow(created);
  } catch (err) {
    throw translateMembershipError(err);
  }
}

export async function updateMembership(
  id: string,
  input: UpdateMembershipInput,
): Promise<MembershipRow> {
  const existing = await prisma.membership.findUnique({ where: { id } });
  if (!existing) {
    throw notFoundError("Üyelik bulunamadı");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: existing.tenantId },
    select: { type: true },
  });

  // Bireysel hesap rol kuralı: rol değişikliğinde de uygulanır.
  if (input.role !== undefined && tenant) {
    assertIndividualRole(tenant.type, input.role);
  }

  // Bireysel kural: role/status değişikliği sırasında kullanıcının başka bir
  // INDIVIDUAL tenant'ta ACTIVE/PENDING üyeliği olamaz (kendi kaydı hariç).
  const roleChangedToActive =
    input.role !== undefined || input.status === "ACTIVE" || input.status === "PENDING";
  if (roleChangedToActive && input.status !== "INACTIVE" && input.status !== "REMOVED") {
    if (tenant?.type === "INDIVIDUAL") {
      const clash = await prisma.membership.findFirst({
        where: {
          userId: existing.userId,
          id: { not: existing.id },
          status: { in: ["ACTIVE", "PENDING"] },
          tenant: { type: "INDIVIDUAL", deletedAt: null },
        },
        select: { tenantId: true },
      });
      if (clash) {
        throw conflictError("Bir kullanıcı yalnızca bir bireysel (INDIVIDUAL) kuruma üye olabilir");
      }
    }
  }

  const data: Prisma.MembershipUpdateInput = {
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.status === "ACTIVE" && existing.startedAt === null ? { startedAt: new Date() } : {}),
    ...(input.status === "REMOVED" || input.status === "INACTIVE" ? { endedAt: new Date() } : {}),
  };

  try {
    const updated = await prisma.membership.update({
      where: { id },
      data,
      select: MEMBERSHIP_SELECT,
    });
    return toMembershipRow(updated);
  } catch (err) {
    throw translateMembershipError(err);
  }
}

export async function removeMembership(id: string): Promise<{ id: string; removed: true }> {
  const existing = await prisma.membership.findUnique({ where: { id } });
  if (!existing) {
    throw notFoundError("Üyelik bulunamadı");
  }

  await prisma.membership.update({
    where: { id },
    data: { status: "REMOVED", endedAt: new Date(), deletedAt: new Date() },
  });

  return { id, removed: true };
}

function toMembershipRow(row: {
  id: string;
  tenantId: string;
  userId: string;
  role: Membership["role"];
  status: Membership["status"];
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { name: string; type: string; status: string; deletedAt: Date | null };
  user: { displayName: string; email: string | null };
}): MembershipRow {
  const { tenant, user, ...m } = row;
  return {
    ...m,
    tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
    tenantType: tenant.type,
    tenantStatus: tenant.status,
    userDisplayName: user.displayName,
    userEmail: user.email,
  };
}

function translateMembershipError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw conflictError("Bu kurumda aynı rol için aktif/pending üyelik zaten mevcut");
  }
  throw err;
}
