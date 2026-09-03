import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createTemplate,
  createTemplateVersion,
  deleteTemplate,
  getTemplate,
  getTemplateVersion,
  listTemplates,
  listTemplateVersions,
  publishTemplateVersion,
  reviewTemplateVersion,
  updateTemplate,
  updateTemplateVersion,
  updateTemplateVersionContents,
  updateTemplateVersionQuestions,
} from "./service.js";
import {
  createTemplateSchema,
  createTemplateVersionSchema,
  listTemplatesQuerySchema,
  updateTemplateSchema,
  updateTemplateVersionContentsSchema,
  updateTemplateVersionQuestionsSchema,
  updateTemplateVersionSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

export async function templateAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformContent = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_EDITOR"]),
  ];

  // Templates CRUD
  app.get("/admin/templates", { preHandler: platformContent }, async (request) => {
    const query = listTemplatesQuerySchema.parse(request.query);
    return ok(await listTemplates(query));
  });

  app.post("/admin/templates", { preHandler: platformContent }, async (request) => {
    const input = createTemplateSchema.parse(request.body);
    return ok(await createTemplate(input, request.authUser?.id));
  });

  app.get("/admin/templates/:id", { preHandler: platformContent }, async (request) => {
    return ok(await getTemplate(readParamId(request, "Şablon")));
  });

  app.patch("/admin/templates/:id", { preHandler: platformContent }, async (request) => {
    const input = updateTemplateSchema.parse(request.body);
    return ok(await updateTemplate(readParamId(request, "Şablon"), input));
  });

  app.delete("/admin/templates/:id", { preHandler: platformContent }, async (request) => {
    return ok(await deleteTemplate(readParamId(request, "Şablon")));
  });

  // Template Versions
  app.get("/admin/templates/:id/versions", { preHandler: platformContent }, async (request) => {
    return ok(await listTemplateVersions(readParamId(request, "Şablon")));
  });

  app.post("/admin/templates/:id/versions", { preHandler: platformContent }, async (request) => {
    const input = createTemplateVersionSchema.parse(request.body ?? {});
    return ok(
      await createTemplateVersion(readParamId(request, "Şablon"), input, request.authUser?.id),
    );
  });

  // Version detail / update / lifecycle - primary
  app.get(
    "/admin/templates/versions/:versionId",
    { preHandler: platformContent },
    async (request) =>
      ok(await getTemplateVersion(readParamId(request, "Şablon sürümü", "versionId"))),
  );

  app.patch(
    "/admin/templates/versions/:versionId",
    { preHandler: platformContent },
    async (request) => {
      const input = updateTemplateVersionSchema.parse(request.body ?? {});
      return ok(
        await updateTemplateVersion(readParamId(request, "Şablon sürümü", "versionId"), input),
      );
    },
  );

  app.post(
    "/admin/templates/versions/:versionId/review",
    { preHandler: platformContent },
    async (request) =>
      ok(await reviewTemplateVersion(readParamId(request, "Şablon sürümü", "versionId"))),
  );

  app.post(
    "/admin/templates/versions/:versionId/publish",
    { preHandler: platformContent },
    async (request) =>
      ok(await publishTemplateVersion(readParamId(request, "Şablon sürümü", "versionId"))),
  );

  // Backward compat
  app.get("/admin/template-versions/:id", { preHandler: platformContent }, async (request) =>
    ok(await getTemplateVersion(readParamId(request, "Şablon sürümü"))),
  );
  app.patch("/admin/template-versions/:id", { preHandler: platformContent }, async (request) => {
    const input = updateTemplateVersionSchema.parse(request.body ?? {});
    return ok(await updateTemplateVersion(readParamId(request, "Şablon sürümü"), input));
  });
  app.post(
    "/admin/template-versions/:id/review",
    { preHandler: platformContent },
    async (request) => ok(await reviewTemplateVersion(readParamId(request, "Şablon sürümü"))),
  );
  app.post(
    "/admin/template-versions/:id/publish",
    { preHandler: platformContent },
    async (request) => ok(await publishTemplateVersion(readParamId(request, "Şablon sürümü"))),
  );

  // Content / Question binding
  app.put(
    "/admin/template-versions/:id/contents",
    { preHandler: platformContent },
    async (request) => {
      const input = updateTemplateVersionContentsSchema.parse(request.body);
      return ok(await updateTemplateVersionContents(readParamId(request, "Şablon sürümü"), input));
    },
  );

  app.put(
    "/admin/templates/versions/:versionId/contents",
    { preHandler: platformContent },
    async (request) => {
      const input = updateTemplateVersionContentsSchema.parse(request.body);
      return ok(
        await updateTemplateVersionContents(
          readParamId(request, "Şablon sürümü", "versionId"),
          input,
        ),
      );
    },
  );

  app.put(
    "/admin/template-versions/:id/questions",
    { preHandler: platformContent },
    async (request) => {
      const input = updateTemplateVersionQuestionsSchema.parse(request.body);
      return ok(await updateTemplateVersionQuestions(readParamId(request, "Şablon sürümü"), input));
    },
  );

  app.put(
    "/admin/templates/versions/:versionId/questions",
    { preHandler: platformContent },
    async (request) => {
      const input = updateTemplateVersionQuestionsSchema.parse(request.body);
      return ok(
        await updateTemplateVersionQuestions(
          readParamId(request, "Şablon sürümü", "versionId"),
          input,
        ),
      );
    },
  );
}
