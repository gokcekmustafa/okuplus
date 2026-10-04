import { Prisma, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, notFoundError } from "../../lib/errors.js";
import { assertTeacherClassAccess, type TeacherAssignmentActor } from "./teacher-service.js";
import { resolveStudentAssignment } from "./student-service.js";

export interface AssignmentSkillResult {
  code: string;
  name: string;
  totalQuestions: number;
  answered: number;
  correct: number;
  percentage: number | null;
}

export interface AssignmentSessionResult {
  sessionId: string;
  status: string;
  totalQuestions: number;
  correct: number;
  wrong: number;
  blank: number;
  pending: number;
  percentage: number | null;
  timeSpentMs: number;
  startedAt: Date;
  completedAt: Date | null;
  skills: AssignmentSkillResult[];
}

export interface StudentAssignmentResult {
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  assignmentStatus: string;
  latest: AssignmentSessionResult | null;
  history: AssignmentSessionResult[];
}

export interface StudentAssignmentResultResponse {
  assignment: {
    id: string;
    title: string;
    className: string;
    templateTitle: string;
    dueDate: Date | null;
  };
  result: StudentAssignmentResult;
}

export interface TeacherAssignmentResultsResponse {
  assignment: {
    id: string;
    title: string;
    classId: string;
    className: string;
    templateTitle: string;
    dueDate: Date | null;
  };
  summary: {
    totalStudents: number;
    assigned: number;
    started: number;
    completed: number;
    averagePercentage: number | null;
  };
  students: StudentAssignmentResult[];
}

const SESSION_RESULT_SELECT = {
  id: true,
  status: true,
  startedAt: true,
  completedAt: true,
  timeSpentMs: true,
  createdAt: true,
  templateVersion: {
    select: {
      questions: {
        select: {
          questionVersionId: true,
          questionVersion: {
            select: {
              question: {
                select: { skill: { select: { code: true, name: true } }, deletedAt: true },
              },
            },
          },
        },
      },
    },
  },
  attempts: {
    select: {
      questionVersionId: true,
      isCorrect: true,
      timeSpentMs: true,
      responseOrder: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ExerciseSessionSelect;

type SessionResultRow = Prisma.ExerciseSessionGetPayload<{
  select: typeof SESSION_RESULT_SELECT;
}>;

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

function latestAttempts(session: SessionResultRow) {
  const latest = new Map<string, SessionResultRow["attempts"][number]>();
  for (const attempt of [...session.attempts].sort((a, b) => {
    if (a.responseOrder !== b.responseOrder) return a.responseOrder - b.responseOrder;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })) {
    latest.set(attempt.questionVersionId, attempt);
  }
  return latest;
}

function buildSessionResult(session: SessionResultRow): AssignmentSessionResult {
  const questions = session.templateVersion.questions;
  const attempts = latestAttempts(session);
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  let attemptDuration = 0;
  for (const attempt of attempts.values()) {
    if (attempt.isCorrect === true) correct += 1;
    else if (attempt.isCorrect === false) wrong += 1;
    else pending += 1;
  }
  for (const attempt of session.attempts) attemptDuration += attempt.timeSpentMs ?? 0;
  const totalQuestions = questions.length;
  const blank = Math.max(0, totalQuestions - attempts.size);
  const percentage = totalQuestions > 0 ? roundPercentage((correct / totalQuestions) * 100) : null;

  const skillMap = new Map<
    string,
    { name: string; totalQuestions: number; answered: number; correct: number }
  >();
  for (const question of questions) {
    const skill = question.questionVersion.question.skill;
    if (!skill) continue;
    const current = skillMap.get(skill.code) ?? {
      name: skill.name,
      totalQuestions: 0,
      answered: 0,
      correct: 0,
    };
    current.totalQuestions += 1;
    const attempt = attempts.get(question.questionVersionId);
    if (attempt) {
      current.answered += 1;
      if (attempt.isCorrect === true) current.correct += 1;
    }
    skillMap.set(skill.code, current);
  }

  return {
    sessionId: session.id,
    status: session.status,
    totalQuestions,
    correct,
    wrong,
    blank,
    pending,
    percentage,
    timeSpentMs: session.timeSpentMs ?? attemptDuration,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    skills: [...skillMap.entries()].map(([code, value]) => ({
      code,
      name: value.name,
      totalQuestions: value.totalQuestions,
      answered: value.answered,
      correct: value.correct,
      percentage:
        value.totalQuestions > 0
          ? roundPercentage((value.correct / value.totalQuestions) * 100)
          : null,
    })),
  };
}

async function loadSessions(
  assignmentId: string,
  studentIds: string[],
  tenantId?: string,
): Promise<Map<string, AssignmentSessionResult[]>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.exerciseSession.findMany({
    where: {
      assignmentId,
      studentId: { in: studentIds },
      ...(tenantId ? { tenantId } : {}),
    },
    select: { ...SESSION_RESULT_SELECT, studentId: true },
    orderBy: { createdAt: "asc" },
  });
  const byStudent = new Map<string, AssignmentSessionResult[]>();
  for (const row of rows) {
    const result = buildSessionResult(row);
    const current = byStudent.get(row.studentId) ?? [];
    current.push(result);
    byStudent.set(row.studentId, current);
  }
  return byStudent;
}

async function buildStudentResults(
  assignmentId: string,
  recipients: Array<{
    studentId: string;
    status: string;
    student: { displayName: string; email: string | null };
  }>,
  tenantId: string,
): Promise<StudentAssignmentResult[]> {
  const sessions = await loadSessions(
    assignmentId,
    recipients.map((recipient) => recipient.studentId),
    tenantId,
  );
  return recipients.map((recipient) => {
    const history = sessions.get(recipient.studentId) ?? [];
    return {
      studentId: recipient.studentId,
      studentName: recipient.student.displayName,
      studentEmail: recipient.student.email,
      assignmentStatus: history.at(-1)?.status === "COMPLETED" ? "COMPLETED" : recipient.status,
      latest: history.at(-1) ?? null,
      history,
    };
  });
}

function summaryFor(students: StudentAssignmentResult[]) {
  const completed = students.filter((student) => student.assignmentStatus === "COMPLETED");
  const percentages = completed
    .map((student) => student.latest?.percentage)
    .filter((value): value is number => value !== null && value !== undefined);
  return {
    totalStudents: students.length,
    assigned: students.filter((student) => student.assignmentStatus === "ASSIGNED").length,
    started: students.filter((student) =>
      ["IN_PROGRESS", "COMPLETED"].includes(student.assignmentStatus),
    ).length,
    completed: completed.length,
    averagePercentage:
      percentages.length > 0
        ? roundPercentage(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
        : null,
  };
}

export async function getStudentAssignmentResult(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<StudentAssignmentResultResponse> {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id,
      deletedAt: null,
      status: { in: ["SCHEDULED", "ACTIVE", "CLOSED"] },
      class: { deletedAt: null },
      template: { deletedAt: null },
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      classId: true,
      title: true,
      dueDate: true,
      class: { select: { name: true } },
      template: { select: { title: true } },
    },
  });
  if (!assignment) throw notFoundError("Ödev bulunamadı");

  const recipient = await resolveStudentAssignment(id, assignment.classId, actor);
  const recipients = await prisma.studentAssignment.findUnique({
    where: { assignmentId_studentId: { assignmentId: id, studentId: actor.userId } },
    select: {
      studentId: true,
      status: true,
      student: { select: { displayName: true, email: true } },
    },
  });
  const fallbackStudent = await prisma.user.findFirst({
    where: { id: actor.userId, deletedAt: null },
    select: { id: true, displayName: true, email: true },
  });
  const studentProfile = recipients?.student ?? fallbackStudent;
  if (!studentProfile) throw forbiddenError("Bu ödev için öğrenci kaydı bulunamadı");

  const rows = await buildStudentResults(
    id,
    [
      {
        studentId: actor.userId,
        status: recipients?.status ?? recipient?.status ?? "ASSIGNED",
        student: { displayName: studentProfile.displayName, email: studentProfile.email },
      },
    ],
    assignment.tenantId ?? actor.tenantId ?? "",
  );

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      className: assignment.class.name,
      templateTitle: assignment.template.title,
      dueDate: assignment.dueDate,
    },
    result: rows[0]!,
  };
}

