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
  learningStepId: string | null;
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
  studentAssignmentId: string | null;
  studentAssignmentStatus: string;
  assignmentSource: string | null;
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
  learningStepId: string | null;
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
  studentAssignmentId: string | null;
  studentAssignmentStatus: string;
  assignmentSource: string | null;
}

const VISIBLE_STATUSES = ["SCHEDULED", "ACTIVE", "CLOSED"] as const;

const STUDENT_ASSIGNMENT_SELECT = {
  id: true,
  title: true,
  learningStepId: true,
  dueDate: true,
  status: true,
  assignedAt: true,
  class: { select: { id: true, name: true, deletedAt: true } },
  template: { select: { id: true, title: true, type: true, deletedAt: true } },
  teacher: { select: { id: true, displayName: true, deletedAt: true } },
  tenant: { select: { name: true } },
} satisfies Prisma.AssignmentSelect;

async function resolveStudentAssignment(
  assignmentId: string,
  assignmentClassId: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<{ id: string; status: string; source: string; dueAt: Date | null } | null> {
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  if (isSuperAdmin) return null;

  const directAssignment = await prisma.studentAssignment.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: actor.userId } },
    select: { id: true, tenantId: true, status: true, source: true, dueAt: true },
  });
  if (directAssignment && (!actor.tenantId || directAssignment.tenantId === actor.tenantId)) {
    return directAssignment;
  }

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
  return null;
}

export async function listStudentAssignments(
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
  opts: { page: number; pageSize: number; search?: string; status?: string },
): Promise<StudentAssignmentListResult> {
  const { page, pageSize, search, status } = opts;

  const where: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    class: { deletedAt: null },
    template: { deletedAt: null },
    teacher: { deletedAt: null },
    status: { in: [...VISIBLE_STATUSES] },
    ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    OR: [
      {
        studentAssignments: {
          some: {
            studentId: actor.userId,
            ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
          },
        },
      },
      {
        class: {
          enrollments: {
            some: { studentId: actor.userId, status: "ACTIVE", deletedAt: null },
          },
        },
      },
    ],
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

  const studentAssignments =
    assignmentIds.length > 0
      ? await prisma.studentAssignment.findMany({
          where: { assignmentId: { in: assignmentIds }, studentId: actor.userId },
          select: { id: true, assignmentId: true, status: true, source: true, dueAt: true },
        })
      : [];
  const studentAssignmentByAssignment = new Map(
    studentAssignments.map((item) => [item.assignmentId, item]),
  );

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
    items: rows.map((r) => {
      const studentAssignment = studentAssignmentByAssignment.get(r.id);
      const session = sessionByAssignment.get(r.id);
      return {
        id: r.id,
        title: r.title,
        className: r.class.name,
        teacherName: r.teacher.displayName,
        templateTitle: r.template.title,
        templateType: r.template.type,
        learningStepId: r.learningStepId,
        dueDate: studentAssignment?.dueAt ?? r.dueDate,
        status: r.status,
        assignedAt: r.assignedAt,
        sessionCount: studentSessions.filter((s) => s.assignmentId === r.id).length,
        hasInProgressSession: session?.status === "IN_PROGRESS",
        inProgressSessionId: session?.status === "IN_PROGRESS" ? session.id : null,
        sessionStatus: session?.status ?? null,
        questionCount: session?.templateVersion._count.questions ?? null,
        attemptedCount: session?._count.attempts ?? 0,
        scoreSummary: session?.scoreSummary ?? null,
        organizationName: r.tenant.name,
        studentAssignmentId: studentAssignment?.id ?? null,
        studentAssignmentStatus:
          session?.status === "COMPLETED"
            ? "COMPLETED"
            : session?.status === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : (studentAssignment?.status ?? "ASSIGNED"),
        assignmentSource: studentAssignment?.source ?? null,
      };
    }),
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

  const studentAssignment = await resolveStudentAssignment(id, row.class.id, actor);

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
    learningStepId: row.learningStepId,
    dueDate: studentAssignment?.dueAt ?? row.dueDate,
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
    studentAssignmentId: studentAssignment?.id ?? null,
    studentAssignmentStatus:
      session?.status === "COMPLETED"
        ? "COMPLETED"
        : session?.status === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : (studentAssignment?.status ?? "ASSIGNED"),
    assignmentSource: studentAssignment?.source ?? null,
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
      templateVersionId: true,
      status: true,
    },
  });
  if (!assignment) throw notFoundError("Ödev bulunamadı");

  const studentAssignment = await resolveStudentAssignment(id, assignment.classId, actor);

  const templateVersion = assignment.templateVersionId
    ? await prisma.exerciseTemplateVersion.findFirst({
        where: {
          id: assignment.templateVersionId,
          templateId: assignment.templateId,
          status: "PUBLISHED",
        },
        select: { id: true },
      })
    : await prisma.exerciseTemplateVersion.findFirst({
        where: { templateId: assignment.templateId, status: "PUBLISHED" },
        select: { id: true },
        orderBy: { version: "desc" },
      });
  if (!templateVersion) {
    throw validationError("Şablonun yayınlanmış sürümü bulunamadı");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existingSession = await tx.exerciseSession.findFirst({
            where: {
              assignmentId: id,
              studentId: actor.userId,
              status: "IN_PROGRESS",
            },
            select: { id: true },
          });
          if (existingSession) {
            if (actor.platformRole !== "SUPER_ADMIN") {
              const recipient = await tx.studentAssignment.upsert({
                where: {
                  assignmentId_studentId: { assignmentId: id, studentId: actor.userId },
                },
                create: {
                  tenantId: assignment.tenantId,
                  assignmentId: id,
                  studentId: actor.userId,
                  source: studentAssignment?.source === "SYSTEM" ? "SYSTEM" : "MANUAL",
                  dueAt: studentAssignment?.dueAt ?? null,
                },
                update: {},
                select: { id: true, startedAt: true },
              });
              await tx.studentAssignment.update({
                where: { id: recipient.id },
                data: {
                  status: "IN_PROGRESS",
                  startedAt: recipient.startedAt ?? new Date(),
                  completedAt: null,
                },
              });
            }
            return { sessionId: existingSession.id, isNew: false };
          }

          if (
            actor.platformRole !== "SUPER_ADMIN" &&
            (studentAssignment?.status === "COMPLETED" ||
              (await tx.exerciseSession.findFirst({
                where: {
                  assignmentId: id,
                  studentId: actor.userId,
                  status: "COMPLETED",
                },
                select: { id: true },
              })))
          ) {
            throw validationError("Ödev zaten tamamlandı");
          }

          if (actor.platformRole !== "SUPER_ADMIN") {
            const recipient = await tx.studentAssignment.upsert({
              where: {
                assignmentId_studentId: { assignmentId: id, studentId: actor.userId },
              },
              create: {
                tenantId: assignment.tenantId,
                assignmentId: id,
                studentId: actor.userId,
                source: studentAssignment?.source === "SYSTEM" ? "SYSTEM" : "MANUAL",
                dueAt: studentAssignment?.dueAt ?? null,
              },
              update: {},
              select: { id: true, startedAt: true },
            });
            await tx.studentAssignment.update({
              where: { id: recipient.id },
              data: {
                status: "IN_PROGRESS",
                startedAt: recipient.startedAt ?? new Date(),
                completedAt: null,
              },
            });
          }

          const created = await tx.exerciseSession.create({
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }

  throw validationError("Ödev oturumu başlatılamadı");
}
