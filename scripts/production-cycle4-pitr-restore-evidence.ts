import { appendFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { parseCatalogTargetUrl } from "../src/curriculum/catalog-target-verification.js";
import { providerForHost, targetIdentityFingerprint } from "../src/lib/db-fingerprint-contract.js";

export const CYCLE4_PITR_PROJECT_ID = "aged-snow-31166248";
export const CYCLE4_PITR_SOURCE_BRANCH_ID = "br-damp-truth-b17y4gog";
export const CYCLE4_PITR_EXPECTED_RETENTION_SECONDS = 21_600;
export const CYCLE4_PITR_SAFETY_LAG_MS = 120_000;

const NEON_API = "https://console.neon.tech/api/v2";
export const CYCLE4_PITR_REQUIRED_TABLES = [
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
] as const;

type JsonRecord = Record<string, unknown>;
export type Cycle4PitrEvidenceExpectation = {
  runId: string;
  runAttempt: string;
  sha: string;
  database: string;
  role: string;
  port: string;
  nowMs?: number;
};
export type Cycle4PitrFailureRecord = {
  stage: string;
  endpoint: string | null;
  httpStatus: number | null;
  reason: string;
};
type NeonBranch = {
  id: string;
  project_id: string;
  parent_id?: string;
  parent_timestamp?: string;
  name: string;
  current_state: string;
  default: boolean;
};
type NeonEndpoint = {
  id: string;
  project_id: string;
  branch_id: string;
  host: string;
  type: string;
  current_state: string;
  disabled?: boolean;
};
let lastNeonResponse: { endpoint: string | null; httpStatus: number | null } = {
  endpoint: null,
  httpStatus: null,
};

export function cycle4PitrTimestamp(
  nowMs = Date.now(),
  safetyLagMs = CYCLE4_PITR_SAFETY_LAG_MS,
): string {
  if (!Number.isFinite(nowMs) || !Number.isFinite(safetyLagMs) || safetyLagMs < 30_000) {
    throw new Error("invalid PITR timestamp inputs");
  }
  return new Date(nowMs - safetyLagMs).toISOString();
}

export function isCycle4PitrTimestampInWindow(
  parentTimestamp: string,
  nowMs: number,
  retentionSeconds: number,
): boolean {
  const timestampMs = Date.parse(parentTimestamp);
  const ageMs = nowMs - timestampMs;
  return (
    Number.isFinite(timestampMs) &&
    Number.isFinite(nowMs) &&
    Number.isInteger(retentionSeconds) &&
    retentionSeconds > 0 &&
    ageMs >= 30_000 &&
    ageMs <= retentionSeconds * 1_000 - 30_000
  );
}

export function normalizeNeonEndpointHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/-pooler(?=\.)/u, "")
    .replace(/\.$/u, "");
}

