import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createAttempt,
  createQuestion,
  createQuestionVersion,
  deleteQuestion,
  getQuestion,
  getQuestionVersion,
  listQuestionByContent,
  listQuestions,
  listQuestionVersions,
  publishQuestionVersion,
  reviewQuestionVersion,
  updateContentQuestions,
  updateQuestion,
  updateQuestionStatus,
  updateQuestionVersion,
} from "./service.js";
import {
  createAttemptSchema,
  createQuestionSchema,
  createQuestionVersionSchema,
  listQuestionsQuerySchema,
  updateQuestionSchema,
  updateQuestionStatusSchema,
  updateQuestionVersionSchema,
  updateContentQuestionsSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) {
    throw validationError(`${label} kimliği gerekli`);
  }
  return id;
}

/**
 * Admin / Soru Yönetimi uçları (SUPER_ADMIN + CONTENT_EDITOR).
 *
 * İÇERİK:
 *  GET    /admin/questions?contentId=:contentId     — içerik için soru listesi
 *  POST   /admin/questions                           — soru oluştur (taslak)
 *  GET    /admin/questions/:id                       — soru detayı (+ mevcut sürüm + soru sürümleri)
 *  PATCH  /admin/questions/:id                       — soru düzenle (position/skillId/difficulty; prompt/options vs. question version)
 *  PATCH  /admin/questions/:id/status                — durum (DRAFT/PUBLISHED/ARCHIVED; PUBLISHED yayınlı sürüm şartı)
 *  DELETE /admin/questions/:id                       — soru soft-delete (soru birden fazla sürüm sahibiyse, son taslak sürümden bir öncekiyi PUBLISHED yapılır)
 *  PUT    /admin/contents/:contentId/questions      — içerik-soru ilişkilerini değiştir (pozisyonlu sıralama)
 *
 * SORU SÜRÜM (question-versions):
 *  GET    /admin/questions/:id/versions     — soru sürüm listesi
 *  POST   /admin/questions/:id/versions     — yeni soru sürümü oluştur (taslak)
 *  GET    /admin/question-versions/:id          — soru sürümü detayı
 *  PATCH  /admin/question-versions/:id          — taslak sürüm düzenle (PUBLISHED immutable)
 *  POST   /admin/question-versions/:id/review   — DRAFT → REVIEW
 *  POST   /admin/question-versions/:id/publish  — DRAFT/REVIEW → PUBLISHED
 *
 * LİSTELEME:
 *  içerik bazlı (contentId) filtreler, optional search, etc.
 */
