import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P0_PROGRAM,
  questionVersionId,
} from "../src/curriculum/education-v2-p0-program.js";
import {
  P0_STATION9_V3_RELEASE,
  p0Station9OwnerApprovalToken,
  p0Station9V3ReleaseFingerprint,
} from "../src/curriculum/p0-station9-question-release.js";
import { QUESTION_BANK_VERSIONED_REVISION_CANDIDATES } from "../src/curriculum/question-bank-versioned-revisions.js";
import { buildEducationV2P0LearningCycleManifest } from "../src/curriculum/learning-cycle-manifest.js";

describe("P0 station 9 owner-approved v3 release", () => {
  it("approves only the ambiguous station 9 question and its versioned template", () => {
    expect(P0_STATION9_V3_RELEASE).toMatchObject({
      key: "p0-fast-chunking-station-9-v3",
      stableStepKey: "FAST_CHUNKING_PRACTICE",
      publicationApproved: true,
      approvalBasis: "EXPLICIT_PRODUCT_OWNER_DECISION",
      questionKey: "fast-chunking-practice-1",
      questionVersionNumber: 3,
      templateVersionNumber: 3,
      baseTemplateVersionId: "edu-v2-p0-templateVersion-fast-chunking-practice-academic-v2",
      templateVersionId: "edu-v2-p0-templateVersion-fast-chunking-practice-academic-v3",
    });
    expect(P0_STATION9_V3_RELEASE.question.prompt).toContain(
      "eylemin gerçekleştiği yeri tam olarak",
    );
    expect(P0_STATION9_V3_RELEASE.question.correctOptionId).toBe("a");
    expect(
      P0_STATION9_V3_RELEASE.question.options.filter(
        (option) => option.id === P0_STATION9_V3_RELEASE.question.correctOptionId,
      ),
    ).toHaveLength(1);
    expect(P0_STATION9_V3_RELEASE.question.explanation).toContain("yer ekini");
    expect(P0_STATION9_V3_RELEASE.question.hint).toContain("nerede gerçekleştiğini");
  });

  it("keeps the ambiguous v1 immutable and only changes the station 9 source candidate", () => {
    const source = EDUCATION_V2_P0_PROGRAM.exercises
      .flatMap((exercise) => exercise.questions)
      .find((question) => question.key === "fast-chunking-practice-1")!;
    expect(source.prompt).toContain("birlikte anlam taşıyan grup");
    expect(source.correctOptionId).toBe("a");
    expect(P0_STATION9_V3_RELEASE.baseQuestionVersionId).toBe(
      questionVersionId("fast-chunking-practice", source.key),
    );
    const genericP0Candidate = QUESTION_BANK_VERSIONED_REVISION_CANDIDATES.find(
      (candidate) => candidate.key === `${EDUCATION_V2_P0_PROGRAM.programId}:question-quality-v3`,
    )!;
    expect(genericP0Candidate.publicationApproved).toBe(false);
    expect(genericP0Candidate.editorialReviewStatus).toBe("REVIEW_REQUIRED");
    expect(
      genericP0Candidate.changedQuestions.filter(
        (item) =>
          item.exerciseKey === "fast-chunking-practice" &&
          item.questionKey === "fast-chunking-practice-1",
      ),
    ).toHaveLength(1);
    expect(P0_STATION9_V3_RELEASE.templateQuestionVersionIds).toEqual([
      P0_STATION9_V3_RELEASE.questionVersionId,
      questionVersionId("fast-chunking-practice", "fast-chunking-practice-2"),
    ]);
  });

  it("binds operation approval to the immutable release fingerprint and exact commit", () => {
    const fingerprint = p0Station9V3ReleaseFingerprint();
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(p0Station9OwnerApprovalToken("0123456789abcdef0123456789abcdef01234567")).toBe(
      `APPROVE_P0_STATION_9_V3_${fingerprint.toUpperCase()}_AT_0123456789ABCDEF0123456789ABCDEF01234567`,
    );
    expect(() => p0Station9OwnerApprovalToken("master")).toThrow();
  });

  it("makes only station 9's active P0 manifest reference point to v3", () => {
    const manifest = buildEducationV2P0LearningCycleManifest();
    const practiceStep = manifest.steps.find(
      (step) => step.stableKey === P0_STATION9_V3_RELEASE.stableStepKey,
    );
    const exercise = manifest.resourceCatalog.exerciseVersions.find(
      (item) => item.key === P0_STATION9_V3_RELEASE.exerciseKey,
    );

    expect(manifest.cycleVersion).toBe(2);
    expect(practiceStep?.exercise?.versionId).toBe(P0_STATION9_V3_RELEASE.templateVersionId);
    expect(practiceStep?.exercise?.questionVersionIds).toContain(
      P0_STATION9_V3_RELEASE.questionVersionId,
    );
    expect(exercise?.versionId).toBe(P0_STATION9_V3_RELEASE.templateVersionId);
    expect(exercise?.questionVersionIds).toContain(P0_STATION9_V3_RELEASE.questionVersionId);
    expect(manifest.resourceCatalog.questionVersionIds).toContain(
      P0_STATION9_V3_RELEASE.baseQuestionVersionId,
    );
    expect(manifest.resourceCatalog.questionVersionIds).toContain(
      P0_STATION9_V3_RELEASE.questionVersionId,
    );
  });
});
