import type { Prisma } from "@prisma/client";
import {
  PROFICIENCY_LEVEL_CODES,
  PROFICIENCY_SKILL_CODES,
  type ProficiencySkillCode,
} from "../../curriculum/proficiency-levels.js";
import { validationError } from "../../lib/errors.js";

export type GuestAnswerScore = {
  isCorrect: boolean | null;
  rawScore: number | null;
};

export type GuestSkillSubscore = {
  correctCount: number;
  answeredCount: number;
  score: number | null;
};

export type GuestRecommendationBand = {
  levelCode: (typeof PROFICIENCY_LEVEL_CODES)[number];
  minInclusive: number;
  maxExclusive?: number;
  maxInclusive?: number;
};

export type GuestRecommendationPolicy = {
  bands: readonly GuestRecommendationBand[];
  minimumSkillAnsweredCount: number;
  distinctSkillDelta: number;
};

export type GuestEvaluation = {
  score: number | null;
  scoredQuestionCount: number;
  skillSubscores: Record<ProficiencySkillCode, GuestSkillSubscore>;
  resultState:
    | "INSUFFICIENT_DATA"
    | "PARTIAL_LOW_SIGNAL"
    | "BALANCED_PERFORMANCE"
    | "DISTINCT_SKILL_SIGNAL"
    | "RECOMMENDATION_UNAVAILABLE"
    | "RECOMMENDATION_AVAILABLE";
  confidenceState:
    "INSUFFICIENT_DATA" | "LOW_SIGNAL" | "USABLE_SIGNAL" | "BOUNDARY_SENSITIVE" | "NOT_AVAILABLE";
  recommendedLevelCode: (typeof PROFICIENCY_LEVEL_CODES)[number] | null;
};

