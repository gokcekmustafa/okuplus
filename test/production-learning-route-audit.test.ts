import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEARNING_ROUTE_CYCLES } from "../src/curriculum/learning-route-catalog.js";
import {
  buildProductionLearningRouteAudit,
  type ProductionLearningRoutePathSnapshot,
} from "../src/curriculum/production-learning-route-audit.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-learning-route-audit.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/audit-learning-routes-production.ts", import.meta.url),
  "utf8",
);

function publishedPath(
  cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!,
): ProductionLearningRoutePathSnapshot {
  const expectedByKey = new Map(cycle.manifest.steps.map((step) => [step.stableKey, step]));
  const idByKey = new Map(
    cycle.manifest.steps.map((step) => [
      `${cycle.programId}:${step.stableKey}`,
      `step-${step.stableKey}`,
    ]),
  );
  return {
    id: "internal-path-id",
    tenantId: null,
    code: cycle.pathCode,
    version: cycle.version,
    area: "READING_COMPREHENSION",
    status: "PUBLISHED",
    deletedAt: null,
    levelCode: "G9_12",
    units: cycle.units.map((unit, unitIndex) => ({
      code: unit.code,
      position: unitIndex + 1,
      status: "PUBLISHED",
      steps: unit.steps.map((item, index) => {
        const expected = expectedByKey.get(item.key)!;
        const stableKey = `${cycle.programId}:${item.key}`;
        const questionVersionIds =
          expected.exercise?.questionVersionIds ?? expected.assessment?.questionVersionIds ?? [];
        const prerequisites = expected.prerequisiteKeys.map((key) =>
          idByKey.get(`${cycle.programId}:${key}`)!,
        );
        return {
          id: idByKey.get(stableKey)!,
          stableKey,
          position: index + 1,
          type: expected.type,
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: null,
          completionRule: { prerequisiteStepIds: prerequisites },
          contentVersionId: expected.content?.versionId ?? null,
          contentVersionStatus: expected.content ? "PUBLISHED" : null,
          contentStatus: expected.content ? "PUBLISHED" : null,
          contentDeleted: expected.content ? false : null,
          exerciseTemplateVersionId: expected.exercise?.versionId ?? null,
          exerciseTemplateVersionStatus: expected.exercise ? "PUBLISHED" : null,
          templateStatus: expected.exercise ? "PUBLISHED" : null,
          templateDeleted: expected.exercise ? false : null,
          assessmentId: expected.assessment?.versionId ?? null,
          assessmentStatus: expected.assessment ? "PUBLISHED" : null,
          assessmentDeleted: expected.assessment ? false : null,
          assessmentTemplateVersionId: null,
          assessmentTemplateVersionStatus: null,
          assessmentTemplateStatus: null,
          assessmentTemplateDeleted: null,
          questionVersionIds,
          unpublishedQuestionVersionCount: 0,
          linkedContentVersionIds: [],
          unpublishedLinkedContentVersionCount: 0,
          skillCode:
            expected.learningOutcomeKeys.flatMap(
              (key) =>
                cycle.manifest.learningOutcomes.find((outcome) => outcome.key === key)
                  ?.targetSkillCodes ?? [],
            )[0] ?? null,
          skillCategory: "COMPREHENSION",
          prerequisiteStableKey: null,
          prerequisitePathId: null,
          configuredPrerequisiteIds: prerequisites,
          configuredPrerequisiteStableKeys: expected.prerequisiteKeys.map(
            (key) => `${cycle.programId}:${key}`,
          ),
          expectedResourceLinksMatch: true,
          issueCodes: [],
        };
      }),
    })),
  };
}

