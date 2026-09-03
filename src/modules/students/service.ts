import { Prisma, type EnrollmentStatus, type Membership, type UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import { ScryptPasswordHasher } from "../auth/index.js";
import type { CreateStudentInput, ListStudentsQuery, UpdateStudentInput } from "./schemas.js";

/**
 * Öğrenci yönetimi servisi (yalnızca SUPER_ADMIN).
 *
 * Öğrenci: User + STUDENT Membership + StudentProfile üçlüsü üzerinden
 * çalışır. Yeni User/StudentProfile/Membership modelleri oluşturulmaz; mevcut
 * mimari ve RLS kullanılır (prisma singleton süper kullanıcıdır, BYPASSRLS —
 * erişim route katmanındaki requirePlatformRole guard'ıyla sınırlanır).
 *
 * Bireysel kurallar (mevcut users modülüyle aynı): bir kullanıcı yalnızca bir
 * INDIVIDUAL tenant'a üye olabilir (ACTIVE/PENDING). INDIVIDUAL tenant'ta
 * yalnızca STUDENT/PARENT rolleri kullanılabilir — bu modül öğrenci
 * oluştururken daima STUDENT kullandığından kural otomatik sağlanır.
 */

const hasher = new ScryptPasswordHasher();

const ENROLLMENT_SELECT = {
  id: true,
  status: true,
  enrolledAt: true,
  leftAt: true,
  class: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
} satisfies Prisma.EnrollmentSelect;

export interface StudentListItem {
  id: string;
  studentId: string;
  displayName: string;
  email: string | null;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  className: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface StudentListResult {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StudentDetail {
  id: string;
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
  tenant: { id: string; name: string; type: string };
  profile: {
    id: string;
    currentLevel: { id: string; code: string; name: string } | null;
    targetLevel: { id: string; code: string; name: string } | null;
    startedAt: Date;
  };
  memberships: MembershipSummary[];
  enrollments: EnrollmentSummary[];
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  role: Membership["role"];
  status: Membership["status"];
  startedAt: Date | null;
}

export interface EnrollmentSummary {
  id: string;
  status: EnrollmentStatus;
  className: string;
  academicYearName: string;
  enrolledAt: Date;
  leftAt: Date | null;
}

export async function listStudents(query: ListStudentsQuery): Promise<StudentListResult> {
  const { search, tenantId, status, page, pageSize } = query;

  const where: Prisma.StudentProfileWhereInput = {
    student: { deletedAt: null },
    tenant: { deletedAt: null },
    ...(tenantId ? { tenantId } : {}),
    ...(status ? { student: { status } } : {}),
    ...(search
      ? {
          student: {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.studentProfile.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        tenantId: true,
        student: {
          select: { id: true, displayName: true, email: true, status: true, createdAt: true },
        },
        tenant: { select: { id: true, name: true, type: true } },
      },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.studentProfile.count({ where }),
  ]);

  // Aktif sınıf: satır bazında tenant'a göre tek sorguyla çekilir.
  const studentIds = rows.map((r) => r.studentId);
  const activeEnrollments =
    studentIds.length === 0
      ? []
      : await prisma.enrollment.findMany({
          where: {
            studentId: { in: studentIds },
            status: "ACTIVE",
            deletedAt: null,
            tenant: { deletedAt: null },
          },
          select: { studentId: true, tenantId: true, class: { select: { name: true } } },
        });
  const classNameByStudentTenant = new Map(
    activeEnrollments.map((e) => [`${e.studentId}:${e.tenantId}`, e.class.name]),
  );

  return {
    items: rows.map(({ id, student, tenant }) => ({
      id,
      studentId: student.id,
      displayName: student.displayName,
      email: student.email,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantType: tenant.type,
      className: classNameByStudentTenant.get(`${student.id}:${tenant.id}`) ?? null,
      status: student.status,
      createdAt: student.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getStudent(profileId: string): Promise<StudentDetail> {
  const profile = await prisma.studentProfile.findFirst({
    where: {
      id: profileId,
      student: { deletedAt: null },
      tenant: { deletedAt: null },
    },
    select: {
      id: true,
      startedAt: true,
      currentLevel: { select: { id: true, code: true, name: true } },
      targetLevel: { select: { id: true, code: true, name: true } },
      student: {
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
      },
      tenant: { select: { id: true, name: true, type: true } },
    },
  });

  if (!profile) {
    throw notFoundError("Öğrenci bulunamadı");
  }

  const [memberships, enrollments] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: profile.student.id },
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
      where: { studentId: profile.student.id, tenantId: profile.tenant.id, deletedAt: null },
      select: ENROLLMENT_SELECT,
      orderBy: { enrolledAt: "desc" },
    }),
  ]);

  const { student, tenant, currentLevel, targetLevel, startedAt } = profile;

  return {
    id: profile.id,
    user: {
      id: student.id,
      displayName: student.displayName,
      email: student.email,
      phone: student.phone,
      birthYear: student.birthYear,
      status: student.status,
      emailVerifiedAt: student.emailVerifiedAt,
      lastLoginAt: student.lastLoginAt,
      createdAt: student.createdAt,
    },
    tenant: { id: tenant.id, name: tenant.name, type: tenant.type },
    profile: {
      id: profile.id,
      currentLevel,
      targetLevel,
      startedAt,
    },
    memberships: memberships.map(({ tenant: t, ...m }) => ({
      id: m.id,
      tenantId: t.id,
      tenantName: t.deletedAt ? `${t.name} (silindi)` : t.name,
      tenantType: t.type,
      role: m.role,
      status: m.status,
      startedAt: m.startedAt,
    })),
    enrollments: enrollments.map(({ class: c, academicYear, ...e }) => ({
      id: e.id,
      status: e.status,
      className: c.name,
      academicYearName: academicYear.name,
      enrolledAt: e.enrolledAt,
      leftAt: e.leftAt,
    })),
  };
}

export async function createStudent(input: CreateStudentInput): Promise<StudentDetail> {
  const passwordHash = await hasher.hash(input.password);

  try {
    const profileId = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: input.tenantId, deletedAt: null } });
      if (!tenant) {
        throw notFoundError("Kurum bulunamadı");
      }

      // Bireysel kural: bir kullanıcı yalnızca bir INDIVIDUAL tenant'a üye
      // olabilir (ACTIVE/PENDING). Yeni kullanıcı açtığımız için buradaki
      // kontrol tek INDIVIDUAL üyelik sayısını da kapsar.
      if (tenant.type === "INDIVIDUAL") {
        const existingIndividual = await tx.membership.findFirst({
          where: {
            status: { in: ["ACTIVE", "PENDING"] },
            tenant: { type: "INDIVIDUAL", deletedAt: null },
            user: { email: input.email },
          },
          select: { tenantId: true },
        });
        if (existingIndividual) {
          throw conflictError(
            "Bu e-posta zaten başka bir bireysel (INDIVIDUAL) kuruma öğrenci olarak bağlı",
          );
        }
      }

      // Seviyeler geçerli mi (global Level kataloğu).
      if (input.currentLevelId) {
        const level = await tx.level.findUnique({ where: { id: input.currentLevelId } });
        if (!level) {
          throw validationError("Mevcut seviye bulunamadı");
        }
      }
      if (input.targetLevelId) {
        const level = await tx.level.findUnique({ where: { id: input.targetLevelId } });
        if (!level) {
          throw validationError("Hedef seviye bulunamadı");
        }
      }

      // Sınıf seçildiyse kurum uyumunu doğrula (cross-tenant engel).
      if (input.classId) {
        const cls = await tx.class.findFirst({
          where: { id: input.classId, deletedAt: null, tenantId: input.tenantId },
          select: { id: true, academicYearId: true },
        });
        if (!cls) {
          throw validationError("Seçilen sınıf bu kuruma ait değil");
        }
        if (input.academicYearId && input.academicYearId !== cls.academicYearId) {
          throw validationError("Seçilen akademik yıl, sınıfın akademik yılıyla uyuşmuyor");
        }
      }

      // 1) User
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

      // 2) STUDENT membership (bireysel/org fark etmez; STUDENT her ikisinde geçerli)
      const now = new Date();
      await tx.membership.create({
        data: {
          tenantId: input.tenantId,
          userId: user.id,
          role: "STUDENT",
          status: "ACTIVE",
          startedAt: now,
        },
      });

      // 3) StudentProfile
      const profile = await tx.studentProfile.create({
        data: {
          tenantId: input.tenantId,
          studentId: user.id,
          ...(input.currentLevelId ? { currentLevelId: input.currentLevelId } : {}),
          ...(input.targetLevelId ? { targetLevelId: input.targetLevelId } : {}),
        },
        select: { id: true },
      });

      // 4) Sınıf seçildiyse Enrollment (akademik yıl sınıftan türetilir)
      if (input.classId) {
        const cls = await tx.class.findUniqueOrThrow({
          where: { id: input.classId },
          select: { academicYearId: true },
        });
        await tx.enrollment.create({
          data: {
            tenantId: input.tenantId,
            studentId: user.id,
            classId: input.classId,
            academicYearId: cls.academicYearId,
            status: "ACTIVE",
            enrolledAt: now,
          },
        });
      }

      return profile.id;
    });

    return await getStudent(profileId);
  } catch (err) {
    throw translateStudentError(err);
  }
}

