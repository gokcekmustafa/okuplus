import { Prisma, type ClassStatus, type EnrollmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import type { TeacherAssignmentActor } from "./teacher-service.js";
import type {
  AddTeacherClassStudentInput,
  CreateTeacherClassInput,
  UpdateTeacherClassInput,
  UpdateTeacherClassStatusInput,
} from "./teacher-class-management-schemas.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface TeacherManagedClassItem {
  id: string;
  name: string;
  gradeLevel: number;
  status: ClassStatus;
  branchId: string;
  branchName: string;
  academicYearId: string;
  academicYearName: string;
  studentCount: number;
  assignmentCount: number;
}

export interface TeacherClassStudentItem {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  email: string | null;
  userStatus: string;
  enrollmentStatus: EnrollmentStatus;
  enrolledAt: Date;
  leftAt: Date | null;
  lastActivityAt: Date | null;
}

export interface TeacherClassStudentOption {
  studentId: string;
  displayName: string;
  email: string | null;
  enrollmentStatus: EnrollmentStatus | null;
}

export interface TeacherClassDetail extends TeacherManagedClassItem {
  students: TeacherClassStudentItem[];
  studentOptions: TeacherClassStudentOption[];
}

export interface TeacherClassOptions {
  branches: Array<{ id: string; name: string }>;
  academicYears: Array<{
    id: string;
    name: string;
    status: string;
    startDate: Date;
    endDate: Date;
  }>;
}

async function assertTeacherTenant(actor: TeacherAssignmentActor, client: DbClient = prisma) {
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");
  const membership = await client.membership.findFirst({
    where: {
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: "TEACHER",
      status: "ACTIVE",
      deletedAt: null,
      tenant: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true },
  });
  if (!membership) throw forbiddenError("Bu işlem için aktif öğretmen yetkiniz yok");
  return actor.tenantId;
}

async function getManagedClass(
  actor: TeacherAssignmentActor,
  classId: string,
  client: DbClient = prisma,
) {
  const tenantId = await assertTeacherTenant(actor, client);
  const cls = await client.class.findFirst({
    where: {
      id: classId,
      tenantId,
      deletedAt: null,
      tenant: { status: "ACTIVE", deletedAt: null },
      teacherAssignments: {
        some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
      },
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      gradeLevel: true,
      status: true,
      branchId: true,
      academicYearId: true,
      branch: { select: { name: true } },
      academicYear: { select: { name: true } },
    },
  });
  if (!cls) throw forbiddenError("Bu sınıf için öğretmen yetkiniz yok");
  return cls;
}

export async function listTeacherClassOptions(
  actor: TeacherAssignmentActor,
): Promise<TeacherClassOptions> {
  const tenantId = await assertTeacherTenant(actor);
  const [branches, academicYears] = await Promise.all([
    prisma.branch.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        deletedAt: null,
        teacherMemberships: {
          some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.academicYear.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "UPCOMING"] } },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);
  return { branches, academicYears };
}

