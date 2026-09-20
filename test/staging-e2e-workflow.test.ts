import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/staging-e2e.yml", import.meta.url),
  "utf8",
);
const closureRunner = readFileSync(
  new URL("../scripts/browser-staging-pilot-closure.ts", import.meta.url),
  "utf8",
);
const pilotSmokeWorkflow = readFileSync(
  new URL("../.github/workflows/staging-pilot-smoke.yml", import.meta.url),
  "utf8",
);
const pilotSmokeRunner = readFileSync(
  new URL("../scripts/browser-staging-pilot-smoke.ts", import.meta.url),
  "utf8",
);

describe("staging authenticated E2E workflow contract", () => {
  it("is manual-only and binds staging credentials in the executing job", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(workflow).toContain("student_email:");
    expect(workflow).toContain("BASE_URL: ${{ vars.BASE_URL }}");
    expect(workflow).toContain(
      "STAGING_STUDENT_EMAIL: ${{ inputs.student_email || vars.STAGING_STUDENT_EMAIL }}",
    );
    expect(workflow).toContain("STAGING_STUDENT_PASSWORD: ${{ secrets.STAGING_STUDENT_PASSWORD }}");
    expect(workflow).not.toContain("staging synthetic entitlement identity is not aligned");
    expect(workflow).not.toContain("STAGING_E2E_PREMIUM_EMAIL: ${{ vars.STAGING_STUDENT_EMAIL }}");
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
    expect(workflow).toContain("npx tsx scripts/browser-staging-pilot-closure.ts");
    expect(workflow).toContain("/health /health/db /ready");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("staging-e2e-summary.json");
    expect(workflow).toContain('error: typeof result.message === "string"');
    expect(workflow).toContain(
      'const result = parseJson(raw) ?? parseJson(errorOutput) ?? { status: "FAIL" };',
    );
    expect(workflow).toContain(
      'const errorOutput = readFileSync(".e2e-output/e2e.stderr", "utf8");',
    );
    expect(workflow).toContain('const rootStart = text.lastIndexOf("\\n{\\n");');
    expect(workflow).toContain("if (safe.error) console.log(`e2e.error=${safe.error}`);");
    expect(workflow).toContain("staging-provision-summary.json");
    expect(workflow).toContain("::error title=Staging provisioner failure::${diagnostic}");
    expect(workflow).toContain(
      "provisioning=${summary.status} account=${summary.account} error=${summary.error}",
    );
    expect(workflow).toContain("node --input-type=module <<'NODE' >> \"$GITHUB_STEP_SUMMARY\"");
    expect(workflow).toContain("consoleErrors: result.consoleErrors ?? 0");
    expect(workflow).toContain("networkErrors: result.networkErrors ?? 0");
    expect(workflow).toContain("duplicateAnswerRequests: result.duplicateAnswerRequests ?? 0");
    expect(workflow).toContain('teaching: result.teaching ?? "NOT_RUN"');
    expect(workflow).toContain('baseline: result.baseline ?? "NOT_RUN"');
    expect(workflow).toContain('concurrency: result.concurrency ?? "NOT_RUN"');
    expect(workflow).toContain("Verify E2E secret redaction");
    expect(workflow).toContain("secret-redaction=PASS");
    expect(workflow).not.toContain("E2E_ARTIFACT_DIR");
    expect(workflow).not.toContain("e2e-failure.png");
    expect(workflow).toContain("pilot-closure-summary.json");
    expect(workflow).toContain("if-no-files-found: warn");
    expect(workflow).not.toContain("prisma migrate");
    expect(workflow).not.toContain("vercel deploy");
    expect(workflow).not.toContain("vercel pull");
    expect(workflow).not.toContain("set -x");
  });

  it("uses unique login fields in the closure browser smoke", () => {
    expect(closureRunner).toContain('page.locator("#login-email").fill(EMAIL)');
    expect(closureRunner).toContain('page.locator("#login-password").fill(PASSWORD)');
    expect(closureRunner).not.toContain('getByLabel("E-posta"');
    expect(closureRunner).not.toContain('getByLabel("Şifre"');
    expect(closureRunner).not.toContain("console.log(PASSWORD");
  });

  it("defines a staging push/manual fast smoke without provisioning or Full E2E", () => {
    expect(pilotSmokeWorkflow).toMatch(/on:\s*\n\s+workflow_dispatch:/u);
    expect(pilotSmokeWorkflow).toMatch(/push:\s*\n\s+branches:\s*\n\s+- staging/u);
    expect(pilotSmokeWorkflow).toContain("if: github.ref == 'refs/heads/staging'");
    expect(pilotSmokeWorkflow).toContain("ref: staging");
    expect(pilotSmokeWorkflow).toContain(
      "BASE_URL: https://okuplus-git-staging-gokcekmustafas-projects.vercel.app",
    );
    expect(pilotSmokeWorkflow).toContain(
      "STAGING_STUDENT_PASSWORD: ${{ secrets.STAGING_STUDENT_PASSWORD }}",
    );
    expect(pilotSmokeWorkflow).toContain("npx tsx scripts/browser-staging-pilot-smoke.ts");
    expect(pilotSmokeWorkflow).not.toContain("browser-student-full-e2e.ts");
    expect(pilotSmokeWorkflow).not.toContain("browser-staging-pilot-closure.ts");
    expect(pilotSmokeWorkflow).not.toContain("provision-staging-release-0-5-e2e.ts");
    expect(pilotSmokeWorkflow).not.toMatch(/^\s+pull_request:/mu);
    expect(pilotSmokeWorkflow).toContain("Fail closed outside stable staging");
    expect(pilotSmokeWorkflow).not.toContain("secrets.PRODUCTION");
    expect(pilotSmokeWorkflow).not.toContain("set -x");
    expect(pilotSmokeWorkflow).not.toMatch(/vercel\s+(deploy|pull|alias)/u);
    expect(pilotSmokeWorkflow).not.toContain("prisma migrate");
    expect(pilotSmokeWorkflow).toContain("secret-redaction=PASS");
    expect(pilotSmokeWorkflow).toContain("timeout-minutes: 3");
    expect(pilotSmokeWorkflow).toContain("--ignore-scripts --prefer-offline");
    expect(pilotSmokeWorkflow).toContain("healthDurationSeconds");
    expect(pilotSmokeWorkflow).toContain("slowStages");
    expect(pilotSmokeWorkflow).not.toMatch(/screenshot|trace|video/iu);
  });

  it("covers the fast smoke contract and keeps credentials out of diagnostics", () => {
    for (const marker of [
      "/health",
      "/health/db",
      "/ready",
      "/auth/me",
      "#today-card",
      "start-daily-training",
      "exercise-submit-attempt",
      "answerFeedback",
      "student-bottom-nav",
      "data-bottom-page",
      "pilot-report-category",
      "pilot-report-message",
      "pilot-report-submit",
      "pilot-support-open",
      "pilot-bug-open",
      "320",
      "375",
      "430",
      "duplicateAnswerRequests",
      'productionTouched: "NO"',
      "stepDurations",
      "slowStages",
      "performanceWarnings",
      "failedStage",
      "currentRoute",
      "errorType",
    ]) {
      expect(pilotSmokeWorkflow + pilotSmokeRunner + closureRunner).toContain(marker);
    }
    expect(pilotSmokeRunner).not.toContain("console.log(PASSWORD");
    expect(pilotSmokeRunner).not.toMatch(/page\.screenshot|\.tracing|recordVideo/iu);
    expect(pilotSmokeRunner).toContain("STAGING_STUDENT_PASSWORD");
    expect(pilotSmokeRunner).toContain("#page-dashboard:not(.hidden)");
    expect(pilotSmokeRunner).toContain("#page-exercise:not(.hidden)");
    expect(pilotSmokeRunner).toContain('[role="radio"]');
    expect(pilotSmokeRunner).not.toContain(".check({");
    expect(pilotSmokeRunner).not.toContain(".first(");
    expect(pilotSmokeRunner).toContain("page.setViewportSize(viewport)");
    expect(pilotSmokeRunner).not.toContain("completePlacement");
    expect(pilotSmokeRunner).not.toContain("verifyTelemetryRuntime");
    expect(pilotSmokeRunner).not.toContain("page.reload");
    expect(pilotSmokeRunner).not.toContain("provision-staging-release-0-5-e2e.ts");
    expect((pilotSmokeRunner.match(/await timed\("login"/gu) ?? []).length).toBe(1);
  });
});
