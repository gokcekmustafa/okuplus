import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertTargetIdentityFingerprint,
  providerForHost,
  targetIdentityFingerprint,
} from "../scripts/db-fingerprint-contract.js";

const target = {
  environment: "PRODUCTION" as const,
  provider: "NEON" as const,
  host: "ep-prod.eu-central-1.aws.neon.tech",
  port: "5432",
  database: "oku_plus",
  dbUser: "oku_app",
};

describe("production database fingerprint output contract", () => {
  it("computes the stable approved-target identity fingerprint", () => {
    const actual = targetIdentityFingerprint(target);
    const expected = createHash("sha256")
      .update(
        [
          "oku-catalog-target-v1",
          "PRODUCTION",
          "NEON",
          "ep-prod.eu-central-1.aws.neon.tech",
          "5432",
          "oku_plus",
          "oku_app",
        ].join("\n"),
        "utf8",
      )
      .digest("hex");

    expect(actual).toBe(expected);
    expect(actual).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps target identity independent from live schema state", () => {
    const targetIdentity = targetIdentityFingerprint(target);
    const liveFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          environment: target.environment,
          database: {
            host: "10.0.0.1",
            port: 5432,
            database: target.database,
            schema: "public",
            serverVersion: "PostgreSQL 16",
          },
          schemaHash: "schema-a",
          liveSchemaHash: "schema-b",
          migrationManifestHash: "migrations-a",
          lastAppliedMigration: "migration-a",
        }),
        "utf8",
      )
      .digest("hex");

    expect(targetIdentity).not.toBe(liveFingerprint);
  });

  it("validates malformed or missing canonical output fail-closed", () => {
    expect(() => assertTargetIdentityFingerprint(undefined)).toThrow();
    expect(() => assertTargetIdentityFingerprint("not-a-fingerprint")).toThrow();
    expect(() => assertTargetIdentityFingerprint("A".repeat(64))).toThrow();
    expect(assertTargetIdentityFingerprint("a".repeat(64))).toBe("a".repeat(64));
  });

  it("preserves provider classification and does not expose connection values", () => {
    expect(providerForHost("ep-prod.eu-central-1.aws.neon.tech")).toBe("NEON");
    expect(providerForHost("db.example.test")).toBe("POSTGRES");

    const script = readFileSync(new URL("../scripts/db-fingerprint.ts", import.meta.url), "utf8");
    const workflow = readFileSync(
      new URL("../.github/workflows/production-db-fingerprint.yml", import.meta.url),
      "utf8",
    );

    expect(script).not.toContain("console.log(rawUrl)");
    expect(script).not.toContain("console.log(process.env.DB_FINGERPRINT_DATABASE_URL)");
    expect(script).toContain("targetIdentityFingerprint: targetIdentity");
    expect(script).toContain("fingerprint: sha256(stableJson(fingerprintInput))");
    expect(workflow).not.toContain("echo ${DB_FINGERPRINT_DATABASE_URL}");
  });

  it("uses the canonical field and rejects missing output in the workflow", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/production-db-fingerprint.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("report.targetIdentityFingerprint");
    expect(workflow).toContain("^[0-9a-f]{64}$");
    expect(workflow).toContain("targetIdentityFingerprint missing from db fingerprint report");
    expect(workflow).toContain("printf 'targetIdentityFingerprint=%s\\n'");
  });
});
