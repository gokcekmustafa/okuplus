import { describe, expect, it } from "vitest";
import {
  assertBootstrapEmail,
  assertProductionTargetIdentity,
  PRODUCTION_SUPER_ADMIN_BOOTSTRAP_CONFIRMATION,
} from "../scripts/production-super-admin-bootstrap-contract.js";
import { targetIdentityFingerprint } from "../src/lib/db-fingerprint-contract.js";

const approved = {
  provider: "NEON",
  host: "ep-misty-smoke-b1qzb1a8.c-5.eu-central-1.aws.neon.tech",
  port: "5432",
  database: "neondb",
  user: "neondb_owner",
  fingerprint: targetIdentityFingerprint({
    environment: "PRODUCTION",
    provider: "NEON",
    host: "ep-misty-smoke-b1qzb1a8.c-5.eu-central-1.aws.neon.tech",
    port: "5432",
    database: "neondb",
    dbUser: "neondb_owner",
  }),
};

describe("production Super Admin bootstrap contract", () => {
  it("requires the exact bootstrap confirmation and normalizes email", () => {
    expect(PRODUCTION_SUPER_ADMIN_BOOTSTRAP_CONFIRMATION).toBe("BOOTSTRAP_PRODUCTION_SUPER_ADMIN");
    expect(assertBootstrapEmail("  Admin@Example.com ")).toBe("admin@example.com");
  });

  it("rejects invalid email", () => {
    expect(() => assertBootstrapEmail("not-an-email")).toThrow("bootstrap email geçersiz");
  });

  it("requires every approved production target identity field to match", () => {
    expect(
      assertProductionTargetIdentity(
        {
          provider: "NEON",
          host: approved.host,
          port: "5432",
          database: "neondb",
          user: "neondb_owner",
        },
        approved,
      ),
    ).toBe(approved.fingerprint);

    expect(() =>
      assertProductionTargetIdentity(
        {
          provider: "NEON",
          host: approved.host,
          port: "5432",
          database: "otherdb",
          user: "neondb_owner",
        },
        approved,
      ),
    ).toThrow("production target database mismatch");
  });
});
