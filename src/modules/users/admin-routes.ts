import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { forbiddenError, validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  createUser,
  getUser,
  listUsers,
  resetUserPassword,
  restoreUserPersonalContext,
  softDeleteUser,
  updateUser,
  type UserAdminReadActor,
} from "./service.js";
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
  resetUserPasswordSchema,
  restoreUserPersonalContextSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Kayıt kimliği gerekli");
  }
  return id;
}

function readSuperAdminActor(request: FastifyRequest): UserAdminReadActor {
  const user = request.authUser;
  if (!user || user.platformRole !== "SUPER_ADMIN") {
    throw forbiddenError("Bu işlem için platform yöneticisi yetkisi gerekli");
  }
  return { userId: user.id, platformRole: user.platformRole };
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
    return ok(await createUser(input, readSuperAdminActor(request)));
  });

  app.get("/admin/users/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getUser(readParamId(request), readSuperAdminActor(request)));
  });

  app.post(
    "/admin/users/:id/personal-context/restore",
    { preHandler: platformOnly },
    async (request) => {
      const { tenantId } = restoreUserPersonalContextSchema.parse(request.body);
      return ok(
        await restoreUserPersonalContext(
          readParamId(request),
          tenantId,
          readSuperAdminActor(request),
        ),
      );
    },
  );

  app.patch("/admin/users/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateUserSchema.parse(request.body);
    return ok(await updateUser(readParamId(request), input, readSuperAdminActor(request)));
  });

  app.delete("/admin/users/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteUser(readParamId(request)));
  });

  app.post("/admin/users/:id/password", { preHandler: platformOnly }, async (request) => {
    return ok(
      await resetUserPassword(
        readParamId(request),
        resetUserPasswordSchema.parse(request.body),
        request.authUser!.id,
      ),
    );
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
