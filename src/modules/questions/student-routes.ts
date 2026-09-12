import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { createAttempt, formatAttemptServerTiming } from "./service.js";
import { createAttemptSchema } from "./schemas.js";

export async function questionStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
) {
  app.post(
    "/student/questions/:questionVersionId/attempts",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request, reply) => {
      const questionVersionId = (request.params as { questionVersionId?: string })
        .questionVersionId;
      if (!questionVersionId?.trim()) throw validationError("Soru sürümü kimliği gerekli");
      const timings = {};
      const result = await createAttempt(
        questionVersionId,
        createAttemptSchema.parse(request.body),
        {
          userId: request.authUser!.id,
          tenantId: request.tenantContext?.tenantId ?? null,
          platformRole: request.authUser!.platformRole ?? null,
        },
        { timings },
      );
      const serverTiming = formatAttemptServerTiming(timings);
      if (serverTiming) reply.header("Server-Timing", serverTiming);
      return reply.send(ok(result));
    },
  );
}
