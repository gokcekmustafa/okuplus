import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p0-audit.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/audit-education-v2-p0-production.ts", import.meta.url),
  "utf8",
);

describe("production Education V2 P0 read-only audit", () => {
  it("is protected, master-only and production-scoped", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain('test "${CONFIRM_AUDIT}" = "EDUCATION_V2_P0_AUDIT"');
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).not.toContain("migrate deploy");
    expect(workflow).not.toContain("--apply");
  });

  it("only reads the database and never exposes connection secrets", () => {
    expect(script).toContain("$queryRaw");
    expect(script).toContain("findMany");
    expect(script).toContain('productionWrite: "NO"');
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("create(");
    expect(script).not.toContain("update(");
    expect(script).not.toContain("delete(");
    expect(script).not.toContain("INSERT");
    expect(script).not.toContain("UPDATE");
    expect(script).not.toContain("DELETE");
    expect(script).not.toContain("console.log(rawUrl)");
  });

  it("checks the three P0 paths and the full expected step graph", () => {
    expect(script).toContain("EDUCATION_V2_P0_FAST_READING_");
    expect(script).toContain("EDUCATION_V2_P0_READING_COMPREHENSION_");
    expect(script).toContain("EDUCATION_V2_P0_COMMON_");
    expect(script).toContain("COMMON_REINFORCEMENT");
    expect(script).toContain("COMMON_ASSESSMENT");
    expect(script).toContain("missingExpectedStableKeys");
    expect(script).toContain("invalidPublishedLinks");
  });
});
