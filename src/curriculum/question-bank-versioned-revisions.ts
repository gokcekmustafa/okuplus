import type { ProgramQuestion } from "./education-v2-p0-program.js";
import {
  EDUCATION_V2_P0_PROGRAM,
  getProgramIds,
  questionVersionId as p0QuestionVersionId,
  templateVersionId as p0TemplateVersionId,
} from "./education-v2-p0-program.js";
import {
  EDUCATION_V2_P1_A_PROGRAM,
  p1AId,
  p1AQuestionVersionId,
  p1ATemplateVersionId,
} from "./education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_BCD_PROGRAMS,
  p1BCDId,
  p1BCDTemplateVersionId,
} from "./education-v2-p1-bcd-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  p1ACycleV2Id,
  p1ACycleV2QuestionVersionId,
  p1ACycleV2TemplateVersionId,
} from "./education-v2-p1-a-cycle-v2-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4,
  p1ACycle3Id,
  p1ACycle3QuestionVersionId,
  p1ACycle3TemplateVersionId,
} from "./education-v2-p1-a-cycle-3-program.js";
import type { MultipleChoiceQualityQuestion } from "./option-length-quality.js";

type QuestionPatch = Pick<ProgramQuestion, "options"> &
  Partial<Pick<ProgramQuestion, "prompt" | "explanation" | "hint">>;

export type QuestionBankRevisionCandidate = {
  key: string;
  status: "VERSIONED_REVISION_CANDIDATE";
  publicationApproved: false;
  editorialReviewStatus: "REVIEW_REQUIRED";
  baseProgramId: string;
  baseProgramVersion: number;
  revisionVersion: number;
  revisionKind?: "QUESTION_CONTENT" | "OPTION_ORDER_ONLY";
  questions: MultipleChoiceQualityQuestion[];
  changedQuestions: Array<{
    exerciseKey: string;
    questionKey: string;
    baseQuestionVersionId: string;
    questionVersionId: string;
    answerKeyChanged: boolean;
    answerKeyCorrectionReason?: string;
    question: ProgramQuestion;
  }>;
  templateVersions: Array<{
    exerciseKey: string;
    baseTemplateVersionId: string;
    templateVersionId: string;
    questionVersionIds: string[];
  }>;
};

export function assertQuestionOptionPermutation(
  questionKey: string,
  sourceOptions: readonly { id: string }[],
  patchedOptions: readonly { id: string }[],
): void {
  const sourceOptionIds = sourceOptions.map((option) => option.id).sort();
  const patchedOptionIds = patchedOptions.map((option) => option.id).sort();
  if (
    patchedOptionIds.length !== sourceOptionIds.length ||
    new Set(patchedOptions.map((option) => option.id)).size !== patchedOptionIds.length ||
    patchedOptionIds.some((optionId, index) => optionId !== sourceOptionIds[index])
  ) {
    throw new Error(
      `Soru revizyonu seçenek kimliklerinin tam bir permütasyonu olmalı: ${questionKey}`,
    );
  }
}

