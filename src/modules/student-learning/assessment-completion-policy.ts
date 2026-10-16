import { learningRouteCycle } from "../../curriculum/learning-route-catalog.js";

function minimumScoreFromCompletionRule(rule: unknown): number | null {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
  const value = (rule as Record<string, unknown>).minimumScore;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A recorded assessment is completion evidence for P1-A continuation cycles.
 * Its score remains available for analytics, but a mastery threshold must not
 * strand a learner at the end of an otherwise completed cycle.
 */
export function assessmentResultCompletesLearningStep(
  pathCode: string,
  hasResult: boolean,
  score: number | null,
  completionRule: unknown,
): boolean {
  if (!hasResult) return false;
  const cycle = learningRouteCycle(pathCode);
  if (cycle?.routeFamily === "A" && cycle.sequence >= 2) return true;

  const minimumScore = minimumScoreFromCompletionRule(completionRule);
  return minimumScore === null || (score !== null && score >= minimumScore);
}
