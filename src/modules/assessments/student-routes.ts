import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import {
  getAssessmentResult,
  getStudentAssessment,
  listStudentAssessments,
  startAssessmentSession,
} from "./service.js";

function readParamId(request: FastifyRequest, label: string): string {
  const id = (request.params as Record<string, string | undefined>).id;
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

/**
 * Öğrenci değerlendirmeleri uçları.
 *
 *  GET  /student/assessments              — değerlendirme listesi
 *  GET  /student/assessments/:id          — değerlendirme detayı
 *  POST /student/assessments/:id/start    — oturum başlat
 *  GET  /student/assessments/:id/result   — sonuç getir
 */
export async function assessmentStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;

  app.get("/student/assessments", { preHandler: [requireAuth(authProvider)] }, async (request) => {
    const actor = {
      userId: request.authUser!.id,
      tenantId: request.tenantContext?.tenantId ?? null,
      platformRole: request.authUser!.platformRole ?? null,
    };
    const result = await listStudentAssessments(actor);
    return ok(result);
  });

  app.get(
    "/student/assessments/:id",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      const item = await getStudentAssessment(readParamId(request, "Değerlendirme"), actor);
      return ok(item);
    },
  );

  app.post(
    "/student/assessments/:id/start",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      const result = await startAssessmentSession(readParamId(request, "Değerlendirme"), actor);
      return ok(result);
    },
  );

  app.get(
    "/student/assessments/:id/result",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      const result = await getAssessmentResult(readParamId(request, "Değerlendirme"), actor);
      return ok(result ?? null);
    },
  );
}