export async function getTeacherAssignmentResults(
  id: string,
  actor: TeacherAssignmentActor,
): Promise<TeacherAssignmentResultsResponse> {
  if (!actor.tenantId) throw forbiddenError("Öğretmen işlemi için kurum seçimi gerekli");
  const assignment = await prisma.assignment.findFirst({
    where: { id, tenantId: actor.tenantId, teacherId: actor.userId, deletedAt: null },
    select: {
      id: true,
      classId: true,
      title: true,
      dueDate: true,
      class: { select: { name: true } },
      template: { select: { title: true } },
    },
  });
  if (!assignment) throw notFoundError("Ödev bulunamadı");
  await assertTeacherClassAccess(actor, assignment.classId);

  const enrolledStudents = await prisma.enrollment.findMany({
    where: {
      tenantId: actor.tenantId,
      classId: assignment.classId,
      status: "ACTIVE",
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
    },
    select: { studentId: true },
  });
  const enrolledStudentIds = enrolledStudents.map((enrollment) => enrollment.studentId);
  const recipients =
    enrolledStudentIds.length === 0
      ? []
      : await prisma.studentAssignment.findMany({
          where: {
            assignmentId: id,
            tenantId: actor.tenantId,
            studentId: { in: enrolledStudentIds },
          },
          select: {
            studentId: true,
            status: true,
            student: { select: { displayName: true, email: true } },
          },
          orderBy: { student: { displayName: "asc" } },
        });
  const students = await buildStudentResults(id, recipients, actor.tenantId);
  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      classId: assignment.classId,
      className: assignment.class.name,
      templateTitle: assignment.template.title,
      dueDate: assignment.dueDate,
    },
    summary: summaryFor(students),
    students,
  };
}
