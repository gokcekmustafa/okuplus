import { Prisma, type Membership, type UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import { ScryptPasswordHasher } from "../auth/index.js";
import type {
  CreateTeacherBranchInput,
  CreateTeacherClassInput,
  CreateTeacherInput,
  ListTeachersQuery,
  UpdateTeacherBranchInput,
  UpdateTeacherClassInput,
  UpdateTeacherInput,
} from "./schemas.js";

/**
 * Öğretmen yönetimi servisi (yalnızca SUPER_ADMIN).
 *
 * Öğretmen: User + TEACHER Membership üzerinden çalışır; şube üyelikleri
 * TeacherBranchMembership, sınıf atamaları TeacherClassAssignment modellerinde
 * saklanır. Yeni model oluşturulmaz; mevcut mimari ve RLS kullanılır (prisma
 * singleton süper kullanıcıdır, BYPASSRLS — erişim route katmanındaki
 * requirePlatformRole guard'ıyla sınırlanır).
 *
 * KURUM TİPİ KURALI (mevcut users/membership modülüyle birebir uyumlu):
 * INDIVIDUAL tenant'ta yalnızca bireysel roller (STUDENT, PARENT)
 * kullanılabilir; TEACHER kurumsal bir rol olduğu için INDIVIDUAL tenant'ta
 * öğretmen oluşturulamaz. ORGANIZATION tenant'ta öğretmen kullanılabilir.
 *
 * DUPLICATE KURALLARI: DB partial unique index'leri (prisma/manual/002)
 * `uq_teacher_branch_active` (branch+teacher, ACTIVE) ve
 * `uq_teacher_class_active` (class+teacher, ACTIVE) tarafından engellenir;
 * P2002 → çakışma hatası döner. Aynı öğretmen birden fazla şubede/sınıfta
 * görev alabilir (farklı branch/class kombinasyonları).
 */

const hasher = new ScryptPasswordHasher();

const INDIVIDUAL_ALLOWED_ROLES = new Set(["STUDENT", "PARENT"]);

function assertTeacherAllowedInTenant(tenantType: string): void {
  if (tenantType === "INDIVIDUAL" && !INDIVIDUAL_ALLOWED_ROLES.has("TEACHER")) {
    throw validationError("Bireysel kurumda öğretmen rolü kullanılamaz");
  }
}

const MEMBERSHIP_BASE_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  role: true,
  status: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
  user: {
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      birthYear: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.MembershipSelect;

export interface TeacherListItem {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  birthYear: number | null;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  status: UserStatus;
  branchCount: number;
  classCount: number;
  createdAt: Date;
}

export interface TeacherListResult {
  items: TeacherListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TeacherDetail {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    birthYear: number | null;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
  };
  memberships: MembershipSummary[];
  branches: BranchSummary[];
  classAssignments: ClassAssignmentSummary[];
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  role: Membership["role"];
  status: Membership["status"];
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface BranchSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  branchId: string;
  branchName: string;
  status: Membership["status"];
  createdAt: Date;
}

export interface ClassAssignmentSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  classId: string;
  className: string;
  branchId: string;
  branchName: string;
  academicYearId: string;
  academicYearName: string;
  subject: string | null;
  status: Membership["status"];
  createdAt: Date;
}

export async function listTeachers(query: ListTeachersQuery): Promise<TeacherListResult> {
  const { search, tenantId, status, page, pageSize } = query;

  const where: Prisma.MembershipWhereInput = {
    role: "TEACHER",
    deletedAt: null,
    user: {
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
    },
    tenant: { deletedAt: null },
    ...(tenantId ? { tenantId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      select: MEMBERSHIP_BASE_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.membership.count({ where }),
  ]);

  // Satır başına aktif şube/sınıf sayıları (öğretmen + kurum bağlamında).
  const userIds = rows.map((r) => r.userId);
  const [branchGroups, classGroups] =
    userIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.teacherBranchMembership.groupBy({
            by: ["teacherId", "tenantId"],
            where: {
              teacherId: { in: userIds },
              status: "ACTIVE",
              deletedAt: null,
              tenant: { deletedAt: null },
            },
            _count: { _all: true },
          }),
          prisma.teacherClassAssignment.groupBy({
            by: ["teacherId", "tenantId"],
            where: {
              teacherId: { in: userIds },
              status: "ACTIVE",
              deletedAt: null,
              tenant: { deletedAt: null },
            },
            _count: { _all: true },
          }),
        ]);
  const branchCountByKey = new Map(
    branchGroups.map((g) => [`${g.teacherId}:${g.tenantId}`, g._count._all]),
  );
  const classCountByKey = new Map(
    classGroups.map((g) => [`${g.teacherId}:${g.tenantId}`, g._count._all]),
  );
  const key = (userId: string, tenantId: string) => `${userId}:${tenantId}`;

  return {
    items: rows.map(({ tenant, user, ...m }) => ({
      id: m.id,
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      birthYear: user.birthYear,
      tenantId: tenant.id,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      tenantType: tenant.type,
      status: user.status,
      branchCount: branchCountByKey.get(key(user.id, tenant.id)) ?? 0,
      classCount: classCountByKey.get(key(user.id, tenant.id)) ?? 0,
      createdAt: user.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getTeacher(userId: string): Promise<TeacherDetail> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      birthYear: true,
      status: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) {
    throw notFoundError("Öğretmen bulunamadı");
  }

  const [memberships, branches, classAssignments] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        role: true,
        status: true,
        startedAt: true,
        endedAt: true,
        tenant: { select: { id: true, name: true, type: true, deletedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teacherBranchMembership.findMany({
      where: { teacherId: userId, deletedAt: null },
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
      where: { teacherId: userId, deletedAt: null },
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
    user,
    memberships: memberships.map(({ tenant, ...m }) => ({
      id: m.id,
      tenantId: tenant.id,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      tenantType: tenant.type,
      role: m.role,
      status: m.status,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
    })),
    branches: branches.map(({ tenant, branch, ...b }) => ({
      id: b.id,
      tenantId: b.tenantId,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      branchId: branch.id,
      branchName: branch.name,
      status: b.status,
      createdAt: b.createdAt,
    })),
    classAssignments: classAssignments.map(({ tenant, class: c, ...ca }) => ({
      id: ca.id,
      tenantId: ca.tenantId,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      classId: c.id,
      className: c.name,
      branchId: c.branchId,
      branchName: c.branch.name,
      academicYearId: c.academicYear.id,
      academicYearName: c.academicYear.name,
      subject: ca.subject,
      status: ca.status,
      createdAt: ca.createdAt,
    })),
  };
}

export async function createTeacher(input: CreateTeacherInput): Promise<TeacherDetail> {
  const tenant = await prisma.tenant.findFirst({ where: { id: input.tenantId, deletedAt: null } });
  if (!tenant) {
    throw notFoundError("Kurum bulunamadı");
  }

  // KURUM TİPİ KURALI: INDIVIDUAL tenant'ta öğretmen oluşturulamaz.
  assertTeacherAllowedInTenant(tenant.type);

  const passwordHash = await hasher.hash(input.password);

  try {
    const userId = await prisma.$transaction(async (tx) => {
      // Aynı e-postayla INDIVIDUAL tenant'a bağlı başka bir kullanıcı olabilir;
      // TEACHER rolü zaten INDIVIDUAL'da yasak olduğundan ek bireysel kontrol
      // gerekmez (mevcut membership kuralıyla uyumlu).
      const user = await tx.user.create({
        data: {
          displayName: input.displayName,
          email: input.email,
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.birthYear ? { birthYear: input.birthYear } : {}),
          ...(input.status ? { status: input.status } : {}),
          passwordHash,
        },
        select: { id: true },
      });

      await tx.membership.create({
        data: {
          tenantId: input.tenantId,
          userId: user.id,
          role: "TEACHER",
          status: "ACTIVE",
          startedAt: new Date(),
        },
      });

      return user.id;
    });

    return await getTeacher(userId);
  } catch (err) {
    throw translateTeacherError(err);
  }
}

export async function updateTeacher(
  userId: string,
  input: UpdateTeacherInput,
): Promise<TeacherDetail> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) {
    throw notFoundError("Öğretmen bulunamadı");
  }

  try {
    const data: Prisma.UserUpdateInput = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    await prisma.user.update({ where: { id: userId }, data });
    return await getTeacher(userId);
  } catch (err) {
    throw translateTeacherError(err);
  }
}

export async function softDeleteTeacher(userId: string): Promise<{ id: string; deletedAt: Date }> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) {
    throw notFoundError("Öğretmen bulunamadı");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteTeacher: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// ---------- Şube üyelikleri ----------

export async function addTeacherBranch(
  userId: string,
  input: CreateTeacherBranchInput,
): Promise<BranchSummary> {
  const teacher = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!teacher) {
    throw notFoundError("Öğretmen bulunamadı");
  }

  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, deletedAt: null },
    select: { id: true, tenantId: true, name: true, tenant: { select: { deletedAt: true } } },
  });
  if (!branch) {
    throw notFoundError("Şube bulunamadı");
  }
  // Şube, öğretmenin üyesi olduğu kurumda olmalı.
  const memberOfTenant = await prisma.membership.findFirst({
    where: {
      userId,
      tenantId: branch.tenantId,
      role: "TEACHER",
      deletedAt: null,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: { id: true },
  });
  if (!memberOfTenant) {
    throw validationError("Öğretmen bu kurumda öğretmen rolüyle üye değil");
  }

  try {
    const created = await prisma.teacherBranchMembership.create({
      data: {
        tenantId: branch.tenantId,
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
    const { tenant, branch: b, ...rest } = created;
    return {
      id: rest.id,
      tenantId: rest.tenantId,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      branchId: b.id,
      branchName: b.name,
      status: rest.status,
      createdAt: rest.createdAt,
    };
  } catch (err) {
    throw translateTeacherError(err);
  }
}

export async function updateTeacherBranch(
  id: string,
  input: UpdateTeacherBranchInput,
): Promise<BranchSummary> {
  const existing = await prisma.teacherBranchMembership.findUnique({
    where: { id },
    select: { id: true, teacherId: true },
  });
  if (!existing) {
    throw notFoundError("Şube üyeliği bulunamadı");
  }

  try {
    const updated = await prisma.teacherBranchMembership.update({
      where: { id },
      data: { status: input.status },
      select: {
        id: true,
        tenantId: true,
        status: true,
        createdAt: true,
        tenant: { select: { name: true, deletedAt: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    const { tenant, branch, ...rest } = updated;
    return {
      id: rest.id,
      tenantId: rest.tenantId,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      branchId: branch.id,
      branchName: branch.name,
      status: rest.status,
      createdAt: rest.createdAt,
    };
  } catch (err) {
    throw translateTeacherError(err);
  }
}

export async function removeTeacherBranch(id: string): Promise<{ id: string; removed: true }> {
  const existing = await prisma.teacherBranchMembership.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw notFoundError("Şube üyeliği bulunamadı");
  }
  await prisma.teacherBranchMembership.update({
    where: { id },
    data: { status: "REMOVED", deletedAt: new Date() },
  });
  return { id, removed: true };
}

// ---------- Sınıf atamaları ----------

export async function addTeacherClass(
  userId: string,
  input: CreateTeacherClassInput,
): Promise<ClassAssignmentSummary> {
  const teacher = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!teacher) {
    throw notFoundError("Öğretmen bulunamadı");
  }

  const cls = await prisma.class.findFirst({
    where: { id: input.classId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      name: true,
      branchId: true,
      branch: { select: { name: true } },
      academicYear: { select: { id: true, name: true } },
      tenant: { select: { deletedAt: true } },
    },
  });
  if (!cls) {
    throw notFoundError("Sınıf bulunamadı");
  }
  // Sınıf, öğretmenin üyesi olduğu kurumda olmalı (cross-tenant engel).
  const memberOfTenant = await prisma.membership.findFirst({
    where: {
      userId,
      tenantId: cls.tenantId,
      role: "TEACHER",
      deletedAt: null,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: { id: true },
  });
  if (!memberOfTenant) {
    throw validationError("Öğretmen bu kurumda öğretmen rolüyle üye değil");
  }

  try {
    const created = await prisma.teacherClassAssignment.create({
      data: {
        tenantId: cls.tenantId,
        classId: cls.id,
        teacherId: userId,
        ...(input.subject ? { subject: input.subject } : {}),
        status: input.status,
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
    });
    const { tenant, class: c, ...rest } = created;
    return {
      id: rest.id,
      tenantId: rest.tenantId,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      classId: c.id,
      className: c.name,
      branchId: c.branchId,
      branchName: c.branch.name,
      academicYearId: c.academicYear.id,
      academicYearName: c.academicYear.name,
      subject: rest.subject,
      status: rest.status,
      createdAt: rest.createdAt,
    };
  } catch (err) {
    throw translateTeacherError(err);
  }
}

export async function updateTeacherClass(
  id: string,
  input: UpdateTeacherClassInput,
): Promise<ClassAssignmentSummary> {
  const existing = await prisma.teacherClassAssignment.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw notFoundError("Sınıf ataması bulunamadı");
  }

  try {
    const updated = await prisma.teacherClassAssignment.update({
      where: { id },
      data: { status: input.status },
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
    });
    const { tenant, class: c, ...rest } = updated;
    return {
      id: rest.id,
      tenantId: rest.tenantId,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      classId: c.id,
      className: c.name,
      branchId: c.branchId,
      branchName: c.branch.name,
      academicYearId: c.academicYear.id,
      academicYearName: c.academicYear.name,
      subject: rest.subject,
      status: rest.status,
      createdAt: rest.createdAt,
    };
  } catch (err) {
    throw translateTeacherError(err);
  }
}

export async function removeTeacherClass(id: string): Promise<{ id: string; removed: true }> {
  const existing = await prisma.teacherClassAssignment.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw notFoundError("Sınıf ataması bulunamadı");
  }
  await prisma.teacherClassAssignment.update({
    where: { id },
    data: { status: "REMOVED", deletedAt: new Date() },
  });
  return { id, removed: true };
}

// ---------- Lookup (okuma amaçlı, CRUD DEĞİL) ----------

export async function listBranches(tenantId: string) {
  return prisma.branch.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listClasses(tenantId: string, academicYearId?: string) {
  return prisma.class.findMany({
    where: { tenantId, deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
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

function translateTeacherError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      if (target.toLowerCase().includes("email")) {
        throw conflictError("Bu e-posta adresi zaten kullanımda");
      }
      if (target.toLowerCase().includes("uq_teacher_branch_active")) {
        throw conflictError("Bu öğretmen aynı şubede zaten aktif üye");
      }
      if (target.toLowerCase().includes("uq_teacher_class_active")) {
        throw conflictError("Bu öğretmen aynı sınıfa zaten aktif atanmış");
      }
      if (target.toLowerCase().includes("uq_membership_active")) {
        throw conflictError("Bu kurumda aynı rol için aktif/pending üyelik zaten mevcut");
      }
      throw conflictError("Kayıt çakışması");
    }
  }
  throw err;
}