export function cycle4PitrCompareSchemaEndpoint(projectId: string, branchId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/compare_schema`;
}

export function cycle4PitrCompareSchemaRequest(input: {
  projectId: string;
  targetBranchId: string;
  baseBranchId: string;
  baseTimestamp: string;
  databaseName: string;
}): { endpoint: string; requestPath: string } {
  const endpoint = cycle4PitrCompareSchemaEndpoint(input.projectId, input.targetBranchId);
  const query = new URLSearchParams({
    base_branch_id: input.baseBranchId,
    db_name: input.databaseName,
    base_timestamp: input.baseTimestamp,
  });
  return { endpoint, requestPath: `${endpoint}?${query.toString()}` };
}

export function parseCycle4PitrSchemaDiff(value: unknown): { diffIsEmpty: true } | null {
  if (!isRecord(value) || typeof value.diff !== "string" || value.diff !== "") return null;
  return { diffIsEmpty: true };
}

export function cycle4PitrOptionalEndpointId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;
  return value.id;
}

export function cycle4PitrTimestampMatches(value: unknown, expected: string): boolean {
  if (typeof value !== "string") return false;
  const actualMs = Date.parse(value);
  const expectedMs = Date.parse(expected);
  return (
    Number.isFinite(actualMs) &&
    Number.isFinite(expectedMs) &&
    Math.abs(actualMs - expectedMs) <= 1_000
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isCycle4PitrEvidenceValid(
  value: unknown,
  expected: Cycle4PitrEvidenceExpectation,
): boolean {
  if (!isRecord(value)) return false;
  const source = value.sourceBranch;
  const target = value.targetBranch;
  const schema = value.schemaComparison;
  const data = value.dataChecks;
  const restored = value.restoredDatabaseIdentity;
  const unchanged = value.productionSourceUnchanged;
  if (![source, target, schema, data, restored, unchanged].every(isRecord)) return false;
  const targetRecord = target as JsonRecord;
  const sourceRecord = source as JsonRecord;
  const schemaRecord = schema as JsonRecord;
  const dataRecord = data as JsonRecord;
  const restoredRecord = restored as JsonRecord;
  const unchangedRecord = unchanged as JsonRecord;
  const timestamp = targetRecord.parentTimestamp;
  const requestedTimestamp = value.requestedParentTimestamp;
  const counts = dataRecord.aggregateCounts;
  const requiredTables = dataRecord.requiredTables;
  const missingTables = dataRecord.missingTables;
  const ageMs = (expected.nowMs ?? Date.now()) - Date.parse(String(timestamp ?? ""));
  const requestedAgeMs =
    (expected.nowMs ?? Date.now()) - Date.parse(String(requestedTimestamp ?? ""));
  const countRecord = isRecord(counts) ? counts : null;
  return (
    value.status === "PASS" &&
    value.schemaVersion === 2 &&
    value.projectId === CYCLE4_PITR_PROJECT_ID &&
    value.sourceBranchId === CYCLE4_PITR_SOURCE_BRANCH_ID &&
    value.historyRetentionSeconds === CYCLE4_PITR_EXPECTED_RETENTION_SECONDS &&
    value.productionTargetIdentity === "PASS" &&
    value.workflowRunId === expected.runId &&
    value.workflowRunAttempt === expected.runAttempt &&
    value.sourceCommit === expected.sha.toLowerCase() &&
    value.productionDatabaseWrites === false &&
    value.productionBranchMutated === false &&
    value.studentDataQueried === false &&
    value.studentProgressChanged === false &&
    sourceRecord.id === CYCLE4_PITR_SOURCE_BRANCH_ID &&
    sourceRecord.projectId === CYCLE4_PITR_PROJECT_ID &&
    sourceRecord.default === true &&
    targetRecord.projectId === CYCLE4_PITR_PROJECT_ID &&
    typeof targetRecord.id === "string" &&
    targetRecord.id !== CYCLE4_PITR_SOURCE_BRANCH_ID &&
    targetRecord.parentId === CYCLE4_PITR_SOURCE_BRANCH_ID &&
    targetRecord.default === false &&
    targetRecord.state === "ready" &&
    targetRecord.annotationMatchesRun === true &&
    targetRecord.endpointBranchId === targetRecord.id &&
    typeof targetRecord.endpointId === "string" &&
    targetRecord.endpointType === "read_write" &&
    ["active", "idle"].includes(String(targetRecord.endpointState)) &&
    typeof timestamp === "string" &&
    typeof value.parentTimestamp === "string" &&
    Date.parse(timestamp) === Date.parse(value.parentTimestamp) &&
    typeof requestedTimestamp === "string" &&
    Number.isFinite(requestedAgeMs) &&
    requestedAgeMs >= 30_000 &&
    requestedAgeMs <= CYCLE4_PITR_EXPECTED_RETENTION_SECONDS * 1_000 - 30_000 &&
    Number.isFinite(ageMs) &&
    ageMs >= 30_000 &&
    ageMs <= CYCLE4_PITR_EXPECTED_RETENTION_SECONDS * 1_000 - 30_000 &&
    schemaRecord.result === "PASS" &&
    schemaRecord.method === "NEON_COMPARE_SCHEMA_API" &&
    schemaRecord.endpoint ===
      cycle4PitrCompareSchemaEndpoint(CYCLE4_PITR_PROJECT_ID, String(targetRecord.id)) &&
    schemaRecord.httpStatus === 200 &&
    schemaRecord.baseBranchId === CYCLE4_PITR_SOURCE_BRANCH_ID &&
    schemaRecord.targetBranchId === targetRecord.id &&
    schemaRecord.database === expected.database &&
    schemaRecord.baseTimestamp === timestamp &&
    schemaRecord.diffIsEmpty === true &&
    schemaRecord.matches === true &&
    dataRecord.result === "PASS" &&
    dataRecord.queryMode === "READ_ONLY" &&
    dataRecord.studentRecordsQueried === false &&
    dataRecord.questionTextOrAnswerKeysQueried === false &&
    Array.isArray(requiredTables) &&
    requiredTables.length === CYCLE4_PITR_REQUIRED_TABLES.length &&
    CYCLE4_PITR_REQUIRED_TABLES.every((table) => requiredTables.includes(table)) &&
    Array.isArray(missingTables) &&
    missingTables.length === 0 &&
    countRecord !== null &&
    Number(countRecord.learningPaths) > 0 &&
    Number(countRecord.learningUnits) > 0 &&
    Number(countRecord.learningSteps) > 0 &&
    Number(countRecord.content) > 0 &&
    Number(countRecord.contentVersions) > 0 &&
    Number(countRecord.exerciseTemplates) > 0 &&
    Number(countRecord.exerciseTemplateVersions) > 0 &&
    Number(countRecord.questions) > 0 &&
    Number(countRecord.questionVersions) > 0 &&
    Number(countRecord.assessments) > 0 &&
    Number(countRecord.successfulMigrations) > 0 &&
    restoredRecord.result === "PASS" &&
    restoredRecord.transactionReadOnly === true &&
    restoredRecord.database === expected.database &&
    restoredRecord.role === expected.role &&
    String(restoredRecord.port) === expected.port &&
    restoredRecord.schema === "public" &&
    restoredRecord.targetEndpointHostMatchedNeonApi === true &&
    unchangedRecord.result === "PASS" &&
    unchangedRecord.id === CYCLE4_PITR_SOURCE_BRANCH_ID &&
    unchangedRecord.default === true &&
    unchangedRecord.name === sourceRecord.name
  );
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw responseShapeError(label, "response shape invalid");
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw responseShapeError(label, "response field missing");
  return value;
}

export class Cycle4PitrSafeError extends Error {
  readonly failure: Cycle4PitrFailureRecord;

  constructor(failure: Cycle4PitrFailureRecord) {
    super(`${failure.stage}: ${failure.reason}`);
    this.failure = failure;
  }
}

function safeError(
  stage: string,
  reason: string,
  endpoint: string | null = null,
  httpStatus: number | null = null,
): Cycle4PitrSafeError {
  return new Cycle4PitrSafeError({ stage, endpoint, httpStatus, reason });
}

function responseShapeError(stage: string, reason: string): Cycle4PitrSafeError {
  return safeError(stage, reason, lastNeonResponse.endpoint, lastNeonResponse.httpStatus);
}

export function cycle4PitrFailureRecord(
  error: unknown,
  fallbackStage: string,
): Cycle4PitrFailureRecord {
  if (error instanceof Cycle4PitrSafeError) return error.failure;
  return {
    stage: fallbackStage,
    endpoint: null,
    httpStatus: null,
    reason: "validation failed; sensitive details suppressed",
  };
}

export function cycle4PitrHttpFailure(
  stage: string,
  endpoint: string,
  httpStatus: number,
): Cycle4PitrSafeError {
  return safeError(stage, `Neon Management API returned HTTP ${httpStatus}`, endpoint, httpStatus);
}

async function neonRequest<T>(
  apiKey: string,
  path: string,
  stage: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const endpoint = path.split("?", 1)[0] ?? path;
  lastNeonResponse = { endpoint, httpStatus: null };
  let response: Response;
  try {
    response = await fetch(`${NEON_API}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw safeError(
      stage,
      "Neon Management API request failed before receiving a response",
      endpoint,
    );
  }
  lastNeonResponse = { endpoint, httpStatus: response.status };
  if (!response.ok) {
    throw cycle4PitrHttpFailure(stage, endpoint, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw safeError(stage, "Neon Management API returned invalid JSON", endpoint, response.status);
  }
}

