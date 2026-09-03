import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { completeExerciseSession, getExerciseSession, listQuestionsForSession } from "./service.js";

function id(request: FastifyRequest) {
  const value = (request.params as { id?: string }).id;
  if (!value?.trim()) throw validationError("Oturum kimliği gerekli");
  return value;
}

function actor(request: FastifyRequest) {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser!.platformRole ?? null,
  };
}

export async function sessionStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
) {
  const preHandler = [requireAuth(opts.authProvider)];
  app.get("/student/sessions/:id/questions", { preHandler }, async (request) =>
    ok(await listQuestionsForSession(id(request), actor(request))),
  );
  app.post("/student/sessions/:id/complete", { preHandler }, async (request) =>
    ok(await completeExerciseSession(id(request), actor(request))),
  );
  app.get("/student/sessions/:id/detail", { preHandler }, async (request) =>
    ok(await getExerciseSession(id(request), actor(request))),
  );
}
