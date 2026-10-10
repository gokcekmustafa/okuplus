import { readFileSync, rmSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeOfflinePilotText,
  type OfflinePilotManifest,
  type OfflinePilotResponse,
} from "../scripts/p1c-v2-offline-pilot-analysis";

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
          evidenceCandidateId: "REL-01-CAND-A",
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
      "REL-01-CAND-A": 1,
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

  it("uses only synthetic temporary files for file-level execution", () => {
    const directory = mkdtempSync(join(tmpdir(), "okupratik-p1c-offline-"));
    const file = join(directory, "synthetic.json");
    try {
      writeFileSync(file, json([response()]), "utf8");
      expect(readFileSync(file, "utf8")).toContain("P1C-V2-PILOT-DATASET-V1");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