describe("production A-D learning route audit", () => {
  it("uses a master-only protected workflow and requires the approved target identity", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain('test "${CONFIRM_AUDIT}" = "LEARNING_ROUTE_AUDIT"');
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).toContain("Audit all production P1 route graphs in a read-only transaction");
    expect(workflow).not.toContain("migrate deploy");
    expect(workflow).not.toContain("--apply");
  });

  it("makes the PostgreSQL transaction read-only before identity or curriculum queries", () => {
    const readOnlyIndex = script.indexOf("SET TRANSACTION READ ONLY");
    const identityIndex = script.indexOf("SELECT current_database()");
    const pathReadIndex = script.indexOf("tx.learningPath.findMany");
    expect(readOnlyIndex).toBeGreaterThan(-1);
    expect(readOnlyIndex).toBeLessThan(identityIndex);
    expect(identityIndex).toBeLessThan(pathReadIndex);
    expect(script).toContain('transactionMode: "READ ONLY"');
    expect(script).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(script).toContain("targetIdentityFingerprint");
    expect(script).toContain("rolbypassrls");
    expect(script).toContain("RLS_FILTER_POSSIBLE");
    expect(script.match(/tx\.\$executeRaw`SET TRANSACTION READ ONLY`/gu)).toHaveLength(1);
    expect(script).not.toContain("migrate deploy");
    expect(script).not.toContain("console.log(rawUrl)");
    expect(script).not.toMatch(
      /tx\.\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u,
    );
  });

  it("compares published graphs to source, classifies disabled routes and excludes internal IDs", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const path = publishedPath(cycle);
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [cycle],
      paths: [path],
      enrollments: [{ learningPathId: path.id, routeStatus: "ACTIVE", count: 2 }],
    });
    const route = audit.routes.find((item) => item.routeFamily === "A")!;
    expect(route.production.publishedPathSourceMatches).toBe(1);
    expect(route.paths[0]?.assignmentReadiness).toBe(
      cycle.publicationApproved() ? "READY_FOR_ASSIGNMENT" : "SOURCE_RELEASE_BLOCKED",
    );
    expect(route.paths[0]?.visibleEnrollmentCounts).toEqual([
      { routeStatus: "ACTIVE", countVisibleToAuditRole: 2 },
    ]);
    expect(JSON.stringify(audit)).not.toContain("internal-path-id");
  });

  it("reports missing published source cycles and unknown production path codes without treating them as ready", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [cycle],
      paths: [
        {
          ...publishedPath(cycle),
          id: "unexpected-path",
          code: "EDUCATION_V2_P1_A_UNMAPPED_CYCLE_999_G8_12",
        },
      ],
      enrollments: [],
    });
    const route = audit.routes.find((item) => item.routeFamily === "A")!;
    expect(route.production.missingPublishedSourcePaths).toContain(cycle.pathCode);
    expect(route.production.unmatchedProductionPaths).toContain(
      "EDUCATION_V2_P1_A_UNMAPPED_CYCLE_999_G8_12@1",
    );
    expect(audit.status).toBe("PARTIAL");
  });

  it("does not call a graph assignable when its published link has an issue", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const path = publishedPath(cycle);
    const broken = {
      ...path,
      units: path.units.map((unit, unitIndex) => ({
        ...unit,
        steps: unit.steps.map((step, stepIndex) =>
          unitIndex === 0 && stepIndex === 0
            ? { ...step, issueCodes: ["CONTENT_VERSION_MISSING"] }
            : step,
        ),
      })),
    };
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [cycle],
      paths: [broken],
      enrollments: [],
    });
    expect(
      audit.routes.find((item) => item.routeFamily === "A")?.paths[0]?.assignmentReadiness,
    ).toBe("GRAPH_HAS_INCOMPLETE_LINKS");
  });

  it("rejects a production unit sequence that differs from the source route order", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const path = publishedPath(cycle);
    const reordered = {
      ...path,
      units: path.units.map((unit, index) =>
        index === 0 ? { ...unit, position: unit.position + 1 } : unit,
      ),
    };
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [cycle],
      paths: [reordered],
      enrollments: [],
    });
    expect(
      audit.routes.find((item) => item.routeFamily === "A")?.paths[0]?.sourceGraphMatches,
    ).toBe(false);
    expect(
      audit.routes.find((item) => item.routeFamily === "A")?.paths[0]?.assignmentReadiness,
    ).toBe("GRAPH_DOES_NOT_MATCH_SOURCE");
  });
});
