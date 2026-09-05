import type { QuestionType } from "@prisma/client";
import {
  PROFICIENCY_LEVEL_CODES,
  PROFICIENCY_SKILL_CODES,
  type ProficiencyLevelCode,
  type ProficiencySkillCode,
} from "../../curriculum/proficiency-levels.js";

export type PlacementCalibrationStatus = "NOT_CALIBRATED" | "CALIBRATED";

export type PlacementScoreBand = {
  levelCode: ProficiencyLevelCode;
  minInclusive: number;
  maxExclusive?: number;
  maxInclusive?: number;
};

export interface PlacementScoringContract {
  readonly version: 1;
  readonly scale: { readonly min: 0; readonly max: 1 };
  readonly minScoredCount: number;
  readonly questionPolicy: {
    readonly excludedQuestionTypes: readonly ["OPEN_ENDED"];
  };
  readonly skillSubscores: {
    readonly required: true;
    readonly aggregation: "MEAN_OF_RAW_SCORES";
    readonly skillCodes: readonly (typeof PROFICIENCY_SKILL_CODES)[number][];
  };
  readonly bands: readonly PlacementScoreBand[];
  readonly calibrationStatus: PlacementCalibrationStatus;
  readonly productionAssignmentEnabled: boolean;
}

/**
 * v1 contract. Band değerleri yalnızca tasarım/QA placeholder'ıdır.
 * calibrationStatus ve productionAssignmentEnabled kapısı açılmadan
 * AssessmentResult.resultLevelId atanamaz.
 */
export const PLACEMENT_SCORING_CONTRACT_V1: PlacementScoringContract = {
  version: 1,
  scale: { min: 0, max: 1 },
  minScoredCount: 24,
  questionPolicy: { excludedQuestionTypes: ["OPEN_ENDED"] },
  skillSubscores: {
    required: true,
    aggregation: "MEAN_OF_RAW_SCORES",
    skillCodes: PROFICIENCY_SKILL_CODES,
  },
  bands: [
    { levelCode: "R1_FOUNDATION", minInclusive: 0, maxExclusive: 0.35 },
    { levelCode: "R2_DEVELOPING", minInclusive: 0.35, maxExclusive: 0.55 },
    { levelCode: "R3_INDEPENDENT", minInclusive: 0.55, maxExclusive: 0.75 },
    { levelCode: "R4_ADVANCED", minInclusive: 0.75, maxInclusive: 1 },
  ],
  calibrationStatus: "NOT_CALIBRATED",
  productionAssignmentEnabled: false,
};

export type PlacementScoreInput = {
  skillCode: ProficiencySkillCode;
  questionType: QuestionType;
  rawScore: number | null;
};

export type PlacementSkillSubscore = {
  scoredCount: number;
  totalRawScore: number;
  score: number | null;
};

export type PlacementAggregateScore = {
  score: number | null;
  totalRawScore: number;
  scoredCount: number;
  eligibleQuestionCount: number;
  pendingEvaluationCount: number;
  minScoredCount: number;
  skillSubscores: Record<ProficiencySkillCode, PlacementSkillSubscore>;
};

function emptySkillSubscores(): Record<ProficiencySkillCode, PlacementSkillSubscore> {
  return Object.fromEntries(
    PROFICIENCY_SKILL_CODES.map((skillCode) => [
      skillCode,
      { scoredCount: 0, totalRawScore: 0, score: null },
    ]),
  ) as Record<ProficiencySkillCode, PlacementSkillSubscore>;
}

function assertRawScore(rawScore: number): void {
  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 1) {
    throw new Error("Placement rawScore 0..1 aralığında olmalı");
  }
}

/**
 * Question scoring sonuçlarını placement aggregate'ine dönüştürür.
 * OPEN_ENDED sorular score hesabına girmez; manuel değerlendirme gerektirir.
 * Bu fonksiyon yalnızca hesaplar, DB'ye yazmaz.
 */
