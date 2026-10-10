import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ANALYSIS_GROUPS = [
  "GENERAL_STUDENT_POPULATION",
  "STUDENTS_NEEDING_READING_DEVELOPMENT",
] as const;

export const P1C_V2_RELATION_TYPES = [
  "DIRECT_SUPPORT",
  "LIMITED_SUPPORT",
  "COMPARISON",
  "CAUSAL_SUPPORT",
  "NOT_SUPPORTED_OR_CONTRADICTS",
] as const;

type P1C_V2_TaskDimension = "INFERENCE" | "EVIDENCE_FINDING" | "EVIDENCE_RELATION";

export const P1C_V2_TASK_CONTRACT = [
  {
    taskDesignId: "V2C-INF-01",
    dimension: "INFERENCE",
    passageDesignRef: "P1C-V2-TXT-01@1.0",
    responseFields: ["answer.optionId"],
    allowedEvidenceCandidateIds: [],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-INF-02",
    dimension: "INFERENCE",
    passageDesignRef: "P1C-V2-TXT-02@1.0",
    responseFields: ["answer.optionId"],
    allowedEvidenceCandidateIds: [],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-INF-03",
    dimension: "INFERENCE",
    passageDesignRef: "P1C-V2-TXT-03@1.0",
    responseFields: ["answer.optionId"],
    allowedEvidenceCandidateIds: [],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-INF-04",
    dimension: "INFERENCE",
    passageDesignRef: "P1C-V2-TXT-04@1.0",
    responseFields: ["answer.optionId"],
    allowedEvidenceCandidateIds: [],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-EVF-01",
    dimension: "EVIDENCE_FINDING",
    passageDesignRef: "P1C-V2-TXT-05@1.0",
    responseFields: ["evidenceCandidateId"],
    allowedEvidenceCandidateIds: ["SPAN-01", "SPAN-02", "SPAN-03", "SPAN-04"],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-EVF-02",
    dimension: "EVIDENCE_FINDING",
    passageDesignRef: "P1C-V2-TXT-06@1.0",
    responseFields: ["evidenceCandidateId"],
    allowedEvidenceCandidateIds: ["SPAN-01", "SPAN-02", "SPAN-03", "SPAN-04"],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-EVF-03",
    dimension: "EVIDENCE_FINDING",
    passageDesignRef: "P1C-V2-TXT-07@1.0",
    responseFields: ["evidenceCandidateId"],
    allowedEvidenceCandidateIds: ["SPAN-01", "SPAN-02", "SPAN-03", "SPAN-04"],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-EVF-04",
    dimension: "EVIDENCE_FINDING",
    passageDesignRef: "P1C-V2-TXT-08@1.0",
    responseFields: ["evidenceCandidateId"],
    allowedEvidenceCandidateIds: ["SPAN-01", "SPAN-02", "SPAN-03", "SPAN-04"],
    allowedRelationTypes: [],
    targetRelationTypes: [],
  },
  {
    taskDesignId: "V2C-REL-01",
    dimension: "EVIDENCE_RELATION",
    passageDesignRef: "P1C-V2-TXT-09@1.0",
    responseFields: ["evidenceCandidateId", "relationType"],
    allowedEvidenceCandidateIds: ["CAND-01", "CAND-02", "CAND-03"],
    allowedRelationTypes: P1C_V2_RELATION_TYPES,
    targetRelationTypes: ["LIMITED_SUPPORT"],
  },
  {
    taskDesignId: "V2C-REL-02",
    dimension: "EVIDENCE_RELATION",
    passageDesignRef: "P1C-V2-TXT-10@1.0",
    responseFields: ["evidenceCandidateId", "relationType"],
    allowedEvidenceCandidateIds: ["CAND-01", "CAND-02", "CAND-03"],
    allowedRelationTypes: P1C_V2_RELATION_TYPES,
    targetRelationTypes: ["LIMITED_SUPPORT"],
  },
  {
    taskDesignId: "V2C-REL-03",
    dimension: "EVIDENCE_RELATION",
    passageDesignRef: "P1C-V2-TXT-11@1.0",
    responseFields: ["evidenceCandidateId", "relationType"],
    allowedEvidenceCandidateIds: ["CAND-01", "CAND-02", "CAND-03"],
    allowedRelationTypes: P1C_V2_RELATION_TYPES,
    targetRelationTypes: ["LIMITED_SUPPORT"],
  },
  {
    taskDesignId: "V2C-REL-04",
    dimension: "EVIDENCE_RELATION",
    passageDesignRef: "P1C-V2-TXT-12@1.0",
    responseFields: ["evidenceCandidateId", "relationType"],
    allowedEvidenceCandidateIds: ["CAND-01", "CAND-02", "CAND-03", "CAND-04"],
    allowedRelationTypes: P1C_V2_RELATION_TYPES,
    targetRelationTypes: ["LIMITED_SUPPORT"],
  },
] as const;

type TaskId = (typeof P1C_V2_TASK_CONTRACT)[number]["taskDesignId"];
type RelationType = (typeof P1C_V2_RELATION_TYPES)[number];

const TASK_IDS = P1C_V2_TASK_CONTRACT.map((task) => task.taskDesignId) as TaskId[];
const TASK_CONTRACT_BY_ID = new Map(P1C_V2_TASK_CONTRACT.map((task) => [task.taskDesignId, task]));

const COMPLETENESS_VALUES = ["COMPLETE", "BLANK", "PARTIAL", "INVALID", "REVIEW_REQUIRED"] as const;
const VERSION_STATUSES = ["NOT_CREATED", "AVAILABLE"] as const;
const PILOT_PROTOCOL_STATUSES = ["DESIGN_ONLY", "SET"] as const;

