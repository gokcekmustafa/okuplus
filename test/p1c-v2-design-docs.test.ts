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
const handoff = readFileSync(
  new URL("../docs/P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN.md", import.meta.url),
  "utf8",
);
const targetPopulation = readFileSync(
  new URL("../docs/P1C_V2_TARGET_POPULATION_DECISION_V1_DESIGN.md", import.meta.url),
  "utf8",
);
const handoffV2 = readFileSync(
  new URL("../docs/P1C_V2_EXTERNAL_EXPERT_HANDOFF_V2_DESIGN.md", import.meta.url),
  "utf8",
);
const reviewV21 = readFileSync(
  new URL("../docs/P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_1_DESIGN.md", import.meta.url),
  "utf8",
);
const pilotV21 = readFileSync(
  new URL("../docs/P1C_EVIDENCE_RELATION_PILOT_V2_1_DESIGN.md", import.meta.url),
  "utf8",
);

const sourceCommit = "573d22aa03ae5957588dbf0581f96695f70a88c5";
const sourcePath = "docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md";
const currentSourceCommit = "f1c8ab90ceec29a4cc129b406d4ab961d6548e31";

describe("P1-C V2 design-only documentation", () => {
  const itemBlocks = [
    ...`${pool}\n## END`.matchAll(
      /^### (V2C-(?:INF|EVF|REL)-\d{2})[\s\S]*?(?=^### V2C-|^## END)/gmu,
    ),
  ];

  it("contains a commit-pinned external expert handoff for all 12 candidate tasks", () => {
    expect(handoff).toContain(sourceCommit);
    expect(handoff).toContain("P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN");

    const sourceUrl = `https://github.com/gokcekmustafa/okuplus/blob/${sourceCommit}/${sourcePath}`;
    expect(handoff).toContain(sourceUrl);

    const taskIds = [
      "V2C-INF-01",
      "V2C-INF-02",
      "V2C-INF-03",
      "V2C-INF-04",
      "V2C-EVF-01",
      "V2C-EVF-02",
      "V2C-EVF-03",
      "V2C-EVF-04",
      "V2C-REL-01",
      "V2C-REL-02",
      "V2C-REL-03",
      "V2C-REL-04",
    ];

    for (const taskId of taskIds) {
      expect(handoff, `${taskId} handoff coverage`).toContain(`[${taskId}`);
      expect(handoff, `${taskId} pinned source`).toMatch(
        new RegExp(
          `\\[${taskId}[^\\n]*\\]\\(${sourceUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\)`,
          "u",
        ),
      );
    }
  });

  it("keeps product-owner fields blank and separates the three decision gates", () => {
    expect(handoff).toContain("Hedef yaş / sınıf aralığı");
    expect(handoff).toContain("Türkçe okuma profili");
    expect(handoff).toContain("**DOLDURULMADI**");
    expect(handoff).toContain("Kapı 1 — Uzman incelemesi");
    expect(handoff).toContain("Kapı 2 — Pilot hazırlığı ve pilot");
    expect(handoff).toContain("Kapı 3 — Kalibrasyon ve release");
    expect(handoff).toContain("Uzman onayı, pilot tamamlanma kararı");
    expect(handoff).toContain("yalnızca doküman bütünlüğünü");
  });

  it("covers separate dimensions and the four limited-support relation items", () => {
    for (const dimension of ["INFERENCE", "EVIDENCE_FINDING", "EVIDENCE_RELATION"]) {
      expect(handoff, `${dimension} handoff guidance`).toContain(`\`${dimension}\``);
    }

    for (const taskId of ["V2C-REL-01", "V2C-REL-02", "V2C-REL-03", "V2C-REL-04"]) {
      expect(handoff, `${taskId} limited support review`).toContain(taskId);
      expect(handoff, `${taskId} limited support target`).toContain("`LIMITED_SUPPORT`");
    }
  });

  it("keeps the target population decision open and records the two pilot groups safely", () => {
    expect(targetPopulation).toContain("P1C_V2_TARGET_POPULATION_DECISION_V1_DESIGN");
    expect(targetPopulation).toContain("Hedef sınıf aralığı:** Henüz belirlenmedi");
    expect(targetPopulation).toContain("PENDING_EXPERT_RECOMMENDATION");
    expect(targetPopulation).toContain("Genel öğrenci kitlesi");
    expect(targetPopulation).toContain("Okuma becerisini geliştirmeye ihtiyaç duyan öğrenciler");
    expect(targetPopulation).toMatch(/P1-C V2.*yanıt|P1-C cevap/iu);
    expect(targetPopulation).toContain("WPM");
    expect(targetPopulation).toContain("örneklem büyüklüğü");
    expect(targetPopulation).toContain("yaş/sınıf etkisi ile öğrenci grubu etkisi");
  });

  it("keeps the new v2.1 documents distinct and versioned", () => {
    expect(handoffV2).toContain("P1C_V2_EXTERNAL_EXPERT_HANDOFF_V2_DESIGN");
    expect(reviewV21).toContain("P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_1_DESIGN");
    expect(pilotV21).toContain("P1C_EVIDENCE_RELATION_PILOT_V2_1_DESIGN");
    expect(handoffV2).toContain(currentSourceCommit);
    expect(reviewV21).toContain(currentSourceCommit);
    expect(pilotV21).toContain(currentSourceCommit);
    expect(handoffV2).toContain("P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN");
    expect(reviewV21).toContain("önceki `P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_DESIGN`");
    expect(pilotV21).toContain("P1C_EVIDENCE_RELATION_PILOT_V2_1_DESIGN");
  });

  it("pins all 12 tasks in the new handoff and keeps review gates separate", () => {
    const sourceUrl = `https://github.com/gokcekmustafa/okuplus/blob/${currentSourceCommit}/${sourcePath}`;
    const taskIds = [
      "V2C-INF-01",
      "V2C-INF-02",
      "V2C-INF-03",
      "V2C-INF-04",
      "V2C-EVF-01",
      "V2C-EVF-02",
      "V2C-EVF-03",
      "V2C-EVF-04",
      "V2C-REL-01",
      "V2C-REL-02",
      "V2C-REL-03",
      "V2C-REL-04",
    ];

    for (const taskId of taskIds) {
      expect(handoffV2, `${taskId} v2 coverage`).toContain(`[${taskId}`);
      expect(
        handoffV2.split("\n").find((line) => line.includes(`[${taskId}`)),
        `${taskId} pinned source`,
      ).toContain(sourceUrl);
    }

    for (const document of [handoffV2, reviewV21, pilotV21]) {
      expect(document).toContain("Kapı 1");
      expect(document).toContain("Kapı 2");
      expect(document).toContain("Kapı 3");
      expect(document).toContain("NOT_CALIBRATED");
      expect(document).toContain("productionAssignmentEnabled=false");
      expect(document).toContain("reviewRequired=true");
      expect(document).toContain("resultLevelId=null");
    }
  });

  it("keeps independent group definition, age stratification, and non-academic test scope explicit", () => {
    for (const document of [handoffV2, reviewV21, pilotV21]) {
      expect(document).toMatch(/P1-C.*(?:cevap|yanıt)/isu);
      expect(document).toContain("WPM");
      expect(document).toContain("Antrenman");
      expect(document).toContain("yaş/sınıf");
      expect(document).toContain("DOLDURULMADI");
    }

    expect(handoffV2).toContain("yalnız doküman bütünlüğünü doğrular");
    expect(pilotV21).toContain("Örneklem büyüklüğü");
    expect(reviewV21).toContain("AGE_GRADE");
  });

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