function buildCandidate(args: {
  key: string;
  programId: string;
  programVersion: number;
  revisionVersion: number;
  revisionKind?: "QUESTION_CONTENT" | "OPTION_ORDER_ONLY";
  exercises: readonly {
    key: string;
    contentKey: string;
    skillCode: string;
    questions: readonly ProgramQuestion[];
  }[];
  patches: Readonly<Record<string, QuestionPatch>>;
  answerKeyCorrectionReasons?: Readonly<Record<string, string>>;
  questionVersionId(exerciseKey: string, questionKey: string): string;
  templateVersionId(exerciseKey: string): string;
  nextQuestionVersionId(exerciseKey: string, questionKey: string, version: number): string;
  nextTemplateVersionId(exerciseKey: string, version: number): string;
}): QuestionBankRevisionCandidate {
  const changedQuestions: QuestionBankRevisionCandidate["changedQuestions"] = [];
  const templateVersions: QuestionBankRevisionCandidate["templateVersions"] = [];
  const questions: MultipleChoiceQualityQuestion[] = [];

  for (const exercise of args.exercises) {
    const patchedQuestions = exercise.questions.map((sourceQuestion) => {
      const patch = args.patches[sourceQuestion.key];
      if (patch)
        assertQuestionOptionPermutation(sourceQuestion.key, sourceQuestion.options, patch.options);
      const question = patch
        ? {
            ...sourceQuestion,
            ...patch,
            options: patch.options.map((replacement, index) => {
              const sourceOption = sourceQuestion.options.find(
                (candidate) => candidate.id === replacement.id,
              );
              if (!sourceOption) {
                throw new Error(
                  `Soru revizyonunda bilinmeyen seçenek kimliği: ${sourceQuestion.key}`,
                );
              }
              return { ...sourceOption, text: replacement.text, position: index + 1 };
            }),
          }
        : sourceQuestion;

      questions.push({
        key: question.key,
        prompt: question.prompt,
        contentKey: exercise.contentKey,
        skillCode: exercise.skillCode,
        options: question.options,
        correctOptionId: question.correctOptionId,
        editorialReviewStatus: "REVIEW_REQUIRED",
      });

      if (patch) {
        changedQuestions.push({
          exerciseKey: exercise.key,
          questionKey: question.key,
          baseQuestionVersionId: args.questionVersionId(exercise.key, question.key),
          questionVersionId: args.nextQuestionVersionId(
            exercise.key,
            question.key,
            args.revisionVersion,
          ),
          answerKeyChanged: question.correctOptionId !== sourceQuestion.correctOptionId,
          answerKeyCorrectionReason: args.answerKeyCorrectionReasons?.[question.key],
          question,
        });
      }
      return question;
    });

    if (patchedQuestions.some((question) => args.patches[question.key])) {
      templateVersions.push({
        exerciseKey: exercise.key,
        baseTemplateVersionId: args.templateVersionId(exercise.key),
        templateVersionId: args.nextTemplateVersionId(exercise.key, args.revisionVersion),
        questionVersionIds: patchedQuestions.map((question) =>
          args.patches[question.key]
            ? args.nextQuestionVersionId(exercise.key, question.key, args.revisionVersion)
            : args.questionVersionId(exercise.key, question.key),
        ),
      });
    }
  }

  return {
    key: args.key,
    status: "VERSIONED_REVISION_CANDIDATE",
    revisionKind: args.revisionKind ?? "QUESTION_CONTENT",
    publicationApproved: false,
    editorialReviewStatus: "REVIEW_REQUIRED",
    baseProgramId: args.programId,
    baseProgramVersion: args.programVersion,
    revisionVersion: args.revisionVersion,
    questions,
    changedQuestions,
    templateVersions,
  };
}

const cycle2Patches: Record<string, QuestionPatch> = {
  "p1a-v2-evidence-practice-2": {
    options: [
      { id: "a", text: "Okuyucunun deneyimiyle çelişmemesi", position: 1 },
      { id: "b", text: "Metindeki düşünceyi desteklemesi", position: 2 },
      { id: "c", text: "Metinde açıkça yer alması", position: 3 },
      { id: "d", text: "Okuyucunun önceden bilmesi", position: 4 },
    ],
  },
  "p1a-v2-structure-reinforcement-2": {
    options: [
      { id: "a", text: "Metnin konusu", position: 1 },
      { id: "b", text: "Metnin ana düşüncesi", position: 2 },
      { id: "c", text: "Yazarın görüşü", position: 3 },
      { id: "d", text: "Cümleler arası bağ", position: 4 },
    ],
  },
  "p1a-v2-transfer-practice-2": {
    options: [
      { id: "a", text: "Değirmenin işleyişini tek başına kavramayı", position: 1 },
      { id: "b", text: "İşleyişi ve yerel öyküleri birlikte anlamayı", position: 2 },
      { id: "c", text: "Kasabanın ulaşım ağı hakkında bilgi edinmeyi", position: 3 },
      { id: "d", text: "Ziyaretçilerin değirmeni çalıştırmayı öğrenmesini", position: 4 },
    ],
  },
  "p1a-v2-assessment-4": {
    options: [
      { id: "a", text: "Kişisel örneğe dayanarak açıklamak", position: 1 },
      { id: "b", text: "İlk cümleye bakıp karar vermek", position: 2 },
      { id: "c", text: "Dikkat çeken ifadeyi seçmek", position: 3 },
      { id: "d", text: "Sonucu metin kanıtına bağlamak", position: 4 },
    ],
  },
};

