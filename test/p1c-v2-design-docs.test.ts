import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pool = readFileSync(
  new URL("../docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md", import.meta.url),
  "utf8",
);
const review = readFileSync(
  new URL("../docs/P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_DESIGN.md", import.meta.url),
  "utf8",
);
const pilot = readFileSync(
  new URL("../docs/P1C_EVIDENCE_RELATION_PILOT_V2_DESIGN.md", import.meta.url),
  "utf8",
);

describe("P1-C V2 design-only documentation", () => {
  it("contains four distinct candidate tasks for each C dimension", () => {
    const ids = [...pool.matchAll(/V2C-(?:INF|EVF|REL)-\d{2}/gu)].map((match) => match[0]);

    expect(new Set(ids).size).toBe(12);
    expect(ids.filter((id) => id.startsWith("V2C-INF-")).length).toBe(4);
    expect(ids.filter((id) => id.startsWith("V2C-EVF-")).length).toBe(4);
    expect(ids.filter((id) => id.startsWith("V2C-REL-")).length).toBe(4);
  });

  it("keeps evidence selection and relation reasoning as separate design fields", () => {
    expect(pool).toContain("evidenceCandidateId");
    expect(pool).toContain("relationType");
    expect(review).toContain(
      "Evidence selection ve relation reasoning ayrı alanlarda saklanmalıdır",
    );
    expect(pool).toContain("Aynı response'un yeniden etiketlenmesi");
  });

  it("marks the pool, review form, and pilot as non-production material", () => {
    for (const document of [pool, review, pilot]) {
      expect(document).toContain("DESIGN_ONLY");
      expect(document).toContain("canonicalActive=false");
      expect(document).toContain("productionAssignmentEnabled=false");
      expect(document).toContain("reviewRequired=true");
      expect(document).toContain("resultLevelId=null");
    }

    expect(pilot).toContain(
      "Production DB'ye migration, seed, provisioning veya manuel write yapılmaz",
    );
    expect(pilot).toContain("Üretken yapay zekâ nihai akademik puan");
  });
});
