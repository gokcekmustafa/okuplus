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
  contentVersionLinkState: ContentVersionLinkState;
  contentVersionFallbackReady: boolean;
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
  linkedContentSkillCodes: readonly string[];
  unresolvedLinkedContentSkillCount: number;
  linkedQuestionSkillCodes: readonly string[];
  unresolvedLinkedQuestionSkillCount: number;
  expectedSkillCodes: readonly string[];
  expectedStoredSkillCodes: readonly string[];
  unmappedExpectedSkillCodes: readonly string[];
  skillLinkState: SkillLinkState;
  warningCodes: readonly string[];
  prerequisiteStableKey: string | null;
  prerequisitePathId: string | null;
  configuredPrerequisiteIds: readonly string[];
  configuredPrerequisiteStableKeys: readonly (string | null)[];
  expectedResourceLinksMatch: boolean;
  issueCodes: readonly string[];
};

export type SkillLinkState =
  | "NOT_REQUIRED"
  | "MISSING_FOREIGN_KEY"
  | "TARGET_UNRESOLVED"
  | "MATCHED"
  | "MATCHED_BY_CONTENT_SKILLS"
  | "UNMAPPED_OUTCOME_TARGET"
  | "OUTSIDE_OUTCOME_TARGETS";

export type ContentVersionLinkState =
  | "NOT_REQUIRED"
  | "MISSING_FOREIGN_KEY"
  | "TARGET_UNRESOLVED"
  | "PUBLISHED"
  | "NOT_PUBLISHED"
  | "OPTIONAL_FALLBACK_READY"
  | "OPTIONAL_FALLBACK_TARGET_UNRESOLVED"
  | "OPTIONAL_FALLBACK_NOT_PUBLISHED";

export type ProductionLearningRouteIntegrityStatus = "PASS" | "PARTIAL";
export type ProductionLearningRouteDataQualityStatus = "CLEAN" | "WARNINGS_PRESENT";
export type ProductionLearningRouteVisibilityStatus =
  "RLS_BYPASS_CONFIRMED" | "RLS_FILTER_POSSIBLE";

/** RLS uncertainty remains a blocker even when all visible route graphs are sound. */
export function productionLearningRouteAuditStatus(
  routeIntegrityStatus: ProductionLearningRouteIntegrityStatus,
  visibilityStatus: ProductionLearningRouteVisibilityStatus,
): ProductionLearningRouteIntegrityStatus {
  return routeIntegrityStatus === "PASS" && visibilityStatus === "RLS_BYPASS_CONFIRMED"
    ? "PASS"
    : "PARTIAL";
}