function emptySkillSubscores(): Record<ProficiencySkillCode, GuestSkillSubscore> {
  return Object.fromEntries(
    PROFICIENCY_SKILL_CODES.map((skillCode) => [
      skillCode,
      { correctCount: 0, answeredCount: 0, score: null },
    ]),
  ) as Record<ProficiencySkillCode, GuestSkillSubscore>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBand(value: unknown): GuestRecommendationBand | null {
  if (!isRecord(value) || typeof value.levelCode !== "string") return null;
  if (
    !PROFICIENCY_LEVEL_CODES.includes(value.levelCode as (typeof PROFICIENCY_LEVEL_CODES)[number])
  ) {
    return null;
  }
  if (typeof value.minInclusive !== "number" || !Number.isFinite(value.minInclusive)) return null;
  if (value.minInclusive < 0 || value.minInclusive > 1) return null;
  const maxExclusive = value.maxExclusive;
  const maxInclusive = value.maxInclusive;
  if (
    (maxExclusive !== undefined &&
      (typeof maxExclusive !== "number" || !Number.isFinite(maxExclusive))) ||
    (maxInclusive !== undefined &&
      (typeof maxInclusive !== "number" || !Number.isFinite(maxInclusive))) ||
    (maxExclusive !== undefined && maxInclusive !== undefined) ||
    (maxExclusive === undefined && maxInclusive === undefined)
  ) {
    return null;
  }
  const upperBound = maxExclusive ?? maxInclusive;
  if (upperBound! < 0 || upperBound! > 1 || upperBound! <= value.minInclusive) return null;
  return {
    levelCode: value.levelCode as (typeof PROFICIENCY_LEVEL_CODES)[number],
    minInclusive: value.minInclusive,
    ...(maxExclusive !== undefined ? { maxExclusive } : {}),
    ...(maxInclusive !== undefined ? { maxInclusive } : {}),
  };
}

export function parseGuestRecommendationPolicy(
  recommendationThresholds: Prisma.JsonValue,
  skillSignalThresholds: Prisma.JsonValue,
): GuestRecommendationPolicy | null {
  const thresholdRoot = isRecord(recommendationThresholds)
    ? recommendationThresholds.bands
    : recommendationThresholds;
  if (!Array.isArray(thresholdRoot)) return null;
  const bands = thresholdRoot.map(parseBand);
  if (bands.some((band) => band === null)) return null;
  const uniqueCodes = new Set(bands.map((band) => band!.levelCode));
  if (uniqueCodes.size !== bands.length || bands.length === 0) return null;

  const signalRoot = isRecord(skillSignalThresholds) ? skillSignalThresholds : {};
  const minimumSkillAnsweredCount = signalRoot.minimumSkillAnsweredCount;
  const distinctSkillDelta = signalRoot.distinctSkillDelta;
  if (
    typeof minimumSkillAnsweredCount !== "number" ||
    !Number.isInteger(minimumSkillAnsweredCount) ||
    minimumSkillAnsweredCount < 1 ||
    typeof distinctSkillDelta !== "number" ||
    !Number.isFinite(distinctSkillDelta) ||
    distinctSkillDelta < 0 ||
    distinctSkillDelta > 1
  ) {
    return null;
  }

  return {
    bands: bands as GuestRecommendationBand[],
    minimumSkillAnsweredCount,
    distinctSkillDelta,
  };
}

function bandForScore(
  score: number,
  bands: readonly GuestRecommendationBand[],
): GuestRecommendationBand | null {
  return (
    bands.find(
      (band) =>
        score >= band.minInclusive &&
        (band.maxExclusive !== undefined ? score < band.maxExclusive : score <= band.maxInclusive!),
    ) ?? null
  );
}

function scoreIsBoundarySensitive(
  score: number,
  bands: readonly GuestRecommendationBand[],
): boolean {
  return bands.some((band) => {
    const upper = band.maxExclusive ?? band.maxInclusive;
    return upper !== undefined && Math.abs(score - upper) < Number.EPSILON;
  });
}

export function evaluateGuestDiagnostic(
  inputs: readonly {
    skillCode: ProficiencySkillCode;
    rawScore: number | null;
    isCorrect: boolean | null;
  }[],
  minimumScorableCount: number,
  policy: GuestRecommendationPolicy | null,
): GuestEvaluation {
  const skillSubscores = emptySkillSubscores();
  let totalCorrect = 0;
  let scoredQuestionCount = 0;

  for (const input of inputs) {
    const subscore = skillSubscores[input.skillCode];
    if (!subscore) throw validationError("Guest Diagnostic skill verisi geçersiz");
    if (input.rawScore === null || input.isCorrect === null) continue;
    if (!Number.isFinite(input.rawScore) || input.rawScore < 0 || input.rawScore > 1) {
      throw validationError("Guest Diagnostic puan verisi geçersiz");
    }
    subscore.answeredCount += 1;
    if (input.isCorrect) {
      subscore.correctCount += 1;
      totalCorrect += 1;
    }
    scoredQuestionCount += 1;
  }

  for (const skillCode of PROFICIENCY_SKILL_CODES) {
    const subscore = skillSubscores[skillCode];
    subscore.score =
      subscore.answeredCount > 0 ? subscore.correctCount / subscore.answeredCount : null;
  }

  if (scoredQuestionCount < minimumScorableCount) {
    return {
      score: scoredQuestionCount > 0 ? totalCorrect / scoredQuestionCount : null,
      scoredQuestionCount,
      skillSubscores,
      resultState: "INSUFFICIENT_DATA",
      confidenceState: "INSUFFICIENT_DATA",
      recommendedLevelCode: null,
    };
  }

  if (!policy) {
    return {
      score: totalCorrect / scoredQuestionCount,
      scoredQuestionCount,
      skillSubscores,
      resultState: "RECOMMENDATION_UNAVAILABLE",
      confidenceState: "NOT_AVAILABLE",
      recommendedLevelCode: null,
    };
  }

  const score = totalCorrect / scoredQuestionCount;
  const missingSkill = PROFICIENCY_SKILL_CODES.some(
    (skillCode) => skillSubscores[skillCode].answeredCount < policy.minimumSkillAnsweredCount,
  );
  const skillScores = PROFICIENCY_SKILL_CODES.map(
    (skillCode) => skillSubscores[skillCode].score,
  ).filter((value): value is number => value !== null);
  const distinctSkillSignal =
    skillScores.length > 1 &&
    Math.max(...skillScores) - Math.min(...skillScores) >= policy.distinctSkillDelta;
  const band = bandForScore(score, policy.bands);
  if (!band) {
    return {
      score,
      scoredQuestionCount,
      skillSubscores,
      resultState: "RECOMMENDATION_UNAVAILABLE",
      confidenceState: "NOT_AVAILABLE",
      recommendedLevelCode: null,
    };
  }

  return {
    score,
    scoredQuestionCount,
    skillSubscores,
    resultState: missingSkill
      ? "PARTIAL_LOW_SIGNAL"
      : distinctSkillSignal
        ? "DISTINCT_SKILL_SIGNAL"
        : "BALANCED_PERFORMANCE",
    confidenceState: scoreIsBoundarySensitive(score, policy.bands)
      ? "BOUNDARY_SENSITIVE"
      : missingSkill
        ? "LOW_SIGNAL"
        : "USABLE_SIGNAL",
    recommendedLevelCode: band.levelCode,
  };
}
