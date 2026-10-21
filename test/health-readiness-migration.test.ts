import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261021170000_add_readiness_migration_status_function/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const healthRoutes = readFileSync(
  new URL("../src/modules/health/routes.ts", import.meta.url),
  "utf8",
);

describe("readiness migration status function security contract", () => {
  it("uses a fixed search path and returns only the incomplete-migration boolean", () => {
    expect(migration).toMatch(/SECURITY DEFINER/iu);
    expect(migration).toMatch(/SET search_path = pg_catalog/iu);
    expect(migration).toContain('FROM public."_prisma_migrations" AS migration');
    expect(migration).toContain('migration."finished_at" IS NULL');
    expect(migration).toContain('migration."rolled_back_at" IS NULL');
    expect(migration).toMatch(/RETURNS boolean/iu);
    expect(migration).not.toMatch(/RETURNS\s+TABLE|RETURNS\s+SETOF/iu);
  });

  it("revokes PUBLIC access and does not guess an application role", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.readiness_has_incomplete_migrations\(\) FROM PUBLIC/iu,
    );
    expect(migration).not.toMatch(/^\s*GRANT\s/imu);
  });

  it("uses the narrow function and fails closed when its result is missing", () => {
    expect(healthRoutes).toContain(
      "SELECT public.readiness_has_incomplete_migrations() AS has_incomplete_migrations",
    );
    expect(healthRoutes).toContain(
      'typeof migrationRows[0]?.has_incomplete_migrations !== "boolean"',
    );
    expect(healthRoutes).toContain('FROM public."_prisma_migrations"');
    expect(healthRoutes).toContain('prismaError.meta?.code === "42883"');
    expect(healthRoutes.indexOf("readiness_has_incomplete_migrations")).toBeLessThan(
      healthRoutes.indexOf('FROM public."_prisma_migrations"'),
    );
  });
});
