import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAST_READING_RENDERERS } from "../src/modules/training/exercise-contract.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_ID,
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
  EDUCATION_V2_P1_A_CYCLE_4_VERSION,
  p1ACycle4AssessmentId,
  p1ACycle4ContentVersionId,
  p1ACycle4QuestionVersionId,
  p1ACycle4TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_EXPLICIT_PUBLICATION_APPROVED,
  EDUCATION_V2_P1_A_CYCLE_4_STATUS,
  isEducationV2P1ACycle4ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-4-release.js";
import {
  learningRouteCycle,
  matchesLearningRouteGraph,
} from "../src/curriculum/learning-route-catalog.js";
import {
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  cyclePitrTemporaryBranchName,
  cycle4PitrCompareSchemaEndpoint,
  cycle4PitrCompareSchemaRequest,
  cycle4PitrFailureRecord,
  cycle4PitrHttpFailure,
  cycle4PitrOptionalEndpointId,
  sanitizeCycle4PitrApiError,
  cycle4PitrTimestamp,
  cycle4PitrTimestampMatches,
  isCycle4PitrEvidenceValid,
  isCycle5To8PitrEvidenceValid,
  isCycle4PitrTimestampInWindow,
  normalizeNeonEndpointHost,
  parseCycle4PitrSchemaDiff,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-4.yml", import.meta.url),
  "utf8",
);
const seeder = readFileSync(
  new URL("../scripts/seed-education-v2-p1-a-cycle-4.ts", import.meta.url),
  "utf8",
);

