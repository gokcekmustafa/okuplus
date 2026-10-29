import {
  FAST_READING_RENDERERS,
  parseTrainingExerciseVersionConfig,
  timeRoleForTrainingFamily,
  type TrainingExerciseVersionConfig,
} from "../modules/training/exercise-contract.js";
import type {
  ProgramContent,
  ProgramExercise,
  ProgramQuestion,
} from "./education-v2-p0-program.js";
import type { P1AProgram, P1APathStep } from "./education-v2-p1-a-program.js";
import {
  getEducationV2P1ExpansionDraftCycle,
  type EducationV2P1ExpansionDraftCycle,
  type EducationV2P1ExpansionDraftQuestion,
} from "./education-v2-p1-800-draft-cycles.js";
import {
  LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "./learning-cycle-manifest.js";
import { mapCurriculumSkillCodeToStoredSkillCode } from "./learning-step-skill-link.js";

export const EDUCATION_V2_P1_A_CYCLE_5_8_SEQUENCES = [5, 6, 7, 8] as const;
export type EducationV2P1ACycle5To8Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_5_8_SEQUENCES)[number];

const CYCLE_PREFIX = "edu-v2-p1-a-cycle";
const CYCLE_ID_PREFIX = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE";
const COMPLETION_SCORE = 0.75;

const supportedCompetencies = new Set<TrainingExerciseVersionConfig["competency"]>([
  "FAST_ATTENTION",
  "FAST_RECOGNITION",
  "FAST_CHUNKING",
  "RC_MAIN_IDEA",
  "RC_DETAIL",
  "RC_INFERENCE",
]);

const familyByCompetency = {
  FAST_ATTENTION: "ATTENTION_BURST",
  FAST_RECOGNITION: "RAPID_RECOGNITION",
  FAST_CHUNKING: "PHRASE_CHUNKING",
  RC_MAIN_IDEA: "MAIN_IDEA",
  RC_DETAIL: "DETAIL_EVIDENCE",
  RC_INFERENCE: "INFERENCE",
} as const satisfies Record<
  TrainingExerciseVersionConfig["competency"],
  TrainingExerciseVersionConfig["family"]
>;

const rendererByCompetency = {
  FAST_ATTENTION: FAST_READING_RENDERERS.ATTENTION_BURST,
  FAST_RECOGNITION: FAST_READING_RENDERERS.RAPID_RECOGNITION,
  FAST_CHUNKING: FAST_READING_RENDERERS.PHRASE_CHUNKING,
  RC_MAIN_IDEA: "QUESTION_MULTIPLE_CHOICE",
  RC_DETAIL: "QUESTION_MULTIPLE_CHOICE",
  RC_INFERENCE: "QUESTION_MULTIPLE_CHOICE",
} as const;

const templateTypeByCategory = {
  FAST_READING: "FLUENCY",
  READING_COMPREHENSION: "COMPREHENSION",
  COMMON_STRATEGIES: "MIXED",
  INTEGRATED_PRACTICE: "MIXED",
  MULTI_SKILL_ASSESSMENT: "MIXED",
} as const satisfies Record<
  EducationV2P1ExpansionDraftCycle["authoredStationCategories"][number],
  ProgramExercise["templateType"]
>;

export function p1ACycle5To8Id(
  sequence: number,
  kind:
    | "content"
    | "contentVersion"
    | "template"
    | "templateVersion"
    | "question"
    | "questionVersion"
    | "assessment"
    | "path"
    | "unit"
    | "step",
  key: string,
): string {
  return `${CYCLE_PREFIX}-${sequence}-${kind}-${key}`;
}

export const p1ACycle5To8ContentVersionId = (sequence: number, key: string) =>
  p1ACycle5To8Id(sequence, "contentVersion", `${key}-v${sequence}`);
export const p1ACycle5To8TemplateId = (sequence: number, key: string) =>
  p1ACycle5To8Id(sequence, "template", key);
export const p1ACycle5To8TemplateVersionId = (sequence: number, key: string) =>
  p1ACycle5To8Id(sequence, "templateVersion", `${key}-v${sequence}`);
export const p1ACycle5To8QuestionId = (sequence: number, key: string) =>
  p1ACycle5To8Id(sequence, "question", key);
