import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthTokens } from "./types.js";
import { validationError } from "../../lib/errors.js";

export const ACCESS_COOKIE_NAME = "__Host-oku_access";
export const REFRESH_COOKIE_NAME = "__Secure-oku_refresh";
export const CSRF_COOKIE_NAME = "__Host-oku_csrf";
export const AUTH_TRANSPORT_HEADER = "x-auth-transport";
export const COOKIE_AUTH_TRANSPORT = "cookie";

type CookieOptions = {
  httpOnly?: boolean;
  maxAge: number;
  path: "/" | "/auth";
};

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    `Path=${options.path}`,
    "SameSite=Lax",
    "Secure",
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

function appendSetCookies(reply: FastifyReply, cookies: string[]): void {
  reply.header("Set-Cookie", cookies);
  setNoStore(reply);
}

export function setNoStore(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
}

export function getCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      // A malformed auth cookie is still a present cookie. Returning an empty
      // value prevents an unsafe fallback to a different Bearer session.
      return "";
    }
  }
  return undefined;
}

export function hasCookie(request: FastifyRequest, name: string): boolean {
  return getCookie(request, name) !== undefined;
}

export function isCookieTransportRequested(request: FastifyRequest): boolean {
  const value = request.headers[AUTH_TRANSPORT_HEADER];
  return typeof value === "string" && value.trim().toLowerCase() === COOKIE_AUTH_TRANSPORT;
}

export function resolveRefreshToken(request: FastifyRequest, bodyToken?: string | null): string {
  const cookieToken = getCookie(request, REFRESH_COOKIE_NAME);
  const normalizedBodyToken = bodyToken?.trim() || undefined;

  if (cookieToken !== undefined && normalizedBodyToken !== undefined) {
    if (cookieToken !== normalizedBodyToken) {
      throw validationError("Refresh token transport çakışması");
    }
    return cookieToken;
  }
  if (cookieToken !== undefined) return cookieToken;
  if (normalizedBodyToken !== undefined) return normalizedBodyToken;
  throw validationError("refreshToken gerekli");
}

export function resolveAccessToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === "string" && header.trim() !== "") {
    // Bearer is the legacy/native contract and deliberately wins when both
    // transports are present. Never switch to a cookie because a Bearer
    // header is malformed or empty.
    if (!header.startsWith("Bearer ")) return undefined;
    const bearer = header.slice("Bearer ".length).trim();
    return bearer || undefined;
  }

  const cookieToken = getCookie(request, ACCESS_COOKIE_NAME);
  return cookieToken;
}

export function setAuthCookies(reply: FastifyReply, tokens: AuthTokens, csrfToken: string): void {
  appendSetCookies(reply, [
    serializeCookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
      httpOnly: true,
      maxAge: Math.max(1, Math.floor((tokens.accessTokenExpiresAt.getTime() - Date.now()) / 1000)),
      path: "/",
    }),
    serializeCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      maxAge: Math.max(1, Math.floor((tokens.refreshTokenExpiresAt.getTime() - Date.now()) / 1000)),
      path: "/auth",
    }),
    serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
      maxAge: Math.max(1, Math.floor((tokens.refreshTokenExpiresAt.getTime() - Date.now()) / 1000)),
      path: "/",
    }),
  ]);
}

export function clearAuthCookies(reply: FastifyReply): void {
  appendSetCookies(reply, [
    serializeCookie(ACCESS_COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/" }),
    serializeCookie(REFRESH_COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/auth" }),
    serializeCookie(CSRF_COOKIE_NAME, "", { maxAge: 0, path: "/" }),
  ]);
}
