import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { completeStudentLesson, getStudentLesson, listStudentLessons } from "./service.js";

function actor(request: FastifyRequest) {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser!.platformRole ?? null,
  };
}

function id(request: FastifyRequest): string {
  const value = (request.params as { id?: string }).id;
  if (typeof value !== "string" || !value.trim()) throw validationError("Ders kimliği gerekli");
  return value.trim();
}

export async function lessonStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const preHandler = [requireAuth(opts.authProvider)];
  app.get("/student/lessons", { preHandler }, async (request) =>
    ok(await listStudentLessons(actor(request))),
  );
  app.get("/student/lessons/:id", { preHandler }, async (request) =>
    ok(await getStudentLesson(id(request), actor(request))),
  );
  app.post("/student/lessons/:id/complete", { preHandler }, async (request) =>
    ok(await completeStudentLesson(id(request), actor(request))),
  );
}
