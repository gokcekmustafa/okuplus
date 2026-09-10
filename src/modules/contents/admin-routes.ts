import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  approveContentVersion,
  createContent,
  createContentVersion,
  createLevel,
  createSkill,
  deleteLevel,
  deleteSkill,
  getContent,
  getContentVersion,
  listContentVersions,
  listContentAudit,
  listContentAuthors,
  listContents,
  listLevels,
  listSkills,
  publishContentVersion,
  retireContentVersion,
  reviewContentVersion,
  softDeleteContent,
  updateContent,
  updateContentSkills,
  updateContentStatus,
  updateContentVersion,
  updateLevel,
  updateSkill,
} from "./service.js";
import type { ContentMutationActor } from "./lifecycle.js";
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

function actorFromRequest(request: FastifyRequest): ContentMutationActor {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser!.platformRole ?? null,
  };
}

/**
 * Admin / İçerik Yönetimi uçları (SUPER_ADMIN + CONTENT_EDITOR).
 *
 * İÇERİK:
 *  GET    /admin/contents                  — içerik listesi (arama/filtre/sıralama/sayfalama)
 *  GET    /admin/contents/authors          — içerik oluşturanların güvenli listesi
 *  POST   /admin/contents                  — içerik oluştur (tenantId NULL = global; DRAFT)
 *  GET    /admin/contents/:id              — içerik detayı (+ currentVersion + beceriler + sayaçlar)
 *  GET    /admin/contents/:id/audit        — yalnız lifecycle denetim geçmişi
 *  PATCH  /admin/contents/:id              — içerik düzenle (taslak metadata dahil)
 *  PATCH  /admin/contents/:id/status       — lifecycle durumu
 *  DELETE /admin/contents/:id              — içerik soft-delete (sürüm geçmişi korunur)
 *  PUT    /admin/contents/:id/skills       — beceri bağlantılarını değiştir
 *  GET    /admin/contents/:id/versions     — sürüm geçmişi
 *  POST   /admin/contents/:id/versions     — yeni sürüm oluştur (DRAFT)
 *
 * SÜRÜM (content-versions):
 *  GET    /admin/content-versions/:id          — sürüm detayı
 *  PATCH  /admin/content-versions/:id          — taslak düzenle (PUBLISHED immutable)
 *  POST   /admin/content-versions/:id/review   — DRAFT → REVIEW
 *  POST   /admin/content-versions/:id/approve — REVIEW → APPROVED (self-approval yasak)
 *  POST   /admin/content-versions/:id/publish  — APPROVED → PUBLISHED (currentVersionId güncellenir)
 *  POST   /admin/content-versions/:id/retire   — PUBLISHED → RETIRED
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
  const platformRead = [
    requireAuth(authProvider),
    requirePlatformRole([
      "SUPER_ADMIN",
      "CONTENT_EDITOR",
      "CONTENT_REVIEWER",
      "SUPPORT",
      "ANALYST",
    ]),
  ];
  const contentEditor = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_EDITOR"]),
  ];
  const lifecycleReviewer = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_REVIEWER"]),
  ];
  const lifecycleMutation = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_EDITOR", "CONTENT_REVIEWER"]),
  ];

  // ---- İçerik ----

  app.get("/admin/contents", { preHandler: platformRead }, async (request) => {
    const query = listContentsQuerySchema.parse(request.query);
    return ok(await listContents(query));
  });

  app.post("/admin/contents", { preHandler: contentEditor }, async (request) => {
    const input = createContentSchema.parse(request.body);
    return ok(await createContent(input, actorFromRequest(request)));
  });

  app.get("/admin/contents/authors", { preHandler: platformRead }, async () => {
    return ok(await listContentAuthors());
  });

  app.get("/admin/contents/:id", { preHandler: platformRead }, async (request) => {
    return ok(await getContent(readParamId(request, "İçerik")));
  });

  app.patch("/admin/contents/:id", { preHandler: contentEditor }, async (request) => {
    const input = updateContentSchema.parse(request.body);
    return ok(
      await updateContent(readParamId(request, "İçerik"), input, actorFromRequest(request)),
    );
  });

  app.patch("/admin/contents/:id/status", { preHandler: lifecycleMutation }, async (request) => {
    const input = updateContentStatusSchema.parse(request.body);
    return ok(
      await updateContentStatus(readParamId(request, "İçerik"), input, actorFromRequest(request)),
    );
  });

  app.delete("/admin/contents/:id", { preHandler: contentEditor }, async (request) => {
    return ok(await softDeleteContent(readParamId(request, "İçerik"), actorFromRequest(request)));
  });

  app.put("/admin/contents/:id/skills", { preHandler: contentEditor }, async (request) => {
    const input = updateContentSkillsSchema.parse(request.body);
    return ok(
      await updateContentSkills(readParamId(request, "İçerik"), input, actorFromRequest(request)),
    );
  });

  // ---- Sürümler ----

  app.get("/admin/contents/:id/versions", { preHandler: platformRead }, async (request) => {
    return ok(await listContentVersions(readParamId(request, "İçerik")));
  });

  app.get("/admin/contents/:id/audit", { preHandler: platformRead }, async (request) => {
    return ok(await listContentAudit(readParamId(request, "İçerik")));
  });

  app.post("/admin/contents/:id/versions", { preHandler: contentEditor }, async (request) => {
    const input = createContentVersionSchema.parse(request.body);
    return ok(
      await createContentVersion(readParamId(request, "İçerik"), input, actorFromRequest(request)),
    );
  });

  app.get("/admin/content-versions/:id", { preHandler: platformRead }, async (request) => {
    return ok(await getContentVersion(readParamId(request, "Sürüm")));
  });

  app.patch("/admin/content-versions/:id", { preHandler: contentEditor }, async (request) => {
    const input = updateContentVersionSchema.parse(request.body);
    return ok(
      await updateContentVersion(readParamId(request, "Sürüm"), input, actorFromRequest(request)),
    );
  });

  app.post("/admin/content-versions/:id/review", { preHandler: contentEditor }, async (request) => {
    return ok(await reviewContentVersion(readParamId(request, "Sürüm"), actorFromRequest(request)));
  });

  app.post(
    "/admin/content-versions/:id/approve",
    { preHandler: lifecycleReviewer },
    async (request) => {
      return ok(
        await approveContentVersion(readParamId(request, "Sürüm"), actorFromRequest(request)),
      );
    },
  );

  app.post(
    "/admin/content-versions/:id/publish",
    { preHandler: lifecycleReviewer },
    async (request) => {
      return ok(
        await publishContentVersion(readParamId(request, "Sürüm"), actorFromRequest(request)),
      );
    },
  );

  app.post(
    "/admin/content-versions/:id/retire",
    { preHandler: lifecycleReviewer },
    async (request) => {
      return ok(
        await retireContentVersion(readParamId(request, "Sürüm"), actorFromRequest(request)),
      );
    },
  );

  // ---- Beceri kataloğu ----

  app.get("/admin/skills", { preHandler: platformRead }, async (request) => {
    const query = listSkillsQuerySchema.parse(request.query);
    return ok(await listSkills(query));
  });

  app.post("/admin/skills", { preHandler: contentEditor }, async (request) => {
    const input = createSkillSchema.parse(request.body);
    return ok(await createSkill(input));
  });

  app.patch("/admin/skills/:id", { preHandler: contentEditor }, async (request) => {
    const input = updateSkillSchema.parse(request.body);
    return ok(await updateSkill(readParamId(request, "Beceri"), input));
  });

  app.delete("/admin/skills/:id", { preHandler: contentEditor }, async (request) => {
    return ok(await deleteSkill(readParamId(request, "Beceri")));
  });

  // ---- Seviye kataloğu ----

  app.get("/admin/levels", { preHandler: platformRead }, async (request) => {
    const query = listLevelsQuerySchema.parse(request.query);
    return ok(await listLevels(query));
  });

  app.post("/admin/levels", { preHandler: contentEditor }, async (request) => {
    const input = createLevelSchema.parse(request.body);
    return ok(await createLevel(input));
  });

  app.patch("/admin/levels/:id", { preHandler: contentEditor }, async (request) => {
    const input = updateLevelSchema.parse(request.body);
    return ok(await updateLevel(readParamId(request, "Seviye"), input));
  });

  app.delete("/admin/levels/:id", { preHandler: contentEditor }, async (request) => {
    return ok(await deleteLevel(readParamId(request, "Seviye")));
  });
}
