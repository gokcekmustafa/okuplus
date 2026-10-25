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
  Partial<Pick<ProgramQuestion, "prompt" | "explanation" | "hint" | "correctOptionId">>;

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
  contents: readonly { key: string; body: string }[];
  patches: Readonly<Record<string, QuestionPatch>>;
  answerKeyCorrectionReasons?: Readonly<Record<string, string>>;
  questionVersionId(exerciseKey: string, questionKey: string): string;
  baseQuestionVersionStatus?(
    exerciseKey: string,
    questionKey: string,
  ): "SOURCE_CURRENT" | "REVISION_CANDIDATE";
  templateVersionId(exerciseKey: string): string;
  nextQuestionVersionId(exerciseKey: string, questionKey: string, version: number): string;
  nextTemplateVersionId(exerciseKey: string, version: number): string;
}): QuestionBankRevisionCandidate {
  const contentByKey = new Map(args.contents.map((content) => [content.key, content.body]));
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
        sourceQuestionId: `${args.programId}:${exercise.key}:${question.key}`,
        sourceVersionId: patch
          ? args.nextQuestionVersionId(exercise.key, question.key, args.revisionVersion)
          : args.questionVersionId(exercise.key, question.key),
        sourceVersionStatus: patch
          ? "REVISION_CANDIDATE"
          : (args.baseQuestionVersionStatus?.(exercise.key, question.key) ?? "SOURCE_CURRENT"),
        prompt: question.prompt,
        contentKey: exercise.contentKey,
        sourceText: contentByKey.get(exercise.contentKey),
        explanation: question.explanation,
        hint: question.hint,
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
  correctOptionIdOverrides: Readonly<Record<string, string>> = {},
): Record<string, QuestionPatch> {
  const patches: Record<string, QuestionPatch> = {};
  let questionIndex = 0;
  for (const exercise of exercises) {
    for (const question of exercise.questions) {
      const correctOptionId = correctOptionIdOverrides[question.key] ?? question.correctOptionId;
      const correct = question.options.find((option) => option.id === correctOptionId);
      if (!correct || question.options.length !== 4) {
        questionIndex += 1;
        continue;
      }
      const targetPosition = questionIndex % question.options.length;
      const currentPosition = question.options.findIndex((option) => option.id === correctOptionId);
      if (currentPosition !== targetPosition) {
        const remaining = question.options.filter((option) => option.id !== correctOptionId);
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
const p0CommonExerciseKeys = new Set(["common-reinforcement", "common-test"]);

function p0CurrentExerciseTemplateVersionId(exerciseKey: string): string {
  const versionKey = p0CommonExerciseKeys.has(exerciseKey)
    ? `${exerciseKey}-v1`
    : `${exerciseKey}-academic-v2`;
  return getProgramIds("templateVersion", versionKey);
}

function p0RevisionExerciseTemplateVersionId(exerciseKey: string, version: number): string {
  const versionKey = p0CommonExerciseKeys.has(exerciseKey)
    ? `${exerciseKey}-v${version}`
    : `${exerciseKey}-academic-v${version}`;
  return getProgramIds("templateVersion", versionKey);
}

const initialQuestionCorrections: Readonly<
  Record<string, Readonly<Record<string, QuestionPatch>>>
> = {
  [p0.programId]: {
    "fast-recognition-practice-1": {
      options: [
        { id: "a", text: "Sessizlik odaklanmayı desteklemiştir", position: 1 },
        { id: "b", text: "Öğrenciler kütüphaneden ayrılmıştır", position: 2 },
        { id: "c", text: "Kütüphane gürültülüydü", position: 3 },
        { id: "d", text: "Odaklanmanın nedeni belirtilmemiştir", position: 4 },
      ],
    },
    "fast-chunking-practice-1": {
      prompt:
        "‘Sessiz kütüphane köşesinde kitap okudu.’ cümlesinde eylemin gerçekleştiği yeri tam olarak veren ifade hangisidir?",
      options: [
        { id: "a", text: "sessiz kütüphane köşesinde", position: 1 },
        { id: "b", text: "kütüphane köşesindeki kitaplar", position: 2 },
        { id: "c", text: "sessiz biçimde kitap okudu", position: 3 },
        { id: "d", text: "kitap okumak için sessiz yer", position: 4 },
      ],
      explanation:
        "‘Sessiz kütüphane köşesinde’ eylemin nerede gerçekleştiğini, yer ekini de koruyarak bildirir.",
      hint: "Eylemin nerede gerçekleştiğini bildiren sözcükleri bul.",
    },
    "rc-main-idea-practice-1": {
      options: [
        { id: "a", text: "Metnin yalnızca ilginç bir ayrıntısını seçmek", position: 1 },
        { id: "b", text: "Ayrıntıların desteklediği temel düşünceyi seçmek", position: 2 },
        { id: "c", text: "Başlığı tek başına yanıt saymak", position: 3 },
        { id: "d", text: "Metinde bulunmayan kişisel yorumu kullanmak", position: 4 },
      ],
      explanation:
        "Ana fikir, metnin bütününe uyan ve birden çok ayrıntının desteklediği temel düşüncedir.",
    },
    "common-test-3": {
      options: [
        {
          id: "a",
          text: "Çıkarım metin kanıtıyla desteklenir; tahmin dayanmayabilir",
          position: 1,
        },
        { id: "b", text: "Tahmin de her zaman metin kanıtıyla desteklenir", position: 2 },
        { id: "c", text: "Çıkarım yalnızca başlıktaki tek ipucuna dayanır", position: 3 },
        { id: "d", text: "Çıkarımda kişisel bilgi metin kanıtından önce gelir", position: 4 },
      ],
      explanation:
        "Çıkarım metindeki kanıtlarla desteklenir; metin dayanağı olmayan yorum ise tahmin olabilir.",
    },
  },
  "OKU-EDUCATION-V2-P1-B-FLUENCY-MEANING": {
    "p1b-study-1": {
      prompt:
        "‘Kütüphane kapanmadan önce öğrenciler notlarını düzenledi.’ cümlesinde eylemin zamanını bildiren grup hangisidir?",
      options: [
        { id: "a", text: "Kapanmadan önce", position: 1 },
        { id: "b", text: "Öğrenciler notlarını", position: 2 },
        { id: "c", text: "Notlarını düzenledi", position: 3 },
        { id: "d", text: "Öğrenciler düzenledi", position: 4 },
      ],
      explanation: "‘Kapanmadan önce’ öğrencilerin notlarını ne zaman düzenlediğini bildirir.",
    },
    "p1b-study-2": {
      options: [
        { id: "a", text: "Herkesin metne yönelmesi", position: 1 },
        { id: "b", text: "Sessiz salonda", position: 2 },
        { id: "c", text: "Daha iyi odaklandı", position: 3 },
        { id: "d", text: "Metne daha iyi odaklandı", position: 4 },
      ],
    },
    "p1b-study-3": {
      options: [
        { id: "a", text: "Her kelimeyi ayrı ayrı ve aynı hızda okumak", position: 1 },
        { id: "b", text: "Cümlenin ilişkisini ve anlamını korumak", position: 2 },
        { id: "c", text: "Noktalama işaretlerinde durup anlam ilişkisini unutmak", position: 3 },
        { id: "d", text: "Yalnızca son sözcüğü akılda tutmaya çalışmak", position: 4 },
      ],
    },
    "p1b-practice-1": {
      options: [
        { id: "a", text: "Gölgeliklerin dinlenmeyi kolaylaştırması", position: 1 },
        { id: "b", text: "Öğle arasının her gün aynı saatte yapılması", position: 2 },
        { id: "c", text: "Bahçenin okul binasından uzakta bulunması", position: 3 },
        { id: "d", text: "Gölgeliklerin hava sıcaklığını tamamen düşürmesi", position: 4 },
      ],
    },
    "p1b-practice-2": {
      options: [
        { id: "a", text: "Her kelimenin anlamını ezberlemeye", position: 1 },
        { id: "b", text: "Kelime grupları arasındaki ilişkiye", position: 2 },
        { id: "c", text: "Noktalama işaretlerine bakmaya", position: 3 },
        { id: "d", text: "Metin dışı örnekle eşleştirmeye", position: 4 },
      ],
    },
    "p1b-reinforcement-1": {
      options: [
        { id: "a", text: "Dikilen fidanların bakımını anlatır", position: 1 },
        { id: "b", text: "Gönüllülerin ilk çalışmasını eleştirir", position: 2 },
        { id: "c", text: "Yağmurun parka nasıl ulaştığını açıklar", position: 3 },
        { id: "d", text: "Parkta başka bir etkinliğe geçildiğini söyler", position: 4 },
      ],
    },
    "p1b-reinforcement-2": {
      options: [
        { id: "a", text: "Cümleleri bağımsız parçalar gibi tek tek okumak", position: 1 },
        { id: "b", text: "Cümleler arasındaki ilişkiyi takip etmek", position: 2 },
        { id: "c", text: "Metnin sonundaki kelimeyi ezberlemeye çalışmak", position: 3 },
        { id: "d", text: "Süreyi kısaltırken anlam kontrolünü bırakmak", position: 4 },
      ],
    },
    "p1b-reinforcement-3": {
      options: [
        { id: "a", text: "Ayrıntıyı metinden bağımsız kabul etmek", position: 1 },
        { id: "b", text: "Ayrıntının cümledeki görevini kontrol etmek", position: 2 },
        { id: "c", text: "En uzun cevabı seçip soru metnini geçmek", position: 3 },
        { id: "d", text: "Cümleler arasındaki anlam ilişkisini göz ardı etmek", position: 4 },
      ],
    },
    "p1b-assessment-1": {
      options: [
        { id: "a", text: "Temizlikten sonra okuma alanı oluşturulması", position: 1 },
        { id: "b", text: "Kitaplık yerleştirilmeden önce alanın temizlenmesi", position: 2 },
        { id: "c", text: "Mahalle sakinlerinin kitapları çocuklara dağıtması", position: 3 },
        { id: "d", text: "Küçük kitaplığın mahalle dışına taşınması", position: 4 },
      ],
    },
    "p1b-assessment-3": {
      options: [
        { id: "a", text: "Daha hızlı okuyup geçmek", position: 1 },
        { id: "b", text: "Anlam grubunu yeniden okumak", position: 2 },
        { id: "c", text: "Anlamı kurmadan tahmin etmek", position: 3 },
        { id: "d", text: "Metin dışı bilgi eklemek", position: 4 },
      ],
    },
    "p1b-assessment-4": {
      options: [
        { id: "a", text: "Metnin ana anlamını açıklıyorsa", position: 1 },
        { id: "b", text: "En uzun cümlede yer alıyorsa", position: 2 },
        { id: "c", text: "İlk sözcükle aynı biçimde kullanılıyorsa", position: 3 },
        { id: "d", text: "Kişisel deneyimindeki bir örneğe uyuyorsa", position: 4 },
      ],
    },
  },
  "OKU-EDUCATION-V2-P1-C-INFERENCE-EVIDENCE": {
    "p1c-study-1": {
      options: [
        { id: "a", text: "Eksik kitapları not aldığı", position: 1 },
        { id: "b", text: "Kaynak listesini baştan yazdığı", position: 2 },
        { id: "c", text: "Sunumda bütün kitapları kullandığı", position: 3 },
        { id: "d", text: "Listedeki bütün kaynakları okuduğu", position: 4 },
      ],
      explanation:
        "Cümlede açıkça Ece'nin kaynak listesini kontrol ettiği ve eksik kitapları not aldığı belirtilir.",
    },
    "p1c-study-2": {
      options: [
        { id: "a", text: "Metindeki sonucu destekleyen açık bilgi", position: 1 },
        { id: "b", text: "Okurun kendi deneyiminden gelen kişisel anı", position: 2 },
        { id: "c", text: "Sonucu açıklamayan dikkat çekici ayrıntı", position: 3 },
        { id: "d", text: "Metinde geçmeyen ama doğru olabilecek bilgi", position: 4 },
      ],
    },
    "p1c-study-3": {
      options: [
        { id: "a", text: "Salonun o sırada bakıma kapalı olduğu", position: 1 },
        { id: "b", text: "Salonun her gün bakım nedeniyle kapalı kaldığı", position: 2 },
        { id: "c", text: "Sporcuların salonu kullanmayı tercih etmediği", position: 3 },
        { id: "d", text: "Bakım çalışmasının ne kadar süreceği", position: 4 },
      ],
    },
    "p1c-practice-1": {
      prompt:
        "‘Köydeki eski değirmen onarıldı. Ziyaretçiler artık içerideki mekanizmayı inceleyebiliyor.’ Bu iki bilgi birlikte, onarımın hangi amaca hizmet ettiğini düşündürür?",
      options: [
        {
          id: "a",
          text: "Değirmenin işleyişini ziyaretçilere görünür kılmaya",
          position: 1,
        },
        {
          id: "b",
          text: "Ziyaretçilerin değirmeni kendilerinin işletmesine",
          position: 2,
        },
        { id: "c", text: "Değirmenin yeniden üretime açıldığını göstermeye", position: 3 },
        { id: "d", text: "Yalnızca değirmenin dış cephesini yenilemeye", position: 4 },
      ],
      explanation:
        "Onarımın ardından ziyaretçilerin mekanizmayı inceleyebilmesi, iç işleyişin görünür kılındığını düşündürür; üretimin yeniden başladığı belirtilmez.",
    },
    "p1c-practice-2": {
      options: [
        { id: "a", text: "Çıkarım metin kanıtlarına dayanır", position: 1 },
        { id: "b", text: "Metin dışı tahminler çıkarımı güçlendirir", position: 2 },
        { id: "c", text: "Çıkarım yalnızca metinde doğrudan yazan bilgidir", position: 3 },
        { id: "d", text: "Tahmin metindeki her olasılığı kesinleştirir", position: 4 },
      ],
    },
    "p1c-reinforcement-1": {
      options: [
        { id: "a", text: "Kanıtla sonucu destekleyen bilgileri göstermek", position: 1 },
        { id: "b", text: "Sonuç için metinde bulunmayan kişisel örnekler eklemek", position: 2 },
        { id: "c", text: "Yalnızca son cümleye bakıp karar vermek", position: 3 },
        { id: "d", text: "En güçlü görünen seçeneği kanıt aramadan işaretlemek", position: 4 },
      ],
    },
    "p1c-reinforcement-2": {
      options: [
        { id: "a", text: "Metnin desteklediği sınırlı sonuç", position: 1 },
        { id: "b", text: "Olasılığı metinde kesin gerçek saymak", position: 2 },
        { id: "c", text: "Metin dışı bilgileri kanıt gibi eklemek", position: 3 },
        { id: "d", text: "En ayrıntılı seçeneği kanıt aramadan seçmek", position: 4 },
      ],
    },
    "p1c-assessment-1": {
      options: [
        { id: "a", text: "Teknoloji, tarihî karşılaştırmayı kolaylaştırıyor", position: 1 },
        {
          id: "b",
          text: "Haritaların ekrana aktarılması eski kopyaları ortadan kaldırdı",
          position: 2,
        },
        {
          id: "c",
          text: "Ziyaretçiler dijital haritalardaki bilgileri değiştirip kaydedebiliyor",
          position: 3,
        },
        { id: "d", text: "Müze tüm dönemlerin haritalarını tek ekranda topladı", position: 4 },
      ],
    },
    "p1c-assessment-3": {
      options: [
        { id: "a", text: "Bütün öğrencilerin dikkatli olduğu", position: 1 },
        { id: "b", text: "Dikkatlerinin artmış olabileceği", position: 2 },
        { id: "c", text: "Metnin yalnızca bir olasılıktan söz ettiği", position: 3 },
        { id: "d", text: "Sonucun kesin biçimde kanıtlanmadığı", position: 4 },
      ],
    },
  },
  "OKU-EDUCATION-V2-P1-D-VOCABULARY-CONTEXT": {
    "p1d-study-1": {
      options: [
        { id: "a", text: "Mevsime göre başka bölgeye gider", position: 1 },
        { id: "b", text: "Aynı yerde yuvasını değiştirir", position: 2 },
        { id: "c", text: "Soğukta bir süre hareketsiz kalır", position: 3 },
        { id: "d", text: "Besin için çevresinde dolaşır", position: 4 },
      ],
      explanation:
        "Bu cümlede ‘göç eder’, kuşların kışın daha sıcak bölgelere mevsimsel olarak gitmesini anlatır.",
    },
    "p1d-study-3": {
      options: [
        { id: "a", text: "Cümle çevresindeki kanıtları okumak", position: 1 },
        { id: "b", text: "İlk akla gelen anlamı bağlamı okumadan seçmek", position: 2 },
        { id: "c", text: "Sözcüğü cümleden ayırıp tek başına yorumlamak", position: 3 },
        { id: "d", text: "Yalnızca sözlükteki ilk anlamı doğru saymak", position: 4 },
      ],
    },
    "p1d-practice-2": {
      options: [
        { id: "a", text: "Canlıların korunabildiği yer", position: 1 },
        { id: "b", text: "Deniz canlılarının derinlerde yaşadığı bölüm", position: 2 },
        { id: "c", text: "Sazlıkları biçmek için kullanılan araç", position: 3 },
        { id: "d", text: "Kıyının yerleşimden uzak kalan kısmı", position: 4 },
      ],
    },
    "p1d-practice-3": {
      options: [
        { id: "a", text: "Konu ilişkilerini anlamaya yardım eder", position: 1 },
        { id: "b", text: "Her kelimeye bağlamdan bağımsız tek anlam yükler", position: 2 },
        { id: "c", text: "Metindeki cümle kanıtını gereksiz hâle getirir", position: 3 },
        { id: "d", text: "Sözcüğün anlamını kullanımından bağımsız değiştirir", position: 4 },
      ],
    },
    "p1d-reinforcement-1": {
      options: [
        { id: "a", text: "Cümlenin anlamını koruyan seçim", position: 1 },
        { id: "b", text: "Sözlükte ilk sırada yer alan anlam", position: 2 },
        { id: "c", text: "En uzun açıklamayı veren seçenek", position: 3 },
        { id: "d", text: "Kişisel deneyimle uyuşan tanıdık anlam", position: 4 },
      ],
    },
    "p1d-reinforcement-2": {
      options: [
        { id: "a", text: "Sürecin bir basamağı", position: 1 },
        { id: "b", text: "Süreçte kullanılan bir araç", position: 2 },
        { id: "c", text: "Üretim sonunda ortaya çıkan ürün", position: 3 },
        { id: "d", text: "Üretim sürecini yürüten kişi", position: 4 },
      ],
    },
    "p1d-reinforcement-3": {
      options: [
        { id: "a", text: "Kelime cümlede hangi bilgiyle ilişkili?", position: 1 },
        { id: "b", text: "Kelimenin metinde kaç kez tekrarlandığı?", position: 2 },
        { id: "c", text: "Kelimenin hangi sözlük maddesinde bulunduğu?", position: 3 },
        { id: "d", text: "Önceki metinlerde aynı kelimeyi görüp görmediğim?", position: 4 },
      ],
    },
    "p1d-assessment-1": {
      options: [
        { id: "a", text: "Yapının yükünü destekleyen", position: 1 },
        { id: "b", text: "Yapıyı başka bir yere taşıyan", position: 2 },
        { id: "c", text: "Yapının dış rengini değiştiren", position: 3 },
        { id: "d", text: "Kolonları yalnızca süsleyen", position: 4 },
      ],
    },
    "p1d-assessment-2": {
      options: [
        { id: "a", text: "Köklerin toprağa tutunması", position: 1 },
        { id: "b", text: "Fidanın yapraklarını dökmesi", position: 2 },
        { id: "c", text: "Fidanın yerinin değiştirilmesi", position: 3 },
        { id: "d", text: "Sulamaya son verilmesi", position: 4 },
      ],
    },
    "p1d-assessment-3": {
      options: [
        { id: "a", text: "Kanıtsız alan anlamını dayatmak", position: 1 },
        { id: "b", text: "Konu ilişkilerini incelemek", position: 2 },
        { id: "c", text: "Cümleyi bütünüyle okumak", position: 3 },
        { id: "d", text: "Yakın ifadelerle anlamı karşılaştırmak", position: 4 },
      ],
    },
    "p1d-assessment-4": {
      options: [
        { id: "a", text: "Anlam seçimi cümleyi açıklıyorsa", position: 1 },
        { id: "b", text: "Kelime sana tanıdık geliyorsa", position: 2 },
        { id: "c", text: "Sözlükteki en kısa tanımsa", position: 3 },
        { id: "d", text: "Başka metinde bu anlama geliyorsa", position: 4 },
      ],
    },
  },
};

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
  contents: readonly { key: string; body: string }[];
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

function questionQualityCandidate(args: {
  key: string;
  programId: string;
  programVersion: number;
  revisionVersion: number;
  exercises: readonly {
    key: string;
    contentKey: string;
    skillCode: string;
    questions: readonly ProgramQuestion[];
  }[];
  contents: readonly { key: string; body: string }[];
  questionVersionId(exerciseKey: string, questionKey: string): string;
  templateVersionId(exerciseKey: string): string;
  nextQuestionVersionId(exerciseKey: string, questionKey: string, version: number): string;
  nextTemplateVersionId(exerciseKey: string, version: number): string;
  contentPatches: Readonly<Record<string, QuestionPatch>>;
  answerKeyCorrectionReasons?: Readonly<Record<string, string>>;
  baseQuestionVersionStatus?(
    exerciseKey: string,
    questionKey: string,
  ): "SOURCE_CURRENT" | "REVISION_CANDIDATE";
}): QuestionBankRevisionCandidate {
  const correctOptionIdOverrides = Object.fromEntries(
    Object.entries(args.contentPatches).flatMap(([questionKey, patch]) =>
      patch.correctOptionId ? [[questionKey, patch.correctOptionId]] : [],
    ),
  );
  const positionPatches = balancedPositionPatches(args.exercises, correctOptionIdOverrides);
  const patches = { ...positionPatches };
  for (const [questionKey, contentPatch] of Object.entries(args.contentPatches)) {
    const baseQuestion = args.exercises
      .flatMap((exercise) => exercise.questions)
      .find((item) => item.key === questionKey);
    if (!baseQuestion) throw new Error(`Revizyon sorusu kaynak programda yok: ${questionKey}`);
    const positioned = positionPatches[questionKey]?.options ?? baseQuestion.options;
    const replacementTextById = new Map(
      contentPatch.options.map((option) => [option.id, option.text]),
    );
    patches[questionKey] = {
      ...contentPatch,
      options: positioned.map((option, index) => ({
        id: option.id,
        text: replacementTextById.get(option.id) ?? option.text,
        position: index + 1,
      })),
    };
  }
  return buildCandidate({
    ...args,
    revisionKind: "QUESTION_CONTENT",
    patches,
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

const p0QuestionQualityV3 = questionQualityCandidate({
  key: `${p0.programId}:question-quality-v3`,
  programId: p0.programId,
  programVersion: 1,
  revisionVersion: 3,
  exercises: p0.exercises,
  contents: p0.content,
  contentPatches: initialQuestionCorrections[p0.programId]!,
  questionVersionId: p0QuestionVersionId,
  templateVersionId: p0CurrentExerciseTemplateVersionId,
  nextQuestionVersionId: (exerciseKey, questionKey, version) =>
    getProgramIds("questionVersion", `${exerciseKey}-${questionKey}-v${version}`),
  nextTemplateVersionId: p0RevisionExerciseTemplateVersionId,
});

const p0V3QuestionByKey = new Map(
  p0QuestionQualityV3.changedQuestions.map((item) => [item.questionKey, item.question]),
);
const p0V3TemplateByExercise = new Map(
  p0QuestionQualityV3.templateVersions.map((item) => [item.exerciseKey, item.templateVersionId]),
);
const p0V3Exercises = p0.exercises.map((exercise) => ({
  ...exercise,
  questions: exercise.questions.map((question) => p0V3QuestionByKey.get(question.key) ?? question),
}));

const p0CompetencyTransferPatches: Readonly<Record<string, QuestionPatch>> = {
  "fast-attention-study-2": {
    prompt:
      "Okuma hedefin duyurudaki başlangıç saatini bulmak. Hangi cümle bu hedefe doğrudan kanıt verir?\n\n‘Kitap kulübü perşembe günü toplanacak. Buluşma saat 16.30’da başlayacak. Katılımcılar yanlarında bir kitap getirebilir.’",
    options: [
      { id: "a", text: "Kitap kulübü perşembe günü toplanacak.", position: 1 },
      { id: "b", text: "Buluşma saat 16.30’da başlayacak.", position: 2 },
      { id: "c", text: "Katılımcılar yanlarında kitap getirebilir.", position: 3 },
      { id: "d", text: "Duyuruda başlangıç saati verilmemiştir.", position: 4 },
    ],
    correctOptionId: "b",
    explanation:
      "Hedef başlangıç saatini bulmaktır; ikinci cümle saati doğrudan 16.30 olarak verir.",
    hint: "Önce aradığın bilgiyi belirle, sonra yalnızca o bilgiyi veren cümleyi bul.",
  },
  "fast-recognition-practice-1": {
    prompt:
      "‘Ece kütüphaneden atlası ödünç aldı ve cuma günü geri getirdi.’ cümlesinde ‘ödünç aldı’ ne anlama gelir?",
    options: [
      { id: "a", text: "Atlası satın alıp kendisine sakladı.", position: 1 },
      { id: "b", text: "Atlası bir süre kullanıp geri verdi.", position: 2 },
      { id: "c", text: "Atlası kütüphaneye bağışladı.", position: 3 },
      { id: "d", text: "Atlası daha sonra almak üzere ayırttı.", position: 4 },
    ],
    correctOptionId: "b",
    explanation:
      "Cuma günü geri getirmesi, atlası kalıcı olarak almadığını; bir süre kullanmak için aldığını gösterir.",
    hint: "‘Geri getirdi’ ayrıntısı, atlasın nasıl alındığını anlamana yardım eder.",
  },
  "fast-recognition-practice-2": {
    prompt:
      "‘Konser salonunun kapısı aralıktı; koridordan müzik sesi duyuluyordu.’ cümlesinde ‘aralıktı’ sözcüğü nasıl bir kapıyı anlatır?",
    options: [
      { id: "a", text: "Tamamen açık bir kapıyı.", position: 1 },
      { id: "b", text: "Kapalı ama kilitlenmemiş bir kapıyı.", position: 2 },
      { id: "c", text: "Bir miktar açık, tam kapanmamış bir kapıyı.", position: 3 },
      { id: "d", text: "Kapalı ve kilitli bir kapıyı.", position: 4 },
    ],
    correctOptionId: "c",
    explanation:
      "‘Aralık’ kapı tam kapalı değildir; cümledeki koridora yayılan ses de bunu destekler.",
    hint: "Kapının tamamen kapalı mı, yoksa biraz açık mı olduğunu düşün.",
  },
  "rc-main-idea-practice-1": {
    prompt:
      "Metin: Mahalledeki kitap paylaşım rafına herkes okuyup bitirdiği kitapları bırakabiliyor. Rafı kullananlar kitapların yanına kısa öneriler de yazıyor. Böylece okurlar yeni kitapları birbirlerinin önerileriyle seçebiliyor.\n\nMetnin ana düşüncesi hangisidir?",
    options: [
      { id: "a", text: "Raf yalnızca kitapların saklanması için kullanılır.", position: 1 },
      {
        id: "b",
        text: "Paylaşım rafı, okurların kitap ve öneri alışverişi yapmasını sağlar.",
        position: 2,
      },
      { id: "c", text: "Mahalledeki herkes aynı kitabı okumayı seçer.", position: 3 },
      { id: "d", text: "Kitap önerileri yalnızca kütüphane görevlilerinden alınır.", position: 4 },
    ],
    explanation:
      "Kitap bırakılması ve öneri yazılması, okurların birbirine kitap seçimi konusunda destek olduğunu gösterir.",
    hint: "Kitap bırakma ve öneri yazma ayrıntılarını birlikte kapsayan düşünceyi ara.",
  },
  "rc-main-idea-practice-2": {
    prompt:
      "Metin: Okulun bahçesindeki küçük yağmur ölçeri her sabah kontrol ediliyor. Öğrenciler ölçümü çizelgeye yazıyor ve haftanın sonunda değerleri karşılaştırıyor. Böylece yağışın günlere göre nasıl değiştiğini izleyebiliyorlar.\n\nMetnin ana düşüncesi hangisidir?",
    options: [
      { id: "a", text: "Ölçümler yalnızca haftanın son günü yapılır.", position: 1 },
      { id: "b", text: "Çizelge yağmurun ne zaman yağacağını kesin bildirir.", position: 2 },
      { id: "c", text: "Günlük ölçümler yağış değişimini izlemeye yardım eder.", position: 3 },
      { id: "d", text: "Öğrenciler yağmur ölçerini bahçeden kaldırmıştır.", position: 4 },
    ],
    correctOptionId: "c",
    explanation:
      "Sabah ölçümlerinin çizelgeye yazılıp karşılaştırılması, yağışın günlere göre değişimini izlemeyi sağlar.",
    hint: "Günlük ölçüm ve hafta sonundaki karşılaştırmanın ortak amacını bul.",
  },
  "rc-detail-study-1": {
    prompt:
      "Metin: Kent müzesindeki gönüllüler eski fotoğrafları tarih sırasına göre dizdi. Her fotoğrafın yanına çekildiği yıl ve yeri yazan bir kart koydular. Ziyaretçiler böylece aynı sokağın farklı yıllardaki görünümünü karşılaştırabiliyor.\n\nFotoğraf kartlarında hangi iki bilgi bulunuyor?",
    options: [
      { id: "a", text: "Fotoğrafı çeken kişinin adı ve çekim yılı.", position: 1 },
      { id: "b", text: "Fotoğrafın çekildiği yıl ve çekildiği yer.", position: 2 },
      { id: "c", text: "Fotoğrafın çekildiği mevsim ve gün.", position: 3 },
      { id: "d", text: "Fotoğrafı müzeye getiren kişinin adı.", position: 4 },
    ],
    explanation: "İkinci cümle kartlarda yıl ve yer bilgisinin bulunduğunu açıkça söylüyor.",
    hint: "Fotoğrafın yanındaki kartta yazan bilgileri bul.",
  },
  "rc-detail-study-2": {
    prompt:
      "Metin: Spor salonunda yeni bir su sebili kuruldu. Görevli, sebilin girişten sonra sağdaki duvarın yanında olduğunu belirtti. Öğrenciler matara doldurmak için bu noktayı kullanıyor.\n\nSu sebili nerede bulunuyor?",
    options: [
      { id: "a", text: "Girişten sonra sağ duvarın yanı.", position: 1 },
      { id: "b", text: "Girişten sonra sol duvarın yanında.", position: 2 },
      { id: "c", text: "Girişten önce sağ duvarın yanında.", position: 3 },
      { id: "d", text: "Girişten sonra sağ duvarın karşısında.", position: 4 },
    ],
    explanation: "Görevlinin verdiği konum, girişten sonra sağdaki duvarın yanıdır.",
    hint: "Konumu tarif eden cümleye dön.",
  },
  "rc-inference-practice-1": {
    prompt:
      "Metin: Atölye kapısında ‘Bugün içeride çalışma var’ yazısı asılıydı. Koridordan aralıklı çekiç sesleri geliyordu.\n\nBu iki ayrıntıdan hangi sınırlı sonuca ulaşılabilir?",
    options: [
      { id: "a", text: "Atölyede o sırada bir çalışma yapılıyor olabilir.", position: 1 },
      { id: "b", text: "Atölye bütün hafta kapalı kalacaktır.", position: 2 },
      { id: "c", text: "Çalışmayı yapan kişi kesinlikle öğretmendir.", position: 3 },
      { id: "d", text: "Atölyede yeni bir bina kurulmaktadır.", position: 4 },
    ],
    correctOptionId: "a",
    explanation:
      "Kapıdaki yazı ve içeriden gelen ses birlikte çalışma yapıldığı sonucunu destekler; çalışmanın süresi veya kimin yaptığı belli değildir.",
    hint: "Yalnızca yazı ve sesin birlikte desteklediği sonucu seç.",
  },
  "rc-inference-practice-2": {
    prompt:
      "Metin: Gezi grubunun listesinde dört öğrenci adı vardı. Rehber, müze girişinde dört bilet ayırdığını söyledi.\n\nBu iki ayrıntı hangi sonucu destekler?",
    options: [
      { id: "a", text: "Listedeki öğrencilerin tamamı müzeyi daha önce gezdi.", position: 1 },
      { id: "b", text: "Grubun dört öğrenciden oluşması bekleniyor.", position: 2 },
      { id: "c", text: "Rehber listedeki öğrencilerin hepsini tanıyor.", position: 3 },
      { id: "d", text: "Müze o gün yalnızca bu gruba açık olacak.", position: 4 },
    ],
    correctOptionId: "b",
    explanation:
      "Dört isim ve dört ayrılmış bilet, dört öğrencinin grupta olmasının beklendiğini destekler; başka bilgiler çıkarılamaz.",
    hint: "İsim sayısı ile ayrılan bilet sayısını karşılaştır.",
  },
  "common-test-1": {
    prompt:
      "Metin: Okul girişindeki paylaşım rafına öğrenciler bitirdikleri kitapları bırakıyor. Rafı alanlar kısa öneri notları ekleyebiliyor. Görevli, hangi öğrencinin hangi kitabı bitirdiğini kaydetmiyor.\n\nMetnin ana düşüncesi hangisidir?",
    options: [
      {
        id: "a",
        text: "Paylaşım köşesi kitapları buluşturuyor; bitirme bilgisi izlenmiyor.",
        position: 1,
      },
      {
        id: "b",
        text: "Köşe kitapları topluyor; öğretmen bitirme durumunu kayda geçiriyor.",
        position: 2,
      },
      {
        id: "c",
        text: "İki haftalık sayılar, kitapların kimlerce tamamlandığını gösteriyor.",
        position: 3,
      },
      {
        id: "d",
        text: "Rafı gören sınıflar kitapları yalnızca ödünç almak için bırakıyor.",
        position: 4,
      },
    ],
    explanation:
      "Raf kitapların paylaşılmasını ve öneri notlarını sağlıyor; görevli ise kimin hangi kitabı bitirdiğini kaydetmiyor.",
    hint: "Rafın ne işe yaradığını ve görevlinin hangi bilgiyi kaydetmediğini birlikte düşün.",
  },
  "common-test-2": {
    prompt:
      "Metin: Robotik kulübü karton prototipleri saydı. İlk hafta dört model hazırlanmıştı. Sonraki hafta öğrenciler altı yeni model daha yaptı.\n\nSonraki hafta kaç yeni model hazırlandı?",
    options: [
      { id: "a", text: "Dört model.", position: 1 },
      { id: "b", text: "Altı model.", position: 2 },
      { id: "c", text: "On model.", position: 3 },
      { id: "d", text: "Sayı metinde verilmemiştir.", position: 4 },
    ],
    correctOptionId: "b",
    explanation: "Metnin son cümlesi sonraki hafta altı yeni model yapıldığını söylüyor.",
    hint: "İlk haftadaki sayıyı değil, sonraki haftayı anlatan cümleyi bul.",
  },
  "common-test-3": {
    prompt:
      "Metin: Tiyatro kulübünün prova listesinde beş öğrenci adı vardı. Sorumlu, prova odasına beş sandalye hazırladığını söyledi.\n\nBu iki ayrıntı hangi sınırlı çıkarımı destekler?",
    options: [
      { id: "a", text: "Prova için beş öğrencinin gelmesi bekleniyor.", position: 1 },
      { id: "b", text: "Listedeki herkes bütün provalara katılmıştır.", position: 2 },
      { id: "c", text: "Sorumlu listedeki öğrencilerin hepsini tanıyor.", position: 3 },
      { id: "d", text: "O gün odaya yalnızca bu beş kişi girebilir.", position: 4 },
    ],
    explanation:
      "Beş isim ve beş sandalye, beş öğrencinin prova için beklendiğini destekler; katılım veya başka kişilerin girişi hakkında bilgi vermez.",
    hint: "İsim sayısıyla hazırlanan sandalyeleri karşılaştır; metnin söylemediği ayrıntıları ekleme.",
  },
  "common-test-4": {
    prompt:
      "Metin: Masa tenisi turnuvasının ilk gününde altı maç oynandı. İkinci gün dört maç daha yapıldı. Duyuruda finalin cuma günü yapılacağı yazıyordu. Sonuç tablosunda oyuncu adları yer almadığından kazanan belirtilmiyordu.\n\nHangi bilgi metinden çıkarılamaz?",
    options: [
      { id: "a", text: "İlk gün altı maç oynandığı.", position: 1 },
      { id: "b", text: "İkinci gün dört maç yapıldığı.", position: 2 },
      { id: "c", text: "Turnuvayı hangi oyuncunun kazandığı.", position: 3 },
      { id: "d", text: "Finalin cuma günü yapılacağı.", position: 4 },
    ],
    correctOptionId: "c",
    explanation:
      "Metin maç sayılarını ve final gününü veriyor; sonuç tablosunda oyuncu adları bulunmadığı için kazananı belirtmiyor.",
    hint: "Verilen maç sayılarını ve final gününü, özellikle belirtilmeyen sonuç bilgisiyle karşılaştır.",
  },
};

const p0CompetencyTransferCandidate = questionQualityCandidate({
  key: `${p0.programId}:competency-transfer-v4`,
  programId: p0.programId,
  programVersion: 1,
  revisionVersion: 4,
  exercises: p0V3Exercises,
  contents: p0.content,
  contentPatches: p0CompetencyTransferPatches,
  answerKeyCorrectionReasons: {
    "fast-attention-study-2":
      "Yeni kök başlangıç saatini soruyor; doğru seçenek, duyuruda başlangıç saatini açıkça veren cümle olmalıdır.",
    "fast-recognition-practice-1":
      "Yeni kök ‘ödünç aldı’ sözcüğünü soruyor; geri getirme ayrıntısı geçici kullanımı doğrular.",
    "fast-recognition-practice-2":
      "Yeni kök ‘aralıktı’ sözcüğünün anlamını soruyor; doğru seçenek kapının tam kapanmamış olduğunu belirtir.",
    "rc-main-idea-practice-2":
      "Yeni metinde günlük ölçümlerin çizelgeyle karşılaştırılması yağış değişimini izlemeyi destekler.",
    "rc-inference-practice-1":
      "Kapıdaki duyuru ve içeriden gelen ses, atölyede o sırada çalışma olabileceği sonucunu sınırlarıyla destekler.",
    "rc-inference-practice-2":
      "Dört öğrenci adı ve dört ayrılmış bilet, dört öğrencinin beklendiği sonucunu destekler.",
    "common-test-2":
      "Yeni kök ikinci haftadaki yeni kitap sayısını soruyor; metindeki sayı dokuzdur.",
    "common-test-4":
      "Metin bitirme durumunun takip edilmediğini söylediğinden, kitapları kimin bitirdiği çıkarılamaz.",
  },
  questionVersionId: (exerciseKey, questionKey) =>
    p0QuestionQualityV3.changedQuestions.find((item) => item.questionKey === questionKey)
      ?.questionVersionId ?? p0QuestionVersionId(exerciseKey, questionKey),
  templateVersionId: (exerciseKey) =>
    p0V3TemplateByExercise.get(exerciseKey) ?? p0CurrentExerciseTemplateVersionId(exerciseKey),
  nextQuestionVersionId: (exerciseKey, questionKey, version) =>
    getProgramIds("questionVersion", `${exerciseKey}-${questionKey}-v${version}`),
  nextTemplateVersionId: p0RevisionExerciseTemplateVersionId,
  baseQuestionVersionStatus: (_exerciseKey, questionKey) =>
    p0QuestionQualityV3.changedQuestions.some((item) => item.questionKey === questionKey)
      ? "REVISION_CANDIDATE"
      : "SOURCE_CURRENT",
});

export const QUESTION_BANK_VERSIONED_REVISION_CANDIDATES: readonly QuestionBankRevisionCandidate[] =
  [
    positionOnlyCandidate({
      key: `${p0.programId}:answer-position-v2`,
      programId: p0.programId,
      programVersion: 1,
      exercises: p0.exercises,
      contents: p0.content,
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
      contents: p1a.content,
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
        contents: program.content,
        questionVersionId: (exerciseKey, questionKey) =>
          p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v1`),
        templateVersionId: (exerciseKey) => p1BCDTemplateVersionId(program, exerciseKey),
        nextQuestionVersionId: (exerciseKey, questionKey) =>
          p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v2`),
        nextTemplateVersionId: (exerciseKey) =>
          p1BCDId(program, "templateVersion", `${exerciseKey}-v2`),
      }),
    ),
    p0QuestionQualityV3,
    p0CompetencyTransferCandidate,
    ...bcdInitialPrograms.map((program) =>
      questionQualityCandidate({
        key: `${program.programId}:question-quality-v3`,
        programId: program.programId,
        programVersion: 1,
        revisionVersion: 3,
        exercises: program.exercises,
        contents: program.content,
        contentPatches: initialQuestionCorrections[program.programId]!,
        questionVersionId: (exerciseKey, questionKey) =>
          p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v1`),
        templateVersionId: (exerciseKey) => p1BCDTemplateVersionId(program, exerciseKey),
        nextQuestionVersionId: (exerciseKey, questionKey, version) =>
          p1BCDId(program, "questionVersion", `${exerciseKey}-${questionKey}-v${version}`),
        nextTemplateVersionId: (exerciseKey, version) =>
          p1BCDId(program, "templateVersion", `${exerciseKey}-v${version}`),
      }),
    ),
    buildCandidate({
      key: `${cycle2.programId}:question-balance-v3`,
      programId: cycle2.programId,
      programVersion: 2,
      revisionVersion: 3,
      exercises: cycle2.exercises,
      contents: cycle2.content,
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
      contents: cycle3.content,
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
