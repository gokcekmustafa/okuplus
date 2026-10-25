import { learningRouteCycle, matchesLearningRouteGraph } from "./learning-route-catalog.js";
import type { LearningRouteCycle } from "./learning-route-catalog.js";

export type ProductionLearningRouteStepSnapshot = {
  id: string;
  stableKey: string;
  position: number;
  type: string;
  status: string;
  isActive: boolean;
  prerequisiteStepId: string | null;
  completionRule: unknown;
  contentVersionId: string | null;
  contentVersionStatus: string | null;
  contentStatus: string | null;
  contentDeleted: boolean | null;
  exerciseTemplateVersionId: string | null;
  exerciseTemplateVersionStatus: string | null;
  templateStatus: string | null;
  templateDeleted: boolean | null;
  assessmentId: string | null;
  assessmentStatus: string | null;
  assessmentDeleted: boolean | null;
  assessmentTemplateVersionId: string | null;
  assessmentTemplateVersionStatus: string | null;
  assessmentTemplateStatus: string | null;
  assessmentTemplateDeleted: boolean | null;
  questionVersionIds: readonly string[];
  unpublishedQuestionVersionCount: number;
  linkedContentVersionIds: readonly string[];
  unpublishedLinkedContentVersionCount: number;
  skillCode: string | null;
  skillCategory: string | null;
  prerequisiteStableKey: string | null;
  prerequisitePathId: string | null;
  configuredPrerequisiteIds: readonly string[];
  configuredPrerequisiteStableKeys: readonly (string | null)[];
  expectedResourceLinksMatch: boolean;
  issueCodes: readonly string[];
};

export type ProductionLearningRouteUnitSnapshot = {
  code: string;
  position: number;
  status: string;
  steps: readonly ProductionLearningRouteStepSnapshot[];
};

export type ProductionLearningRoutePathSnapshot = {
  id: string;
  tenantId: string | null;
  code: string;
  version: number;
  area: string;
  status: string;
  deletedAt: Date | null;
  levelCode: string | null;
  units: readonly ProductionLearningRouteUnitSnapshot[];
};

export type ProductionLearningRouteEnrollmentCount = {
  learningPathId: string;
  routeStatus: string | null;
  count: number;
};

const ROUTE_FAMILIES = ["A", "B", "C", "D"] as const;

function routeFamilyForCode(code: string): (typeof ROUTE_FAMILIES)[number] | null {
  return (
    learningRouteCycle(code)?.routeFamily ??
    (code.match(/^EDUCATION_V2_P1_([ABCD])_/u)?.[1] as
      (typeof ROUTE_FAMILIES)[number] | undefined) ??
    null
  );
}

