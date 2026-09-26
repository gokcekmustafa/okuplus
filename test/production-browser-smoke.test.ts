import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-browser-smoke.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/run-production-browser-smoke.ts", import.meta.url),
  "utf8",
);

describe("production browser smoke safety contract", () => {
  it("is manually triggered and protected by production-smoke", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:\s*\n/u);
    expect(workflow).toContain("environment: production-smoke");
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
    expect(workflow).toContain("PRODUCTION_SMOKE_EMAIL: ${{ secrets.PRODUCTION_SMOKE_EMAIL }}");
    expect(workflow).toContain(
      "PRODUCTION_SMOKE_PASSWORD: ${{ secrets.PRODUCTION_SMOKE_PASSWORD }}",
    );
  });

  it("allows only login/logout writes and canonical production hosts", () => {
    expect(script).toContain('"https://okuplus.vercel.app"');
    expect(script).toContain('"https://www.okuplus.online"');
    expect(script).toContain('url.pathname === "/auth/login" || url.pathname === "/auth/logout"');
    expect(script).toContain('"/student/today"');
    expect(script).toContain('"/student/progress"');
    expect(script).toContain('"/student/history?page=1&pageSize=5"');
    expect(script).toContain('productionStateChanged: "NO"');
    expect(script).toContain("pageErrorMessages");
    expect(script).toContain("sanitizePageError");
    expect(script).not.toContain("/student/questions/");
    expect(script).not.toContain("/complete");
    expect(script).not.toContain("prisma");
    expect(script).not.toContain("DATABASE_URL");
  });
});
