import type { MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, notFoundError } from "../../lib/errors.js";

export type OrganizationAdminRole = "OWNER" | "ORG_ADMIN" | "BRANCH_MANAGER";

export interface OrganizationActorInput {
  userId: string;
  tenantId: string | null;
  role: MembershipRole | null;
  platformRole: null;
}

export interface OrganizationScope {
  userId: string;
  tenantId: string;
  role: OrganizationAdminRole;
  branchIds: string[];
}

type DbClient = Prisma.TransactionClient | typeof prisma;

const ADMIN_ROLES: OrganizationAdminRole[] = ["OWNER", "ORG_ADMIN"];

/**
 * Organization kapsamını Membership + Branch.managerUserId üzerinden çözer.
 * TenantId ve branchId yalnızca filtre değildir; her mutation öncesi burada
 * tekrar doğrulanır. Platform kullanıcıları bu servise yanlışlıkla düşemez.
 */
export async function resolveOrganizationScope(
  actor: OrganizationActorInput,
  client: DbClient = prisma,
): Promise<OrganizationScope> {
  if (actor.platformRole !== null || !actor.tenantId) {
    throw forbiddenError("Kurum yönetimi için organization context gerekli");
  }

  const requestedRole = actor.role;
  if (
    requestedRole !== "OWNER" &&
    requestedRole !== "ORG_ADMIN" &&
    requestedRole !== "BRANCH_MANAGER"
  ) {
    throw forbiddenError("Bu işlem için kurum yönetimi yetkiniz yok");
  }

  const membership = await client.membership.findFirst({
    where: {
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: requestedRole,
      status: "ACTIVE",
      deletedAt: null,
      tenant: { type: "ORGANIZATION", status: "ACTIVE", deletedAt: null },
    },
    select: { role: true, tenantId: true },
  });
  if (!membership) {
    throw forbiddenError("Bu kurumda aktif yönetim yetkiniz yok");
  }

  if (ADMIN_ROLES.includes(membership.role as OrganizationAdminRole)) {
    const branches = await client.branch.findMany({
      where: { tenantId: membership.tenantId, deletedAt: null },
      select: { id: true },
    });
    return {
      userId: actor.userId,
      tenantId: membership.tenantId,
      role: membership.role as OrganizationAdminRole,
      branchIds: branches.map((branch) => branch.id),
    };
  }

  const branches = await client.branch.findMany({
    where: {
      tenantId: membership.tenantId,
      managerUserId: actor.userId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (branches.length === 0) {
    throw forbiddenError("Yönetici olduğunuz aktif bir şube bulunmuyor");
  }
  return {
    userId: actor.userId,
    tenantId: membership.tenantId,
    role: "BRANCH_MANAGER",
    branchIds: branches.map((branch) => branch.id),
  };
}

export function assertOrganizationAdmin(scope: OrganizationScope): void {
  if (!ADMIN_ROLES.includes(scope.role)) {
    throw forbiddenError("Bu işlem yalnızca kurum yöneticisine açıktır");
  }
}

export function isOrganizationAdmin(scope: OrganizationScope): boolean {
  return ADMIN_ROLES.includes(scope.role);
}

export function scopedBranchWhere(scope: OrganizationScope): Prisma.BranchWhereInput {
  return {
    tenantId: scope.tenantId,
    deletedAt: null,
    ...(scope.role === "BRANCH_MANAGER" ? { id: { in: scope.branchIds } } : {}),
  };
}

export function scopedClassWhere(scope: OrganizationScope): Prisma.ClassWhereInput {
  return {
    tenantId: scope.tenantId,
    deletedAt: null,
    ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
  };
}

export async function assertBranchAccess(
  scope: OrganizationScope,
  branchId: string,
  client: DbClient = prisma,
) {
  const branch = await client.branch.findFirst({
    where: { ...scopedBranchWhere(scope), id: branchId },
    select: { id: true, tenantId: true, name: true, status: true, deletedAt: true },
  });
  if (!branch) throw forbiddenError("Bu şube için yetkiniz yok");
  return branch;
}

export async function assertClassAccess(
  scope: OrganizationScope,
  classId: string,
  client: DbClient = prisma,
) {
  const cls = await client.class.findFirst({
    where: { ...scopedClassWhere(scope), id: classId },
    select: { id: true, tenantId: true, branchId: true, academicYearId: true, status: true },
  });
  if (!cls) throw forbiddenError("Bu sınıf için yetkiniz yok");
  return cls;
}

export async function assertTenantUser(
  scope: OrganizationScope,
  userId: string,
  role: "TEACHER" | "STUDENT",
  client: DbClient = prisma,
) {
  const user = await client.user.findFirst({
    where: {
      id: userId,
      status: { not: "CLOSED" },
      deletedAt: null,
      memberships: {
        some: {
          tenantId: scope.tenantId,
          role,
          status: "ACTIVE",
          deletedAt: null,
        },
      },
    },
    select: { id: true, displayName: true, email: true, status: true },
  });
  if (!user) throw notFoundError(role === "TEACHER" ? "Öğretmen bulunamadı" : "Öğrenci bulunamadı");
  return user;
}

export async function assertStudentScope(
  scope: OrganizationScope,
  studentId: string,
  client: DbClient = prisma,
) {
  const profile = await client.studentProfile.findFirst({
    where: {
      tenantId: scope.tenantId,
      studentId,
      student: { deletedAt: null },
      ...(scope.role === "BRANCH_MANAGER"
        ? {
            student: {
              deletedAt: null,
              enrollments: {
                some: {
                  tenantId: scope.tenantId,
                  status: "ACTIVE",
                  deletedAt: null,
                  class: { branchId: { in: scope.branchIds }, deletedAt: null },
                },
              },
            },
          }
        : {}),
    },
    select: { id: true, studentId: true, tenantId: true },
  });
  if (!profile) throw forbiddenError("Bu öğrenci için yetkiniz yok");
  return profile;
}

export async function assertAcademicYearAccess(
  scope: OrganizationScope,
  academicYearId: string,
  client: DbClient = prisma,
) {
  const year = await client.academicYear.findFirst({
    where: { id: academicYearId, tenantId: scope.tenantId },
    select: { id: true, tenantId: true, name: true, status: true, startDate: true, endDate: true },
  });
  if (!year) throw forbiddenError("Bu akademik yıl için yetkiniz yok");
  return year;
}
