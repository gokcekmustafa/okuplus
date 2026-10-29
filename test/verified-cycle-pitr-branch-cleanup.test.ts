import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  cyclePitrTemporaryBranchName,
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
} from "../scripts/production-cycle4-pitr-restore-evidence.js";
import {
  cleanupVerifiedPitrBranch,
  isPitrEvidenceArtifactUrlValid,
  validatePitrCleanupEvidence,
  type CyclePitrCleanupExpectation,
} from "../scripts/verified-cycle-pitr-branch-cleanup.js";

const sha = "a".repeat(40);
const repository = "gokcekmustafa/okuplus";
const runId = "12345";
const runAttempt = "2";
const branchId = "br-cycle29-32-test-restore";
const NEON_API_TEST_URL = "https://console.neon.tech/api/v2";
const branchName = `okupratik-cycle29-32-pitr-${runId}-attempt-${runAttempt}`;
const parentTimestamp = new Date(Date.now() - 120_000).toISOString();

type TestEvidence = Record<string, unknown> & {
  pitrScope: string;
  workflowRunId: string;
  workflowRunAttempt: string;
  sourceCommit: string;
  targetBranch: Record<string, unknown> & {
    id: string;
    name: string;
    parentId: string;
    parentTimestamp: string;
  };
};

function fixture(): { expected: CyclePitrCleanupExpectation; evidence: TestEvidence } {
  const expected: CyclePitrCleanupExpectation = {
    scope: "cycle29-32",
    graphScope: "CYCLES_29_TO_32",
    runId,
    runAttempt,
    sha,
    database: "approved-db",
    role: "approved-role",
    port: "5432",
    repository,
    artifactUrl: `https://github.com/${repository}/actions/runs/${runId}/artifacts/987654321`,
  };
  const evidence: TestEvidence = {
    status: "PASS",
    schemaVersion: 11,
    pitrScope: expected.scope,
    graphScope: expected.graphScope,
    projectId: CYCLE4_PITR_PROJECT_ID,
    sourceBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
    historyRetentionSeconds: 21_600,
    productionTargetIdentity: "PASS",
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
    sourceCommit: sha,
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
      id: branchId,
      name: branchName,
      projectId: CYCLE4_PITR_PROJECT_ID,
      parentId: CYCLE4_PITR_SOURCE_BRANCH_ID,
      parentTimestamp,
      default: false,
      state: "ready",
      annotationMatchesRun: true,
      annotationMatchesRunAttempt: true,
      endpointBranchId: branchId,
      endpointId: "ep-isolated-test",
      endpointType: "read_write",
      endpointState: "active",
    },
    schemaComparison: {
      result: "PASS",
      method: "NEON_COMPARE_SCHEMA_API",
      endpoint: `/projects/${CYCLE4_PITR_PROJECT_ID}/branches/${branchId}/compare_schema`,
      httpStatus: 200,
      baseBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
      targetBranchId: branchId,
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
      requiredTables: [
        "LearningPath",
        "LearningUnit",
        "LearningStep",
        "Content",
        "ContentVersion",
        "ExerciseTemplate",
        "ExerciseTemplateVersion",
        "ExerciseTemplateVersionQuestion",
        "Question",
        "QuestionVersion",
        "Assessment",
        "_prisma_migrations",
      ],
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
  return { expected, evidence };
}

function liveBranch(evidence: TestEvidence, overrides: Record<string, unknown> = {}) {
  return {
    branch: {
      id: evidence.targetBranch.id,
      project_id: CYCLE4_PITR_PROJECT_ID,
      name: evidence.targetBranch.name,
      parent_id: CYCLE4_PITR_SOURCE_BRANCH_ID,
      parent_timestamp: evidence.targetBranch.parentTimestamp,
      default: false,
      current_state: "ready",
      ...overrides,
    },
    annotation: {
      value: {
        purpose: `${evidence.pitrScope}-pitr-restore-validation`,
        github_run_id: evidence.workflowRunId,
        github_run_attempt: evidence.workflowRunAttempt,
        github_sha: evidence.sourceCommit,
      },
    },
  };
}

function liveProductionSource() {
  return {
    branch: {
      id: CYCLE4_PITR_SOURCE_BRANCH_ID,
      project_id: CYCLE4_PITR_PROJECT_ID,
      name: "production-source",
      default: true,
      current_state: "ready",
    },
  };
}

const rejectedEvidenceCases: Array<[string, (evidence: TestEvidence) => unknown]> = [
  ["missing evidence", () => undefined],
  ["failed evidence", (evidence) => ({ ...evidence, status: "FAIL" })],
  ["wrong run", (evidence) => ({ ...evidence, workflowRunId: "99999" })],
  ["wrong attempt", (evidence) => ({ ...evidence, workflowRunAttempt: "1" })],
  ["wrong commit", (evidence) => ({ ...evidence, sourceCommit: "b".repeat(40) })],
  ["wrong scope", (evidence) => ({ ...evidence, pitrScope: "cycle25-28" })],
  [
    "production branch",
    (evidence) => ({
      ...evidence,
      targetBranch: { ...evidence.targetBranch, id: CYCLE4_PITR_SOURCE_BRANCH_ID, default: true },
    }),
  ],
  [
    "wrong project",
    (evidence) => ({
      ...evidence,
      targetBranch: { ...evidence.targetBranch, projectId: "another-neon-project" },
    }),
  ],
  [
    "wrong parent",
    (evidence) => ({
      ...evidence,
      targetBranch: { ...evidence.targetBranch, parentId: "br-unapproved-parent" },
    }),
  ],
  [
    "unexpected branch name",
    (evidence) => ({
      ...evidence,
      targetBranch: { ...evidence.targetBranch, name: "other-temporary-branch" },
    }),
  ],
  [
    "wrong annotation evidence",
    (evidence) => ({
      ...evidence,
      targetBranch: { ...evidence.targetBranch, annotationMatchesRunAttempt: false },
    }),
  ],
];

describe("verified PITR temporary-branch cleanup", () => {
  it("accepts only an artifact URL belonging to this repository and workflow run", () => {
    const { expected } = fixture();
    expect(cyclePitrTemporaryBranchName("cycle29-32", runId, runAttempt)).toBe(branchName);
    expect(cyclePitrTemporaryBranchName("cycle33-36", runId, runAttempt)).toBe(
      `okupratik-cycle33-36-pitr-${runId}-attempt-${runAttempt}`,
    );
    expect(cyclePitrTemporaryBranchName("cycle37-40", runId, runAttempt)).toBe(
      `okupratik-cycle37-40-pitr-${runId}-attempt-${runAttempt}`,
    );
    expect(cyclePitrTemporaryBranchName("cycle41-44", runId, runAttempt)).toBe(
      `okupratik-cycle41-44-pitr-${runId}-attempt-${runAttempt}`,
    );
    expect(isPitrEvidenceArtifactUrlValid(expected.artifactUrl, repository, runId)).toBe(true);
    expect(isPitrEvidenceArtifactUrlValid(expected.artifactUrl, repository, "99999")).toBe(false);
    expect(
      isPitrEvidenceArtifactUrlValid(
        `https://github.com/other/repo/actions/runs/${runId}/artifacts/987`,
        repository,
        runId,
      ),
    ).toBe(false);
  });

  it("deletes only after same-run evidence, stored artifact, and live annotation all match", async () => {
    const { expected, evidence } = fixture();
    expect(validatePitrCleanupEvidence(evidence, expected).status).toBe("PASS");
    const calls: string[] = [];
    const urls: string[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      urls.push(String(_url));
      calls.push(method);
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (calls.length === 4) return new Response(null, { status: 404 });
      if (String(_url).endsWith(CYCLE4_PITR_SOURCE_BRANCH_ID)) {
        return new Response(JSON.stringify(liveProductionSource()), { status: 200 });
      }
      return new Response(JSON.stringify(liveBranch(evidence)), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await cleanupVerifiedPitrBranch(
      "test-key",
      evidence,
      expected,
      fetcher,
      async () => {},
    );
    expect(result).toEqual({ result: "PASS", deletedBranchId: branchId });
    expect(calls).toEqual(["GET", "GET", "DELETE", "GET"]);
    const sourceUrl = `${NEON_API_TEST_URL}/projects/${CYCLE4_PITR_PROJECT_ID}/branches/${CYCLE4_PITR_SOURCE_BRANCH_ID}`;
    const targetUrl = `${NEON_API_TEST_URL}/projects/${CYCLE4_PITR_PROJECT_ID}/branches/${branchId}`;
    expect(urls).toEqual([sourceUrl, targetUrl, targetUrl, targetUrl]);
  });

  it.each(rejectedEvidenceCases)("never calls Neon for %s", async (_label, mutate) => {
    const { expected, evidence } = fixture();
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      cleanupVerifiedPitrBranch("test-key", mutate(evidence), expected, fetcher),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not contact Neon if the artifact URL is not from this run", async () => {
    const { expected, evidence } = fixture();
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      cleanupVerifiedPitrBranch(
        "test-key",
        evidence,
        {
          ...expected,
          artifactUrl: `https://github.com/${repository}/actions/runs/99999/artifacts/1`,
        },
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses deletion when the live parent, default flag, or run annotation differs", async () => {
    const { expected, evidence } = fixture();
    for (const overrides of [
      { parent_id: "br-other-parent" },
      { default: true },
      { project_id: "other-project" },
      { id: "br-other-target" },
    ]) {
      const fetcher = vi.fn(async (url: RequestInfo | URL) =>
        String(url).endsWith(CYCLE4_PITR_SOURCE_BRANCH_ID)
          ? new Response(JSON.stringify(liveProductionSource()), { status: 200 })
          : new Response(JSON.stringify(liveBranch(evidence, overrides)), { status: 200 }),
      ) as unknown as typeof fetch;
      await expect(
        cleanupVerifiedPitrBranch("test-key", evidence, expected, fetcher),
      ).rejects.toThrow("Live PITR branch identity or annotation mismatch");
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]?.method).toBe(
        "GET",
      );
    }

    const wrongLiveName = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith(CYCLE4_PITR_SOURCE_BRANCH_ID)
        ? new Response(JSON.stringify(liveProductionSource()), { status: 200 })
        : new Response(JSON.stringify(liveBranch(evidence, { name: "unexpected-live-name" })), {
            status: 200,
          }),
    ) as unknown as typeof fetch;
    await expect(
      cleanupVerifiedPitrBranch("test-key", evidence, expected, wrongLiveName),
    ).rejects.toThrow("Live PITR branch identity or annotation mismatch");
    expect(wrongLiveName).toHaveBeenCalledTimes(2);

    const wrongSource = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith(CYCLE4_PITR_SOURCE_BRANCH_ID)
        ? new Response(
            JSON.stringify({
              branch: {
                id: CYCLE4_PITR_SOURCE_BRANCH_ID,
                project_id: CYCLE4_PITR_PROJECT_ID,
                name: "unexpected-source",
                default: false,
                current_state: "ready",
              },
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify(liveBranch(evidence)), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(
      cleanupVerifiedPitrBranch("test-key", evidence, expected, wrongSource),
    ).rejects.toThrow("Production source branch identity changed");
    expect(wrongSource).toHaveBeenCalledTimes(1);

    const badAnnotation = liveBranch(evidence);
    badAnnotation.annotation.value.github_run_attempt = "1";
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith(CYCLE4_PITR_SOURCE_BRANCH_ID)
        ? new Response(JSON.stringify(liveProductionSource()), { status: 200 })
        : new Response(JSON.stringify(badAnnotation), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(
      cleanupVerifiedPitrBranch("test-key", evidence, expected, fetcher),
    ).rejects.toThrow("Live PITR branch identity or annotation mismatch");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("blocks graph provisioning when deleting the verified branch fails", async () => {
    const { expected, evidence } = fixture();
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(method);
      if (method === "DELETE") return new Response(null, { status: 500 });
      if (String(url).endsWith(CYCLE4_PITR_SOURCE_BRANCH_ID)) {
        return new Response(JSON.stringify(liveProductionSource()), { status: 200 });
      }
      return new Response(JSON.stringify(liveBranch(evidence)), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      cleanupVerifiedPitrBranch("test-key", evidence, expected, fetcher),
    ).rejects.toThrow("PITR branch deletion failed; graph APPLY is blocked");
    expect(calls).toEqual(["GET", "GET", "DELETE"]);
  });

  it("keeps protected workflows read-only in PLAN_ONLY and orders artifact, delete, then APPLY", () => {
    const workflows = [
      ["5-8", "Enforce Cycle 5–8 PITR evidence", "Apply only selected Cycle 5–8 graph scope"],
      ["9-12", "Enforce same-run Cycle 9–12 PITR evidence", "Apply only missing Cycle 9–12 graphs"],
      [
        "13-16",
        "Enforce same-run Cycle 13–16 PITR evidence",
        "Apply only missing Cycle 13–16 graphs",
      ],
      [
        "17-20",
        "Enforce same-run Cycle 17–20 PITR evidence",
        "Apply only missing Cycle 17–20 graphs",
      ],
      [
        "21-24",
        "Enforce same-run Cycle 21–24 PITR evidence",
        "Apply only missing Cycle 21–24 graphs",
      ],
      [
        "25-28",
        "Enforce same-run Cycle 25–28 PITR evidence",
        "Apply only missing Cycle 25–28 graphs",
      ],
      [
        "29-32",
        "Enforce same-run Cycle 29–32 PITR evidence",
        "Apply only missing Cycle 29–32 graphs",
      ],
      [
        "33-36",
        "Enforce same-run Cycle 33–36 PITR evidence",
        "Apply only missing Cycle 33–36 graphs",
      ],
      [
        "37-40",
        "Enforce same-run Cycle 37–40 PITR evidence",
        "Apply only missing Cycle 37–40 graphs",
      ],
      [
        "41-44",
        "Enforce same-run Cycle 41–44 PITR evidence",
        "Apply only missing Cycle 41–44 graphs",
      ],
    ] as const;
    for (const [group, verifyName, applyName] of workflows) {
      const workflow = readFileSync(
        `.github/workflows/production-education-v2-p1-a-cycle-${group}.yml`,
        "utf8",
      );
      const verifyAt = workflow.indexOf(`- name: ${verifyName}`);
      const artifactAt = workflow.indexOf(
        `- name: Store Cycle ${group.replace("-", "–")} PITR evidence before cleanup`,
      );
      const deleteAt = workflow.indexOf(
        `- name: Delete only this run's verified Cycle ${group.replace("-", "–")} PITR branch`,
      );
      const applyAt = workflow.indexOf(`- name: ${applyName}`);
      const planAt = workflow.indexOf("- name: Run read-only plan");
      expect(verifyAt).toBeGreaterThanOrEqual(0);
      expect(planAt).toBeGreaterThanOrEqual(0);
      expect(planAt).toBeLessThan(verifyAt);
      expect(workflow.slice(planAt, verifyAt)).toContain("--dry-run");
      expect(artifactAt).toBeGreaterThan(verifyAt);
      expect(deleteAt).toBeGreaterThan(artifactAt);
      expect(applyAt).toBeGreaterThan(deleteAt);
      expect(workflow.slice(artifactAt, deleteAt)).toContain(
        "if: ${{ inputs.operation == 'APPLY' }}",
      );
      expect(workflow.slice(deleteAt, applyAt)).toContain(
        "steps.store-pitr-evidence.outcome == 'success'",
      );
      expect(workflow).toContain("if-no-files-found: error");
      expect(workflow).toContain(
        "PITR_EVIDENCE_ARTIFACT_URL: ${{ steps.store-pitr-evidence.outputs.artifact-url }}",
      );
      expect(workflow).toContain("NEON_MANAGEMENT_API_KEY: ${{ secrets.NEON_API_KEY }}");
      expect(workflow).toContain("inputs.operation == 'APPLY'");
      expect(workflow).not.toContain("continue-on-error: true");
      expect(workflow).toContain("default: PLAN_ONLY");
    }
  });
});
