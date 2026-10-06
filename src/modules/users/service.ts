import { Prisma, type Membership, type TenantType, type User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError } from "../../lib/errors.js";
import { ScryptPasswordHasher } from "../auth/index.js";
import type {
  CreateUserInput,
  ListUsersQuery,
  ResetUserPasswordInput,
  UpdateUserInput,
} from "./schemas.js";

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
  nationalId: true,
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
  nationalId: string | null;
  birthYear: number | null;
  status: User["status"];
  platformRole: User["platformRole"];
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  memberships: MembershipSummary[];
  branches: UserBranchSummary[];
  classAssignments: UserClassAssignmentSummary[];
  enrollments: UserEnrollmentSummary[];
  entitlements: UserEntitlementSummary[];
}

export interface UserBranchSummary {
  id: string;
  name: string;
  tenantId: string;
  tenantName: string;
  status: string;
}

export interface UserClassAssignmentSummary {
  id: string;
  classId: string;
  className: string;
  tenantId: string;
  tenantName: string;
  branchName: string;
  academicYearName: string;
  status: string;
  subject: string | null;
}

export interface UserEnrollmentSummary {
  id: string;
  classId: string;
  className: string;
  tenantId: string;
  tenantName: string;
  branchName: string;
  academicYearName: string;
  status: string;
  enrolledAt: Date;
  leftAt: Date | null;
}

export interface UserEntitlementSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  scope: string;
  plan: string;
  active: boolean;
  source: string;
  effectiveAt: Date;
  expiresAt: Date | null;
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

  const tenantIds = memberships.map((membership) => membership.tenant.id);
  const [branches, classAssignments, enrollments, entitlements] = await Promise.all([
    prisma.teacherBranchMembership.findMany({
      where: { teacherId: id },
      select: {
        id: true,
        status: true,
        branch: { select: { id: true, name: true, tenant: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teacherClassAssignment.findMany({
      where: { teacherId: id },
      select: {
        id: true,
        status: true,
        subject: true,
        class: {
          select: {
            id: true,
            name: true,
            branch: { select: { name: true } },
            academicYear: { select: { name: true } },
            tenant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.enrollment.findMany({
      where: { studentId: id },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        class: {
          select: {
            id: true,
            name: true,
            branch: { select: { name: true } },
            academicYear: { select: { name: true } },
            tenant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.entitlement.findMany({
      where: {
        OR: [
          { userId: id },
          ...(tenantIds.length
            ? [{ tenantId: { in: tenantIds }, scope: "ORGANIZATION" as const, userId: null }]
            : []),
        ],
      },
      select: {
        id: true,
        tenantId: true,
        scope: true,
        plan: true,
        active: true,
        source: true,
        effectiveAt: true,
        expiresAt: true,
        tenant: { select: { name: true, type: true } },
      },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

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
    branches: branches.map((item) => ({
      id: item.id,
      name: item.branch.name,
      tenantId: item.branch.tenant.id,
      tenantName: item.branch.tenant.name,
      status: item.status,
    })),
    classAssignments: classAssignments.map((item) => ({
      id: item.id,
      classId: item.class.id,
      className: item.class.name,
      tenantId: item.class.tenant.id,
      tenantName: item.class.tenant.name,
      branchName: item.class.branch.name,
      academicYearName: item.class.academicYear.name,
      status: item.status,
      subject: item.subject,
    })),
    enrollments: enrollments.map((item) => ({
      id: item.id,
      classId: item.class.id,
      className: item.class.name,
      tenantId: item.class.tenant.id,
      tenantName: item.class.tenant.name,
      branchName: item.class.branch.name,
      academicYearName: item.class.academicYear.name,
      status: item.status,
      enrolledAt: item.enrolledAt,
      leftAt: item.leftAt,
    })),
    entitlements: entitlements.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      tenantName: item.tenant.name,
      tenantType: item.tenant.type,
      scope: item.scope,
      plan: item.plan,
      active: item.active,
      source: item.source,
      effectiveAt: item.effectiveAt,
      expiresAt: item.expiresAt,
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
        ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
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
      throw conflictError(uniqueViolationMessage(err));
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
    ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
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
      throw conflictError(uniqueViolationMessage(err));
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

export async function resetUserPassword(
  id: string,
  input: ResetUserPasswordInput,
  actorUserId: string,
): Promise<{ id: string; updated: true }> {
  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFoundError("Kullanıcı bulunamadı");
  const passwordHash = await hasher.hash(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await tx.auditLog.create({
      data: {
        tenantId: null,
        actorUserId,
        action: "UPDATE",
        entityType: "USER_PASSWORD",
        entityId: id,
        before: { changed: true },
        after: { changed: true },
      },
    });
  });
  return { id, updated: true };
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
    nationalId: string | null;
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
  return {
    ...user,
    memberships,
    branches: [],
    classAssignments: [],
    enrollments: [],
    entitlements: [],
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function uniqueViolationMessage(err: unknown): string {
  const target = String((err as Prisma.PrismaClientKnownRequestError).meta?.target ?? "");
  return target.toLowerCase().includes("nationalid")
    ? "Bu TC Kimlik No zaten kullanımda"
    : "Bu e-posta adresi zaten kullanımda";
}