export function aggregatePlacementScore(
  inputs: readonly PlacementScoreInput[],
  contract: PlacementScoringContract = PLACEMENT_SCORING_CONTRACT_V1,
): PlacementAggregateScore {
  const skillSubscores = emptySkillSubscores();
  let totalRawScore = 0;
  let scoredCount = 0;
  let eligibleQuestionCount = 0;
  let pendingEvaluationCount = 0;

  for (const input of inputs) {
    if (!PROFICIENCY_SKILL_CODES.includes(input.skillCode)) {
      throw new Error(`Placement Skill code desteklenmiyor: ${input.skillCode}`);
    }

    if (input.questionType === "OPEN_ENDED") {
      if (input.rawScore === null) pendingEvaluationCount += 1;
      continue;
    }

    eligibleQuestionCount += 1;
    if (input.rawScore === null) continue;
    assertRawScore(input.rawScore);
    scoredCount += 1;
    totalRawScore += input.rawScore;

    const subscore = skillSubscores[input.skillCode];
    subscore.scoredCount += 1;
    subscore.totalRawScore += input.rawScore;
  }

  for (const skillCode of PROFICIENCY_SKILL_CODES) {
    const subscore = skillSubscores[skillCode];
    subscore.score =
      subscore.scoredCount > 0 ? subscore.totalRawScore / subscore.scoredCount : null;
  }

  return {
    score: scoredCount > 0 ? totalRawScore / scoredCount : null,
    totalRawScore,
    scoredCount,
    eligibleQuestionCount,
    pendingEvaluationCount,
    minScoredCount: contract.minScoredCount,
    skillSubscores,
  };
}

export function resolvePlacementBand(
  score: number,
  contract: PlacementScoringContract = PLACEMENT_SCORING_CONTRACT_V1,
): PlacementScoreBand | null {
  assertRawScore(score);
  return (
    contract.bands.find((band) => {
      if (score < band.minInclusive) return false;
      if (band.maxInclusive !== undefined) return score <= band.maxInclusive;
      return band.maxExclusive === undefined || score < band.maxExclusive;
    }) ?? null
  );
}

export type PlacementLevelReference = { id: string; code: ProficiencyLevelCode };

export type PlacementResolutionReason =
  | "NO_SCORE"
  | "INSUFFICIENT_SCORED_COUNT"
  | "INCOMPLETE_SKILL_COVERAGE"
  | "CALIBRATION_REQUIRED"
  | "LEVEL_NOT_FOUND"
  | "RESOLVED";

export type PlacementResolution = {
  score: number | null;
  recommendedLevelCode: ProficiencyLevelCode | null;
  resultLevelId: string | null;
  reviewRequired: boolean;
  reason: PlacementResolutionReason;
};

export type PlacementSessionQuestion = {
  questionVersionId: string;
  questionType: QuestionType;
  skillCode: string | null;
};

export type PlacementSessionAttempt = {
  questionVersionId: string;
  rawScore: number | null;
};

export type PlacementSessionScore = {
  aggregate: PlacementAggregateScore;
  resolution: PlacementResolution;
  invalidSkillQuestionCount: number;
};

/**
 * Score band çözümünü AssessmentResult alanlarına bağlayan saf fonksiyondur.
 * Kalibrasyon tamamlanmadığında band yalnızca review önerisi olarak döner;
 * resultLevelId kesinlikle null kalır.
 */
