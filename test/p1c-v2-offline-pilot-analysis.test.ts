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
  taskVersionIds: ["V2C-INF-01@2.0", "V2C-EVF-01@2.0", "V2C-REL-01@2.0"],
  passageVersionIds: ["P1C-V2-TXT-01@1.0", "P1C-V2-TXT-05@1.0", "P1C-V2-TXT-09@1.0"],
  questionVersionIds: ["V2C-INF-01-Q@2.0", "V2C-EVF-01-Q@2.0", "V2C-REL-01-Q@2.0"],
  mappingVersion: "P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN",
  rubricVersion: "P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN",
  pilotProtocolVersion: "P1C_EVIDENCE_RELATION_PILOT_V2_DESIGN",
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
    passageVersionId: "P1C-V2-TXT-01@1.0",
    questionVersionId: "V2C-INF-01-Q@2.0",
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
          passageVersionId: "P1C-V2-TXT-05@1.0",
          questionVersionId: "V2C-EVF-01-Q@2.0",
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
          passageVersionId: "P1C-V2-TXT-09@1.0",
          questionVersionId: "V2C-REL-01-Q@2.0",
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
