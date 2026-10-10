import { execFile as execFileCallback } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  analyzeOfflinePilotFile,
  analyzeOfflinePilotText,
  type OfflinePilotManifest,
  type OfflinePilotResponse,
} from "../scripts/p1c-v2-offline-pilot-analysis";

const execFile = promisify(execFileCallback);
const analyzerScriptPath = fileURLToPath(
  new URL("../scripts/p1c-v2-offline-pilot-analysis.ts", import.meta.url),
);
const tsxCliPath = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));

const manifest: OfflinePilotManifest = {
  datasetVersion: "P1C-V2-PILOT-DATASET-V1",
  itemPoolId: "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN",
  sourceCommit: "f1c8ab90ceec29a4cc129b406d4ab961d6548e31",
  designStatus: "DESIGN_ONLY",
  taskDesignIds: [
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
  ],
  passageDesignRefs: {
    "V2C-INF-01": "P1C-V2-TXT-01@1.0",
    "V2C-INF-02": "P1C-V2-TXT-02@1.0",
    "V2C-INF-03": "P1C-V2-TXT-03@1.0",
    "V2C-INF-04": "P1C-V2-TXT-04@1.0",
    "V2C-EVF-01": "P1C-V2-TXT-05@1.0",
    "V2C-EVF-02": "P1C-V2-TXT-06@1.0",
    "V2C-EVF-03": "P1C-V2-TXT-07@1.0",
    "V2C-EVF-04": "P1C-V2-TXT-08@1.0",
    "V2C-REL-01": "P1C-V2-TXT-09@1.0",
    "V2C-REL-02": "P1C-V2-TXT-10@1.0",
    "V2C-REL-03": "P1C-V2-TXT-11@1.0",
    "V2C-REL-04": "P1C-V2-TXT-12@1.0",
  },
  passageVersionStatus: "AVAILABLE",
  passageVersionIds: ["synthetic-pv-inf-01", "synthetic-pv-evf-01", "synthetic-pv-rel-01"],
  passageVersionBindings: {
    "V2C-INF-01": "synthetic-pv-inf-01",
    "V2C-INF-02": null,
    "V2C-INF-03": null,
    "V2C-INF-04": null,
    "V2C-EVF-01": "synthetic-pv-evf-01",
    "V2C-EVF-02": null,
    "V2C-EVF-03": null,
    "V2C-EVF-04": null,
    "V2C-REL-01": "synthetic-pv-rel-01",
    "V2C-REL-02": null,
    "V2C-REL-03": null,
    "V2C-REL-04": null,
  },
  questionVersionStatus: "AVAILABLE",
  questionVersionIds: ["synthetic-qv-inf-01", "synthetic-qv-evf-01", "synthetic-qv-rel-01"],
  questionVersionBindings: {
    "V2C-INF-01": "synthetic-qv-inf-01",
    "V2C-INF-02": null,
    "V2C-INF-03": null,
    "V2C-INF-04": null,
    "V2C-EVF-01": "synthetic-qv-evf-01",
    "V2C-EVF-02": null,
    "V2C-EVF-03": null,
    "V2C-EVF-04": null,
    "V2C-REL-01": "synthetic-qv-rel-01",
    "V2C-REL-02": null,
    "V2C-REL-03": null,
    "V2C-REL-04": null,
  },
  mappingVersion: "P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN",
  rubricVersion: "P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN",
  pilotProtocolStatus: "DESIGN_ONLY",
  pilotProtocolVersion: null,
  groupCriteriaVersion: "EXTERNAL_CRITERIA-V1",
  groupCriteriaReference: "local/redacted",
  targetGradeStatus: "NOT_DETERMINED",
  targetGradeBand: null,
  analysisGroups: ["GENERAL_STUDENT_POPULATION", "STUDENTS_NEEDING_READING_DEVELOPMENT"],
};

function response(overrides: Partial<OfflinePilotResponse> = {}): OfflinePilotResponse {
  return {
    pilotParticipantId: "anon-001",
    analysisGroup: "GENERAL_STUDENT_POPULATION",
    gradeBand: "G7",
    taskDesignId: "V2C-INF-01",
    passageVersionId: "synthetic-pv-inf-01",
    questionVersionId: "synthetic-qv-inf-01",
    taskOrder: 1,
    answerCompleteness: "COMPLETE",
    answer: { optionId: "V2C-INF-01-OPT-A" },
    ...overrides,
  };
}

