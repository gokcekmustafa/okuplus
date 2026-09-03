import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createTenant,
  getTenant,
  listTenants,
  softDeleteTenant,
  updateTenant,
  updateTenantStatus,
} from "./service.js";
import {
  createTenantSchema,
  listTenantsQuerySchema,
  updateTenantSchema,
  updateTenantStatusSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Kurum kimliği gerekli");
  }
  return id;
}

/**
 * Admin / Kurum yönetimi uçları. Tüm uçlar kimlik doğrulaması + platform
 * yetkisi ister (yalnızca platform rolü; SUPER_ADMIN dahil).
 *
 *  GET    /admin/tenants          — liste (search, status, page, pageSize)
 *  POST   /admin/tenants          — yeni kurum
 *  GET    /admin/tenants/:id      — detay
 *  PATCH  /admin/tenants/:id      — düzenle
 *  PATCH  /admin/tenants/:id/status — durum değiştir (ACTIVE/SUSPENDED/CLOSED)
 *  DELETE /admin/tenants/:id      — soft-delete
 */
export async function tenantAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/tenants", { preHandler: platformOnly }, async (request) => {
    const query = listTenantsQuerySchema.parse(request.query);
    return ok(await listTenants(query));
  });

  app.post("/admin/tenants", { preHandler: platformOnly }, async (request) => {
    const input = createTenantSchema.parse(request.body);
    return ok(await createTenant(input));
  });

  app.get("/admin/tenants/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getTenant(readParamId(request)));
  });

  app.patch("/admin/tenants/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateTenantSchema.parse(request.body);
    return ok(await updateTenant(readParamId(request), input));
  });

  app.patch("/admin/tenants/:id/status", { preHandler: platformOnly }, async (request) => {
    const input = updateTenantStatusSchema.parse(request.body);
    return ok(await updateTenantStatus(readParamId(request), input));
  });

  app.delete("/admin/tenants/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteTenant(readParamId(request)));
  });
}