async function writeEvidence(path: string, evidence: JsonRecord): Promise<void> {
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath) {
    const report = JSON.stringify(evidence, null, 2);
    await appendFile(
      summaryPath,
      `\n## Cycle 4 PITR restore evidence\n\n\`\`\`json\n${report}\n\`\`\`\n`,
    );
  }
}

function runIdentity(): { runId: string; sha: string; attempt: string } {
  const runId = process.env.GITHUB_RUN_ID?.trim();
  const sha = process.env.GITHUB_SHA?.trim().toLowerCase();
  const attempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";
  if (!runId || !/^\d+$/u.test(runId) || !sha || !/^[0-9a-f]{40}$/u.test(sha)) {
    throw safeError("workflow identity", "GitHub Actions run ID or commit identity is unavailable");
  }
  return { runId, sha, attempt };
}

function parseNeonBranch(payload: unknown, label: string): NeonBranch {
  const branch = record(record(payload, label).branch, `${label}.branch`);
  if (
    typeof branch.id !== "string" ||
    typeof branch.project_id !== "string" ||
    typeof branch.name !== "string" ||
    typeof branch.current_state !== "string" ||
    typeof branch.default !== "boolean"
  ) {
    throw responseShapeError(label, "branch identity fields are incomplete");
  }
  return branch as NeonBranch;
}

function parseNeonEndpoint(payload: unknown, label: string): NeonEndpoint {
  const endpoint = record(record(payload, label).endpoint, `${label}.endpoint`);
  if (
    typeof endpoint.id !== "string" ||
    typeof endpoint.project_id !== "string" ||
    typeof endpoint.branch_id !== "string" ||
    typeof endpoint.host !== "string" ||
    typeof endpoint.type !== "string" ||
    typeof endpoint.current_state !== "string"
  ) {
    throw responseShapeError(label, "endpoint identity fields are incomplete");
  }
  return endpoint as NeonEndpoint;
}