const CANONICAL_DESIGN_CONTRACT = {
  datasetVersion: "P1C-V2-PILOT-DATASET-V1",
  itemPoolId: "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN",
  sourceCommit: "f1c8ab90ceec29a4cc129b406d4ab961d6548e31",
  mappingVersion: "P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN",
  rubricVersion: "P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN",
  pilotProtocolVersion: "P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1",
} as const;

const CANONICAL_DESIGN_PASSAGE_REFS = Object.fromEntries(
  P1C_V2_TASK_CONTRACT.map((task) => [task.taskDesignId, task.passageDesignRef]),
) as Record<TaskId, string>;

const EVIDENCE_CANDIDATES = Object.fromEntries(
  P1C_V2_TASK_CONTRACT.filter((task) => task.allowedEvidenceCandidateIds.length > 0).map((task) => [
    task.taskDesignId,
    task.allowedEvidenceCandidateIds,
  ]),
) as Partial<Record<TaskId, readonly string[]>>;

const GRADE_BAND_PATTERN = /^G(?:[1-9]|1[0-2])$/u;

const FORBIDDEN_KEYS = new Set([
  "address",
  "contact",
  "email",
  "firstname",
  "fullname",
  "ip",
  "ipaddress",
  "lastname",
  "name",
  "phone",
  "sessionid",
  "studentid",
  "tenant",
  "tenantid",
  "telephone",
  "userid",
]);

type JsonObject = Record<string, unknown>;
type AnalysisGroup = (typeof ANALYSIS_GROUPS)[number];
type Completeness = (typeof COMPLETENESS_VALUES)[number];
type VersionStatus = (typeof VERSION_STATUSES)[number];
type PilotProtocolStatus = (typeof PILOT_PROTOCOL_STATUSES)[number];

export interface OfflinePilotManifest {
  datasetVersion: string;
  itemPoolId: string;
  sourceCommit: string;
  designStatus: "DESIGN_ONLY";
  taskDesignIds: string[];
  passageDesignRefs: Record<TaskId, string | null>;
  passageVersionStatus: VersionStatus;
  passageVersionIds: string[];
  passageVersionBindings: Record<TaskId, string | null>;
  questionVersionStatus: VersionStatus;
  questionVersionIds: string[];
  questionVersionBindings: Record<TaskId, string | null>;
  mappingVersion: string;
  rubricVersion: string;
  pilotProtocolStatus: PilotProtocolStatus;
  pilotProtocolVersion?: string | null;
  groupCriteriaVersion: string;
  groupCriteriaReference: string;
  targetGradeStatus: string;
  targetGradeBand?: string | null;
  analysisGroups: string[];
}

export interface OfflinePilotResponse {
  pilotParticipantId: string;
  analysisGroup: string;
  gradeBand?: string | null;
  taskDesignId: string;
  passageVersionId: string;
  questionVersionId: string;
  taskOrder: number;
  answerCompleteness: Completeness;
  answer?: JsonObject;
  evidenceCandidateId?: string;
  relationType?: string;
  raterScores?: Array<{ raterCode: string; score: string | number | boolean }>;
  adjudication?: JsonObject;
}

export interface ValidationIssue {
  code: string;
  recordIndex?: number;
  field?: string;
}

interface ParsedDataset {
  manifest: OfflinePilotManifest;
  records: OfflinePilotResponse[];
  manifestIssues: ValidationIssue[];
  recordIssues: ValidationIssue[];
  duplicateIssues: ValidationIssue[];
}

interface DistributionTable {
  [key: string]: Record<string, number>;
}

