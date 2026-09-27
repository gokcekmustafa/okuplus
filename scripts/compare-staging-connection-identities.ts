import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  assertSameCatalogDatabaseTarget,
  parseCatalogTargetUrl,
  type CatalogDbIdentity,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";

const REQUIRED_ENVIRONMENT = "STAGING" as const;

type ConnectionCheck = {
  name: string;
  targetMatchesApprovedDatabase: boolean;
  identityMatchesUrl: boolean;
  status: "MATCH" | "MISMATCH" | "UNVERIFIED";
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} gerekli`);
  return value;
}

function safeTarget(rawUrl: string): CatalogTarget {
  const target = parseCatalogTargetUrl(rawUrl, REQUIRED_ENVIRONMENT);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  if (target.provider !== "NEON") throw new Error("staging hedefi Neon olmalı");
  return target;
}

async function readIdentity(url: string): Promise<CatalogDbIdentity> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await client.$queryRaw<Array<CatalogDbIdentity>>`
      SELECT current_database() AS database, current_user AS db_user
    `;
    const identity = rows[0];
    if (!identity) throw new Error("database identity okunamadı");
    return identity;
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  const approvedUrl = required("DB_FINGERPRINT_DATABASE_URL");
  const approvedFingerprint = required("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT");
  const candidates = [
    { name: "DATABASE_URL", url: required("DATABASE_URL") },
    { name: "EDUCATION_V2_P0_DATABASE_URL", url: required("EDUCATION_V2_P0_DATABASE_URL") },
  ];

  const approvedTarget = safeTarget(approvedUrl);
  const approvedIdentity = await readIdentity(approvedUrl);
  assertLiveCatalogTargetIdentity(approvedTarget, approvedIdentity);
  assertApprovedTargetFingerprint(approvedTarget, approvedIdentity, approvedFingerprint);

  const checks: ConnectionCheck[] = [];
  for (const candidate of candidates) {
    const target = safeTarget(candidate.url);
    const identity = await readIdentity(candidate.url);
    let targetMatchesApprovedDatabase = false;
    let identityMatchesUrl = false;
    try {
      assertSameCatalogDatabaseTarget(approvedTarget, target);
      targetMatchesApprovedDatabase = true;
    } catch {
      // The sanitized result records the mismatch without exposing target data.
    }
    try {
      assertLiveCatalogTargetIdentity(target, identity);
      identityMatchesUrl = true;
    } catch {
      // The sanitized result records the mismatch without exposing target data.
    }
    checks.push({
      name: candidate.name,
      targetMatchesApprovedDatabase,
      identityMatchesUrl,
      status: targetMatchesApprovedDatabase && identityMatchesUrl ? "MATCH" : "MISMATCH",
    });
  }

  const status = checks.every((check) => check.status === "MATCH") ? "PASS" : "MISMATCH";
  console.log(
    JSON.stringify(
      {
        status,
        environment: REQUIRED_ENVIRONMENT,
        approvedControl: "PASS",
        connections: checks,
        productionWrite: "NO",
      },
      null,
      2,
    ),
  );
  if (status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
