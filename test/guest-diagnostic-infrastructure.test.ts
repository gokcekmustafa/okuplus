import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  GUEST_COOKIE_NAME,
  GUEST_CSRF_COOKIE_NAME,
  GUEST_NATIVE_TOKEN_HEADER,
  GUEST_NATIVE_TRANSPORT_HEADER,
  GUEST_NATIVE_TRANSPORT_VALUE,
  getGuestToken,
  isNativeGuestTransportRequest,
  setGuestCookies,
} from "../src/modules/guest-diagnostic/cookies.js";
import {
  assertGuestCsrfRequest,
  createGuestCsrfToken,
} from "../src/modules/guest-diagnostic/csrf.js";
import { hashGuestToken } from "../src/modules/guest-diagnostic/context.js";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260922130000_add_guest_diagnostic_content_read_policy/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function request(
  method: string,
  token: string,
  origin: string | undefined = "https://www.okupratik.com",
): FastifyRequest {
  return {
    method,
    headers: {
      cookie: `${GUEST_CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
      "x-csrf-token": token,
      ...(origin ? { origin } : {}),
    },
  } as unknown as FastifyRequest;
}

describe("guest diagnostic security infrastructure", () => {
  it("uses the required host-only cookie contract", () => {
    const headers: Record<string, unknown> = {};
    const reply = {
      header(name: string, value: unknown) {
        headers[name] = value;
        return this;
      },
    } as unknown as FastifyReply;

    setGuestCookies(reply, "opaque-guest-token", "opaque-csrf-token", 900);
    const cookies = headers["Set-Cookie"] as string[];

    expect(cookies[0]).toContain(`${GUEST_COOKIE_NAME}=opaque-guest-token`);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).not.toContain("Domain=");
    expect(cookies[1]).toContain(`${GUEST_CSRF_COOKIE_NAME}=opaque-csrf-token`);
    expect(cookies[1]).not.toContain("HttpOnly");
    expect(cookies[1]).not.toContain("Domain=");
  });

  it("requires matching guest CSRF cookie/header and a trusted origin", () => {
    const token = createGuestCsrfToken();
    const expectedHash = hashGuestToken(token);

    expect(() =>
      assertGuestCsrfRequest(request("POST", token), expectedHash, ["https://www.okupratik.com"]),
    ).not.toThrow();
    expect(() =>
      assertGuestCsrfRequest(request("POST", token, "https://attacker.example"), expectedHash, [
        "https://www.okupratik.com",
      ]),
    ).toThrow("origin");
    expect(() =>
      assertGuestCsrfRequest(request("POST", token, ""), expectedHash, [
        "https://www.okupratik.com",
      ]),
    ).toThrow("origin");
    expect(() =>
      assertGuestCsrfRequest(request("POST", "wrong-token"), expectedHash, [
        "https://www.okupratik.com",
      ]),
    ).toThrow("CSRF");
  });

  it("accepts native guest credentials only from an exact Capacitor origin with the secure-storage marker", () => {
    const token = "a".repeat(43);
    for (const origin of ["https://localhost", "capacitor://localhost"]) {
      const nativeRequest = {
        method: "GET",
        headers: {
          origin,
          [GUEST_NATIVE_TRANSPORT_HEADER]: GUEST_NATIVE_TRANSPORT_VALUE,
          [GUEST_NATIVE_TOKEN_HEADER]: token,
        },
      } as unknown as FastifyRequest;
      expect(isNativeGuestTransportRequest(nativeRequest)).toBe(true);
      expect(getGuestToken(nativeRequest)).toBe(token);
    }

    const untrustedRequest = {
      method: "GET",
      headers: {
        origin: "https://attacker.example",
        [GUEST_NATIVE_TRANSPORT_HEADER]: GUEST_NATIVE_TRANSPORT_VALUE,
        [GUEST_NATIVE_TOKEN_HEADER]: token,
      },
    } as unknown as FastifyRequest;
    expect(isNativeGuestTransportRequest(untrustedRequest)).toBe(false);
    expect(getGuestToken(untrustedRequest)).toBeUndefined();
  });

  it("validates native CSRF credentials against the stored hash and exact app origin", () => {
    const token = createGuestCsrfToken();
    const headers = {
      origin: "https://localhost",
      [GUEST_NATIVE_TRANSPORT_HEADER]: GUEST_NATIVE_TRANSPORT_VALUE,
      "x-csrf-token": token,
    };
    expect(() =>
      assertGuestCsrfRequest(
        { method: "POST", headers } as unknown as FastifyRequest,
        hashGuestToken(token),
        ["https://localhost", "capacitor://localhost"],
      ),
    ).not.toThrow();
    expect(() =>
      assertGuestCsrfRequest(
        {
          method: "POST",
          headers: { ...headers, origin: "https://attacker.example" },
        } as unknown as FastifyRequest,
        hashGuestToken(token),
        ["https://localhost", "capacitor://localhost"],
      ),
    ).toThrow();
  });

  it("does not apply CSRF validation to safe methods", () => {
    expect(() =>
      assertGuestCsrfRequest(request("GET", ""), "not-used", ["https://www.okupratik.com"]),
    ).not.toThrow();
  });

  it("grants only published global source reads to the restricted guest role", () => {
    for (const table of [
      "Content",
      "ContentVersion",
      "ContentSkill",
      "Question",
      "QuestionVersion",
      "ExerciseTemplate",
      "ExerciseTemplateVersion",
      "ExerciseTemplateVersionContent",
      "ExerciseTemplateVersionQuestion",
      "Skill",
    ]) {
      expect(migration).toContain(`"${table}"`);
    }
    expect(migration).toContain("app.guest_operation', true) = 'CREATE'");
    expect(migration).not.toContain('"StudentProfile"');
    expect(migration).not.toContain('"AssessmentResult"');
    expect(migration).not.toContain('"StudentBaseline"');
    expect(migration).not.toContain("GRANT SELECT, INSERT");
    expect(migration).not.toContain("GRANT UPDATE");
  });
});
