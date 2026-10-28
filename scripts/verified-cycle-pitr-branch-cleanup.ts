import { readFileSync } from "node:fs";
import {
  CYCLE4_PITR_PROJECT_ID,
  CYCLE4_PITR_SOURCE_BRANCH_ID,
  cyclePitrTemporaryBranchName,
  isCycle5To8PitrEvidenceValid,
  isCycle9To12PitrEvidenceValid,
  isCycle13To16PitrEvidenceValid,
  isCycle17To20PitrEvidenceValid,
  isCycle21To24PitrEvidenceValid,
  isCycle25To28PitrEvidenceValid,
  isCycle29To32PitrEvidenceValid,
  type Cycle5To8PitrEvidenceExpectation,
  type Cycle9To12PitrEvidenceExpectation,
  type Cycle13To16PitrEvidenceExpectation,
  type Cycle17To20PitrEvidenceExpectation,
  type Cycle21To24PitrEvidenceExpectation,
  type Cycle25To28PitrEvidenceExpectation,
  type Cycle29To32PitrEvidenceExpectation,
  type CyclePitrCleanupScope,
} from "./production-cycle4-pitr-restore-evidence.js";

const NEON_API = "https://console.neon.tech/api/v2";
const EXPECTED_REPOSITORY = "gokcekmustafa/okuplus";
const scopeDetails = {
  "cycle5-8": {
    graphScope: ["CYCLE_5_ONLY", "CYCLES_5_TO_8"],
    workflow: "Manual Education V2 P1-A Cycles 5–8 production provision",
    operationVariable: "CYCLE58_OPERATION",
    graphScopeVariable: "CYCLE58_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE58_PITR_EVIDENCE_PATH",
  },
  "cycle9-12": {
    graphScope: ["CYCLES_9_TO_12"],
    workflow: "Manual Education V2 P1-A Cycles 9–12 production provision",
    operationVariable: "CYCLE912_OPERATION",
    graphScopeVariable: "CYCLE912_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE912_PITR_EVIDENCE_PATH",
  },
  "cycle13-16": {
    graphScope: ["CYCLES_13_TO_16"],
    workflow: "Manual Education V2 P1-A Cycles 13–16 production provision",
    operationVariable: "CYCLE1316_OPERATION",
    graphScopeVariable: "CYCLE1316_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE1316_PITR_EVIDENCE_PATH",
  },
  "cycle17-20": {
    graphScope: ["CYCLES_17_TO_20"],
    workflow: "Manual Education V2 P1-A Cycles 17–20 production provision",
    operationVariable: "CYCLE1720_OPERATION",
    graphScopeVariable: "CYCLE1720_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE1720_PITR_EVIDENCE_PATH",
  },
  "cycle21-24": {
    graphScope: ["CYCLES_21_TO_24"],
    workflow: "Manual Education V2 P1-A Cycles 21–24 production provision",
    operationVariable: "CYCLE2124_OPERATION",
    graphScopeVariable: "CYCLE2124_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE2124_PITR_EVIDENCE_PATH",
  },
  "cycle25-28": {
    graphScope: ["CYCLES_25_TO_28"],
    workflow: "Manual Education V2 P1-A Cycles 25–28 production provision",
    operationVariable: "CYCLE2528_OPERATION",
    graphScopeVariable: "CYCLE2528_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE2528_PITR_EVIDENCE_PATH",
  },
  "cycle29-32": {
    graphScope: ["CYCLES_29_TO_32"],
    workflow: "Manual Education V2 P1-A Cycles 29–32 production provision",
    operationVariable: "CYCLE2932_OPERATION",
    graphScopeVariable: "CYCLE2932_GRAPH_SCOPE",
    evidencePathVariable: "CYCLE2932_PITR_EVIDENCE_PATH",
  },
} as const satisfies Record<
  CyclePitrCleanupScope,
  {
    graphScope: readonly string[];
    workflow: string;
    operationVariable: string;
    graphScopeVariable: string;
    evidencePathVariable: string;
  }
>;

type PitrCleanupStorageExpectation = {
  repository: string;
  artifactUrl: string;
};
export type CyclePitrCleanupExpectation =
  | (Cycle5To8PitrEvidenceExpectation & PitrCleanupStorageExpectation)
  | (Cycle9To12PitrEvidenceExpectation & PitrCleanupStorageExpectation)
  | (Cycle13To16PitrEvidenceExpectation & PitrCleanupStorageExpectation)
  | (Cycle17To20PitrEvidenceExpectation & PitrCleanupStorageExpectation)
  | (Cycle21To24PitrEvidenceExpectation & PitrCleanupStorageExpectation)
  | (Cycle25To28PitrEvidenceExpectation & PitrCleanupStorageExpectation)
  | (Cycle29To32PitrEvidenceExpectation & PitrCleanupStorageExpectation);

