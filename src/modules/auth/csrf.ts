import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { forbiddenError } from "../../lib/errors.js";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  getCookie,
  isCookieTransportRequested,
  REFRESH_COOKIE_NAME,
} from "./cookies.js";

export const CSRF_HEADER_NAME = "x-csrf-token";

export type OriginCheck =
  | { ok: true; source: "origin" | "referer" }
  | { ok: false; reason: "missing" | "mismatch" | "malformed" };

export function createCsrfToken(secret: string): string {
  const nonce = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", secret).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string, secret: string): boolean {
  const [nonce, signature, ...extra] = token.split(".");
  if (!nonce || !signature || extra.length > 0) return false;

  const expected = createHmac("sha256", secret).update(nonce).digest("base64url");
  const actualBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

export function checkRequestOrigin(
  request: FastifyRequest,
  allowedOrigins: readonly string[],
): OriginCheck {
  const allowlist = new Set(allowedOrigins.map((origin) => origin.trim()).filter(Boolean));
  const origin = headerValue(request, "origin");
  if (origin)
    return allowlist.has(origin)
      ? { ok: true, source: "origin" }
      : { ok: false, reason: "mismatch" };

  const referer = headerValue(request, "referer");
  if (!referer) return { ok: false, reason: "missing" };
  try {
    const refererOrigin = new URL(referer).origin;
    return allowlist.has(refererOrigin)
      ? { ok: true, source: "referer" }
      : { ok: false, reason: "mismatch" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function assertRequestOrigin(
  request: FastifyRequest,
  allowedOrigins: readonly string[],
): void {
  const result = checkRequestOrigin(request, allowedOrigins);
  if (!result.ok) throw forbiddenError("İstek origin'i doğrulanamadı");
}

export function assertCsrfRequest(
  request: FastifyRequest,
  secret: string,
  allowedOrigins: readonly string[],
): void {
  const cookieToken = getCookie(request, CSRF_COOKIE_NAME);
  const headerToken = headerValue(request, CSRF_HEADER_NAME);
  if (
    !cookieToken ||
    !headerToken ||
    cookieToken !== headerToken ||
    !verifyCsrfToken(cookieToken, secret)
  ) {
    throw forbiddenError("CSRF doğrulaması gerekli");
  }
  assertRequestOrigin(request, allowedOrigins);
}

/**
 * Phase 1 global guard. Cookie transport is opt-in, and unsafe cookie-auth
 * requests always require a valid CSRF token and exact request origin.
 */
export function createCookieCsrfGuard(
  secret: string,
  allowedOrigins: readonly string[],
  options: { cookieAuthEnabled: boolean },
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    // Login/signup are authentication bootstrap routes. Existing cookies
    // must not prevent a user from signing in again; their cookie transport is
    // still protected by the explicit Origin rollout guard below.
    if (/^\/auth\/(login|signup|social(?:\/[^/]+)?)$/.test(request.url.split("?", 1)[0] ?? "")) {
      return;
    }

    const accessCookie = getCookie(request, ACCESS_COOKIE_NAME);
    const refreshCookie = getCookie(request, REFRESH_COOKIE_NAME);
    if (accessCookie === undefined && refreshCookie === undefined) return;

    const authorization = request.headers.authorization;
    const hasBearer = typeof authorization === "string" && authorization.trim() !== "";
    const pathname = request.url.split("?", 1)[0] ?? "";
    const usesRefreshCookie = pathname === "/auth/refresh" || pathname === "/auth/logout";
    // Refresh/logout do not authenticate through the access Bearer token, so
    // an unrelated Authorization header must not bypass CSRF for a refresh
    // cookie. Other protected routes use Bearer when it is present.
    if (accessCookie !== undefined && hasBearer && !usesRefreshCookie) return;

    if (!options.cookieAuthEnabled) {
      throw forbiddenError("Cookie authentication etkin değil");
    }

    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    assertCsrfRequest(request, secret, allowedOrigins);
  };
}

/**
 * Phase 1 auth endpoint integration point. Native/legacy Bearer clients do
 * not send the explicit cookie transport marker and therefore remain intact.
 */
export function createCookieOriginGuard(
  allowedOrigins: readonly string[],
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    if (isCookieTransportRequested(request)) assertRequestOrigin(request, allowedOrigins);
  };
}
