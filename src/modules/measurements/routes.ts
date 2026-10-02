import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { assertStudentActor } from "../student-learning/policy.js";
import { getStudentMeasurementDashboard } from "./service.js";

export async function measurementStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  app.get(
    "/student/measurements",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      assertStudentActor(actor);
      return ok(await getStudentMeasurementDashboard(actor));
    },
  );
}
