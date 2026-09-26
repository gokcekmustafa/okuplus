import { randomBytes, timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { forbiddenError } from "../../lib/errors.js";
import { assertRequestOrigin, CSRF_HEADER_NAME } from "../auth/csrf.js";
import { getGuestCsrfToken } from "./cookies.js";
import { hashGuestToken } from "./context.js";

export function createGuestCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

function headerValue(request: FastifyRequest): string | undefined {
  const value = request.headers[CSRF_HEADER_NAME];
  return typeof value === "string" ? value : undefined;
}

function hashesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Guest state-changing requests use a separate non-HttpOnly CSRF cookie. The
 * server stores only its hash in GuestDiagnosticSession and still requires an
 * exact trusted Origin/referer check.
 */
export function assertGuestCsrfRequest(
  request: FastifyRequest,
  expectedTokenHash: string,
  allowedOrigins: readonly string[],
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;

  const cookieToken = getGuestCsrfToken(request);
  const headerToken = headerValue(request);
  if (
    !cookieToken ||
    !headerToken ||
    cookieToken !== headerToken ||
    !hashesMatch(hashGuestToken(cookieToken), expectedTokenHash)
  ) {
    throw forbiddenError("CSRF doğrulaması gerekli");
  }

  assertRequestOrigin(request, allowedOrigins);
}
