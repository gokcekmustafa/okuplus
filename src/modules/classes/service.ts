import { Prisma, type ClassStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateClassInput,
  CreateTeacherAssignmentInput,
  ListClassesQuery,
  UpdateClassInput,
  UpdateClassStatusInput,
} from "./schemas.js";

/**
 * Sınıf yönetimi servisi (yalnızca SUPER_ADMIN).
 *
 * Sınıf oluşturma kuralları:
 *  - Tenant var olmalı, soft-delete edilmemiş olmalı (aksi halde 404).
 *  - Tenant tipi ORGANIZATION olmalı (INDIVIDUAL → 400).
 *  - Tenant durumu ACTIVE olmalı (SUSPENDED/CLOSED → 400).
 *  - Şube var olmalı, soft-delete edilmemiş olmalı (aksi halde 404), aynı
 *    tenant'a ait olmalı (cross-tenant → 400) ve ACTIVE durumda olmalı
 *    (INACTIVE/CLOSED → 400).
 *  - Akademik yıl var olmalı (→ 400) ve aynı tenant'a ait olmalı (→ 400).
 *  - Sınıf adı aynı şube + akademik yıl içinde tektir
 *    (`@@unique([branchId, academicYearId, name])` — soft-delete dahil tüm
 *    kayıtlar için, P2002 → 409). Bu index kısmi değildir; silinmiş bir
 *    sınıfın adı aynı şube + yıl içinde yeniden kullanılamaz.
 *
 * Sınıf silme SOFT-DELETE'tir (deletedAt); fiziksel silme yoktur. Enrollment
 * ve TeacherClassAssignment tarihçesi korunur. ARCHIVED durumu silme değildir.
 *
 * ÖĞRETMEN ATAMASI (class-scoped, POST /admin/classes/:id/teachers): Mevcut
 * öğretmen akışındaki addTeacherClass'tan farklı olarak şube üyeliği
 * doğrulanır — atanacak öğretmen silinmemiş + ACTIVE kullanıcı, ilgili
 * kurumda ACTIVE TEACHER üyeliğine ve sınıfın şubesinde ACTIVE
 * TeacherBranchMembership'e sahip olmalıdır. Duplicate aktif atama
 * `uq_teacher_class_active` ile DB seviyesinde de engellenir (P2002 → 409).
 *
 * ENROLLMENT: Sınıf modülünde duplicate enrollment ucu yoktur; öğrenci
 * kayıtları mevcut öğrenci modülü üzerinden yönetilir
 * (POST /admin/students/:id/enrollments, PATCH /admin/enrollments/:id).
 */

const CLASS_LIST_SELECT = {
  id: true,
  tenantId: true,
  branchId: true,
  academicYearId: true,
  name: true,
  gradeLevel: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
  branch: { select: { id: true, name: true, status: true } },
  academicYear: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
} satisfies Prisma.ClassSelect;