type CleanupIdentity = Pick<
  CyclePitrCleanupExpectation,
  "runId" | "runAttempt" | "sha" | "database" | "role" | "port" | "repository" | "artifactUrl"
>;

function createCleanupExpectation(
  scope: CyclePitrCleanupScope,
  graphScope: string,
  identity: CleanupIdentity,
): CyclePitrCleanupExpectation {
  switch (scope) {
    case "cycle5-8":
      return { ...identity, scope, graphScope: graphScope as "CYCLE_5_ONLY" | "CYCLES_5_TO_8" };
    case "cycle9-12":
      return { ...identity, scope, graphScope: "CYCLES_9_TO_12" };
    case "cycle13-16":
      return { ...identity, scope, graphScope: "CYCLES_13_TO_16" };
    case "cycle17-20":
      return { ...identity, scope, graphScope: "CYCLES_17_TO_20" };
    case "cycle21-24":
      return { ...identity, scope, graphScope: "CYCLES_21_TO_24" };
    case "cycle25-28":
      return { ...identity, scope, graphScope: "CYCLES_25_TO_28" };
    case "cycle29-32":
      return { ...identity, scope, graphScope: "CYCLES_29_TO_32" };
  }
}

type CleanupEvidence = {
  projectId: string;
  workflowRunId: string;
  workflowRunAttempt: string;
  sourceCommit: string;
  pitrScope: string;
  graphScope: string;
  status: string;
  productionSourceUnchanged: {
    id: string;
    name: string;
    default: boolean;
    result: string;
  };
  targetBranch: {
    id: string;
    name: string;
    projectId: string;
    parentId: string;
    parentTimestamp: string;
    default: boolean;
    state: string;
    annotationMatchesRun: boolean;
    annotationMatchesRunAttempt: boolean;
  };
};

type Fetcher = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseCleanupEvidence(value: unknown): CleanupEvidence | null {
  if (
    !isRecord(value) ||
    !isRecord(value.targetBranch) ||
    !isRecord(value.productionSourceUnchanged)
  ) {
    return null;
  }
  const target = value.targetBranch;
  const source = value.productionSourceUnchanged;
  const stringFields = [
    value.projectId,
    value.workflowRunId,
    value.workflowRunAttempt,
    value.sourceCommit,
    value.pitrScope,
    value.graphScope,
    value.status,
    target.id,
    target.name,
    target.projectId,
    target.parentId,
    target.parentTimestamp,
    target.state,
    source.id,
    source.name,
    source.result,
  ];
  if (
    stringFields.some((field) => typeof field !== "string") ||
    typeof target.default !== "boolean" ||
    typeof target.annotationMatchesRun !== "boolean" ||
    typeof target.annotationMatchesRunAttempt !== "boolean" ||
    typeof source.default !== "boolean"
  ) {
    return null;
  }
  return value as unknown as CleanupEvidence;
}

export function isPitrEvidenceArtifactUrlValid(
  artifactUrl: string,
  repository: string,
  runId: string,
): boolean {
  try {
    const url = new URL(artifactUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.search === "" &&
      url.hash === "" &&
      parts.length === 7 &&
      `${parts[0]}/${parts[1]}` === repository &&
      parts[2] === "actions" &&
      parts[3] === "runs" &&
      parts[4] === runId &&
      parts[5] === "artifacts" &&
      /^\d+$/u.test(parts[6] ?? "")
    );
  } catch {
    return false;
  }
}

function evidencePassesScopeValidator(
  evidence: unknown,
  expected: CyclePitrCleanupExpectation,
): boolean {
  switch (expected.scope) {
    case "cycle5-8":
      return isCycle5To8PitrEvidenceValid(evidence, expected);
    case "cycle9-12":
      return isCycle9To12PitrEvidenceValid(evidence, expected);
    case "cycle13-16":
      return isCycle13To16PitrEvidenceValid(evidence, expected);
    case "cycle17-20":
      return isCycle17To20PitrEvidenceValid(evidence, expected);
    case "cycle21-24":
      return isCycle21To24PitrEvidenceValid(evidence, expected);
    case "cycle25-28":
      return isCycle25To28PitrEvidenceValid(evidence, expected);
    case "cycle29-32":
      return isCycle29To32PitrEvidenceValid(evidence, expected);
  }
}

