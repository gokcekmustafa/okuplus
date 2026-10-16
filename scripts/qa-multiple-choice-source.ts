import {
  collectUniqueMultipleChoiceQuestions,
  MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS,
  MULTIPLE_CHOICE_SOURCE_PACKAGES,
} from "../src/curriculum/multiple-choice-source-catalog.js";
import { assessMultipleChoicePackageQuality } from "../src/curriculum/option-length-quality.js";

const packages = MULTIPLE_CHOICE_SOURCE_PACKAGES.map((source) => {
  const report = assessMultipleChoicePackageQuality(source.questions);
  return {
    key: source.key,
    sourceStatus: source.status,
    revisionKind: source.revisionKind ?? null,
    questionCount: report.questionCount,
    correctPositionCounts: report.correctPositionCounts,
    correctUniqueLongestCount: report.correctUniqueLongestCount,
    correctUniqueLongestRatio: report.correctUniqueLongestRatio,
    correctUniqueShortestCount: report.correctUniqueShortestCount,
    correctUniqueShortestRatio: report.correctUniqueShortestRatio,
    clearLengthOutlierCount: report.clearLengthOutlierCount,
    clearLengthOutlierQuestionKeys: report.questionReports
      .filter((question) => question.clearLengthOutlier)
      .map((question) => question.key),
    repeatedSkillQuestionPairs: report.repeatedSkillQuestionPairs,
    editorialReviewQuestionCount: report.editorialReviewQuestionKeys.length,
    needsEditorialReview: report.needsEditorialReview,
  };
});
const sourcePackages = packages.filter((item) => item.sourceStatus === "SOURCE_CURRENT");
const revisionCandidates = packages.filter(
  (item) => item.sourceStatus === "VERSIONED_REVISION_CANDIDATE",
);
const designOnlyPackages = packages.filter((item) => item.sourceStatus === "DESIGN_ONLY_CANDIDATE");
const notYetReleasedPackages = packages.filter(
  (item) => item.sourceStatus === "UNRELEASED_CANDIDATE",
);
const uniqueQuestions = collectUniqueMultipleChoiceQuestions(MULTIPLE_CHOICE_SOURCE_PACKAGES);
const uniqueQuestionVersionEntryCount = uniqueQuestions.reduce(
  (total, item) => total + item.versions.length,
  0,
);
const uniqueDeclaredQuestionVersionCount = uniqueQuestions.reduce(
  (total, item) =>
    total + item.versions.filter((version) => typeof version.sourceVersionId === "string").length,
  0,
);
const detailedReview = process.argv.includes("--details");

console.log(
  JSON.stringify(
    {
      scope: "SOURCE_CATALOG_ONLY",
      productionGraph: "NOT_VERIFIED",
      totalPackageCount: packages.length,
      catalogQuestionPackageEntries: packages.reduce(
        (total, item) => total + item.questionCount,
        0,
      ),
      uniqueSourceQuestionCount: uniqueQuestions.length,
      uniqueQuestionVersionEntryCount,
      duplicateQuestionVersionPackageReferences:
        packages.reduce((total, item) => total + item.questionCount, 0) -
        uniqueQuestionVersionEntryCount,
      uniqueDeclaredQuestionVersionCount,
      uniqueSourceQuestionsWithMultipleVersions: uniqueQuestions.filter(
        (item) => item.versions.length > 1,
      ).length,
      catalogQuestionVersionsWithUndeclaredVersion: uniqueQuestions.reduce(
        (total, item) =>
          total +
          item.versions.filter((version) => version.sourceVersionStatus === "VERSION_UNDECLARED")
            .length,
        0,
      ),
      currentSourceQuestionCount: sourcePackages.reduce(
        (total, item) => total + item.questionCount,
        0,
      ),
      unreleasedCandidateQuestionCount: notYetReleasedPackages.reduce(
        (total, item) => total + item.questionCount,
        0,
      ),
      versionedRevisionCandidateQuestionCount: revisionCandidates.reduce(
        (total, item) => total + item.questionCount,
        0,
      ),
      designOnlyQuestionCount: designOnlyPackages.reduce(
        (total, item) => total + item.questionCount,
        0,
      ),
      currentSourceClearLengthOutliers: sourcePackages.reduce(
        (total, item) => total + item.clearLengthOutlierCount,
        0,
      ),
      unreleasedCandidateClearLengthOutliers: notYetReleasedPackages.reduce(
        (total, item) => total + item.clearLengthOutlierCount,
        0,
      ),
      versionedRevisionCandidateClearLengthOutliers: revisionCandidates.reduce(
        (total, item) => total + item.clearLengthOutlierCount,
        0,
      ),
      designOnlyClearLengthOutliers: designOnlyPackages.reduce(
        (total, item) => total + item.clearLengthOutlierCount,
        0,
      ),
      packages,
      coverageGaps: MULTIPLE_CHOICE_SOURCE_COVERAGE_GAPS,
      ...(detailedReview
        ? {
            questionReviewRecords: uniqueQuestions.map((item) => ({
              sourceQuestionId: item.sourceQuestionId,
              versions: item.versions.map((question) => ({
                versionId: question.sourceVersionId,
                versionStatus: question.sourceVersionStatus ?? null,
                editorialStatus: question.editorialReviewStatus ?? "REVIEW_REQUIRED",
                contentKey: question.contentKey ?? null,
                skillCode: question.skillCode ?? null,
                sourceText: question.sourceText ?? null,
                prompt: question.prompt ?? null,
                options: question.options.map((option) => ({
                  id: option.id,
                  text: option.text,
                  isCorrect: option.id === question.correctOptionId,
                })),
                explanation: question.explanation ?? null,
                hint: question.hint ?? null,
              })),
            })),
          }
        : {}),
      interpretation:
        "Length, answer-position and lexical-repeat metrics are review signals; they do not prove semantic correctness. Use --details for source/prompt/options/key/explanation dossiers. Database-backed Training questions remain outside this static catalog. Non-MC placement items are reviewed separately in docs/QUESTION_BANK_QA_COVERAGE.md. Questions without VERIFIED editorial status remain blocked from a new package release.",
    },
    null,
    2,
  ),
);
