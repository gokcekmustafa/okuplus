import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import { ScryptPasswordHasher } from "../auth/index.js";
import type {
  CreateBranchInput,
  ListBranchesQuery,
  UpdateBranchInput,
  UpdateBranchManagerInput,
  UpdateBranchStatusInput,
} from "../branches/schemas.js";
import type { ClassDetail, ClassListResult } from "../classes/service.js";
import type {
  CreateClassInput,
  CreateTeacherAssignmentInput,
  ListClassesQuery,
  UpdateClassInput,
  UpdateClassStatusInput,
} from "../classes/schemas.js";
import { getAssignment, listClassAssignments } from "../assignments/service.js";
import type {
  AssignmentDetail,
  AssignmentListItem,
  AssignmentListResult,
} from "../assignments/service.js";
import type {
  CreateAssignmentInput,
  ListAssignmentsQuery,
  UpdateAssignmentInput,
  UpdateAssignmentStatusInput,
} from "../assignments/schemas.js";
import type {
  CreateTeacherBranchInput,
  CreateTeacherClassInput,
  CreateTeacherInput,
  ListTeachersQuery,
  UpdateTeacherBranchInput,
  UpdateTeacherClassInput,
  UpdateTeacherInput,
} from "../teachers/schemas.js";
import type { TeacherDetail, TeacherListResult } from "../teachers/service.js";
import type {
  CreateEnrollmentInput,
  CreateStudentInput,
  CreateAcademicYearInput,
  ListStudentsQuery,
  UpdateEnrollmentInput,
  UpdateStudentInput,
  UpdateAcademicYearInput,
} from "../students/schemas.js";
import type { StudentDetail, StudentListResult } from "../students/service.js";
import {
  assertAcademicYearAccess,
  assertBranchAccess,
  assertClassAccess,
  assertOrganizationAdmin,
  assertStudentScope,
  assertTenantUser,
  resolveOrganizationScope,
  scopedBranchWhere,
  scopedClassWhere,
  type OrganizationActorInput,
  type OrganizationScope,
} from "./policy.js";

const hasher = new ScryptPasswordHasher();

type OrganizationAssignmentActor = OrganizationActorInput;

const BRANCH_SELECT = {
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
  manager: { select: { id: true, displayName: true, email: true, status: true, deletedAt: true } },
} satisfies Prisma.BranchSelect;

export interface OrganizationBranchListItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  status: string;
  managerUserId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  classCount: number;
  teacherCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationBranchDetail extends OrganizationBranchListItem {
  tenantStatus: string;
  manager: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    deletedAt: Date | null;
  } | null;
}

export interface OrganizationBranchListResult {
  items: OrganizationBranchListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrganizationPersonOption {
  id: string;
  displayName: string;
  email: string | null;
}

const TEACHER_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  nationalId: true,
  birthYear: true,
  status: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const STUDENT_LIST_SELECT = {
  id: true,
  studentId: true,
  tenantId: true,
  student: { select: { id: true, displayName: true, email: true, status: true, createdAt: true } },
} satisfies Prisma.StudentProfileSelect;

const CLASS_SELECT = {
  id: true,
  tenantId: true,
  branchId: true,
  academicYearId: true,
  name: true,
  gradeLevel: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true, status: true } },
  academicYear: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
} satisfies Prisma.ClassSelect;

async function scopeOf(actor: OrganizationAssignmentActor): Promise<OrganizationScope> {
  return resolveOrganizationScope(actor);
}

function scopedTenantInput(scope: OrganizationScope, requestedTenantId?: string): string {
  if (requestedTenantId && requestedTenantId !== scope.tenantId) {
    throw forbiddenError("Başka bir kuruma erişemezsiniz");
  }
  return scope.tenantId;
}

