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
import { getEducationV2P1ExpansionDraftCycle } from "./education-v2-p1-800-draft-cycles.js";

export const EDUCATION_V2_P1_A_CYCLE_4_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-4";
export const EDUCATION_V2_P1_A_CYCLE_4_VERSION = 4;
export const EDUCATION_V2_P1_A_CYCLE_4_SEQUENCE = 4;
export const EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE =
  "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12";
export const EDUCATION_V2_P1_A_CYCLE_4_AGE_BAND = "13–17";
export const EDUCATION_V2_P1_A_CYCLE_4_COMPLETION_SCORE = 0.75;
const CYCLE_4_PREFIX = "edu-v2-p1-a-cycle-4";

export function p1ACycle4Id(
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
  return `${CYCLE_4_PREFIX}-${kind}-${key}`;
}

export const p1ACycle4ContentVersionId = (key: string) =>
  p1ACycle4Id("contentVersion", `${key}-v4`);
export const p1ACycle4TemplateId = (key: string) => p1ACycle4Id("template", key);
export const p1ACycle4TemplateVersionId = (key: string) =>
  p1ACycle4Id("templateVersion", `${key}-v4`);
export const p1ACycle4QuestionId = (exerciseKey: string, questionKey: string) =>
  p1ACycle4Id("question", `${exerciseKey}-${questionKey}`);
export const p1ACycle4QuestionVersionId = (exerciseKey: string, questionKey: string) =>
  p1ACycle4Id("questionVersion", `${exerciseKey}-${questionKey}-v4`);
export const p1ACycle4AssessmentId = (key: string) => p1ACycle4Id("assessment", `${key}-v4`);

const sourceCycle = getEducationV2P1ExpansionDraftCycle("A", EDUCATION_V2_P1_A_CYCLE_4_SEQUENCE);
if (!sourceCycle || sourceCycle.pathCode !== EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE) {
  throw new Error("Cycle 4 kaynak taslağı bulunamadı veya rota kodu uyuşmuyor.");
}
if (sourceCycle.sourceStations.length !== 5) {
  throw new Error("Cycle 4 için tam olarak beş kaynak istasyon gerekli.");
}

export const EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE = sourceCycle;

const supportedSkillCodes = new Set([
  "FAST_ATTENTION",
  "FAST_RECOGNITION",
  "FAST_CHUNKING",
  "RC_MAIN_IDEA",
  "RC_DETAIL",
  "RC_INFERENCE",
]);

const familyBySkill = {
  FAST_ATTENTION: "ATTENTION_BURST",
  FAST_RECOGNITION: "RAPID_RECOGNITION",
  FAST_CHUNKING: "PHRASE_CHUNKING",
  RC_MAIN_IDEA: "MAIN_IDEA",
  RC_DETAIL: "DETAIL_EVIDENCE",
  RC_INFERENCE: "INFERENCE",
} as const satisfies Record<
  (typeof supportedSkillCodes extends Set<infer T> ? T : never) & string,
  TrainingExerciseVersionConfig["family"]
>;

const rendererBySkill = {
  FAST_ATTENTION: FAST_READING_RENDERERS.ATTENTION_BURST,
  FAST_RECOGNITION: FAST_READING_RENDERERS.RAPID_RECOGNITION,
  FAST_CHUNKING: FAST_READING_RENDERERS.PHRASE_CHUNKING,
  RC_MAIN_IDEA: "QUESTION_MULTIPLE_CHOICE",
  RC_DETAIL: "QUESTION_MULTIPLE_CHOICE",
  RC_INFERENCE: "QUESTION_MULTIPLE_CHOICE",
} as const;

const difficultyCode = (difficulty: number): TrainingExerciseVersionConfig["difficulty"] =>
  difficulty >= 4 ? "CHALLENGING" : difficulty >= 3 ? "DEVELOPING" : "FOUNDATION";

const difficultyNumber = (difficulty: string): number =>
  difficulty === "ADVANCED" ? 4 : difficulty === "INTERMEDIATE" ? 3 : 2;

const templateTypeByCategory = {
  FAST_READING: "FLUENCY",
  READING_COMPREHENSION: "COMPREHENSION",
  COMMON_STRATEGIES: "MIXED",
  INTEGRATED_PRACTICE: "MIXED",
  MULTI_SKILL_ASSESSMENT: "MIXED",
} as const satisfies Record<
  (typeof sourceCycle.authoredStationCategories)[number],
  ProgramExercise["templateType"]
