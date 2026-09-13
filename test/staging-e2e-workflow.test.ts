import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-e2e.yml", import.meta.url),
  "utf8",
);

describe("staging authenticated E2E workflow contract", () => {
  it("is manual-only and binds staging credentials in the executing job", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:\s*\n/u);
    expect(workflow).toContain("BASE_URL: ${{ vars.BASE_URL }}");
    expect(workflow).toContain("STAGING_STUDENT_EMAIL: ${{ vars.STAGING_STUDENT_EMAIL }}");
    expect(workflow).toContain("STAGING_STUDENT_PASSWORD: ${{ secrets.STAGING_STUDENT_PASSWORD }}");
    expect(workflow).toContain("STAGING_E2E_PREMIUM_EMAIL: ${{ vars.STAGING_STUDENT_EMAIL }}");
    expect(workflow).toContain(
      "!/^okuplus-[a-z0-9-]+-gokcekmustafas-projects\\.vercel\\.app$/u.test(url.hostname)",
    );
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
  });

  it("uses the supported scripts, health gate, and sanitized output only", () => {
    expect(workflow).toContain("npm ci --include=dev");
    expect(workflow).toContain("npx tsx scripts/provision-staging-release-0-5-e2e.ts");
    expect(workflow).toContain("npx tsx scripts/browser-student-full-e2e.ts");
    expect(workflow).toContain("/health /health/db /ready");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("staging-e2e-summary.json");
    expect(workflow).toContain('error: typeof result.message === "string"');
    expect(workflow).toContain("node --input-type=module <<'NODE' >> \"$GITHUB_STEP_SUMMARY\"");
    expect(workflow).toContain("consoleErrors: result.consoleErrors ?? 0");
    expect(workflow).toContain("networkErrors: result.networkErrors ?? 0");
    expect(workflow).toContain("duplicateAnswerRequests: result.duplicateAnswerRequests ?? 0");
    expect(workflow).not.toContain("prisma migrate");
    expect(workflow).not.toContain("vercel deploy");
    expect(workflow).not.toContain("vercel pull");
    expect(workflow).not.toContain("set -x");
  });
});
