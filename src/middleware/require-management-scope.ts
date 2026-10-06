import type { FastifyReply, FastifyRequest } from "fastify";
import type { MembershipRole, PlatformRole } from "@prisma/client";
import { forbiddenError } from "../lib/errors.js";

const ORGANIZATION_ROLES: MembershipRole[] = ["OWNER", "ORG_ADMIN", "BRANCH_MANAGER"];

/** Platform SUPER_ADMIN veya tenant kapsamlı kurum yöneticisi. */
export function requirePlatformOrOrganizationManagement(
  platformRoles: PlatformRole[] = ["SUPER_ADMIN"],
) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const platformRole = request.authUser?.platformRole;
    if (platformRole) {
      if (!platformRoles.includes(platformRole)) {
        throw forbiddenError("Bu işlem için platform yetkiniz yok");
      }
      return;
    }
    const role = request.tenantContext?.role;
    if (!role || !ORGANIZATION_ROLES.includes(role)) {
      throw forbiddenError("Bu işlem için kurum yönetimi yetkiniz yok");
    }
  };
}