export async function updateStudent(
  profileId: string,
  input: UpdateStudentInput,
): Promise<StudentDetail> {
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, student: { deletedAt: null }, tenant: { deletedAt: null } },
    select: { id: true, studentId: true, tenantId: true },
  });
  if (!profile) {
    throw notFoundError("Öğrenci bulunamadı");
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (input.currentLevelId) {
        const level = await tx.level.findUnique({ where: { id: input.currentLevelId } });
        if (!level) {
          throw validationError("Mevcut seviye bulunamadı");
        }
      }
      if (input.targetLevelId) {
        const level = await tx.level.findUnique({ where: { id: input.targetLevelId } });
        if (!level) {
          throw validationError("Hedef seviye bulunamadı");
        }
      }

      const userData: Prisma.UserUpdateInput = {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      await tx.user.update({ where: { id: profile.studentId }, data: userData });

      const profileData: Prisma.StudentProfileUpdateInput = {
        ...(input.currentLevelId !== undefined ? { currentLevelId: input.currentLevelId } : {}),
        ...(input.targetLevelId !== undefined ? { targetLevelId: input.targetLevelId } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      };
      await tx.studentProfile.update({ where: { id: profileId }, data: profileData });
    });

    return await getStudent(profileId);
  } catch (err) {
    throw translateStudentError(err);
  }
}

