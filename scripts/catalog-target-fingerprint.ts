import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  targetFingerprint,
  type CatalogDbIdentity,
} from "../src/curriculum/catalog-target-verification.js";

function fail(message: string): never {
  throw new Error(`catalog target fingerprint reddedildi: ${message}`);
}

async function main(): Promise<void> {
  const rawUrl = process.env.CANONICAL_CATALOG_DATABASE_URL?.trim();
  if (!rawUrl) fail("CANONICAL_CATALOG_DATABASE_URL verilmedi; DATABASE_URL fallback'i yok");

  const environment = process.env.CANONICAL_CATALOG_ENVIRONMENT?.trim().toUpperCase();
  if (environment !== "STAGING") {
    fail("bu komut yalnızca explicit STAGING environment'ında çalışır");
  }

  let target: ReturnType<typeof parseCatalogTargetUrl>;
  try {
    target = parseCatalogTargetUrl(rawUrl, "STAGING");
    assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const expectedDatabase = process.env.CANONICAL_CATALOG_EXPECTED_DATABASE?.trim();
  if (!expectedDatabase) fail("CANONICAL_CATALOG_EXPECTED_DATABASE verilmedi");
  if (target.database !== expectedDatabase) {
    fail(
      `URL database ile beklenen database eşleşmiyor: ${target.database} !== ${expectedDatabase}`,
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw<CatalogDbIdentity[]>`
      SELECT current_database() AS database, current_user AS db_user
    `;
    const identity = rows[0];
    if (!identity) fail("database identity okunamadı");
    try {
      assertLiveCatalogTargetIdentity(target, identity);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }

    const fingerprint = targetFingerprint(target, identity);
    const password = decodeURIComponent(new URL(rawUrl).password);
    const secretFree = password.length === 0 || !fingerprint.includes(password);
    if (!secretFree) fail("fingerprint içinde password bulundu");

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          target: {
            environment: target.environment,
            provider: target.provider,
            endpointHost: target.host,
            endpointPort: target.port,
            expectedDatabase: target.database,
          },
          databaseIdentity: {
            currentDatabase: identity.database,
            currentUser: identity.db_user,
          },
          approvedFingerprint: fingerprint,
          secretFree,
          dbChanged: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    `catalog target fingerprint FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
