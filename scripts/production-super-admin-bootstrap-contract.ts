import {
  assertTargetIdentityFingerprint,
  targetIdentityFingerprint,
} from "../src/lib/db-fingerprint-contract.js";

export const PRODUCTION_SUPER_ADMIN_BOOTSTRAP_CONFIRMATION = "BOOTSTRAP_PRODUCTION_SUPER_ADMIN";

export type ApprovedProductionTarget = {
  provider: string;
  host: string;
  port: string;
  database: string;
  user: string;
  fingerprint: string;
};

export type ActualProductionTarget = {
  provider: "NEON" | "POSTGRES";
  host: string;
  port: string;
  database: string;
  user: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function assertBootstrapEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) {
    throw new Error("bootstrap email geçersiz");
  }
  return email;
}

export function assertProductionTargetIdentity(
  actual: ActualProductionTarget,
  approved: ApprovedProductionTarget,
): string {
  const comparisons: Array<[string, string, string]> = [
    ["provider", actual.provider, approved.provider],
    [
      "host",
      actual.host.toLowerCase().replace(/\.$/u, ""),
      approved.host.toLowerCase().replace(/\.$/u, ""),
    ],
    ["port", actual.port, approved.port],
    ["database", actual.database, approved.database],
    ["user", actual.user, approved.user],
  ];

  for (const [field, actualValue, approvedValue] of comparisons) {
    if (actualValue !== approvedValue) {
      throw new Error(`production target ${field} mismatch`);
    }
  }

  const fingerprint = targetIdentityFingerprint({
    environment: "PRODUCTION",
    provider: actual.provider,
    host: actual.host,
    port: actual.port,
    database: actual.database,
    dbUser: actual.user,
  });
  assertTargetIdentityFingerprint(approved.fingerprint);
  if (fingerprint !== approved.fingerprint) {
    throw new Error("production target fingerprint mismatch");
  }
  return fingerprint;
}
