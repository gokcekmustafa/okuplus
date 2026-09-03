import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { listStudentProgress, getStudentSkillProgress } from "./student-service.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

/**
 * Öğrenci ilerleme uçları (authenticated student).
 *
 *  GET    /student/progress              — öğrencinin tüm beceri ilerlemesi
 *  GET    /student/progress/:skillId     — belirli bir beceri ilerlemesi
 */
export async function progressStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const requireStudentAuth = [requireAuth(authProvider)];

  app.get("/student/progress", { preHandler: requireStudentAuth }, async (request) => {
    const actor = {
      userId: request.authUser!.id,
      tenantId: request.tenantContext?.tenantId ?? null,
      platformRole: request.authUser!.platformRole ?? null,
    };
    return ok(await listStudentProgress(actor));
  });

  app.get("/student/progress/:skillId", { preHandler: requireStudentAuth }, async (request) => {
    const actor = {
      userId: request.authUser!.id,
      tenantId: request.tenantContext?.tenantId ?? null,
      platformRole: request.authUser!.platformRole ?? null,
    };
    const result = await getStudentSkillProgress(readParamId(request, "Beceri", "skillId"), actor);
    if (!result) return ok(null);
    return ok(result);
  });
}