export async function listTeacherManagedClasses(
  actor: TeacherAssignmentActor,
): Promise<TeacherManagedClassItem[]> {
  const tenantId = await assertTeacherTenant(actor);
  const rows = await prisma.class.findMany({
    where: {
      tenantId,
      deletedAt: null,
      tenant: { status: "ACTIVE", deletedAt: null },
      teacherAssignments: {
        some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
      },
    },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      status: true,
      branchId: true,
      academicYearId: true,
      branch: { select: { name: true } },
      academicYear: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const classIds = rows.map((row) => row.id);
  if (classIds.length === 0) return [];

  const [studentGroups, assignmentGroups] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["classId"],
      where: { tenantId, classId: { in: classIds }, status: "ACTIVE", deletedAt: null },
      _count: { _all: true },
    }),
    prisma.assignment.groupBy({
      by: ["classId"],
      where: { tenantId, classId: { in: classIds }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const studentCountBy = new Map(studentGroups.map((group) => [group.classId, group._count._all]));
  const assignmentCountBy = new Map(
    assignmentGroups.map((group) => [group.classId, group._count._all]),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    gradeLevel: row.gradeLevel,
    status: row.status,
    branchId: row.branchId,
    branchName: row.branch.name,
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear.name,
    studentCount: studentCountBy.get(row.id) ?? 0,
    assignmentCount: assignmentCountBy.get(row.id) ?? 0,
  }));
}

export async function getTeacherClassDetail(
  actor: TeacherAssignmentActor,
  classId: string,
): Promise<TeacherClassDetail> {
  const cls = await getManagedClass(actor, classId);
  const [enrollments, students] = await Promise.all([
    prisma.enrollment.findMany({
      where: { tenantId: cls.tenantId, classId, deletedAt: null },
      select: {
        id: true,
        studentId: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        student: { select: { displayName: true, email: true, status: true } },
      },
      orderBy: [{ status: "asc" }, { student: { displayName: "asc" } }],
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        memberships: {
          some: { tenantId: cls.tenantId, role: "STUDENT", status: "ACTIVE", deletedAt: null },
        },
        studentProfiles: { some: { tenantId: cls.tenantId } },
      },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
  ]);
  const studentIds = enrollments.map((enrollment) => enrollment.studentId);
  const sessions = studentIds.length
    ? await prisma.exerciseSession.findMany({
        where: { tenantId: cls.tenantId, studentId: { in: studentIds } },
        select: { studentId: true, startedAt: true, completedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latestActivityByStudent = new Map<string, Date>();
  for (const session of sessions) {
    if (!latestActivityByStudent.has(session.studentId)) {
      latestActivityByStudent.set(
        session.studentId,
        session.completedAt ?? session.startedAt ?? session.createdAt,
      );
    }
  }
  const enrollmentByStudent = new Map(
    enrollments.map((enrollment) => [enrollment.studentId, enrollment]),
  );
  const activeStudentCount = enrollments.filter(
    (enrollment) => enrollment.status === "ACTIVE",
  ).length;
  const assignmentCount = await prisma.assignment.count({
    where: { tenantId: cls.tenantId, classId, deletedAt: null },
  });

  return {
    id: cls.id,
    name: cls.name,
    gradeLevel: cls.gradeLevel,
    status: cls.status,
    branchId: cls.branchId,
    branchName: cls.branch.name,
    academicYearId: cls.academicYearId,
    academicYearName: cls.academicYear.name,
    studentCount: activeStudentCount,
    assignmentCount,
    students: enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      displayName: enrollment.student.displayName,
      email: enrollment.student.email,
      userStatus: enrollment.student.status,
      enrollmentStatus: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      leftAt: enrollment.leftAt,
      lastActivityAt: latestActivityByStudent.get(enrollment.studentId) ?? null,
    })),
    studentOptions: students.map((student) => ({
      studentId: student.id,
      displayName: student.displayName,
      email: student.email,
      enrollmentStatus: enrollmentByStudent.get(student.id)?.status ?? null,
    })),
  };
}

export async function createTeacherClass(
  actor: TeacherAssignmentActor,
  input: CreateTeacherClassInput,
): Promise<TeacherClassDetail> {
  const classId = await prisma.$transaction(async (tx) => {
    const tenantId = await assertTeacherTenant(actor, tx);
    const [branch, academicYear] = await Promise.all([
      tx.branch.findFirst({
        where: {
          id: input.branchId,
          tenantId,
          status: "ACTIVE",
          deletedAt: null,
          teacherMemberships: {
            some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
          },
        },
        select: { id: true },
      }),
      tx.academicYear.findFirst({
        where: { id: input.academicYearId, tenantId, status: { in: ["ACTIVE", "UPCOMING"] } },
        select: { id: true },
      }),
    ]);
    if (!branch) throw forbiddenError("Bu şubede sınıf oluşturma yetkiniz yok");
    if (!academicYear) throw validationError("Akademik yıl bu kurum için kullanılamıyor");

    try {
      const created = await tx.class.create({
        data: {
          tenantId,
          branchId: branch.id,
          academicYearId: academicYear.id,
          name: input.name,
          gradeLevel: input.gradeLevel,
        },
        select: { id: true },
      });
      await tx.teacherClassAssignment.create({
        data: { tenantId, classId: created.id, teacherId: actor.userId, status: "ACTIVE" },
      });
      return created.id;
    } catch (error) {
      translateTeacherClassError(error);
    }
  });
  return getTeacherClassDetail(actor, classId);
}

export async function updateTeacherClass(
  actor: TeacherAssignmentActor,
  classId: string,
  input: UpdateTeacherClassInput,
): Promise<TeacherClassDetail> {
  const cls = await getManagedClass(actor, classId);
  try {
    await prisma.class.update({
      where: { id: cls.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.gradeLevel !== undefined ? { gradeLevel: input.gradeLevel } : {}),
      },
    });
  } catch (error) {
    translateTeacherClassError(error);
  }
  return getTeacherClassDetail(actor, classId);
}

export async function updateTeacherClassStatus(
  actor: TeacherAssignmentActor,
  classId: string,
  input: UpdateTeacherClassStatusInput,
): Promise<TeacherClassDetail> {
  const cls = await getManagedClass(actor, classId);
  await prisma.class.update({ where: { id: cls.id }, data: { status: input.status } });
  return getTeacherClassDetail(actor, classId);
}

export async function addTeacherClassStudent(
  actor: TeacherAssignmentActor,
  classId: string,
  input: AddTeacherClassStudentInput,
): Promise<TeacherClassDetail> {
  await prisma.$transaction(async (tx) => {
    const cls = await getManagedClass(actor, classId, tx);
    if (cls.status !== "ACTIVE") throw validationError("Arşivlenmiş sınıfa öğrenci eklenemez");
    const student = await tx.user.findFirst({
      where: {
        id: input.studentId,
        status: "ACTIVE",
        deletedAt: null,
        memberships: {
          some: { tenantId: cls.tenantId, role: "STUDENT", status: "ACTIVE", deletedAt: null },
        },
        studentProfiles: { some: { tenantId: cls.tenantId } },
      },
      select: { id: true },
    });
    if (!student) throw validationError("Öğrenci bu kurumda aktif değil");

    const existing = await tx.enrollment.findFirst({
      where: {
        tenantId: cls.tenantId,
        studentId: student.id,
        classId: cls.id,
        academicYearId: cls.academicYearId,
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    if (existing?.status === "ACTIVE") throw conflictError("Öğrenci bu sınıfa zaten kayıtlı");
    const otherActive = await tx.enrollment.findFirst({
      where: {
        tenantId: cls.tenantId,
        studentId: student.id,
        academicYearId: cls.academicYearId,
        status: "ACTIVE",
        deletedAt: null,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { id: true },
    });
    if (otherActive)
      throw conflictError("Öğrencinin bu akademik yılda başka aktif sınıf kaydı var");

    try {
      if (existing) {
        await tx.enrollment.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", leftAt: null },
        });
      } else {
        await tx.enrollment.create({
          data: {
            tenantId: cls.tenantId,
            studentId: student.id,
            classId: cls.id,
            academicYearId: cls.academicYearId,
            status: "ACTIVE",
            enrolledAt: new Date(),
          },
        });
      }
    } catch (error) {
      translateTeacherClassError(error);
    }
  });
  return getTeacherClassDetail(actor, classId);
}

export async function removeTeacherClassStudent(
  actor: TeacherAssignmentActor,
  classId: string,
  studentId: string,
): Promise<TeacherClassDetail> {
  await prisma.$transaction(async (tx) => {
    const cls = await getManagedClass(actor, classId, tx);
    const enrollment = await tx.enrollment.findFirst({
      where: {
        tenantId: cls.tenantId,
        classId: cls.id,
        studentId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!enrollment) throw notFoundError("Öğrencinin aktif sınıf kaydı bulunamadı");
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "LEFT", leftAt: new Date() },
    });
  });
  return getTeacherClassDetail(actor, classId);
}

function translateTeacherClassError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw conflictError("Bu sınıf veya sınıf kaydı zaten mevcut");
  }
  throw error;
}