export function validatePitrCleanupEvidence(
  value: unknown,
  expected: CyclePitrCleanupExpectation,
): CleanupEvidence {
  const details = scopeDetails[expected.scope];
  const evidence = parseCleanupEvidence(value);
  if (
    !details ||
    expected.repository !== EXPECTED_REPOSITORY ||
    !/^[a-f0-9]{40}$/u.test(expected.sha.toLowerCase()) ||
    !/^\d+$/u.test(expected.runId) ||
    !/^[1-9]\d*$/u.test(expected.runAttempt) ||
    !/^\d+$/u.test(expected.port) ||
    !details.graphScope.includes(expected.graphScope) ||
    !evidence ||
    !evidencePassesScopeValidator(value, expected) ||
    evidence.projectId !== CYCLE4_PITR_PROJECT_ID ||
    evidence.pitrScope !== expected.scope ||
    evidence.graphScope !== expected.graphScope ||
    evidence.workflowRunId !== expected.runId ||
    evidence.workflowRunAttempt !== expected.runAttempt ||
    evidence.sourceCommit !== expected.sha.toLowerCase() ||
    evidence.status !== "PASS" ||
    evidence.productionSourceUnchanged.result !== "PASS" ||
    evidence.productionSourceUnchanged.id !== CYCLE4_PITR_SOURCE_BRANCH_ID ||
    evidence.productionSourceUnchanged.default !== true ||
    evidence.targetBranch.id === CYCLE4_PITR_SOURCE_BRANCH_ID ||
    evidence.targetBranch.projectId !== CYCLE4_PITR_PROJECT_ID ||
    evidence.targetBranch.parentId !== CYCLE4_PITR_SOURCE_BRANCH_ID ||
    evidence.targetBranch.default !== false ||
    evidence.targetBranch.name !==
      cyclePitrTemporaryBranchName(expected.scope, expected.runId, expected.runAttempt) ||
    evidence.targetBranch.state !== "ready" ||
    evidence.targetBranch.annotationMatchesRun !== true ||
    evidence.targetBranch.annotationMatchesRunAttempt !== true ||
    !isPitrEvidenceArtifactUrlValid(expected.artifactUrl, expected.repository, expected.runId)
  ) {
    throw new Error("PITR evidence or stored artifact did not match the protected run identity");
  }
  return evidence;
}

function safeBranchFromPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !isRecord(value.branch)) return null;
  return value.branch;
}

function annotationMatches(value: unknown, expected: CyclePitrCleanupExpectation): boolean {
  if (!isRecord(value) || !isRecord(value.annotation) || !isRecord(value.annotation.value)) {
    return false;
  }
  const annotation = value.annotation.value;
  return (
    annotation.purpose === `${expected.scope}-pitr-restore-validation` &&
    annotation.github_run_id === expected.runId &&
    annotation.github_run_attempt === expected.runAttempt &&
    annotation.github_sha === expected.sha.toLowerCase()
  );
}

