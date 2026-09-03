import { Prisma, type AssignmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFoundError, validationError } from "../../lib/errors.js";
import type {
  CreateAssignmentInput,
  ListAssignmentsQuery,
  UpdateAssignmentInput,
  UpdateAssignmentStatusInput,
} from "./schemas.js";

/**
 * Ödev yönetimi servisi.
 *
 * Oluşturma kuralları:
 *  - Class var olmalı, soft-delete edilmemiş, ACTIVE, aynı tenant'a ait.
 *  - Teacher var olmalı, soft-delete edilmemiş, aynı tenant'ta aktif TEACHER üyesi.
 *  - Template var olmalı, soft-delete edilmemiş, PUBLISHED (global veya aynı tenant).
 *  - Tenant isolation: class ve teacher aynı tenant'ta olmalı.
 *
 * Status machine: DRAFT → SCHEDULED → ACTIVE → CLOSED
 *  - Geçersiz geçiş → 400
 *  - DRAFT: düzenlenebilir, silinebilir
 *  - SCHEDULED/ACTIVE: düzenlenebilir (sadece title/dueDate)
 *  - CLOSED: hiçbir düzenleme yapılamaz
 *
 * Soft-delete: deletedAt set edilir. Fiziksel silme yoktur.
 */

const VALID_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["ACTIVE"],
  ACTIVE: ["CLOSED"],
  CLOSED: [],
};

const ASSIGNMENT_LIST_SELECT = {
  id: true,
  tenantId: true,
  classId: true,
  templateId: true,
  teacherId: true,
  title: true,
  dueDate: true,
  status: true,
  assignedAt: true,
  createdAt: true,
  updatedAt: true,
  class: { select: { id: true, name: true, gradeLevel: true, status: true, deletedAt: true } },
  template: { select: { id: true, title: true, type: true, status: true, deletedAt: true } },
  teacher: { select: { id: true, displayName: true, email: true, status: true, deletedAt: true } },
} satisfies Prisma.AssignmentSelect;

export interface AssignmentListItem {
  id: string;
  tenantId: string;
  classId: string;
  className: string;
  classStatus: string;
  templateId: string;
  templateTitle: string;
  templateType: string;
  templateStatus: string;
  teacherId: string;
  teacherName: string;
  title: string;
  dueDate: Date | null;
  status: AssignmentStatus;
  assignedAt: Date | null;
  sessionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentListResult {
  items: AssignmentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type AssignmentDetail = AssignmentListItem;

export async function listAssignments(query: ListAssignmentsQuery): Promise<AssignmentListResult> {
  const { search, classId, teacherId, templateId, status, page, pageSize } = query;

  const where: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    class: { deletedAt: null },
    template: { deletedAt: null },
    teacher: { deletedAt: null },
    ...(classId ? { classId } : {}),
    ...(teacherId ? { teacherId } : {}),
    ...(templateId ? { templateId } : {}),
    ...(status ? { status } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      select: ASSIGNMENT_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);

  const assignmentIds = rows.map((r) => r.id);
  const sessionGroups =
    assignmentIds.length === 0
      ? []
      : await prisma.exerciseSession.groupBy({
          by: ["assignmentId"],
          where: { assignmentId: { in: assignmentIds } },
          _count: { _all: true },
        });
  const sessionCountBy = new Map(sessionGroups.map((g) => [g.assignmentId, g._count._all]));

  return {
    items: rows.map(({ class: cls, template, teacher, ...a }) => ({
      id: a.id,
      tenantId: a.tenantId,
      classId: a.classId,
      className: cls.name,
      classStatus: cls.status,
      templateId: a.templateId,
      templateTitle: template.title,
      templateType: template.type,
      templateStatus: template.status,
      teacherId: a.teacherId,
      teacherName: teacher.displayName,
      title: a.title,
      dueDate: a.dueDate,
      status: a.status,
      assignedAt: a.assignedAt,
      sessionCount: sessionCountBy.get(a.id) ?? 0,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getAssignment(id: string): Promise<AssignmentDetail> {
  const row = await findAssignment(id);
  if (!row) throw notFoundError("Ödev bulunamadı");

  const sessionCount = await prisma.exerciseSession.count({
    where: { assignmentId: id },
  });

  return toAssignmentItem(row, sessionCount);
}

export async function createAssignment(
  input: CreateAssignmentInput,
  _actorId?: string,
): Promise<AssignmentDetail> {
  // 1. Class doğrula
  const cls = await prisma.class.findFirst({
    where: { id: input.classId, deletedAt: null, tenant: { deletedAt: null } },
    select: { id: true, tenantId: true, status: true },
  });
  if (!cls) throw notFoundError("Sınıf bulunamadı");
  if (cls.status !== "ACTIVE") throw validationError("Sınıf aktif değil");

  // 2. Teacher doğrula
  const teacher = await prisma.user.findFirst({
    where: { id: input.teacherId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!teacher) throw notFoundError("Öğretmen bulunamadı");
  if (teacher.status !== "ACTIVE") throw validationError("Öğretmen aktif değil");

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
  if (!membership) throw validationError("Öğretmen bu kurumda aktif öğretmen üyesi değil");

  // 3. Template doğrula
  const template = await prisma.exerciseTemplate.findFirst({
    where: { id: input.templateId, deletedAt: null },
    select: { id: true, tenantId: true, status: true },
  });
  if (!template) throw notFoundError("Şablon bulunamadı");
  if (template.status !== "PUBLISHED") throw validationError("Şablon yayınlanmış olmalı");
  if (template.tenantId !== null && template.tenantId !== cls.tenantId) {
    throw validationError("Şablon bu kuruma ait değil");
  }

  const created = await prisma.assignment.create({
    data: {
      tenantId: cls.tenantId,
      classId: input.classId,
      templateId: input.templateId,
      teacherId: input.teacherId,
      title: input.title,
      dueDate: input.dueDate ?? null,
    },
    select: { id: true },
  });

  return getAssignment(created.id);
}

export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput,
): Promise<AssignmentDetail> {
  const existing = await findAssignment(id);
  if (!existing) throw notFoundError("Ödev bulunamadı");

  if (
    existing.status !== "DRAFT" &&
    existing.status !== "SCHEDULED" &&
    existing.status !== "ACTIVE"
  ) {
    throw validationError("Bu ödev düzenlenemez");
  }

  await prisma.assignment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    },
  });

  return getAssignment(id);
}

export async function updateAssignmentStatus(
  id: string,
  input: UpdateAssignmentStatusInput,
): Promise<AssignmentDetail> {
  const existing = await findAssignment(id);
  if (!existing) throw notFoundError("Ödev bulunamadı");

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(input.status)) {
    throw validationError(`"${existing.status}" durumundan "${input.status}" durumuna geçilemez`);
  }

  const data: Prisma.AssignmentUpdateInput = { status: input.status };
  if (input.status === "SCHEDULED" || input.status === "ACTIVE") {
    data.assignedAt = new Date();
  }

  await prisma.assignment.update({ where: { id }, data });
  return getAssignment(id);
}

export async function deleteAssignment(id: string): Promise<{ id: string; deletedAt: Date }> {
  const existing = await prisma.assignment.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFoundError("Ödev bulunamadı");

  if (existing.status !== "DRAFT") {
    throw validationError("Sadece taslak ödevler silinebilir");
  }

  const updated = await prisma.assignment.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return { id: updated.id, deletedAt: updated.deletedAt! };
}

export async function listClassAssignments(classId: string): Promise<AssignmentListItem[]> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true },
  });
  if (!cls) throw notFoundError("Sınıf bulunamadı");

