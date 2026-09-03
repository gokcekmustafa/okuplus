import { describe, expect, it } from "vitest";
import {
  classifyCatalogRecord,
  isTestFixtureCatalogRecord,
} from "../src/curriculum/catalog-validation.js";
import { FIRST_REAL_CURRICULUM_PACK } from "../src/curriculum/first-real-pack.js";
import { runFirstRealPackQa } from "../src/curriculum/first-real-pack-qa.js";

describe("8G-9 first-real curriculum pack QA", () => {
  it("manifest ve metin standardını karşılar", () => {
    const result = runFirstRealPackQa();

    expect(result.errors).toEqual([]);
    expect(result.metrics.contentCount).toBe(9);
    expect(result.metrics.questionCount).toBe(36);
    expect(result.metrics.sourceCount).toBe(7);
    expect(Object.values(result.metrics.contentWordCounts)).toEqual(
      expect.arrayContaining([124, 126, 132, 138, 138, 141, 142, 143, 149]),
    );
  });

  it("soru tipleri, doğru cevap sözleşmesi ve kanıt bağını karşılar", () => {
    const result = runFirstRealPackQa();

    expect(result.metrics.questionTypeCounts).toEqual({
      MULTIPLE_CHOICE: 27,
      TRUE_FALSE: 9,
    });
    expect(result.metrics.trackContentCounts).toEqual({
      "main-idea": 3,
      detail: 3,
      inference: 3,
    });
    expect(result.metrics.cognitiveDemandCounts).toEqual({
      UNDERSTAND: 11,
      RECALL: 14,
      INFER: 11,
    });
    expect(result.metrics.mcCorrectPositionCounts).toEqual({ a: 7, b: 7, c: 6, d: 7 });
    expect(result.metrics.mcMaxPositionRatio).toBeLessThanOrEqual(0.45);
  });

  it("fixture katalogu production candidate olarak sınıflandıramaz", () => {
    expect(FIRST_REAL_CURRICULUM_PACK.catalog).toEqual({
      kind: "PRODUCTION_CANDIDATE",
      levelCodeEnv: "CURRICULUM_PACK_LEVEL_CODE",
      skillCodesEnv: "CURRICULUM_PACK_SKILL_CODES",
      requireNonFixtureRecords: true,
    });
    const fixture = {
      id: "exux-level-stable-test-fixture",
      code: "E2E-A1",
      name: "Başlangıç",
    };
    expect(isTestFixtureCatalogRecord(fixture)).toBe(true);
    expect(classifyCatalogRecord(fixture)).toBe("TEST_FIXTURE");
  });
});