function assertBranchIdentity(
  branch: NeonBranch,
  expected: { projectId: string; branchId: string; defaultValue: boolean; parentId?: string },
  stage: string,
): void {
  if (
    branch.project_id !== expected.projectId ||
    branch.id !== expected.branchId ||
    branch.default !== expected.defaultValue ||
    (expected.parentId !== undefined && branch.parent_id !== expected.parentId)
  ) {
    throw responseShapeError(
      stage,
      "branch project/parent/default identity did not match approved target",
    );
  }
}

async function readOnlyDatabaseCheck(
  databaseUrl: string,
  expected: { database: string; user: string; stage: string },
): Promise<{ database: string; role: string; schema: string; port: number; readOnly: true }> {
  const target = parseCatalogTargetUrl(databaseUrl, "PRODUCTION");
  if (target.database !== expected.database || target.user !== expected.user) {
    throw safeError(
      expected.stage,
      "database URI identity does not match the approved production identity",
    );
  }
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const rows = await tx.$queryRaw<
        Array<{ database: string; role: string; schema: string; port: number; read_only: string }>
      >`
        SELECT current_database() AS database,
               current_user AS role,
               current_schema() AS schema,
               inet_server_port() AS port,
               current_setting('transaction_read_only') AS read_only
      `;
      const identity = rows[0];
      if (
        !identity ||
        identity.database !== expected.database ||
        identity.role !== expected.user ||
        identity.schema !== "public" ||
        identity.read_only !== "on"
      ) {
        throw safeError(expected.stage, "read-only connection identity check failed");
      }
      return {
        database: identity.database,
        role: identity.role,
        schema: identity.schema,
        port: identity.port,
        readOnly: true as const,
      };
    });
    return result;
  } catch {
    throw safeError(expected.stage, "read-only PostgreSQL identity query failed");
  } finally {
    await prisma.$disconnect();
  }
}

async function readTargetDataChecks(databaseUrl: string): Promise<JsonRecord> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const tableRows = await tx.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      const existing = new Set(tableRows.map((row) => row.table_name));
      const missingTables = CYCLE4_PITR_REQUIRED_TABLES.filter((table) => !existing.has(table));
      if (missingTables.length) {
        throw safeError(
          "restored target data checks",
          `required schema tables missing: ${missingTables.join(",")}`,
        );
      }
      const countRows = await tx.$queryRaw<Array<{ counts: JsonRecord }>>`
        SELECT jsonb_build_object(
          'learningPaths', (SELECT count(*)::int FROM public."LearningPath"),
          'learningUnits', (SELECT count(*)::int FROM public."LearningUnit"),
          'learningSteps', (SELECT count(*)::int FROM public."LearningStep"),
          'content', (SELECT count(*)::int FROM public."Content"),
          'contentVersions', (SELECT count(*)::int FROM public."ContentVersion"),
          'exerciseTemplates', (SELECT count(*)::int FROM public."ExerciseTemplate"),
          'exerciseTemplateVersions', (SELECT count(*)::int FROM public."ExerciseTemplateVersion"),
          'exerciseTemplateQuestionLinks', (SELECT count(*)::int FROM public."ExerciseTemplateVersionQuestion"),
          'questions', (SELECT count(*)::int FROM public."Question"),
          'questionVersions', (SELECT count(*)::int FROM public."QuestionVersion"),
          'assessments', (SELECT count(*)::int FROM public."Assessment"),
          'migrationRecords', (SELECT count(*)::int FROM public."_prisma_migrations"),
          'successfulMigrations', (
            SELECT count(*)::int FROM public."_prisma_migrations"
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          )
        ) AS counts
      `;
      const counts = countRows[0]?.counts;
      if (
        !counts ||
        Number(counts.learningPaths) < 1 ||
        Number(counts.learningSteps) < 1 ||
        Number(counts.successfulMigrations) < 1
      ) {
        throw safeError(
          "restored target data checks",
          "curriculum or applied migration aggregate is empty",
        );
      }
      return {
        result: "PASS",
        queryMode: "READ_ONLY",
        requiredTables: [...CYCLE4_PITR_REQUIRED_TABLES],
        missingTables: [],
        aggregateCounts: counts,
        studentRecordsQueried: false,
        questionTextOrAnswerKeysQueried: false,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("restored target data checks:"))
      throw error;
    throw safeError("restored target data checks", "read-only schema/data queries failed");
  } finally {
    await prisma.$disconnect();
  }
}