const cycle2 = EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM;
const cycle3 = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM;
const rainGarden = EDUCATION_V2_P1_A_CYCLE_3_RAIN_GARDEN_REVISION_V4;
const rainGardenPatches = Object.fromEntries(
  rainGarden.questions.map((question) => [question.key, question]),
);

const cycle3Patches: Record<string, QuestionPatch> = {
  ...rainGardenPatches,
  "p1a-v3-evidence-reinforcement-2": {
    options: [
      { id: "a", text: "Daha az karıştırmışlardır", position: 1 },
      { id: "b", text: "Sıraları daha sık karıştırmışlardır", position: 2 },
      { id: "c", text: "Prova süresi daha kısa olmuştur", position: 3 },
      { id: "d", text: "Çizgiler kalkmış, sıra değişmiştir", position: 4 },
    ],
  },
  "p1a-v3-assessment-1": {
    options: [
      { id: "a", text: "Eserler yeni salona taşınmıştır", position: 1 },
      { id: "b", text: "Ziyaretçiler açıklamasız sergiyi tamamlamıştır", position: 2 },
      { id: "c", text: "Doğru eşleştirme sayısı artmıştır", position: 3 },
      { id: "d", text: "Nesnelerin kullanım amacı değişmiştir", position: 4 },
    ],
  },
};

function balancedPositionPatches(
  exercises: readonly {
    questions: readonly ProgramQuestion[];
  }[],
): Record<string, QuestionPatch> {
  const patches: Record<string, QuestionPatch> = {};
  let questionIndex = 0;
  for (const exercise of exercises) {
    for (const question of exercise.questions) {
      const correct = question.options.find((option) => option.id === question.correctOptionId);
      if (!correct || question.options.length !== 4) {
        questionIndex += 1;
        continue;
      }
      const targetPosition = questionIndex % question.options.length;
      const currentPosition = question.options.findIndex(
        (option) => option.id === question.correctOptionId,
      );
      if (currentPosition !== targetPosition) {
        const remaining = question.options.filter(
          (option) => option.id !== question.correctOptionId,
        );
        remaining.splice(targetPosition, 0, correct);
        patches[question.key] = {
          options: remaining.map((option, index) => ({
            id: option.id,
            text: option.text,
            position: index + 1,
          })),
        };
      }
      questionIndex += 1;
    }
  }
  return patches;
}

const p0 = EDUCATION_V2_P0_PROGRAM;
const p1a = EDUCATION_V2_P1_A_PROGRAM;
const bcdInitialPrograms = EDUCATION_V2_P1_BCD_PROGRAMS.filter((program) => program.sequence === 1);

function positionOnlyCandidate(args: {
  key: string;
  programId: string;
  programVersion: number;
  exercises: readonly {
    key: string;
    contentKey: string;
    skillCode: string;
    questions: readonly ProgramQuestion[];
  }[];
  questionVersionId(exerciseKey: string, questionKey: string): string;
  templateVersionId(exerciseKey: string): string;
  nextQuestionVersionId(exerciseKey: string, questionKey: string): string;
  nextTemplateVersionId(exerciseKey: string): string;
}): QuestionBankRevisionCandidate {
  return buildCandidate({
    ...args,
    revisionVersion: args.programVersion + 1,
    revisionKind: "OPTION_ORDER_ONLY",
    patches: balancedPositionPatches(args.exercises),
    nextQuestionVersionId: args.nextQuestionVersionId,
    nextTemplateVersionId: args.nextTemplateVersionId,
  });
}