>;

function makeContract(
  title: string,
  skillCode: keyof typeof familyBySkill,
  difficulty: TrainingExerciseVersionConfig["difficulty"],
  instructions: string,
): TrainingExerciseVersionConfig {
  return parseTrainingExerciseVersionConfig({
    schemaVersion: 1,
    family: familyBySkill[skillCode],
    competency: skillCode,
    difficulty,
    estimatedDurationSeconds: 180,
    instructions,
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: timeRoleForTrainingFamily(familyBySkill[skillCode]),
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
    rendererKey: rendererBySkill[skillCode],
    settings: { optionCount: 4, mobileLayout: "STACKED", title },
  });
}

const content: ProgramContent[] = sourceCycle.sourceStations.map((station) => {
  const skillCode = station.skillCodes.find((candidate) => supportedSkillCodes.has(candidate));
  if (!skillCode) {
    throw new Error(`Cycle 4 içeriği için desteklenen skill bulunamadı: ${station.key}`);
  }
  return {
    key: station.key,
    title: station.textTitle,
    body: station.text,
    difficulty: difficultyNumber(station.difficulty),
    skillCode,
  };
});

const exercises: ProgramExercise[] = sourceCycle.sourceStations.map((station, index) => {
  const contentItem = content[index];
  const skillCode = contentItem?.skillCode;
  if (!contentItem || !skillCode || !supportedSkillCodes.has(skillCode)) {
    throw new Error(`Cycle 4 alıştırma bağlantısı geçersiz: ${station.key}`);
  }
  const typedSkill = skillCode as keyof typeof familyBySkill;
  const difficulty = difficultyCode(contentItem.difficulty);
  const questions: ProgramQuestion[] = station.questions.map((item) => ({
    key: item.key,
    prompt: item.prompt,
    options: item.options,
    correctOptionId: item.correctOptionId,
    explanation: item.explanation,
    hint: item.hint,
    difficulty: contentItem.difficulty,
  }));
  return {
    key: station.key,
    title: station.title,
    templateType: templateTypeByCategory[station.category],
    contentKey: contentItem.key,
    skillCode,
    contract: makeContract(station.title, typedSkill, difficulty, station.outcome),
    questions,
  };
});

const assessmentKey = `${sourceCycle.sourceStations[4]!.key}-assessment`;
const stepList: P1APathStep[] = sourceCycle.sourceStations.map((station, index) => {
  const prerequisiteStepKeys = station.prerequisiteKey ? [station.prerequisiteKey] : undefined;
  if (index === sourceCycle.sourceStations.length - 1) {
    return {
      key: station.key,
      title: station.title,
      type: "ASSESSMENT",
      assessmentKey,
      learningOutcomeKeys: [station.key],
      ...(prerequisiteStepKeys ? { prerequisiteStepKeys } : {}),
      completionRule: { minimumScore: EDUCATION_V2_P1_A_CYCLE_4_COMPLETION_SCORE },
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
  programId: EDUCATION_V2_P1_A_CYCLE_4_ID,
  ageBand: EDUCATION_V2_P1_A_CYCLE_4_AGE_BAND,
  content,
  exercises,
  assessments: [
    {
      key: assessmentKey,
      title: "P1-A Cycle 4 · Kanıtı ve anlam ilişkilerini değerlendir",
      templateExerciseKey: sourceCycle.sourceStations[4]!.key,
      questionKeys: sourceCycle.sourceStations[4]!.questions.map((question) => question.key),
      config: {
        questionCount: 3,
        minimumScorableCount: 3,
        minimumAnsweredCount: 3,
        completionMinimumScore: EDUCATION_V2_P1_A_CYCLE_4_COMPLETION_SCORE,
      },
    },
  ],
  path: {
    code: sourceCycle.pathCode,
    title: sourceCycle.title,
    area: "READING_COMPREHENSION",
    units: [
      {
        key: sourceCycle.units[0]!.code,
        code: sourceCycle.units[0]!.code,
        title: "Kanıt ve anlam ilişkisi",
        position: 1,
        steps: stepList,
      },
    ],
  },
};

export const EDUCATION_V2_P1_A_CYCLE_4_PROGRAM = program;