async function compareSchema(
  apiKey: string,
  input: {
    projectId: string;
    targetBranchId: string;
    baseBranchId: string;
    baseTimestamp: string;
    databaseName: string;
  },
): Promise<{ endpoint: string; httpStatus: 200; diffIsEmpty: true }> {
  const { endpoint, requestPath } = cycle4PitrCompareSchemaRequest(input);
  const stage = "schema comparison";
  const response = await neonRequest<unknown>(apiKey, requestPath, stage);
  const parsed = parseCycle4PitrSchemaDiff(response);
  if (!parsed) {
    throw safeError(stage, "compare_schema response did not confirm an empty diff", endpoint, 200);
  }
  return { endpoint, httpStatus: 200, ...parsed };
}

async function waitForEndpoint(
  apiKey: string,
  projectId: string,
  endpointId: string,
  branchId: string,
): Promise<NeonEndpoint> {
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    const response = await neonRequest<unknown>(
      apiKey,
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`,
      "restored endpoint readiness",
    );
    const endpoint = parseNeonEndpoint(response, "restored endpoint readiness");
    if (endpoint.project_id !== projectId || endpoint.branch_id !== branchId || endpoint.disabled) {
      throw safeError(
        "restored endpoint readiness",
        "endpoint is not bound to the isolated target branch",
      );
    }
    if (["active", "idle"].includes(endpoint.current_state)) return endpoint;
    if (["failed", "deleting", "disabled"].includes(endpoint.current_state)) {
      throw safeError(
        "restored endpoint readiness",
        `endpoint entered ${endpoint.current_state} state`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw safeError(
    "restored endpoint readiness",
    "endpoint did not become ready within eight minutes",
  );
}

async function neonConnectionUri(
  apiKey: string,
  input: {
    projectId: string;
    branchId: string;
    endpointId: string;
    database: string;
    role: string;
  },
): Promise<string> {
  const params = new URLSearchParams({
    branch_id: input.branchId,
    endpoint_id: input.endpointId,
    database_name: input.database,
    role_name: input.role,
    pooled: "false",
  });
  const response = await neonRequest<unknown>(
    apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/connection_uri?${params.toString()}`,
    "restored target connection URI",
  );
  const payload = record(response, "connection URI");
  return text(payload.uri, "connection URI");
}

