import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  buildSessionResult,
  SESSION_RESULT_SELECT,
  type AssignmentSessionResult,
} from "./results-service.js";
import { assertTeacherClassAccess, type TeacherAssignmentActor } from "./teacher-service.js";

const CLASS_SESSION_SELECT = {
  ...SESSION_RESULT_SELECT,
  assignmentId: true,
  studentId: true,
} satisfies Prisma.ExerciseSessionSelect;

type ClassSessionRow = Prisma.ExerciseSessionGetPayload<{
  select: typeof CLASS_SESSION_SELECT;
}>;

export interface TeacherClassAssignmentAnalytics {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  totalStudents: number;
  assigned: number;
  started: number;
  completed: number;
  completionRate: number;
  averagePercentage: number | null;
  averageDurationMs: number | null;
}

export interface TeacherClassSkillAnalytics {
  skillId: string;
  code: string;
  name: string;
  averagePercentage: number;
  studentCount: number;
}

export interface TeacherClassRecommendationAnalytics {
  skill: { id: string; code: string; name: string };
  template: { id: string; title: string; type: string };
  affectedStudentCount: number;
  recommendationIds: string[];
}

export interface TeacherClassStudentAnalytics {
  studentId: string;
  name: string;
  email: string | null;
  assigned: number;
  started: number;
  completed: number;
  completionRate: number;
  averagePercentage: number | null;
  lastActivityAt: Date | null;
}