export interface OfflinePilotAnalysisReport {
  status: "OK" | "INVALID_INPUT" | "INVALID_DATA";
  summary: {
    responseCount: number;
    uniqueAnonymousParticipantCount: number;
    groupCounts: Record<string, number>;
    taskCounts: Record<string, number>;
    completenessCounts: Record<string, number>;
  };
  distributions: {
    taskAndGroupCounts: DistributionTable;
    inferenceOptionCounts: DistributionTable;
    evidenceFindingCandidateCounts: DistributionTable;
    evidenceRelationCandidateCounts: DistributionTable;
    evidenceRelationTypeCounts: DistributionTable;
  };
  strata: {
    groupGradeCounts: DistributionTable;
    missingGroupCount: number;
    missingGradeCount: number;
    emptyCells: string[];
  };
  raterAgreement: {
    recordsWithMultipleRaters: number;
    agreementCount: number;
    disagreementCount: number;
    adjudicationCount: number;
  };
  versionIntegrity: {
    valid: boolean;
    warnings: string[];
  };
  dataQuality: {
    issues: ValidationIssue[];
    warnings: string[];
  };
  safety: {
    offlineOnly: true;
    productionDatabase: "NOT_USED";
    network: "NOT_USED";
    rawResponses: "OMITTED";
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function recordIssue(
  issues: ValidationIssue[],
  code: string,
  recordIndex?: number,
  field?: string,
): void {
  issues.push({
    code,
    ...(recordIndex === undefined ? {} : { recordIndex }),
    ...(field ? { field } : {}),
  });
}

function walkForbiddenKeys(value: unknown, issues: ValidationIssue[], recordIndex?: number): void {
  if (Array.isArray(value)) {
    for (const child of value) walkForbiddenKeys(child, issues, recordIndex);
    return;
  }

  if (!isObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      recordIssue(issues, "FORBIDDEN_FIELD", recordIndex, key);
    }
    walkForbiddenKeys(child, issues, recordIndex);
  }
}

function stringOrNull(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isDesignIdentifier(value: string): boolean {
  return /^V2C-(?:INF|EVF|REL)-\d{2}(?:-Q)?(?:@.+)?$/u.test(value);
}

function isDesignPassageReference(value: string): boolean {
  return /^P1C-V2-TXT-\d{2}@\d+\.\d+$/u.test(value);
}

function isAllowedGradeBand(value: unknown): value is string {
  return typeof value === "string" && GRADE_BAND_PATTERN.test(value);
}

function isAllowedEvidenceCandidate(taskDesignId: string, value: unknown): value is string {
  if (!nonEmptyString(value)) return false;
  const candidates: readonly string[] | undefined =
    EVIDENCE_CANDIDATES[taskDesignId as keyof typeof EVIDENCE_CANDIDATES];
  return candidates !== undefined && candidates.includes(value);
}

function isAllowedRelationType(taskDesignId: string, value: unknown): value is RelationType {
  if (!nonEmptyString(value)) return false;
  const task = TASK_CONTRACT_BY_ID.get(taskDesignId as TaskId);
  return task?.allowedRelationTypes.some((relationType) => relationType === value) ?? false;
}

function parseManifest(value: unknown): {
  manifest: OfflinePilotManifest;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) {
    recordIssue(issues, "MANIFEST_NOT_OBJECT");
    return { manifest: {} as OfflinePilotManifest, issues };
  }

  const requiredFields = [
    "datasetVersion",
    "itemPoolId",
    "sourceCommit",
    "designStatus",
    "passageVersionStatus",
    "questionVersionStatus",
    "mappingVersion",
    "rubricVersion",
    "pilotProtocolStatus",
    "groupCriteriaVersion",
    "groupCriteriaReference",
    "targetGradeStatus",
  ];

  for (const field of requiredFields) {
    if (!nonEmptyString(value[field]))
      recordIssue(issues, "MANIFEST_FIELD_REQUIRED", undefined, field);
  }

  if (!/^[0-9a-f]{7,64}$/iu.test(String(value.sourceCommit ?? ""))) {
    recordIssue(issues, "MANIFEST_SOURCE_COMMIT_INVALID", undefined, "sourceCommit");
  }

  if (value.datasetVersion !== CANONICAL_DESIGN_CONTRACT.datasetVersion)
    recordIssue(issues, "MANIFEST_DATASET_VERSION_UNSUPPORTED", undefined, "datasetVersion");
  if (value.itemPoolId !== CANONICAL_DESIGN_CONTRACT.itemPoolId)
    recordIssue(issues, "MANIFEST_ITEM_POOL_UNSUPPORTED", undefined, "itemPoolId");
  if (value.sourceCommit !== CANONICAL_DESIGN_CONTRACT.sourceCommit)
    recordIssue(issues, "MANIFEST_SOURCE_COMMIT_UNSUPPORTED", undefined, "sourceCommit");
  if (value.mappingVersion !== CANONICAL_DESIGN_CONTRACT.mappingVersion)
    recordIssue(issues, "MANIFEST_MAPPING_VERSION_UNSUPPORTED", undefined, "mappingVersion");
  if (value.rubricVersion !== CANONICAL_DESIGN_CONTRACT.rubricVersion)
    recordIssue(issues, "MANIFEST_RUBRIC_VERSION_UNSUPPORTED", undefined, "rubricVersion");
  if (value.designStatus !== "DESIGN_ONLY")
    recordIssue(issues, "MANIFEST_DESIGN_STATUS_INVALID", undefined, "designStatus");

  const taskDesignIds = value.taskDesignIds;
  if (
    !Array.isArray(taskDesignIds) ||
    taskDesignIds.length !== TASK_IDS.length ||
    new Set(taskDesignIds).size !== TASK_IDS.length ||
    TASK_IDS.some((taskId) => !taskDesignIds.includes(taskId))
  ) {
    recordIssue(issues, "MANIFEST_TASK_DESIGN_IDS_INVALID", undefined, "taskDesignIds");
  }

  const passageDesignRefs = value.passageDesignRefs;
  if (!isObject(passageDesignRefs)) {
    recordIssue(issues, "MANIFEST_PASSAGE_DESIGN_REFS_INVALID", undefined, "passageDesignRefs");
  } else {
    if (Object.keys(passageDesignRefs).length !== TASK_IDS.length)
      recordIssue(issues, "MANIFEST_PASSAGE_DESIGN_REFS_INVALID", undefined, "passageDesignRefs");
    for (const taskId of TASK_IDS) {
      const expected = CANONICAL_DESIGN_PASSAGE_REFS[taskId];
      if (passageDesignRefs[taskId] !== expected)
        recordIssue(issues, "MANIFEST_TASK_PASSAGE_DESIGN_MISMATCH", undefined, taskId);
    }
  }

  for (const field of ["passageVersionIds", "questionVersionIds"]) {
    const versionList = value[field];
    if (versionList !== undefined && !Array.isArray(versionList)) {
      recordIssue(issues, "MANIFEST_VERSION_LIST_INVALID", undefined, field);
    } else if (Array.isArray(versionList) && !versionList.every((item) => nonEmptyString(item))) {
      recordIssue(issues, "MANIFEST_VERSION_LIST_INVALID", undefined, field);
    }
  }

  if (!VERSION_STATUSES.includes(value.passageVersionStatus as VersionStatus))
    recordIssue(issues, "MANIFEST_VERSION_STATUS_INVALID", undefined, "passageVersionStatus");
  if (!VERSION_STATUSES.includes(value.questionVersionStatus as VersionStatus))
    recordIssue(issues, "MANIFEST_VERSION_STATUS_INVALID", undefined, "questionVersionStatus");

  const passageVersionIds = Array.isArray(value.passageVersionIds) ? value.passageVersionIds : [];
  const questionVersionIds = Array.isArray(value.questionVersionIds)
    ? value.questionVersionIds
    : [];
  if (value.passageVersionStatus === "NOT_CREATED" && passageVersionIds.length > 0)
    recordIssue(issues, "PASSAGE_VERSION_LIST_MUST_BE_EMPTY", undefined, "passageVersionIds");
  if (value.questionVersionStatus === "NOT_CREATED" && questionVersionIds.length > 0)
    recordIssue(issues, "QUESTION_VERSION_LIST_MUST_BE_EMPTY", undefined, "questionVersionIds");
  if (value.passageVersionStatus === "AVAILABLE" && passageVersionIds.length === 0)
    recordIssue(issues, "PASSAGE_VERSION_LIST_REQUIRED", undefined, "passageVersionIds");
  if (value.questionVersionStatus === "AVAILABLE" && questionVersionIds.length === 0)
    recordIssue(issues, "QUESTION_VERSION_LIST_REQUIRED", undefined, "questionVersionIds");
  if (passageVersionIds.some((item) => typeof item === "string" && isDesignPassageReference(item)))
    recordIssue(issues, "PASSAGE_VERSION_LIST_USES_DESIGN_REF", undefined, "passageVersionIds");
  if (questionVersionIds.some((item) => typeof item === "string" && isDesignIdentifier(item)))
    recordIssue(issues, "QUESTION_VERSION_LIST_USES_DESIGN_ID", undefined, "questionVersionIds");

  for (const field of ["passageVersionBindings", "questionVersionBindings"]) {
    const bindings = value[field];
    if (!isObject(bindings)) {
      recordIssue(issues, "MANIFEST_VERSION_BINDINGS_INVALID", undefined, field);
      continue;
    }
    if (Object.keys(bindings).length !== TASK_IDS.length)
      recordIssue(issues, "MANIFEST_VERSION_BINDINGS_INVALID", undefined, field);
    for (const taskId of TASK_IDS) {
      const binding = bindings[taskId];
      if (binding !== null && !nonEmptyString(binding))
        recordIssue(issues, "MANIFEST_VERSION_BINDING_INVALID", undefined, `${field}.${taskId}`);
      if (
        field === "passageVersionBindings" &&
        typeof binding === "string" &&
        isDesignPassageReference(binding)
      ) {
        recordIssue(issues, "PASSAGE_BINDING_USES_DESIGN_REF", undefined, `${field}.${taskId}`);
      }
      if (
        field === "questionVersionBindings" &&
        typeof binding === "string" &&
        isDesignIdentifier(binding)
      ) {
        recordIssue(issues, "QUESTION_BINDING_USES_DESIGN_ID", undefined, `${field}.${taskId}`);
      }
      if (
        field === "passageVersionBindings" &&
        typeof binding === "string" &&
        !passageVersionIds.includes(binding)
      )
        recordIssue(issues, "PASSAGE_BINDING_NOT_IN_LIST", undefined, `${field}.${taskId}`);
      if (
        field === "questionVersionBindings" &&
        typeof binding === "string" &&
        !questionVersionIds.includes(binding)
      )
        recordIssue(issues, "QUESTION_BINDING_NOT_IN_LIST", undefined, `${field}.${taskId}`);
      if (value.passageVersionStatus === "NOT_CREATED" && binding !== null)
        recordIssue(issues, "PASSAGE_BINDING_MUST_BE_NULL", undefined, `${field}.${taskId}`);
      if (value.questionVersionStatus === "NOT_CREATED" && binding !== null)
        recordIssue(issues, "QUESTION_BINDING_MUST_BE_NULL", undefined, `${field}.${taskId}`);
    }
  }

  if (!PILOT_PROTOCOL_STATUSES.includes(value.pilotProtocolStatus as PilotProtocolStatus))
    recordIssue(issues, "MANIFEST_PILOT_PROTOCOL_STATUS_INVALID", undefined, "pilotProtocolStatus");
  if (
    value.pilotProtocolStatus === "DESIGN_ONLY" &&
    value.pilotProtocolVersion !== undefined &&
    value.pilotProtocolVersion !== null
  )
    recordIssue(
      issues,
      "MANIFEST_PILOT_PROTOCOL_VERSION_UNSET_REQUIRED",
      undefined,
      "pilotProtocolVersion",
    );
  if (value.pilotProtocolStatus === "SET") {
    if (!nonEmptyString(value.pilotProtocolVersion)) {
      recordIssue(
        issues,
        "MANIFEST_PILOT_PROTOCOL_VERSION_REQUIRED",
        undefined,
        "pilotProtocolVersion",
      );
    } else if (value.pilotProtocolVersion !== CANONICAL_DESIGN_CONTRACT.pilotProtocolVersion) {
      recordIssue(
        issues,
        "MANIFEST_PILOT_PROTOCOL_VERSION_UNSUPPORTED",
        undefined,
        "pilotProtocolVersion",
      );
    }
  }

  if (
    !Array.isArray(value.analysisGroups) ||
    value.analysisGroups.length !== ANALYSIS_GROUPS.length
  ) {
    recordIssue(issues, "MANIFEST_GROUPS_INVALID", undefined, "analysisGroups");
  } else {
    const groups = value.analysisGroups.filter(nonEmptyString);
    if (
      groups.length !== ANALYSIS_GROUPS.length ||
      new Set(groups).size !== ANALYSIS_GROUPS.length
    ) {
      recordIssue(issues, "MANIFEST_GROUPS_INVALID", undefined, "analysisGroups");
    }
    for (const group of ANALYSIS_GROUPS) {
      if (!groups.includes(group))
        recordIssue(issues, "MANIFEST_GROUP_MISSING", undefined, "analysisGroups");
    }
  }

  if (!stringOrNull(value.targetGradeBand)) {
    recordIssue(issues, "MANIFEST_GRADE_BAND_INVALID", undefined, "targetGradeBand");
  }
  if (value.targetGradeStatus === "NOT_DETERMINED" && nonEmptyString(value.targetGradeBand)) {
    recordIssue(issues, "MANIFEST_GRADE_STATUS_CONFLICT", undefined, "targetGradeBand");
  }

  return { manifest: value as unknown as OfflinePilotManifest, issues };
}

function taskDimension(taskId: string): P1C_V2_TaskDimension | null {
  return TASK_CONTRACT_BY_ID.get(taskId as TaskId)?.dimension ?? null;
}

function primitiveScore(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function parseRaterScores(
  value: unknown,
  issues: ValidationIssue[],
  recordIndex: number,
): OfflinePilotResponse["raterScores"] {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    recordIssue(issues, "RATER_SCORES_INVALID", recordIndex, "raterScores");
    return undefined;
  }

  const result: NonNullable<OfflinePilotResponse["raterScores"]> = [];
  for (const score of value) {
    if (!isObject(score) || !nonEmptyString(score.raterCode) || !primitiveScore(score.score)) {
      recordIssue(issues, "RATER_SCORE_INVALID", recordIndex, "raterScores");
      continue;
    }
    result.push({ raterCode: score.raterCode, score: score.score });
  }
  return result;
}

function parseResponse(
  value: unknown,
  recordIndex: number,
  issues: ValidationIssue[],
): OfflinePilotResponse | null {
  if (!isObject(value)) {
    recordIssue(issues, "RESPONSE_NOT_OBJECT", recordIndex);
    return null;
  }

  walkForbiddenKeys(value, issues, recordIndex);

  const taskDesignId = value.taskDesignId;
  const dimension = typeof taskDesignId === "string" ? taskDimension(taskDesignId) : null;
  const taskIsValid = typeof taskDesignId === "string" && TASK_IDS.includes(taskDesignId as TaskId);
  const analysisGroupIsValid = ANALYSIS_GROUPS.includes(value.analysisGroup as AnalysisGroup);
  const answerCompletenessIsValid = COMPLETENESS_VALUES.includes(
    value.answerCompleteness as Completeness,
  );
  const normalizedAnalysisGroup = analysisGroupIsValid ? String(value.analysisGroup) : "";
  const normalizedTaskDesignId = taskIsValid ? String(taskDesignId) : "";
  const normalizedCompleteness = answerCompletenessIsValid
    ? (value.answerCompleteness as Completeness)
    : "INVALID";
  const evidenceCandidateId =
    (dimension === "EVIDENCE_FINDING" || dimension === "EVIDENCE_RELATION") &&
    isAllowedEvidenceCandidate(String(taskDesignId ?? ""), value.evidenceCandidateId)
      ? value.evidenceCandidateId
      : undefined;
  const relationType = isAllowedRelationType(String(taskDesignId ?? ""), value.relationType)
    ? value.relationType
    : undefined;
  if (!nonEmptyString(value.pilotParticipantId))
    recordIssue(issues, "PARTICIPANT_ID_INVALID", recordIndex, "pilotParticipantId");
  if (!nonEmptyString(value.analysisGroup) || !analysisGroupIsValid) {
    recordIssue(issues, "ANALYSIS_GROUP_INVALID", recordIndex, "analysisGroup");
  }
  if (
    !stringOrNull(value.gradeBand) ||
    (typeof value.gradeBand === "string" && !isAllowedGradeBand(value.gradeBand))
  )
    recordIssue(issues, "GRADE_BAND_INVALID", recordIndex, "gradeBand");
  if (!taskIsValid) {
    recordIssue(issues, "TASK_UNKNOWN", recordIndex, "taskDesignId");
  }
  if (!nonEmptyString(value.passageVersionId))
    recordIssue(issues, "PASSAGE_VERSION_INVALID", recordIndex, "passageVersionId");
  if (!nonEmptyString(value.questionVersionId))
    recordIssue(issues, "QUESTION_VERSION_INVALID", recordIndex, "questionVersionId");
  if (
    typeof value.taskOrder !== "number" ||
    !Number.isInteger(value.taskOrder) ||
    value.taskOrder < 1
  ) {
    recordIssue(issues, "TASK_ORDER_INVALID", recordIndex, "taskOrder");
  }
  if (!answerCompletenessIsValid) {
    recordIssue(issues, "ANSWER_COMPLETENESS_INVALID", recordIndex, "answerCompleteness");
  }

  const completeness = normalizedCompleteness;
  if (dimension === "INFERENCE" && value.answer !== undefined) {
    if (!isObject(value.answer) || !nonEmptyString(value.answer.optionId)) {
      recordIssue(issues, "INFERENCE_ANSWER_INVALID", recordIndex, "answer");
    } else if (
      !/^V2C-INF-\d{2}-OPT-[A-D]$/u.test(value.answer.optionId) ||
      !value.answer.optionId.startsWith(`${taskDesignId}-OPT-`)
    ) {
      recordIssue(issues, "INFERENCE_OPTION_INVALID", recordIndex, "answer.optionId");
    }
    if (
      isObject(value.answer) &&
      (value.answer.evidenceCandidateId !== undefined || value.answer.relationType !== undefined)
    ) {
      recordIssue(issues, "INFERENCE_ANSWER_TYPE_MIXED", recordIndex, "answer");
    }
  }
  if (dimension === "INFERENCE" && completeness === "COMPLETE" && value.answer === undefined) {
    recordIssue(issues, "INFERENCE_ANSWER_REQUIRED", recordIndex, "answer");
  }

  if (dimension === "EVIDENCE_FINDING") {
    if (value.answer !== undefined)
      recordIssue(issues, "EVIDENCE_FINDING_ANSWER_FIELD", recordIndex, "answer");
    if (value.relationType !== undefined)
      recordIssue(issues, "EVIDENCE_FINDING_RELATION_FIELD", recordIndex, "relationType");
    if (value.evidenceCandidateId !== undefined && evidenceCandidateId === undefined) {
      recordIssue(issues, "EVIDENCE_CANDIDATE_INVALID", recordIndex, "evidenceCandidateId");
    }
    if (completeness === "COMPLETE" && evidenceCandidateId === undefined) {
      recordIssue(
        issues,
        "EVIDENCE_FINDING_CANDIDATE_REQUIRED",
        recordIndex,
        "evidenceCandidateId",
      );
    }
  }

  if (dimension === "EVIDENCE_RELATION") {
    if (value.answer !== undefined)
      recordIssue(issues, "EVIDENCE_RELATION_ANSWER_FIELD", recordIndex, "answer");
    if (value.evidenceCandidateId !== undefined && evidenceCandidateId === undefined) {
      recordIssue(issues, "EVIDENCE_CANDIDATE_INVALID", recordIndex, "evidenceCandidateId");
    }
    if (completeness === "COMPLETE" && evidenceCandidateId === undefined) {
      recordIssue(
        issues,
        "EVIDENCE_RELATION_CANDIDATE_REQUIRED",
        recordIndex,
        "evidenceCandidateId",
      );
    }
    if (nonEmptyString(value.relationType) && relationType === undefined) {
      recordIssue(issues, "EVIDENCE_RELATION_TYPE_INVALID", recordIndex, "relationType");
    }
    if (completeness === "COMPLETE" && relationType === undefined) {
      recordIssue(issues, "EVIDENCE_RELATION_TYPE_REQUIRED", recordIndex, "relationType");
    }
  }

  const raterScores = parseRaterScores(value.raterScores, issues, recordIndex);
  return {
    pilotParticipantId: String(value.pilotParticipantId ?? ""),
    analysisGroup: normalizedAnalysisGroup,
    ...(isAllowedGradeBand(value.gradeBand)
      ? { gradeBand: value.gradeBand }
      : value.gradeBand === null
        ? { gradeBand: null }
        : {}),
    taskDesignId: normalizedTaskDesignId,
    passageVersionId: String(value.passageVersionId ?? ""),
    questionVersionId: String(value.questionVersionId ?? ""),
    taskOrder: typeof value.taskOrder === "number" ? value.taskOrder : 0,
    answerCompleteness: completeness,
    ...(isObject(value.answer) ? { answer: value.answer } : {}),
    ...(evidenceCandidateId ? { evidenceCandidateId } : {}),
    ...(relationType ? { relationType } : {}),
    ...(raterScores ? { raterScores } : {}),
    ...(isObject(value.adjudication) ? { adjudication: value.adjudication } : {}),
  };
}

function parseJsonl(text: string): {
  manifestValue: unknown;
  records: unknown[];
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  let manifestValue: unknown;
  const records: unknown[] = [];
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    recordIssue(issues, "INPUT_EMPTY");
    return { manifestValue, records, issues };
  }

