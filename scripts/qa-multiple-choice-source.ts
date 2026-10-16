import { MULTIPLE_CHOICE_SOURCE_PACKAGES } from "../src/curriculum/multiple-choice-source-catalog.js";
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

console.log(
  JSON.stringify(
    {
      scope: "SOURCE_CATALOG_ONLY",
      productionGraph: "NOT_VERIFIED",
      totalPackageCount: packages.length,
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
      interpretation:
        "Length, answer-position and lexical-repeat metrics are review signals; they do not prove semantic correctness. Questions without VERIFIED editorial status remain blocked from a new package release.",
    },
    null,
    2,
  ),
);
