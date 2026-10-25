import type { FastifyReply, FastifyRequest } from "fastify";

import { CAPACITOR_ANDROID_ORIGIN, CAPACITOR_IOS_ORIGIN } from "../../config/allowed-origins.js";
import { getCookie, setNoStore } from "../auth/cookies.js";

export const GUEST_COOKIE_NAME = "__Host-oku_guest";
export const GUEST_CSRF_COOKIE_NAME = "__Host-oku_guest_csrf";
export const GUEST_NATIVE_TRANSPORT_HEADER = "x-okupratik-guest-transport";
export const GUEST_NATIVE_TRANSPORT_VALUE = "secure-storage";
export const GUEST_NATIVE_TOKEN_HEADER = "x-okupratik-guest-token";

const nativeGuestOrigins = new Set([CAPACITOR_ANDROID_ORIGIN, CAPACITOR_IOS_ORIGIN]);

export function isNativeGuestTransportRequest(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  return (
    typeof origin === "string" &&
    nativeGuestOrigins.has(origin) &&
    request.headers[GUEST_NATIVE_TRANSPORT_HEADER] === GUEST_NATIVE_TRANSPORT_VALUE
  );
}

function serializeGuestCookie(
  name: string,
  value: string,
  maxAge: number,
  httpOnly: boolean,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    "Path=/",
    "SameSite=Lax",
    "Secure",
  ];
  if (httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

export function getGuestToken(request: FastifyRequest): string | undefined {
  const cookieToken = getCookie(request, GUEST_COOKIE_NAME);
  if (cookieToken) return cookieToken;
  if (!isNativeGuestTransportRequest(request)) return undefined;
  const nativeToken = request.headers[GUEST_NATIVE_TOKEN_HEADER];
  return typeof nativeToken === "string" && /^[A-Za-z0-9_-]{32,128}$/u.test(nativeToken)
    ? nativeToken
    : undefined;
}

export function getGuestCsrfToken(request: FastifyRequest): string | undefined {
  const cookieToken = getCookie(request, GUEST_CSRF_COOKIE_NAME);
  if (cookieToken) return cookieToken;
  if (!isNativeGuestTransportRequest(request)) return undefined;
  const headerToken = request.headers["x-csrf-token"];
  return typeof headerToken === "string" && /^[A-Za-z0-9_-]{32,128}$/u.test(headerToken)
    ? headerToken
    : undefined;
}

export function setGuestCookies(
  reply: FastifyReply,
  guestToken: string,
  csrfToken: string,
  maxAgeSeconds: number,
): void {
  reply.header("Set-Cookie", [
    serializeGuestCookie(GUEST_COOKIE_NAME, guestToken, maxAgeSeconds, true),
    serializeGuestCookie(GUEST_CSRF_COOKIE_NAME, csrfToken, maxAgeSeconds, false),
  ]);
  setNoStore(reply);
}

export function clearGuestCookies(reply: FastifyReply): void {
  reply.header("Set-Cookie", [
    serializeGuestCookie(GUEST_COOKIE_NAME, "", 0, true),
    serializeGuestCookie(GUEST_CSRF_COOKIE_NAME, "", 0, false),
  ]);
  setNoStore(reply);
}