export const p1ACycle5To8QuestionVersionId = (sequence: number, key: string) =>
  p1ACycle5To8Id(sequence, "questionVersion", `${key}-v${sequence}`);
export const p1ACycle5To8AssessmentId = (sequence: number, key: string) =>
  p1ACycle5To8Id(sequence, "assessment", `${key}-v${sequence}`);

export type EducationV2P1ACycle5To8Program = {
  sequence: EducationV2P1ACycle5To8Sequence;
  sourceCycle: EducationV2P1ExpansionDraftCycle;
  program: P1AProgram;
  manifest: LearningCycleManifest;
};

export type EducationV2P1ACycleProgram<TSequence extends number = number> = Omit<
  EducationV2P1ACycle5To8Program,
  "sequence"
> & { sequence: TSequence };

export function isCompleteEducationV2P1ACycle5To8Source(
  sourceCycle: EducationV2P1ExpansionDraftCycle | undefined,
  sequence: number,
): sourceCycle is EducationV2P1ExpansionDraftCycle {
  return Boolean(
    sourceCycle &&
    sourceCycle.sequence === sequence &&
    sourceCycle.pathCode === `EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_${sequence}_G8_12` &&
    sourceCycle.sourceStations.length === 5 &&
    sourceCycle.sourceStations.every((station) => station.questions.length === 3),
  );
}

function competencyFor(
  questionSource: EducationV2P1ExpansionDraftCycle["sourceStations"][number],
): TrainingExerciseVersionConfig["competency"] {
  const direct = questionSource.skillCodes.find((code) => supportedCompetencies.has(code as never));
  if (direct) return direct as TrainingExerciseVersionConfig["competency"];

  for (const code of questionSource.skillCodes) {
    const mapped = mapCurriculumSkillCodeToStoredSkillCode(code);
    if (mapped && supportedCompetencies.has(mapped as TrainingExerciseVersionConfig["competency"]))
      return mapped as TrainingExerciseVersionConfig["competency"];
  }

  throw new Error(`Cycle ${questionSource.sequence} skill eşlemesi eksik: ${questionSource.key}`);
}

function buildExerciseConfig(
  stationTitle: string,
  competency: TrainingExerciseVersionConfig["competency"],
  difficulty: TrainingExerciseVersionConfig["difficulty"],
  instructions: string,
): TrainingExerciseVersionConfig {
  return parseTrainingExerciseVersionConfig({
    schemaVersion: 1,
    family: familyByCompetency[competency],
    competency,
    difficulty,
    estimatedDurationSeconds: 180,
    instructions,
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: timeRoleForTrainingFamily(familyByCompetency[competency]),
      maxScore: 1,
      openEnded: false,
    },
    feedback: {
      types: ["POSITIVE", "CORRECTIVE", "HINT", "SKILL_TIP"],
      showExplanation: true,
      retryEnabled: false,
      maxMessageLength: 240,
    },
    xp: { completionPoints: 10, correctAnswerBonus: 2, dailyCap: 40 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    rendererKey: rendererByCompetency[competency],
    settings: { optionCount: 4, mobileLayout: "STACKED", title: stationTitle },
  });
}

function toQuestion(
  question: EducationV2P1ExpansionDraftQuestion,
  difficulty: number,
): ProgramQuestion {
  return {
    key: question.key,
    prompt: question.prompt,
    options: question.options,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    hint: question.hint,
    difficulty,
  };
}

export function educationV2P1ACycle5To8AnswerKey(
  question: Pick<ProgramQuestion, "options" | "correctOptionId">,
): {
  type: "MULTIPLE_CHOICE";
  correctOptionIds: [string];
  allowMultiple: false;
  partialCredit: false;
} {
  const optionIds = question.options.map((option) => option.id);
  if (
    new Set(optionIds).size !== optionIds.length ||
    !optionIds.includes(question.correctOptionId)
  ) {
    throw new Error("Cycle 5–8 doğru cevap kimliği seçeneklerle eşleşmiyor.");
  }
  return {
    type: "MULTIPLE_CHOICE",
    correctOptionIds: [question.correctOptionId],
    allowMultiple: false,
    partialCredit: false,
  };
}

