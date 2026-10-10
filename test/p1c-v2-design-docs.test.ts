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
  const itemBlocks = [
    ...`${pool}\n## END`.matchAll(
      /^### (V2C-(?:INF|EVF|REL)-\d{2})[\s\S]*?(?=^### V2C-|^## END)/gmu,
    ),
  ];

  it("contains four distinct candidate tasks for each C dimension", () => {
    const ids = itemBlocks.map((match) => match[1]);

    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(ids.filter((id) => id.startsWith("V2C-INF-")).length).toBe(4);
    expect(ids.filter((id) => id.startsWith("V2C-EVF-")).length).toBe(4);
    expect(ids.filter((id) => id.startsWith("V2C-REL-")).length).toBe(4);
  });

  it("gives every inference item four unique options and a valid answer key", () => {
    const inferenceBlocks = itemBlocks.filter((match) => match[1].startsWith("V2C-INF-"));

    for (const [block, id] of inferenceBlocks) {
      const optionIds = [...block.matchAll(/`(V2C-INF-\d{2}-OPT-[A-D])`:/gu)].map(
        (match) => match[1],
      );
      const answerKey = block.match(/\*\*Cevap anahtarı:\*\* `(V2C-INF-\d{2}-OPT-[A-D])`/u)?.[1];

      expect(optionIds, `${id} options`).toHaveLength(4);
      expect(new Set(optionIds).size, `${id} unique options`).toBe(4);
      expect(answerKey, `${id} answer key`).toBeDefined();
      expect(optionIds, `${id} answer key target`).toContain(answerKey);
    }
  });

  it("keeps evidence and version references on every candidate task", () => {
    for (const [block, id] of itemBlocks) {
      expect(block, `${id} passage version`).toMatch(/P1C-V2-TXT-\d{2}@1\.0/u);
      expect(block, `${id} design version`).toContain("Tasarım/sürüm referansı");
      expect(block, `${id} mapping version`).toContain("P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN");
      expect(block, `${id} scoring`).toContain("**Puanlama:**");
      expect(block, `${id} evidence`).toMatch(/Destekleyici kanıt|Metin\/spanlar|Aday kanıtlar/u);
    }
  });

  it("keeps evidence selection and relation reasoning as separate design fields", () => {
    expect(pool).toContain("evidenceCandidateId");
    expect(pool).toContain("relationType");
    expect(review).toContain(
      "Evidence selection ve relation reasoning ayrı alanlarda saklanmalıdır",
    );
    expect(pool).toContain("Aynı response'un yeniden etiketlenmesi");
    expect(pool).toContain("PARTIAL_REVIEW");
    expect(pool).toContain("PARTIAL_REVIEW` ve `REVIEW_REQUIRED` ayrımı");
  });

  it("keeps the four relation candidates on limited support without claiming calibration", () => {
    for (const [block, id] of itemBlocks.filter((item) => item[1].startsWith("V2C-REL-"))) {
      expect(block, `${id} relation target`).toContain("`LIMITED_SUPPORT`");
    }

    expect(pool).toContain("doğrulanmış bir ölçme aracı");
    expect(pool).toContain("PENDING_EXPERT_DECISION");
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
