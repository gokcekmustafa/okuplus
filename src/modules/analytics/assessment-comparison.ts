export type AssessmentScoreRecord = {
  id: string;
  assessmentId: string;
  score: number | null;
  completedAt: Date;
};

/**
 * Raw scores are comparable to a placement baseline only when they come from
 * the same assessment and represent a later, separate result.
 */
export function latestComparableAssessmentResult(
  baseline: AssessmentScoreRecord | null,
  results: readonly AssessmentScoreRecord[],
): AssessmentScoreRecord | null {
  if (!baseline || baseline.score === null || !Number.isFinite(baseline.score)) return null;

  return (
    results
      .filter(
        (result) =>
          result.id !== baseline.id &&
          result.assessmentId === baseline.assessmentId &&
          result.completedAt.getTime() > baseline.completedAt.getTime() &&
          result.score !== null &&
          Number.isFinite(result.score),
      )
      .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())[0] ?? null
  );
}
