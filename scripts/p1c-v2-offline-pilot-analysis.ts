import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ANALYSIS_GROUPS = [
  "GENERAL_STUDENT_POPULATION",
  "STUDENTS_NEEDING_READING_DEVELOPMENT",
] as const;

const TASK_IDS = [
  "V2C-INF-01",
  "V2C-INF-02",
  "V2C-INF-03",
  "V2C-INF-04",
  "V2C-EVF-01",
  "V2C-EVF-02",
  "V2C-EVF-03",
  "V2C-EVF-04",
  "V2C-REL-01",
  "V2C-REL-02",
  "V2C-REL-03",
  "V2C-REL-04",
] as const;

const RELATION_TYPES = [
  "DIRECT_SUPPORT",
  "LIMITED_SUPPORT",
  "COMPARISON",
  "CAUSAL_SUPPORT",
  "NOT_SUPPORTED_OR_CONTRADICTS",
] as const;

const COMPLETENESS_VALUES = ["COMPLETE", "BLANK", "PARTIAL", "INVALID", "REVIEW_REQUIRED"] as const;

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
type TaskId = (typeof TASK_IDS)[number];
type RelationType = (typeof RELATION_TYPES)[number];
type Completeness = (typeof COMPLETENESS_VALUES)[number];

export interface OfflinePilotManifest {
  datasetVersion: string;
  itemPoolId: string;
  sourceCommit: string;
  taskVersionIds: string[];
  passageVersionIds: string[];
  questionVersionIds: string[];
  mappingVersion: string;
  rubricVersion: string;
  pilotProtocolVersion: string;
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

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => nonEmptyString(item));
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
    "mappingVersion",
    "rubricVersion",
    "pilotProtocolVersion",
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

  for (const field of ["taskVersionIds", "passageVersionIds", "questionVersionIds"]) {
    if (!nonEmptyStringArray(value[field]))
      recordIssue(issues, "MANIFEST_VERSION_LIST_INVALID", undefined, field);
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

function taskDimension(
  taskId: string,
): "INFERENCE" | "EVIDENCE_FINDING" | "EVIDENCE_RELATION" | null {
  if (taskId.startsWith("V2C-INF-")) return "INFERENCE";
  if (taskId.startsWith("V2C-EVF-")) return "EVIDENCE_FINDING";
  if (taskId.startsWith("V2C-REL-")) return "EVIDENCE_RELATION";
  return null;
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
  if (!nonEmptyString(value.pilotParticipantId))
    recordIssue(issues, "PARTICIPANT_ID_INVALID", recordIndex, "pilotParticipantId");
  if (
    !nonEmptyString(value.analysisGroup) ||
    !ANALYSIS_GROUPS.includes(value.analysisGroup as AnalysisGroup)
  ) {
    recordIssue(issues, "ANALYSIS_GROUP_INVALID", recordIndex, "analysisGroup");
  }
  if (!stringOrNull(value.gradeBand))
    recordIssue(issues, "GRADE_BAND_INVALID", recordIndex, "gradeBand");
  if (!nonEmptyString(taskDesignId) || !TASK_IDS.includes(taskDesignId as TaskId)) {
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
  if (!COMPLETENESS_VALUES.includes(value.answerCompleteness as Completeness)) {
    recordIssue(issues, "ANSWER_COMPLETENESS_INVALID", recordIndex, "answerCompleteness");
  }

  const completeness = value.answerCompleteness as Completeness;
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
    if (completeness === "COMPLETE" && !nonEmptyString(value.evidenceCandidateId)) {
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
    if (completeness === "COMPLETE" && !nonEmptyString(value.evidenceCandidateId)) {
      recordIssue(
        issues,
        "EVIDENCE_RELATION_CANDIDATE_REQUIRED",
        recordIndex,
        "evidenceCandidateId",
      );
    }
    if (
      completeness === "COMPLETE" &&
      !RELATION_TYPES.includes(value.relationType as RelationType)
    ) {
      recordIssue(issues, "EVIDENCE_RELATION_TYPE_REQUIRED", recordIndex, "relationType");
    }
  }

  const raterScores = parseRaterScores(value.raterScores, issues, recordIndex);
  return {
    pilotParticipantId: String(value.pilotParticipantId ?? ""),
    analysisGroup: String(value.analysisGroup ?? ""),
    ...(stringOrNull(value.gradeBand) ? { gradeBand: value.gradeBand } : {}),
    taskDesignId: String(taskDesignId ?? ""),
    passageVersionId: String(value.passageVersionId ?? ""),
    questionVersionId: String(value.questionVersionId ?? ""),
    taskOrder: typeof value.taskOrder === "number" ? value.taskOrder : 0,
    answerCompleteness: completeness,
    ...(isObject(value.answer) ? { answer: value.answer } : {}),
    ...(nonEmptyString(value.evidenceCandidateId)
      ? { evidenceCandidateId: value.evidenceCandidateId }
      : {}),
    ...(nonEmptyString(value.relationType) ? { relationType: value.relationType } : {}),
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
    datasetManifestVersions(manifestResult.manifest, "passageVersionIds"),
  );
  const questionVersions = new Set(
    datasetManifestVersions(manifestResult.manifest, "questionVersionIds"),
  );
  records.forEach((record, index) => {
    if (passageVersions.size > 0 && !passageVersions.has(record.passageVersionId)) {
      recordIssue(recordIssues, "PASSAGE_VERSION_NOT_IN_MANIFEST", index, "passageVersionId");
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

function datasetManifestVersions(
  manifest: OfflinePilotManifest,
  field: "passageVersionIds" | "questionVersionIds",
): string[] {
  const value = manifest[field];
  return Array.isArray(value) ? value.filter(nonEmptyString) : [];
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
  report.versionIntegrity.valid = dataset.manifestIssues.length === 0;
  if (dataset.manifest.targetGradeStatus === "NOT_DETERMINED") {
    report.versionIntegrity.warnings.push("TARGET_GRADE_NOT_DETERMINED");
  }
  if (dataset.records.length === 0) report.versionIntegrity.warnings.push("NO_RESPONSE_RECORDS");

  const participants = new Set<string>();
  const presentGrades = new Set<string>();
  for (const record of dataset.records) {
    participants.add(record.pilotParticipantId);
    report.summary.responseCount += 1;
    report.summary.groupCounts[record.analysisGroup] =
      (report.summary.groupCounts[record.analysisGroup] ?? 0) + 1;
    report.summary.taskCounts[record.taskDesignId] =
      (report.summary.taskCounts[record.taskDesignId] ?? 0) + 1;
    report.summary.completenessCounts[record.answerCompleteness] =
      (report.summary.completenessCounts[record.answerCompleteness] ?? 0) + 1;
    increment(report.distributions.taskAndGroupCounts, record.taskDesignId, record.analysisGroup);

    const group = ANALYSIS_GROUPS.includes(record.analysisGroup as AnalysisGroup)
      ? record.analysisGroup
      : "MISSING";
    const grade = nonEmptyString(record.gradeBand) ? record.gradeBand : "MISSING";
    if (group === "MISSING") report.strata.missingGroupCount += 1;
    if (grade === "MISSING") report.strata.missingGradeCount += 1;
    if (grade !== "MISSING") presentGrades.add(grade);
    increment(report.strata.groupGradeCounts, group, grade);

    const dimension = taskDimension(record.taskDesignId);
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
      record.evidenceCandidateId
    ) {
      increment(
        report.distributions.evidenceFindingCandidateCounts,
        record.taskDesignId,
        record.evidenceCandidateId,
      );
    }
    if (record.answerCompleteness === "COMPLETE" && dimension === "EVIDENCE_RELATION") {
      if (record.evidenceCandidateId)
        increment(
          report.distributions.evidenceRelationCandidateCounts,
          record.taskDesignId,
          record.evidenceCandidateId,
        );
      if (record.relationType && RELATION_TYPES.includes(record.relationType as RelationType))
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
