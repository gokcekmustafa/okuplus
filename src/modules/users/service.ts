import { Prisma, type Membership, type TenantType, type User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError } from "../../lib/errors.js";
import { ScryptPasswordHasher } from "../auth/index.js";
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from "./schemas.js";

/**
 * User + Membership yönetimi servisi (yalnızca SUPER_ADMIN için).
 *
 * RLS: Tenant tablosunda RLS yoktur; User/Membership tablolarında RLS vardır
 * ancak prisma singleton süper kullanıcı olarak bağlandığından BYPASSRLS ile
 * çalışır (mevcut mimari — RLS'i bypass eden yeni bir yöntem yoktur). Erişim
 * route katmanındaki requirePlatformRole guard'ıyla sınırlanır.
 */

const hasher = new ScryptPasswordHasher();

const USER_LIST_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  birthYear: true,
  status: true,
  platformRole: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true } },
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  birthYear: true,
  status: true,
  platformRole: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

export interface UserListItem {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  birthYear: number | null;
  status: User["status"];
  platformRole: User["platformRole"];
  createdAt: Date;
  updatedAt: Date;
  membershipCount: number;
}

export interface UserDetail {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  birthYear: number | null;
  status: User["status"];
  platformRole: User["platformRole"];
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  memberships: MembershipSummary[];
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantStatus: string;
  role: Membership["role"];
  status: Membership["status"];
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface UserListResult {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listUsers(query: ListUsersQuery): Promise<UserListResult> {
  const { search, status, page, pageSize } = query;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(({ _count, ...u }) => ({ ...u, membershipCount: _count.memberships })),
    total,
    page,
    pageSize,
  };
}

export async function getUser(id: string): Promise<UserDetail> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: USER_DETAIL_SELECT,
  });

  if (!user) {
    throw notFoundError("Kullanıcı bulunamadı");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: id },
    select: {
      id: true,
      role: true,
      status: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    ...user,
    memberships: memberships.map(({ tenant, ...m }) => ({
      id: m.id,
      tenantId: tenant.id,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      tenantType: tenant.type,
      tenantStatus: tenant.status,
      role: m.role,
      status: m.status,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      createdAt: m.createdAt,
    })),
  };
}

export async function createUser(input: CreateUserInput): Promise<UserDetail> {
  const passwordHash = await hasher.hash(input.password);

  try {
    const created = await prisma.user.create({
      data: {
        displayName: input.displayName,
        email: input.email,
        ...(input.phone !== undefined && input.phone !== null ? { phone: input.phone } : {}),
        ...(input.birthYear !== undefined && input.birthYear !== null
          ? { birthYear: input.birthYear }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        passwordHash,
      },
      select: USER_DETAIL_SELECT,
    });
    return toUserDetail(created, []);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflictError("Bu e-posta adresi zaten kullanımda");
    }
    throw err;
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserDetail> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw notFoundError("Kullanıcı bulunamadı");
  }

  const data: Prisma.UserUpdateInput = {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: USER_DETAIL_SELECT,
    });
    const memberships = await findMembershipSummaries(id);
    return toUserDetail(updated, memberships);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflictError("Bu e-posta adresi zaten kullanımda");
    }
    throw err;
  }
}

export async function softDeleteUser(id: string): Promise<{ id: string; deletedAt: Date }> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw notFoundError("Kullanıcı bulunamadı");
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteUser: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// -------- membership yardımcıları --------

async function findMembershipSummaries(userId: string): Promise<MembershipSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      id: true,
      role: true,
      status: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return memberships.map(({ tenant, ...m }) => ({
    id: m.id,
    tenantId: tenant.id,
    tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
    tenantType: tenant.type,
    tenantStatus: tenant.status,
    role: m.role,
    status: m.status,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    createdAt: m.createdAt,
  }));
}

function toUserDetail(
  user: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    birthYear: number | null;
    status: User["status"];
    platformRole: User["platformRole"];
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  memberships: MembershipSummary[],
): UserDetail {
  return { ...user, memberships };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
