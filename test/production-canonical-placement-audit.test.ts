import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditScript = readFileSync(
  new URL("../scripts/audit-canonical-placement-production.ts", import.meta.url),
  "utf8",
);

describe("protected canonical placement audit", () => {
  it("resolves production Skill ids before planning the read-only graph audit", () => {
    expect(auditScript).toContain("readCanonicalPlacementSkillRefs");
    expect(auditScript).toContain("buildCanonicalPlacementAssessmentGraph(undefined, skillRefs)");
    expect(auditScript).not.toContain("const graph = buildCanonicalPlacementAssessmentGraph();");
  });
});
