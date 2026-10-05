import type { FastifyInstance, FastifyRequest } from "fastify";
import { validationError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import {
  getStudentGamificationFoundation,
  getTeacherGamificationSummary,
  type GamificationStudentActor,
  type GamificationTeacherActor,
} from "./foundation.js";

function studentActorFrom(request: FastifyRequest): GamificationStudentActor {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser?.platformRole ?? null,
  };
}

function teacherActorFrom(request: FastifyRequest): GamificationTeacherActor {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser?.platformRole ?? null,
  };
}

function studentIdFrom(request: FastifyRequest): string {
  const studentId = (request.params as { studentId?: string }).studentId;
  if (!studentId?.trim()) throw validationError("Öğrenci kimliği gerekli");
  return studentId;
}

export async function gamificationFoundationRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const auth = [requireAuth(opts.authProvider)];

  app.get("/student/gamification/foundation", { preHandler: auth }, async (request) =>
    ok(await getStudentGamificationFoundation(studentActorFrom(request))),
  );

  app.get("/teacher/gamification/students/:studentId", { preHandler: auth }, async (request) =>
    ok(await getTeacherGamificationSummary(teacherActorFrom(request), studentIdFrom(request))),
  );
}