export interface ClassListItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  tenantStatus: string;
  branchId: string;
  branchName: string;
  branchStatus: string;
  academicYearId: string;
  academicYearName: string;
  academicYearStatus: string;
  name: string;
  gradeLevel: number;
  status: ClassStatus;
  studentCount: number;
  teacherCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassListResult {
  items: ClassListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type ClassDetail = ClassListItem;

export interface ClassStudent {
  id: string;
  studentId: string;
  displayName: string;
  email: string | null;
  userStatus: string;
  enrollmentStatus: string;
  enrolledAt: Date;
  leftAt: Date | null;
}

export interface ClassTeacher {
  id: string;
  teacherId: string;
  displayName: string;
  email: string | null;
  userStatus: string;
  status: string;
  subject: string | null;
  createdAt: Date;
}

export async function listClasses(query: ListClassesQuery): Promise<ClassListResult> {
  const { search, tenantId, branchId, academicYearId, status, page, pageSize } = query;

  const where: Prisma.ClassWhereInput = {
    deletedAt: null,
    tenant: { deletedAt: null },
    ...(tenantId ? { tenantId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.class.findMany({
      where,
      select: CLASS_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.class.count({ where }),
  ]);

  // Sınıf başına aktif öğrenci / aktif öğretmen ataması sayıları.
  const classIds = rows.map((r) => r.id);
  const [studentGroups, teacherGroups] =
    classIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.enrollment.groupBy({
            by: ["classId"],
            where: {
              classId: { in: classIds },
              status: "ACTIVE",
              deletedAt: null,
              tenant: { deletedAt: null },
            },
            _count: { _all: true },
          }),
          prisma.teacherClassAssignment.groupBy({
            by: ["classId"],
            where: {
              classId: { in: classIds },
              status: "ACTIVE",
              deletedAt: null,
              tenant: { deletedAt: null },
            },
            _count: { _all: true },
          }),
        ]);
  const studentCountBy = new Map(studentGroups.map((g) => [g.classId, g._count._all]));
  const teacherCountBy = new Map(teacherGroups.map((g) => [g.classId, g._count._all]));

  return {
    items: rows.map(({ tenant, branch, academicYear, ...c }) => ({
      id: c.id,
      tenantId: tenant.id,
      tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
      tenantType: tenant.type,
      tenantStatus: tenant.status,
      branchId: branch.id,
      branchName: branch.name,
      branchStatus: branch.status,
      academicYearId: academicYear.id,
      academicYearName: academicYear.name,
      academicYearStatus: academicYear.status,
      name: c.name,
      gradeLevel: c.gradeLevel,
      status: c.status,
      studentCount: studentCountBy.get(c.id) ?? 0,
      teacherCount: teacherCountBy.get(c.id) ?? 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getClass(id: string): Promise<ClassDetail> {
  const row = await findClass(id);
  if (!row) {
    throw notFoundError("Sınıf bulunamadı");
  }

  const [studentCount, teacherCount] = await Promise.all([
    prisma.enrollment.count({ where: { classId: id, status: "ACTIVE", deletedAt: null } }),
    prisma.teacherClassAssignment.count({
      where: { classId: id, status: "ACTIVE", deletedAt: null },
    }),
  ]);

  return toClassItem(row, studentCount, teacherCount);
}

export async function createClass(input: CreateClassInput): Promise<ClassDetail> {
  const tenant = await prisma.tenant.findFirst({ where: { id: input.tenantId, deletedAt: null } });
  if (!tenant) {
    throw notFoundError("Kurum bulunamadı");
  }
  if (tenant.type === "INDIVIDUAL") {
    throw validationError("Bireysel kurumda sınıf oluşturulamaz");
  }
  if (tenant.status !== "ACTIVE") {
    throw validationError("Kurum aktif değil; sınıf oluşturulamaz");
  }

  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, deletedAt: null, tenant: { deletedAt: null } },
    select: { id: true, tenantId: true, status: true },
  });
  if (!branch) {
    throw notFoundError("Şube bulunamadı");
  }
  if (branch.tenantId !== input.tenantId) {
    throw validationError("Seçilen şube bu kuruma ait değil");
  }
  if (branch.status !== "ACTIVE") {
    throw validationError("Şube aktif değil; sınıf oluşturulamaz");
  }

  const academicYear = await prisma.academicYear.findFirst({
    where: { id: input.academicYearId },
    select: { id: true, tenantId: true },
  });
  if (!academicYear) {
    throw validationError("Akademik yıl bulunamadı");
  }
  if (academicYear.tenantId !== input.tenantId) {
    throw validationError("Seçilen akademik yıl bu kuruma ait değil");
  }

  try {
    const created = await prisma.class.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        name: input.name,
        gradeLevel: input.gradeLevel,
        ...(input.status ? { status: input.status } : {}),
      },
      select: { id: true },
    });
    return await getClass(created.id);
  } catch (err) {
    throw translateClassError(err);
  }
}

export async function updateClass(id: string, input: UpdateClassInput): Promise<ClassDetail> {
  if (!(await findClass(id))) {
    throw notFoundError("Sınıf bulunamadı");
  }

  try {
    await prisma.class.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.gradeLevel !== undefined ? { gradeLevel: input.gradeLevel } : {}),
      },
    });
    return await getClass(id);
  } catch (err) {
    throw translateClassError(err);
  }
}

export async function updateClassStatus(
  id: string,
  input: UpdateClassStatusInput,
): Promise<ClassDetail> {
  if (!(await findClass(id))) {
    throw notFoundError("Sınıf bulunamadı");
  }

  await prisma.class.update({
    where: { id },
    data: { status: input.status },
  });
  return await getClass(id);
}

