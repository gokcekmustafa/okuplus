import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorizedError } from "../lib/errors.js";
import type { AuthProvider } from "../modules/auth/index.js";

/**
 * Bearer token'ı doğrular ve request.tenantContext + request.authUser'ı
 * doldurur. Tenant seçimi X-Tenant-Id header'ından gelir (opsiyonel).
 *
 * AuthProvider soyutlaması üzerinden çalıştığı için JWT dışındaki
 * stratejilere de uyarlanabilir.
 */
export function requireAuth(provider: AuthProvider) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw unauthorizedError("Kimlik doğrulaması gerekli");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw unauthorizedError("Kimlik doğrulaması gerekli");
    }

    const tenantHeader = request.headers["x-tenant-id"];
    const requestedTenantId =
      typeof tenantHeader === "string" && tenantHeader.length > 0 ? tenantHeader : null;

    const session = await provider.verifyAccessToken(token, requestedTenantId);

    request.authUser = session.user;
    request.tenantContext = session.tenantContext;
  };
}
