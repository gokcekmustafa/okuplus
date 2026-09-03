import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RequestContext } from "../modules/tenant/index.js";
import type { AuthenticatedUser } from "../modules/auth/index.js";

/**
 * Fastify request'ine tenantContext ve authUser alanlarını ekler. Bu alanlar
 * auth middleware'i tarafından doldurulur; public uçlarda null kalır.
 */
declare module "fastify" {
  interface FastifyRequest {
    tenantContext: RequestContext | null;
    authUser: AuthenticatedUser | null;
  }
}

export async function tenantContextMiddleware(app: FastifyInstance): Promise<void> {
  app.decorateRequest("tenantContext", null);
  app.decorateRequest("authUser", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    request.tenantContext = null;
    request.authUser = null;
  });
}
