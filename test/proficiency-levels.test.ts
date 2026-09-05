import { describe, expect, it } from "vitest";
import { CANONICAL_CATALOG_MANIFEST } from "../src/curriculum/canonical-catalog.js";
import {
  CANONICAL_PROFICIENCY_LEVEL_MANIFEST,
  PROFICIENCY_LEVEL_CODES,
  PROFICIENCY_SKILL_CODES,
  validateCanonicalProficiencyLevelManifest,
} from "../src/curriculum/proficiency-levels.js";

describe("canonical proficiency Level manifest", () => {
  it("contains four design-only proficiency levels with all pilot skills", () => {
    expect(validateCanonicalProficiencyLevelManifest(CANONICAL_PROFICIENCY_LEVEL_MANIFEST)).toEqual(
      CANONICAL_PROFICIENCY_LEVEL_MANIFEST,
    );
    expect(CANONICAL_PROFICIENCY_LEVEL_MANIFEST.lifecycle).toBe("DESIGN_ONLY");
    expect(CANONICAL_PROFICIENCY_LEVEL_MANIFEST.calibrationStatus).toBe("NOT_CALIBRATED");
    expect(CANONICAL_PROFICIENCY_LEVEL_MANIFEST.levels.map((level) => level.code)).toEqual(
      PROFICIENCY_LEVEL_CODES,
    );
    for (const level of CANONICAL_PROFICIENCY_LEVEL_MANIFEST.levels) {
      expect(level.skillCoverage).toEqual(PROFICIENCY_SKILL_CODES);
      expect(level.difficultyMin).toBeLessThanOrEqual(level.difficultyMax);
    }
  });

  it("does not alter the existing G8_12 pilot Level manifest", () => {
    expect(CANONICAL_CATALOG_MANIFEST.levels).toHaveLength(1);
    expect(CANONICAL_CATALOG_MANIFEST.levels[0]?.code).toBe("G8_12");
  });
});