export async function questionAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformContent = [
    requireAuth(authProvider),
    requirePlatformRole(["SUPER_ADMIN", "CONTENT_EDITOR"]),
  ];

  // ---- Soru Sürümleri ----

  app.get(
    "/admin/questions/versions/:versionId",
    { preHandler: platformContent },
    async (request) =>
      ok(await getQuestionVersion(readParamId(request, "Soru sürümü", "versionId"))),
  );

  app.patch(
    "/admin/questions/versions/:versionId",
    { preHandler: platformContent },
    async (request) => {
      const input = updateQuestionVersionSchema.parse(request.body);
      return ok(
        await updateQuestionVersion(readParamId(request, "Soru sürümü", "versionId"), input),
      );
    },
  );

  app.post(
    "/admin/questions/versions/:versionId/review",
    { preHandler: platformContent },
    async (request) =>
      ok(await reviewQuestionVersion(readParamId(request, "Soru sürümü", "versionId"))),
  );

  app.post(
    "/admin/questions/versions/:versionId/publish",
    { preHandler: platformContent },
    async (request) =>
      ok(await publishQuestionVersion(readParamId(request, "Soru sürümü", "versionId"))),
  );

  // Geriye dönük uyumluluk için önceki question-versions yolları korunur.

  app.get("/admin/question-versions/:id", { preHandler: platformContent }, async (request) => {
    return ok(await getQuestionVersion(readParamId(request, "Soru sürümü")));
  });

  app.patch("/admin/question-versions/:id", { preHandler: platformContent }, async (request) => {
    const input = updateQuestionVersionSchema.parse(request.body);
    return ok(await updateQuestionVersion(readParamId(request, "Soru sürümü"), input));
  });

  app.post(
    "/admin/question-versions/:id/review",
    { preHandler: platformContent },
    async (request) => {
      return ok(await reviewQuestionVersion(readParamId(request, "Soru sürümü")));
    },
  );

  app.get("/admin/questions/:id/versions", { preHandler: platformContent }, async (request) => {
    return ok(await listQuestionVersions(readParamId(request, "Soru")));
  });

  app.post("/admin/questions/:id/versions", { preHandler: platformContent }, async (request) => {
    const input = createQuestionVersionSchema.parse(request.body);
    return ok(
      await createQuestionVersion(readParamId(request, "Soru"), input, request.authUser?.id),
    );
  });

  app.post(
    "/admin/question-versions/:id/publish",
    { preHandler: platformContent },
    async (request) => {
      return ok(await publishQuestionVersion(readParamId(request, "Soru sürümü")));
    },
  );

  // ---- Sorular ----

  app.get("/admin/questions", { preHandler: platformContent }, async (request) => {
    const query = listQuestionsQuerySchema.parse(request.query);
    return ok(await listQuestions(query));
  });

  app.post("/admin/questions", { preHandler: platformContent }, async (request) => {
    const input = createQuestionSchema.parse(request.body);
    return ok(await createQuestion(input, request.authUser?.id));
  });

  app.post(
    "/admin/contents/:contentId/questions",
    { preHandler: platformContent },
    async (request) => {
      const contentId = readParamId(request, "İçerik", "contentId");
      const body = request.body as Record<string, unknown>;
      // URL kapsamı güvenilir kaynaktır; istemcinin gönderdiği contentId yok sayılır.
      const input = createQuestionSchema.parse({ ...body, contentId });
      return ok(await createQuestion(input, request.authUser?.id));
    },
  );

  app.get("/admin/questions/:id", { preHandler: platformContent }, async (request) => {
    return ok(await getQuestion(readParamId(request, "Soru")));
  });

  app.patch("/admin/questions/:id", { preHandler: platformContent }, async (request) => {
    const input = updateQuestionSchema.parse(request.body);
    return ok(await updateQuestion(readParamId(request, "Soru"), input));
  });

  app.patch("/admin/questions/:id/status", { preHandler: platformContent }, async (request) => {
    const input = updateQuestionStatusSchema.parse(request.body);
    return ok(await updateQuestionStatus(readParamId(request, "Soru"), input));
  });

  app.delete("/admin/questions/:id", { preHandler: platformContent }, async (request) => {
    return ok(await deleteQuestion(readParamId(request, "Soru")));
  });

  // ---- İçerik-Soru ilişkileri ----

  app.put(
    "/admin/contents/:contentId/questions",
    { preHandler: platformContent },
    async (request) => {
      const input = updateContentQuestionsSchema.parse(request.body);
      return ok(await updateContentQuestions(readParamId(request, "İçerik", "contentId"), input));
    },
  );

  // ---- İçerik Bazlı Soru Listesi (içerikdetayda göstermek için) ----

  app.get(
    "/admin/contents/:contentId/questions",
    { preHandler: platformContent },
    async (request) => {
      return ok(await listQuestionByContent(readParamId(request, "İçerik", "contentId")));
    },
  );

  // ---- Attempt (cevap gönderimi) ----
  // POST /admin/questions/:questionVersionId/attempts  { sessionId, answer, clientAttemptId, timeSpentMs? }
  app.post(
    "/admin/questions/:questionVersionId/attempts",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const questionVersionId = readParamId(request, "Soru sürümü", "questionVersionId");
      const input = createAttemptSchema.parse(request.body);
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(await createAttempt(questionVersionId, input, actor));
    },
  );
}
