import { describe, expect, it } from "vitest";
import {
  assessMultipleChoicePackageQuality,
  assessOptionLengthQuality,
  normalizedOptionLength,
} from "../src/curriculum/option-length-quality.js";
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
    expect(EDUCATION_V2_P1_800_DRAFT_CYCLES).toHaveLength(156);
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
        draft.sequence === (draft.routeFamily === "A" ? 20 : 19) ||
        draft.sequence === (draft.routeFamily === "A" ? 21 : 20) ||
        draft.sequence === (draft.routeFamily === "A" ? 22 : 21) ||
        draft.sequence === (draft.routeFamily === "A" ? 23 : 22) ||
        draft.sequence === (draft.routeFamily === "A" ? 24 : 23) ||
        draft.sequence === (draft.routeFamily === "A" ? 25 : 24) ||
        draft.sequence === (draft.routeFamily === "A" ? 26 : 25) ||
        draft.sequence === (draft.routeFamily === "A" ? 27 : 26) ||
        draft.sequence === (draft.routeFamily === "A" ? 28 : 27) ||
        draft.sequence === (draft.routeFamily === "A" ? 29 : 28) ||
        draft.sequence === (draft.routeFamily === "A" ? 30 : 29) ||
        draft.sequence === (draft.routeFamily === "A" ? 34 : 33) ||
        draft.sequence === (draft.routeFamily === "A" ? 32 : 31) ||
        draft.sequence === (draft.routeFamily === "A" ? 31 : 30) ||
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
      expect(quality.questionCount, `${draft.routeFamily}/${draft.sequence}`).toBe(15);
      expect(quality.clearLengthOutlierCount).toBe(
        quality.questionReports.filter((question) => question.clearLengthOutlier).length,
      );
    }
  });

  it("links every source draft while keeping publication eligibility separate from draft metadata", () => {
    for (const draft of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      const predecessor = LEARNING_ROUTE_CYCLES.find(
        (cycle) => cycle.routeFamily === draft.routeFamily && cycle.sequence === draft.sequence - 1,
      );
      expect(predecessor?.nextPathCode).toBe(draft.pathCode);
      const routeCycle = nextLearningRouteCycle(predecessor!.pathCode)!;
      expect(routeCycle.pathCode).toBe(draft.pathCode);
      expect(draft.publicationApproved()).toBe(false);
      if (draft.routeFamily === "A" && draft.sequence === 4) {
        expect(routeCycle.publicationApproved()).toBe(true);
        expect(routeCycle.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      } else if (draft.routeFamily === "A" && draft.sequence === 5) {
        expect(routeCycle.publicationApproved()).toBe(true);
        expect(routeCycle.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      } else if (draft.routeFamily === "A" && draft.sequence >= 6 && draft.sequence <= 8) {
        expect(routeCycle.publicationApproved()).toBe(true);
        expect(routeCycle.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      } else if (draft.routeFamily === "A" && draft.sequence >= 9 && draft.sequence <= 12) {
        expect(routeCycle.publicationApproved()).toBe(true);
        expect(routeCycle.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      } else if (draft.routeFamily === "A" && draft.sequence >= 13 && draft.sequence <= 16) {
        expect(routeCycle.publicationApproved()).toBe(true);
        expect(routeCycle.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      } else if (draft.routeFamily === "A" && draft.sequence >= 17 && draft.sequence <= 20) {
        expect(routeCycle.publicationApproved()).toBe(true);
        expect(routeCycle.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      } else {
        expect(routeCycle.publicationApproved()).toBe(false);
      }
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
    let reportedUniqueLongest = 0;
    let reportedUniqueShortest = 0;
    let reportedLengthOutliers = 0;
    for (const draft of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
      const routePositions = [0, 0, 0, 0];
      let routeLongest = 0;
      let routeShortest = 0;
      let routeLengthOutliers = 0;
      for (const station of draft.sourceStations) {
        for (const question of station.questions) {
          const correct = question.options.find(
            (option) => option.id === question.correctOptionId,
          )!;
          routePositions[correct.position - 1]! += 1;
          positionCounts[correct.position - 1]! += 1;
          const lengths = question.options.map((option) => normalizedOptionLength(option.text));
          const correctLength = normalizedOptionLength(correct.text);
          if (assessOptionLengthQuality(question)?.clearOutlier) routeLengthOutliers += 1;
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
      const routeQuestionCount = draft.sourceStations.reduce(
        (total, station) => total + station.questions.length,
        0,
      );
      expect(Math.max(...routePositions) - Math.min(...routePositions)).toBeLessThanOrEqual(1);
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
      expect(quality.correctUniqueLongestCount).toBe(routeLongest);
      expect(quality.correctUniqueShortestCount).toBe(routeShortest);
      expect(quality.questionReports).toHaveLength(routeQuestionCount);
      expect(quality.clearLengthOutlierCount).toBe(
        quality.questionReports.filter((question) => question.clearLengthOutlier).length,
      );
      expect(quality.clearLengthOutlierCount).toBe(routeLengthOutliers);
      reportedUniqueLongest += quality.correctUniqueLongestCount;
      reportedUniqueShortest += quality.correctUniqueShortestCount;
      reportedLengthOutliers += quality.clearLengthOutlierCount;
    }
    expect(Math.max(...positionCounts) - Math.min(...positionCounts)).toBeLessThanOrEqual(1);
    expect(reportedUniqueLongest).toBe(uniqueLongest);
    expect(reportedUniqueShortest).toBe(uniqueShortest);
    expect(reportedLengthOutliers).toBe(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.reduce(
        (total, draft) =>
          total +
          draft.sourceStations.reduce(
            (stationTotal, station) =>
              stationTotal +
              station.questions.filter(
                (question) => assessOptionLengthQuality(question)?.clearOutlier,
              ).length,
            0,
          ),
        0,
      ),
    );
  });

  it("separates authored, owner-approved source, and unverified production graph counts", () => {
    const coverage = summarizeLearningRouteCoverage();
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const result = coverage.find((item) => item.routeFamily === routeFamily)!;
      expect(result.categoryDistribution).toBe("INCOMPLETE");
      expect(result.categoryTargetGaps.FAST_READING).toBeGreaterThan(0);
      expect(result.categoryTargetGaps.READING_COMPREHENSION).toBeGreaterThan(0);
      expect(result.unclassifiedStationCount).toBeGreaterThan(0);
      expect(result.authoredStationCount).toBe(routeFamily === "A" ? 220 : 205);
      expect(result.releasedSourceStationCount).toBe(routeFamily === "A" ? 100 : 5);
      expect(result.remainingAuthoredStations).toBe(0);
      expect(result.authoredStationCount + result.remainingAuthoredStations).toBe(
        Math.max(result.targetStationCount, result.authoredStationCount),
      );
      expect(result.sourceVerifiedDraftStationCount).toBe(routeFamily === "A" ? 110 : 185);
      const sourceQualifiedCount =
        result.releasedSourceStationCount + result.sourceVerifiedDraftStationCount;
      expect(sourceQualifiedCount).toBe(routeFamily === "A" ? 210 : 190);
      expect(result.sourceQualifiedRemainingStations).toBe(routeFamily === "A" ? 0 : 10);
      expect(result.authoredSourceReviewRequiredStationCount).toBe(routeFamily === "A" ? 10 : 15);
      expect(result.productionGraph).toBe("NOT_VERIFIED");
    }
  });

  it("keeps route sequence/path IDs unique and confirms all Group 37 routes without expanding Group 38", () => {
    const identities = EDUCATION_V2_P1_800_DRAFT_CYCLES.map(
      (cycle) => `${cycle.routeFamily}:${cycle.sequence}`,
    );
    const pathCodes = EDUCATION_V2_P1_800_DRAFT_CYCLES.map((cycle) => cycle.pathCode);
    expect(new Set(identities).size).toBe(identities.length);
    expect(new Set(pathCodes).size).toBe(pathCodes.length);

    const group37 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => cycle.sequence === 37);
    expect(group37.map((cycle) => cycle.routeFamily).sort()).toEqual(["A", "B", "C", "D"]);
    expect(group37).toHaveLength(4);
    expect(group37.every((cycle) => cycle.sourceStations.length === 5)).toBe(true);
    expect(group37.every((cycle) => cycle.publicationApproved() === false)).toBe(true);

    const group38 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => cycle.sequence === 38);
    expect(group38.map((cycle) => cycle.routeFamily).sort()).toEqual(["A", "B", "C", "D"]);
    expect(group38.every((cycle) => cycle.sourceStations.length === 5)).toBe(true);
    expect(group38.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
  });

  it("only counts source-traceable stations as verified and ties every new station to its source", () => {
    for (const routeFamily of ["A", "B", "C", "D"] as const) {
      const cycleNumber = routeFamily === "A" ? 30 : 29;
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

  it("keeps all 55 source-review stations out of the qualified total until evidenced", () => {
    const pendingExpansionStations = EDUCATION_V2_P1_800_DRAFT_CYCLES.flatMap(
      (cycle) => cycle.sourceStations,
    ).filter((station) => station.provenanceStatus === "REVIEW_REQUIRED");
    const legacyCycleTwo = LEARNING_ROUTE_CYCLES.filter(
      (cycle) =>
        ["B", "C", "D"].includes(cycle.routeFamily) &&
        cycle.sequence === 2 &&
        !EDUCATION_V2_P1_800_DRAFT_CYCLES.some((draft) => draft.pathCode === cycle.pathCode),
    );
    const coverage = summarizeLearningRouteCoverage();

    expect(pendingExpansionStations).toHaveLength(40);
    expect(legacyCycleTwo).toHaveLength(3);
    expect(legacyCycleTwo.every((cycle) => cycle.manifest.steps.length === 5)).toBe(true);
    expect(legacyCycleTwo.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(
      coverage.map((route) => [route.routeFamily, route.authoredSourceReviewRequiredStationCount]),
    ).toEqual([
      ["A", 10],
      ["B", 15],
      ["C", 15],
      ["D", 15],
    ]);
    expect(pendingExpansionStations.every((station) => station.sourceEvidence == null)).toBe(true);
  });

  it("uses distinct verified source pages across Groups 15 through 24", () => {
    const newestCycles = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" &&
          [20, 21, 22, 23, 24, 25, 26, 27, 28, 29].includes(cycle.sequence)) ||
        (["B", "C", "D"].includes(cycle.routeFamily) &&
          [19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(cycle.sequence)),
    );
    expect(newestCycles).toHaveLength(40);
    const stations = newestCycles.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(200);
    const sourceUrls = stations.map((station) => station.sourceEvidence?.url);
    expect(new Set(sourceUrls).size).toBe(200);
    const questionVersions = stations.flatMap((station) =>
      station.questions.map((question) => question.versionId),
    );
    expect(new Set(questionVersions).size).toBe(600);
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

  it("adds Group 15 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group15 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 20) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 19),
    );
    expect(group15).toHaveLength(4);
    const stations = group15.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group15.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group15.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group15.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 16 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group16 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 21) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 20),
    );
    expect(group16).toHaveLength(4);
    const stations = group16.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group16.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group16.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group16.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 17 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group17 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 22) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 21),
    );
    expect(group17).toHaveLength(4);
    const stations = group17.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group17.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group17.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group17.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 18 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group18 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 23) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 22),
    );
    expect(group18).toHaveLength(4);
    const stations = group18.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group18.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group18.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group18.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 19 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group19 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 24) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 23),
    );
    expect(group19).toHaveLength(4);
    const stations = group19.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group19.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group19.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group19.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 20 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group20 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 25) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 24),
    );
    expect(group20).toHaveLength(4);
    const stations = group20.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group20.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group20.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group20.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 21 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group21 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 26) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 25),
    );
    expect(group21).toHaveLength(4);
    const stations = group21.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group21.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group21.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group21.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 22 as twenty source-unique, unpublished stations with sixty question versions", () => {
    const group22 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 27) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 26),
    );
    expect(group22).toHaveLength(4);
    const stations = group22.flatMap((cycle) => cycle.sourceStations);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((item) => item.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(stations.flatMap((item) => item.questions.map((question) => question.versionId)))
        .size,
    ).toBe(60);
    const priorSourceUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group22.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((item) => !priorSourceUrls.has(item.sourceEvidence?.url))).toBe(true);
    expect(stations.every((item) => item.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group22.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group22.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 23 as twenty source-unique, dated and unpublished stations", () => {
    const group23 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 28) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 27),
    );
    const stations = group23.flatMap((cycle) => cycle.sourceStations);
    expect(group23).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((station) => station.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    const priorUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group23.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((station) => !priorUrls.has(station.sourceEvidence?.url))).toBe(true);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group23.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group23.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 24 as twenty source-unique, dated and unpublished stations", () => {
    const group24 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 29) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 28),
    );
    const stations = group24.flatMap((cycle) => cycle.sourceStations);
    expect(group24).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((station) => station.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    const priorUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group24.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((station) => !priorUrls.has(station.sourceEvidence?.url))).toBe(true);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group24.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group24.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 25 as twenty source-unique, dated and unpublished stations", () => {
    const group25 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 30) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 29),
    );
    const stations = group25.flatMap((cycle) => cycle.sourceStations);
    expect(group25).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(new Set(stations.map((station) => station.sourceEvidence?.url)).size).toBe(20);
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    const priorUrls = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group25.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => station.sourceEvidence?.url),
    );
    expect(stations.every((station) => !priorUrls.has(station.sourceEvidence?.url))).toBe(true);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group25.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group25.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 26 as twenty globally source-unique, dated and unpublished stations", () => {
    const group26 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 31) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 30),
    );
    const stations = group26.flatMap((cycle) => cycle.sourceStations);
    const normalizeSourcePage = (url: string | undefined) => {
      if (!url) return "";
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./u, "").toLowerCase()}${parsed.pathname.replace(/\/$/u, "")}`;
    };
    const priorSourcePages = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group26.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => normalizeSourcePage(station.sourceEvidence?.url)),
    );

    expect(group26).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(
      new Set(stations.map((station) => normalizeSourcePage(station.sourceEvidence?.url))).size,
    ).toBe(20);
    expect(
      stations.every(
        (station) => !priorSourcePages.has(normalizeSourcePage(station.sourceEvidence?.url)),
      ),
    ).toBe(true);
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group26.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group26.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
  });

  it("adds Group 27 as twenty source-unique, unpublished stations linked after Group 26", () => {
    const group27 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 32) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 31),
    );
    const stations = group27.flatMap((cycle) => cycle.sourceStations);
    const normalizeSourcePage = (url: string | undefined) => {
      if (!url) return "";
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./u, "").toLowerCase()}${parsed.pathname.replace(/\/$/u, "")}`;
    };
    const priorSourcePages = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group27.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => normalizeSourcePage(station.sourceEvidence?.url)),
    );

    expect(group27).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(
      new Set(stations.map((station) => normalizeSourcePage(station.sourceEvidence?.url))).size,
    ).toBe(20);
    expect(
      stations.every(
        (station) => !priorSourcePages.has(normalizeSourcePage(station.sourceEvidence?.url)),
      ),
    ).toBe(true);
    expect(group27.map((cycle) => [cycle.routeFamily, cycle.pathCode, cycle.nextPathCode])).toEqual(
      expect.arrayContaining([
        [
          "A",
          "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_32_G8_12",
          "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_33_G8_12",
        ],
        [
          "B",
          "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_31_G8_12",
          "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_32_G8_12",
        ],
        [
          "C",
          "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_31_G8_12",
          "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_32_G8_12",
        ],
        [
          "D",
          "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_31_G8_12",
          "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_32_G8_12",
        ],
      ]),
    );
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group27.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group27.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
    for (const cycle of group27) {
      expect(cycle.sourceVerifiedStationCount).toBe(5);
      expect(cycle.manifest.steps).toHaveLength(5);
      expect(cycle.manifest.resourceCatalog.questionVersionIds).toHaveLength(15);
    }
  });

  it("adds Group 28 as twenty source-unique, unpublished stations linked after Group 27", () => {
    const group28 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 33) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 32),
    );
    const stations = group28.flatMap((cycle) => cycle.sourceStations);
    const normalizeSourcePage = (url: string | undefined) => {
      if (!url) return "";
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./u, "").toLowerCase()}${parsed.pathname.replace(/\/$/u, "")}`;
    };
    const priorSourcePages = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter((cycle) => !group28.includes(cycle))
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => normalizeSourcePage(station.sourceEvidence?.url)),
    );

    expect(group28).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(
      new Set(stations.map((station) => normalizeSourcePage(station.sourceEvidence?.url))).size,
    ).toBe(20);
    expect(
      stations.every(
        (station) => !priorSourcePages.has(normalizeSourcePage(station.sourceEvidence?.url)),
      ),
    ).toBe(true);
    expect(group28.map((cycle) => [cycle.routeFamily, cycle.pathCode, cycle.nextPathCode])).toEqual(
      expect.arrayContaining([
        [
          "A",
          "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_33_G8_12",
          "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_34_G8_12",
        ],
        [
          "B",
          "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_32_G8_12",
          "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_33_G8_12",
        ],
        [
          "C",
          "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_32_G8_12",
          "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_33_G8_12",
        ],
        [
          "D",
          "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_32_G8_12",
          "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_33_G8_12",
        ],
      ]),
    );
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group28.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group28.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
    for (const cycle of group28) {
      expect(cycle.sourceVerifiedStationCount).toBe(5);
      expect(cycle.manifest.steps).toHaveLength(5);
      expect(cycle.manifest.resourceCatalog.questionVersionIds).toHaveLength(15);
    }
  });

  it("adds Group 29 as twenty new sourced stations linked after Group 28", () => {
    const group29 = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (cycle.routeFamily === "A" && cycle.sequence === 34) ||
        (["B", "C", "D"].includes(cycle.routeFamily) && cycle.sequence === 33),
    );
    const stations = group29.flatMap((cycle) => cycle.sourceStations);
    const normalizeSourcePage = (url: string | undefined) => {
      if (!url) return "";
      const parsed = new URL(url);
      return (
        parsed.hostname.replace(/^www\./u, "").toLowerCase() + parsed.pathname.replace(/\/$/u, "")
      );
    };
    const priorSourcePages = new Set(
      EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
        (cycle) => cycle.sequence < (cycle.routeFamily === "A" ? 34 : 33),
      )
        .flatMap((cycle) => cycle.sourceStations)
        .map((station) => normalizeSourcePage(station.sourceEvidence?.url)),
    );

    expect(group29).toHaveLength(4);
    expect(stations).toHaveLength(20);
    expect(
      new Set(stations.map((station) => normalizeSourcePage(station.sourceEvidence?.url))).size,
    ).toBe(20);
    expect(
      stations.every(
        (station) => !priorSourcePages.has(normalizeSourcePage(station.sourceEvidence?.url)),
      ),
    ).toBe(true);
    expect(group29.map((cycle) => [cycle.routeFamily, cycle.pathCode])).toEqual(
      expect.arrayContaining([
        ["A", "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_34_G8_12"],
        ["B", "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_33_G8_12"],
        ["C", "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_33_G8_12"],
        ["D", "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_33_G8_12"],
      ]),
    );
    expect(
      group29.every(
        (cycle) =>
          cycle.nextPathCode !== null &&
          EDUCATION_V2_P1_800_DRAFT_CYCLES.some(
            (previous) =>
              previous.routeFamily === cycle.routeFamily &&
              previous.sequence + 1 === cycle.sequence &&
              previous.nextPathCode === cycle.pathCode,
          ),
      ),
    ).toBe(true);
    expect(
      new Set(
        stations.flatMap((station) => station.questions.map((question) => question.versionId)),
      ).size,
    ).toBe(60);
    expect(stations.every((station) => station.sourceEvidence?.checkedOn === "2026-10-18")).toBe(
      true,
    );
    expect(stations.every((station) => station.provenanceStatus === "SOURCE_VERIFIED")).toBe(true);
    expect(group29.every((cycle) => cycle.publicationApproved() === false)).toBe(true);
    expect(group29.every((cycle) => cycle.authoringStatus === "DRAFT_NOT_RELEASED")).toBe(true);
    for (const cycle of group29) {
      expect(cycle.sourceVerifiedStationCount).toBe(5);
      expect(cycle.manifest.steps).toHaveLength(5);
      expect(cycle.manifest.resourceCatalog.questionVersionIds).toHaveLength(15);
    }
  });
});