describe("P1-A Cycle 4 authored program", () => {
  it("maps the five existing draft stations to a complete, ordered path", () => {
    const { content, exercises, path } = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM;
    const steps = path.units.flatMap((unit) => unit.steps);

    expect(EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sequence).toBe(4);
    expect(EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations).toHaveLength(5);
    expect(path.code).toBe("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12");
    expect(steps).toHaveLength(5);
    expect(content).toHaveLength(5);
    expect(exercises).toHaveLength(5);
    expect(exercises.reduce((count, exercise) => count + exercise.questions.length, 0)).toBe(15);

    for (const [
      index,
      station,
    ] of EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations.entries()) {
      const contentRecord = content[index];
      const exercise = exercises[index];
      const step = steps[index];
      expect(contentRecord?.key).toBe(station.key);
      expect(contentRecord?.body).toBe(station.text);
      expect(exercise?.contentKey).toBe(station.key);
      expect(step?.key).toBe(station.key);
      expect(step?.prerequisiteStepKeys).toEqual(index === 0 ? undefined : [steps[index - 1]?.key]);
      expect(station.contentOrigin).toBe("ORIGINAL_AUTHORING");
      expect(station.provenanceStatus).toBe("REVIEW_REQUIRED");
      for (const question of station.questions) {
        expect(p1ACycle4QuestionVersionId(station.key, question.key)).toContain("-v4");
        expect(exercise?.questions.some((mapped) => mapped.key === question.key)).toBe(true);
        expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
      }
    }
    expect(steps.at(-1)?.type).toBe("ASSESSMENT");
    expect(EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.assessments).toHaveLength(1);
  });

  it("matches the real published Cycle 4 program graph and immutable resource IDs", () => {
    const program = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM;
    const cycle = learningRouteCycle(program.path.code);
    expect(cycle).toBeTruthy();
    expect(cycle?.programId).toBe(EDUCATION_V2_P1_A_CYCLE_4_ID);
    expect(cycle?.version).toBe(EDUCATION_V2_P1_A_CYCLE_4_VERSION);
    expect(cycle?.units.map(({ code }) => code)).toEqual(
      program.path.units.map(({ code }) => code),
    );

    const stepIds = new Map(
      program.path.units.flatMap((unit) =>
        unit.steps.map((step) => [step.key, `production-cycle-4-step:${step.key}`] as const),
      ),
    );
    const graph = {
      code: program.path.code,
      version: EDUCATION_V2_P1_A_CYCLE_4_VERSION,
      units: program.path.units.map((unit) => ({
        code: unit.code,
        status: "PUBLISHED",
        steps: unit.steps.map((step, index) => ({
          id: stepIds.get(step.key)!,
          stableKey: `${program.programId}:${step.key}`,
          type: step.type,
          position: index + 1,
          status: "PUBLISHED",
          isActive: true,
          prerequisiteStepId: step.prerequisiteStepKeys?.[0]
            ? stepIds.get(step.prerequisiteStepKeys[0])!
            : null,
          completionRule: {},
          contentVersionId: step.contentKey ? p1ACycle4ContentVersionId(step.contentKey) : null,
          exerciseTemplateVersionId: step.exerciseKey
            ? p1ACycle4TemplateVersionId(step.exerciseKey)
            : null,
          assessmentId: step.assessmentKey ? p1ACycle4AssessmentId(step.assessmentKey) : null,
        })),
      })),
    };

    expect(matchesLearningRouteGraph(graph)).toBe(true);
    expect(cycle?.publicationApproved()).toBe(true);
  });

  it("uses runtime renderers and deterministic choice scoring for each skill family", () => {
    const exercises = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises;
    expect(exercises).toHaveLength(5);
    for (const exercise of exercises) {
      const contract = exercise.contract;
      const expectedRenderer =
        contract.family === "ATTENTION_BURST"
          ? FAST_READING_RENDERERS.ATTENTION_BURST
          : contract.family === "RAPID_RECOGNITION"
            ? FAST_READING_RENDERERS.RAPID_RECOGNITION
            : contract.family === "PHRASE_CHUNKING"
              ? FAST_READING_RENDERERS.PHRASE_CHUNKING
              : "QUESTION_MULTIPLE_CHOICE";
      expect(contract.rendererKey).toBe(expectedRenderer);
      expect(contract.scoring.mode).toBe("DETERMINISTIC");
      expect(contract.interactionType).toBe("MULTIPLE_CHOICE");
    }
  });

  it("keeps production provisioning manual, fingerprinted, idempotent, and limited to Cycle 4", () => {
    const cycle = learningRouteCycle(EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.code);
    expect(EDUCATION_V2_P1_A_CYCLE_4_STATUS).toBe("PUBLISHED");
    expect(EDUCATION_V2_P1_A_CYCLE_4_EXPLICIT_PUBLICATION_APPROVED).toBe(true);
    expect(isEducationV2P1ACycle4ProductionAssignmentEnabled()).toBe(true);
    expect(cycle?.publicationApproved()).toBe(true);

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("${{ secrets.PRODUCTION_DATABASE_URL }}");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/production-migration-forensics.ts");
    expect(workflow).toContain("scripts/verify-canonical-placement-migration-policy.ts");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("${{ secrets.NEON_API_KEY }}");
    expect(workflow).toContain("scripts/production-cycle4-pitr-restore-evidence.ts");
    expect(workflow).toContain("Enforce PITR evidence before Cycle 4 apply");
    expect(workflow).toContain('schema.method !== "NEON_COMPARE_SCHEMA_API"');
    expect(workflow).toContain("schema.diffIsEmpty !== true");
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-4.ts --dry-run");
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-4.ts --apply");
    expect(workflow).toContain("PREVIOUS_47_STATIONS=NOT_TOUCHED");
    expect(workflow).toContain("STUDENT_ASSIGNMENTS_AND_PROGRESS=NOT_TOUCHED");
    expect(workflow).not.toContain("production_backup_confirmation:");
    expect(workflow).not.toContain("${{ inputs.production_backup_confirmation }}");
    expect(workflow).not.toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow.indexOf("Create and verify isolated Neon PITR restore evidence")).toBeLessThan(
      workflow.indexOf("Apply Cycle 4 graph only"),
    );
    expect(workflow).toContain("f0166391faa1cfef4857097ad0deb127668bbda2");
    expect(workflow).toContain(
      "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLE_4_PRODUCTION_EDITORIAL_RELEASE_F0166391FAA1CFEF4857097AD0DEB127668BBDA2",
    );
    expect(workflow).not.toContain("Cycle 3");
    expect(workflow).not.toContain("prisma migrate");

    expect(seeder).toContain(
      'Promise<"MISSING" | "EXISTING" | "SKILL_LINKS_MISSING" | "CONFLICT">',
    );
    expect(seeder).toContain('state === "SKILL_LINKS_MISSING"');
    expect(seeder).toContain("ensureContentSkillLinks");
    expect(seeder).toContain('state: "SKILL_LINKS_REPAIRED"');
    expect(seeder).toContain("production APPLY yalnızca korumalı master workflow");
    expect(seeder).toContain("assertPitrRestoreEvidence");
    expect(seeder).toContain("contentOrigin: plan.sourceStation.contentOrigin");
    expect(seeder).toContain("provenanceStatus: plan.sourceStation.provenanceStatus");
    expect(seeder).toContain('routeFamily: "P1-A-CYCLE-4"');
    expect(seeder).toContain("stableKey: `EDU-V2-P1-A-CYCLE-4-");
    expect(seeder).toContain("sourceReference: plan.sourceStation.sourceReference");
    expect(seeder).not.toContain("studentLearningPath");
    expect(seeder).not.toContain("studentLearningStep");
    expect(seeder).not.toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow).toContain('"SKILL_LINKS_MISSING"');
    expect(workflow).toContain('"SKILL_LINKS_REPAIRED"');
  });

  it("creates a recent UTC timestamp strictly inside the PITR retention window", () => {
    const now = Date.UTC(2026, 9, 19, 12, 0, 0);
    const timestamp = cycle4PitrTimestamp(now);
    expect(timestamp).toBe("2026-10-19T11:58:00.000Z");
    expect(isCycle4PitrTimestampInWindow(timestamp, now, 21_600)).toBe(true);
    expect(isCycle4PitrTimestampInWindow("2026-10-19T05:59:00.000Z", now, 21_600)).toBe(false);
    expect(isCycle4PitrTimestampInWindow("2026-10-19T12:00:00.000Z", now, 21_600)).toBe(false);
  });

  it("accepts only an explicitly empty Neon compare_schema diff", () => {
    expect(parseCycle4PitrSchemaDiff({ diff: "" })).toEqual({ diffIsEmpty: true });
    expect(parseCycle4PitrSchemaDiff({ diff: "+ CREATE TABLE unexpected;" })).toBeNull();
    expect(parseCycle4PitrSchemaDiff({})).toBeNull();
    expect(parseCycle4PitrSchemaDiff({ diff: null })).toBeNull();
    expect(parseCycle4PitrSchemaDiff({ diff: "\n" })).toBeNull();
    expect(cycle4PitrCompareSchemaEndpoint(CYCLE4_PITR_PROJECT_ID, "br-target-1")).toBe(
      `/projects/${CYCLE4_PITR_PROJECT_ID}/branches/br-target-1/compare_schema`,
    );
    const comparison = cycle4PitrCompareSchemaRequest({
      projectId: CYCLE4_PITR_PROJECT_ID,
      targetBranchId: "br-restored-target",
      baseBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
      baseTimestamp: "2026-10-19T11:58:00.000Z",
      databaseName: "oku_plus",
    });
    const comparisonUrl = new URL(comparison.requestPath, "https://console.neon.tech/api/v2");
    expect(comparison.endpoint).toContain("/branches/br-restored-target/compare_schema");
    expect(comparisonUrl.searchParams.get("base_branch_id")).toBe(CYCLE4_PITR_SOURCE_BRANCH_ID);
    expect(comparisonUrl.searchParams.get("db_name")).toBe("oku_plus");
    expect(comparisonUrl.searchParams.get("base_timestamp")).toBe("2026-10-19T11:58:00.000Z");
    expect(normalizeNeonEndpointHost("ep-example-123-pooler.us-east-2.aws.neon.tech")).toBe(
      "ep-example-123.us-east-2.aws.neon.tech",
    );
  });

  it("uses branch-read metadata as authoritative when the create response omits optional fields", () => {
    expect(cycle4PitrOptionalEndpointId({ id: "ep-restored-123" })).toBe("ep-restored-123");
    expect(cycle4PitrOptionalEndpointId({ host: "ep-restored.example.neon.tech" })).toBeNull();
    expect(cycle4PitrOptionalEndpointId(null)).toBeNull();
    expect(cycle4PitrTimestampMatches(undefined, "2026-10-19T11:58:00.000Z")).toBe(false);
    expect(cycle4PitrTimestampMatches("2026-10-19T11:58:00.500Z", "2026-10-19T11:58:00.000Z")).toBe(
      true,
    );
    expect(cycle4PitrTimestampMatches("2026-10-19T11:58:02.000Z", "2026-10-19T11:58:00.000Z")).toBe(
      false,
    );
  });

  it("records sanitized PITR API failure details without credentials or personal data", () => {
    const endpoint = cycle4PitrCompareSchemaEndpoint(CYCLE4_PITR_PROJECT_ID, "br-target-1");
    const failure = cycle4PitrFailureRecord(
      cycle4PitrHttpFailure(
        "PITR branch",
        endpoint,
        422,
        {
          code: "branch_name_conflict",
          message:
            "Branch rejected at https://console.neon.tech/private?token=hidden; postgresql://user:secret@example.test/db; owner@example.test",
        },
        "neon-req-123",
      ),
      "fallback",
    );
    expect(failure).toEqual({
      stage: "PITR branch",
      endpoint,
      httpStatus: 422,
      reason: "Neon Management API returned HTTP 422",
      apiErrorCode: "branch_name_conflict",
      apiErrorMessage: "Branch rejected at [URL redacted] [connection redacted] [email redacted]",
      requestId: "neon-req-123",
    });
    expect(JSON.stringify(failure)).not.toMatch(/https?:|Bearer|password|secret|postgresql:/iu);
  });

  it("drops malformed Neon diagnostic codes and request IDs", () => {
    expect(
      sanitizeCycle4PitrApiError(
        { code: "invalid code with spaces", message: "Invalid branch request" },
        "request id with spaces",
      ),
    ).toEqual({
      apiErrorCode: null,
      apiErrorMessage: "Invalid branch request",
      requestId: null,
    });
  });

  it("accepts only complete, read-only PITR evidence bound to this workflow attempt", () => {
    const nowMs = Date.parse("2026-10-19T12:00:00.000Z");
    const evidence = {
      schemaVersion: 2,
      pitrScope: "cycle4",
      status: "PASS",
      projectId: CYCLE4_PITR_PROJECT_ID,
      sourceBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
      historyRetentionSeconds: 21_600,
      productionTargetIdentity: "PASS",
      workflowRunId: "123456",
      workflowRunAttempt: "1",
      sourceCommit: "1".repeat(40),
      productionDatabaseWrites: false,
      productionBranchMutated: false,
      studentDataQueried: false,
      studentProgressChanged: false,
      sourceBranch: {
        id: CYCLE4_PITR_SOURCE_BRANCH_ID,
        projectId: CYCLE4_PITR_PROJECT_ID,
        name: "production",
        default: true,
      },
      targetBranch: {
        id: "br-isolated-test-12345678",
        projectId: CYCLE4_PITR_PROJECT_ID,
        parentId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        parentTimestamp: "2026-10-19T11:58:00.000Z",
        default: false,
        state: "ready",
        annotationMatchesRun: true,
        endpointBranchId: "br-isolated-test-12345678",
        endpointId: "ep-isolated-test-12345678",
        endpointType: "read_write",
        endpointState: "idle",
      },
      parentTimestamp: "2026-10-19T11:58:00.000Z",
      requestedParentTimestamp: "2026-10-19T11:58:00.000Z",
      schemaComparison: {
        result: "PASS",
        method: "NEON_COMPARE_SCHEMA_API",
        endpoint: cycle4PitrCompareSchemaEndpoint(
          CYCLE4_PITR_PROJECT_ID,
          "br-isolated-test-12345678",
        ),
        httpStatus: 200,
        baseBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        targetBranchId: "br-isolated-test-12345678",
        database: "oku_plus",
        baseTimestamp: "2026-10-19T11:58:00.000Z",
        diffIsEmpty: true,
        matches: true,
      },
      dataChecks: {
        result: "PASS",
        queryMode: "READ_ONLY",
        studentRecordsQueried: false,
        questionTextOrAnswerKeysQueried: false,
        requiredTables: CYCLE4_PITR_REQUIRED_TABLES,
        missingTables: [],
        aggregateCounts: {
          learningPaths: 1,
          learningUnits: 1,
          learningSteps: 1,
          content: 1,
          contentVersions: 1,
          exerciseTemplates: 1,
          exerciseTemplateVersions: 1,
          questions: 1,
          questionVersions: 1,
          assessments: 1,
          successfulMigrations: 1,
        },
      },
      restoredDatabaseIdentity: {
        result: "PASS",
        transactionReadOnly: true,
        database: "oku_plus",
        role: "oku_app",
        port: 5432,
        schema: "public",
        targetEndpointHostMatchedNeonApi: true,
      },
      productionSourceUnchanged: {
        result: "PASS",
        id: CYCLE4_PITR_SOURCE_BRANCH_ID,
        name: "production",
        default: true,
      },
    };
    const expected = {
      runId: "123456",
      runAttempt: "1",
      sha: "1".repeat(40),
      database: "oku_plus",
      role: "oku_app",
      port: "5432",
      nowMs,
    };

    expect(isCycle4PitrEvidenceValid(evidence, expected)).toBe(true);
    const legacyCycle4Evidence = { ...evidence };
    delete (legacyCycle4Evidence as { pitrScope?: string }).pitrScope;
    expect(isCycle4PitrEvidenceValid(legacyCycle4Evidence, expected)).toBe(true);
    expect(
      isCycle5To8PitrEvidenceValid(
        {
          ...evidence,
          schemaVersion: 5,
          pitrScope: "cycle5-8",
          graphScope: "CYCLE_5_ONLY",
          targetBranch: {
            ...evidence.targetBranch,
            name: cyclePitrTemporaryBranchName("cycle5-8", expected.runId, expected.runAttempt),
            annotationMatchesRunAttempt: true,
          },
        },
        { ...expected, scope: "cycle5-8", graphScope: "CYCLE_5_ONLY" },
      ),
    ).toBe(true);
    expect(
      isCycle5To8PitrEvidenceValid(evidence, {
        ...expected,
        scope: "cycle5-8",
        graphScope: "CYCLE_5_ONLY",
      }),
    ).toBe(false);
    const normalizedParentTimestamp = "2026-10-19T11:57:59.500Z";
    expect(
      isCycle4PitrEvidenceValid(
        {
          ...evidence,
          targetBranch: { ...evidence.targetBranch, parentTimestamp: normalizedParentTimestamp },
          parentTimestamp: normalizedParentTimestamp,
          schemaComparison: {
            ...evidence.schemaComparison,
            baseTimestamp: normalizedParentTimestamp,
          },
        },
        expected,
      ),
    ).toBe(true);
    expect(isCycle4PitrEvidenceValid(evidence, { ...expected, runAttempt: "2" })).toBe(false);
    expect(
      isCycle4PitrEvidenceValid(
        { ...evidence, dataChecks: { ...evidence.dataChecks, queryMode: "READ_WRITE" } },
        expected,
      ),
    ).toBe(false);
    expect(
      isCycle4PitrEvidenceValid(
        { ...evidence, schemaComparison: { ...evidence.schemaComparison, diffIsEmpty: false } },
        expected,
      ),
    ).toBe(false);
    expect(
      isCycle4PitrEvidenceValid(
        { ...evidence, schemaComparison: { ...evidence.schemaComparison, httpStatus: 500 } },
        expected,
      ),
    ).toBe(false);
  });
});
