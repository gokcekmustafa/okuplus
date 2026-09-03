import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  attachMediaSchema,
  createMediaSchema,
  listMediaQuerySchema,
  updateMediaBindingSchema,
} from "./schemas.js";
import {
  attachMediaToQuestionVersion,
  createMedia,
  deleteMedia,
  detachMediaFromQuestionVersion,
  getMedia,
  listMedia,
  listQuestionVersionMedia,
  updateMediaBinding,
} from "./service.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

export async function mediaAdminRoutes(
  app: FastifyInstance,
  { authProvider }: { authProvider: AuthProvider },
): Promise<void> {
  const platformContent = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_EDITOR"]),
  ];

  // Media catalog
  app.get("/admin/media", { preHandler: platformContent }, async (request) => {
    const query = listMediaQuerySchema.parse(request.query);
    return ok(await listMedia(query));
  });

  app.post("/admin/media", { preHandler: platformContent }, async (request) => {
    const input = createMediaSchema.parse(request.body);
    return ok(await createMedia(input, request.authUser?.id));
  });

  app.get("/admin/media/:id", { preHandler: platformContent }, async (request) => {
    return ok(await getMedia(readParamId(request, "Medya")));
  });

  app.delete("/admin/media/:id", { preHandler: platformContent }, async (request) => {
    return ok(await deleteMedia(readParamId(request, "Medya")));
  });

  // QuestionVersionMedia bindings
  app.get(
    "/admin/question-versions/:id/media",
    { preHandler: platformContent },
    async (request) => {
      return ok(await listQuestionVersionMedia(readParamId(request, "Soru sürümü")));
    },
  );

  app.post(
    "/admin/question-versions/:id/media",
    { preHandler: platformContent },
    async (request) => {
      const input = attachMediaSchema.parse(request.body);
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(
        await attachMediaToQuestionVersion(readParamId(request, "Soru sürümü"), input, actor),
      );
    },
  );

  app.delete(
    "/admin/question-versions/:id/media/:mediaId",
    { preHandler: platformContent },
    async (request) => {
      const qvId = readParamId(request, "Soru sürümü");
      const mediaId = readParamId(request, "Medya", "mediaId");
      return ok(await detachMediaFromQuestionVersion(qvId, mediaId));
    },
  );

  app.patch(
    "/admin/question-versions/:id/media/:mediaId",
    { preHandler: platformContent },
    async (request) => {
      const qvId = readParamId(request, "Soru sürümü");
      const mediaId = readParamId(request, "Medya", "mediaId");
      const input = updateMediaBindingSchema.parse(request.body);
      return ok(await updateMediaBinding(qvId, mediaId, input));
    },
  );

  // Alternative nested route for frontend convenience
  app.get(
    "/admin/questions/versions/:versionId/media",
    { preHandler: platformContent },
    async (request) => {
      return ok(await listQuestionVersionMedia(readParamId(request, "Soru sürümü", "versionId")));
    },
  );
  app.post(
    "/admin/questions/versions/:versionId/media",
    { preHandler: platformContent },
    async (request) => {
      const input = attachMediaSchema.parse(request.body);
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(
        await attachMediaToQuestionVersion(
          readParamId(request, "Soru sürümü", "versionId"),
          input,
          actor,
        ),
      );
    },
  );
  app.delete(
    "/admin/questions/versions/:versionId/media/:mediaId",
    { preHandler: platformContent },
    async (request) => {
      const versionId = readParamId(request, "Soru sürümü", "versionId");
      const mediaId = readParamId(request, "Medya", "mediaId");
      return ok(await detachMediaFromQuestionVersion(versionId, mediaId));
    },
  );
  app.patch(
    "/admin/questions/versions/:versionId/media/:mediaId",
    { preHandler: platformContent },
    async (request) => {
      const versionId = readParamId(request, "Soru sürümü", "versionId");
      const mediaId = readParamId(request, "Medya", "mediaId");
      const input = updateMediaBindingSchema.parse(request.body);
      return ok(await updateMediaBinding(versionId, mediaId, input));
    },
  );
}
