import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import { createUser, getUser, listUsers, softDeleteUser, updateUser } from "./service.js";
import {
  createMembership,
  listMemberships,
  removeMembership,
  updateMembership,
} from "./membership-service.js";
import {
  createMembershipSchema,
  createUserSchema,
  listMembershipsQuerySchema,
  listUsersQuerySchema,
  updateMembershipSchema,
  updateUserSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Kayıt kimliği gerekli");
  }
  return id;
}

/**
 * Admin / Kullanıcı + Membership yönetimi uçları (yalnızca SUPER_ADMIN).
 *
 *  GET    /admin/users                    — kullanıcı listesi (search, status, page)
 *  POST   /admin/users                    — yeni kullanıcı
 *  GET    /admin/users/:id                — kullanıcı detayı + üyelikleri
 *  PATCH  /admin/users/:id                — kullanıcı düzenle
 *  DELETE /admin/users/:id                — kullanıcı soft-delete
 *  GET    /admin/memberships              — üyelik listesi (tenantId/userId/role/status)
 *  POST   /admin/memberships              — yeni üyelik
 *  PATCH  /admin/memberships/:id          — üyelik role/status değiştir
 *  DELETE /admin/memberships/:id          — üyeliği kaldır
 */
export async function userAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/users", { preHandler: platformOnly }, async (request) => {
    const query = listUsersQuerySchema.parse(request.query);
    return ok(await listUsers(query));
  });

  app.post("/admin/users", { preHandler: platformOnly }, async (request) => {
    const input = createUserSchema.parse(request.body);
    return ok(await createUser(input));
  });

  app.get("/admin/users/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getUser(readParamId(request)));
  });

  app.patch("/admin/users/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateUserSchema.parse(request.body);
    return ok(await updateUser(readParamId(request), input));
  });

  app.delete("/admin/users/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteUser(readParamId(request)));
  });

  app.get("/admin/memberships", { preHandler: platformOnly }, async (request) => {
    const query = listMembershipsQuerySchema.parse(request.query);
    return ok(await listMemberships(query));
  });

  app.post("/admin/memberships", { preHandler: platformOnly }, async (request) => {
    const input = createMembershipSchema.parse(request.body);
    return ok(await createMembership(input));
  });

  app.patch("/admin/memberships/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateMembershipSchema.parse(request.body);
    return ok(await updateMembership(readParamId(request), input));
  });

  app.delete("/admin/memberships/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await removeMembership(readParamId(request)));
  });
}