const cycle3AnswerKeyCorrections = {
  "p1a-v3-evidence-practice-1":
    "Eski kök genel yararı sorarken anahtar, toprağa geçen suyun bitkilere de ulaştığını ileri sürüyordu. Yeni sürüm metindeki açık süre bilgisini soruyor.",
  "p1a-v3-evidence-practice-2":
    "Eski doğru seçenek iki ayrı su bölümünü tek bir zincir gibi birleştiriyordu. Yeni seçenek toprağa geçen bölümle bitkileri besleyen bölümü ayırıyor.",
  "p1a-v3-evidence-practice-3":
    "Eski doğru seçenek yine aynı su bölümünün hem toprağa hem bitkilere ulaştığını ima ediyordu. Yeni seçenek metnin desteklediği iki ayrı katkıyı sınırlı biçimde özetliyor.",
} as const;

export const QUESTION_BANK_VERSIONED_REVISION_CANDIDATES: readonly QuestionBankRevisionCandidate[] =
  [
    positionOnlyCandidate({
      key: `${p0.programId}:answer-position-v2`,
      programId: p0.programId,
      programVersion: 1,
      exercises: p0.exercises,
      questionVersionId: p0QuestionVersionId,
      templateVersionId: p0TemplateVersionId,
      nextQuestionVersionId: (exerciseKey, questionKey) =>
        getProgramIds("questionVersion", `${exerciseKey}-${questionKey}-v2`),
      nextTemplateVersionId: (exerciseKey) => getProgramIds("templateVersion", `${exerciseKey}-v2`),
    }),
    positionOnlyCandidate({
      key: `${p1a.programId}:answer-position-v2`,
      programId: p1a.programId,
      programVersion: 1,
      exercises: p1a.exercises,
      questionVersionId: p1AQuestionVersionId,
      templateVersionId: p1ATemplateVersionId,
      nextQuestionVersionId: (exerciseKey, questionKey) =>
        p1AId("questionVersion", `${exerciseKey}-${questionKey}-v2`),
      nextTemplateVersionId: (exerciseKey) => p1AId("templateVersion", `${exerciseKey}-v2`),
    }),
    ...bcdInitialPrograms.map((program) =>
      positionOnlyCandidate({
        key: `${program.programId}:answer-position-v2`,
        programId: program.programId,
        programVersion: 1,
        exercises: program.exercises,
        questionVersionId: (exerciseKey, questionKey) =>
          p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v1`),
        templateVersionId: (exerciseKey) => p1BCDTemplateVersionId(program, exerciseKey),
        nextQuestionVersionId: (exerciseKey, questionKey) =>
          p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v2`),
        nextTemplateVersionId: (exerciseKey) =>
          p1BCDId(program, "templateVersion", `${exerciseKey}-v2`),
      }),
    ),
    buildCandidate({
      key: `${cycle2.programId}:question-balance-v3`,
      programId: cycle2.programId,
      programVersion: 2,
      revisionVersion: 3,
      exercises: cycle2.exercises,
      patches: cycle2Patches,
      questionVersionId: p1ACycleV2QuestionVersionId,
      templateVersionId: p1ACycleV2TemplateVersionId,
      nextQuestionVersionId: (exerciseKey, questionKey, version) =>
        p1ACycleV2Id("questionVersion", `${exerciseKey}-${questionKey}-v${version}`),
      nextTemplateVersionId: (exerciseKey, version) =>
        p1ACycleV2Id("templateVersion", `${exerciseKey}-v${version}`),
    }),
    buildCandidate({
      key: `${cycle3.programId}:question-balance-v4`,
      programId: cycle3.programId,
      programVersion: 3,
      revisionVersion: 4,
      exercises: cycle3.exercises,
      patches: cycle3Patches,
      answerKeyCorrectionReasons: cycle3AnswerKeyCorrections,
      questionVersionId: p1ACycle3QuestionVersionId,
      templateVersionId: p1ACycle3TemplateVersionId,
      nextQuestionVersionId: (exerciseKey, questionKey, version) =>
        p1ACycle3Id("questionVersion", `${exerciseKey}-${questionKey}-v${version}`),
      nextTemplateVersionId: (exerciseKey, version) =>
        p1ACycle3Id("templateVersion", `${exerciseKey}-v${version}`),
    }),
  ];