  lines.forEach((line, index) => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (index === 0) {
        if (!isObject(parsed) || parsed.type !== "manifest") {
          recordIssue(issues, "JSONL_MANIFEST_ENVELOPE_INVALID", index + 1, "type");
        } else {
          manifestValue = parsed.manifest;
        }
      } else if (!isObject(parsed) || parsed.type !== "response") {
        recordIssue(issues, "JSONL_RESPONSE_ENVELOPE_INVALID", index + 1, "type");
      } else {
        records.push(parsed.record);
      }
    } catch {
      recordIssue(issues, "JSONL_LINE_INVALID", index + 1);
    }
  });

  return { manifestValue, records, issues };
}

function parseInput(
  text: string,
  extension: string,
): { manifestValue: unknown; records: unknown[]; issues: ValidationIssue[] } {
  if (extension.toLowerCase() === ".jsonl") return parseJsonl(text);

  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed)) {
      return { manifestValue: undefined, records: [], issues: [{ code: "JSON_ROOT_INVALID" }] };
    }
    return {
      manifestValue: parsed.manifest,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      issues: [],
    };
  } catch {
    return { manifestValue: undefined, records: [], issues: [{ code: "JSON_INVALID" }] };
  }
}

function parseDataset(text: string, extension: string): ParsedDataset {
  const parsed = parseInput(text, extension);
  const manifestResult = parseManifest(parsed.manifestValue);
  const recordIssues = [...parsed.issues];
  const records: OfflinePilotResponse[] = [];

  parsed.records.forEach((value, index) => {
    const response = parseResponse(value, index, recordIssues);
    if (response) records.push(response);
  });

  const seen = new Set<string>();
  const duplicateIssues: ValidationIssue[] = [];
  records.forEach((record, index) => {
    const signature = [
      record.pilotParticipantId,
      record.taskDesignId,
      record.passageVersionId,
      record.taskOrder,
    ].join("|");
    if (seen.has(signature)) recordIssue(duplicateIssues, "DUPLICATE_RESPONSE", index);
    seen.add(signature);
  });

  const passageVersions = new Set(
    Array.isArray(manifestResult.manifest.passageVersionIds)
      ? manifestResult.manifest.passageVersionIds.filter(nonEmptyString)
      : [],
  );
  const questionVersions = new Set(
    Array.isArray(manifestResult.manifest.questionVersionIds)
      ? manifestResult.manifest.questionVersionIds.filter(nonEmptyString)
      : [],
  );
  const passageBindings = isObject(manifestResult.manifest.passageVersionBindings)
    ? (manifestResult.manifest.passageVersionBindings as JsonObject)
    : {};
  const questionBindings = isObject(manifestResult.manifest.questionVersionBindings)
    ? (manifestResult.manifest.questionVersionBindings as JsonObject)
    : {};
  records.forEach((record, index) => {
    if (isDesignPassageReference(record.passageVersionId)) {
      recordIssue(recordIssues, "PASSAGE_VERSION_USES_DESIGN_REF", index, "passageVersionId");
    }
    if (isDesignIdentifier(record.questionVersionId)) {
      recordIssue(recordIssues, "QUESTION_VERSION_USES_DESIGN_ID", index, "questionVersionId");
    }
    const expectedPassageVersion = passageBindings[record.taskDesignId];
    if (expectedPassageVersion === null) {
      recordIssue(recordIssues, "PASSAGE_VERSION_NOT_CREATED", index, "passageVersionId");
    } else if (
      nonEmptyString(expectedPassageVersion) &&
      record.passageVersionId !== expectedPassageVersion
    ) {
      recordIssue(recordIssues, "TASK_PASSAGE_VERSION_MISMATCH", index, "passageVersionId");
    }
    if (passageVersions.size > 0 && !passageVersions.has(record.passageVersionId)) {
      recordIssue(recordIssues, "PASSAGE_VERSION_NOT_IN_MANIFEST", index, "passageVersionId");
    }
    const expectedQuestionVersion = questionBindings[record.taskDesignId];
    if (
      expectedQuestionVersion === null ||
      manifestResult.manifest.questionVersionStatus === "NOT_CREATED"
    ) {
      recordIssue(recordIssues, "QUESTION_VERSION_NOT_CREATED", index, "questionVersionId");
    } else if (
      nonEmptyString(expectedQuestionVersion) &&
      record.questionVersionId !== expectedQuestionVersion
    ) {
      recordIssue(recordIssues, "TASK_QUESTION_VERSION_MISMATCH", index, "questionVersionId");
    }
    if (questionVersions.size > 0 && !questionVersions.has(record.questionVersionId)) {
      recordIssue(recordIssues, "QUESTION_VERSION_NOT_IN_MANIFEST", index, "questionVersionId");
    }
  });

  return {
    manifest: manifestResult.manifest,
    records,
    manifestIssues: manifestResult.issues,
    recordIssues,
    duplicateIssues,
  };
}

