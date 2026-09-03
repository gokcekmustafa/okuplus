import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { getStudentGamification } from "./service.js";

export async function gamificationStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  app.get(
    "/student/gamification",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) =>
      ok(
        await getStudentGamification({
          userId: request.authUser!.id,
          tenantId: request.tenantContext?.tenantId ?? null,
          platformRole: request.authUser!.platformRole ?? null,
        }),
      ),
  );
}
