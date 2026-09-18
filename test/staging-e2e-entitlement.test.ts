import { describe, expect, it } from "vitest";
import {
  configuredStagingE2EPremiumEmails,
  parseEnv,
  parseStagingE2EPremiumEmails,
} from "../src/config/env.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
};

describe("staging E2E entitlement configuration", () => {
  it("keeps the legacy single-email configuration working", () => {
    const env = parseEnv({
      ...baseEnv,
      APP_ENV: "staging",
      STAGING_E2E_PREMIUM_EMAIL: " RELEASE-0-5@E2E.INVALID ",
    });
    expect(env.STAGING_E2E_PREMIUM_EMAIL).toBe("release-0-5@e2e.invalid");
    expect(
      configuredStagingE2EPremiumEmails({ legacyEmail: env.STAGING_E2E_PREMIUM_EMAIL }),
    ).toEqual(["release-0-5@e2e.invalid"]);
  });

  it("accepts multiple normalized synthetic premium emails", () => {
    const env = parseEnv({
      ...baseEnv,
      APP_ENV: "staging",
      STAGING_E2E_PREMIUM_EMAILS:
        " canonical@e2e.invalid,  FRESH@E2E.INVALID, canonical@e2e.invalid ",
    });
    expect(env.STAGING_E2E_PREMIUM_EMAILS).toContain("FRESH@E2E.INVALID");
    expect(
      configuredStagingE2EPremiumEmails({
        emailList: env.STAGING_E2E_PREMIUM_EMAILS,
      }),
    ).toEqual(["canonical@e2e.invalid", "fresh@e2e.invalid"]);
  });

  it("ignores empty list entries deterministically", () => {
    expect(parseStagingE2EPremiumEmails(" , Fresh@e2e.invalid, ")).toEqual(["fresh@e2e.invalid"]);
    expect(parseStagingE2EPremiumEmails(" , ")).toEqual([]);
  });

  it("uses the new allowlist when present and the legacy value as fallback", () => {
    expect(
      configuredStagingE2EPremiumEmails({
        emailList: "fresh@e2e.invalid",
        legacyEmail: "canonical@e2e.invalid",
      }),
    ).toEqual(["fresh@e2e.invalid"]);
    expect(configuredStagingE2EPremiumEmails({ legacyEmail: "canonical@e2e.invalid" })).toEqual([
      "canonical@e2e.invalid",
    ]);
  });

  it("keeps canonical and fresh synthetic emails independently eligible", () => {
    expect(
      configuredStagingE2EPremiumEmails({
        emailList: "canonical@e2e.invalid,fresh@e2e.invalid",
      }),
    ).toEqual(["canonical@e2e.invalid", "fresh@e2e.invalid"]);
  });

  it.each([
    ["production", "release-0-5@e2e.invalid"],
    ["staging", "release-0-5@gmail.com"],
    ["staging", "release-0-5@e2e.test"],
  ])("rejects unsafe legacy fixture configuration: %s / %s", (appEnv, email) => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        APP_ENV: appEnv,
        STAGING_E2E_PREMIUM_EMAIL: email,
      }),
    ).toThrow(/STAGING_E2E_PREMIUM_EMAIL|premium allowlist/u);
  });

  it("rejects non-synthetic values in the new allowlist", () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        APP_ENV: "staging",
        STAGING_E2E_PREMIUM_EMAILS: "fresh@example.com",
      }),
    ).toThrow("STAGING_E2E_PREMIUM_EMAILS");
  });

  it("rejects the new allowlist outside staging", () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        APP_ENV: "production",
        STAGING_E2E_PREMIUM_EMAILS: "fresh@e2e.invalid",
      }),
    ).toThrow("premium allowlist");
  });

  it("keeps the provider disabled when no explicit email is configured", () => {
    const env = parseEnv({ ...baseEnv, APP_ENV: "staging" });
    expect(env.STAGING_E2E_PREMIUM_EMAIL).toBe("");
    expect(env.STAGING_E2E_PREMIUM_EMAILS).toBe("");
    expect(
      configuredStagingE2EPremiumEmails({
        emailList: env.STAGING_E2E_PREMIUM_EMAILS,
        legacyEmail: env.STAGING_E2E_PREMIUM_EMAIL,
      }),
    ).toEqual([]);
  });
});
