import type { CatalogTarget } from "../src/curriculum/catalog-target-verification.js";

export const ISOLATED_FIRST_REAL_PACK_TEST_DATABASE = "oku_plus_8g8_isolated_test";

const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertIsolatedFirstRealPackTestTarget(
  target: Pick<CatalogTarget, "environment" | "provider" | "host" | "port" | "database">,
): void {
  if (
    target.environment !== "TEST" ||
    target.provider !== "POSTGRES" ||
    !LOCAL_TEST_HOSTS.has(target.host) ||
    target.port !== "5432" ||
    target.database !== ISOLATED_FIRST_REAL_PACK_TEST_DATABASE
  ) {
    throw new Error(
      `isolated First Real Pack TEST hedefi reddedildi: yalnızca local PostgreSQL 127.0.0.1:5432/${ISOLATED_FIRST_REAL_PACK_TEST_DATABASE} kabul edilir`,
    );
  }
}
