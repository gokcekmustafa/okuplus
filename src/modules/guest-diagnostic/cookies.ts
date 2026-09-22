import type { FastifyReply, FastifyRequest } from "fastify";

import { getCookie, setNoStore } from "../auth/cookies.js";

export const GUEST_COOKIE_NAME = "__Host-oku_guest";
export const GUEST_CSRF_COOKIE_NAME = "__Host-oku_guest_csrf";

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
  return getCookie(request, GUEST_COOKIE_NAME);
}

export function getGuestCsrfToken(request: FastifyRequest): string | undefined {
  return getCookie(request, GUEST_CSRF_COOKIE_NAME);
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
