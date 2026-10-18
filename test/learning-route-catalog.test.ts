import { describe, expect, it } from "vitest";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
  nextLearningRouteCycle,
  upcomingLearningRouteCycles,
  matchesLearningRouteGraph,
  validateLearningRouteCatalog,
  summarizeLearningRouteCoverage,
  type LearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";
import { resolveLearningPathNodeStatuses } from "../src/modules/learning-path/service.js";
import { selectPublishedPathCandidates } from "../src/modules/learning-path/service.js";
import { buildEducationV2P0LearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";

function graph(cycle: LearningRouteCycle) {
  return {
    code: cycle.pathCode,
    version: cycle.version,
    units: cycle.units.map((unit) => ({
      code: unit.code,
      status: "PUBLISHED",
      steps: unit.steps.map(({ key }, index) => {
        const step = cycle.manifest.steps.find((item) => item.stableKey === key)!;
        return {
          id: `${cycle.pathCode}:${key}`,
          stableKey: `${cycle.programId}:${key}`,
          position: index + 1,
          type: step.type,
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: step.prerequisiteKeys[0]
            ? `${cycle.pathCode}:${step.prerequisiteKeys[0]}`
            : null,
          completionRule: {},
          contentVersionId: step.content?.versionId ?? null,
          exerciseTemplateVersionId: step.exercise?.versionId ?? null,
          assessmentId: step.assessment?.versionId ?? null,
        };
      }),
    })),
  };
}

describe("versioned learning routes", () => {
  it("reports authored and released source counts separately from production publication", () => {
    const coverage = summarizeLearningRouteCoverage();
    expect(
      coverage.map((item) => ({
        route: item.routeFamily,
        authored: item.authoredStationCount,
        releaseApprovedSource: item.releasedSourceStationCount,
        sourceVerifiedDraft: item.sourceVerifiedDraftStationCount,
        sourceQualified: item.sourceQualifiedStationCount,
        reviewRequired: item.authoredSourceReviewRequiredStationCount,
        sourceRemaining: item.sourceQualifiedRemainingStations,
        categoryDistribution: item.categoryDistribution,
        categoryCounts: item.categoryCounts,
        categoryTargetGaps: item.categoryTargetGaps,
        categoryTargetExcesses: item.categoryTargetExcesses,
        unclassified: item.unclassifiedStationCount,
        productionGraph: item.productionGraph,
      })),
    ).toEqual([
      {
        route: "A",
        authored: 220,
        releaseApprovedSource: 25,
        sourceVerifiedDraft: 185,
        sourceQualified: 210,
        reviewRequired: 10,
        sourceRemaining: 0,
        categoryDistribution: "INCOMPLETE",
        categoryCounts: {
          FAST_READING: 40,
          READING_COMPREHENSION: 42,
          COMMON_STRATEGIES: 37,
          INTEGRATED_PRACTICE: 38,
          MULTI_SKILL_ASSESSMENT: 38,
        },
        categoryTargetGaps: {
          FAST_READING: 20,
          READING_COMPREHENSION: 38,
          COMMON_STRATEGIES: 0,
          INTEGRATED_PRACTICE: 0,
          MULTI_SKILL_ASSESSMENT: 0,
        },
        categoryTargetExcesses: {
          FAST_READING: 0,
          READING_COMPREHENSION: 0,
          COMMON_STRATEGIES: 17,
          INTEGRATED_PRACTICE: 13,
          MULTI_SKILL_ASSESSMENT: 23,
        },
        unclassified: 25,
        productionGraph: "NOT_VERIFIED",
      },
      ...(["B", "C"] as const).map((route) => ({
        route,
        authored: 205,
        releaseApprovedSource: 5,
        sourceVerifiedDraft: 185,
        sourceQualified: 190,
        reviewRequired: 15,
        sourceRemaining: 10,
        categoryDistribution: "INCOMPLETE",
        categoryCounts: {
          FAST_READING: 40,
          READING_COMPREHENSION: 42,
          COMMON_STRATEGIES: 37,
          INTEGRATED_PRACTICE: 38,
          MULTI_SKILL_ASSESSMENT: 38,
        },
        categoryTargetGaps: {
          FAST_READING: 20,
          READING_COMPREHENSION: 38,
          COMMON_STRATEGIES: 0,
          INTEGRATED_PRACTICE: 0,
          MULTI_SKILL_ASSESSMENT: 0,
        },
        categoryTargetExcesses: {
          FAST_READING: 0,
          READING_COMPREHENSION: 0,
          COMMON_STRATEGIES: 17,
          INTEGRATED_PRACTICE: 13,
          MULTI_SKILL_ASSESSMENT: 23,
        },
        unclassified: 10,
        productionGraph: "NOT_VERIFIED",
      })),
      {
        route: "D",
        authored: 205,
        releaseApprovedSource: 5,
        sourceVerifiedDraft: 185,
        sourceQualified: 190,
        reviewRequired: 15,
        sourceRemaining: 10,
        categoryDistribution: "INCOMPLETE",
        categoryCounts: {
          FAST_READING: 39,
          READING_COMPREHENSION: 40,
          COMMON_STRATEGIES: 38,
          INTEGRATED_PRACTICE: 39,
          MULTI_SKILL_ASSESSMENT: 39,
        },
        categoryTargetGaps: {
          FAST_READING: 21,
          READING_COMPREHENSION: 40,
          COMMON_STRATEGIES: 0,
          INTEGRATED_PRACTICE: 0,
          MULTI_SKILL_ASSESSMENT: 0,
        },
        categoryTargetExcesses: {
          FAST_READING: 0,
          READING_COMPREHENSION: 0,
          COMMON_STRATEGIES: 18,
          INTEGRATED_PRACTICE: 14,
          MULTI_SKILL_ASSESSMENT: 24,
        },
        unclassified: 10,
        productionGraph: "NOT_VERIFIED",
      },
    ]);
  });

  it("chains authored cycles in route order and respects their explicit release decisions", () => {
    expect(validateLearningRouteCatalog()).toEqual([]);
    const a = LEARNING_ROUTE_CYCLES.filter((cycle) => cycle.routeFamily === "A").sort(
      (left, right) => left.sequence - right.sequence,
    );
    expect(a.map((cycle) => cycle.sequence)).toEqual(
      Array.from({ length: a.length }, (_, index) => index + 1),
    );
    expect(a.map((cycle) => cycle.manifest.steps.length)).toEqual([
      9,
      9,
      7,
      ...Array.from({ length: a.length - 3 }, () => 5),
    ]);
    expect(nextLearningRouteCycle(a[0]!.pathCode)?.pathCode).toBe(a[1]!.pathCode);
    expect(nextLearningRouteCycle(a[1]!.pathCode)?.pathCode).toBe(a[2]!.pathCode);
    expect(upcomingLearningRouteCycles(a[0]!.pathCode).map((cycle) => cycle.sequence)).toEqual(
      Array.from({ length: a.length - 1 }, (_, index) => index + 2),
    );
    expect(a[2]!.publicationApproved()).toBe(true);
    expect(nextLearningRouteCycle(a[2]!.pathCode)).toBe(a[3]);
    expect(a[3]!.publicationApproved()).toBe(false);
    expect(a[3]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[3]!.pathCode)).toBe(a[4]);
    expect(a[4]!.publicationApproved()).toBe(false);
    expect(nextLearningRouteCycle(a[4]!.pathCode)).toBe(a[5]);
    expect(a[5]!.publicationApproved()).toBe(false);
    expect(nextLearningRouteCycle(a[5]!.pathCode)).toBe(a[6]);
    expect(a[6]!.publicationApproved()).toBe(false);
    expect(nextLearningRouteCycle(a[6]!.pathCode)).toBe(a[7]);
    expect(a[7]!.publicationApproved()).toBe(false);
    expect(a[7]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[7]!.pathCode)).toBe(a[8]);
    expect(a[8]!.publicationApproved()).toBe(false);
    expect(a[8]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[8]!.pathCode)).toBe(a[9]);
    expect(a[9]!.publicationApproved()).toBe(false);
    expect(a[9]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[9]!.pathCode)).toBe(a[10]);
    expect(a[10]!.publicationApproved()).toBe(false);
    expect(a[10]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[10]!.pathCode)).toBe(a[11]);
    expect(a[11]!.publicationApproved()).toBe(false);
    expect(a[11]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[11]!.pathCode)).toBe(a[12]);
    expect(a[12]!.publicationApproved()).toBe(false);
    expect(a[12]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[12]!.pathCode)).toBe(a[13]);
    expect(a[13]!.publicationApproved()).toBe(false);
    expect(a[13]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[13]!.pathCode)).toBe(a[14]);
    expect(a[14]!.publicationApproved()).toBe(false);
    expect(a[14]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[14]!.pathCode)).toBe(a[15]);
    expect(a[15]!.publicationApproved()).toBe(false);
    expect(a[15]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[15]!.pathCode)).toBe(a[16]);
    expect(a[16]!.publicationApproved()).toBe(false);
    expect(a[16]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[16]!.pathCode)).toBe(a[17]);
    expect(a[17]!.publicationApproved()).toBe(false);
    expect(a[17]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[17]!.pathCode)).toBe(a[18]);
    expect(a[18]!.publicationApproved()).toBe(false);
    expect(a[18]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[18]!.pathCode)).toBe(a[19]);
    expect(a[19]!.publicationApproved()).toBe(false);
    expect(a[19]!.manifest.steps).toHaveLength(5);
    expect(a[20]!.publicationApproved()).toBe(false);
    expect(a[20]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[19]!.pathCode)).toBe(a[20]);
    expect(a[21]!.publicationApproved()).toBe(false);
    expect(a[21]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[20]!.pathCode)).toBe(a[21]);
    expect(nextLearningRouteCycle(a[21]!.pathCode)).toBe(a[22]);
    expect(a[22]!.publicationApproved()).toBe(false);
    expect(a[22]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[22]!.pathCode)).toBe(a[23]);
    expect(a[23]!.publicationApproved()).toBe(false);
    expect(a[23]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[23]!.pathCode)).toBe(a[24]);
    expect(a[24]!.publicationApproved()).toBe(false);
    expect(a[24]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[24]!.pathCode)).toBe(a[25]);
    expect(a[25]!.publicationApproved()).toBe(false);
    expect(a[25]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[25]!.pathCode)).toBe(a[26]);
    expect(a[26]!.publicationApproved()).toBe(false);
    expect(a[26]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[26]!.pathCode)).toBe(a[27]);
    expect(a[27]!.publicationApproved()).toBe(false);
    expect(a[27]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[27]!.pathCode)).toBe(a[28]);
    expect(a[28]!.publicationApproved()).toBe(false);
    expect(a[28]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[28]!.pathCode)).toBe(a[29]);
    expect(a[29]!.publicationApproved()).toBe(false);
    expect(a[29]!.manifest.steps).toHaveLength(5);
    expect(nextLearningRouteCycle(a[29]!.pathCode)).toBe(a[30]);
    expect(a[30]!.publicationApproved()).toBe(false);
    expect(a[30]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[30]!.pathCode)).toBe(a[31]);
    expect(a[31]!.publicationApproved()).toBe(false);
    expect(a[31]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[31]!.pathCode)).toBe(a[32]);
    expect(a[32]!.publicationApproved()).toBe(false);
    expect(a[32]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    expect(nextLearningRouteCycle(a[32]!.pathCode)).toBe(a[33]);
    expect(a[33]!.publicationApproved()).toBe(false);
    expect(a[33]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
    for (let index = 3; index < a.length; index += 1) {
      expect(a[index]!.publicationApproved()).toBe(false);
      expect(a[index]!.manifest.steps).toHaveLength(5);
      expect(a[index]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(a[index]!.pathCode)).toBe(a[index + 1] ?? null);
    }
    expect(nextLearningRouteCycle("unknown-route")).toBeNull();
    expect(learningRouteCycle(a[0]!.pathCode)?.scopeCode).toBe("G8_12");
  });

  it("places Cycle 3 station one at the source position immediately after station 40", () => {
    const p0Steps = buildEducationV2P0LearningCycleManifest().steps.length;
    const aCycles = LEARNING_ROUTE_CYCLES.filter((cycle) => cycle.routeFamily === "A");
    const priorAStationCount = aCycles
      .filter((cycle) => cycle.sequence < 3)
      .reduce((count, cycle) => count + cycle.manifest.steps.length, 0);
    const cycle3 = aCycles.find((cycle) => cycle.sequence === 3)!;

    expect(p0Steps + priorAStationCount).toBe(40);
    expect(p0Steps + priorAStationCount + 1).toBe(41);
    expect(nextLearningRouteCycle(aCycles.find((cycle) => cycle.sequence === 2)!.pathCode)).toBe(
      cycle3,
    );
    expect(cycle3.manifest.steps).toHaveLength(7);
    expect(cycle3.publicationApproved()).toBe(true);
  });

  it("connects the authored B/C/D continuation cycles without granting release", () => {
    for (const routeFamily of ["B", "C", "D"] as const) {
      const cycles = LEARNING_ROUTE_CYCLES.filter(
        (cycle) => cycle.routeFamily === routeFamily,
      ).sort((left, right) => left.sequence - right.sequence);
      expect(cycles.map((cycle) => cycle.sequence)).toEqual(
        Array.from({ length: cycles.length }, (_, index) => index + 1),
      );
      expect(nextLearningRouteCycle(cycles[0]!.pathCode)).toBe(cycles[1]);
      expect(cycles[0]!.publicationApproved()).toBe(true);
      expect(cycles[1]!.publicationApproved()).toBe(false);
      expect(cycles[1]!.manifest.steps).toHaveLength(5);
      expect(cycles[1]!.manifest.learningOutcomes[0]!.statement).not.toBe(
        cycles[0]!.manifest.learningOutcomes[0]!.statement,
      );
      expect(upcomingLearningRouteCycles(cycles[0]!.pathCode)).toEqual(cycles.slice(1));
      expect(cycles[29]!.publicationApproved()).toBe(false);
      expect(cycles[29]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[29]!.pathCode)).toBe(cycles[30]);
      expect(cycles[30]!.publicationApproved()).toBe(false);
      expect(cycles[30]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[30]!.pathCode)).toBe(cycles[31]);
      expect(cycles[31]!.publicationApproved()).toBe(false);
      expect(cycles[31]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[31]!.pathCode)).toBe(cycles[32]);
      expect(nextLearningRouteCycle(cycles[1]!.pathCode)).toBe(cycles[2]);
      expect(cycles[2]!.publicationApproved()).toBe(false);
      expect(cycles[2]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[2]!.pathCode)).toBe(cycles[3]);
      expect(cycles[3]!.publicationApproved()).toBe(false);
      expect(cycles[3]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[3]!.pathCode)).toBe(cycles[4]);
      expect(cycles[4]!.publicationApproved()).toBe(false);
      expect(cycles[4]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[4]!.pathCode)).toBe(cycles[5]);
      expect(cycles[5]!.publicationApproved()).toBe(false);
      expect(cycles[5]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[5]!.pathCode)).toBe(cycles[6]);
      expect(nextLearningRouteCycle(cycles[6]!.pathCode)).toBe(cycles[7]);
      expect(cycles[7]!.publicationApproved()).toBe(false);
      expect(cycles[7]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[7]!.pathCode)).toBe(cycles[8]);
      expect(cycles[8]!.publicationApproved()).toBe(false);
      expect(cycles[8]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[8]!.pathCode)).toBe(cycles[9]);
      expect(cycles[9]!.publicationApproved()).toBe(false);
      expect(cycles[9]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[9]!.pathCode)).toBe(cycles[10]);
      expect(cycles[10]!.publicationApproved()).toBe(false);
      expect(cycles[10]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[10]!.pathCode)).toBe(cycles[11]);
      expect(cycles[11]!.publicationApproved()).toBe(false);
      expect(cycles[11]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[11]!.pathCode)).toBe(cycles[12]);
      expect(cycles[12]!.publicationApproved()).toBe(false);
      expect(cycles[12]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[12]!.pathCode)).toBe(cycles[13]);
      expect(cycles[13]!.publicationApproved()).toBe(false);
      expect(cycles[13]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[13]!.pathCode)).toBe(cycles[14]);
      expect(cycles[14]!.publicationApproved()).toBe(false);
      expect(cycles[14]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[14]!.pathCode)).toBe(cycles[15]);
      expect(cycles[15]!.publicationApproved()).toBe(false);
      expect(cycles[15]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[15]!.pathCode)).toBe(cycles[16]);
      expect(cycles[16]!.publicationApproved()).toBe(false);
      expect(cycles[16]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[16]!.pathCode)).toBe(cycles[17]);
      expect(cycles[17]!.publicationApproved()).toBe(false);
      expect(cycles[17]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[17]!.pathCode)).toBe(cycles[18]);
      expect(cycles[18]!.publicationApproved()).toBe(false);
      expect(cycles[18]!.manifest.steps).toHaveLength(5);
      expect(cycles[19]!.publicationApproved()).toBe(false);
      expect(cycles[19]!.manifest.steps).toHaveLength(5);
      expect(cycles[20]!.publicationApproved()).toBe(false);
      expect(cycles[20]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[18]!.pathCode)).toBe(cycles[19]);
      expect(nextLearningRouteCycle(cycles[19]!.pathCode)).toBe(cycles[20]);
      expect(cycles[21]!.publicationApproved()).toBe(false);
      expect(cycles[21]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[20]!.pathCode)).toBe(cycles[21]);
      expect(nextLearningRouteCycle(cycles[21]!.pathCode)).toBe(cycles[22]);
      expect(cycles[22]!.publicationApproved()).toBe(false);
      expect(cycles[22]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[22]!.pathCode)).toBe(cycles[23]);
      expect(cycles[23]!.publicationApproved()).toBe(false);
      expect(cycles[23]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[23]!.pathCode)).toBe(cycles[24]);
      expect(cycles[24]!.publicationApproved()).toBe(false);
      expect(cycles[24]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[24]!.pathCode)).toBe(cycles[25]);
      expect(cycles[25]!.publicationApproved()).toBe(false);
      expect(cycles[25]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[25]!.pathCode)).toBe(cycles[26]);
      expect(cycles[26]!.publicationApproved()).toBe(false);
      expect(cycles[26]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[26]!.pathCode)).toBe(cycles[27]);
      expect(cycles[27]!.publicationApproved()).toBe(false);
      expect(cycles[27]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[27]!.pathCode)).toBe(cycles[28]);
      expect(cycles[28]!.publicationApproved()).toBe(false);
      expect(cycles[28]!.manifest.steps).toHaveLength(5);
      expect(nextLearningRouteCycle(cycles[28]!.pathCode)).toBe(cycles[29]);
      expect(cycles[29]!.publicationApproved()).toBe(false);
      expect(cycles[29]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
      expect(nextLearningRouteCycle(cycles[29]!.pathCode)).toBe(cycles[30]);
      for (let index = 1; index < cycles.length; index += 1) {
        expect(cycles[index]!.publicationApproved()).toBe(false);
        expect(cycles[index]!.manifest.completion.nextCycle).toBe("REVIEW_REQUIRED");
        expect(nextLearningRouteCycle(cycles[index]!.pathCode)).toBe(cycles[index + 1] ?? null);
      }
    }
  });

  it("accepts every complete source graph, including the seven-station continuation", () => {
    for (const cycle of LEARNING_ROUTE_CYCLES)
      expect(matchesLearningRouteGraph(graph(cycle))).toBe(true);
  });

  it.each([
    "version",
    "order",
    "unit",
    "prerequisite",
    "content",
    "template",
    "assessment",
    "published",
  ])("rejects a wrong %s in an otherwise published graph", (kind) => {
    const cycle = LEARNING_ROUTE_CYCLES.find((item) => item.sequence === 2)!;
    const candidate = graph(cycle);
    const steps = candidate.units.flatMap((unit) => unit.steps);
    if (kind === "version") candidate.version++;
    if (kind === "order") candidate.units[0]!.steps.reverse();
    if (kind === "unit") candidate.units[0]!.code = "unrelated-unit";
    if (kind === "prerequisite") steps[1]!.prerequisiteStepId = "another-student-step";
    if (kind === "content")
      steps.find((step) => step.contentVersionId)!.contentVersionId = "wrong-version";
    if (kind === "template")
      steps.find((step) => step.exerciseTemplateVersionId)!.exerciseTemplateVersionId =
        "wrong-version";
    if (kind === "assessment")
      steps.find((step) => step.assessmentId)!.assessmentId = "wrong-version";
    if (kind === "published") steps[0]!.status = "DRAFT";
    expect(matchesLearningRouteGraph(candidate)).toBe(false);
  });

  it("rejects a cross-family, cross-scope or missing continuation in the authoring contract", () => {
    const a = LEARNING_ROUTE_CYCLES.find(
      (cycle) => cycle.sequence === 1 && cycle.routeFamily === "A",
    )!;
    for (const next of [
      "missing",
      LEARNING_ROUTE_CYCLES.find((cycle) => cycle.routeFamily === "B")!.pathCode,
    ]) {
      expect(
        validateLearningRouteCatalog(
          LEARNING_ROUTE_CYCLES.map((cycle) =>
            cycle === a ? { ...cycle, nextPathCode: next } : cycle,
          ),
        ).length,
      ).toBeGreaterThan(0);
    }
    const candidates = LEARNING_ROUTE_CYCLES.map((cycle) =>
      cycle.sequence === 2 ? { ...cycle, scopeCode: "different-scope" } : cycle,
    );
    expect(validateLearningRouteCatalog(candidates).length).toBeGreaterThan(0);
  });

  it("opens station 41 after 40 completions and continues beyond 200 with no numeric ceiling", () => {
    for (const completed of [39, 40, 199, 239]) {
      const statuses = resolveLearningPathNodeStatuses(
        Array.from({ length: 250 }, (_, index) => ({
          id: `synthetic-${index + 1}`,
          prerequisiteIds: index ? [`synthetic-${index}`] : [],
          eligible: true,
          completed: index < completed,
        })),
      );
      expect(statuses.get(`synthetic-${completed + 1}`)).toBe("active");
      expect([...statuses.values()].filter((status) => status === "active")).toHaveLength(1);
      expect(statuses.get(`synthetic-${completed + 2}`)).toBe("locked");
    }
  });

  it("retains all completed cycles in source order before the active cycle", () => {
    const cycles = LEARNING_ROUTE_CYCLES.filter((cycle) => cycle.routeFamily === "A");
    const candidates = [...cycles].reverse().map((cycle) => ({
      code: cycle.pathCode,
      area: "READING_COMPREHENSION",
      tenantId: null,
      enrolled: true,
      activeEnrollment: cycle.sequence === 3,
      completedEnrollment: cycle.sequence < 3,
      version: cycle.version,
    }));
    expect(selectPublishedPathCandidates(candidates, "tenant").map((cycle) => cycle.code)).toEqual(
      cycles.filter((cycle) => cycle.sequence < 4).map((cycle) => cycle.pathCode),
    );
  });
});
