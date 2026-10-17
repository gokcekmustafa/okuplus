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
    expect(EDUCATION_V2_P1_800_DRAFT_CYCLES).toHaveLength(64);
    for (const draft of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      expect(draft.authoringStatus).toBe("DRAFT_NOT_RELEASED");
      expect(draft.publicationApproved()).toBe(false);
      expect(draft.manifest.steps).toHaveLength(5);
      const stationKeys = draft.sourceStations.map((station) => station.key);
      const questionVersionIds = draft.sourceStations.flatMap((station) =>
        station.questions.map((question) => question.versionId),
      );
      expect(new Set(stationKeys).size).toBe(5);
      expect(new Set(questionVersionIds).size).toBe(15);
      const categoryCounts = Object.fromEntries(
        Object.keys(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map((category) => [
          category,
          draft.sourceStations.filter((item) => item.category === category).length,
        ]),
      );
      const onePerCategory = {
        FAST_READING: 1,
        READING_COMPREHENSION: 1,
        COMMON_STRATEGIES: 1,
        INTEGRATED_PRACTICE: 1,
        MULTI_SKILL_ASSESSMENT: 1,
      };
      const earlyReadingHeavyCycle = {
        FAST_READING: 1,
        READING_COMPREHENSION: 2,
        COMMON_STRATEGIES: 0,
        INTEGRATED_PRACTICE: 1,
        MULTI_SKILL_ASSESSMENT: 1,
      };
      const legacyReadingCycles = {
        FAST_READING: 2,
        READING_COMPREHENSION: 3,
        COMMON_STRATEGIES: 0,
        INTEGRATED_PRACTICE: 0,
        MULTI_SKILL_ASSESSMENT: 0,
      };
      const isLegacyReadingCycle =
        (draft.routeFamily === "A" && draft.sequence === 16) ||
        ((draft.routeFamily === "B" || draft.routeFamily === "C") && draft.sequence === 15);
      const isNewBalancedCycle =
        draft.sequence === (draft.routeFamily === "A" ? 19 : 18) ||
        draft.sequence === (draft.routeFamily === "A" ? 18 : 17) ||
        draft.sequence === (draft.routeFamily === "A" ? 17 : 16);
      const expectedCategoryCounts = isNewBalancedCycle
        ? onePerCategory
        : isLegacyReadingCycle
          ? legacyReadingCycles
          : (draft.routeFamily === "A" && draft.sequence === 8) ||
              (draft.routeFamily !== "A" && draft.sequence === 7)
            ? earlyReadingHeavyCycle
            : onePerCategory;
      expect(categoryCounts).toEqual(expectedCategoryCounts);
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
        FAST_READING: routeFamily === "D" ? 16 : 17,
        READING_COMPREHENSION: routeFamily === "D" ? 17 : 19,
        COMMON_STRATEGIES: routeFamily === "D" ? 15 : 14,
        INTEGRATED_PRACTICE: routeFamily === "D" ? 16 : 15,
        MULTI_SKILL_ASSESSMENT: routeFamily === "D" ? 16 : 15,
      });
      expect(result.unclassifiedStationCount).toBeGreaterThan(0);
      expect(result.authoredStationCount).toBe(routeFamily === "A" ? 105 : 90);
      expect(result.releasedSourceStationCount).toBe(routeFamily === "A" ? 25 : 5);
      expect(result.remainingAuthoredStations).toBe(routeFamily === "A" ? 95 : 110);
      expect(result.authoredStationCount + result.remainingAuthoredStations).toBe(
        result.targetStationCount,
      );
      expect(result.sourceVerifiedDraftStationCount).toBe(70);
      const sourceQualifiedCount =
        result.releasedSourceStationCount + result.sourceVerifiedDraftStationCount;
      expect(sourceQualifiedCount).toBe(routeFamily === "A" ? 95 : 75);
      expect(result.targetStationCount - sourceQualifiedCount).toBe(
        routeFamily === "A" ? 105 : 125,
      );
      expect(result.authoredStationCount - sourceQualifiedCount).toBe(
        routeFamily === "A" ? 10 : 15,
      );
      expect(result.productionGraph).toBe("NOT_VERIFIED");
    }
  });

  it("only counts source-traceable stations as verified and ties every new station to its source", () => {
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const cycleNumber = routeFamily === "A" ? 19 : 18;
      const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
        (candidate) => candidate.routeFamily === routeFamily && candidate.sequence === cycleNumber,
      )!;
      expect(cycle.sourceVerifiedStationCount).toBe(5);
      expect(cycle.sourceStations).toHaveLength(5);
      expect(new Set(cycle.sourceStations.map((station) => station.sourceEvidence?.url)).size).toBe(
        5,
      );
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

  it("uses forty distinct verified source pages in Groups 13 and 14", () => {
    const newestCycles = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && [18, 19].includes(cycle.sequence)) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && [17, 18].includes(cycle.sequence)),
    );
    expect(newestCycles).toHaveLength(8);
    const stations = newestCycles.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(40);
    const sourceUrls = stations.map((station) => station.sourceEvidence?.url);
    expect(new Set(sourceUrls).size).toBe(40);
    const questionVersions = stations.flatMap((station) =>
      station.questions.map((question) => question.versionId),
    );
    expect(new Set(questionVersions).size).toBe(120);
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(newestCycles.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
  });

  it("adds Group 14 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group14 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 19) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 18),
    );
    expect(group14).toHaveLength(4);
    const stations = group14.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group14.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group14.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group14.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });
});
