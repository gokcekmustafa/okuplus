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
    expect(summarizeLearningRouteCoverage()).toEqual([
      {
        routeFamily: "A",
        authoredStationCount: 100,
        releasedSourceStationCount: 25,
        sourceVerifiedDraftStationCount: 65,
        sourceQualifiedStationCount: 90,
        sourceQualifiedRemainingStations: 110,
        authoredSourceReviewRequiredStationCount: 10,
        targetStationCount: 200,
        remainingAuthoredStations: 100,
        categoryDistribution: "PARTIALLY_CLASSIFIED",
        categoryCounts: {
          FAST_READING: 16,
          READING_COMPREHENSION: 18,
          COMMON_STRATEGIES: 13,
          INTEGRATED_PRACTICE: 14,
          MULTI_SKILL_ASSESSMENT: 14,
        },
        unclassifiedStationCount: 25,
        categoryTargets: {
          FAST_READING: 60,
          READING_COMPREHENSION: 80,
          COMMON_STRATEGIES: 20,
          INTEGRATED_PRACTICE: 25,
          MULTI_SKILL_ASSESSMENT: 15,
        },
        productionGraph: "NOT_VERIFIED",
      },
      ...(["B", "C", "D"] as const).map((routeFamily) => ({
        routeFamily,
        authoredStationCount: 85,
        releasedSourceStationCount: 5,
        sourceVerifiedDraftStationCount: 65,
        sourceQualifiedStationCount: 70,
        sourceQualifiedRemainingStations: 130,
        authoredSourceReviewRequiredStationCount: 15,
        targetStationCount: 200,
        remainingAuthoredStations: 115,
        categoryDistribution: "PARTIALLY_CLASSIFIED" as const,
        categoryCounts:
          routeFamily === "D"
            ? {
                FAST_READING: 15,
                READING_COMPREHENSION: 16,
                COMMON_STRATEGIES: 14,
                INTEGRATED_PRACTICE: 15,
                MULTI_SKILL_ASSESSMENT: 15,
              }
            : {
                FAST_READING: 16,
                READING_COMPREHENSION: 18,
                COMMON_STRATEGIES: 13,
                INTEGRATED_PRACTICE: 14,
                MULTI_SKILL_ASSESSMENT: 14,
              },
        unclassifiedStationCount: 10,
        categoryTargets: {
          FAST_READING: 60,
          READING_COMPREHENSION: 80,
          COMMON_STRATEGIES: 20,
          INTEGRATED_PRACTICE: 25,
          MULTI_SKILL_ASSESSMENT: 15,
        },
        productionGraph: "NOT_VERIFIED" as const,
      })),
    ]);
  });

  it("chains authored cycles in route order and respects their explicit release decisions", () => {
    expect(validateLearningRouteCatalog()).toEqual([]);
    const a = LEARNING_ROUTE_CYCLES.filter((cycle) => cycle.routeFamily === "A");
    expect(a.map((cycle) => cycle.manifest.steps.length)).toEqual([
      9,
      9,
      7,
      ...Array.from({ length: 15 }, () => 5),
    ]);
    expect(nextLearningRouteCycle(a[0]!.pathCode)?.pathCode).toBe(a[1]!.pathCode);
    expect(nextLearningRouteCycle(a[1]!.pathCode)?.pathCode).toBe(a[2]!.pathCode);
    expect(upcomingLearningRouteCycles(a[0]!.pathCode).map((cycle) => cycle.sequence)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
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
    expect(nextLearningRouteCycle(a[17]!.pathCode)).toBeNull();
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
      expect(cycles.map((cycle) => cycle.sequence)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
      ]);
      expect(nextLearningRouteCycle(cycles[0]!.pathCode)).toBe(cycles[1]);
      expect(cycles[0]!.publicationApproved()).toBe(true);
      expect(cycles[1]!.publicationApproved()).toBe(false);
      expect(cycles[1]!.manifest.steps).toHaveLength(5);
      expect(cycles[1]!.manifest.learningOutcomes[0]!.statement).not.toBe(
        cycles[0]!.manifest.learningOutcomes[0]!.statement,
      );
      expect(upcomingLearningRouteCycles(cycles[0]!.pathCode)).toEqual([
        cycles[1],
        cycles[2],
        cycles[3],
        cycles[4],
        cycles[5],
        cycles[6],
        cycles[7],
        cycles[8],
        cycles[9],
        cycles[10],
        cycles[11],
        cycles[12],
        cycles[13],
        cycles[14],
        cycles[15],
        cycles[16],
      ]);
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
      expect(nextLearningRouteCycle(cycles[16]!.pathCode)).toBeNull();
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
