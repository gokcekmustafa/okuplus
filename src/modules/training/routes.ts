import type { FastifyInstance } from "fastify";
import { validationError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { startPersonalExercise } from "../student-learning/service.js";
import { resolveMainIdeaTemplateVersion } from "./runtime.js";

export async function trainingStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  app.post(
    "/student/training/main-idea/start",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const body =
        request.body && typeof request.body === "object"
          ? (request.body as { templateVersionId?: string; clientSessionId?: string })
          : {};
      if (
        body.templateVersionId !== undefined &&
        (typeof body.templateVersionId !== "string" || body.templateVersionId.trim().length === 0)
      ) {
        throw validationError("templateVersionId geçerli bir metin olmalı");
      }
      if (
        body.clientSessionId !== undefined &&
        (typeof body.clientSessionId !== "string" || body.clientSessionId.trim().length === 0)
      ) {
        throw validationError("clientSessionId geçerli bir metin olmalı");
      }
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      const graph = await resolveMainIdeaTemplateVersion(actor, body.templateVersionId);
      return ok(
        await startPersonalExercise(actor, {
          templateVersionId: graph.versionId,
          clientSessionId: body.clientSessionId,
        }),
      );
    },
  );
}
