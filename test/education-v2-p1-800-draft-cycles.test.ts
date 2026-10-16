import { describe, expect, it } from "vitest";
import { validateLearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import {
  EDUCATION_V2_P1_800_CATEGORY_TARGETS,
  EDUCATION_V2_P1_800_DRAFT_CYCLES,
} from "../src/curriculum/education-v2-p1-800-draft-cycles.js";
import {
  LEARNING_ROUTE_CYCLES,
  nextLearningRouteCycle,
  summarizeLearningRouteCoverage,
} from "../src/curriculum/learning-route-catalog.js";

describe("800-istasyon müfredat genişleme adayları", () => {
  it("adds one fully authored, skill-tagged five-station source cycle per route without release approval", () => {
    expect(EDUCATION_V2_P1_800_DRAFT_CYCLES).toHaveLength(4);
    for (const draft of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      expect(draft.authoringStatus).toBe("DRAFT_NOT_RELEASED");
      expect(draft.publicationApproved()).toBe(false);
      expect(draft.manifest.steps).toHaveLength(5);
      expect(draft.sourceStations.map((item) => item.category).sort()).toEqual(
        Object.keys(EDUCATION_V2_P1_800_CATEGORY_TARGETS).sort(),
      );
      expect(validateLearningCycleManifest(draft.manifest)).toMatchObject({ valid: true });
      for (const station of draft.sourceStations) {
        expect(station.text.trim().length).toBeGreaterThan(80);
        expect(station.sourceReference).toContain("Özgün 800 istasyon genişleme içeriği");
        expect(station.outcome.trim().length).toBeGreaterThan(20);
        expect(station.questions).toHaveLength(3);
        expect(new Set(station.skillCodes).size).toBe(station.skillCodes.length);
        for (const question of station.questions) {
          expect(question.options).toHaveLength(4);
          expect(new Set(question.options.map((option) => option.text)).size).toBe(4);
          expect(
            question.options.find((option) => option.id === question.correctOptionId)?.text,
          ).toBe(question.correct);
        }
      }
    }
  });

  it("links each draft after its existing route cycle and does not make it assignable", () => {
    for (const draft of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      const predecessor = LEARNING_ROUTE_CYCLES.find(
        (cycle) => cycle.routeFamily === draft.routeFamily && cycle.sequence === draft.sequence - 1,
      );
      expect(predecessor?.nextPathCode).toBe(draft.pathCode);
      expect(nextLearningRouteCycle(predecessor!.pathCode)).toBe(draft);
      expect(draft.publicationApproved()).toBe(false);
      expect(draft.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(draft.manifest.steps.map((step) => step.prerequisiteKeys)).toEqual([
        [],
        [draft.manifest.steps[0]!.stableKey],
        [draft.manifest.steps[1]!.stableKey],
        [draft.manifest.steps[2]!.stableKey],
        [draft.manifest.steps[3]!.stableKey],
      ]);
    }
  });

  it("balances correct answer positions and reports, rather than hides, answer-length extremes", () => {
    const positionCounts = [0, 0, 0, 0];
    let uniqueLongest = 0;
    let uniqueShortest = 0;
    for (const draft of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      const routePositions = [0, 0, 0, 0];
      let routeLongest = 0;
      let routeShortest = 0;
      for (const station of draft.sourceStations) {
        for (const question of station.questions) {
          const correct = question.options.find(
            (option) => option.id === question.correctOptionId,
          )!;
          routePositions[correct.position - 1]! += 1;
          positionCounts[correct.position - 1]! += 1;
          const lengths = question.options.map((option) => [...option.text].length);
          const correctLength = [...correct.text].length;
          if (
            correctLength === Math.max(...lengths) &&
            lengths.filter((length) => length === correctLength).length === 1
          ) {
            uniqueLongest += 1;
            routeLongest += 1;
          }
          if (
            correctLength === Math.min(...lengths) &&
            lengths.filter((length) => length === correctLength).length === 1
          ) {
            uniqueShortest += 1;
            routeShortest += 1;
          }
        }
      }
      expect(Math.max(...routePositions) - Math.min(...routePositions)).toBeLessThanOrEqual(1);
      expect(routeLongest).toBeLessThanOrEqual(6);
      expect(routeShortest).toBeLessThanOrEqual(6);
    }
    expect(Math.max(...positionCounts) - Math.min(...positionCounts)).toBeLessThanOrEqual(1);
    expect(uniqueLongest).toBeLessThan(30);
    expect(uniqueShortest).toBeLessThan(30);
  });

  it("counts these drafts separately as authored candidates, not released or production graphs", () => {
    const coverage = summarizeLearningRouteCoverage();
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const result = coverage.find((item) => item.routeFamily === routeFamily)!;
      expect(result.categoryDistribution).toBe("PARTIALLY_CLASSIFIED");
      expect(result.categoryCounts).toEqual({
        FAST_READING: 1,
        READING_COMPREHENSION: 1,
        COMMON_STRATEGIES: 1,
        INTEGRATED_PRACTICE: 1,
        MULTI_SKILL_ASSESSMENT: 1,
      });
      expect(result.unclassifiedStationCount).toBeGreaterThan(0);
      expect(result.productionGraph).toBe("NOT_VERIFIED");
    }
  });
});
