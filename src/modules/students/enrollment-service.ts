import { Prisma, type EnrollmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import type { CreateEnrollmentInput, UpdateEnrollmentInput } from "./schemas.js";

/**
 * Sınıf kaydı (Enrollment) servisi (yalnızca SUPER_ADMIN).
 *
 * Kural: Aynı öğrenci + akademik yıl için yalnızca bir ACTIVE kayıt olabilir.
 * App katmanında okunabilir hata üretilir; DB'deki `uq_enrollment_student_year_active`
 * partial unique index'i son savunmadır (P2002 → 409). Aynı öğrenci + yıl +
 * sınıf için `@@unique([studentId, academicYearId, classId])` de mevcuttur.
 */

const ENROLLMENT_SELECT = {
  id: true,
  tenantId: true,
  studentId: true,
  status: true,
  enrolledAt: true,
  leftAt: true,
  createdAt: true,
  updatedAt: true,
  class: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  tenant: { select: { id: true, name: true, type: true } },
} satisfies Prisma.EnrollmentSelect;

export interface EnrollmentRow {
  id: string;
  studentId: string;
  tenantId: string;
  tenantName: string;
  status: EnrollmentStatus;
  className: string;
  classId: string;
  academicYearName: string;
  academicYearId: string;
  enrolledAt: Date;
  leftAt: Date | null;
}

export async function listStudentEnrollments(profileId: string): Promise<EnrollmentRow[]> {
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, student: { deletedAt: null } },
    select: { studentId: true, tenantId: true },
  });
  if (!profile) {
    throw notFoundError("Öğrenci bulunamadı");
  }

  const rows = await prisma.enrollment.findMany({
    where: { studentId: profile.studentId, tenantId: profile.tenantId, deletedAt: null },
    select: ENROLLMENT_SELECT,
    orderBy: { enrolledAt: "desc" },
  });
  return rows.map(toEnrollmentRow);
}

export async function createEnrollment(
  profileId: string,
  input: CreateEnrollmentInput,
): Promise<EnrollmentRow> {
  const profile = await prisma.studentProfile.findFirst({
    where: { id: profileId, student: { deletedAt: null }, tenant: { deletedAt: null } },
    select: { studentId: true, tenantId: true },
  });
  if (!profile) {
    throw notFoundError("Öğrenci bulunamadı");
  }

  const cls = await prisma.class.findFirst({
    where: { id: input.classId, deletedAt: null, tenantId: profile.tenantId },
    select: { id: true, academicYearId: true },
  });
  if (!cls) {
    throw validationError("Seçilen sınıf bu kuruma ait değil veya bulunamadı");
  }

  if (input.status === "ACTIVE") {
    const existingActive = await prisma.enrollment.findFirst({
      where: {
        studentId: profile.studentId,
        academicYearId: cls.academicYearId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingActive) {
      throw conflictError("Aynı akademik yılda aktif sınıf kaydı zaten var");
    }
  }

  const now = new Date();
  try {
    const created = await prisma.enrollment.create({
      data: {
        tenantId: profile.tenantId,
        studentId: profile.studentId,
        classId: input.classId,
        academicYearId: cls.academicYearId,
        status: input.status,
        enrolledAt: now,
        ...(input.status !== "ACTIVE" ? { leftAt: now } : {}),
      },
      select: ENROLLMENT_SELECT,
    });
    return toEnrollmentRow(created);
  } catch (err) {
    throw translateEnrollmentError(err);
  }
}

export async function updateEnrollment(
  id: string,
  input: UpdateEnrollmentInput,
): Promise<EnrollmentRow> {
  const existing = await prisma.enrollment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, studentId: true, academicYearId: true, status: true },
  });
  if (!existing) {
    throw notFoundError("Sınıf kaydı bulunamadı");
  }

  // ACTIVE'ye dönüşte aynı yıl için başka aktif kayıt varsa engelle.
  if (input.status === "ACTIVE" && existing.status !== "ACTIVE") {
    const clash = await prisma.enrollment.findFirst({
      where: {
        id: { not: id },
        studentId: existing.studentId,
        academicYearId: existing.academicYearId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (clash) {
      throw conflictError("Aynı akademik yılda aktif sınıf kaydı zaten var");
    }
  }

  const data: Prisma.EnrollmentUpdateInput = {
    status: input.status,
    ...(input.status === "ACTIVE" ? { leftAt: null } : { leftAt: new Date() }),
  };

  try {
    const updated = await prisma.enrollment.update({
      where: { id },
      data,
      select: ENROLLMENT_SELECT,
    });
    return toEnrollmentRow(updated);
  } catch (err) {
    throw translateEnrollmentError(err);
  }
}

function toEnrollmentRow(row: {
  id: string;
  tenantId: string;
  studentId: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  leftAt: Date | null;
  class: { id: string; name: string };
  academicYear: { id: string; name: string };
  tenant: { name: string };
}): EnrollmentRow {
  const { class: c, academicYear: ay, tenant, ...rest } = row;
  return {
    ...rest,
    className: c.name,
    classId: c.id,
    academicYearName: ay.name,
    academicYearId: ay.id,
    tenantName: tenant.name,
  };
}

function translateEnrollmentError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = String(err.meta?.target ?? "");
    if (target.toLowerCase().includes("uq_enrollment_student_year_active")) {
      throw conflictError("Aynı akademik yılda aktif sınıf kaydı zaten var");
    }
    throw conflictError("Bu öğrenci için bu sınıf kaydı zaten mevcut");
  }
  throw err;
}
