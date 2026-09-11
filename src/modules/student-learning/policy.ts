import type { PlatformRole } from "@prisma/client";
import { forbiddenError } from "../../lib/errors.js";

export type StudentActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

export function assertStudentActor(
  actor: StudentActor,
): asserts actor is StudentActor & { tenantId: string; platformRole: null } {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw forbiddenError("Bu uç yalnızca öğrencilere açıktır");
  }
}

export type StudentLearningSessionShape = {
  assignmentId: string | null;
  assessmentId: string | null;
  context: string;
  sessionType: string;
};

/** The only session scope that contributes to student daily learning progress. */
export const STUDENT_LEARNING_SESSION_FILTER = {
  assignmentId: null,
  assessmentId: null,
  context: "INDIVIDUAL" as const,
  sessionType: "PRACTICE" as const,
};

export function isStudentLearningSession(session: StudentLearningSessionShape): boolean {
  return (
    session.assignmentId === null &&
    session.assessmentId === null &&
    session.context === STUDENT_LEARNING_SESSION_FILTER.context &&
    session.sessionType === STUDENT_LEARNING_SESSION_FILTER.sessionType
  );
}