  const rows = await prisma.assignment.findMany({
    where: {
      classId,
      deletedAt: null,
      class: { deletedAt: null },
      template: { deletedAt: null },
      teacher: { deletedAt: null },
    },
    select: ASSIGNMENT_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  const assignmentIds = rows.map((r) => r.id);
  const sessionGroups =
    assignmentIds.length === 0
      ? []
      : await prisma.exerciseSession.groupBy({
          by: ["assignmentId"],
          where: { assignmentId: { in: assignmentIds } },
          _count: { _all: true },
        });
  const sessionCountBy = new Map(sessionGroups.map((g) => [g.assignmentId, g._count._all]));

  return rows.map(({ class: cls, template, teacher, ...a }) => ({
    id: a.id,
    tenantId: a.tenantId,
    classId: a.classId,
    className: cls.name,
    classStatus: cls.status,
    templateId: a.templateId,
    templateTitle: template.title,
    templateType: template.type,
    templateStatus: template.status,
    teacherId: a.teacherId,
    teacherName: teacher.displayName,
    title: a.title,
    dueDate: a.dueDate,
    status: a.status,
    assignedAt: a.assignedAt,
    sessionCount: sessionCountBy.get(a.id) ?? 0,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

// ---------- Yardımcılar ----------

async function findAssignment(id: string) {
  return prisma.assignment.findFirst({
    where: {
      id,
      deletedAt: null,
      class: { deletedAt: null },
      template: { deletedAt: null },
      teacher: { deletedAt: null },
    },
    select: ASSIGNMENT_LIST_SELECT,
  });
}

function toAssignmentItem(
  row: {
    id: string;
    tenantId: string;
    classId: string;
    templateId: string;
    teacherId: string;
    title: string;
    dueDate: Date | null;
    status: AssignmentStatus;
    assignedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    class: { name: string; status: string; deletedAt: Date | null };
    template: { title: string; type: string; status: string; deletedAt: Date | null };
    teacher: { displayName: string; deletedAt: Date | null };
  },
  sessionCount: number,
): AssignmentDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    classId: row.classId,
    className: row.class.name,
    classStatus: row.class.status,
    templateId: row.templateId,
    templateTitle: row.template.title,
    templateType: row.template.type,
    templateStatus: row.template.status,
    teacherId: row.teacherId,
    teacherName: row.teacher.displayName,
    title: row.title,
    dueDate: row.dueDate,
    status: row.status,
    assignedAt: row.assignedAt,
    sessionCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