function buildCycle<TSequence extends number>(
  sequence: TSequence,
  finalSequence: number,
): EducationV2P1ACycleProgram<TSequence> {
  const sourceCycle = getEducationV2P1ExpansionDraftCycle("A", sequence);
  if (!isCompleteEducationV2P1ACycle5To8Source(sourceCycle, sequence)) {
    throw new Error(
      `Cycle ${sequence} kaynak taslağı beş istasyon/15 soru sözleşmesini karşılamıyor.`,
    );
  }
  if (
    sequence > 8 &&
    (sourceCycle.sourceVerifiedStationCount !== 5 ||
      sourceCycle.sourceStations.some(
        (station) => station.provenanceStatus !== "SOURCE_VERIFIED" || !station.sourceEvidence,
      ))
  ) {
    throw new Error(`Cycle ${sequence} üretim adayı için beş doğrulanmış kaynak gereklidir.`);
  }

  const programId = `${CYCLE_ID_PREFIX}-${sequence}`;
  const content: ProgramContent[] = sourceCycle.sourceStations.map((station) => {
    const skillCode = competencyFor(station);
    return {
      key: station.key,
      title: station.textTitle,
      body: station.text,
      difficulty:
        station.difficulty === "FOUNDATION" ? 2 : station.difficulty === "INTERMEDIATE" ? 3 : 4,
      skillCode,
    };
  });
  const exercises: ProgramExercise[] = sourceCycle.sourceStations.map((station, index) => {
    const contentItem = content[index];
    if (!contentItem) throw new Error(`Cycle ${sequence} içerik kaydı eksik: ${station.key}`);
    const questions = station.questions.map((question) =>
      toQuestion(question, contentItem.difficulty),
    );
    const difficulty: TrainingExerciseVersionConfig["difficulty"] =
      contentItem.difficulty >= 4
        ? "CHALLENGING"
        : contentItem.difficulty >= 3
          ? "DEVELOPING"
          : "FOUNDATION";
    return {
      key: station.key,
      title: station.title,
      templateType: templateTypeByCategory[station.category],
      contentKey: contentItem.key,
      skillCode: contentItem.skillCode,
      contract: buildExerciseConfig(
        station.title,
        contentItem.skillCode as TrainingExerciseVersionConfig["competency"],
        difficulty,
        station.outcome,
      ),
      questions,
    };
  });

  const lastStation = sourceCycle.sourceStations.at(-1);
  if (!lastStation) throw new Error(`Cycle ${sequence} son istasyon eksik.`);
  const assessmentKey = `${lastStation.key}-assessment`;
  const steps: P1APathStep[] = sourceCycle.sourceStations.map((station, index) => {
    const prerequisiteStepKeys = station.prerequisiteKey ? [station.prerequisiteKey] : undefined;
    if (index === sourceCycle.sourceStations.length - 1) {
      return {
        key: station.key,
        title: station.title,
        type: "ASSESSMENT",
        assessmentKey,
        learningOutcomeKeys: [station.key],
        ...(prerequisiteStepKeys ? { prerequisiteStepKeys } : {}),
        completionRule: { minimumScore: COMPLETION_SCORE },
      };
    }
    return {
      key: station.key,
      title: station.title,
      type: index === 2 ? "REINFORCEMENT" : "PRACTICE",
      contentKey: station.key,
      exerciseKey: station.key,
      learningOutcomeKeys: [station.key],
      ...(prerequisiteStepKeys ? { prerequisiteStepKeys } : {}),
    };
  });

  const program: P1AProgram = {
    programId,
    ageBand: "13–17",
    content,
    exercises,
    assessments: [
      {
        key: assessmentKey,
        title: `P1-A Cycle ${sequence} · Metin kanıtlarını değerlendir`,
        templateExerciseKey: lastStation.key,
        questionKeys: lastStation.questions.map((question) => question.key),
        config: {
          questionCount: 3,
          minimumScorableCount: 3,
          minimumAnsweredCount: 3,
          completionMinimumScore: COMPLETION_SCORE,
        },
      },
    ],
    path: {
      code: sourceCycle.pathCode,
      title: sourceCycle.title,
      area: "READING_COMPREHENSION",
      units: [
        {
          key: `${CYCLE_PREFIX}-${sequence}-unit`,
          code: `${CYCLE_PREFIX}-${sequence}-unit`,
          title: `Anlam ve kanıt · Döngü ${sequence}`,
          position: 1,
          steps,
        },
      ],
    },
  };

  const allQuestionVersionIds = exercises.flatMap((exercise) =>
    exercise.questions.map((question) =>
      p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question.key}`),
    ),
  );
  const exerciseVersions = exercises.map((exercise) => ({
    key: exercise.key,
    versionId: p1ACycle5To8TemplateVersionId(sequence, exercise.key),
    questionVersionIds: exercise.questions.map((question) =>
      p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question.key}`),
    ),
  }));
  const assessmentVersionId = p1ACycle5To8AssessmentId(sequence, assessmentKey);
  const manifest: LearningCycleManifest = {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: program.path.code,
    cycleVersion: sequence,
    sequence,
    routeFamily: "A",
    targetSkillCodes: [
      ...new Set(sourceCycle.sourceStations.flatMap((station) => station.skillCodes)),
    ],
    learningOutcomes: sourceCycle.sourceStations.map((station) => ({
      key: station.key,
      statement: station.outcome,
      targetSkillCodes: [...station.skillCodes],
    })),
    resourceCatalog: {
      contentKeys: content.map((item) => item.key),
      exerciseKeys: exercises.map((item) => item.key),
      assessmentKeys: [assessmentKey],
      questionVersionIds: allQuestionVersionIds,
      contentVersions: content.map((item) => ({
        key: item.key,
        versionId: p1ACycle5To8ContentVersionId(sequence, item.key),
      })),
      exerciseVersions,
      assessmentVersions: [
        {
          key: assessmentKey,
          versionId: assessmentVersionId,
          questionVersionIds: lastStation.questions.map((question) =>
            p1ACycle5To8QuestionVersionId(sequence, `${lastStation.key}-${question.key}`),
          ),
        },
      ],
    },
    steps: steps.map((step, index) => {
      const exercise = exercises.find((candidate) => candidate.key === step.exerciseKey);
      const assessment = step.assessmentKey
        ? program.assessments.find((candidate) => candidate.key === step.assessmentKey)
        : undefined;
      return {
        stableKey: step.key,
        order: index + 1,
        type: step.type,
        taskKind:
          step.type === "REINFORCEMENT"
            ? "RETRIEVAL"
            : step.type === "ASSESSMENT"
              ? "CHECKPOINT"
              : "TRANSFER",
        learningOutcomeKeys: [...step.learningOutcomeKeys],
        prerequisiteKeys: step.prerequisiteStepKeys ?? [],
        required: true,
        ...(step.contentKey
          ? {
              content: {
                key: step.contentKey,
                versionId: p1ACycle5To8ContentVersionId(sequence, step.contentKey),
              },
            }
          : {}),
        ...(exercise
          ? {
              exercise: {
                key: exercise.key,
                versionId: p1ACycle5To8TemplateVersionId(sequence, exercise.key),
                questionVersionIds: exercise.questions.map((question) =>
                  p1ACycle5To8QuestionVersionId(sequence, `${exercise.key}-${question.key}`),
                ),
              },
            }
          : {}),
        ...(assessment
          ? {
              assessment: {
                key: assessment.key,
                versionId: assessmentVersionId,
                questionVersionIds: assessment.questionKeys.map((questionKey) =>
                  p1ACycle5To8QuestionVersionId(
                    sequence,
                    `${assessment.templateExerciseKey}-${questionKey}`,
                  ),
                ),
              },
            }
          : {}),
      };
    }),
    completion: {
      requiredStepKeys: steps.map((step) => step.key),
      checkpointStepKeys: [lastStation.key],
      requiresFinalMeasurement: false,
      nextCycle: sequence < finalSequence ? "ASSIGN_NEXT" : "REVIEW_REQUIRED",
    },
  };

  const validation = validateLearningCycleManifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Cycle ${sequence} manifesti geçersiz: ${validation.errors.map((issue) => issue.message).join("; ")}`,
    );
  }
  return { sequence, sourceCycle, program, manifest };
}

export const EDUCATION_V2_P1_A_CYCLE_5_8: EducationV2P1ACycle5To8Program[] =
  EDUCATION_V2_P1_A_CYCLE_5_8_SEQUENCES.map((sequence) => buildCycle(sequence, 8));

/** Source-verified, versioned A-route package prepared beyond the already released 72 steps. */
export const EDUCATION_V2_P1_A_CYCLE_9_12_SEQUENCES = [9, 10, 11, 12] as const;
export const EDUCATION_V2_P1_A_CYCLE_9_12: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_9_12_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_9_12_SEQUENCES.map((sequence) => buildCycle(sequence, 12));

/** Source-verified, versioned A-route package following the already released 92 steps. */
export const EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES = [13, 14, 15, 16] as const;
export const EDUCATION_V2_P1_A_CYCLE_13_16: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES.map((sequence) => buildCycle(sequence, 16));

/** Source-verified, versioned A-route package following the already released 112 steps. */
export const EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES = [17, 18, 19, 20] as const;
export const EDUCATION_V2_P1_A_CYCLE_17_20: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES.map((sequence) => buildCycle(sequence, 20));

/** Source-verified, versioned A-route package following the 112 released stations. */
export const EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES = [21, 22, 23, 24] as const;
export const EDUCATION_V2_P1_A_CYCLE_21_24: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES.map((sequence) => buildCycle(sequence, 24));

/** Source-verified, versioned A-route package following the 152 released stations. */
export const EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES = [25, 26, 27, 28] as const;
export const EDUCATION_V2_P1_A_CYCLE_25_28: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES.map((sequence) => buildCycle(sequence, 28));

/** Source-verified, versioned A-route package following the 172 released stations. */
export const EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES = [29, 30, 31, 32] as const;
export const EDUCATION_V2_P1_A_CYCLE_29_32: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES.map((sequence) => buildCycle(sequence, 32));

/** Source-verified, versioned A-route package following the 192 released stations. */
export const EDUCATION_V2_P1_A_CYCLE_33_36_SEQUENCES = [33, 34, 35, 36] as const;
export const EDUCATION_V2_P1_A_CYCLE_33_36: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_33_36_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_33_36_SEQUENCES.map((sequence) => buildCycle(sequence, 36));

/** Source-verified, versioned A-route package following the 212 released stations. */
export const EDUCATION_V2_P1_A_CYCLE_37_40_SEQUENCES = [37, 38, 39, 40] as const;
export const EDUCATION_V2_P1_A_CYCLE_37_40: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_37_40_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_37_40_SEQUENCES.map((sequence) => buildCycle(sequence, 40));

/** Source-verified, versioned A-route package following the 232 released stations. */
export const EDUCATION_V2_P1_A_CYCLE_41_44_SEQUENCES = [41, 42, 43, 44] as const;
export const EDUCATION_V2_P1_A_CYCLE_41_44: EducationV2P1ACycleProgram<
  (typeof EDUCATION_V2_P1_A_CYCLE_41_44_SEQUENCES)[number]
>[] = EDUCATION_V2_P1_A_CYCLE_41_44_SEQUENCES.map((sequence) => buildCycle(sequence, 44));

export function getEducationV2P1ACycle(sequence: number): EducationV2P1ACycleProgram | undefined {
  return [
    ...EDUCATION_V2_P1_A_CYCLE_5_8,
    ...EDUCATION_V2_P1_A_CYCLE_9_12,
    ...EDUCATION_V2_P1_A_CYCLE_13_16,
    ...EDUCATION_V2_P1_A_CYCLE_17_20,
    ...EDUCATION_V2_P1_A_CYCLE_21_24,
    ...EDUCATION_V2_P1_A_CYCLE_25_28,
    ...EDUCATION_V2_P1_A_CYCLE_29_32,
    ...EDUCATION_V2_P1_A_CYCLE_33_36,
    ...EDUCATION_V2_P1_A_CYCLE_37_40,
    ...EDUCATION_V2_P1_A_CYCLE_41_44,
  ].find((cycle) => cycle.sequence === sequence);
}

export function getEducationV2P1ACycle5To8(
  sequence: number,
): EducationV2P1ACycle5To8Program | undefined {
  return EDUCATION_V2_P1_A_CYCLE_5_8.find((cycle) => cycle.sequence === sequence);
}
