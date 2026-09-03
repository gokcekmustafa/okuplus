import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createBranch,
  getBranch,
  listBranchManagers,
  listBranches,
  softDeleteBranch,
  updateBranch,
  updateBranchManager,
  updateBranchStatus,
} from "./service.js";
import {
  createBranchSchema,
  listBranchManagersQuerySchema,
  listBranchesQuerySchema,
  updateBranchManagerSchema,
  updateBranchSchema,
  updateBranchStatusSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Şube kimliği gerekli");
  }
  return id;
}

/**
 * Admin / Şube yönetimi uçları (yalnızca SUPER_ADMIN).
 *
 *  GET    /admin/branches                        — şube listesi (search/tenantId/status/page)
 *  POST   /admin/branches                        — şube oluştur (tenant + benzersizlik + müdür kontrolleri)
 *  GET    /admin/branches/:id                    — şube detayı (tenant + müdür + sayaçlar)
 *  PATCH  /admin/branches/:id                    — şube düzenle (name/code/address/phone; tenant değişmez)
 *  DELETE /admin/branches/:id                    — şube soft-delete (tarihçe korunur)
 *  PATCH  /admin/branches/:id/status             — durum değiştir (ACTIVE/INACTIVE/CLOSED)
 *  PATCH  /admin/branches/:id/manager            — müdür ata/kaldır (null kaldırır)
 *  GET    /admin/branch-options/managers         — tenant'ın şube müdürü adayları (okuma amaçlı)
 */
export async function branchAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/branches", { preHandler: platformOnly }, async (request) => {
    const query = listBranchesQuerySchema.parse(request.query);
    return ok(await listBranches(query));
  });

  app.post("/admin/branches", { preHandler: platformOnly }, async (request) => {
    const input = createBranchSchema.parse(request.body);
    return ok(await createBranch(input));
  });

  app.get("/admin/branches/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getBranch(readParamId(request)));
  });

  app.patch("/admin/branches/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateBranchSchema.parse(request.body);
    return ok(await updateBranch(readParamId(request), input));
  });

  app.patch("/admin/branches/:id/status", { preHandler: platformOnly }, async (request) => {
    const input = updateBranchStatusSchema.parse(request.body);
    return ok(await updateBranchStatus(readParamId(request), input));
  });

  app.patch("/admin/branches/:id/manager", { preHandler: platformOnly }, async (request) => {
    const input = updateBranchManagerSchema.parse(request.body);
    return ok(await updateBranchManager(readParamId(request), input));
  });

  app.delete("/admin/branches/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteBranch(readParamId(request)));
  });

  // ---- Lookup (yalnızca okuma) ----

  app.get("/admin/branch-options/managers", { preHandler: platformOnly }, async (request) => {
    const query = listBranchManagersQuerySchema.parse(request.query);
    return ok(await listBranchManagers(query.tenantId));
  });
}
