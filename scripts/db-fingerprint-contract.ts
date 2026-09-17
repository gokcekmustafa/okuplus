import { createHash } from "node:crypto";

export type FingerprintEnvironment = "LOCAL" | "TEST" | "STAGING" | "PRODUCTION";
export type FingerprintProvider = "NEON" | "POSTGRES";

export type TargetIdentityFingerprintInput = {
  environment: FingerprintEnvironment;
  provider: FingerprintProvider;
  host: string;
  port: string;
  database: string;
  dbUser: string;
};

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/u, "");
}

export function providerForHost(host: string): FingerprintProvider {
  return /(?:^|\.)neon\.tech$/iu.test(normalizeHost(host)) ? "NEON" : "POSTGRES";
}

/**
 * Stable target identity only. This deliberately excludes schema, migration,
 * and server-version state; those remain part of the existing `fingerprint`.
 */
export function targetIdentityFingerprint(input: TargetIdentityFingerprintInput): string {
  const canonicalIdentity = [
    "oku-catalog-target-v1",
    input.environment,
    input.provider,
    normalizeHost(input.host),
    input.port,
    input.database,
    input.dbUser,
  ].join("\n");

  return createHash("sha256").update(canonicalIdentity, "utf8").digest("hex");
}

export function assertTargetIdentityFingerprint(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("targetIdentityFingerprint 64 karakterlik lowercase SHA-256 olmalıdır");
  }
  return value;
}
