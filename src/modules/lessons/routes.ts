import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { completeStudentLearningStepLesson, getStudentLearningStepLesson } from "./service.js";

function actor(request: FastifyRequest) {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser!.platformRole ?? null,
  };
}

function stepId(request: FastifyRequest): string {
  const value = (request.params as { stepId?: string }).stepId;
  if (typeof value !== "string" || !value.trim()) {
    throw validationError("Öğrenme adımı kimliği gerekli");
  }
  return value.trim();
}

export async function lessonStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const preHandler = [requireAuth(opts.authProvider)];
  app.get("/student/learning-path/steps/:stepId/lesson", { preHandler }, async (request) => {
    const query = request.query as { fromStepId?: string };
    return ok(
      await getStudentLearningStepLesson(stepId(request), actor(request), query.fromStepId),
    );
  });
  app.post(
    "/student/learning-path/steps/:stepId/lesson/complete",
    { preHandler },
    async (request) => ok(await completeStudentLearningStepLesson(stepId(request), actor(request))),
  );
}