function mapBranch(
  row: Prisma.BranchGetPayload<{ select: typeof BRANCH_SELECT }> & {
    tenant?: { id: string; name: string; type: string; status: string; deletedAt: Date | null };
  },
  counts: { classes: number; teachers: number },
): OrganizationBranchDetail {
  const tenant = row.tenant!;
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
    tenantType: tenant.type,
    tenantStatus: tenant.status,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    status: row.status,
    managerUserId: row.managerUserId,
    managerName: row.manager?.displayName ?? null,
    managerEmail: row.manager?.email ?? null,
    manager: row.manager ?? null,
    classCount: counts.classes,
    teacherCount: counts.teachers,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function branchDetail(
  scope: OrganizationScope,
  branchId: string,
): Promise<OrganizationBranchDetail> {
  const branch = await assertBranchAccess(scope, branchId);
  const row = await prisma.branch.findFirst({
    where: { id: branch.id },
    select: {
      ...BRANCH_SELECT,
      tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
    },
  });
  if (!row) throw notFoundError("Şube bulunamadı");
  const [classes, teachers] = await Promise.all([
    prisma.class.count({ where: { branchId, deletedAt: null } }),
    prisma.teacherBranchMembership.count({
      where: { branchId, status: "ACTIVE", deletedAt: null },
    }),
  ]);
  return mapBranch(row, { classes, teachers });
}

export async function listOrganizationBranches(
  actor: OrganizationAssignmentActor,
  query: ListBranchesQuery,
): Promise<OrganizationBranchListResult> {
  const scope = await scopeOf(actor);
  const tenantId = scopedTenantInput(scope, query.tenantId);
  const where: Prisma.BranchWhereInput = {
    ...scopedBranchWhere(scope),
    tenantId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { code: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      select: {
        ...BRANCH_SELECT,
        tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.branch.count({ where }),
  ]);
  const ids = rows.map((row) => row.id);
  const [classGroups, teacherGroups] = ids.length
    ? await Promise.all([
        prisma.class.groupBy({
          by: ["branchId"],
          where: { branchId: { in: ids }, deletedAt: null },
          _count: { _all: true },
        }),
        prisma.teacherBranchMembership.groupBy({
          by: ["branchId"],
          where: { branchId: { in: ids }, status: "ACTIVE", deletedAt: null },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const classCount = new Map(classGroups.map((group) => [group.branchId, group._count._all]));
  const teacherCount = new Map(teacherGroups.map((group) => [group.branchId, group._count._all]));
  return {
    items: rows.map((row) => {
      const item = mapBranch(row, {
        classes: classCount.get(row.id) ?? 0,
        teachers: teacherCount.get(row.id) ?? 0,
      });
      const { tenantStatus: _tenantStatus, manager: _manager, ...listItem } = item;
      return listItem;
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getOrganizationBranch(
  actor: OrganizationAssignmentActor,
  branchId: string,
): Promise<OrganizationBranchDetail> {
  return branchDetail(await scopeOf(actor), branchId);
}

export async function createOrganizationBranch(
  actor: OrganizationAssignmentActor,
  input: CreateBranchInput,
): Promise<OrganizationBranchDetail> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  const tenantId = scopedTenantInput(scope, input.tenantId);
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, type: "ORGANIZATION", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!tenant) throw notFoundError("Kurum bulunamadı");
  if (input.managerUserId) {
    await assertManagerCandidate(scope, input.managerUserId);
  }
  try {
    const created = await prisma.branch.create({
      data: {
        tenantId,
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        phone: input.phone ?? null,
        managerUserId: input.managerUserId ?? null,
      },
      select: { id: true },
    });
    return branchDetail(scope, created.id);
  } catch (error) {
    throw translateOrganizationError(
      error,
      "Bu kurumda aynı ada veya koda sahip şube zaten mevcut",
    );
  }
}

export async function updateOrganizationBranch(
  actor: OrganizationAssignmentActor,
  branchId: string,
  input: UpdateBranchInput,
): Promise<OrganizationBranchDetail> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  await assertBranchAccess(scope, branchId);
  try {
    await prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
  } catch (error) {
    throw translateOrganizationError(
      error,
      "Bu kurumda aynı ada veya koda sahip şube zaten mevcut",
    );
  }
  return branchDetail(scope, branchId);
}

export async function updateOrganizationBranchStatus(
  actor: OrganizationAssignmentActor,
  branchId: string,
  input: UpdateBranchStatusInput,
): Promise<OrganizationBranchDetail> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  await assertBranchAccess(scope, branchId);
  await prisma.branch.update({ where: { id: branchId }, data: { status: input.status } });
  return branchDetail(scope, branchId);
}

export async function deleteOrganizationBranch(
  actor: OrganizationAssignmentActor,
  branchId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  await assertBranchAccess(scope, branchId);
  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return { id: updated.id, deletedAt: updated.deletedAt! };
}

async function assertManagerCandidate(scope: OrganizationScope, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!user) throw validationError("Şube yöneticisi olarak seçilen kullanıcı aktif değil");
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId: scope.tenantId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!membership) throw validationError("Şube yöneticisi bu kurumda üye değil");
  return user;
}

export async function listOrganizationManagerCandidates(
  actor: OrganizationAssignmentActor,
): Promise<OrganizationPersonOption[]> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  const rows = await prisma.membership.findMany({
    where: {
      tenantId: scope.tenantId,
      status: "ACTIVE",
      deletedAt: null,
      user: { status: "ACTIVE", deletedAt: null },
    },
    distinct: ["userId"],
    select: { user: { select: { id: true, displayName: true, email: true } } },
    orderBy: { user: { displayName: "asc" } },
  });
  return rows.map((row) => row.user);
}

export async function assignOrganizationBranchManager(
  actor: OrganizationAssignmentActor,
  branchId: string,
  input: UpdateBranchManagerInput,
): Promise<OrganizationBranchDetail> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  await assertBranchAccess(scope, branchId);
  if (input.managerUserId) await assertManagerCandidate(scope, input.managerUserId);
  await prisma.$transaction(async (tx) => {
    if (input.managerUserId) {
      const existing = await tx.membership.findFirst({
        where: {
          tenantId: scope.tenantId,
          userId: input.managerUserId,
          role: "BRANCH_MANAGER",
          deletedAt: null,
        },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status !== "ACTIVE") {
          await tx.membership.update({
            where: { id: existing.id },
            data: { status: "ACTIVE", startedAt: new Date(), endedAt: null },
          });
        }
      } else {
        await tx.membership.create({
          data: {
            tenantId: scope.tenantId,
            userId: input.managerUserId,
            role: "BRANCH_MANAGER",
            status: "ACTIVE",
            startedAt: new Date(),
          },
        });
      }
    }
    await tx.branch.update({
      where: { id: branchId },
      data: { managerUserId: input.managerUserId ?? null },
    });
  });
  return branchDetail(scope, branchId);
}

function teacherWhere(
  scope: OrganizationScope,
  query: ListTeachersQuery,
): Prisma.MembershipWhereInput {
  return {
    tenantId: scope.tenantId,
    role: "TEACHER",
    deletedAt: null,
    user: {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(scope.role === "BRANCH_MANAGER"
        ? {
            teacherBranchMemberships: {
              some: { branchId: { in: scope.branchIds }, status: "ACTIVE", deletedAt: null },
            },
          }
        : {}),
    },
  };
}

export async function listOrganizationTeachers(
  actor: OrganizationAssignmentActor,
  query: ListTeachersQuery,
): Promise<TeacherListResult> {
  const scope = await scopeOf(actor);
  const [tenant, rows, total] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { name: true } }),
    prisma.membership.findMany({
      where: teacherWhere(scope, query),
      select: {
        id: true,
        tenantId: true,
        userId: true,
        user: { select: TEACHER_SELECT },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.membership.count({ where: teacherWhere(scope, query) }),
  ]);
  const ids = rows.map((row) => row.userId);
  const [branchGroups, classGroups] = ids.length
    ? await Promise.all([
        prisma.teacherBranchMembership.groupBy({
          by: ["teacherId", "tenantId"],
          where: {
            teacherId: { in: ids },
            tenantId: scope.tenantId,
            status: "ACTIVE",
            deletedAt: null,
            ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
          },
          _count: { _all: true },
        }),
        prisma.teacherClassAssignment.groupBy({
          by: ["teacherId", "tenantId"],
          where: {
            teacherId: { in: ids },
            tenantId: scope.tenantId,
            status: "ACTIVE",
            deletedAt: null,
            ...(scope.role === "BRANCH_MANAGER"
              ? { class: { branchId: { in: scope.branchIds }, deletedAt: null } }
              : {}),
          },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const key = (id: string) => `${id}:${scope.tenantId}`;
  const branches = new Map(branchGroups.map((group) => [key(group.teacherId), group._count._all]));
  const classes = new Map(classGroups.map((group) => [key(group.teacherId), group._count._all]));
  return {
    items: rows.map((row) => ({
      id: row.id,
      userId: row.user.id,
      displayName: row.user.displayName,
      email: row.user.email,
      phone: row.user.phone,
      birthYear: row.user.birthYear,
      tenantId: scope.tenantId,
      tenantName: tenant?.name ?? "",
      tenantType: "ORGANIZATION",
      status: row.user.status,
      branchCount: branches.get(key(row.userId)) ?? 0,
      classCount: classes.get(key(row.userId)) ?? 0,
      createdAt: row.user.createdAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function assertTeacherScope(scope: OrganizationScope, userId: string) {
  const teacher = await assertTenantUser(scope, userId, "TEACHER");
  if (scope.role === "BRANCH_MANAGER") {
    const branch = await prisma.teacherBranchMembership.findFirst({
      where: {
        tenantId: scope.tenantId,
        teacherId: userId,
        branchId: { in: scope.branchIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!branch) throw forbiddenError("Bu öğretmen şubenizde yetkili değil");
  }
  return teacher;
}

export async function getOrganizationTeacher(
  actor: OrganizationAssignmentActor,
  userId: string,
): Promise<TeacherDetail> {
  const scope = await scopeOf(actor);
  await assertTeacherScope(scope, userId);
  const [user, memberships, branches, assignments] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...TEACHER_SELECT, emailVerifiedAt: true, lastLoginAt: true },
    }),
    prisma.membership.findMany({
      where: { userId, tenantId: scope.tenantId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        role: true,
        status: true,
        startedAt: true,
        endedAt: true,
        tenant: { select: { id: true, name: true, type: true, deletedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teacherBranchMembership.findMany({
      where: {
        tenantId: scope.tenantId,
        teacherId: userId,
        deletedAt: null,
        ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdAt: true,
        tenant: { select: { name: true, deletedAt: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teacherClassAssignment.findMany({
      where: {
        tenantId: scope.tenantId,
        teacherId: userId,
        deletedAt: null,
        ...(scope.role === "BRANCH_MANAGER"
          ? { class: { branchId: { in: scope.branchIds } } }
          : {}),
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        subject: true,
        createdAt: true,
        tenant: { select: { name: true, deletedAt: true } },
        class: {
          select: {
            id: true,
            name: true,
            branchId: true,
            branch: { select: { name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      nationalId: user.nationalId,
      birthYear: user.birthYear,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
    memberships: memberships.map(({ tenant, ...membership }) => ({
      ...membership,
      tenantName: tenant.name,
      tenantType: tenant.type,
    })),
    branches: branches.map(({ tenant, branch, ...membership }) => ({
      ...membership,
      tenantName: tenant.name,
      branchId: branch.id,
      branchName: branch.name,
    })),
    classAssignments: assignments.map(({ tenant, class: cls, ...assignment }) => ({
      ...assignment,
      tenantName: tenant.name,
      classId: cls.id,
      className: cls.name,
      branchId: cls.branchId,
      branchName: cls.branch.name,
      academicYearId: cls.academicYear.id,
      academicYearName: cls.academicYear.name,
    })),
  };
}

export async function createOrganizationTeacher(
  actor: OrganizationAssignmentActor,
  input: CreateTeacherInput & { branchId?: string },
): Promise<TeacherDetail> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  if (input.branchId) await assertBranchAccess(scope, input.branchId);
  const passwordHash = await hasher.hash(input.password);
  try {
    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          displayName: input.displayName,
          email: input.email,
          phone: input.phone ?? null,
          nationalId: input.nationalId ?? null,
          birthYear: input.birthYear ?? null,
          status: input.status ?? "ACTIVE",
          passwordHash,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: {
          tenantId: scope.tenantId,
          userId: user.id,
          role: "TEACHER",
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });
      if (input.branchId)
        await tx.teacherBranchMembership.create({
          data: {
            tenantId: scope.tenantId,
            branchId: input.branchId,
            teacherId: user.id,
            status: "ACTIVE",
          },
        });
      return user.id;
    });
    return getOrganizationTeacher(actor, userId);
  } catch (error) {
    throw translateOrganizationError(error, "Öğretmen hesabı veya üyeliği zaten mevcut");
  }
}

export async function updateOrganizationTeacher(
  actor: OrganizationAssignmentActor,
  userId: string,
  input: UpdateTeacherInput,
): Promise<TeacherDetail> {
  const scope = await scopeOf(actor);
  await assertTeacherScope(scope, userId);
  await prisma.user.update({ where: { id: userId }, data: { ...input } });
  return getOrganizationTeacher(actor, userId);
}

export async function deleteOrganizationTeacher(
  actor: OrganizationAssignmentActor,
  userId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  await assertTeacherScope(scope, userId);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return { id: updated.id, deletedAt: updated.deletedAt! };
}

export async function addOrganizationTeacherBranch(
  actor: OrganizationAssignmentActor,
  userId: string,
  input: CreateTeacherBranchInput,
): Promise<unknown> {
  const scope = await scopeOf(actor);
  // A branch manager is allowed to add a tenant teacher to their own branch.
  // Requiring an existing membership here made the first assignment
  // impossible; the target branch check below is the actual scope guard.
  await assertTenantUser(scope, userId, "TEACHER");
  const branch = await assertBranchAccess(scope, input.branchId);
  try {
    const row = await prisma.teacherBranchMembership.create({
      data: {
        tenantId: scope.tenantId,
        branchId: branch.id,
        teacherId: userId,
        status: input.status,
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdAt: true,
        tenant: { select: { name: true, deletedAt: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant.name,
      branchId: row.branch.id,
      branchName: row.branch.name,
      status: row.status,
      createdAt: row.createdAt,
    };
  } catch (error) {
    throw translateOrganizationError(error, "Öğretmen bu şubede zaten kayıtlı");
  }
}

export async function updateOrganizationTeacherBranch(
  actor: OrganizationAssignmentActor,
  id: string,
  input: UpdateTeacherBranchInput,
): Promise<unknown> {
  const scope = await scopeOf(actor);
  const existing = await prisma.teacherBranchMembership.findFirst({
    where: {
      id,
      tenantId: scope.tenantId,
      ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!existing) throw forbiddenError("Bu şube üyeliği için yetkiniz yok");
  await prisma.teacherBranchMembership.update({
    where: { id },
    data: { status: input.status, ...(input.status === "ACTIVE" ? { deletedAt: null } : {}) },
  });
  return { id, status: input.status };
}

export async function removeOrganizationTeacherBranch(
  actor: OrganizationAssignmentActor,
  id: string,
): Promise<{ id: string; removed: true }> {
  const scope = await scopeOf(actor);
  const existing = await prisma.teacherBranchMembership.findFirst({
    where: {
      id,
      tenantId: scope.tenantId,
      ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!existing) throw forbiddenError("Bu şube üyeliği için yetkiniz yok");
  await prisma.teacherBranchMembership.update({
    where: { id },
    data: { status: "REMOVED", deletedAt: new Date() },
  });
  return { id, removed: true };
}

async function studentWhere(
  scope: OrganizationScope,
  query: ListStudentsQuery,
): Promise<Prisma.StudentProfileWhereInput> {
  return {
    tenantId: scope.tenantId,
    tenant: { deletedAt: null },
    student: {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(scope.role === "BRANCH_MANAGER"
        ? {
            enrollments: {
              some: {
                tenantId: scope.tenantId,
                status: "ACTIVE",
                deletedAt: null,
                class: { branchId: { in: scope.branchIds }, deletedAt: null },
              },
            },
          }
        : {}),
    },
  };
}

export async function listOrganizationStudents(
  actor: OrganizationAssignmentActor,
  query: ListStudentsQuery,
): Promise<StudentListResult> {
  const scope = await scopeOf(actor);
  const where = await studentWhere(scope, query);
  const [rows, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      select: STUDENT_LIST_SELECT,
      orderBy: { startedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.studentProfile.count({ where }),
  ]);
  const ids = rows.map((row) => row.studentId);
  const enrollments = ids.length
    ? await prisma.enrollment.findMany({
        where: {
          tenantId: scope.tenantId,
          studentId: { in: ids },
          status: "ACTIVE",
          deletedAt: null,
          ...(scope.role === "BRANCH_MANAGER"
            ? { class: { branchId: { in: scope.branchIds } } }
            : {}),
        },
        select: { studentId: true, class: { select: { name: true } } },
      })
    : [];
  const classByStudent = new Map(enrollments.map((row) => [row.studentId, row.class.name]));
  return {
    items: rows.map((row) => ({
      id: row.id,
      studentId: row.student.id,
      displayName: row.student.displayName,
      email: row.student.email,
      tenantId: scope.tenantId,
      tenantName: "",
      tenantType: "ORGANIZATION",
      className: classByStudent.get(row.studentId) ?? null,
      status: row.student.status,
      createdAt: row.student.createdAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getOrganizationStudent(
  actor: OrganizationAssignmentActor,
  profileId: string,
): Promise<StudentDetail> {
  const scope = await scopeOf(actor);
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, tenantId: scope.tenantId, student: { deletedAt: null } },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      startedAt: true,
      currentLevel: { select: { id: true, code: true, name: true } },
      targetLevel: { select: { id: true, code: true, name: true } },
      student: {
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
          nationalId: true,
          birthYear: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
      tenant: { select: { id: true, name: true, type: true } },
    },
  });
  if (!profile) throw notFoundError("Öğrenci bulunamadı");
  await assertStudentScope(scope, profile.studentId);
  const [memberships, enrollments] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: profile.studentId, tenantId: scope.tenantId },
      select: {
        id: true,
        role: true,
        status: true,
        startedAt: true,
        tenant: { select: { id: true, name: true, type: true, deletedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.enrollment.findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: profile.studentId,
        deletedAt: null,
        ...(scope.role === "BRANCH_MANAGER"
          ? { class: { branchId: { in: scope.branchIds } } }
          : {}),
      },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        class: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
      },
      orderBy: { enrolledAt: "desc" },
    }),
  ]);
  return {
    id: profile.id,
    user: profile.student,
    tenant: profile.tenant,
    profile: {
      id: profile.id,
      currentLevel: profile.currentLevel,
      targetLevel: profile.targetLevel,
      startedAt: profile.startedAt,
    },
    memberships: memberships.map(({ tenant, ...membership }) => ({
      ...membership,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantType: tenant.type,
      endedAt: null,
    })),
    enrollments: enrollments.map(({ class: cls, academicYear, ...enrollment }) => ({
      ...enrollment,
      classId: cls.id,
      academicYearId: academicYear.id,
      className: cls.name,
      academicYearName: academicYear.name,
    })),
  };
}

export async function createOrganizationStudent(
  actor: OrganizationAssignmentActor,
  input: CreateStudentInput,
): Promise<StudentDetail> {
  const scope = await scopeOf(actor);
  const tenantId = scopedTenantInput(scope, input.tenantId);
  if (scope.role === "BRANCH_MANAGER" && !input.classId)
    throw validationError("Şube yöneticisi için sınıf seçimi gerekli");
  if (input.classId) await assertClassAccess(scope, input.classId);
  if (input.academicYearId) await assertAcademicYearAccess(scope, input.academicYearId);
  const passwordHash = await hasher.hash(input.password);
  try {
    const profileId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          displayName: input.displayName,
          email: input.email,
          phone: input.phone ?? null,
          nationalId: input.nationalId ?? null,
          birthYear: input.birthYear ?? null,
          status: input.status ?? "ACTIVE",
          passwordHash,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          role: "STUDENT",
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });
      const profile = await tx.studentProfile.create({
        data: {
          tenantId,
          studentId: user.id,
          currentLevelId: input.currentLevelId ?? null,
          targetLevelId: input.targetLevelId ?? null,
        },
        select: { id: true },
      });
      if (input.classId) {
        const cls = await tx.class.findFirst({
          where: { id: input.classId, tenantId },
          select: { academicYearId: true },
        });
        if (!cls) throw validationError("Sınıf bu kuruma ait değil");
        await tx.enrollment.create({
          data: {
            tenantId,
            studentId: user.id,
            classId: input.classId,
            academicYearId: cls.academicYearId,
            status: "ACTIVE",
            enrolledAt: new Date(),
          },
        });
      }
      return profile.id;
    });
    return getOrganizationStudent(actor, profileId);
  } catch (error) {
    throw translateOrganizationError(error, "Öğrenci hesabı veya üyeliği zaten mevcut");
  }
}

export async function updateOrganizationStudent(
  actor: OrganizationAssignmentActor,
  profileId: string,
  input: UpdateStudentInput,
): Promise<StudentDetail> {
  const scope = await scopeOf(actor);
  const existing = await prisma.studentProfile.findFirst({
    where: { id: profileId, tenantId: scope.tenantId },
    select: { studentId: true },
  });
  if (!existing) throw notFoundError("Öğrenci bulunamadı");
  await assertStudentScope(scope, existing.studentId);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.studentId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
        ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await tx.studentProfile.update({
      where: { id: profileId },
      data: {
        currentLevelId: input.currentLevelId,
        targetLevelId: input.targetLevelId,
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      },
    });
  });
  return getOrganizationStudent(actor, profileId);
}

export async function deleteOrganizationStudent(
  actor: OrganizationAssignmentActor,
  profileId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  const existing = await prisma.studentProfile.findFirst({
    where: { id: profileId, tenantId: scope.tenantId },
    select: { studentId: true },
  });
  if (!existing) throw notFoundError("Öğrenci bulunamadı");
  const updated = await prisma.user.update({
    where: { id: existing.studentId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return { id: updated.id, deletedAt: updated.deletedAt! };
}

export async function listOrganizationStudentEnrollments(
  actor: OrganizationAssignmentActor,
  profileId: string,
) {
  const scope = await scopeOf(actor);
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, tenantId: scope.tenantId },
    select: { studentId: true },
  });
  if (!profile) throw notFoundError("Öğrenci bulunamadı");
  await assertStudentScope(scope, profile.studentId);
  return prisma.enrollment
    .findMany({
      where: {
        tenantId: scope.tenantId,
        studentId: profile.studentId,
        deletedAt: null,
        ...(scope.role === "BRANCH_MANAGER"
          ? { class: { branchId: { in: scope.branchIds } } }
          : {}),
      },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        class: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
      orderBy: { enrolledAt: "desc" },
    })
    .then((rows) =>
      rows.map(({ class: cls, academicYear, ...row }) => ({
        ...row,
        className: cls.name,
        academicYearName: academicYear.name,
      })),
    );
}

export async function createOrganizationEnrollment(
  actor: OrganizationAssignmentActor,
  profileId: string,
  input: CreateEnrollmentInput,
) {
  const scope = await scopeOf(actor);
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, tenantId: scope.tenantId },
    select: { studentId: true },
  });
  if (!profile) throw notFoundError("Öğrenci bulunamadı");
  await assertStudentScope(scope, profile.studentId);
  const cls = await assertClassAccess(scope, input.classId);
  try {
    const row = await prisma.enrollment.create({
      data: {
        tenantId: scope.tenantId,
        studentId: profile.studentId,
        classId: cls.id,
        academicYearId: cls.academicYearId,
        status: input.status,
        enrolledAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        class: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
    });
    return { ...row, className: row.class.name, academicYearName: row.academicYear.name };
  } catch (error) {
    throw translateOrganizationError(error, "Öğrencinin bu sınıfta kaydı zaten mevcut");
  }
}

export async function updateOrganizationEnrollment(
  actor: OrganizationAssignmentActor,
  enrollmentId: string,
  input: UpdateEnrollmentInput,
) {
  const scope = await scopeOf(actor);
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, tenantId: scope.tenantId, deletedAt: null },
    select: { id: true, studentId: true, academicYearId: true, classId: true, status: true },
  });
  if (!enrollment) throw notFoundError("Sınıf kaydı bulunamadı");
  await assertClassAccess(scope, enrollment.classId);
  let academicYearId = enrollment.academicYearId;
  let classId: string | undefined;
  if (input.classId) {
    const cls = await assertClassAccess(scope, input.classId);
    if (input.academicYearId && input.academicYearId !== cls.academicYearId) {
      throw validationError("Seçilen akademik yıl, sınıfın akademik yılıyla uyuşmuyor");
    }
    academicYearId = cls.academicYearId;
    classId = cls.id;
  }
  if (input.status === "ACTIVE") {
    const clash = await prisma.enrollment.findFirst({
      where: {
        id: { not: enrollmentId },
        tenantId: scope.tenantId,
        studentId: enrollment.studentId,
        academicYearId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (clash) throw conflictError("Aynı akademik yılda aktif sınıf kaydı zaten var");
  }
  try {
    const row = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: input.status,
        ...(classId ? { classId, academicYearId } : {}),
        ...(input.status === "ACTIVE" ? { leftAt: null } : { leftAt: new Date() }),
      },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        class: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
    return {
      ...row,
      classId: row.class.id,
      academicYearId: row.academicYear.id,
      className: row.class.name,
      academicYearName: row.academicYear.name,
    };
  } catch (error) {
    throw translateOrganizationError(error, "Bu öğrencinin sınıf kaydı zaten mevcut");
  }
}

export async function listOrganizationAcademicYears(actor: OrganizationAssignmentActor) {
  const scope = await scopeOf(actor);
  return prisma.academicYear.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  });
}

export async function createOrganizationAcademicYear(
  actor: OrganizationAssignmentActor,
  input: CreateAcademicYearInput,
) {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  try {
    return await prisma.academicYear.create({
      data: {
        tenantId: scope.tenantId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status ?? "UPCOMING",
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });
  } catch (error) {
    throw translateOrganizationError(error, "Bu kurumda aynı isimde akademik yıl zaten mevcut");
  }
}

export async function updateOrganizationAcademicYear(
  actor: OrganizationAssignmentActor,
  academicYearId: string,
  input: UpdateAcademicYearInput,
) {
  const scope = await scopeOf(actor);
  assertOrganizationAdmin(scope);
  const current = await prisma.academicYear.findFirst({
    where: { id: academicYearId, tenantId: scope.tenantId },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!current) throw notFoundError("Akademik yıl bulunamadı");

  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate ?? current.endDate;
  if (endDate <= startDate) {
    throw validationError("Bitiş tarihi başlangıç tarihinden sonra olmalı");
  }

  try {
    return await prisma.academicYear.update({
      where: { id: academicYearId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });
  } catch (error) {
    throw translateOrganizationError(error, "Bu kurumda aynı isimde akademik yıl zaten mevcut");
  }
}

export async function listOrganizationClasses(
  actor: OrganizationAssignmentActor,
  query: ListClassesQuery,
): Promise<ClassListResult> {
  const scope = await scopeOf(actor);
  const tenantId = scopedTenantInput(scope, query.tenantId);
  const where: Prisma.ClassWhereInput = {
    ...scopedClassWhere(scope),
    tenantId,
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };
  if (query.branchId) await assertBranchAccess(scope, query.branchId);
  const [rows, total] = await Promise.all([
    prisma.class.findMany({
      where,
      select: CLASS_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.class.count({ where }),
  ]);
  const ids = rows.map((row) => row.id);
  const [studentGroups, teacherGroups] = ids.length
    ? await Promise.all([
        prisma.enrollment.groupBy({
          by: ["classId"],
          where: { classId: { in: ids }, status: "ACTIVE", deletedAt: null },
          _count: { _all: true },
        }),
        prisma.teacherClassAssignment.groupBy({
          by: ["classId"],
          where: { classId: { in: ids }, status: "ACTIVE", deletedAt: null },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const studentCount = new Map(studentGroups.map((row) => [row.classId, row._count._all]));
  const teacherCount = new Map(teacherGroups.map((row) => [row.classId, row._count._all]));
  return {
    items: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantName: "",
      tenantType: "ORGANIZATION",
      tenantStatus: "ACTIVE",
      branchId: row.branch.id,
      branchName: row.branch.name,
      branchStatus: row.branch.status,
      academicYearId: row.academicYear.id,
      academicYearName: row.academicYear.name,
      academicYearStatus: row.academicYear.status,
      name: row.name,
      gradeLevel: row.gradeLevel,
      status: row.status,
      studentCount: studentCount.get(row.id) ?? 0,
      teacherCount: teacherCount.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getOrganizationClass(
  actor: OrganizationAssignmentActor,
  classId: string,
): Promise<ClassDetail> {
  const scope = await scopeOf(actor);
  const cls = await assertClassAccess(scope, classId);
  const row = await prisma.class.findFirst({ where: { id: cls.id }, select: CLASS_SELECT });
  if (!row) throw notFoundError("Sınıf bulunamadı");
  const [studentCount, teacherCount] = await Promise.all([
    prisma.enrollment.count({ where: { classId, status: "ACTIVE", deletedAt: null } }),
    prisma.teacherClassAssignment.count({ where: { classId, status: "ACTIVE", deletedAt: null } }),
  ]);
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: "",
    tenantType: "ORGANIZATION",
    tenantStatus: "ACTIVE",
    branchId: row.branch.id,
    branchName: row.branch.name,
    branchStatus: row.branch.status,
    academicYearId: row.academicYear.id,
    academicYearName: row.academicYear.name,
    academicYearStatus: row.academicYear.status,
    name: row.name,
    gradeLevel: row.gradeLevel,
    status: row.status,
    studentCount,
    teacherCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createOrganizationClass(
  actor: OrganizationAssignmentActor,
  input: CreateClassInput,
): Promise<ClassDetail> {
  const scope = await scopeOf(actor);
  const tenantId = scopedTenantInput(scope, input.tenantId);
  await assertBranchAccess(scope, input.branchId);
  await assertAcademicYearAccess(scope, input.academicYearId);
  try {
    const row = await prisma.class.create({
      data: {
        tenantId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        name: input.name,
        gradeLevel: input.gradeLevel,
        status: input.status ?? "ACTIVE",
      },
      select: { id: true },
    });
    return getOrganizationClass(actor, row.id);
  } catch (error) {
    throw translateOrganizationError(
      error,
      "Bu şubede bu akademik yılda aynı sınıf adı zaten mevcut",
    );
  }
}

export async function updateOrganizationClass(
  actor: OrganizationAssignmentActor,
  classId: string,
  input: UpdateClassInput,
): Promise<ClassDetail> {
  const scope = await scopeOf(actor);
  await assertClassAccess(scope, classId);
  await prisma.class.update({ where: { id: classId }, data: input });
  return getOrganizationClass(actor, classId);
}

export async function updateOrganizationClassStatus(
  actor: OrganizationAssignmentActor,
  classId: string,
  input: UpdateClassStatusInput,
): Promise<ClassDetail> {
  const scope = await scopeOf(actor);
  await assertClassAccess(scope, classId);
  await prisma.class.update({ where: { id: classId }, data: { status: input.status } });
  return getOrganizationClass(actor, classId);
}

export async function deleteOrganizationClass(
  actor: OrganizationAssignmentActor,
  classId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const scope = await scopeOf(actor);
  await assertClassAccess(scope, classId);
  const row = await prisma.class.update({
    where: { id: classId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return { id: row.id, deletedAt: row.deletedAt! };
}

export async function listOrganizationClassStudents(
  actor: OrganizationAssignmentActor,
  classId: string,
) {
  const scope = await scopeOf(actor);
  await assertClassAccess(scope, classId);
  return prisma.enrollment
    .findMany({
      where: { classId, deletedAt: null, student: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        student: { select: { id: true, displayName: true, email: true, status: true } },
      },
      orderBy: { enrolledAt: "desc" },
    })
    .then((rows) =>
      rows.map(({ student, ...row }) => ({
        ...row,
        studentId: student.id,
        displayName: student.displayName,
        email: student.email,
        userStatus: student.status,
      })),
    );
}

export async function listOrganizationClassTeachers(
  actor: OrganizationAssignmentActor,
  classId: string,
) {
  const scope = await scopeOf(actor);
  await assertClassAccess(scope, classId);
  return prisma.teacherClassAssignment
    .findMany({
      where: { classId, deletedAt: null, teacher: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        subject: true,
        createdAt: true,
        teacher: { select: { id: true, displayName: true, email: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    .then((rows) =>
      rows.map(({ teacher, ...row }) => ({
        ...row,
        teacherId: teacher.id,
        displayName: teacher.displayName,
        email: teacher.email,
        userStatus: teacher.status,
      })),
    );
}

export async function assignOrganizationTeacherToClass(
  actor: OrganizationAssignmentActor,
  classId: string,
  input: CreateTeacherAssignmentInput,
) {
  const scope = await scopeOf(actor);
  const cls = await assertClassAccess(scope, classId);
  await assertTeacherScope(scope, input.teacherId);
  const membership = await prisma.teacherBranchMembership.findFirst({
    where: {
      tenantId: scope.tenantId,
      teacherId: input.teacherId,
      branchId: cls.branchId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) throw validationError("Öğretmen bu şubede aktif değil");
  try {
    const row = await prisma.teacherClassAssignment.create({
      data: {
        tenantId: scope.tenantId,
        classId,
        teacherId: input.teacherId,
        subject: input.subject ?? null,
        status: input.status,
      },
      select: {
        id: true,
        status: true,
        subject: true,
        createdAt: true,
        teacher: { select: { id: true, displayName: true, email: true, status: true } },
      },
    });
    return {
      ...row,
      teacherId: row.teacher.id,
      displayName: row.teacher.displayName,
      email: row.teacher.email,
      userStatus: row.teacher.status,
    };
  } catch (error) {
    throw translateOrganizationError(error, "Bu öğretmen bu sınıfa zaten atanmış");
  }
}

export async function addOrganizationTeacherClass(
  actor: OrganizationAssignmentActor,
  teacherId: string,
  input: CreateTeacherClassInput,
) {
  return assignOrganizationTeacherToClass(actor, input.classId, {
    teacherId,
    subject: input.subject,
    status: input.status,
  });
}

export async function updateOrganizationTeacherClass(
  actor: OrganizationAssignmentActor,
  assignmentId: string,
  input: UpdateTeacherClassInput,
) {
  const scope = await scopeOf(actor);
  const existing = await prisma.teacherClassAssignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: scope.tenantId,
      deletedAt: null,
      ...(scope.role === "BRANCH_MANAGER" ? { class: { branchId: { in: scope.branchIds } } } : {}),
    },
    select: { id: true },
  });
  if (!existing) throw forbiddenError("Bu sınıf ataması için yetkiniz yok");
  await prisma.teacherClassAssignment.update({
    where: { id: assignmentId },
    data: { status: input.status },
  });
  return { id: assignmentId, status: input.status };
}

export async function removeOrganizationTeacherClass(
  actor: OrganizationAssignmentActor,
  assignmentId: string,
) {
  const scope = await scopeOf(actor);
  const existing = await prisma.teacherClassAssignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: scope.tenantId,
      deletedAt: null,
      ...(scope.role === "BRANCH_MANAGER" ? { class: { branchId: { in: scope.branchIds } } } : {}),
    },
    select: { id: true },
  });
  if (!existing) throw forbiddenError("Bu sınıf ataması için yetkiniz yok");
  await prisma.teacherClassAssignment.update({
    where: { id: assignmentId },
    data: { status: "REMOVED", deletedAt: new Date() },
  });
  return { id: assignmentId, removed: true as const };
}

export async function listOrganizationBranchesOption(actor: OrganizationAssignmentActor) {
  const scope = await scopeOf(actor);
  return prisma.branch.findMany({
    where: scopedBranchWhere(scope),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listOrganizationClassesOption(
  actor: OrganizationAssignmentActor,
  academicYearId?: string,
  branchId?: string,
) {
  const scope = await scopeOf(actor);
  return prisma.class.findMany({
    where: {
      ...scopedClassWhere(scope),
      ...(academicYearId ? { academicYearId } : {}),
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      academicYearId: true,
      branchId: true,
      branch: { select: { name: true } },
      academicYear: { select: { name: true } },
    },
  });
}

export async function listOrganizationAssignments(
  actor: OrganizationAssignmentActor,
  query: ListAssignmentsQuery,
): Promise<AssignmentListResult> {
  const scope = await scopeOf(actor);
  const where: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    tenantId: scope.tenantId,
    class: {
      ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
      deletedAt: null,
    },
    template: { deletedAt: null },
    teacher: { deletedAt: null },
    ...(query.classId ? { classId: query.classId } : {}),
    ...(query.teacherId ? { teacherId: query.teacherId } : {}),
    ...(query.templateId ? { templateId: query.templateId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        classId: true,
        templateId: true,
        learningStepId: true,
        templateVersionId: true,
        teacherId: true,
        title: true,
        dueDate: true,
        status: true,
        assignedAt: true,
        createdAt: true,
        updatedAt: true,
        class: { select: { name: true, status: true, deletedAt: true } },
        template: { select: { title: true, type: true, status: true, deletedAt: true } },
        teacher: { select: { displayName: true, deletedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);
  const ids = rows.map((row) => row.id);
  const sessions = ids.length
    ? await prisma.exerciseSession.groupBy({
        by: ["assignmentId"],
        where: { assignmentId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const sessionCount = new Map(sessions.map((row) => [row.assignmentId, row._count._all]));
  return {
    items: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      classId: row.classId,
      className: row.class?.name ?? "Bireysel çalışma",
      classStatus: row.class?.status ?? "PERSONAL",
      templateId: row.templateId,
      learningStepId: row.learningStepId,
      templateVersionId: row.templateVersionId,
      templateTitle: row.template.title,
      templateType: row.template.type,
      templateStatus: row.template.status,
      teacherId: row.teacherId,
      teacherName: row.teacher?.displayName ?? "OkuPratik",
      title: row.title,
      dueDate: row.dueDate,
      status: row.status,
      assignedAt: row.assignedAt,
      sessionCount: sessionCount.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function assertAssignmentScope(scope: OrganizationScope, assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: scope.tenantId,
      deletedAt: null,
      class: {
        deletedAt: null,
        ...(scope.role === "BRANCH_MANAGER" ? { branchId: { in: scope.branchIds } } : {}),
      },
    },
    select: { id: true, classId: true },
  });
  if (!assignment) throw forbiddenError("Bu ödev için yetkiniz yok");
  return assignment;
}

export async function getOrganizationAssignment(
  actor: OrganizationAssignmentActor,
  id: string,
): Promise<AssignmentDetail> {
  await assertAssignmentScope(await scopeOf(actor), id);
  return getAssignment(id);
}
export async function createOrganizationAssignment(
  actor: OrganizationAssignmentActor,
  input: CreateAssignmentInput,
): Promise<AssignmentDetail> {
  const scope = await scopeOf(actor);
  await assertClassAccess(scope, input.classId);
  await assertTeacherScope(scope, input.teacherId);
  return (await import("../assignments/service.js")).createAssignment(input, scope.userId);
}
export async function updateOrganizationAssignment(
  actor: OrganizationAssignmentActor,
  id: string,
  input: UpdateAssignmentInput,
): Promise<AssignmentDetail> {
  await assertAssignmentScope(await scopeOf(actor), id);
  return (await import("../assignments/service.js")).updateAssignment(id, input);
}
export async function updateOrganizationAssignmentStatus(
  actor: OrganizationAssignmentActor,
  id: string,
  input: UpdateAssignmentStatusInput,
): Promise<AssignmentDetail> {
  await assertAssignmentScope(await scopeOf(actor), id);
  return (await import("../assignments/service.js")).updateAssignmentStatus(id, input);
}
export async function deleteOrganizationAssignment(
  actor: OrganizationAssignmentActor,
  id: string,
): Promise<{ id: string; deletedAt: Date }> {
  await assertAssignmentScope(await scopeOf(actor), id);
  return (await import("../assignments/service.js")).deleteAssignment(id);
}
export async function listOrganizationClassAssignments(
  actor: OrganizationAssignmentActor,
  classId: string,
): Promise<AssignmentListItem[]> {
  await assertClassAccess(await scopeOf(actor), classId);
  return listClassAssignments(classId);
}

export async function listOrganizationTeacherCandidates(actor: OrganizationAssignmentActor) {
  const scope = await scopeOf(actor);
  return prisma.membership
    .findMany({
      where: {
        tenantId: scope.tenantId,
        role: "TEACHER",
        status: "ACTIVE",
        deletedAt: null,
        user: {
          status: "ACTIVE",
          deletedAt: null,
          ...(scope.role === "BRANCH_MANAGER"
            ? {
                teacherBranchMemberships: {
                  some: { branchId: { in: scope.branchIds }, status: "ACTIVE", deletedAt: null },
                },
              }
            : {}),
        },
      },
      select: { user: { select: { id: true, displayName: true, email: true } } },
      distinct: ["userId"],
      orderBy: { user: { displayName: "asc" } },
    })
    .then((rows) => rows.map((row) => row.user));
}

function translateOrganizationError(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String(error.meta?.target ?? "").toLowerCase();
    throw conflictError(
      target.includes("nationalid") ? "Bu TC Kimlik No zaten kullanımda" : message,
    );
  }
  throw error;
}
