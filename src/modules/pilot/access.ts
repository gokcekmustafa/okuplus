import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../../config/env.js";
import { forbiddenError } from "../../lib/errors.js";

function accessEntries(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPilotAccessAllowed(
  env: Pick<Env, "APP_ENV" | "PILOT_MODE" | "PILOT_STUDENT_ACCESS">,
  user: { id: string; email?: string | null },
): boolean {
  if (env.APP_ENV === "production" || env.PILOT_MODE !== "on") return false;
  const allowlist = accessEntries(env.PILOT_STUDENT_ACCESS);
  if (allowlist.size === 0) return true;
  return (
    allowlist.has(user.id.toLowerCase()) ||
    (!!user.email && allowlist.has(user.email.toLowerCase()))
  );
}

export function requirePilotAccess(
  env: Pick<Env, "APP_ENV" | "PILOT_MODE" | "PILOT_STUDENT_ACCESS">,
) {
  return async function pilotAccessGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const user = request.authUser;
    if (!user) throw forbiddenError("Pilot erişimi için öğrenci oturumu gerekli");
    if (env.APP_ENV === "production") {
      throw forbiddenError("Pilot modu production ortamında kapalıdır");
    }
    if (env.PILOT_MODE !== "on") throw forbiddenError("Pilot modu açık değil");
    if (!isPilotAccessAllowed(env, user))
      throw forbiddenError("Pilot erişim listenizde değilsiniz");
    if (user.platformRole) throw forbiddenError("Pilot uçları yalnızca öğrenci hesabı içindir");
  };
}