function counts(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function isPublishedPath(path: ProductionLearningRoutePathSnapshot): boolean {
  return path.status === "PUBLISHED" && path.deletedAt === null;
}

function publishedSteps(path: ProductionLearningRoutePathSnapshot) {
  if (!isPublishedPath(path)) return [];
  return path.units
    .filter((unit) => unit.status === "PUBLISHED")
    .flatMap((unit) => unit.steps.filter((step) => step.status === "PUBLISHED"));
}

function sourceGraphMatches(path: ProductionLearningRoutePathSnapshot): boolean {
  if (path.units.some((unit, index) => unit.position !== index + 1)) return false;
  return matchesLearningRouteGraph({
    code: path.code,
    version: path.version,
    units: path.units.map((unit) => ({
      code: unit.code,
      status: unit.status,
      steps: unit.steps.map((step) => ({
        id: step.id,
        stableKey: step.stableKey,
        type: step.type,
        position: step.position,
        status: step.status,
        isActive: step.isActive,
        prerequisiteStepId: step.prerequisiteStepId,
        completionRule: step.completionRule,
        contentVersionId: step.contentVersionId,
        exerciseTemplateVersionId: step.exerciseTemplateVersionId,
        assessmentId: step.assessmentId,
      })),
    })),
  });
}

function issueCodes(path: ProductionLearningRoutePathSnapshot): string[] {
  return path.units.flatMap((unit) => [
    ...(unit.status !== "PUBLISHED" ? [`UNIT_NOT_PUBLISHED:${unit.code}`] : []),
    ...unit.steps.flatMap((step) => step.issueCodes.map((code) => `${code}:${step.stableKey}`)),
  ]);
}

function graphAccessState(path: ProductionLearningRoutePathSnapshot): string {
  const cycle = learningRouteCycle(path.code);
  if (!cycle || cycle.version !== path.version) return "SOURCE_VERSION_UNMAPPED";
  let sourceReleaseApproved = false;
  try {
    sourceReleaseApproved = cycle.publicationApproved();
  } catch {
    return "SOURCE_RELEASE_UNVERIFIABLE";
  }
  if (!sourceReleaseApproved) return "SOURCE_RELEASE_BLOCKED";
  if (!isPublishedPath(path)) return "GRAPH_NOT_PUBLISHED";
  if (!sourceGraphMatches(path)) return "GRAPH_DOES_NOT_MATCH_SOURCE";
  if (issueCodes(path).length > 0) return "GRAPH_HAS_INCOMPLETE_LINKS";
  return "READY_FOR_ASSIGNMENT";
}

export function buildProductionLearningRouteAudit(input: {
  sourceCycles: readonly LearningRouteCycle[];
  paths: readonly ProductionLearningRoutePathSnapshot[];
  enrollments: readonly ProductionLearningRouteEnrollmentCount[];
}) {
  const enrollmentsByPath = new Map<string, ProductionLearningRouteEnrollmentCount[]>();
  for (const enrollment of input.enrollments) {
    const rows = enrollmentsByPath.get(enrollment.learningPathId) ?? [];
    rows.push(enrollment);
    enrollmentsByPath.set(enrollment.learningPathId, rows);
  }

  const routes = ROUTE_FAMILIES.map((routeFamily) => {
    const sourceCycles = input.sourceCycles.filter((cycle) => cycle.routeFamily === routeFamily);
    const routePaths = input.paths.filter((path) => routeFamilyForCode(path.code) === routeFamily);
    const publishedPaths = routePaths.filter(isPublishedPath);
    const steps = publishedPaths.flatMap(publishedSteps);
    const sourceExpectedCodes = new Set(sourceCycles.map((cycle) => cycle.pathCode));
    const sourceCyclesWithoutPublishedGraph = sourceCycles
      .filter(
        (cycle) =>
          !routePaths.some(
            (path) =>
              path.code === cycle.pathCode &&
              path.version === cycle.version &&
              isPublishedPath(path),
          ),
      )
      .map((cycle) => cycle.pathCode);
    const sourceReleaseBlockedPathCodes = sourceCycles
      .filter((cycle) => {
        try {
          return !cycle.publicationApproved();
        } catch {
          return true;
        }
      })
      .map((cycle) => cycle.pathCode);
    const missingPublishedSourcePaths = sourceCycles
      .filter((cycle) => {
        try {
          return (
            cycle.publicationApproved() &&
            !routePaths.some(
              (path) =>
                path.code === cycle.pathCode &&
                path.version === cycle.version &&
                isPublishedPath(path),
            )
          );
        } catch {
          return false;
        }
      })
      .map((cycle) => cycle.pathCode);
    const unmatchedProductionPaths = routePaths
      .filter((path) => !sourceExpectedCodes.has(path.code))
      .map((path) => `${path.code}@${path.version}`);

    const byType = counts(steps.map((step) => step.type));
    const bySkillCategory = counts(steps.map((step) => step.skillCategory ?? "UNCLASSIFIED"));
    const enrollmentCounts = routePaths.flatMap((path) =>
      (enrollmentsByPath.get(path.id) ?? []).map((row) => ({
        pathCode: path.code,
        pathVersion: path.version,
        routeStatus: row.routeStatus ?? "LEGACY_NULL",
        countVisibleToAuditRole: row.count,
      })),
    );

    return {
      routeFamily,
      source: {
        cycleCount: sourceCycles.length,
        authoredStepCount: sourceCycles.reduce(
          (total, cycle) => total + cycle.manifest.steps.length,
          0,
        ),
        releaseApprovedCycleCount: sourceCycles.filter((cycle) => {
          try {
            return cycle.publicationApproved();
          } catch {
            return false;
          }
        }).length,
        releaseBlockedCycleCount: sourceCycles.filter((cycle) => {
          try {
            return !cycle.publicationApproved();
          } catch {
            return true;
          }
        }).length,
      },
      production: {
        pathRecordCount: routePaths.length,
        pathStatuses: counts(routePaths.map((path) => path.status)),
        publishedPathCount: publishedPaths.length,
        publishedUnitCount: publishedPaths.reduce(
          (total, path) => total + path.units.filter((unit) => unit.status === "PUBLISHED").length,
          0,
        ),
        publishedStepCount: steps.length,
        activePublishedStepCount: steps.filter((step) => step.isActive).length,
        inactivePublishedStepCount: steps.filter((step) => !step.isActive).length,
        unitStatuses: counts(routePaths.flatMap((path) => path.units.map((unit) => unit.status))),
        stepStatuses: counts(
          routePaths.flatMap((path) =>
            path.units.flatMap((unit) => unit.steps.map((step) => step.status)),
          ),
        ),
        nonPublishedStepCount: routePaths
          .filter(isPublishedPath)
          .flatMap((path) => path.units)
          .flatMap((unit) => unit.steps)
          .filter((step) => step.status !== "PUBLISHED").length,
        publishedStepsByType: byType,
        publishedStepsBySkillCategory: bySkillCategory,
        missingPublishedSourcePaths,
        sourceCyclesWithoutPublishedGraph,
        sourceReleaseBlockedPathCodes,
        unmatchedProductionPaths,
        publishedPathSourceMatches: publishedPaths.filter(sourceGraphMatches).length,
        publishedPathsWithLinkIssues: publishedPaths.filter((path) => issueCodes(path).length > 0)
          .length,
      },
      visibleEnrollmentCountsByPathAndStatus: enrollmentCounts,
      paths: routePaths.map((path) => {
        const cycle = learningRouteCycle(path.code);
        const nextCycle = cycle?.nextPathCode
          ? input.sourceCycles.find((candidate) => candidate.pathCode === cycle.nextPathCode)
          : null;
        const published = isPublishedPath(path);
        const pathSteps = path.units.flatMap((unit) => unit.steps);
        return {
          code: path.code,
          version: path.version,
          scope: path.tenantId === null ? "GLOBAL" : "TENANT_SCOPED",
          area: path.area,
          levelCode: path.levelCode,
          status: path.status,
          deleted: path.deletedAt !== null,
          sourceVersionMapped: Boolean(cycle && cycle.version === path.version),
          sourceRelease: cycle
            ? (() => {
                try {
                  return cycle.publicationApproved() ? "APPROVED" : "BLOCKED";
                } catch {
                  return "UNVERIFIABLE";
                }
              })()
            : "UNMAPPED",
          sourceGraphMatches: sourceGraphMatches(path),
          assignmentReadiness: graphAccessState(path),
          currentStudentAccess: "NOT_VERIFIABLE_WITHOUT_STUDENT_CONTEXT",
          unitCount: path.units.length,
          publishedUnitCount: path.units.filter((unit) => unit.status === "PUBLISHED").length,
          publishedStepCount: pathSteps.filter((step) => step.status === "PUBLISHED").length,
          activePublishedStepCount: pathSteps.filter(
            (step) => step.status === "PUBLISHED" && step.isActive,
          ).length,
          inactivePublishedStepCount: pathSteps.filter(
            (step) => step.status === "PUBLISHED" && !step.isActive,
          ).length,
          nextSourcePathCode: cycle?.nextPathCode ?? null,
          nextSourceRelease: nextCycle
            ? (() => {
                try {
                  return nextCycle.publicationApproved() ? "APPROVED" : "BLOCKED";
                } catch {
                  return "UNVERIFIABLE";
                }
              })()
            : cycle?.nextPathCode
              ? "SOURCE_CYCLE_MISSING"
              : "END_OF_SOURCE_CHAIN",
          nextProductionPathPublished: cycle?.nextPathCode
            ? input.paths.some(
                (candidate) =>
                  candidate.tenantId === path.tenantId &&
                  candidate.code === cycle.nextPathCode &&
                  candidate.status === "PUBLISHED" &&
                  candidate.deletedAt === null,
              )
            : null,
          visibleEnrollmentCounts: (enrollmentsByPath.get(path.id) ?? []).map((row) => ({
            routeStatus: row.routeStatus ?? "LEGACY_NULL",
            countVisibleToAuditRole: row.count,
          })),
          issues: issueCodes(path),
          units: path.units.map((unit) => ({
            code: unit.code,
            position: unit.position,
            status: unit.status,
            steps: unit.steps.map((step) => ({
              stableKey: step.stableKey,
              position: step.position,
              type: step.type,
              status: step.status,
              isActive: step.isActive,
              skillCode: step.skillCode,
              skillCategory: step.skillCategory,
              contentVersionStatus: step.contentVersionStatus,
              contentStatus: step.contentStatus,
              exerciseTemplateVersionStatus: step.exerciseTemplateVersionStatus,
              assessmentStatus: step.assessmentStatus,
              questionVersionCount: step.questionVersionIds.length,
              unpublishedQuestionVersionCount: step.unpublishedQuestionVersionCount,
              linkedContentVersionCount: step.linkedContentVersionIds.length,
              unpublishedLinkedContentVersionCount: step.unpublishedLinkedContentVersionCount,
              prerequisiteStableKey: step.prerequisiteStableKey,
              configuredPrerequisiteStableKeys: step.configuredPrerequisiteStableKeys,
              expectedResourceLinksMatch: step.expectedResourceLinksMatch,
              issues: step.issueCodes,
            })),
          })),
          published,
        };
      }),
    };
  });

  const routeCodes = new Set(input.sourceCycles.map((cycle) => cycle.pathCode));
  const unmatchedP1Paths = input.paths
    .filter((path) => /^EDUCATION_V2_P1_/u.test(path.code) && !routeCodes.has(path.code))
    .map((path) => ({
      code: path.code,
      version: path.version,
      scope: path.tenantId === null ? "GLOBAL" : "TENANT_SCOPED",
      status: path.status,
      deleted: path.deletedAt !== null,
    }));
  const blockedOrIncompletePathCount = input.paths.filter(
    (path) =>
      /^EDUCATION_V2_P1_/u.test(path.code) && graphAccessState(path) !== "READY_FOR_ASSIGNMENT",
  ).length;
  const hasFailures =
    blockedOrIncompletePathCount > 0 ||
    routes.some(
      (route) =>
        route.source.releaseBlockedCycleCount > 0 ||
        route.production.missingPublishedSourcePaths.length > 0 ||
        route.production.unmatchedProductionPaths.length > 0 ||
        route.production.publishedPathsWithLinkIssues > 0,
    ) ||
    unmatchedP1Paths.length > 0;

  return {
    status: hasFailures ? "PARTIAL" : "PASS",
    sourceRouteCycleCount: input.sourceCycles.length,
    sourceStepCount: input.sourceCycles.reduce(
      (total, cycle) => total + cycle.manifest.steps.length,
      0,
    ),
    productionP1PathRecordCount: input.paths.filter((path) => /^EDUCATION_V2_P1_/u.test(path.code))
      .length,
    productionP1PublishedPathCount: input.paths.filter(
      (path) => /^EDUCATION_V2_P1_/u.test(path.code) && isPublishedPath(path),
    ).length,
    productionP1PublishedUnitCount: input.paths
      .filter((path) => /^EDUCATION_V2_P1_/u.test(path.code) && isPublishedPath(path))
      .reduce(
        (total, path) => total + path.units.filter((unit) => unit.status === "PUBLISHED").length,
        0,
      ),
    productionP1PublishedStepCount: input.paths
      .filter((path) => /^EDUCATION_V2_P1_/u.test(path.code) && isPublishedPath(path))
      .flatMap((path) => path.units)
      .flatMap((unit) => unit.steps)
      .filter((step) => step.status === "PUBLISHED").length,
    blockedOrIncompletePathCount,
    unmatchedP1Paths,
    routes,
    noStudentIdentitiesIncluded: true,
    questionTextAndAnswerKeysIncluded: false,
  };
}
