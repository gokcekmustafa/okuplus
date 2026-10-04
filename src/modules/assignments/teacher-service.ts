import { Prisma, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import type { CreateTeacherAssignmentInput, ListAssignmentsQuery } from "./schemas.js";
import { getAssignment } from "./service.js";

export interface TeacherAssignmentActor {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}

export interface TeacherClassStudent {
  id: string;
  studentId: string;
  displayName: string;
  email: string | null;
}

export interface TeacherClassItem {
  id: string;
  name: string;
  gradeLevel: number;
  students: TeacherClassStudent[];
}

export interface TeacherTemplateItem {
  id: string;
  title: string;
  type: string;
}

export interface TeacherAssignmentListItem {
  id: string;
  classId: string;
  className: string;
  templateId: string;
  templateTitle: string;
  templateType: string;
  title: string;
  dueDate: Date | null;
  status: string;
  assignedAt: Date | null;
  studentCount: number;
  sessionCount: number;
  createdAt: Date;
}

export interface TeacherAssignmentListResult {
  items: TeacherAssignmentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Öğretmen yetkisinin temeli Membership değil, aktif sınıf atamasıdır:
 * TeacherClassAssignment → Class → Enrollment → Student.
 */
export async function assertTeacherClassAccess(
  actor: TeacherAssignmentActor,
  classId: string,
  studentId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ id: string; tenantId: string; name: string }> {
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");

  const membership = await client.membership.findFirst({
    where: {
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: "TEACHER",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) throw forbiddenError("Bu işlem için aktif öğretmen yetkiniz yok");

  const cls = await client.class.findFirst({
    where: {
      id: classId,
      tenantId: actor.tenantId,
      status: "ACTIVE",
      deletedAt: null,
      tenant: { status: "ACTIVE", deletedAt: null },
      teacherAssignments: {
        some: {
          tenantId: actor.tenantId,
          teacherId: actor.userId,
          status: "ACTIVE",
          deletedAt: null,
        },
      },
    },
    select: { id: true, tenantId: true, name: true },
  });
  if (!cls) throw forbiddenError("Bu sınıf için öğretmen yetkiniz yok");

  if (studentId) {
    const enrollment = await client.enrollment.findFirst({
      where: {
        tenantId: actor.tenantId,
        classId,
        studentId,
        status: "ACTIVE",
        deletedAt: null,
        student: { status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    });
    if (!enrollment) throw forbiddenError("Bu öğrenci öğretmenin yetkili sınıfında değil");
  }

  return cls;
}

async function assertTeacherTenant(actor: TeacherAssignmentActor): Promise<string> {
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");
  const membership = await prisma.membership.findFirst({
    where: {
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: "TEACHER",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) throw forbiddenError("Bu işlem için aktif öğretmen yetkiniz yok");
  return actor.tenantId;
}

export async function listTeacherClasses(
  actor: TeacherAssignmentActor,
): Promise<TeacherClassItem[]> {
  const tenantId = await assertTeacherTenant(actor);
  const rows = await prisma.class.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      deletedAt: null,
      teacherAssignments: {
        some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
      },
    },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      enrollments: {
        where: {
          tenantId,
          status: "ACTIVE",
          deletedAt: null,
          student: { status: "ACTIVE", deletedAt: null },
        },
        select: {
          id: true,
          studentId: true,
          student: { select: { displayName: true, email: true } },
        },
        orderBy: { student: { displayName: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    gradeLevel: row.gradeLevel,
    students: row.enrollments.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      displayName: enrollment.student.displayName,
      email: enrollment.student.email,
    })),
  }));
}

export async function listTeacherTemplates(
  actor: TeacherAssignmentActor,
): Promise<TeacherTemplateItem[]> {
  const tenantId = await assertTeacherTenant(actor);
  return prisma.exerciseTemplate.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      OR: [{ tenantId: null }, { tenantId }],
      versions: { some: { status: "PUBLISHED" } },
    },
    select: { id: true, title: true, type: true },
    orderBy: { title: "asc" },
  });
}

export async function listTeacherAssignments(
  actor: TeacherAssignmentActor,
  query: Pick<ListAssignmentsQuery, "search" | "status" | "page" | "pageSize"> = {
    page: 1,
    pageSize: 20,
  },
): Promise<TeacherAssignmentListResult> {
  const tenantId = await assertTeacherTenant(actor);
  const where: Prisma.AssignmentWhereInput = {
    tenantId,
    teacherId: actor.userId,
    deletedAt: null,
    class: {
      deletedAt: null,
      teacherAssignments: {
        some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
      },
    },
    ...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      select: {
        id: true,
        classId: true,
        title: true,
        dueDate: true,
        status: true,
        assignedAt: true,
        createdAt: true,
        class: { select: { name: true } },
        template: { select: { id: true, title: true, type: true } },
        _count: { select: { studentAssignments: true, sessions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      classId: row.classId,
      className: row.class.name,
      templateId: row.template.id,
      templateTitle: row.template.title,
      templateType: row.template.type,
      title: row.title,
      dueDate: row.dueDate,
      status: row.status,
      assignedAt: row.assignedAt,
      studentCount: row._count.studentAssignments,
      sessionCount: row._count.sessions,
      createdAt: row.createdAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createTeacherAssignment(
  input: CreateTeacherAssignmentInput,
  actor: TeacherAssignmentActor,
) {
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");

  const created = await prisma.$transaction(async (tx) => {
    const cls = await assertTeacherClassAccess(actor, input.classId, input.studentId, tx);

    const template = await tx.exerciseTemplate.findFirst({
      where: { id: input.templateId, deletedAt: null },
      select: { id: true, tenantId: true, status: true },
    });
    if (!template) throw notFoundError("Şablon bulunamadı");
    if (template.status !== "PUBLISHED") throw validationError("Şablon yayınlanmış olmalı");
    if (template.tenantId !== null && template.tenantId !== cls.tenantId) {
      throw validationError("Şablon bu kuruma ait değil");
    }

    const templateVersion = await tx.exerciseTemplateVersion.findFirst({
      where: { templateId: template.id, status: "PUBLISHED" },
      select: { id: true },
      orderBy: { version: "desc" },
    });
    if (!templateVersion) throw validationError("Şablonun yayınlanmış sürümü bulunamadı");

    if (input.learningStepId) {
      const step = await tx.learningStep.findFirst({
        where: {
          id: input.learningStepId,
          OR: [{ tenantId: null }, { tenantId: cls.tenantId }],
          status: "PUBLISHED",
          isActive: true,
          unit: { path: { status: "PUBLISHED", deletedAt: null } },
        },
        select: { id: true, exerciseTemplateVersionId: true },
      });
      if (!step) throw validationError("Öğrenme adımı bu kurum için kullanılabilir değil");
      if (step.exerciseTemplateVersionId) {
        const version = await tx.exerciseTemplateVersion.findUnique({
          where: { id: step.exerciseTemplateVersionId },
          select: { templateId: true },
        });
        if (version?.templateId !== input.templateId) {
          throw validationError("Ödev şablonu öğrenme adımıyla eşleşmiyor");
        }
      }
    }

    const assignment = await tx.assignment.create({
      data: {
        tenantId: cls.tenantId,
        classId: cls.id,
        templateId: input.templateId,
        templateVersionId: templateVersion.id,
        learningStepId: input.learningStepId ?? null,
        teacherId: actor.userId,
        title: input.title,
        dueDate: input.dueDate ?? null,
        status: input.status,
        assignedAt: new Date(),
      },
      select: { id: true, tenantId: true, dueDate: true },
    });

    const studentIds = input.studentId
      ? [input.studentId]
      : (
          await tx.enrollment.findMany({
            where: {
              tenantId: cls.tenantId,
              classId: cls.id,
              status: "ACTIVE",
              deletedAt: null,
              student: { status: "ACTIVE", deletedAt: null },
            },
            select: { studentId: true },
          })
        ).map((enrollment) => enrollment.studentId);

    if (studentIds.length > 0) {
      await tx.studentAssignment.createMany({
        data: studentIds.map((studentId) => ({
          tenantId: assignment.tenantId,
          assignmentId: assignment.id,
          studentId,
          source: "MANUAL" as const,
          dueAt: assignment.dueDate,
        })),
        skipDuplicates: true,
      });
    }
    return assignment.id;
  });

  return getAssignment(created);
}