export function resolvePlacementResult(
  aggregate: PlacementAggregateScore,
  levels: readonly PlacementLevelReference[],
  contract: PlacementScoringContract = PLACEMENT_SCORING_CONTRACT_V1,
): PlacementResolution {
  if (aggregate.score === null) {
    return {
      score: null,
      recommendedLevelCode: null,
      resultLevelId: null,
      reviewRequired: true,
      reason: "NO_SCORE",
    };
  }
  if (aggregate.scoredCount < contract.minScoredCount) {
    return {
      score: aggregate.score,
      recommendedLevelCode: null,
      resultLevelId: null,
      reviewRequired: true,
      reason: "INSUFFICIENT_SCORED_COUNT",
    };
  }
  if (
    contract.skillSubscores.required &&
    contract.skillSubscores.skillCodes.some(
      (skillCode) => aggregate.skillSubscores[skillCode].scoredCount === 0,
    )
  ) {
    return {
      score: aggregate.score,
      recommendedLevelCode: null,
      resultLevelId: null,
      reviewRequired: true,
      reason: "INCOMPLETE_SKILL_COVERAGE",
    };
  }

  const band = resolvePlacementBand(aggregate.score, contract);
  if (!band) {
    return {
      score: aggregate.score,
      recommendedLevelCode: null,
      resultLevelId: null,
      reviewRequired: true,
      reason: "LEVEL_NOT_FOUND",
    };
  }

  if (contract.calibrationStatus !== "CALIBRATED" || !contract.productionAssignmentEnabled) {
    return {
      score: aggregate.score,
      recommendedLevelCode: band.levelCode,
      resultLevelId: null,
      reviewRequired: true,
      reason: "CALIBRATION_REQUIRED",
    };
  }

  const level = levels.find((candidate) => candidate.code === band.levelCode);
  if (!level) {
    return {
      score: aggregate.score,
      recommendedLevelCode: band.levelCode,
      resultLevelId: null,
      reviewRequired: true,
      reason: "LEVEL_NOT_FOUND",
    };
  }

  return {
    score: aggregate.score,
    recommendedLevelCode: band.levelCode,
    resultLevelId: level.id,
    reviewRequired: false,
    reason: "RESOLVED",
  };
}

/**
 * Gerçek session completion akışının placement adapter'ıdır. Template'teki
 * cevaplanmamış sorular da aggregate'e null skorla girer; böylece minimum
 * scoredCount ve üç Skill coverage koşulları tek yerde uygulanır.
 * Bilinmeyen/missing Skill bağlamı review zorunluluğu doğurur.
 */
export function scorePlacementSession(
  questions: readonly PlacementSessionQuestion[],
  attempts: readonly PlacementSessionAttempt[],
  levels: readonly PlacementLevelReference[],
  contract: PlacementScoringContract = PLACEMENT_SCORING_CONTRACT_V1,
): PlacementSessionScore {
  const attemptsByQuestionVersionId = new Map(
    attempts.map((attempt) => [attempt.questionVersionId, attempt.rawScore]),
  );
  const inputs: PlacementScoreInput[] = [];
  let invalidSkillQuestionCount = 0;

  for (const question of questions) {
    const rawScore = attemptsByQuestionVersionId.get(question.questionVersionId) ?? null;
    if (question.questionType === "OPEN_ENDED") {
      if (
        question.skillCode &&
        PROFICIENCY_SKILL_CODES.includes(question.skillCode as ProficiencySkillCode)
      ) {
        inputs.push({
          skillCode: question.skillCode as ProficiencySkillCode,
          questionType: question.questionType,
          rawScore,
        });
      } else {
        // OPEN_ENDED score dışında kaldığı için Skill eksikliği aggregate'i bozmaz.
        inputs.push({
          skillCode: PROFICIENCY_SKILL_CODES[0],
          questionType: question.questionType,
          rawScore,
        });
      }
      continue;
    }

    if (
      !question.skillCode ||
      !PROFICIENCY_SKILL_CODES.includes(question.skillCode as ProficiencySkillCode)
    ) {
      invalidSkillQuestionCount += 1;
      continue;
    }
    inputs.push({
      skillCode: question.skillCode as ProficiencySkillCode,
      questionType: question.questionType,
      rawScore,
    });
  }

  const aggregate = aggregatePlacementScore(inputs, contract);
  const baseResolution = resolvePlacementResult(aggregate, levels, contract);
  const resolution =
    invalidSkillQuestionCount > 0
      ? {
          ...baseResolution,
          recommendedLevelCode: null,
          resultLevelId: null,
          reviewRequired: true,
          reason: "INCOMPLETE_SKILL_COVERAGE" as const,
        }
      : baseResolution;

  return { aggregate, resolution, invalidSkillQuestionCount };
}

export const PLACEMENT_RESULT_LEVEL_CODES = PROFICIENCY_LEVEL_CODES;