async function runPitrEvidence(): Promise<JsonRecord> {
  const now = Date.now();
  const run = runIdentity();
  const evidencePath = process.env.CYCLE4_PITR_EVIDENCE_PATH?.trim();
  if (!evidencePath) throw safeError("evidence output", "CYCLE4_PITR_EVIDENCE_PATH is required");
  const evidence: JsonRecord = {
    schemaVersion: 2,
    status: "FAIL",
    createdAt: new Date(now).toISOString(),
    projectId: CYCLE4_PITR_PROJECT_ID,
    sourceBranchId: CYCLE4_PITR_SOURCE_BRANCH_ID,
    sourceCommit: run.sha,
    workflowRunId: run.runId,
    workflowRunAttempt: run.attempt,
    writeScope: "ISOLATED_NEON_RESTORE_BRANCH_ONLY",
    productionDatabaseWrites: false,
    productionBranchMutated: false,
    studentDataQueried: false,
    studentProgressChanged: false,
  };
  let stage = "preflight";
  try {
    if (
      process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      process.env.GITHUB_REF !== "refs/heads/master" ||
      process.env.APP_ENV !== "production" ||
      process.env.DB_FINGERPRINT_ENVIRONMENT !== "PRODUCTION" ||
      process.env.CYCLE4_OPERATION !== "APPLY"
    ) {
      throw safeError(stage, "protected manual master APPLY workflow gate did not match");
    }
    const apiKey = process.env.NEON_MANAGEMENT_API_KEY?.trim();
    if (!apiKey) {
      evidence.status = "BLOCKED";
      evidence.blockingReason = "Required GitHub environment secret NEON_API_KEY is missing";
      await writeEvidence(evidencePath, evidence);
      return evidence;
    }
    const productionUrl = process.env.EDUCATION_V2_P1_A_CYCLE_4_PRODUCTION_DATABASE_URL?.trim();
    const approvedFingerprint =
      process.env.PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT?.trim().toLowerCase();
    const expectedHost = process.env.PRODUCTION_DB_APPROVED_HOST?.trim()
      .toLowerCase()
      .replace(/\.$/u, "");
    const expectedPort = process.env.PRODUCTION_DB_APPROVED_PORT?.trim();
    const expectedDatabase = process.env.PRODUCTION_DB_APPROVED_DATABASE?.trim();
    const expectedUser = process.env.PRODUCTION_DB_APPROVED_USER?.trim();
    if (
      !productionUrl ||
      !approvedFingerprint ||
      !expectedHost ||
      !expectedPort ||
      !expectedDatabase ||
      !expectedUser
    ) {
      throw safeError(stage, "approved production target configuration is incomplete");
    }
    const productionTarget = parseCatalogTargetUrl(productionUrl, "PRODUCTION");
    if (
      productionTarget.provider !== "NEON" ||
      productionTarget.host !== expectedHost ||
      productionTarget.port !== expectedPort ||
      productionTarget.database !== expectedDatabase ||
      productionTarget.user !== expectedUser ||
      !/^[a-f0-9]{64}$/u.test(approvedFingerprint)
    ) {
      throw safeError(stage, "production connection does not match approved target configuration");
    }

    stage = "Neon project identity";
    const projectPayload = record(
      await neonRequest<unknown>(apiKey, `/projects/${CYCLE4_PITR_PROJECT_ID}`, stage),
      stage,
    );
    const project = record(projectPayload.project, `${stage}.project`);
    const projectId = text(project.id, `${stage}.id`);
    const retention = Number(project.history_retention_seconds);
    if (
      projectId !== CYCLE4_PITR_PROJECT_ID ||
      retention !== CYCLE4_PITR_EXPECTED_RETENTION_SECONDS
    ) {
      throw safeError(
        stage,
        "Neon project ID or history retention does not match the approved values",
      );
    }
    evidence.historyRetentionSeconds = retention;

    stage = "source branch identity";
    const sourcePayload = await neonRequest<unknown>(
      apiKey,
      `/projects/${CYCLE4_PITR_PROJECT_ID}/branches/${CYCLE4_PITR_SOURCE_BRANCH_ID}`,
      stage,
    );
    const source = parseNeonBranch(sourcePayload, stage);
    assertBranchIdentity(
      source,
      { projectId, branchId: CYCLE4_PITR_SOURCE_BRANCH_ID, defaultValue: true },
      stage,
    );
    if (!["ready"].includes(source.current_state)) {
      throw safeError(stage, "approved production source branch is not ready");
    }
    const productionIdentity = await readOnlyDatabaseCheck(productionUrl, {
      database: expectedDatabase,
      user: expectedUser,
      stage: "production source read-only identity",
    });
    const actualFingerprint = targetIdentityFingerprint({
      environment: "PRODUCTION",
      provider: providerForHost(productionTarget.host),
      host: productionTarget.host,
      port: productionTarget.port,
      database: productionIdentity.database,
      dbUser: productionIdentity.role,
    });
    if (
      productionIdentity.port.toString() !== expectedPort ||
      actualFingerprint !== approvedFingerprint
    ) {
      throw safeError(
        stage,
        "live production database identity does not match the approved fingerprint",
      );
    }
    const productionEndpointId = productionTarget.host.match(/^(ep-[^.]+?)(?:-pooler)?\./u)?.[1];
    if (!productionEndpointId)
      throw safeError(
        stage,
        "production endpoint identity could not be derived from approved host",
      );
    const sourceEndpointPayload = await neonRequest<unknown>(
      apiKey,
      `/projects/${CYCLE4_PITR_PROJECT_ID}/endpoints/${encodeURIComponent(productionEndpointId)}`,
      "source endpoint identity",
    );
    const sourceEndpoint = parseNeonEndpoint(sourceEndpointPayload, "source endpoint identity");
    if (
      sourceEndpoint.project_id !== projectId ||
      sourceEndpoint.branch_id !== source.id ||
      sourceEndpoint.type !== "read_write" ||
      normalizeNeonEndpointHost(sourceEndpoint.host) !==
        normalizeNeonEndpointHost(productionTarget.host)
    ) {
      throw safeError(
        "source endpoint identity",
        "production URL endpoint does not map to approved source branch",
      );
    }
    evidence.productionTargetIdentity = "PASS";
    evidence.sourceBranch = {
      id: source.id,
      name: source.name,
      projectId: source.project_id,
      default: source.default,
      state: source.current_state,
      endpointId: sourceEndpoint.id,
      endpointBranchId: sourceEndpoint.branch_id,
      defaultStatePreserved: true,
    };

    stage = "PITR branch";
    const targetName = `okupratik-cycle4-pitr-${run.runId}`;
    const branchesPayload = record(
      await neonRequest<unknown>(
        apiKey,
        `/projects/${projectId}/branches?${new URLSearchParams({ search: targetName })}`,
        stage,
      ),
      stage,
    );
    const branches = Array.isArray(branchesPayload.branches) ? branchesPayload.branches : [];
    const existing = branches
      .map((item) => record(item, "branch list item"))
      .find((item) => item.name === targetName);
    let target: NeonBranch;
    let parentTimestamp: string;
    let createdForThisRun = false;
    let endpointId: string | null = null;
    if (existing) {
      target = existing as unknown as NeonBranch;
      parentTimestamp = text(target.parent_timestamp, "existing PITR parent_timestamp");
      if (!isCycle4PitrTimestampInWindow(parentTimestamp, Date.now(), retention)) {
        throw safeError(
          stage,
          "existing run-specific PITR branch is outside the active retention window",
        );
      }
      assertBranchIdentity(
        target,
        { projectId, branchId: target.id, defaultValue: false, parentId: source.id },
        stage,
      );
      if (target.name !== targetName || target.id === source.id) {
        throw responseShapeError(stage, "existing run-specific branch name/identity conflicted");
      }
    } else {
      createdForThisRun = true;
      parentTimestamp = cycle4PitrTimestamp(Date.now());
      if (!isCycle4PitrTimestampInWindow(parentTimestamp, Date.now(), retention)) {
        throw safeError(
          stage,
          "runtime parent_timestamp is outside the verified Neon history window",
        );
      }
      const created = await neonRequest<unknown>(apiKey, `/projects/${projectId}/branches`, stage, {
        method: "POST",
        body: {
          branch: {
            name: targetName,
            parent_id: source.id,
            parent_timestamp: parentTimestamp,
            init_source: "parent-data",
            protected: false,
          },
          endpoints: [{ type: "read_write" }],
          annotation_value: {
            purpose: "cycle4-pitr-restore-validation",
            github_run_id: run.runId,
            github_sha: run.sha,
          },
        },
      });
      target = parseNeonBranch(created, "PITR branch creation");
      const createdPayload = record(created, "PITR branch creation");
      const endpoints = Array.isArray(createdPayload.endpoints) ? createdPayload.endpoints : [];
      const firstEndpoint = endpoints[0];
      endpointId = cycle4PitrOptionalEndpointId(firstEndpoint);
      assertBranchIdentity(
        target,
        { projectId, branchId: target.id, defaultValue: false, parentId: source.id },
        stage,
      );
      if (target.name !== targetName || target.id === source.id) {
        throw responseShapeError(
          stage,
          "created PITR branch identity did not match requested isolated branch",
        );
      }
    }
    const requestedParentTimestamp = parentTimestamp;
    evidence.requestedParentTimestamp = requestedParentTimestamp;
    if (!endpointId) {
      const endpointsResponse = record(
        await neonRequest<unknown>(
          apiKey,
          `/projects/${projectId}/endpoints`,
          "PITR endpoint lookup",
        ),
        "PITR endpoint lookup",
      );
      const endpointList = Array.isArray(endpointsResponse.endpoints)
        ? endpointsResponse.endpoints
        : [];
      const matching = endpointList
        .map((item) => record(item, "PITR endpoint"))
        .find((item) => item.branch_id === target.id && item.type === "read_write");
      if (matching) endpointId = text(matching.id, "existing PITR endpoint id");
    }
    if (!endpointId) {
      const endpointCreate = record(
        await neonRequest<unknown>(
          apiKey,
          `/projects/${projectId}/endpoints`,
          "PITR endpoint creation",
          {
            method: "POST",
            body: { endpoint: { branch_id: target.id, type: "read_write" } },
          },
        ),
        "PITR endpoint creation",
      );
      endpointId = text(
        record(endpointCreate.endpoint, "PITR endpoint creation endpoint").id,
        "PITR endpoint id",
      );
    }
    const endpoint = await waitForEndpoint(apiKey, projectId, endpointId, target.id);
    const targetPayload = await neonRequest<unknown>(
      apiKey,
      `/projects/${projectId}/branches/${encodeURIComponent(target.id)}`,
      "PITR target verification",
    );
    target = parseNeonBranch(targetPayload, "PITR target verification");
    const targetEnvelope = record(targetPayload, "PITR target verification");
    const annotation = record(targetEnvelope.annotation, "PITR target annotation");
    const annotationValue = record(annotation.value, "PITR target annotation value");
    if (
      annotationValue.purpose !== "cycle4-pitr-restore-validation" ||
      annotationValue.github_run_id !== run.runId ||
      annotationValue.github_sha !== run.sha
    ) {
      throw responseShapeError(
        "PITR target verification",
        "restored branch is not annotated for this workflow run and commit",
      );
    }
    assertBranchIdentity(
      target,
      { projectId, branchId: target.id, defaultValue: false, parentId: source.id },
      "PITR target verification",
    );
    if (target.name !== targetName || target.current_state !== "ready" || target.id === source.id) {
      throw responseShapeError(
        "PITR target verification",
        "restored branch is not isolated and ready",
      );
    }
    const verifiedParentTimestamp = text(target.parent_timestamp, "target parent_timestamp");
    if (
      (!createdForThisRun &&
        !cycle4PitrTimestampMatches(verifiedParentTimestamp, parentTimestamp)) ||
      !isCycle4PitrTimestampInWindow(verifiedParentTimestamp, Date.now(), retention)
    ) {
      throw responseShapeError(
        "PITR target verification",
        "restored branch parent_timestamp was inconsistent or outside the active retention window",
      );
    }
    parentTimestamp = verifiedParentTimestamp;
    evidence.parentTimestamp = parentTimestamp;
    evidence.targetBranch = {
      id: target.id,
      name: target.name,
      projectId: target.project_id,
      parentId: target.parent_id,
      parentTimestamp: target.parent_timestamp,
      default: target.default,
      state: target.current_state,
      endpointId: endpoint.id,
      endpointBranchId: endpoint.branch_id,
      endpointType: endpoint.type,
      endpointState: endpoint.current_state,
      annotationMatchesRun: true,
      isolatedFromProduction: target.id !== source.id && target.default === false,
    };

    stage = "schema comparison";
    const schemaDiff = await compareSchema(apiKey, {
      projectId,
      targetBranchId: target.id,
      baseBranchId: source.id,
      baseTimestamp: parentTimestamp,
      databaseName: expectedDatabase,
    });
    evidence.schemaComparison = {
      result: "PASS",
      method: "NEON_COMPARE_SCHEMA_API",
      endpoint: schemaDiff.endpoint,
      httpStatus: schemaDiff.httpStatus,
      baseBranchId: source.id,
      targetBranchId: target.id,
      database: expectedDatabase,
      baseTimestamp: parentTimestamp,
      diffIsEmpty: schemaDiff.diffIsEmpty,
      matches: true,
    };

    stage = "restored target database checks";
    const targetUrl = await neonConnectionUri(apiKey, {
      projectId,
      branchId: target.id,
      endpointId: endpoint.id,
      database: expectedDatabase,
      role: expectedUser,
    });
    const targetUrlIdentity = parseCatalogTargetUrl(targetUrl, "PRODUCTION");
    if (
      targetUrlIdentity.provider !== "NEON" ||
      normalizeNeonEndpointHost(targetUrlIdentity.host) !==
        normalizeNeonEndpointHost(endpoint.host) ||
      targetUrlIdentity.database !== expectedDatabase ||
      targetUrlIdentity.user !== expectedUser
    ) {
      throw safeError(
        stage,
        "Neon-issued connection URI does not map to the verified target endpoint",
      );
    }
    const targetIdentity = await readOnlyDatabaseCheck(targetUrl, {
      database: expectedDatabase,
      user: expectedUser,
      stage,
    });
    if (targetIdentity.port.toString() !== expectedPort) {
      throw safeError(
        stage,
        "restored database port identity does not match approved target configuration",
      );
    }
    evidence.restoredDatabaseIdentity = {
      result: "PASS",
      database: targetIdentity.database,
      role: targetIdentity.role,
      schema: targetIdentity.schema,
      port: targetIdentity.port,
      transactionReadOnly: true,
      targetEndpointHostMatchedNeonApi: true,
    };
    evidence.dataChecks = await readTargetDataChecks(targetUrl);

    stage = "production unchanged verification";
    const finalSourcePayload = await neonRequest<unknown>(
      apiKey,
      `/projects/${projectId}/branches/${encodeURIComponent(source.id)}`,
      stage,
    );
    const finalSource = parseNeonBranch(finalSourcePayload, stage);
    assertBranchIdentity(
      finalSource,
      { projectId, branchId: source.id, defaultValue: true },
      stage,
    );
    if (finalSource.name !== source.name)
      throw safeError(stage, "production source branch name changed during verification");
    evidence.productionSourceUnchanged = {
      result: "PASS",
      id: finalSource.id,
      name: finalSource.name,
      default: finalSource.default,
    };
    evidence.status = "PASS";
    evidence.completedAt = new Date().toISOString();
    return evidence;
  } catch (error) {
    const safeFailure = cycle4PitrFailureRecord(error, stage);
    evidence.status = "FAIL";
    evidence.failedStage = safeFailure.stage;
    evidence.failure = safeFailure;
    evidence.completedAt = new Date().toISOString();
    return evidence;
  } finally {
    await writeEvidence(evidencePath, evidence);
  }
}

async function main(): Promise<void> {
  const evidence = await runPitrEvidence();
  console.log(JSON.stringify(evidence, null, 2));
  if (evidence.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("production-cycle4-pitr-restore-evidence.ts")) {
  main().catch(() => {
    process.exitCode = 1;
    console.error("Cycle 4 PITR evidence failed; detailed sensitive error suppressed.");
  });
}
