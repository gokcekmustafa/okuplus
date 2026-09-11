import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-migration-forensics.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/production-migration-forensics.ts", import.meta.url),
  "utf8",
);

describe("protected production migration forensics", () => {
  it("is workflow_dispatch-only and master/protected-environment gated", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain('test "${CONFIRM_FORENSICS}" = "FORENSICS"');
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("pull_request:");
  });

  it("uses only the production secret through process environment", () => {
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("echo ${PRODUCTION_DATABASE_URL}");
    expect(workflow).not.toContain("migrate deploy");
    expect(workflow).not.toContain("migrate resolve");
    expect(workflow).not.toContain("db push");
    expect(workflow).not.toContain("migrate reset");
  });

  it("contains only read-only query access and safe output fields", () => {
    expect(script).toContain("$queryRaw");
    expect(script).not.toContain("$executeRaw");
    expect(script).not.toContain("$transaction");
    expect(script).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/u);
    expect(script).toContain("applied_steps_count");
    expect(script).toContain("safeErrorSummary");
    expect(script).toContain('productionDbWrite: "NO"');
    expect(script).not.toContain("console.log(rawUrl)");
    expect(script).not.toContain("console.log(process.env.DB_FINGERPRINT_DATABASE_URL)");
  });
});
