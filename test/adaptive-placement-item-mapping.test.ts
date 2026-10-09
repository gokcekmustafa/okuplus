import { describe, expect, it } from "vitest";
import { CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST } from "../src/curriculum/canonical-placement-item-bank.js";
import {
  ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION,
  ADAPTIVE_PLACEMENT_ITEM_MAPPINGS,
  readAdaptivePlacementItemMapping,
} from "../src/curriculum/adaptive-placement-item-mapping.js";

describe("versioned adaptive placement item mapping", () => {
  it("covers every immutable v1 question id without inventing B or D evidence", () => {
    const questionIds = new Set(
      CANONICAL_PLACEMENT_ITEM_BANK_MANIFEST.questions.map((question) => question.stableQuestionId),
    );
    expect(Object.keys(ADAPTIVE_PLACEMENT_ITEM_MAPPINGS).sort()).toEqual([...questionIds].sort());
    expect(
      Object.values(ADAPTIVE_PLACEMENT_ITEM_MAPPINGS).some((mapping) =>
        mapping.dimensions.some((dimension) =>
          ["FLUENCY", "ACCURACY", "MEANING_PRESERVATION", "TRANSFER"].includes(dimension),
        ),
      ),
    ).toBe(false);
    expect(
      Object.values(ADAPTIVE_PLACEMENT_ITEM_MAPPINGS).some((mapping) =>
        mapping.dimensions.some((dimension) =>
          ["CONTEXTUAL_MEANING", "LEXICAL_RELATION", "DOMAIN_CONTEXT"].includes(dimension),
        ),
      ),
    ).toBe(false);
  });

  it("keeps evidence-relation mapping independent from inference mapping", () => {
    const inferenceOnly = readAdaptivePlacementItemMapping({
      itemBankManifestVersion: "1.0.1",
      stableQuestionId: "PLV1-Q009",
    });
    const relation = readAdaptivePlacementItemMapping({
      itemBankManifestVersion: "1.0.1",
      stableQuestionId: "PLV1-Q013",
    });

    expect(inferenceOnly?.mappingVersion).toBe(ADAPTIVE_PLACEMENT_ITEM_MAPPING_VERSION);
    expect(inferenceOnly?.dimensions).toEqual(["INFERENCE"]);
    expect(relation?.dimensions).toEqual(["EVIDENCE_RELATION"]);
  });

  it("does not apply an item mapping to another bank version", () => {
    expect(
      readAdaptivePlacementItemMapping({
        itemBankManifestVersion: "1.1.0",
        stableQuestionId: "PLV1-Q013",
      }),
    ).toBeNull();
  });
});
