import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createAssessment,
  deleteAssessment,
  getAssessment,
  listAssessments,
  updateAssessment,
  updateAssessmentStatus,
} from "./service.js";
import {
  createAssessmentSchema,
  listAssessmentsQuerySchema,
  updateAssessmentSchema,
  updateAssessmentStatusSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest, label: string): string {
  const id = (request.params as Record<string, string | undefined>).id;
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

/**
 * Ölçme & Değerlendirme yönetimi uçları (SUPER_ADMIN).
 *
 *  GET    /admin/assessments                    — değerlendirme listesi
 *  POST   /admin/assessments                    — değerlendirme oluştur
 *  GET    /admin/assessments/:id                — değerlendirme detayı
 *  PUT    /admin/assessments/:id                — değerlendirme güncelle
 *  PATCH  /admin/assessments/:id/status         — durum değiştir
 *  DELETE /admin/assessments/:id                — soft-delete (sadece DRAFT)
 */
export async function assessmentAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/assessments", { preHandler: platformOnly }, async (request) => {
    const query = listAssessmentsQuerySchema.parse(request.query);
    return ok(await listAssessments(query));
  });

  app.post("/admin/assessments", { preHandler: platformOnly }, async (request) => {
    const input = createAssessmentSchema.parse(request.body);
    return ok(await createAssessment(input, request.authUser?.id));
  });

  app.get("/admin/assessments/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getAssessment(readParamId(request, "Değerlendirme")));
  });

  app.put("/admin/assessments/:id", { preHandler: platformOnly }, async (request) => {
    const id = readParamId(request, "Değerlendirme");
    const input = updateAssessmentSchema.parse(request.body);
    return ok(await updateAssessment(id, input));
  });

  app.patch("/admin/assessments/:id/status", { preHandler: platformOnly }, async (request) => {
    const id = readParamId(request, "Değerlendirme");
    const input = updateAssessmentStatusSchema.parse(request.body);
    return ok(await updateAssessmentStatus(id, input));
  });

  app.delete("/admin/assessments/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await deleteAssessment(readParamId(request, "Değerlendirme")));
  });
}
