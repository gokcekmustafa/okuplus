import type { CatalogTarget } from "../src/curriculum/catalog-target-verification.js";

export const ISOLATED_FIRST_REAL_PACK_TEST_DATABASE = "oku_plus_8g8_isolated_test";
export const SECURITY_REMEDIATION_TEST_DATABASE = "oku_plus_8g8_security_test_a";

export const ISOLATED_FIRST_REAL_PACK_TEST_DATABASES = new Set([
  ISOLATED_FIRST_REAL_PACK_TEST_DATABASE,
  SECURITY_REMEDIATION_TEST_DATABASE,
]);

const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertIsolatedFirstRealPackTestTarget(
  target: Pick<CatalogTarget, "environment" | "provider" | "host" | "port" | "database">,
): void {
  if (
    target.environment !== "TEST" ||
    target.provider !== "POSTGRES" ||
    !LOCAL_TEST_HOSTS.has(target.host) ||
    target.port !== "5432" ||
    !ISOLATED_FIRST_REAL_PACK_TEST_DATABASES.has(target.database)
  ) {
    throw new Error(
      `isolated First Real Pack TEST hedefi reddedildi: yalnızca local PostgreSQL 127.0.0.1:5432 üzerinde tanımlı exact test database adları kabul edilir`,
    );
  }
}