function json(records: OfflinePilotResponse[]): string {
  return JSON.stringify({ manifest, records });
}

function jsonl(records: OfflinePilotResponse[]): string {
  return [
    JSON.stringify({ type: "manifest", manifest }),
    ...records.map((record) => JSON.stringify({ type: "response", record })),
  ].join("\n");
}

async function runCli(args: string[]): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  try {
    const result = await execFile(process.execPath, [tsxCliPath, analyzerScriptPath, ...args], {
      encoding: "utf8",
    });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      status: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

describe("P1-C V2 offline pilot analysis", () => {
  it("reads valid local JSON and keeps evidence/relation distributions separate", () => {
    const report = analyzeOfflinePilotText(
      json([
        response(),
        response({
          pilotParticipantId: "anon-002",
          analysisGroup: "STUDENTS_NEEDING_READING_DEVELOPMENT",
          taskDesignId: "V2C-EVF-01",
          passageVersionId: "synthetic-pv-evf-01",
          questionVersionId: "synthetic-qv-evf-01",
          evidenceCandidateId: "SPAN-01",
          answer: undefined,
          raterScores: [
            { raterCode: "R1", score: 1 },
            { raterCode: "R2", score: 0 },
          ],
        }),
        response({
          pilotParticipantId: "anon-003",
          taskDesignId: "V2C-REL-01",
          passageVersionId: "synthetic-pv-rel-01",
          questionVersionId: "synthetic-qv-rel-01",
          evidenceCandidateId: "CAND-01",
          relationType: "LIMITED_SUPPORT",
          answer: undefined,
          gradeBand: null,
          adjudication: { adjudicationCode: "ADJ-01" },
        }),
      ]),
    );

    expect(report.status).toBe("OK");
    expect(report.summary.responseCount).toBe(3);
    expect(report.summary.uniqueAnonymousParticipantCount).toBe(3);
    expect(report.distributions.inferenceOptionCounts["V2C-INF-01"]).toEqual({
      "V2C-INF-01-OPT-A": 1,
    });
    expect(report.distributions.evidenceFindingCandidateCounts["V2C-EVF-01"]).toEqual({
      "SPAN-01": 1,
    });
    expect(report.distributions.evidenceRelationCandidateCounts["V2C-REL-01"]).toEqual({
      "CAND-01": 1,
    });
    expect(report.distributions.evidenceRelationTypeCounts["V2C-REL-01"]).toEqual({
      LIMITED_SUPPORT: 1,
    });
    expect(report.strata.missingGradeCount).toBe(1);
    expect(report.raterAgreement.disagreementCount).toBe(1);
    expect(report.raterAgreement.adjudicationCount).toBe(1);
    expect(report.safety.productionDatabase).toBe("NOT_USED");
  });

  it("accepts JSONL envelopes and reports empty group/grade cells", () => {
    const lines = [
      JSON.stringify({ type: "manifest", manifest }),
      JSON.stringify({ type: "response", record: response() }),
    ].join("\n");
    const report = analyzeOfflinePilotText(lines, ".jsonl");

    expect(report.status).toBe("OK");
    expect(report.summary.groupCounts.GENERAL_STUDENT_POPULATION).toBe(1);
    expect(report.summary.groupCounts.STUDENTS_NEEDING_READING_DEVELOPMENT).toBeUndefined();
    expect(report.strata.emptyCells).toContain("STUDENTS_NEEDING_READING_DEVELOPMENT|G7");
  });

  it("rejects malformed JSON and invalid manifest versions without throwing", () => {
    const malformed = analyzeOfflinePilotText("{not-json");
    expect(malformed.status).toBe("INVALID_DATA");
    expect(malformed.dataQuality.issues).toContainEqual({ code: "MANIFEST_NOT_OBJECT" });

    const invalidManifest = analyzeOfflinePilotText(
      JSON.stringify({
        manifest: { ...manifest, sourceCommit: "unknown", analysisGroups: [] },
        records: [],
      }),
    );
    expect(invalidManifest.status).toBe("INVALID_DATA");
    expect(invalidManifest.versionIntegrity.valid).toBe(false);
    expect(invalidManifest.dataQuality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["MANIFEST_SOURCE_COMMIT_INVALID", "MANIFEST_GROUPS_INVALID"]),
    );
  });

  it("rejects a passage or question version that is absent from the manifest", () => {
    const report = analyzeOfflinePilotText(
      json([
        response({
          passageVersionId: "synthetic-pv-not-listed",
          questionVersionId: "synthetic-qv-not-listed",
        }),
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.versionIntegrity.valid).toBe(false);
    expect(report.dataQuality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "TASK_QUESTION_VERSION_MISMATCH",
        "QUESTION_VERSION_NOT_IN_MANIFEST",
        "TASK_PASSAGE_VERSION_MISMATCH",
        "PASSAGE_VERSION_NOT_IN_MANIFEST",
      ]),
    );
  });

  it("does not echo invalid category values into the report", () => {
    const invalidCandidate = "student@example.com";
    const invalidGroup = "group supplied by participant";
    const invalidTask = "free-form-task-with-sensitive-text";
    const invalidGrade = "13-17 / özel destek profili";
    const invalidCompleteness = "participant supplied completeness";
    const report = analyzeOfflinePilotText(
      json([
        {
          ...response({ taskDesignId: "V2C-EVF-01" }),
          evidenceCandidateId: invalidCandidate,
        },
        {
          ...response(),
          analysisGroup: invalidGroup,
          taskDesignId: invalidTask,
          gradeBand: invalidGrade,
          answerCompleteness: invalidCompleteness,
        },
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues).toContainEqual({
      code: "EVIDENCE_CANDIDATE_INVALID",
      recordIndex: 0,
      field: "evidenceCandidateId",
    });
    expect(report.summary.groupCounts).toEqual({ GENERAL_STUDENT_POPULATION: 1 });
    expect(report.summary.taskCounts).toEqual({ "V2C-EVF-01": 1 });
    expect(report.summary.completenessCounts).toEqual({ COMPLETE: 1, INVALID: 1 });
    expect(report.distributions.evidenceFindingCandidateCounts).toEqual({});
    expect(report.strata.groupGradeCounts).toEqual({
      GENERAL_STUDENT_POPULATION: { G7: 1 },
      MISSING: { MISSING: 1 },
    });

    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toContain(invalidCandidate);
    expect(serializedReport).not.toContain(invalidGroup);
    expect(serializedReport).not.toContain(invalidTask);
    expect(serializedReport).not.toContain(invalidGrade);
    expect(serializedReport).not.toContain(invalidCompleteness);
  });

  it("rejects an unknown evidence relation candidate", () => {
    const invalidCandidate = "REL-01-CAND-A";
    const report = analyzeOfflinePilotText(
      json([
        response({
          taskDesignId: "V2C-REL-01",
          passageVersionId: "synthetic-pv-rel-01",
          questionVersionId: "synthetic-qv-rel-01",
          answer: undefined,
          evidenceCandidateId: invalidCandidate,
          relationType: "LIMITED_SUPPORT",
        }),
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues).toContainEqual({
      code: "EVIDENCE_CANDIDATE_INVALID",
      recordIndex: 0,
      field: "evidenceCandidateId",
    });
    expect(report.distributions.evidenceRelationCandidateCounts).toEqual({});
    expect(JSON.stringify(report)).not.toContain(invalidCandidate);
  });

  it("rejects a task paired with another task's passage binding", () => {
    const report = analyzeOfflinePilotText(
      json([
        response({
          taskDesignId: "V2C-EVF-01",
          passageVersionId: "synthetic-pv-inf-01",
          questionVersionId: "synthetic-qv-evf-01",
          answer: undefined,
          evidenceCandidateId: "SPAN-01",
        }),
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues).toContainEqual({
      code: "TASK_PASSAGE_VERSION_MISMATCH",
      recordIndex: 0,
      field: "passageVersionId",
    });
  });

  it("keeps unversioned design passages unavailable for analysis records", () => {
    const report = analyzeOfflinePilotText(
      json([
        response({
          taskDesignId: "V2C-REL-02",
          passageVersionId: "synthetic-pv-rel-02",
          questionVersionId: "synthetic-qv-rel-02",
          answer: undefined,
          evidenceCandidateId: "REL-02-CAND-A",
          relationType: "LIMITED_SUPPORT",
        }),
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["PASSAGE_VERSION_NOT_CREATED", "QUESTION_VERSION_NOT_CREATED"]),
    );
  });

  it("requires the fixed item-pool mapping, rubric and protocol status contract", () => {
    const report = analyzeOfflinePilotText(
      JSON.stringify({
        manifest: {
          ...manifest,
          itemPoolId: "other-pool",
          sourceCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          mappingVersion: "other-mapping",
          rubricVersion: "other-rubric",
          pilotProtocolStatus: "SET",
          pilotProtocolVersion: "other-protocol",
        },
        records: [],
      }),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.versionIntegrity.valid).toBe(false);
    expect(report.dataQuality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "MANIFEST_ITEM_POOL_UNSUPPORTED",
        "MANIFEST_SOURCE_COMMIT_UNSUPPORTED",
        "MANIFEST_MAPPING_VERSION_UNSUPPORTED",
        "MANIFEST_RUBRIC_VERSION_UNSUPPORTED",
        "MANIFEST_PILOT_PROTOCOL_VERSION_UNSUPPORTED",
      ]),
    );
  });

  it("rejects design identifiers when they are presented as immutable versions", () => {
    const report = analyzeOfflinePilotText(
      json([
        response({
          passageVersionId: "P1C-V2-TXT-01@1.0",
          questionVersionId: "V2C-INF-01-Q@2.0",
        }),
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "PASSAGE_VERSION_USES_DESIGN_REF",
        "QUESTION_VERSION_USES_DESIGN_ID",
      ]),
    );
  });

  it("rejects unknown tasks, wrong answer shapes, and forbidden identity fields", () => {
    const report = analyzeOfflinePilotText(
      json([
        response({ taskDesignId: "V2C-UNKNOWN" }),
        response({ taskDesignId: "V2C-EVF-01", answer: { optionId: "not-an-evidence-answer" } }),
        {
          ...response(),
          pilotParticipantId: "anon-002",
          answer: { optionId: "V2C-INF-01-OPT-A", email: "blocked" },
        },
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "TASK_UNKNOWN",
        "EVIDENCE_FINDING_CANDIDATE_REQUIRED",
        "FORBIDDEN_FIELD",
      ]),
    );
  });

  it("does not silently remove duplicate records or use incomplete answers in distributions", () => {
    const report = analyzeOfflinePilotText(
      json([
        response(),
        response(),
        response({
          pilotParticipantId: "anon-002",
          answerCompleteness: "REVIEW_REQUIRED",
          answer: undefined,
        }),
      ]),
    );

    expect(report.status).toBe("INVALID_DATA");
    expect(report.dataQuality.issues).toContainEqual({
      code: "DUPLICATE_RESPONSE",
      recordIndex: 1,
    });
    expect(report.dataQuality.warnings).toContain("DUPLICATE_RECORDS_NOT_DROPPED");
    expect(report.summary.responseCount).toBe(3);
    expect(report.distributions.inferenceOptionCounts["V2C-INF-01"]).toEqual({
      "V2C-INF-01-OPT-A": 2,
    });
  });

  it("keeps the output descriptive and free of route or calibration decisions", () => {
    const reportText = JSON.stringify(analyzeOfflinePilotText(json([response()])));
    expect(reportText).not.toMatch(/routeDecision|READY|CALIBRATED|CALIBRATION/iu);
    expect(reportText).not.toContain("anon-001");
    expect(reportText).toContain("NOT_USED");
  });

  it("has no production database or network dependency in the analyzer source", () => {
    const source = readFileSync(
      new URL("../scripts/p1c-v2-offline-pilot-analysis.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("@prisma");
    expect(source).not.toMatch(/fetch\s*\(/u);
    expect(source).not.toMatch(/https?:\/\//u);
  });

  it("analyzes valid JSON and JSONL through the real file reader", async () => {
    const directory = mkdtempSync(join(tmpdir(), "okupratik-p1c-offline-"));
    const jsonFile = join(directory, "synthetic.json");
    const jsonlFile = join(directory, "synthetic.jsonl");
    try {
      writeFileSync(jsonFile, json([response()]), "utf8");
      writeFileSync(jsonlFile, jsonl([response()]), "utf8");

      const jsonReport = await analyzeOfflinePilotFile(jsonFile);
      const jsonlReport = await analyzeOfflinePilotFile(jsonlFile);

      expect(jsonReport.status).toBe("OK");
      expect(jsonReport.summary.responseCount).toBe(1);
      expect(jsonlReport.status).toBe("OK");
      expect(jsonlReport.summary.responseCount).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(existsSync(jsonFile)).toBe(false);
    expect(existsSync(jsonlFile)).toBe(false);
    expect(existsSync(directory)).toBe(false);
  });

  it("returns safe file errors without echoing malformed input or paths", async () => {
    const directory = mkdtempSync(join(tmpdir(), "okupratik-p1c-offline-errors-"));
    const invalidJsonFile = join(directory, "invalid.json");
    const invalidJsonlFile = join(directory, "invalid.jsonl");
    const emptyJsonFile = join(directory, "empty.json");
    const emptyJsonlFile = join(directory, "empty.jsonl");
    const invalidSecret = "secret@example.com";
    try {
      writeFileSync(invalidJsonFile, `{"email":"${invalidSecret}"`, "utf8");
      writeFileSync(invalidJsonlFile, `not-jsonl ${invalidSecret}`, "utf8");
      writeFileSync(emptyJsonFile, "", "utf8");
      writeFileSync(emptyJsonlFile, "", "utf8");

      const reports = await Promise.all([
        analyzeOfflinePilotFile(invalidJsonFile),
        analyzeOfflinePilotFile(invalidJsonlFile),
        analyzeOfflinePilotFile(emptyJsonFile),
        analyzeOfflinePilotFile(emptyJsonlFile),
        analyzeOfflinePilotFile(join(directory, "does-not-exist.json")),
      ]);

      expect(reports.slice(0, 4).map((report) => report.status)).toEqual([
        "INVALID_DATA",
        "INVALID_DATA",
        "INVALID_DATA",
        "INVALID_DATA",
      ]);
      expect(reports[4]?.status).toBe("INVALID_INPUT");
      for (const report of reports) {
        const serialized = JSON.stringify(report);
        expect(serialized).not.toContain(invalidSecret);
        expect(serialized).not.toContain(directory);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(existsSync(directory)).toBe(false);
  });

  it("returns the defined CLI exit codes and keeps output sanitized", async () => {
    const directory = mkdtempSync(join(tmpdir(), "okupratik-p1c-offline-cli-"));
    const validFile = join(directory, "synthetic.json");
    const invalidFile = join(directory, "invalid.json");
    const invalidSecret = "cli-secret@example.com";
    try {
      writeFileSync(validFile, json([response()]), "utf8");
      writeFileSync(invalidFile, `{"email":"${invalidSecret}"`, "utf8");

      const validRun = await runCli([validFile]);
      expect(validRun.status).toBe(0);
      expect(JSON.parse(validRun.stdout).status).toBe("OK");
      expect(`${validRun.stdout}${validRun.stderr}`).not.toContain("anon-001");

      const invalidRun = await runCli([invalidFile]);
      expect(invalidRun.status).toBe(1);
      expect(JSON.parse(invalidRun.stdout).status).toBe("INVALID_DATA");
      expect(`${invalidRun.stdout}${invalidRun.stderr}`).not.toContain(invalidSecret);

      const missingArgumentRun = await runCli([]);
      expect(missingArgumentRun.status).toBe(2);
      expect(missingArgumentRun.stderr).toContain("Usage:");
      expect(`${missingArgumentRun.stdout}${missingArgumentRun.stderr}`).not.toContain(
        invalidSecret,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(existsSync(directory)).toBe(false);
  });
});
