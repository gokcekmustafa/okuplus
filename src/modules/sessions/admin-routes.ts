import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { createExerciseSessionSchema } from "./schemas.js";
import {
  completeExerciseSession,
  createExerciseSession,
  getExerciseOptions,
  getExerciseSession,
  listQuestionsForSession,
} from "./service.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

export async function sessionAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;

  app.get("/admin/exercise-options", { preHandler: [requireAuth(authProvider)] }, async (request) =>
    ok(
      await getExerciseOptions({
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      }),
    ),
  );

  // POST /admin/exercise-sessions
  app.post(
    "/admin/exercise-sessions",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const input = createExerciseSessionSchema.parse(request.body);
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(await createExerciseSession(input, actor));
    },
  );

  // GET /admin/exercise-sessions/:id
  app.get(
    "/admin/exercise-sessions/:id",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(await getExerciseSession(readParamId(request, "Oturum"), actor));
    },
  );

  // GET /admin/exercise-sessions/:id/questions
  app.get(
    "/admin/exercise-sessions/:id/questions",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(await listQuestionsForSession(readParamId(request, "Oturum"), actor));
    },
  );

  // POST /admin/exercise-sessions/:id/complete
  app.post(
    "/admin/exercise-sessions/:id/complete",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(await completeExerciseSession(readParamId(request, "Oturum"), actor));
    },
  );
}