/** Distinguishes a missing link from a linked row hidden by RLS. */
export function classifySkillLink(input: {
  expectedSkillCodes: readonly string[];
  unmappedExpectedSkillCodes?: readonly string[];
  skillId: string | null;
  skillCode: string | null;
  linkedContentSkillCodes?: readonly string[];
  unresolvedLinkedContentSkillCount?: number;
  linkedQuestionSkillCodes?: readonly string[];
  unresolvedLinkedQuestionSkillCount?: number;
}): { state: SkillLinkState; warningCode: string | null } {
  const unmappedExpectedSkillCodes = input.unmappedExpectedSkillCodes ?? [];
  if (input.expectedSkillCodes.length === 0 && unmappedExpectedSkillCodes.length === 0)
    return { state: "NOT_REQUIRED", warningCode: null };
  if (unmappedExpectedSkillCodes.length > 0)
    return { state: "UNMAPPED_OUTCOME_TARGET", warningCode: "SKILL_OUTCOME_TARGET_UNMAPPED" };

  const linkedContentSkillCodes = [...new Set(input.linkedContentSkillCodes ?? [])];
  const unresolvedLinkedContentSkillCount = input.unresolvedLinkedContentSkillCount ?? 0;
  const linkedQuestionSkillCodes = [...new Set(input.linkedQuestionSkillCodes ?? [])];
  const unresolvedLinkedQuestionSkillCount = input.unresolvedLinkedQuestionSkillCount ?? 0;
  if (input.skillId && !input.skillCode)
    return { state: "TARGET_UNRESOLVED", warningCode: "SKILL_LINK_TARGET_UNRESOLVED" };
  if (unresolvedLinkedContentSkillCount > 0 || unresolvedLinkedQuestionSkillCount > 0)
    return { state: "TARGET_UNRESOLVED", warningCode: "SKILL_LINK_TARGET_UNRESOLVED" };
  if (input.skillId && input.skillCode && !input.expectedSkillCodes.includes(input.skillCode))
    return {
      state: "OUTSIDE_OUTCOME_TARGETS",
      warningCode: "SKILL_LINK_OUTSIDE_OUTCOME_TARGETS",
    };

  // Content and question competencies are broader instructional metadata than
  // the step's single scalar outcome. They may legitimately include related
  // training skills, so only an explicit LearningStep.skillId can be
  // classified as an outside-outcome assignment. For multi-skill outcomes,
  // require the linked content/question graph to cover every mapped target.
  const linkedSkillCodes = new Set([...linkedContentSkillCodes, ...linkedQuestionSkillCodes]);

  if (input.expectedSkillCodes.every((code) => linkedSkillCodes.has(code)))
    return { state: "MATCHED_BY_CONTENT_SKILLS", warningCode: null };

  if (input.skillId && input.skillCode && input.expectedSkillCodes.length === 1)
    return { state: "MATCHED", warningCode: null };
  return { state: "MISSING_FOREIGN_KEY", warningCode: "SKILL_LINK_MISSING" };
}

/** An FK whose row is not visible cannot be called absent without bypassing RLS. */
export function classifyContentVersionLink(input: {
  required: boolean;
  fallbackResourceReady: boolean;
  contentVersionId: string | null;
  relationVisible: boolean;
  versionStatus: string | null;
  contentStatus: string | null;
  contentDeleted: boolean | null;
}): {
  state: ContentVersionLinkState;
  issueCode: string | null;
  warningCode: string | null;
} {
  if (!input.contentVersionId) {
    if (input.fallbackResourceReady)
      return { state: "OPTIONAL_FALLBACK_READY", issueCode: null, warningCode: null };
    if (!input.required) return { state: "NOT_REQUIRED", issueCode: null, warningCode: null };
    return {
      state: "MISSING_FOREIGN_KEY",
      issueCode: "CONTENT_VERSION_LINK_MISSING",
      warningCode: null,
    };
  }
  if (!input.relationVisible) {
    if (input.fallbackResourceReady)
      return {
        state: "OPTIONAL_FALLBACK_TARGET_UNRESOLVED",
        issueCode: null,
        warningCode: "CONTENT_VERSION_TARGET_UNRESOLVED",
      };
    if (!input.required)
      return {
        state: "TARGET_UNRESOLVED",
        issueCode: null,
        warningCode: "CONTENT_VERSION_TARGET_UNRESOLVED",
      };
    return {
      state: "TARGET_UNRESOLVED",
      issueCode: "CONTENT_VERSION_TARGET_UNRESOLVED",
      warningCode: null,
    };
  }
  if (
    input.versionStatus !== "PUBLISHED" ||
    input.contentStatus !== "PUBLISHED" ||
    input.contentDeleted !== false
  ) {
    if (input.fallbackResourceReady)
      return {
        state: "OPTIONAL_FALLBACK_NOT_PUBLISHED",
        issueCode: null,
        warningCode: "CONTENT_VERSION_NOT_PUBLISHED_OPTIONAL_FALLBACK",
      };
    return {
      state: "NOT_PUBLISHED",
      issueCode: "CONTENT_VERSION_NOT_PUBLISHED",
      warningCode: null,
    };
  }
  return { state: "PUBLISHED", issueCode: null, warningCode: null };
}

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

