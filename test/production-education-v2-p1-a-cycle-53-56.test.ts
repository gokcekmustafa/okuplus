import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOptionLengthQuality } from "../src/curriculum/option-length-quality.js";
import {
  EDUCATION_V2_P1_A_CYCLE_53_56,
  EDUCATION_V2_P1_A_CYCLE_53_56_SEQUENCES,
  getEducationV2P1ACycle,
  p1ACycle5To8AssessmentId,
  p1ACycle5To8ContentVersionId,
  p1ACycle5To8QuestionVersionId,
  p1ACycle5To8TemplateVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-5-8-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS,
  EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT,
  EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_ID,
  educationV2P1ACycle53To56ProductionApproval,
  isEducationV2P1ACycle53To56ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-53-56-release.js";
import { educationV2P1ACycle5To8ScopeSequences } from "../src/curriculum/education-v2-p1-a-cycle-5-8-release.js";
import { isEducationV2P1ACycle5To8SeedRequestAuthorized } from "../src/curriculum/education-v2-p1-a-cycle-5-8-seed-policy.js";
import {
  CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_REQUIRED_TABLES,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  cycle4PitrCompareSchemaEndpoint,
  isCycle53To56PitrEvidenceValid,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import { validateCycle53To56ReadOnlyPlanReport } from "../scripts/verify-cycle53-56-plan-report.js";
import { buildEducationV2P0LearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";
import {
  LEARNING_ROUTE_CYCLES,
  learningRouteCycle,
  matchesLearningRouteGraph,
  nextLearningRouteCycle,
} from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-53-56.yml", import.meta.url),
  "utf8",
);
const migrationGate = readFileSync(
  new URL("../scripts/verify-cycle5-8-production-migration-gate.ts", import.meta.url),
  "utf8",
);
const seedScript = readFileSync(
  new URL("../scripts/seed-education-v2-p1-a-cycle-5-8.ts", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value)) ?? "";
}

function graphFor(sequence: number) {
  const cycle = getEducationV2P1ACycle(sequence)!;
  const { program, manifest } = cycle;
  return {
    code: program.path.code,
    version: manifest.cycleVersion,
    units: program.path.units.map((unit) => ({
      code: unit.code,
      status: "PUBLISHED",
      steps: unit.steps.map((step, index) => ({
        id: `cycle-${sequence}:${step.key}`,
        stableKey: `${program.programId}:${step.key}`,
        position: index + 1,
        type: step.type,
        status: "PUBLISHED",
        isActive: true,
        prerequisiteStepId: step.prerequisiteStepKeys?.[0]
          ? `cycle-${sequence}:${step.prerequisiteStepKeys[0]}`
          : null,
        completionRule: {},
        contentVersionId: step.contentKey
          ? p1ACycle5To8ContentVersionId(sequence, step.contentKey)
          : null,
        exerciseTemplateVersionId: step.exerciseKey
          ? p1ACycle5To8TemplateVersionId(sequence, step.exerciseKey)
          : null,
        assessmentId: step.assessmentKey
          ? p1ACycle5To8AssessmentId(sequence, step.assessmentKey)
          : null,
      })),
    })),
  };
}

describe("P1-A Cycles 53–56 (stations 293–312)", () => {
  it("uses the prepared source content and complete 5-station/15-question cycle graphs", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_53_56_SEQUENCES).toEqual([53, 54, 55, 56]);
    expect(EDUCATION_V2_P1_A_CYCLE_53_56).toHaveLength(4);
    const questionVersions: string[] = [];
    const contentVersions: string[] = [];
    const exerciseVersions: string[] = [];
    const assessmentVersions: string[] = [];
    const totalAnswerPositions = [0, 0, 0, 0];
    let sourceStationCount = 0;

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_53_56) {
      const { sequence, sourceCycle, program, manifest } = cycle;
      const steps = program.path.units.flatMap((unit) => unit.steps);
      expect(sourceCycle.sourceVerifiedStationCount).toBe(5);
      expect(sourceCycle.sourceStations).toHaveLength(5);
      expect(
        sourceCycle.sourceStations.every(
          (station) =>
            station.provenanceStatus === "SOURCE_VERIFIED" &&
            station.contentOrigin === "SOURCE_ADAPTED" &&
            Boolean(station.sourceEvidence?.url) &&
            (station.sourceEvidence?.verifiedFacts.length ?? 0) > 0,
        ),
      ).toBe(true);
      expect(steps).toHaveLength(5);
      expect(program.content).toHaveLength(5);
      expect(program.exercises).toHaveLength(5);
      expect(program.exercises.every((exercise) => exercise.questions.length === 3)).toBe(true);
      const answerPositions = [0, 0, 0, 0];
      expect(program.assessments).toHaveLength(1);
      expect(manifest.steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5]);
      expect(manifest.steps.map((step) => step.prerequisiteKeys)).toEqual([
        [],
        [steps[0]!.key],
        [steps[1]!.key],
        [steps[2]!.key],
        [steps[3]!.key],
      ]);
      expect(manifest.resourceCatalog.questionVersionIds).toHaveLength(15);
      expect(matchesLearningRouteGraph(graphFor(sequence))).toBe(true);

      for (const station of sourceCycle.sourceStations) {
        expect(station.sourceEvidence!.url).toMatch(/^https:\/\//u);
        sourceStationCount += 1;
        const content = program.content.find((item) => item.key === station.key);
        const exercise = program.exercises.find((item) => item.contentKey === station.key);
        expect(content?.body).toBe(station.text);
        expect(content?.title).toBe(station.textTitle);
        for (const source of [
          station.sourceEvidence!,
          ...(station.sourceEvidence!.additionalSources ?? []),
        ]) {
          expect(source.url).toMatch(/^https:\/\//u);
          expect(source.title.trim()).not.toBe("");
        }
        expect(exercise?.questions).toHaveLength(3);
        contentVersions.push(p1ACycle5To8ContentVersionId(sequence, station.key));
        exerciseVersions.push(p1ACycle5To8TemplateVersionId(sequence, exercise!.key));
        for (const question of exercise!.questions) {
          expect(question.prompt.trim()).not.toBe("");
          expect(question.explanation.trim()).not.toBe("");
          expect(question.hint.trim()).not.toBe("");
          expect(question.options).toHaveLength(4);
          expect(new Set(question.options.map((option) => option.id)).size).toBe(4);
          expect(new Set(question.options.map((option) => option.text)).size).toBe(4);
          expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
          const correctPosition = question.options.findIndex(
            (option) => option.id === question.correctOptionId,
          );
          expect(correctPosition).toBeGreaterThanOrEqual(0);
          answerPositions[correctPosition] = (answerPositions[correctPosition] ?? 0) + 1;
          totalAnswerPositions[correctPosition] = (totalAnswerPositions[correctPosition] ?? 0) + 1;
          expect(assessOptionLengthQuality(question)?.clearOutlier, question.key).toBe(false);
          questionVersions.push(
            p1ACycle5To8QuestionVersionId(sequence, `${exercise!.key}-${question.key}`),
          );
        }
      }
      expect(Math.max(...answerPositions) - Math.min(...answerPositions)).toBeLessThanOrEqual(1);

      const assessment = program.assessments[0]!;
      expect(assessment.templateExerciseKey).toBe(program.exercises.at(-1)?.key);
      expect(assessment.questionKeys).toEqual(
        program.exercises.at(-1)?.questions.map((question) => question.key),
      );
      expect(assessment.config).toMatchObject({
        questionCount: 3,
        minimumScorableCount: 3,
        minimumAnsweredCount: 3,
      });
      assessmentVersions.push(p1ACycle5To8AssessmentId(sequence, assessment.key));
    }

    expect(sourceStationCount).toBe(20);
    const assessmentSources = [
      getEducationV2P1ACycle(55)!.sourceCycle.sourceStations.at(-1)!.sourceEvidence!,
      getEducationV2P1ACycle(56)!.sourceCycle.sourceStations.at(-1)!.sourceEvidence!,
    ];
    expect(assessmentSources[0]!.additionalSources?.map((source) => source.title)).toEqual([
      "Lake Powell Drops to Record-Low Levels",
    ]);
    expect(assessmentSources[1]!.additionalSources?.map((source) => source.title)).toEqual([
      "Dust off Northwestern Africa",
    ]);
    expect(questionVersions).toHaveLength(60);
    expect(new Set(questionVersions).size).toBe(60);
    expect(contentVersions).toHaveLength(20);
    expect(exerciseVersions).toHaveLength(20);
    expect(assessmentVersions).toHaveLength(4);
    expect(
      Math.max(...totalAnswerPositions) - Math.min(...totalAnswerPositions),
    ).toBeLessThanOrEqual(2);
  });

  it("links after station 292 and approves only the Cycle 53–56 source release", () => {
    const routes = LEARNING_ROUTE_CYCLES.filter((route) => route.routeFamily === "A");
    const p0Steps = buildEducationV2P0LearningCycleManifest().steps.length;
    const stepsBefore53 = routes
      .filter((route) => route.sequence < 53)
      .reduce((count, route) => count + route.manifest.steps.length, p0Steps);
    expect(stepsBefore53).toBe(292);
    const cycle52 = routes.find((route) => route.sequence === 52)!;
    expect(cycle52.publicationApproved()).toBe(true);
    expect(nextLearningRouteCycle(cycle52.pathCode)?.sequence).toBe(53);

    for (const cycle of EDUCATION_V2_P1_A_CYCLE_53_56) {
      const route = learningRouteCycle(cycle.program.path.code);
      expect(route?.programId).toBe(cycle.program.programId);
      expect(route?.manifest).toBe(cycle.manifest);
      expect(route?.authoringStatus).toBe("OWNER_RELEASE_APPROVED");
      expect(route?.publicationApproved()).toBe(true);
      expect(matchesLearningRouteGraph(graphFor(cycle.sequence))).toBe(true);
      expect(nextLearningRouteCycle(cycle.program.path.code)?.sequence).toBe(
        cycle.sequence < 56 ? cycle.sequence + 1 : undefined,
      );
    }
    expect(EDUCATION_V2_P1_A_CYCLE_53_56_SEQUENCES).toEqual([53, 54, 55, 56]);
    expect(isEducationV2P1ACycle53To56ProductionAssignmentEnabled(44)).toBe(false);
    expect(isEducationV2P1ACycle53To56ProductionAssignmentEnabled(57)).toBe(false);
  });

  it("binds the graph preparation approval to its release fingerprint and exact source commit", () => {
    const commit = "a".repeat(40);
    expect(educationV2P1ACycle53To56ProductionApproval(commit)).toBe(
      `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_53_TO_56_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`,
    );
  });

  it("uses a distinct canonical fingerprint and an explicit owner decision only for Cycles 53–56", () => {
    expect(EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS).toEqual(
      [53, 54, 55, 56].map((sequence) => ({
        sequence,
        status: "OWNER_RELEASE_APPROVED",
        explicitPublicationApproved: true,
      })),
    );
    expect(EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT).toBe(
      createHash("sha256").update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_53_56)).digest("hex"),
    );
    expect(EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_ID).toBe(
      `OKU-EDUCATION-V2-P1-A-CYCLE-53-56@v1:${EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT}`,
    );
    expect(educationV2P1ACycle53To56ProductionApproval("a".repeat(40))).toContain(
      EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT.toUpperCase(),
    );
    for (const sequence of [53, 54, 55, 56]) {
      expect(isEducationV2P1ACycle53To56ProductionAssignmentEnabled(sequence)).toBe(true);
    }
    expect(isEducationV2P1ACycle53To56ProductionAssignmentEnabled(32)).toBe(false);
    expect(isEducationV2P1ACycle53To56ProductionAssignmentEnabled(36)).toBe(false);
    expect(isEducationV2P1ACycle53To56ProductionAssignmentEnabled(57)).toBe(false);
  });

  it("authorizes the exact plan scope and requires the release-bound owner approval for APPLY", () => {
    expect(educationV2P1ACycle5To8ScopeSequences("CYCLES_53_TO_56")).toEqual([53, 54, 55, 56]);
    const request = {
      dryRun: true,
      operation: "PLAN_ONLY",
      confirmation: "PLAN_EDUCATION_V2_P1_A_CYCLES_53_TO_56",
      graphScope: "CYCLES_53_TO_56" as const,
      productionApproval: undefined,
      expectedProductionApproval: educationV2P1ACycle53To56ProductionApproval("a".repeat(40)),
      protectedProductionWorkflow: true,
    };
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized(request)).toBe(true);
    expect(isEducationV2P1ACycle5To8SeedRequestAuthorized({ ...request, dryRun: false })).toBe(
      false,
    );
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...request,
        graphScope: "CYCLES_29_TO_32",
      }),
    ).toBe(false);
    expect(
      isEducationV2P1ACycle5To8SeedRequestAuthorized({
        ...request,
        confirmation: "APPLY_EDUCATION_V2_P1_A_CYCLES_53_TO_56",
        operation: "APPLY",
        dryRun: false,
        productionApproval: request.expectedProductionApproval,
      }),
    ).toBe(true);
    expect(
      EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS.some(
        (decision) =>
          decision.status === "OWNER_RELEASE_APPROVED" && decision.explicitPublicationApproved,
      ),
    ).toBe(true);
    expect(
      EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS.map((decision) => decision.sequence),
    ).toEqual([53, 54, 55, 56]);
  });

  it("validates that every PLAN_ONLY report is no-write and matches its exact cycle package", () => {
    const expected = {
      sequence: 53 as const,
      releaseId: EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_ID,
      commit: "a".repeat(40),
      graphScope: "CYCLES_53_TO_56" as const,
    };
    const report = {
      status: "PASS",
      mode: "DRY_RUN",
      immutableReleaseId: expected.releaseId,
      productionReleaseId: expected.releaseId,
      expectedSourceCommit: expected.commit,
      productionReleaseCommit: expected.commit,
      graphScope: expected.graphScope,
      sequence: expected.sequence,
      state: "MISSING",
      dbChanged: false,
      stepCount: 5,
      contentCount: 5,
      exerciseCount: 5,
      questionCount: 15,
      assessmentCount: 1,
    };
    expect(validateCycle53To56ReadOnlyPlanReport(report, expected)).toEqual({
      valid: true,
      state: "MISSING",
    });
    expect(validateCycle53To56ReadOnlyPlanReport({ ...report, dbChanged: true }, expected)).toEqual(
      {
        valid: false,
        reason: "PLAN_REPORTED_WRITE",
      },
    );
    expect(validateCycle53To56ReadOnlyPlanReport({ ...report, sequence: 40 }, expected)).toEqual({
      valid: false,
      reason: "SEQUENCE_MISMATCH",
    });
    expect(
      validateCycle53To56ReadOnlyPlanReport({ ...report, questionCount: 14 }, expected),
    ).toEqual({
      valid: false,
      reason: "RESOURCE_COUNTS_MISMATCH",
    });
  });

  it("requires same-run read-only PITR evidence scoped to Cycle 53–56", () => {
    const nowMs = Date.now();
    const parentTimestamp = new Date(nowMs - 120_000).toISOString();
    const targetBranchId = "br-cycle53-56-test-restore";
    const expected = {
      runId: "12345",
      runAttempt: "1",
      sha: "a".repeat(40),
      database: "approved-db",
      role: "approved-role",
      port: "5432",
      scope: "cycle53-56" as const,
      graphScope: "CYCLES_53_TO_56" as const,
      nowMs,
    };
    const evidence = {
      status: "PASS",
      schemaVersion: 17,
      pitrScope: "cycle53-56",
      graphScope: "CYCLES_53_TO_56",
      projectId: CYCLE4_PITR_PROJECT_ID,
      sourceBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
      historyRetentionSeconds: CYCLE4_PITR_EXPECTED_RETENTION_SECONDS,
      productionTargetIdentity: "PASS",
      workflowRunId: expected.runId,
      workflowRunAttempt: expected.runAttempt,
      sourceCommit: expected.sha,
      productionDatabaseWrites: false,
      productionBranchMutated: false,
      studentDataQueried: false,
      studentProgressChanged: false,
      parentTimestamp,
      requestedParentTimestamp: parentTimestamp,
      sourceBranch: {
        id: CYCLE4_PITR_SOURCE_BRANCH_ID,
        name: "production-source",
        projectId: CYCLE4_PITR_PROJECT_ID,
        default: true,
      },
      targetBranch: {
        id: targetBranchId,
        name: "okupratik-cycle53-56-pitr-12345-attempt-1",
        projectId: CYCLE4_PITR_PROJECT_ID,
        parentId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        parentTimestamp,
        default: false,
        state: "ready",
        annotationMatchesRun: true,
        annotationMatchesRunAttempt: true,
        endpointBranchId: targetBranchId,
        endpointId: "ep-isolated-test",
        endpointType: "read_write",
        endpointState: "active",
      },
      schemaComparison: {
        result: "PASS",
        method: "NEON_COMPARE_SCHEMA_API",
        endpoint: cycle4PitrCompareSchemaEndpoint(CYCLE4_PITR_PROJECT_ID, targetBranchId),
        httpStatus: 200,
        baseBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
        targetBranchId,
        database: expected.database,
        baseTimestamp: parentTimestamp,
        diffIsEmpty: true,
        matches: true,
      },
      dataChecks: {
        result: "PASS",
        queryMode: "READ_ONLY",
        studentRecordsQueried: false,
        questionTextOrAnswerKeysQueried: false,
        requiredTables: [...CYCLE4_PITR_REQUIRED_TABLES],
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
        database: expected.database,
        role: expected.role,
        port: expected.port,
        schema: "public",
        targetEndpointHostMatchedNeonApi: true,
      },
      productionSourceUnchanged: {
        result: "PASS",
        id: CYCLE4_PITR_SOURCE_BRANCH_ID,
        name: "production-source",
        default: true,
      },
    };
    expect(isCycle53To56PitrEvidenceValid(evidence, expected)).toBe(true);
    expect(
      isCycle53To56PitrEvidenceValid({ ...evidence, graphScope: "CYCLES_29_TO_32" }, expected),
    ).toBe(false);
    expect(isCycle53To56PitrEvidenceValid({ ...evidence, workflowRunAttempt: "2" }, expected)).toBe(
      false,
    );
  });

  it("keeps PLAN_ONLY no-write and orders PITR verification, artifact, cleanup, then scoped APPLY", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("confirm_cycle53_56:");
    expect(workflow).toContain("CYCLE5356_GRAPH_SCOPE: CYCLES_53_TO_56");
    expect(workflow).toContain("scripts/verify-cycle53-56-pitr-evidence.ts");
    expect(workflow).toContain("scripts/verify-cycle53-56-plan-report.ts");
    expect(workflow).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("--apply --all");
    const plan = workflow.indexOf("- name: Run read-only plan for Cycles 53–56");
    const pitr = workflow.indexOf("- name: Enforce same-run Cycle 53–56 PITR evidence");
    const artifact = workflow.indexOf("- name: Store Cycle 53–56 PITR evidence before cleanup");
    const cleanup = workflow.indexOf(
      "- name: Delete only this run's verified Cycle 53–56 PITR branch",
    );
    const apply = workflow.indexOf("- name: Apply only missing Cycle 53–56 graphs");
    expect(plan).toBeGreaterThanOrEqual(0);
    expect(plan).toBeLessThan(pitr);
    expect(pitr).toBeLessThan(artifact);
    expect(artifact).toBeLessThan(cleanup);
    expect(cleanup).toBeLessThan(apply);
    expect(workflow.slice(pitr, artifact)).toContain("if: ${{ inputs.operation == 'APPLY' }}");
    expect(workflow.slice(cleanup, apply)).toContain(
      "steps.store-pitr-evidence.outcome == 'success'",
    );
    expect(workflow).toContain("for sequence in 53 54 55 56; do");
    expect(workflow).toContain('export CYCLE5356_SEQUENCE="${sequence}"');
    expect(workflow).toContain("cycle${sequence}-plan-before.json");
    for (const sequence of [53, 54, 55, 56]) {
      expect(workflow).toContain(`cycle${sequence}-*.json`);
    }
    expect(workflow).toContain(
      "product-owner approval does not match the current release and commit",
    );
    expect(workflow).not.toContain("EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS");
    expect(workflow).not.toContain("OWNER_RELEASE_APPROVED");
    const assignmentGateStart = seedScript.indexOf("    if (\n      !dryRun &&");
    const assignmentGateEnd = seedScript.indexOf(
      "educationV2P1ACycle5To8ScopeSequences(ACTIVE_GRAPH_SCOPE).some(releaseGateClosed)",
      assignmentGateStart,
    );
    expect(assignmentGateStart).toBeGreaterThanOrEqual(0);
    expect(assignmentGateEnd).toBeGreaterThan(assignmentGateStart);
    expect(seedScript.slice(assignmentGateStart, assignmentGateEnd)).toContain("IS_CYCLE_53_TO_56");
    expect(seedScript).toContain(
      "learner assignment remains gated by its explicit source decision.",
    );
    expect(migrationGate).toContain("process.env.CYCLE5356_OPERATION?.trim()");
    expect(migrationGate).toContain("cycle5356Operation,");
  });
});