function increment(table: DistributionTable, row: string, column: string): void {
  const current = table[row] ?? {};
  current[column] = (current[column] ?? 0) + 1;
  table[row] = current;
}

function zeroTable(): DistributionTable {
  return {};
}

function emptyReport(status: OfflinePilotAnalysisReport["status"]): OfflinePilotAnalysisReport {
  return {
    status,
    summary: {
      responseCount: 0,
      uniqueAnonymousParticipantCount: 0,
      groupCounts: {},
      taskCounts: {},
      completenessCounts: {},
    },
    distributions: {
      taskAndGroupCounts: zeroTable(),
      inferenceOptionCounts: zeroTable(),
      evidenceFindingCandidateCounts: zeroTable(),
      evidenceRelationCandidateCounts: zeroTable(),
      evidenceRelationTypeCounts: zeroTable(),
    },
    strata: {
      groupGradeCounts: zeroTable(),
      missingGroupCount: 0,
      missingGradeCount: 0,
      emptyCells: [],
    },
    raterAgreement: {
      recordsWithMultipleRaters: 0,
      agreementCount: 0,
      disagreementCount: 0,
      adjudicationCount: 0,
    },
    versionIntegrity: { valid: false, warnings: [] },
    dataQuality: { issues: [], warnings: [] },
    safety: {
      offlineOnly: true,
      productionDatabase: "NOT_USED",
      network: "NOT_USED",
      rawResponses: "OMITTED",
    },
  };
}

