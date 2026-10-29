import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEARNING_ROUTE_CYCLES,
  sourcePrimarySkillCodesForRouteStep,
  sourceContentSkillTargetsForRouteStep,
} from "../src/curriculum/learning-route-catalog.js";
import {
  buildProductionLearningRouteAudit,
  classifyContentVersionLink,
  classifySkillLink,
  productionLearningRouteAuditStatus,
  type ProductionLearningRoutePathSnapshot,
} from "../src/curriculum/production-learning-route-audit.js";
import { mapCurriculumSkillCodesToStoredSkillCodes } from "../src/curriculum/learning-step-skill-link.js";

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
        const expectedSkillCodes = [
          ...new Set(
            expected.learningOutcomeKeys.flatMap(
              (key) =>
                cycle.manifest.learningOutcomes.find((outcome) => outcome.key === key)
                  ?.targetSkillCodes ?? [],
            ),
          ),
        ];
        const mappedSkillTargets = mapCurriculumSkillCodesToStoredSkillCodes(expectedSkillCodes);
        const hasSingleOutcomeSkill = mappedSkillTargets.storedSkillCodes.length === 1;
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
          contentVersionLinkState: expected.content ? "PUBLISHED" : "NOT_REQUIRED",
          contentVersionFallbackReady: false,
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
          skillCode: hasSingleOutcomeSkill
            ? (mappedSkillTargets.storedSkillCodes[0] ?? null)
            : null,
          skillCategory: "COMPREHENSION",
          linkedContentSkillCodes: mappedSkillTargets.storedSkillCodes,
          unresolvedLinkedContentSkillCount: 0,
          linkedQuestionSkillCodes: mappedSkillTargets.storedSkillCodes,
          unresolvedLinkedQuestionSkillCount: 0,
          allowedAdditionalSkillCodes: [],
          expectedSkillCodes,
          expectedStoredSkillCodes: mappedSkillTargets.storedSkillCodes,
          unmappedExpectedSkillCodes: mappedSkillTargets.unmappedSkillCodes,
          skillLinkState: expectedSkillCodes.length
            ? hasSingleOutcomeSkill
              ? "MATCHED"
              : "MATCHED_BY_CONTENT_SKILLS"
            : "NOT_REQUIRED",
          warningCodes: [],
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
    expect(workflow).toContain('.routeIntegrityStatus // "UNKNOWN"');
    expect(workflow).toContain('.dataQualityStatus // "UNKNOWN"');
    expect(workflow).toContain('.auditRoleVisibility.tenantAndEnrollmentRows // "UNKNOWN"');
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
    expect(script).toContain('operation: "PLAN_ONLY"');
    expect(script).toContain("buildContentSkillPlan");
    expect(script).toContain("missingUniquePairCount");
    expect(script).toContain("unexpectedRelations");
    expect(script).toContain("sourceContentSkillTargetsForRouteStep");
  });

  it("maps a published source step to its content, skill code, and source reason", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const sourceStep = cycle.manifest.steps.find(
      (step) => step.content || step.exercise || step.assessment,
    )!;
    const targets = sourceContentSkillTargetsForRouteStep(
      cycle.pathCode,
      `${cycle.programId}:${sourceStep.stableKey}`,
    );

    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((target) => target.contentKey.length > 0)).toBe(true);
    expect(targets.every((target) => target.skillCode.length > 0)).toBe(true);
    expect(
      targets.every((target) =>
        ["SOURCE_PRIMARY_COMPETENCY", "LEARNING_OUTCOME_TARGET"].includes(target.reason),
      ),
    ).toBe(true);
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

  it("validates source-approved fixture graphs for 59 P1 routes and 305 steps, not live production state", () => {
    const approvedCycles = LEARNING_ROUTE_CYCLES.filter((cycle) => cycle.publicationApproved());
    expect(approvedCycles).toHaveLength(59);
    expect(approvedCycles.reduce((total, cycle) => total + cycle.manifest.steps.length, 0)).toBe(
      305,
    );
    for (const cycle of approvedCycles) {
      for (const outcome of cycle.manifest.learningOutcomes) {
        expect(
          mapCurriculumSkillCodesToStoredSkillCodes(outcome.targetSkillCodes).unmappedSkillCodes,
          `${cycle.pathCode}:${outcome.key}`,
        ).toEqual([]);
      }
    }

    const audit = buildProductionLearningRouteAudit({
      sourceCycles: approvedCycles,
      paths: approvedCycles.map((cycle) => publishedPath(cycle)),
      enrollments: [],
    });
    expect(audit.routeIntegrityStatus).toBe("PASS");
    expect(audit.status).toBe("PASS");
    expect(audit.dataQualityStatus).toBe("CLEAN");
    expect(audit.productionP1PublishedStepCount).toBe(305);
    expect(audit.blockedOrIncompletePathCount).toBe(0);
  });

  it("maps the nine reported A-cycle outcomes through the reviewed stored-skill taxonomy", () => {
    const cases = [
      [5, "EDU_V2_P1_A_EXPANSION_5_A5_STRATEGY", ["RC_INFERENCE", "RC_DETAIL"]],
      [9, "EDU_V2_P1_A_EXPANSION_9_A9_SNOW_LIGHT_SCATTERING", ["RC_INFERENCE", "RC_DETAIL"]],
      [9, "EDU_V2_P1_A_EXPANSION_9_A9_COMMON_SUNSET_MODEL", ["RC_INFERENCE"]],
      [12, "EDU_V2_P1_A_EXPANSION_12_A12_INTEGRATED_CLASSIFICATION", ["RC_DETAIL", "RC_INFERENCE"]],
      [14, "EDU_V2_P1_A_EXPANSION_14_A14_COMMON_SPACE_ROCK_TERMS", ["RC_DETAIL"]],
      [14, "EDU_V2_P1_A_EXPANSION_14_A14_INTEGRATED_SOLAR_ENERGY", ["RC_DETAIL", "RC_INFERENCE"]],
      [15, "EDU_V2_P1_A_EXPANSION_15_A15_COMMON_PLAN_VERSUS_RESULT", ["RC_DETAIL", "RC_INFERENCE"]],
      [
        15,
        "EDU_V2_P1_A_EXPANSION_15_A15_INTEGRATED_COLD_NIGHT_SOUND",
        ["RC_DETAIL", "RC_INFERENCE", "FAST_ATTENTION"],
      ],
      [
        16,
        "EDU_V2_P1_A_EXPANSION_16_A16_COMPREHENSION_ECOSYSTEM_SERVICES",
        ["RC_DETAIL", "RC_INFERENCE"],
      ],
    ] as const;

    for (const [sequence, stableKey, expectedStoredSkills] of cases) {
      const cycle = LEARNING_ROUTE_CYCLES.find(
        (candidate) => candidate.routeFamily === "A" && candidate.sequence === sequence,
      );
      const step = cycle?.manifest.steps.find((candidate) => candidate.stableKey === stableKey);
      expect(step, stableKey).toBeDefined();
      const rawSkillCodes = [
        ...new Set(
          step!.learningOutcomeKeys.flatMap(
            (key) =>
              cycle!.manifest.learningOutcomes.find((outcome) => outcome.key === key)
                ?.targetSkillCodes ?? [],
          ),
        ),
      ];
      const mapped = mapCurriculumSkillCodesToStoredSkillCodes(rawSkillCodes);
      expect(mapped.unmappedSkillCodes, stableKey).toEqual([]);
      expect(mapped.storedSkillCodes, stableKey).toEqual(expectedStoredSkills);
    }
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
            ? { ...step, issueCodes: ["CONTENT_VERSION_LINK_MISSING"] }
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
    expect(audit.routeIntegrityStatus).toBe("PARTIAL");
    expect(audit.status).toBe("PARTIAL");
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
    expect(audit.routeIntegrityStatus).toBe("PARTIAL");
  });

  it("distinguishes a missing skill link from an RLS-hidden or non-outcome target", () => {
    const expectedSkillCodes = ["RC_DETAIL"];
    expect(classifySkillLink({ expectedSkillCodes, skillId: null, skillCode: null })).toEqual({
      state: "MISSING_FOREIGN_KEY",
      warningCode: "SKILL_LINK_MISSING",
    });
    expect(classifySkillLink({ expectedSkillCodes, skillId: "skill-fk", skillCode: null })).toEqual(
      {
        state: "TARGET_UNRESOLVED",
        warningCode: "SKILL_LINK_TARGET_UNRESOLVED",
      },
    );
    expect(
      classifySkillLink({ expectedSkillCodes, skillId: "skill-fk", skillCode: "RC_MAIN_IDEA" }),
    ).toEqual({
      state: "OUTSIDE_OUTCOME_TARGETS",
      warningCode: "SKILL_LINK_OUTSIDE_OUTCOME_TARGETS",
      additionalWarningCodes: ["SKILL_LINK_MISSING"],
    });
    expect(
      classifySkillLink({ expectedSkillCodes, skillId: "skill-fk", skillCode: "RC_DETAIL" }),
    ).toEqual({ state: "MATCHED", warningCode: null });
  });

  it("represents multi-skill outcomes through linked content skills, not an arbitrary scalar", () => {
    const expectedSkillCodes = ["RC_INFERENCE", "RC_DETAIL"];
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE", "RC_DETAIL"],
      }),
    ).toEqual({ state: "MATCHED_BY_CONTENT_SKILLS", warningCode: null });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE"],
      }),
    ).toEqual({ state: "MISSING_FOREIGN_KEY", warningCode: "SKILL_LINK_MISSING" });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE"],
        linkedQuestionSkillCodes: ["RC_DETAIL"],
      }),
    ).toEqual({ state: "MATCHED_BY_CONTENT_SKILLS", warningCode: null });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE", "RC_DETAIL", "FAST_ATTENTION"],
      }),
    ).toEqual({
      state: "OUTSIDE_OUTCOME_TARGETS",
      warningCode: "SKILL_LINK_OUTSIDE_OUTCOME_TARGETS",
    });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        allowedAdditionalSkillCodes: ["FAST_ATTENTION"],
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE", "RC_DETAIL", "FAST_ATTENTION"],
      }),
    ).toEqual({ state: "MATCHED_BY_CONTENT_SKILLS", warningCode: null });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE", "FAST_ATTENTION"],
      }),
    ).toEqual({
      state: "OUTSIDE_OUTCOME_TARGETS",
      warningCode: "SKILL_LINK_OUTSIDE_OUTCOME_TARGETS",
      additionalWarningCodes: ["SKILL_LINK_MISSING"],
    });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: "outside-skill",
        skillCode: "RC_MAIN_IDEA",
        linkedContentSkillCodes: ["RC_INFERENCE", "RC_DETAIL"],
      }),
    ).toEqual({
      state: "OUTSIDE_OUTCOME_TARGETS",
      warningCode: "SKILL_LINK_OUTSIDE_OUTCOME_TARGETS",
    });
    expect(
      classifySkillLink({
        expectedSkillCodes,
        skillId: null,
        skillCode: null,
        linkedContentSkillCodes: ["RC_INFERENCE", "RC_DETAIL"],
        unresolvedLinkedContentSkillCount: 1,
      }),
    ).toEqual({
      state: "TARGET_UNRESOLVED",
      warningCode: "SKILL_LINK_TARGET_UNRESOLVED",
    });
  });

  it("keeps unknown outcome-to-catalog mappings visible as data-quality warnings", () => {
    expect(
      classifySkillLink({
        expectedSkillCodes: [],
        unmappedExpectedSkillCodes: ["RC_UNREVIEWED_TARGET"],
        skillId: null,
        skillCode: null,
      }),
    ).toEqual({
      state: "UNMAPPED_OUTCOME_TARGET",
      warningCode: "SKILL_OUTCOME_TARGET_UNMAPPED",
    });
  });

  it("derives permitted supplemental skills only from the linked authored resources", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find(
      (candidate) => candidate.routeFamily === "A" && candidate.sequence === 5,
    )!;
    const step = cycle.manifest.steps.find((item) => item.content)!;
    const sourceSkills = sourcePrimarySkillCodesForRouteStep(
      cycle.pathCode,
      `${cycle.programId}:${step.stableKey}`,
    );
    expect(sourceSkills.length).toBeGreaterThan(0);
    expect(
      sourcePrimarySkillCodesForRouteStep(cycle.pathCode, `${cycle.programId}:NOT_A_SOURCE_STEP`),
    ).toEqual([]);
  });

  it("distinguishes a missing content FK from an unresolved target and an unpublished version", () => {
    expect(
      classifyContentVersionLink({
        required: true,
        fallbackResourceReady: false,
        contentVersionId: null,
        relationVisible: false,
        versionStatus: null,
        contentStatus: null,
        contentDeleted: null,
      }),
    ).toEqual({
      state: "MISSING_FOREIGN_KEY",
      issueCode: "CONTENT_VERSION_LINK_MISSING",
      warningCode: null,
    });
    expect(
      classifyContentVersionLink({
        required: true,
        fallbackResourceReady: false,
        contentVersionId: "content-fk",
        relationVisible: false,
        versionStatus: null,
        contentStatus: null,
        contentDeleted: null,
      }),
    ).toEqual({
      state: "TARGET_UNRESOLVED",
      issueCode: "CONTENT_VERSION_TARGET_UNRESOLVED",
      warningCode: null,
    });
    expect(
      classifyContentVersionLink({
        required: true,
        fallbackResourceReady: false,
        contentVersionId: "content-fk",
        relationVisible: true,
        versionStatus: "DRAFT",
        contentStatus: "PUBLISHED",
        contentDeleted: false,
      }),
    ).toEqual({
      state: "NOT_PUBLISHED",
      issueCode: "CONTENT_VERSION_NOT_PUBLISHED",
      warningCode: null,
    });
  });

  it("allows a missing small-study text link when the published training fallback is runnable", () => {
    expect(
      classifyContentVersionLink({
        required: false,
        fallbackResourceReady: true,
        contentVersionId: null,
        relationVisible: false,
        versionStatus: null,
        contentStatus: null,
        contentDeleted: null,
      }),
    ).toEqual({
      state: "OPTIONAL_FALLBACK_READY",
      issueCode: null,
      warningCode: null,
    });
  });

  it("does not count deliberately release-blocked source drafts as production graph failures", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const blockedCycle = { ...cycle, publicationApproved: () => false };
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [blockedCycle],
      paths: [],
      enrollments: [],
    });
    expect(
      audit.routes.find((item) => item.routeFamily === "A")?.source.releaseBlockedCycleCount,
    ).toBe(1);
    expect(audit.status).toBe("PASS");
  });

  it("reports skill-link discrepancies as data-quality warnings without failing route integrity", () => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const path = publishedPath(cycle);
    const missingSkillStepKey = path.units[0]?.steps[1]?.stableKey;
    const mismatchedSkillStepKey = path.units[0]?.steps[0]?.stableKey;
    const warned = {
      ...path,
      units: path.units.map((unit, unitIndex) => ({
        ...unit,
        steps: unit.steps.map((step, stepIndex) =>
          unitIndex === 0 && stepIndex === 0
            ? {
                ...step,
                skillLinkState: "OUTSIDE_OUTCOME_TARGETS",
                warningCodes: ["SKILL_LINK_OUTSIDE_OUTCOME_TARGETS"],
              }
            : unitIndex === 0 && stepIndex === 1
              ? {
                  ...step,
                  skillLinkState: "MISSING_FOREIGN_KEY",
                  warningCodes: ["SKILL_LINK_MISSING"],
                }
              : step,
        ),
      })),
    };
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [cycle],
      paths: [warned],
      enrollments: [],
    });
    const route = audit.routes.find((item) => item.routeFamily === "A")!;
    expect(route.production.publishedPathsWithWarnings).toBe(1);
    expect(route.production.dataQualityWarningCount).toBe(2);
    expect(route.production.dataQualityWarningsByCode).toEqual({
      SKILL_LINK_MISSING: 1,
      SKILL_LINK_OUTSIDE_OUTCOME_TARGETS: 1,
    });
    expect(route.paths[0]?.assignmentReadiness).toBe(
      cycle.publicationApproved() ? "READY_FOR_ASSIGNMENT" : "SOURCE_RELEASE_BLOCKED",
    );
    expect(audit.routeIntegrityStatus).toBe("PASS");
    expect(audit.status).toBe("PASS");
    expect(audit.dataQualityStatus).toBe("WARNINGS_PRESENT");
    expect(audit.dataQualityWarningCount).toBe(2);
    expect(audit.dataQualityWarningsByCode).toEqual({
      SKILL_LINK_OUTSIDE_OUTCOME_TARGETS: 1,
      SKILL_LINK_MISSING: 1,
    });
    expect(audit.dataQualityWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pathCode: cycle.pathCode,
          stepId: expect.any(String),
          stableKey: missingSkillStepKey,
          code: "SKILL_LINK_MISSING",
          expectedOutcomeSkillCodes: expect.any(Array),
          allowedAdditionalSkillCodes: expect.any(Array),
          linkedContentSkillCodes: expect.any(Array),
          linkedQuestionSkillCodes: expect.any(Array),
        }),
        expect.objectContaining({
          pathCode: cycle.pathCode,
          stableKey: mismatchedSkillStepKey,
          code: "SKILL_LINK_OUTSIDE_OUTCOME_TARGETS",
        }),
      ]),
    );
  });

  it.each([
    "CONTENT_VERSION_LINK_MISSING",
    "EXERCISE_TEMPLATE_VERSION_MISSING",
    "EXERCISE_HAS_NO_QUESTION_VERSIONS",
    "PREREQUISITE_MISSING_OR_OUTSIDE_PATH",
  ])("keeps blocking route issue %s as PARTIAL", (issueCode) => {
    const cycle = LEARNING_ROUTE_CYCLES.find((candidate) => candidate.routeFamily === "A")!;
    const path = publishedPath(cycle);
    const broken = {
      ...path,
      units: path.units.map((unit, unitIndex) => ({
        ...unit,
        steps: unit.steps.map((step, stepIndex) =>
          unitIndex === 0 && stepIndex === 0 ? { ...step, issueCodes: [issueCode] } : step,
        ),
      })),
    };
    const audit = buildProductionLearningRouteAudit({
      sourceCycles: [cycle],
      paths: [broken],
      enrollments: [],
    });
    expect(audit.routeIntegrityStatus).toBe("PARTIAL");
    expect(audit.status).toBe("PARTIAL");
    expect(audit.blockedOrIncompletePathCount).toBe(1);
  });

  it("does not pass the overall audit when RLS visibility is not verified", () => {
    expect(productionLearningRouteAuditStatus("PASS", "RLS_BYPASS_CONFIRMED")).toBe("PASS");
    expect(productionLearningRouteAuditStatus("PASS", "RLS_FILTER_POSSIBLE")).toBe("PARTIAL");
    expect(productionLearningRouteAuditStatus("PARTIAL", "RLS_BYPASS_CONFIRMED")).toBe("PARTIAL");
  });
});