async function parseResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function neonFetch(
  apiKey: string,
  branchPath: string,
  method: "GET" | "DELETE",
  fetcher: Fetcher,
): Promise<Response> {
  try {
    return await fetcher(`${NEON_API}${branchPath}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Neon branch cleanup request failed; graph APPLY is blocked");
  }
}

export async function cleanupVerifiedPitrBranch(
  apiKey: string,
  value: unknown,
  expected: CyclePitrCleanupExpectation,
  fetcher: Fetcher = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<{ result: "PASS"; deletedBranchId: string }> {
  if (!apiKey.trim()) throw new Error("Neon API key is required; graph APPLY is blocked");
  const evidence = validatePitrCleanupEvidence(value, expected);
  const branchPath = `/projects/${encodeURIComponent(CYCLE4_PITR_PROJECT_ID)}/branches/${encodeURIComponent(evidence.targetBranch.id)}`;
  const sourcePath = `/projects/${encodeURIComponent(CYCLE4_PITR_PROJECT_ID)}/branches/${encodeURIComponent(CYCLE4_PITR_SOURCE_BRANCH_ID)}`;
  const sourceResponse = await neonFetch(apiKey, sourcePath, "GET", fetcher);
  const sourcePayload = sourceResponse.ok ? await parseResponseJson(sourceResponse) : null;
  const liveSource = safeBranchFromPayload(sourcePayload);
  if (
    !sourceResponse.ok ||
    !liveSource ||
    liveSource.id !== CYCLE4_PITR_SOURCE_BRANCH_ID ||
    liveSource.project_id !== CYCLE4_PITR_PROJECT_ID ||
    liveSource.name !== evidence.productionSourceUnchanged.name ||
    liveSource.default !== true ||
    liveSource.current_state !== "ready"
  ) {
    throw new Error("Production source branch identity changed; PITR branch was not deleted");
  }
  const before = await neonFetch(apiKey, branchPath, "GET", fetcher);
  if (!before.ok)
    throw new Error("PITR branch could not be revalidated live; graph APPLY is blocked");
  const beforePayload = await parseResponseJson(before);
  const liveBranch = safeBranchFromPayload(beforePayload);
  if (
    !liveBranch ||
    liveBranch.id !== evidence.targetBranch.id ||
    liveBranch.project_id !== CYCLE4_PITR_PROJECT_ID ||
    liveBranch.name !== evidence.targetBranch.name ||
    liveBranch.parent_id !== CYCLE4_PITR_SOURCE_BRANCH_ID ||
    liveBranch.default !== false ||
    liveBranch.current_state !== "ready" ||
    typeof liveBranch.parent_timestamp !== "string" ||
    Date.parse(liveBranch.parent_timestamp) !== Date.parse(evidence.targetBranch.parentTimestamp) ||
    !annotationMatches(beforePayload, expected)
  ) {
    throw new Error("Live PITR branch identity or annotation mismatch; branch was not deleted");
  }

  const deletion = await neonFetch(apiKey, branchPath, "DELETE", fetcher);
  if (!deletion.ok) throw new Error("Verified PITR branch deletion failed; graph APPLY is blocked");

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const after = await neonFetch(apiKey, branchPath, "GET", fetcher);
    if (after.status === 404) return { result: "PASS", deletedBranchId: evidence.targetBranch.id };
    if (!after.ok)
      throw new Error("PITR branch deletion could not be confirmed; graph APPLY is blocked");
    const afterPayload = await parseResponseJson(after);
    const remaining = safeBranchFromPayload(afterPayload);
    if (
      !remaining ||
      remaining.id !== evidence.targetBranch.id ||
      remaining.project_id !== CYCLE4_PITR_PROJECT_ID ||
      remaining.name !== evidence.targetBranch.name ||
      remaining.parent_id !== CYCLE4_PITR_SOURCE_BRANCH_ID ||
      remaining.default !== false
    ) {
      throw new Error("PITR branch deletion response identity changed; graph APPLY is blocked");
    }
    if (attempt < 11) await wait(5_000);
  }
  throw new Error(
    "PITR branch deletion was not confirmed within one minute; graph APPLY is blocked",
  );
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const scope = required("CYCLE_PITR_SCOPE") as CyclePitrCleanupScope;
  if (!Object.hasOwn(scopeDetails, scope)) throw new Error("unsupported PITR cleanup scope");
  const details = scopeDetails[scope];
  if (
    process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    process.env.GITHUB_REF !== "refs/heads/master" ||
    process.env.GITHUB_WORKFLOW !== details.workflow ||
    process.env[details.operationVariable] !== "APPLY"
  ) {
    throw new Error("protected manual master APPLY workflow identity did not match");
  }
  const graphScope = required(details.graphScopeVariable);
  if (!details.graphScope.includes(graphScope)) throw new Error("PITR graph scope mismatch");
  const runId = required("GITHUB_RUN_ID");
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";
  const sha = required("GITHUB_SHA").toLowerCase();
  const expected = createCleanupExpectation(scope, graphScope, {
    runId,
    runAttempt,
    sha,
    database: required("PRODUCTION_DB_APPROVED_DATABASE"),
    role: required("PRODUCTION_DB_APPROVED_USER"),
    port: required("PRODUCTION_DB_APPROVED_PORT"),
    repository: required("GITHUB_REPOSITORY"),
    artifactUrl: required("PITR_EVIDENCE_ARTIFACT_URL"),
  });
  const path = required(details.evidencePathVariable);
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("same-run PITR evidence is unreadable; graph APPLY is blocked");
  }
  const result = await cleanupVerifiedPitrBranch(
    required("NEON_MANAGEMENT_API_KEY"),
    evidence,
    expected,
  );
  process.stdout.write(`PITR_TEMP_BRANCH_CLEANUP=${result.result}\n`);
}

if (process.argv[1]?.endsWith("verified-cycle-pitr-branch-cleanup.ts")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "safe validation failed";
    process.stderr.write(`PITR cleanup failed: ${message}\n`);
    process.exitCode = 1;
  });
}
