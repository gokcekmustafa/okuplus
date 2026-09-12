import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
};

describe("staging E2E entitlement configuration", () => {
  it("accepts only a .invalid synthetic email in staging", () => {
    expect(
      parseEnv({
        ...baseEnv,
        APP_ENV: "staging",
        STAGING_E2E_PREMIUM_EMAIL: "release-0-5@e2e.invalid",
      }).STAGING_E2E_PREMIUM_EMAIL,
    ).toBe("release-0-5@e2e.invalid");
  });

  it.each([
    ["production", "release-0-5@e2e.invalid"],
    ["staging", "release-0-5@gmail.com"],
    ["staging", "release-0-5@e2e.test"],
  ])("rejects unsafe fixture configuration: %s / %s", (appEnv, email) => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        APP_ENV: appEnv,
        STAGING_E2E_PREMIUM_EMAIL: email,
      }),
    ).toThrow("STAGING_E2E_PREMIUM_EMAIL");
  });

  it("keeps the provider disabled when no explicit email is configured", () => {
    expect(parseEnv({ ...baseEnv, APP_ENV: "staging" }).STAGING_E2E_PREMIUM_EMAIL).toBe("");
  });
});
