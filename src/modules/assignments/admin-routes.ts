import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createAssignment,
  deleteAssignment,
  getAssignment,
  listAssignments,
  listClassAssignments,
  updateAssignment,
  updateAssignmentStatus,
} from "./service.js";
import {
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

/**
 * Ödev yönetimi uçları (SUPER_ADMIN).
 *
 *  GET    /admin/assignments                    — ödev listesi
 *  POST   /admin/assignments                    — ödev oluştur
 *  GET    /admin/assignments/:id                — ödev detayı
 *  PATCH  /admin/assignments/:id                — ödev düzenle (sadece DRAFT)
 *  PATCH  /admin/assignments/:id/status         — durum değiştir
 *  DELETE /admin/assignments/:id                — soft-delete (sadece DRAFT)
 *  GET    /admin/classes/:classId/assignments   — sınıfa ait ödevler
 */
export async function assignmentAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/assignments", { preHandler: platformOnly }, async (request) => {
    const query = listAssignmentsQuerySchema.parse(request.query);
    return ok(await listAssignments(query));
  });

  app.post("/admin/assignments", { preHandler: platformOnly }, async (request) => {
    const input = createAssignmentSchema.parse(request.body);
    return ok(await createAssignment(input, request.authUser?.id));
  });

  app.get("/admin/assignments/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getAssignment(readParamId(request, "Ödev")));
  });

  app.patch("/admin/assignments/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateAssignmentSchema.parse(request.body);
    return ok(await updateAssignment(readParamId(request, "Ödev"), input));
  });

  app.patch("/admin/assignments/:id/status", { preHandler: platformOnly }, async (request) => {
    const input = updateAssignmentStatusSchema.parse(request.body);
    return ok(await updateAssignmentStatus(readParamId(request, "Ödev"), input));
  });

  app.delete("/admin/assignments/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await deleteAssignment(readParamId(request, "Ödev")));
  });

  app.get("/admin/classes/:classId/assignments", { preHandler: platformOnly }, async (request) => {
    return ok(await listClassAssignments(readParamId(request, "Sınıf", "classId")));
  });
}
