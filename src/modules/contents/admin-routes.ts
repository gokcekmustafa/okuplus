import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createContent,
  createContentVersion,
  createLevel,
  createSkill,
  deleteLevel,
  deleteSkill,
  getContent,
  getContentVersion,
  listContentVersions,
  listContents,
  listLevels,
  listSkills,
  publishContentVersion,
  reviewContentVersion,
  softDeleteContent,
  updateContent,
  updateContentSkills,
  updateContentStatus,
  updateContentVersion,
  updateLevel,
  updateSkill,
} from "./service.js";
import {
  createContentSchema,
  createContentVersionSchema,
  createLevelSchema,
  createSkillSchema,
  listContentsQuerySchema,
  listLevelsQuerySchema,
  listSkillsQuerySchema,
  updateContentSchema,
  updateContentSkillsSchema,
  updateContentStatusSchema,
  updateContentVersionSchema,
  updateLevelSchema,
  updateSkillSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest, label: string): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError(`${label} kimliği gerekli`);
  }
  return id;
}

/**
 * Admin / İçerik Yönetimi uçları (SUPER_ADMIN + CONTENT_EDITOR).
 *
 * İÇERİK:
 *  GET    /admin/contents                  — içerik listesi (search/scope/tenantId/type/status/skillId/page)
 *  POST   /admin/contents                  — içerik oluştur (tenantId NULL = global)
 *  GET    /admin/contents/:id              — içerik detayı (+ currentVersion + beceriler + sayaçlar)
 *  PATCH  /admin/contents/:id              — içerik düzenle (title/difficulty; type/tenantId değişmez)
 *  PATCH  /admin/contents/:id/status       — durum (DRAFT/PUBLISHED/ARCHIVED; PUBLISHED yayınlı sürüm şartı)
 *  DELETE /admin/contents/:id              — içerik soft-delete (sürüm geçmişi korunur)
 *  PUT    /admin/contents/:id/skills       — beceri bağlantılarını değiştir
 *  GET    /admin/contents/:id/versions     — sürüm geçmişi
 *  POST   /admin/contents/:id/versions     — yeni sürüm oluştur (DRAFT)
 *
 * SÜRÜM (content-versions):
 *  GET    /admin/content-versions/:id          — sürüm detayı
 *  PATCH  /admin/content-versions/:id          — taslak düzenle (PUBLISHED immutable)
 *  POST   /admin/content-versions/:id/review   — DRAFT → REVIEW
 *  POST   /admin/content-versions/:id/publish  — DRAFT/REVIEW → PUBLISHED (currentVersionId güncellenir)
 *
 * KATALOG (Salt global; yazma platform):
 *  GET/POST   /admin/skills,  PATCH/DELETE /admin/skills/:id
 *  GET/POST   /admin/levels,  PATCH/DELETE /admin/levels/:id
 */
export async function contentAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformContent = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_EDITOR"]),
  ];

  // ---- İçerik ----

  app.get("/admin/contents", { preHandler: platformContent }, async (request) => {
    const query = listContentsQuerySchema.parse(request.query);
    return ok(await listContents(query));
  });

  app.post("/admin/contents", { preHandler: platformContent }, async (request) => {
    const input = createContentSchema.parse(request.body);
    return ok(await createContent(input, request.authUser?.id));
  });

  app.get("/admin/contents/:id", { preHandler: platformContent }, async (request) => {
    return ok(await getContent(readParamId(request, "İçerik")));
  });

  app.patch("/admin/contents/:id", { preHandler: platformContent }, async (request) => {
    const input = updateContentSchema.parse(request.body);
    return ok(await updateContent(readParamId(request, "İçerik"), input));
  });

  app.patch("/admin/contents/:id/status", { preHandler: platformContent }, async (request) => {
    const input = updateContentStatusSchema.parse(request.body);
    return ok(await updateContentStatus(readParamId(request, "İçerik"), input));
  });

  app.delete("/admin/contents/:id", { preHandler: platformContent }, async (request) => {
    return ok(await softDeleteContent(readParamId(request, "İçerik")));
  });

  app.put("/admin/contents/:id/skills", { preHandler: platformContent }, async (request) => {
    const input = updateContentSkillsSchema.parse(request.body);
    return ok(await updateContentSkills(readParamId(request, "İçerik"), input));
  });

  // ---- Sürümler ----

  app.get("/admin/contents/:id/versions", { preHandler: platformContent }, async (request) => {
    return ok(await listContentVersions(readParamId(request, "İçerik")));
  });

  app.post("/admin/contents/:id/versions", { preHandler: platformContent }, async (request) => {
    const input = createContentVersionSchema.parse(request.body);
    return ok(
      await createContentVersion(readParamId(request, "İçerik"), input, request.authUser?.id),
    );
  });

  app.get("/admin/content-versions/:id", { preHandler: platformContent }, async (request) => {
    return ok(await getContentVersion(readParamId(request, "Sürüm")));
  });

  app.patch("/admin/content-versions/:id", { preHandler: platformContent }, async (request) => {
    const input = updateContentVersionSchema.parse(request.body);
    return ok(await updateContentVersion(readParamId(request, "Sürüm"), input));
  });

  app.post(
    "/admin/content-versions/:id/review",
    { preHandler: platformContent },
    async (request) => {
      return ok(await reviewContentVersion(readParamId(request, "Sürüm")));
    },
  );

  app.post(
    "/admin/content-versions/:id/publish",
    { preHandler: platformContent },
    async (request) => {
      return ok(await publishContentVersion(readParamId(request, "Sürüm")));
    },
  );

  // ---- Beceri kataloğu ----

  app.get("/admin/skills", { preHandler: platformContent }, async (request) => {
    const query = listSkillsQuerySchema.parse(request.query);
    return ok(await listSkills(query));
  });

  app.post("/admin/skills", { preHandler: platformContent }, async (request) => {
    const input = createSkillSchema.parse(request.body);
    return ok(await createSkill(input));
  });

  app.patch("/admin/skills/:id", { preHandler: platformContent }, async (request) => {
    const input = updateSkillSchema.parse(request.body);
    return ok(await updateSkill(readParamId(request, "Beceri"), input));
  });

  app.delete("/admin/skills/:id", { preHandler: platformContent }, async (request) => {
    return ok(await deleteSkill(readParamId(request, "Beceri")));
  });

  // ---- Seviye kataloğu ----

  app.get("/admin/levels", { preHandler: platformContent }, async (request) => {
    const query = listLevelsQuerySchema.parse(request.query);
    return ok(await listLevels(query));
  });

  app.post("/admin/levels", { preHandler: platformContent }, async (request) => {
    const input = createLevelSchema.parse(request.body);
    return ok(await createLevel(input));
  });

  app.patch("/admin/levels/:id", { preHandler: platformContent }, async (request) => {
    const input = updateLevelSchema.parse(request.body);
    return ok(await updateLevel(readParamId(request, "Seviye"), input));
  });

  app.delete("/admin/levels/:id", { preHandler: platformContent }, async (request) => {
    return ok(await deleteLevel(readParamId(request, "Seviye")));
  });
}
