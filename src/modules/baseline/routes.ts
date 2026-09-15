import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { getStudentBaseline } from "./service.js";

export async function baselineStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  app.get("/student/baseline", { preHandler: [requireAuth(opts.authProvider)] }, async (request) =>
    ok(
      await getStudentBaseline({
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      }),
    ),
  );
}
