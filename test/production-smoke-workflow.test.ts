import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-smoke.yml", import.meta.url),
  "utf8",
);

describe("manual production smoke workflow", () => {
  it("yalnız workflow_dispatch ile tetiklenir", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s+push:/mu);
    expect(workflow).not.toMatch(/^\s+pull_request:/mu);
  });

  it("production environment protection ve manual confirmation kullanır", () => {
    expect(workflow).toContain("environment: production-smoke");
    expect(workflow).toContain("confirm_create:");
    expect(workflow).toContain("PRODUCTION_SMOKE_CONFIRM: ${{ inputs.confirm_create }}");
  });

  it("credential'ları GitHub secret/variable context'inden alır", () => {
    expect(workflow).toContain(
      "PRODUCTION_SMOKE_PASSWORD: ${{ secrets.PRODUCTION_SMOKE_PASSWORD }}",
    );
    expect(workflow).toContain("PRODUCTION_SMOKE_EMAIL: ${{ vars.PRODUCTION_SMOKE_EMAIL }}");
  });

  it("deploy veya direct DB provisioning komutu içermez", () => {
    expect(workflow).not.toMatch(/vercel\s+(deploy|--prod)/iu);
    expect(workflow).not.toMatch(/prisma\s+(migrate|db\s+push|db\s+execute)/iu);
    expect(workflow).toContain("--apply");
    expect(workflow).toContain("run-production-auth-smoke.ts");
  });
});