export async function softDeleteClass(id: string): Promise<{ id: string; deletedAt: Date }> {
  const cls = await prisma.class.findFirst({ where: { id, deletedAt: null } });
  if (!cls) {
    throw notFoundError("Sınıf bulunamadı");
  }

  const updated = await prisma.class.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteClass: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// ---------- Sınıf öğrencileri (read-only) ----------

export async function listClassStudents(classId: string): Promise<ClassStudent[]> {
  if (!(await findClass(classId))) {
    throw notFoundError("Sınıf bulunamadı");
  }

  const rows = await prisma.enrollment.findMany({
    where: { classId, deletedAt: null, student: { deletedAt: null } },
    select: {
      id: true,
      status: true,
      enrolledAt: true,
      leftAt: true,
      student: { select: { id: true, displayName: true, email: true, status: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });
  return rows.map(({ student, ...e }) => ({
    id: e.id,
    studentId: student.id,
    displayName: student.displayName,
    email: student.email,
    userStatus: student.status,
    enrollmentStatus: e.status,
    enrolledAt: e.enrolledAt,
    leftAt: e.leftAt,
  }));
}

// ---------- Sınıf öğretmenleri (read-only + class-scoped atama) ----------

export async function listClassTeachers(classId: string): Promise<ClassTeacher[]> {
  if (!(await findClass(classId))) {
    throw notFoundError("Sınıf bulunamadı");
  }

  const rows = await prisma.teacherClassAssignment.findMany({
    where: { classId, deletedAt: null, teacher: { deletedAt: null } },
    select: {
      id: true,
      status: true,
      subject: true,
      createdAt: true,
      teacher: { select: { id: true, displayName: true, email: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ teacher, ...a }) => ({
    id: a.id,
    teacherId: teacher.id,
    displayName: teacher.displayName,
    email: teacher.email,
    userStatus: teacher.status,
    status: a.status,
    subject: a.subject,
    createdAt: a.createdAt,
  }));
}

export async function assignTeacherToClass(
  classId: string,
  input: CreateTeacherAssignmentInput,
): Promise<ClassTeacher> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, deletedAt: null, tenant: { deletedAt: null } },
    select: { id: true, tenantId: true, branchId: true },
  });
  if (!cls) {
    throw notFoundError("Sınıf bulunamadı");
  }

  const teacher = await prisma.user.findFirst({
    where: { id: input.teacherId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!teacher) {
    throw validationError("Atanacak öğretmen bulunamadı");
  }
  if (teacher.status !== "ACTIVE") {
    throw validationError("Atanacak öğretmen aktif değil");
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: input.teacherId,
      tenantId: cls.tenantId,
      role: "TEACHER",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) {
    throw validationError("Öğretmen bu kurumda aktif öğretmen üyesi değil");
  }

  const branchMembership = await prisma.teacherBranchMembership.findFirst({
    where: {
      teacherId: input.teacherId,
      branchId: cls.branchId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!branchMembership) {
    throw validationError("Öğretmen bu şubede aktif üye değil");
  }

  const dup = await prisma.teacherClassAssignment.findFirst({
    where: { classId, teacherId: input.teacherId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    throw conflictError("Bu öğretmen bu sınıfa zaten aktif atanmış");
  }

  try {
    const created = await prisma.teacherClassAssignment.create({
      data: {
        tenantId: cls.tenantId,
        classId,
        teacherId: input.teacherId,
        ...(input.subject !== undefined && input.subject !== null
          ? { subject: input.subject }
          : {}),
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
    const { teacher: t, ...rest } = created;
    return {
      id: rest.id,
      teacherId: t.id,
      displayName: t.displayName,
      email: t.email,
      userStatus: t.status,
      status: rest.status,
      subject: rest.subject,
      createdAt: rest.createdAt,
    };
  } catch (err) {
    throw translateClassError(err);
  }
}

// ---------- Yardımcılar ----------

async function findClass(id: string) {
  return prisma.class.findFirst({
    where: { id, deletedAt: null, tenant: { deletedAt: null } },
    select: CLASS_LIST_SELECT,
  });
}

function toClassItem(
  row: {
    id: string;
    tenantId: string;
    name: string;
    gradeLevel: number;
    status: ClassStatus;
    createdAt: Date;
    updatedAt: Date;
    tenant: { id: string; name: string; type: string; status: string; deletedAt: Date | null };
    branch: { id: string; name: string; status: string };
    academicYear: {
      id: string;
      name: string;
      status: string;
      startDate: Date;
      endDate: Date;
    };
  },
  studentCount: number,
  teacherCount: number,
): ClassDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant.deletedAt ? `${row.tenant.name} (silindi)` : row.tenant.name,
    tenantType: row.tenant.type,
    tenantStatus: row.tenant.status,
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

function translateClassError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = String(err.meta?.target ?? "");
    if (target.toLowerCase().includes("uq_teacher_class_active")) {
      throw conflictError("Bu öğretmen bu sınıfa zaten aktif atanmış");
    }
    if (target.toLowerCase().includes("name")) {
      throw conflictError("Bu şubede bu akademik yılda aynı ada sahip bir sınıf zaten mevcut");
    }
    throw conflictError("Kayıt çakışması");
  }
  throw err;
}
