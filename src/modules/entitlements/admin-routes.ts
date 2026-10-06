import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import type { AuthProvider } from "../auth/index.js";
import {
  createEntitlementSchema,
  listEntitlementsQuerySchema,
  updateEntitlementSchema,
} from "./admin-schemas.js";
import {
  createAdminEntitlement,
  listAdminEntitlements,
  updateAdminEntitlement,
} from "./admin-service.js";

function readId(request: FastifyRequest): string {
  const id = (request.params as { id?: string }).id;
  if (!id?.trim()) throw validationError("Entitlement kimliği gerekli");
  return id;
}

export async function entitlementAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const platformOnly = [requireAuth(opts.authProvider), requirePlatformRole(["SUPER_ADMIN"])];
  app.get("/admin/entitlements", { preHandler: platformOnly }, async (request) =>
    ok(await listAdminEntitlements(listEntitlementsQuerySchema.parse(request.query))),
  );
  app.post("/admin/entitlements", { preHandler: platformOnly }, async (request) =>
    ok(
      await createAdminEntitlement(
        createEntitlementSchema.parse(request.body),
        request.authUser!.id,
      ),
    ),
  );
  app.patch("/admin/entitlements/:id", { preHandler: platformOnly }, async (request) =>
    ok(
      await updateAdminEntitlement(
        readId(request),
        updateEntitlementSchema.parse(request.body),
        request.authUser!.id,
      ),
    ),
  );
}
