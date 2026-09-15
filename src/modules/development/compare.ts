export type DevelopmentBaselineSkill = {
  competency: string;
  score: number | null;
  scoredCount: number;
};

export type DevelopmentCurrentSkill = {
  family: string;
  competency: string;
  label: string;
  recentAccuracy: number | null;
  trend: "DEVELOPING" | "STABLE" | "NEEDS_REVIEW" | null;
};

export type DevelopmentComparison = {
  family: string;
  competency: string;
  label: string;
  baselineScore: number | null;
  currentAccuracy: number | null;
  change: number | null;
  trend: "DEVELOPING" | "STABLE" | "NEEDS_REVIEW" | null;
};

/**
 * Baseline and current values are compared only when both are measured.
 * Missing placement coverage or unscored training must remain null; a zero
 * would falsely imply a measured decline.
 */
export function compareBaselineToCurrent(
  baseline: readonly DevelopmentBaselineSkill[] | null,
  current: readonly DevelopmentCurrentSkill[],
): DevelopmentComparison[] {
  const byCompetency = new Map((baseline ?? []).map((item) => [item.competency, item]));
  return current.map((skill) => {
    const baselineSkill = byCompetency.get(skill.competency);
    const baselineScore = baselineSkill?.score ?? null;
    const currentAccuracy = Number.isFinite(skill.recentAccuracy) ? skill.recentAccuracy : null;
    return {
      family: skill.family,
      competency: skill.competency,
      label: skill.label,
      baselineScore,
      currentAccuracy,
      change:
        baselineScore !== null && currentAccuracy !== null ? currentAccuracy - baselineScore : null,
      trend: skill.trend,
    };
  });
}