function analyzeDataset(dataset: ParsedDataset): OfflinePilotAnalysisReport {
  const allIssues = [
    ...dataset.manifestIssues,
    ...dataset.recordIssues,
    ...dataset.duplicateIssues,
  ];
  const report = emptyReport(allIssues.length > 0 ? "INVALID_DATA" : "OK");
  report.dataQuality.issues = allIssues;
  report.versionIntegrity.valid = allIssues.length === 0;
  if (dataset.manifest.targetGradeStatus === "NOT_DETERMINED") {
    report.versionIntegrity.warnings.push("TARGET_GRADE_NOT_DETERMINED");
  }
  if (dataset.records.length === 0) report.versionIntegrity.warnings.push("NO_RESPONSE_RECORDS");

  const participants = new Set<string>();
  const presentGrades = new Set<string>();
  for (const record of dataset.records) {
    participants.add(record.pilotParticipantId);
    report.summary.responseCount += 1;
    const groupIsValid = ANALYSIS_GROUPS.includes(record.analysisGroup as AnalysisGroup);
    const taskIsValid = TASK_IDS.includes(record.taskDesignId as TaskId);
    const completenessIsValid = COMPLETENESS_VALUES.includes(
      record.answerCompleteness as Completeness,
    );
    if (groupIsValid) {
      report.summary.groupCounts[record.analysisGroup] =
        (report.summary.groupCounts[record.analysisGroup] ?? 0) + 1;
    }
    if (taskIsValid) {
      report.summary.taskCounts[record.taskDesignId] =
        (report.summary.taskCounts[record.taskDesignId] ?? 0) + 1;
    }
    if (completenessIsValid) {
      report.summary.completenessCounts[record.answerCompleteness] =
        (report.summary.completenessCounts[record.answerCompleteness] ?? 0) + 1;
    }
    if (taskIsValid && groupIsValid) {
      increment(report.distributions.taskAndGroupCounts, record.taskDesignId, record.analysisGroup);
    }

    const group = groupIsValid ? record.analysisGroup : "MISSING";
    const grade = isAllowedGradeBand(record.gradeBand) ? record.gradeBand : "MISSING";
    if (group === "MISSING") report.strata.missingGroupCount += 1;
    if (grade === "MISSING") report.strata.missingGradeCount += 1;
    if (grade !== "MISSING") presentGrades.add(grade);
    increment(report.strata.groupGradeCounts, group, grade);

    const dimension = taskIsValid ? taskDimension(record.taskDesignId) : null;
    if (
      record.answerCompleteness === "COMPLETE" &&
      dimension === "INFERENCE" &&
      typeof record.answer?.optionId === "string" &&
      /^V2C-INF-\d{2}-OPT-[A-D]$/u.test(record.answer.optionId) &&
      record.answer.optionId.startsWith(`${record.taskDesignId}-OPT-`)
    ) {
      increment(
        report.distributions.inferenceOptionCounts,
        record.taskDesignId,
        record.answer.optionId as string,
      );
    }
    if (
      record.answerCompleteness === "COMPLETE" &&
      dimension === "EVIDENCE_FINDING" &&
      isAllowedEvidenceCandidate(record.taskDesignId, record.evidenceCandidateId)
    ) {
      increment(
        report.distributions.evidenceFindingCandidateCounts,
        record.taskDesignId,
        record.evidenceCandidateId,
      );
    }
    if (record.answerCompleteness === "COMPLETE" && dimension === "EVIDENCE_RELATION") {
      if (isAllowedEvidenceCandidate(record.taskDesignId, record.evidenceCandidateId))
        increment(
          report.distributions.evidenceRelationCandidateCounts,
          record.taskDesignId,
          record.evidenceCandidateId,
        );
      if (isAllowedRelationType(record.taskDesignId, record.relationType))
        increment(
          report.distributions.evidenceRelationTypeCounts,
          record.taskDesignId,
          record.relationType,
        );
    }

    const raterScores = record.raterScores ?? [];
    if (raterScores.length >= 2) {
      report.raterAgreement.recordsWithMultipleRaters += 1;
      const distinctScores = new Set(
        raterScores.map((item) => `${typeof item.score}:${String(item.score)}`),
      );
      if (distinctScores.size === 1) report.raterAgreement.agreementCount += 1;
      else report.raterAgreement.disagreementCount += 1;
    }
    if (record.adjudication) report.raterAgreement.adjudicationCount += 1;
  }

  report.summary.uniqueAnonymousParticipantCount = participants.size;
  for (const group of ANALYSIS_GROUPS) {
    for (const grade of presentGrades) {
      if ((report.strata.groupGradeCounts[group]?.[grade] ?? 0) === 0) {
        report.strata.emptyCells.push(`${group}|${grade}`);
      }
    }
  }
  if (report.strata.missingGroupCount > 0)
    report.dataQuality.warnings.push("MISSING_ANALYSIS_GROUP");
  if (report.strata.missingGradeCount > 0) report.dataQuality.warnings.push("MISSING_GRADE_BAND");
  if (dataset.duplicateIssues.length > 0)
    report.dataQuality.warnings.push("DUPLICATE_RECORDS_NOT_DROPPED");
  return report;
}

export function analyzeOfflinePilotText(
  text: string,
  extension = ".json",
): OfflinePilotAnalysisReport {
  try {
    const dataset = parseDataset(text, extension);
    return analyzeDataset(dataset);
  } catch {
    return emptyReport("INVALID_INPUT");
  }
}

export async function analyzeOfflinePilotFile(
  filePath: string,
): Promise<OfflinePilotAnalysisReport> {
  try {
    const text = await readFile(filePath, "utf8");
    return analyzeOfflinePilotText(
      text,
      filePath.toLowerCase().endsWith(".jsonl") ? ".jsonl" : ".json",
    );
  } catch {
    return emptyReport("INVALID_INPUT");
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isMainModule()) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: p1c-v2-offline-pilot-analysis <local-json-or-jsonl>");
    process.exitCode = 2;
  } else {
    const report = await analyzeOfflinePilotFile(inputPath);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "OK") process.exitCode = 1;
  }
}