export interface TeacherClassAnalyticsResponse {
  class: { id: string; name: string; gradeLevel: number; studentCount: number };
  summary: {
    totalStudents: number;
    totalAssignments: number;
    assigned: number;
    started: number;
    completed: number;
    completionRate: number;
    averagePercentage: number | null;
    averageDurationMs: number | null;
  };
  assignments: TeacherClassAssignmentAnalytics[];
  students: TeacherClassStudentAnalytics[];
  skills: TeacherClassSkillAnalytics[];
  recommendations: TeacherClassRecommendationAnalytics[];
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? roundPercentage(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function latestSessionByStudent(rows: ClassSessionRow[]) {
  const latest = new Map<string, { session: ClassSessionRow; result: AssignmentSessionResult }>();
  for (const session of rows) {
    if (!session.assignmentId) continue;
    latest.set(`${session.assignmentId}:${session.studentId}`, {
      session,
      result: buildSessionResult(session),
    });
  }
  return latest;
}

function statusFor(recipientStatus: string, result: AssignmentSessionResult | undefined): string {
  if (result?.status === "COMPLETED") return "COMPLETED";
  if (result?.status === "IN_PROGRESS") return "IN_PROGRESS";
  return recipientStatus;
}

export async function getTeacherClassAnalytics(
  actor: TeacherAssignmentActor,
  classId: string,
): Promise<TeacherClassAnalyticsResponse> {
  const authorizedClass = await assertTeacherClassAccess(actor, classId);
  const [enrollments, assignments] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        tenantId: authorizedClass.tenantId,
        classId,
        status: "ACTIVE",
        deletedAt: null,
        student: { status: "ACTIVE", deletedAt: null },
      },
      select: { studentId: true, student: { select: { displayName: true, email: true } } },
      distinct: ["studentId"],
    }),
    prisma.assignment.findMany({
      where: {
        tenantId: authorizedClass.tenantId,
        classId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        studentAssignments: {
          where: { tenantId: authorizedClass.tenantId },
          select: { studentId: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const activeStudentIds = enrollments.map((enrollment) => enrollment.studentId);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const [sessions, recommendationRows] = await Promise.all([
    assignmentIds.length === 0
      ? Promise.resolve([] as ClassSessionRow[])
      : prisma.exerciseSession.findMany({
          where: {
            tenantId: authorizedClass.tenantId,
            assignmentId: { in: assignmentIds },
            context: "ASSIGNMENT",
            sessionType: "PRACTICE",
          },
          select: CLASS_SESSION_SELECT,
          orderBy: { createdAt: "asc" },
        }),
    activeStudentIds.length === 0
      ? Promise.resolve([])
      : prisma.assignmentRecommendation.findMany({
          where: {
            tenantId: authorizedClass.tenantId,
            studentId: { in: activeStudentIds },
            status: "PENDING",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: {
            id: true,
            studentId: true,
            skillId: true,
            templateId: true,
            skill: { select: { code: true, name: true } },
            template: { select: { title: true, type: true } },
          },
          orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
        }),
  ]);

  const latestSessions = latestSessionByStudent(sessions);
  const skillScores = new Map<
    string,
    { skillId: string; code: string; name: string; scores: number[]; students: Set<string> }
  >();
  const classPercentages: number[] = [];
  const classDurations: number[] = [];
  const assignmentAnalytics = assignments.map((assignment) => {
    const recipients =
      assignment.studentAssignments.length > 0
        ? assignment.studentAssignments
        : activeStudentIds.map((studentId) => ({ studentId, status: "ASSIGNED" }));
    const completedPercentages: number[] = [];
    const completedDurations: number[] = [];
    let assigned = 0;
    let started = 0;
    let completed = 0;

    for (const recipient of recipients) {
      const item = latestSessions.get(`${assignment.id}:${recipient.studentId}`);
      const result = item?.result;
      const status = statusFor(recipient.status, result);
      if (status === "ASSIGNED") assigned += 1;
      if (status === "IN_PROGRESS" || status === "COMPLETED") started += 1;
      if (status === "COMPLETED") {
        completed += 1;
        if (result?.percentage !== null && result?.percentage !== undefined) {
          completedPercentages.push(result.percentage);
          classPercentages.push(result.percentage);
        }
        if (result?.timeSpentMs !== null && result?.timeSpentMs !== undefined) {
          completedDurations.push(result.timeSpentMs);
          classDurations.push(result.timeSpentMs);
        }
        for (const skill of result?.skills ?? []) {
          if (skill.percentage === null) continue;
          const current = skillScores.get(skill.skillId) ?? {
            skillId: skill.skillId,
            code: skill.code,
            name: skill.name,
            scores: [],
            students: new Set<string>(),
          };
          current.scores.push(skill.percentage);
          current.students.add(recipient.studentId);
          skillScores.set(skill.skillId, current);
        }
      }
    }

    return {
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      dueDate: assignment.dueDate,
      totalStudents: recipients.length,
      assigned,
      started,
      completed,
      completionRate:
        recipients.length > 0 ? roundPercentage((completed / recipients.length) * 100) : 0,
      averagePercentage: average(completedPercentages),
      averageDurationMs:
        completedDurations.length > 0
          ? Math.round(
              completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length,
            )
          : null,
    } satisfies TeacherClassAssignmentAnalytics;
  });

  const totalSlots = assignmentAnalytics.reduce((sum, item) => sum + item.totalStudents, 0);
  const assigned = assignmentAnalytics.reduce((sum, item) => sum + item.assigned, 0);
  const started = assignmentAnalytics.reduce((sum, item) => sum + item.started, 0);
  const completed = assignmentAnalytics.reduce((sum, item) => sum + item.completed, 0);

  const students = enrollments
    .map((enrollment) => {
      const percentages: number[] = [];
      let assigned = 0;
      let started = 0;
      let completed = 0;
      let eligibleAssignments = 0;
      let lastActivityAt: Date | null = null;
      for (const assignment of assignments) {
        const recipient =
          assignment.studentAssignments.length > 0
            ? assignment.studentAssignments.find((item) => item.studentId === enrollment.studentId)
            : { status: "ASSIGNED" };
        if (!recipient) continue;
        eligibleAssignments += 1;
        const session = latestSessions.get(`${assignment.id}:${enrollment.studentId}`);
        const status = statusFor(recipient.status, session?.result);
        if (status === "ASSIGNED") assigned += 1;
        if (status === "IN_PROGRESS" || status === "COMPLETED") started += 1;
        if (status === "COMPLETED") {
          completed += 1;
          if (session?.result.percentage !== null && session?.result.percentage !== undefined) {
            percentages.push(session.result.percentage);
          }
        }
        const activityAt = session?.result.completedAt ?? session?.result.startedAt ?? null;
        if (activityAt && (!lastActivityAt || activityAt > lastActivityAt)) {
          lastActivityAt = activityAt;
        }
      }
      return {
        studentId: enrollment.studentId,
        name: enrollment.student.displayName,
        email: enrollment.student.email,
        assigned,
        started,
        completed,
        completionRate:
          eligibleAssignments > 0 ? roundPercentage((completed / eligibleAssignments) * 100) : 0,
        averagePercentage: average(percentages),
        lastActivityAt,
      } satisfies TeacherClassStudentAnalytics;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const recommendationGroups = new Map<
    string,
    {
      skill: { id: string; code: string; name: string };
      template: { id: string; title: string; type: string };
      studentIds: Set<string>;
      recommendationIds: string[];
    }
  >();
  for (const recommendation of recommendationRows) {
    const key = `${recommendation.skillId}:${recommendation.templateId}`;
    const current = recommendationGroups.get(key) ?? {
      skill: {
        id: recommendation.skillId,
        code: recommendation.skill.code,
        name: recommendation.skill.name,
      },
      template: {
        id: recommendation.templateId,
        title: recommendation.template.title,
        type: recommendation.template.type,
      },
      studentIds: new Set<string>(),
      recommendationIds: [],
    };
    current.studentIds.add(recommendation.studentId);
    current.recommendationIds.push(recommendation.id);
    recommendationGroups.set(key, current);
  }

  return {
    class: {
      id: authorizedClass.id,
      name: authorizedClass.name,
      gradeLevel: authorizedClass.gradeLevel,
      studentCount: activeStudentIds.length,
    },
    summary: {
      totalStudents: activeStudentIds.length,
      totalAssignments: assignments.length,
      assigned,
      started,
      completed,
      completionRate: totalSlots > 0 ? roundPercentage((completed / totalSlots) * 100) : 0,
      averagePercentage: average(classPercentages),
      averageDurationMs:
        classDurations.length > 0
          ? Math.round(
              classDurations.reduce((sum, value) => sum + value, 0) / classDurations.length,
            )
          : null,
    },
    assignments: assignmentAnalytics,
    students,
    skills: [...skillScores.values()]
      .map((skill) => ({
        skillId: skill.skillId,
        code: skill.code,
        name: skill.name,
        averagePercentage: average(skill.scores) ?? 0,
        studentCount: skill.students.size,
      }))
      .sort((a, b) => a.averagePercentage - b.averagePercentage || a.code.localeCompare(b.code)),
    recommendations: [...recommendationGroups.values()]
      .map((recommendation) => ({
        skill: recommendation.skill,
        template: recommendation.template,
        affectedStudentCount: recommendation.studentIds.size,
        recommendationIds: recommendation.recommendationIds,
      }))
      .sort(
        (a, b) =>
          a.skill.name.localeCompare(b.skill.name) ||
          a.template.title.localeCompare(b.template.title),
      ),
  };
}
