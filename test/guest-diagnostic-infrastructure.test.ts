import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  GUEST_COOKIE_NAME,
  GUEST_CSRF_COOKIE_NAME,
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
  origin: string | undefined = "https://okuplus.online",
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
      assertGuestCsrfRequest(request("POST", token), expectedHash, ["https://okuplus.online"]),
    ).not.toThrow();
    expect(() =>
      assertGuestCsrfRequest(request("POST", token, "https://attacker.example"), expectedHash, [
        "https://okuplus.online",
      ]),
    ).toThrow("origin");
    expect(() =>
      assertGuestCsrfRequest(request("POST", token, ""), expectedHash, ["https://okuplus.online"]),
    ).toThrow("origin");
    expect(() =>
      assertGuestCsrfRequest(request("POST", "wrong-token"), expectedHash, [
        "https://okuplus.online",
      ]),
    ).toThrow("CSRF");
  });

  it("does not apply CSRF validation to safe methods", () => {
    expect(() =>
      assertGuestCsrfRequest(request("GET", ""), "not-used", ["https://okuplus.online"]),
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