function warningCodes(path: ProductionLearningRoutePathSnapshot): string[] {
  return path.units
    .filter((unit) => unit.status === "PUBLISHED")
    .flatMap((unit) =>
      unit.steps
        .filter((step) => step.status === "PUBLISHED")
        .flatMap((step) => step.warningCodes.map((code) => `${code}:${step.stableKey}`)),
    );
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

  const dataQualityWarningDetails = input.paths.filter(isPublishedPath).flatMap((path) =>
    path.units
      .filter((unit) => unit.status === "PUBLISHED")
      .flatMap((unit) =>
        unit.steps
          .filter((step) => step.status === "PUBLISHED")
          .flatMap((step) =>
            step.warningCodes.map((code) => ({
              routeFamily: routeFamilyForCode(path.code),
              pathCode: path.code,
              pathVersion: path.version,
              unitCode: unit.code,
              stableKey: step.stableKey,
              code,
            })),
          ),
      ),
  );
  const dataQualityWarningsByCode = counts(dataQualityWarningDetails.map((item) => item.code));
  const dataQualityStatus: ProductionLearningRouteDataQualityStatus =
    dataQualityWarningDetails.length > 0 ? "WARNINGS_PRESENT" : "CLEAN";

  const routes = ROUTE_FAMILIES.map((routeFamily) => {
    const sourceCycles = input.sourceCycles.filter((cycle) => cycle.routeFamily === routeFamily);
    const routePaths = input.paths.filter((path) => routeFamilyForCode(path.code) === routeFamily);
    const publishedPaths = routePaths.filter(isPublishedPath);
    const steps = publishedPaths.flatMap(publishedSteps);
    const routeDataQualityWarnings = dataQualityWarningDetails.filter(
      (warning) => warning.routeFamily === routeFamily,
    );
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
        publishedPathsWithWarnings: publishedPaths.filter((path) => warningCodes(path).length > 0)
          .length,
        dataQualityStatus: routeDataQualityWarnings.length > 0 ? "WARNINGS_PRESENT" : "CLEAN",
        dataQualityWarningCount: routeDataQualityWarnings.length,
        dataQualityWarningsByCode: counts(routeDataQualityWarnings.map((item) => item.code)),
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
              linkedContentSkillCodes: step.linkedContentSkillCodes,
              unresolvedLinkedContentSkillCount: step.unresolvedLinkedContentSkillCount,
              expectedSkillCodes: step.expectedSkillCodes,
              expectedStoredSkillCodes: step.expectedStoredSkillCodes,
              unmappedExpectedSkillCodes: step.unmappedExpectedSkillCodes,
              skillLinkState: step.skillLinkState,
              contentVersionLinkState: step.contentVersionLinkState,
              contentVersionFallbackReady: step.contentVersionFallbackReady,
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
              warnings: step.warningCodes,
            })),
          })),
          published,
          warnings: warningCodes(path),
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
      /^EDUCATION_V2_P1_/u.test(path.code) &&
      isPublishedPath(path) &&
      graphAccessState(path) !== "READY_FOR_ASSIGNMENT",
  ).length;
  const hasRouteIntegrityFailures =
    blockedOrIncompletePathCount > 0 ||
    routes.some(
      (route) =>
        route.production.missingPublishedSourcePaths.length > 0 ||
        route.production.unmatchedProductionPaths.length > 0 ||
        route.production.publishedPathsWithLinkIssues > 0,
    ) ||
    unmatchedP1Paths.length > 0;
  const routeIntegrityStatus: ProductionLearningRouteIntegrityStatus = hasRouteIntegrityFailures
    ? "PARTIAL"
    : "PASS";

  return {
    // `status` is retained as the route-integrity result for existing consumers.
    // Data-quality warnings remain visible below but do not imply an unusable route.
    status: routeIntegrityStatus,
    routeIntegrityStatus,
    dataQualityStatus,
    dataQualityWarningCount: dataQualityWarningDetails.length,
    dataQualityWarningsByCode,
    dataQualityWarnings: dataQualityWarningDetails,
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
