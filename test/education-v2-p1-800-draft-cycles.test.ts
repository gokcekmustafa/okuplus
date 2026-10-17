import { describe, expect, it } from "vitest";
import { assessMultipleChoicePackageQuality } from "../src/curriculum/option-length-quality.js";
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
  it("adds fully authored, skill-tagged five-station source cycles without release approval", () => {
    expect(EDUCATION_V2_P1_800_DRAFT_CYCLES).toHaveLength(12);
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
        expect(station.sourceReference.trim().length).toBeGreaterThan(15);
        expect(station.outcome.trim().length).toBeGreaterThan(20);
        expect(["FOUNDATION", "INTERMEDIATE", "ADVANCED"]).toContain(station.difficulty);
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
      const quality = assessMultipleChoicePackageQuality(
        draft.sourceStations.flatMap((station) =>
          station.questions.map((question) => ({
            key: question.key,
            prompt: question.prompt,
            options: question.options,
            correctOptionId: question.correctOptionId,
          })),
        ),
      );
      expect(quality.clearLengthOutlierCount).toBe(0);
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
    const totalQuestions = positionCounts.reduce((total, count) => total + count, 0);
    expect(uniqueLongest / totalQuestions).toBeLessThan(0.25);
    expect(uniqueShortest / totalQuestions).toBeLessThan(0.25);
  });

  it("counts these drafts separately as authored candidates, not released or production graphs", () => {
    const coverage = summarizeLearningRouteCoverage();
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const result = coverage.find((item) => item.routeFamily === routeFamily)!;
      expect(result.categoryDistribution).toBe("PARTIALLY_CLASSIFIED");
      expect(result.categoryCounts).toEqual({
        FAST_READING: 3,
        READING_COMPREHENSION: 3,
        COMMON_STRATEGIES: 3,
        INTEGRATED_PRACTICE: 3,
        MULTI_SKILL_ASSESSMENT: 3,
      });
      expect(result.unclassifiedStationCount).toBeGreaterThan(0);
      expect(result.authoredStationCount).toBe(routeFamily === "A" ? 40 : 25);
      expect(result.releasedSourceStationCount).toBe(routeFamily === "A" ? 25 : 5);
      expect(result.remainingAuthoredStations).toBe(routeFamily === "A" ? 160 : 175);
      expect(result.sourceVerifiedDraftStationCount).toBe(5);
      expect(result.productionGraph).toBe("NOT_VERIFIED");
    }
  });

  it("only counts source-traceable stations as verified and ties every new station to its source", () => {
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const cycleNumber = routeFamily === "A" ? 6 : 5;
      const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
        (candidate) => candidate.routeFamily === routeFamily && candidate.sequence === cycleNumber,
      )!;
      expect(cycle.sourceVerifiedStationCount).toBe(5);
      expect(cycle.sourceStations).toHaveLength(5);
      for (const station of cycle.sourceStations) {
        expect(station.provenanceStatus).toBe("SOURCE_VERIFIED");
        expect(station.sourceEvidence).toBeDefined();
        expect(station.sourceEvidence?.url).toMatch(/^https:\/\//u);
        expect(station.sourceEvidence?.title.trim().length).toBeGreaterThan(8);
        expect(station.sourceEvidence?.verifiedFacts.length).toBeGreaterThan(0);
        expect(station.sourceEvidence?.contentRelation.trim().length).toBeGreaterThan(20);
        expect(station.difficulty).toBeTruthy();
      }
    }
  });
});