export async function softDeleteStudent(
  profileId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, student: { deletedAt: null }, tenant: { deletedAt: null } },
    select: { studentId: true },
  });
  if (!profile) {
    throw notFoundError("Öğrenci bulunamadı");
  }

  const updated = await prisma.user.update({
    where: { id: profile.studentId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (updated.deletedAt === null) {
    throw new Error("softDeleteStudent: deletedAt set edilemedi");
  }
  return { id: updated.id, deletedAt: updated.deletedAt };
}

// ---------- Lookup (okuma amaçlı, CRUD DEĞİL) ----------

export async function listLevels() {
  return prisma.level.findMany({
    orderBy: { displayOrder: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export async function listAcademicYears(tenantId: string) {
  return prisma.academicYear.findMany({
    where: { tenantId },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  });
}

export async function listClasses(tenantId: string, academicYearId?: string) {
  return prisma.class.findMany({
    where: { tenantId, deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, gradeLevel: true, academicYearId: true },
  });
}

function translateStudentError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? String(err.meta.target[0]) : "";
      if (target === "email") {
        throw conflictError("Bu e-posta adresi zaten kullanımda");
      }
      if (
        String(err.meta?.target ?? "")
          .toLowerCase()
          .includes("uq_membership_active")
      ) {
        throw conflictError("Bu kurumda aynı rol için aktif/pending üyelik zaten mevcut");
      }
      if (
        String(err.meta?.target ?? "")
          .toLowerCase()
          .includes("uq_enrollment_student_year_active")
      ) {
        throw conflictError("Aynı akademik yılda aktif sınıf kaydı zaten var");
      }
      throw conflictError("Kayıt çakışması");
    }
  }
  throw err;
}
