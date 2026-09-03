import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { getEntitlements } from "./service.js";

export async function entitlementRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  app.get(
    "/account/entitlements",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) =>
      ok(
        await getEntitlements({
          userId: request.authUser!.id,
          tenantId: request.tenantContext?.tenantId ?? null,
          platformRole: request.authUser!.platformRole ?? null,
        }),
      ),
  );
}
