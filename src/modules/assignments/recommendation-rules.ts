/**
 * Product rules for deterministic assignment recommendations.
 *
 * These are product thresholds, not scientific norms. They are centralized so
 * the behavior can be reviewed and changed without scattering magic numbers
 * through the recommendation service.
 */
export const ASSIGNMENT_RECOMMENDATION_RULES = Object.freeze({
  measurementWeakScore: 0.7,
  assignmentWeakScore: 0.6,
  repeatedAssignmentCount: 3,
  cooldownHours: 168,
  defaultMaxActiveAssignments: 1,
  maxRecommendationsPerStudent: 3,
});

export type AssignmentRecommendationSignal = {
  skillId: string;
  skillCode: string;
  skillName: string;
  measurementScore: number | null;
  recentAssignmentScores: number[];
  learningStepId: string | null;
  learningStepTitle: string | null;
};

export type AssignmentRecommendationCandidate = {
  templateId: string;
  templateVersionId: string;
  templateTitle: string;
  templateType: string;
  skillId: string;
  learningStepId: string | null;
};

export type AssignmentRecommendationDecision = {
  skillId: string;
  skillCode: string;
  skillName: string;
  templateId: string;
  templateVersionId: string;
  templateTitle: string;
  templateType: string;
  learningStepId: string | null;
  reasonCode: "MEASUREMENT_NEED" | "REPEATED_ASSIGNMENT_NEED" | "LEARNING_PATH_SUPPORT";
  reason: string;
  evidence: {
    measurementScore: number | null;
    recentAssignmentScores: number[];
    learningStepTitle: string | null;
    productRules: {
      measurementWeakScore: number;
      assignmentWeakScore: number;
      repeatedAssignmentCount: number;
    };
  };
};

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function repeatedAssignmentNeed(scores: number[]): boolean {
  return (
    scores.length >= ASSIGNMENT_RECOMMENDATION_RULES.repeatedAssignmentCount &&
    scores
      .slice(-ASSIGNMENT_RECOMMENDATION_RULES.repeatedAssignmentCount)
      .every((score) => score < ASSIGNMENT_RECOMMENDATION_RULES.assignmentWeakScore)
  );
}

export function buildRecommendationDecisions(
  signals: readonly AssignmentRecommendationSignal[],
  candidates: readonly AssignmentRecommendationCandidate[],
): AssignmentRecommendationDecision[] {
  const decisions: AssignmentRecommendationDecision[] = [];
  const orderedSignals = [...signals].sort((a, b) => a.skillCode.localeCompare(b.skillCode));

  for (const signal of orderedSignals) {
    const measurementNeed =
      signal.measurementScore !== null &&
      signal.measurementScore < ASSIGNMENT_RECOMMENDATION_RULES.measurementWeakScore;
    const repeatedNeed = repeatedAssignmentNeed(signal.recentAssignmentScores);
    const learningPathSupport = Boolean(signal.learningStepId);
    if (!measurementNeed && !repeatedNeed) continue;

    const candidate = candidates
      .filter((item) => item.skillId === signal.skillId)
      .sort((a, b) => {
        const leftLearning = a.learningStepId === signal.learningStepId ? 0 : 1;
        const rightLearning = b.learningStepId === signal.learningStepId ? 0 : 1;
        return (
          leftLearning - rightLearning ||
          a.templateTitle.localeCompare(b.templateTitle) ||
          a.templateId.localeCompare(b.templateId)
        );
      })[0];
    if (!candidate) continue;

    const reasonCode = repeatedNeed
      ? "REPEATED_ASSIGNMENT_NEED"
      : measurementNeed
        ? "MEASUREMENT_NEED"
        : "LEARNING_PATH_SUPPORT";
    const reasons: string[] = [];
    if (measurementNeed) {
      reasons.push(
        `Son ölçümde ${signal.skillName} becerisinde ${percentage(signal.measurementScore!)} sonucu görüldü.`,
      );
    }
    if (repeatedNeed) {
      reasons.push(
        `Son ${ASSIGNMENT_RECOMMENDATION_RULES.repeatedAssignmentCount} ödev çalışmasında ${signal.skillName} becerisinde düşük sonuçlar görüldü: ${signal.recentAssignmentScores.map(percentage).join(" / ")}.`,
      );
    }
    if (learningPathSupport) {
      reasons.push(`Mevcut öğrenme adımı ${signal.learningStepTitle ?? "bu beceriyi"} hedefliyor.`);
    }

    decisions.push({
      skillId: signal.skillId,
      skillCode: signal.skillCode,
      skillName: signal.skillName,
      templateId: candidate.templateId,
      templateVersionId: candidate.templateVersionId,
      templateTitle: candidate.templateTitle,
      templateType: candidate.templateType,
      learningStepId: candidate.learningStepId ?? signal.learningStepId,
      reasonCode,
      reason: reasons.join(" "),
      evidence: {
        measurementScore: signal.measurementScore,
        recentAssignmentScores: signal.recentAssignmentScores,
        learningStepTitle: signal.learningStepTitle,
        productRules: {
          measurementWeakScore: ASSIGNMENT_RECOMMENDATION_RULES.measurementWeakScore,
          assignmentWeakScore: ASSIGNMENT_RECOMMENDATION_RULES.assignmentWeakScore,
          repeatedAssignmentCount: ASSIGNMENT_RECOMMENDATION_RULES.repeatedAssignmentCount,
        },
      },
    });
  }

  return decisions.slice(0, ASSIGNMENT_RECOMMENDATION_RULES.maxRecommendationsPerStudent);
}
