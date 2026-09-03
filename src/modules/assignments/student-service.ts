import { Prisma, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, notFoundError, validationError } from "../../lib/errors.js";

export interface StudentAssignmentListItem {
  id: string;
  title: string;
  className: string;
  teacherName: string;
  templateTitle: string;
  templateType: string;
  dueDate: Date | null;
  status: string;
  assignedAt: Date | null;
  sessionCount: number;
  hasInProgressSession: boolean;
  inProgressSessionId: string | null;
  sessionStatus: string | null;
  questionCount: number | null;
  attemptedCount: number;
  scoreSummary: Prisma.JsonValue | null;
  organizationName: string | null;
}

export interface StudentAssignmentListResult {
  items: StudentAssignmentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StudentAssignmentDetail {
  id: string;
  title: string;
  className: string;
  teacherName: string;
  templateTitle: string;
  templateType: string;
  dueDate: Date | null;
  status: string;
  assignedAt: Date | null;
  sessionCount: number;
  hasInProgressSession: boolean;
  inProgressSessionId: string | null;
  sessionStatus: string | null;
  questionCount: number | null;
  attemptedCount: number;
  scoreSummary: Prisma.JsonValue | null;
  organizationName: string | null;
}

const VISIBLE_STATUSES = ["SCHEDULED", "ACTIVE", "CLOSED"] as const;

const STUDENT_ASSIGNMENT_SELECT = {
  id: true,
  title: true,
  dueDate: true,
  status: true,
  assignedAt: true,
  class: { select: { id: true, name: true, deletedAt: true } },
  template: { select: { id: true, title: true, type: true, deletedAt: true } },
  teacher: { select: { id: true, displayName: true, deletedAt: true } },
  tenant: { select: { name: true } },
} satisfies Prisma.AssignmentSelect;

async function verifyStudentEnrollment(
  assignmentClassId: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
) {
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  if (isSuperAdmin) return;

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: actor.userId,
      classId: assignmentClassId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!enrollment) {
    throw forbiddenError("Bu ödev için yetkiniz yok");
  }
}

export async function listStudentAssignments(
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
  opts: { page: number; pageSize: number; search?: string; status?: string },
): Promise<StudentAssignmentListResult> {
  const { page, pageSize, search, status } = opts;

  const where: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    class: {
      deletedAt: null,
      enrollments: {
        some: {
          studentId: actor.userId,
          status: "ACTIVE",
          deletedAt: null,
        },
      },
    },
    template: { deletedAt: null },
    teacher: { deletedAt: null },
    status: { in: [...VISIBLE_STATUSES] },
    ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    ...(status ? { status: status as "SCHEDULED" | "ACTIVE" | "CLOSED" } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      select: STUDENT_ASSIGNMENT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);

  const assignmentIds = rows.map((r) => r.id);

  let studentSessions: Array<{
    assignmentId: string | null;
    id: string;
    status: string;
    scoreSummary: Prisma.JsonValue | null;
    templateVersion: { _count: { questions: number } };
    _count: { attempts: number };
  }> = [];

  if (assignmentIds.length > 0) {
    studentSessions = await prisma.exerciseSession.findMany({
      where: {
        assignmentId: { in: assignmentIds },
        studentId: actor.userId,
      },
      select: {
        assignmentId: true,
        id: true,
        status: true,
        scoreSummary: true,
        templateVersion: { select: { _count: { select: { questions: true } } } },
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const sessionByAssignment = new Map<string, (typeof studentSessions)[number]>();
  for (const session of studentSessions) {
    if (session.assignmentId && !sessionByAssignment.has(session.assignmentId)) {
      sessionByAssignment.set(session.assignmentId, session);
    }
  }

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      className: r.class.name,
      teacherName: r.teacher.displayName,
      templateTitle: r.template.title,
      templateType: r.template.type,
      dueDate: r.dueDate,
      status: r.status,
      assignedAt: r.assignedAt,
      sessionCount: studentSessions.filter((s) => s.assignmentId === r.id).length,
      hasInProgressSession: sessionByAssignment.get(r.id)?.status === "IN_PROGRESS",
      inProgressSessionId:
        sessionByAssignment.get(r.id)?.status === "IN_PROGRESS"
          ? sessionByAssignment.get(r.id)!.id
          : null,
      sessionStatus: sessionByAssignment.get(r.id)?.status ?? null,
      questionCount: sessionByAssignment.get(r.id)?.templateVersion._count.questions ?? null,
      attemptedCount: sessionByAssignment.get(r.id)?._count.attempts ?? 0,
      scoreSummary: sessionByAssignment.get(r.id)?.scoreSummary ?? null,
      organizationName: r.tenant.name,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getStudentAssignment(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<StudentAssignmentDetail> {
  const row = await prisma.assignment.findFirst({
    where: {
      id,
      deletedAt: null,
      class: { deletedAt: null },
      template: { deletedAt: null },
      teacher: { deletedAt: null },
      status: { in: [...VISIBLE_STATUSES] },
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    },
    select: STUDENT_ASSIGNMENT_SELECT,
  });
  if (!row) throw notFoundError("Ödev bulunamadı");

  await verifyStudentEnrollment(row.class.id, actor);

  const inProgressSession = await prisma.exerciseSession.findFirst({
    where: {
      assignmentId: id,
      studentId: actor.userId,
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });

  const session = await prisma.exerciseSession.findFirst({
    where: { assignmentId: id, studentId: actor.userId },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      scoreSummary: true,
      templateVersion: { select: { _count: { select: { questions: true } } } },
      _count: { select: { attempts: true } },
    },
  });

  return {
    id: row.id,
    title: row.title,
    className: row.class.name,
    teacherName: row.teacher.displayName,
    templateTitle: row.template.title,
    templateType: row.template.type,
    dueDate: row.dueDate,
    status: row.status,
    assignedAt: row.assignedAt,
    sessionCount: session ? 1 : 0,
    hasInProgressSession: !!inProgressSession,
    inProgressSessionId: inProgressSession?.id ?? null,
    sessionStatus: session?.status ?? null,
    questionCount: session?.templateVersion._count.questions ?? null,
    attemptedCount: session?._count.attempts ?? 0,
    scoreSummary: session?.scoreSummary ?? null,
    organizationName: row.tenant.name,
  };
}

export async function startAssignmentSession(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id,
      deletedAt: null,
      class: { deletedAt: null },
      template: { deletedAt: null },
      teacher: { deletedAt: null },
      status: { in: ["SCHEDULED", "ACTIVE"] },
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      classId: true,
      templateId: true,
      status: true,
    },
  });
  if (!assignment) throw notFoundError("Ödev bulunamadı");

  await verifyStudentEnrollment(assignment.classId, actor);

  const templateVersion = await prisma.exerciseTemplateVersion.findFirst({
    where: {
      templateId: assignment.templateId,
      status: "PUBLISHED",
    },
    select: { id: true, status: true },
    orderBy: { version: "desc" },
  });
  if (!templateVersion) {
    throw validationError("Şablonun yayınlanmış sürümü bulunamadı");
  }

  const existingSession = await prisma.exerciseSession.findFirst({
    where: {
      assignmentId: id,
      studentId: actor.userId,
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });
  if (existingSession) {
    return { sessionId: existingSession.id, isNew: false };
  }

  const created = await prisma.exerciseSession.create({
    data: {
      tenantId: assignment.tenantId,
      studentId: actor.userId,
      templateVersionId: templateVersion.id,
      assignmentId: assignment.id,
      context: "ASSIGNMENT",
      sessionType: "PRACTICE",
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });

  return { sessionId: created.id, isNew: true };
}
