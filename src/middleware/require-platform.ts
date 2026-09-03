import type { FastifyReply, FastifyRequest } from "fastify";
import type { PlatformRole } from "@prisma/client";
import { forbiddenError } from "../lib/errors.js";

/**
 * Route guard: yalnızca platform yetkili kullanıcıları (platformRole dolu)
 * geçirir. Normal tenant kullanıcıları (tenantContext.platformRole === null)
 * 403 alır. Auth middleware'den sonra çalıştırılmalıdır.
 */
export function requirePlatformRole(allowed: PlatformRole[] = []) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const role = request.authUser?.platformRole;
    if (!role) {
      throw forbiddenError("Bu işlem için platform yetkisi gerekli");
    }
    if (allowed.length > 0 && !allowed.includes(role)) {
      throw forbiddenError("Bu işlem için yetkiniz yok");
    }
  };
}
