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
import { assessMultipleChoicePackageQuality } from "./option-length-quality.js";

/**
 * P1-B/C/D are authored as separate, pre-built route packages. Their
 * existence does not make them automatically selectable: route-selection.ts
 * still requires the matching official measurement contract.
 */
export type P1BCDRouteFamily = "B" | "C" | "D";

export const EDUCATION_V2_P1_BCD_LEARNING_OUTCOMES = {
  B: {
    key: "P1B_FLUENCY_MEANING",
    statement: "Anlam gruplarını izleyerek okuma akışını ve metin anlamını birlikte korur.",
    targetSkillCodes: ["FAST_RECOGNITION", "FAST_CHUNKING", "RC_DETAIL"],
  },
  C: {
    key: "P1C_INFERENCE_EVIDENCE",
    statement: "Çıkarımı, metinsel kanıtı ve kanıt ile sonuç arasındaki ilişkiyi ayırt eder.",
    targetSkillCodes: ["RC_DETAIL", "RC_INFERENCE"],
  },
  D: {
    key: "P1D_VOCABULARY_CONTEXT",
    statement: "Bir sözcüğün anlamını bağlam, sözcük ilişkisi ve alan bilgisiyle açıklar.",
    targetSkillCodes: ["RC_DETAIL"],
  },
} as const;

export type P1BCDPathStep = {
  key: string;
  title: string;
  type: "TEACHING" | "SMALL_STUDY" | "PRACTICE" | "REINFORCEMENT" | "ASSESSMENT";
  learningOutcomeKeys: string[];
  contentKey?: string;
  exerciseKey?: string;
  assessmentKey?: string;
  prerequisiteStepKeys?: string[];
};

export type P1BCDProgram = {
  programId: string;
  routeFamily: P1BCDRouteFamily;
  cycleVersion: number;
  sequence: number;
  publicationApproved: boolean;
  editorialReviewStatus?: "REVIEW_REQUIRED" | "VERIFIED";
  learningOutcome: {
    key: string;
    statement: string;
    targetSkillCodes: readonly string[];
  };
  editorialProvenance?: {
    contentOrigin: "ORIGINAL_FICTION";
    factualClaimPolicy: "NO_EXTERNAL_FACTUAL_CLAIMS";
    curriculumReferences: readonly {
      name: string;
      url: string;
      verifiedAt: string;
      supports: string;
    }[];
    languageReference: {
      name: string;
      url: string;
      verifiedAt: string;
      supports: string;
    };
  };
  ageBand: string;
  content: ProgramContent[];
  exercises: ProgramExercise[];
  assessments: Array<{
    key: string;
    title: string;
    templateExerciseKey: string;
    questionKeys: string[];
    config: {
      questionCount: number;
      minimumScorableCount: number;
      minimumAnsweredCount: number;
    };
  }>;
  path: {
    code: string;
    title: string;
    area: "READING_COMPREHENSION";
    units: Array<{
      key: string;
      code: string;
      title: string;
      position: number;
      steps: P1BCDPathStep[];
    }>;
  };
};

const option = (id: string, text: string, position: number) => ({ id, text, position });

function question(
  key: string,
  prompt: string,
  options: Array<[string, string]>,
  correctOptionId: string,
  explanation: string,
  hint: string,
  difficulty: number,
): ProgramQuestion {
  return {
    key,
    prompt,
    options: options.map(([id, text], index) => option(id, text, index + 1)),
    correctOptionId,
    explanation,
    hint,
    difficulty,
  };
}

function exerciseContract(
  title: string,
  family: "COMPREHENSION" | "FLUENCY" | "INFERENCE" | "MIXED",
  competency: string,
  instructions: string,
): TrainingExerciseVersionConfig {
  const contractFamily: TrainingExerciseVersionConfig["family"] =
    family === "FLUENCY"
      ? competency === "FAST_RECOGNITION"
        ? "RAPID_RECOGNITION"
        : "PHRASE_CHUNKING"
      : family === "INFERENCE"
        ? "INFERENCE"
        : family === "MIXED"
          ? "DETAIL_EVIDENCE"
          : "DETAIL_EVIDENCE";
  return parseTrainingExerciseVersionConfig({
    schemaVersion: 1,
    family: contractFamily,
    competency,
    difficulty: "DEVELOPING",
    estimatedDurationSeconds: 180,
    instructions,
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: timeRoleForTrainingFamily(contractFamily),
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
    rendererKey:
      contractFamily in FAST_READING_RENDERERS
        ? FAST_READING_RENDERERS[contractFamily as keyof typeof FAST_READING_RENDERERS]
        : "QUESTION_MULTIPLE_CHOICE",
    settings: { optionCount: 4, mobileLayout: "STACKED", title },
  });
}

type RouteSpec = {
  family: P1BCDRouteFamily;
  cycleVersion?: number;
  sequence?: number;
  stepPrefix?: string;
  publicationApproved?: boolean;
  editorialReviewStatus?: P1BCDProgram["editorialReviewStatus"];
  learningOutcome?: P1BCDProgram["learningOutcome"];
  editorialProvenance?: P1BCDProgram["editorialProvenance"];
  programId: string;
  pathCode: string;
  title: string;
  unitCode: string;
  unitTitle: string;
  teach: ProgramContent;
  study: ProgramContent;
  practice: ProgramContent;
  reinforcement: ProgramContent;
  assessment: ProgramContent;
  studyExercise: ProgramExercise;
  practiceExercise: ProgramExercise;
  reinforcementExercise: ProgramExercise;
  assessmentExercise: ProgramExercise;
};

function makeProgram(spec: RouteSpec): P1BCDProgram {
  const content = [spec.teach, spec.study, spec.practice, spec.reinforcement, spec.assessment];
  const exercises = [
    spec.studyExercise,
    spec.practiceExercise,
    spec.reinforcementExercise,
    spec.assessmentExercise,
  ];
  const stepPrefix = spec.stepPrefix ?? spec.family.toLowerCase();
  const assessmentKey = `${stepPrefix}-assessment`;
  const teachKey = `${stepPrefix}-teach`;
  const studyKey = `${stepPrefix}-study`;
  const practiceKey = `${stepPrefix}-practice`;
  const reinforcementKey = `${stepPrefix}-reinforcement`;
  const learningOutcomeKey = (
    spec.learningOutcome ?? EDUCATION_V2_P1_BCD_LEARNING_OUTCOMES[spec.family]
  ).key;
  return {
    programId: spec.programId,
    routeFamily: spec.family,
    cycleVersion: spec.cycleVersion ?? 1,
    sequence: spec.sequence ?? 1,
    publicationApproved: spec.publicationApproved ?? (spec.sequence ?? 1) === 1,
    ...(spec.editorialReviewStatus
      ? { editorialReviewStatus: spec.editorialReviewStatus }
      : (spec.sequence ?? 1) > 1
        ? { editorialReviewStatus: "REVIEW_REQUIRED" as const }
        : {}),
    learningOutcome: spec.learningOutcome ?? EDUCATION_V2_P1_BCD_LEARNING_OUTCOMES[spec.family],
    ...(spec.editorialProvenance ? { editorialProvenance: spec.editorialProvenance } : {}),
    ageBand: "13–17",
    content,
    exercises,
    assessments: [
      {
        key: assessmentKey,
        title: spec.assessment.title,
        templateExerciseKey: spec.assessmentExercise.key,
        questionKeys: spec.assessmentExercise.questions.map((item) => item.key),
        config: {
          questionCount: spec.assessmentExercise.questions.length,
          minimumScorableCount: spec.assessmentExercise.questions.length,
          minimumAnsweredCount: spec.assessmentExercise.questions.length,
        },
      },
    ],
    path: {
      code: spec.pathCode,
      title: spec.title,
      area: "READING_COMPREHENSION",
      units: [
        {
          key: `${spec.family.toLowerCase()}-unit`,
          code: spec.unitCode,
          title: spec.unitTitle,
          position: 1,
          steps: [
            {
              key: teachKey,
              title: spec.teach.title,
              type: "TEACHING",
              learningOutcomeKeys: [learningOutcomeKey],
              contentKey: spec.teach.key,
            },
            {
              key: studyKey,
              title: spec.study.title,
              type: "SMALL_STUDY",
              learningOutcomeKeys: [learningOutcomeKey],
              contentKey: spec.study.key,
              exerciseKey: spec.studyExercise.key,
              prerequisiteStepKeys: [teachKey],
            },
            {
              key: practiceKey,
              title: spec.practice.title,
              type: "PRACTICE",
              learningOutcomeKeys: [learningOutcomeKey],
              contentKey: spec.practice.key,
              exerciseKey: spec.practiceExercise.key,
              prerequisiteStepKeys: [studyKey],
            },
            {
              key: reinforcementKey,
              title: spec.reinforcement.title,
              type: "REINFORCEMENT",
              learningOutcomeKeys: [learningOutcomeKey],
              contentKey: spec.reinforcement.key,
              exerciseKey: spec.reinforcementExercise.key,
              prerequisiteStepKeys: [practiceKey],
            },
            {
              key: `${spec.family.toLowerCase()}-assessment-step`,
              title: spec.assessment.title,
              type: "ASSESSMENT",
              learningOutcomeKeys: [learningOutcomeKey],
              assessmentKey,
              prerequisiteStepKeys: [reinforcementKey],
            },
          ],
        },
      ],
    },
  };
}

const bQuestion = (
  key: string,
  prompt: string,
  options: Array<[string, string]>,
  correct: string,
  explanation: string,
  hint: string,
  difficulty = 2.5,
) => question(key, prompt, options, correct, explanation, hint, difficulty);

const cQuestion = (
  key: string,
  prompt: string,
  options: Array<[string, string]>,
  correct: string,
  explanation: string,
  hint: string,
  difficulty = 2.5,
) => question(key, prompt, options, correct, explanation, hint, difficulty);

const dQuestion = (
  key: string,
  prompt: string,
  options: Array<[string, string]>,
  correct: string,
  explanation: string,
  hint: string,
  difficulty = 2.5,
) => question(key, prompt, options, correct, explanation, hint, difficulty);

export const EDUCATION_V2_P1_BCD_PROGRAMS: readonly P1BCDProgram[] = [
  makeProgram({
    family: "B",
    programId: "OKU-EDUCATION-V2-P1-B-FLUENCY-MEANING",
    pathCode: "EDUCATION_V2_P1_B_FLUENCY_MEANING_G8_12",
    title: "P1-B · Akıcılık ve Anlam",
    unitCode: "P1_B_FLUENCY_MEANING",
    unitTitle: "Akıcı okuyup anlamı koru",
    teach: {
      key: "p1b-teach",
      title: "Akışı anlamla birlikte kur",
      difficulty: 2,
      skillCode: "FAST_RECOGNITION",
      body: "Akıcı okumak yalnızca hızlı ilerlemek değildir. Gözün anlam taşıyan kelime gruplarını fark ederken cümlenin anlamını korur. Kısa duraklarda cümlenin ne söylediğini kendine sor; anlam kopuyorsa hızını azaltıp ilişkiyi yeniden kur.",
      lesson: {
        objective: "Okuma akışını korurken cümle anlamını kaybetmemek.",
        explanation:
          "Anlamlı kelime gruplarını birlikte görmek, her kelimede durmadan cümlenin görevini izlemeyi sağlar.",
        workedExample:
          "‘Yağmur dinince çocuklar bahçeye çıktı.’ cümlesinde ‘yağmur dinince’ bir koşul grubudur; onu ‘çocuklar bahçeye çıktı’ sonucuyla birlikte okumak anlamı korur.",
        guidedPractice:
          "Bir sonraki çalışmada cümleyi anlam gruplarına ayır ve her grubun cümledeki görevini kontrol et.",
        nextExerciseKey: "p1b-study",
      },
    },
    study: {
      key: "p1b-study",
      title: "Anlam gruplarını fark et",
      difficulty: 2,
      skillCode: "FAST_CHUNKING",
      body: "Cümlede birlikte anlam taşıyan kelimeleri grupla; sonra grubun cümlenin anlamına nasıl katkı verdiğini söyle.",
    },
    practice: {
      key: "p1b-practice",
      title: "Akışı bozmadan anlamı bul",
      difficulty: 2.5,
      skillCode: "RC_DETAIL",
      body: "Yeni bir metinde anlam taşıyan grupları izleyerek önemli ayrıntıyı ve cümlenin yönünü belirle.",
    },
    reinforcement: {
      key: "p1b-reinforcement",
      title: "Akıcılık ve anlamı birlikte pekiştir",
      difficulty: 2.5,
      skillCode: "RC_DETAIL",
      body: "Okuma akışını, doğru ayrıntıyı ve metnin anlamını tek bir kısa metin üzerinde birlikte kontrol et.",
    },
    assessment: {
      key: "p1b-assessment",
      title: "Akıcılık ve anlam kontrolü",
      difficulty: 3,
      skillCode: "RC_DETAIL",
      body: "Yeni metinlerde anlam gruplarını izleyerek doğru ayrıntıyı seç ve metnin anlamını koruduğunu göster.",
    },
    studyExercise: {
      key: "p1b-study",
      title: "Anlam gruplarını eşleştir",
      templateType: "FLUENCY",
      contentKey: "p1b-study",
      skillCode: "FAST_CHUNKING",
      contract: exerciseContract(
        "Anlam gruplarını eşleştir",
        "FLUENCY",
        "FAST_CHUNKING",
        "Cümlede birlikte anlam taşıyan grupları fark et.",
      ),
      questions: [
        bQuestion(
          "p1b-study-1",
          "‘Kütüphane kapanmadan önce öğrenciler notlarını düzenledi.’ cümlesinde koşulu bildiren grup hangisidir?",
          [
            ["a", "Kapanmadan önce"],
            ["b", "öğrenciler"],
            ["c", "notlarını"],
            ["d", "düzenledi"],
          ],
          "a",
          "İlk grup eylemin hangi zamana bağlı olduğunu bildirir.",
          "Eylemin ne zamana bağlı olduğunu sor.",
        ),
        bQuestion(
          "p1b-study-2",
          "‘Sessiz salonda herkes metne daha iyi odaklandı.’ cümlesinde anlamı taşıyan yer bildiren grup hangisidir?",
          [
            ["a", "herkes"],
            ["b", "sessiz salonda"],
            ["c", "daha iyi"],
            ["d", "odaklandı"],
          ],
          "b",
          "‘Sessiz salonda’ eylemin gerçekleştiği yeri ve ortamı açıklar.",
          "Eylem nerede gerçekleşiyor?",
        ),
        bQuestion(
          "p1b-study-3",
          "Anlam gruplarını birlikte okumanın temel yararı nedir?",
          [
            ["a", "Cümleyi rastgele hızlandırmak"],
            ["b", "Cümlenin ilişkisini ve anlamını korumak"],
            ["c", "Her kelimede durmak"],
            ["d", "Yalnızca son kelimeyi hatırlamak"],
          ],
          "b",
          "Gruplar arasındaki ilişki cümlenin anlamını taşır.",
          "Cümlenin parçaları nasıl bağlanıyor?",
        ),
      ],
    },
    practiceExercise: {
      key: "p1b-practice",
      title: "Akışı bozmadan ayrıntıyı bul",
      templateType: "COMPREHENSION",
      contentKey: "p1b-practice",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Akışı bozmadan ayrıntıyı bul",
        "COMPREHENSION",
        "RC_DETAIL",
        "Akıcı okurken metnin anlamını destekleyen ayrıntıyı seç.",
      ),
      questions: [
        bQuestion(
          "p1b-practice-1",
          "‘Okul, öğle arasında bahçeye gölgelikler kurdu. Böylece öğrenciler sıcak günlerde dışarıda daha rahat dinlenebildi.’ Bu metni destekleyen ayrıntı hangisidir?",
          [
            ["a", "Gölgeliklerin dinlenmeyi kolaylaştırması"],
            ["b", "Öğle arasının her gün aynı sürede yapılması"],
            ["c", "Bahçenin okul binasından uzakta bulunması"],
            ["d", "Sıcak günlerin okulda hiç yaşanmaması"],
          ],
          "a",
          "İkinci cümle gölgeliklerin öğrenci dinlenmesine katkısını açıklar.",
          "‘Böylece’den sonra hangi sonuç geliyor?",
        ),
        bQuestion(
          "p1b-practice-2",
          "Bir cümleyi anlamını bozmadan okurken ilk olarak neye dikkat edilir?",
          [
            ["a", "Her kelimeyi ayrı ayrı ezberlemeye"],
            ["b", "Kelime grupları arasındaki ilişkiye"],
            ["c", "Yalnızca noktalama sayısına"],
            ["d", "Metin dışı bir örneğe"],
          ],
          "b",
          "İlişkiyi görmek akıcı okumayı anlamdan koparmaz.",
          "Cümlenin hangi parçaları birlikte görev yapıyor?",
        ),
        bQuestion(
          "p1b-practice-3",
          "‘Tren geciktiği için toplantı çevrim içi yapıldı.’ cümlesinde anlam akışı hangi ilişkiyle kurulmuştur?",
          [
            ["a", "Neden-sonuç"],
            ["b", "Tanımlama"],
            ["c", "Karşılaştırma"],
            ["d", "Sıralama"],
          ],
          "a",
          "Gecikme neden, çevrim içi toplantı sonuçtur.",
          "‘İçin’ sözcüğünün iki tarafını karşılaştır.",
        ),
      ],
    },
    reinforcementExercise: {
      key: "p1b-reinforcement",
      title: "Anlam akışını kontrol et",
      templateType: "MIXED",
      contentKey: "p1b-reinforcement",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Anlam akışını kontrol et",
        "MIXED",
        "RC_DETAIL",
        "Okuma akışını ve metin anlamını birlikte kontrol et.",
      ),
      questions: [
        bQuestion(
          "p1b-reinforcement-1",
          "‘Gönüllüler parkta fidan dikti. Yağmurdan sonra fidanların çevresindeki toprak yeniden düzeltildi.’ İkinci cümle ilk cümleye nasıl bağlanır?",
          [
            ["a", "Bakım çalışmasını açıklar"],
            ["b", "İlk cümleyi reddeder"],
            ["c", "Yeni bir konuya geçer"],
            ["d", "Kişisel görüş ekler"],
          ],
          "a",
          "İkinci cümle dikilen fidanların bakımını anlatır.",
          "İkinci cümle fidanlarla ilgili hangi işi sürdürüyor?",
        ),
        bQuestion(
          "p1b-reinforcement-2",
          "Akıcı okumada anlamın korunduğunu gösteren davranış hangisidir?",
          [
            ["a", "Metnin her kelimesinde durmak"],
            ["b", "Cümleler arasındaki ilişkiyi takip etmek"],
            ["c", "Soruyu okumadan cevaplamak"],
            ["d", "Yalnızca hızlı bitirmeye çalışmak"],
          ],
          "b",
          "Akış, ilişkileri ve anlamı takip ettiğinde işlevlidir.",
          "Hız ile anlam arasında hangi denge gerekiyor?",
        ),
        bQuestion(
          "p1b-reinforcement-3",
          "Bir ayrıntı metnin anlamına uymuyorsa ne yapılmalıdır?",
          [
            ["a", "Ayrıntıyı metinden bağımsız kabul etmek"],
            ["b", "Ayrıntının cümledeki görevini kontrol etmek"],
            ["c", "En uzun cevabı seçmek"],
            ["d", "Metni okumayı bırakmak"],
          ],
          "b",
          "Görevi yeniden kontrol etmek yanlış eşleşmeyi düzeltir.",
          "Ayrıntı metnin hangi düşüncesini destekliyor?",
        ),
      ],
    },
    assessmentExercise: {
      key: "p1b-assessment",
      title: "Akıcılık ve anlamı kontrol et",
      templateType: "MIXED",
      contentKey: "p1b-assessment",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Akıcılık ve anlamı kontrol et",
        "MIXED",
        "RC_DETAIL",
        "Yeni metinde anlam akışını ve önemli ayrıntıyı birlikte değerlendir.",
      ),
      questions: [
        bQuestion(
          "p1b-assessment-1",
          "‘Mahalle sakinleri kullanılmayan alanı temizledi. Ardından buraya çocukların okuyabileceği küçük bir kitaplık yerleştirdiler.’ Metnin anlam akışı hangisidir?",
          [
            ["a", "Temizlikten sonra okuma alanı oluşturulması"],
            ["b", "Kitaplığın alandan önce kaldırılması"],
            ["c", "Çocukların mahalleden ayrılması"],
            ["d", "Temizliğin ertelenmesi"],
          ],
          "a",
          "‘Ardından’ ilk çalışmanın sonrasındaki düzenlemeyi gösterir.",
          "İkinci iş ilk işten sonra mı geliyor?",
          3,
        ),
        bQuestion(
          "p1b-assessment-2",
          "Aynı metinde ‘buraya’ sözcüğü neyi gösterir?",
          [
            ["a", "Temizlenen alanı"],
            ["b", "Başka bir mahalleyi"],
            ["c", "Çocukların evini"],
            ["d", "Kitaplığın içini"],
          ],
          "a",
          "Sözcük önceki cümledeki alana gönderme yapar.",
          "Gönderme yapılan yeri bir önceki cümlede ara.",
          3,
        ),
        bQuestion(
          "p1b-assessment-3",
          "Akıcı okuma sırasında bir cümlenin anlamı kaybolursa en uygun yaklaşım nedir?",
          [
            ["a", "Daha da hızlanmak"],
            ["b", "Anlam grubunu yeniden okumak"],
            ["c", "Cevabı tahmin etmek"],
            ["d", "Metin dışı bilgi eklemek"],
          ],
          "b",
          "Anlamı yeniden kurmak doğru akışı sağlar.",
          "Cümlenin hangi parçası ilişkiyi taşıyor?",
          3,
        ),
        bQuestion(
          "p1b-assessment-4",
          "Bir metin ayrıntısının önemli olduğunu nasıl anlarsın?",
          [
            ["a", "Metnin ana anlamını açıklıyorsa"],
            ["b", "En uzun cümlede geçiyorsa"],
            ["c", "İlk kelimeyle aynıysa"],
            ["d", "Kişisel deneyime uyuyorsa"],
          ],
          "a",
          "Önemli ayrıntı metnin anlamını destekler.",
          "Ayrıntı bütün metni anlamana yardım ediyor mu?",
          3,
        ),
      ],
    },
  }),
  makeProgram({
    family: "C",
    programId: "OKU-EDUCATION-V2-P1-C-INFERENCE-EVIDENCE",
    pathCode: "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_G8_12",
    title: "P1-C · Çıkarım ve Kanıt",
    unitCode: "P1_C_INFERENCE_EVIDENCE",
    unitTitle: "Kanıttan güvenilir sonuca",
    teach: {
      key: "p1c-teach",
      title: "Çıkarımın sınırını belirle",
      difficulty: 2,
      skillCode: "RC_INFERENCE",
      body: "Çıkarım, metinde doğrudan yazmayan ama birden fazla bilgi birlikte düşünüldüğünde zorunlu olarak çıkan sınırlı sonuçtur. Metin dışı tahmin ekleme; sonucunu hangi cümlelerin desteklediğini göster.",
      lesson: {
        objective: "Metin kanıtlarından metnin desteklediği sınırlı bir sonuç çıkarmak.",
        explanation:
          "Güvenilir çıkarım, metindeki açık bilgileri birbirine bağlar; okuyucunun kişisel varsayımına dayanmaz.",
        workedExample:
          "‘Deniz, toplantı notlarını düzenledi ve eksik başlıkları tamamladı.’ cümlelerinden Deniz'in notları kullanıma hazırladığı çıkarılabilir; onun toplantıyı yönettiği çıkarılamaz.",
        guidedPractice:
          "Bir sonraki çalışmada önce metindeki iki kanıtı işaretle, sonra yalnızca bu kanıtların zorunlu kıldığı sonucu seç.",
        nextExerciseKey: "p1c-study",
      },
    },
    study: {
      key: "p1c-study",
      title: "Metinsel kanıtı bul",
      difficulty: 2,
      skillCode: "RC_DETAIL",
      body: "Bir sonucu destekleyen açık bilgileri bul ve kanıt olmayan kişisel yorumları ayır.",
    },
    practice: {
      key: "p1c-practice",
      title: "Kanıtı sonuçla ilişkilendir",
      difficulty: 2.5,
      skillCode: "RC_INFERENCE",
      body: "İki veya daha fazla metin bilgisini birleştirerek desteklenen sonucu seç.",
    },
    reinforcement: {
      key: "p1c-reinforcement",
      title: "Çıkarım zincirini pekiştir",
      difficulty: 2.5,
      skillCode: "RC_INFERENCE",
      body: "Kanıt, ara düşünce ve sonucu aynı metin üzerinde yeniden kur.",
    },
    assessment: {
      key: "p1c-assessment",
      title: "Çıkarım ve kanıt kontrolü",
      difficulty: 3,
      skillCode: "RC_INFERENCE",
      body: "Yeni metinlerde kanıtı bul, kanıt ile sonucu ilişkilendir ve desteklenmeyen tahmini ayır.",
    },
    studyExercise: {
      key: "p1c-study",
      title: "Kanıtı metinden bul",
      templateType: "COMPREHENSION",
      contentKey: "p1c-study",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Kanıtı metinden bul",
        "COMPREHENSION",
        "RC_DETAIL",
        "Çıkarımı destekleyen açık metin bilgisini bul.",
      ),
      questions: [
        cQuestion(
          "p1c-study-1",
          "‘Ece, sunumdan önce kaynak listesini kontrol etti ve eksik kitapları not aldı.’ Ece'nin ne yaptığı kesin olarak söylenebilir?",
          [
            ["a", "Kaynaklarını düzenlediği"],
            ["b", "Bütün kitapları okuduğu"],
            ["c", "Sunumu tek başına yaptığı"],
            ["d", "Kaynak listesini yazdığı"],
          ],
          "a",
          "İki eylem kaynakları kontrol edip düzenlediğini gösterir.",
          "İki eylem hangi ortak amaca hizmet ediyor?",
        ),
        cQuestion(
          "p1c-study-2",
          "Bir metinsel kanıtı seçerken hangisi aranır?",
          [
            ["a", "Sonucu destekleyen açık bilgi"],
            ["b", "Okuyucunun kişisel anısı"],
            ["c", "En şaşırtıcı ayrıntı"],
            ["d", "Metinde hiç geçmeyen bilgi"],
          ],
          "a",
          "Kanıt metinde bulunmalı ve sonucu desteklemelidir.",
          "Seçimin metinde nerede görülüyor?",
        ),
        cQuestion(
          "p1c-study-3",
          "‘Spor salonunda ışıklar kapalıydı, kapıda da ‘bakım var’ yazısı bulunuyordu.’ Hangi sonuç metin tarafından desteklenir?",
          [
            ["a", "Salonun o sırada bakıma kapalı olduğu"],
            ["b", "Salonun her gün kapalı olduğu"],
            ["c", "Sporcuların salonu sevmediği"],
            ["d", "Bakımın ne kadar sürdüğü"],
          ],
          "a",
          "İki bilgi salonun o sırada kullanılamadığını destekler.",
          "İki işaret aynı durumu mu gösteriyor?",
        ),
      ],
    },
    practiceExercise: {
      key: "p1c-practice",
      title: "Kanıt ve sonucu eşleştir",
      templateType: "INFERENCE",
      contentKey: "p1c-practice",
      skillCode: "RC_INFERENCE",
      contract: exerciseContract(
        "Kanıt ve sonucu eşleştir",
        "INFERENCE",
        "RC_INFERENCE",
        "Kanıtların birlikte desteklediği sınırlı sonucu seç.",
      ),
      questions: [
        cQuestion(
          "p1c-practice-1",
          "‘Köydeki eski değirmen onarıldı. Ziyaretçiler artık içerideki mekanizmayı inceleyebiliyor.’ Hangi çıkarım desteklenir?",
          [
            ["a", "Değirmen korunmuş ve ziyaretçilere açılmıştır"],
            ["b", "Değirmeni yalnızca köylüler kullanır"],
            ["c", "Değirmen daha önce hiç çalışmamıştır"],
            ["d", "Ziyaretçiler değirmeni satın almıştır"],
          ],
          "a",
          "Onarım ve ziyaretçilerin inceleyebilmesi birlikte korunma ve açıklamayı gösterir.",
          "İki cümleyi birlikte açıklayan sonucu ara.",
        ),
        cQuestion(
          "p1c-practice-2",
          "Bir çıkarım ile tahmin arasındaki temel fark nedir?",
          [
            ["a", "Çıkarım metin kanıtlarına dayanır"],
            ["b", "Tahmin her zaman daha doğrudur"],
            ["c", "Çıkarım metni dikkate almaz"],
            ["d", "Tahmin mutlaka metinde yazılıdır"],
          ],
          "a",
          "Çıkarımın dayanağı metindeki ilişkilerdir.",
          "Sonucun dayanağı nerede bulunuyor?",
        ),
        cQuestion(
          "p1c-practice-3",
          "‘Öğrenciler deney sonuçlarını tabloya geçirdi ve sonuçları farklı gruplarla karşılaştırdı.’ Bu davranış hangi amacı destekler?",
          [
            ["a", "Sonuçları değerlendirmek"],
            ["b", "Deneyi hiç yapmamak"],
            ["c", "Tabloyu süslemek"],
            ["d", "Grupları çalışmadan ayırmak"],
          ],
          "a",
          "Tabloya geçirmek ve karşılaştırmak değerlendirme amacını gösterir.",
          "İki eylemden ortak amacı çıkar.",
        ),
      ],
    },
    reinforcementExercise: {
      key: "p1c-reinforcement",
      title: "Çıkarım zincirini kur",
      templateType: "INFERENCE",
      contentKey: "p1c-reinforcement",
      skillCode: "RC_INFERENCE",
      contract: exerciseContract(
        "Çıkarım zincirini kur",
        "INFERENCE",
        "RC_INFERENCE",
        "Kanıtı, bağlantıyı ve sonucu birlikte kontrol et.",
      ),
      questions: [
        cQuestion(
          "p1c-reinforcement-1",
          "Kanıt ile sonuç arasındaki ilişkiyi kontrol etmek için ne yapılır?",
          [
            ["a", "Sonucu destekleyen bilgiler gösterilir"],
            ["b", "Sonuca kişisel örnek eklenir"],
            ["c", "Yalnızca son cümle okunur"],
            ["d", "En güçlü görünen seçenek seçilir"],
          ],
          "a",
          "İlişki kanıtlarla açıklanmalıdır.",
          "Sonucu metindeki hangi bilgiler zorunlu kılıyor?",
        ),
        cQuestion(
          "p1c-reinforcement-2",
          "Metin yalnızca bir olasılığı söylüyorsa hangi seçim güvenlidir?",
          [
            ["a", "Metnin desteklediği sınırlı sonuç"],
            ["b", "Olasılığı kesin gerçek saymak"],
            ["c", "Metin dışı bilgiyi eklemek"],
            ["d", "En ayrıntılı seçeneği seçmek"],
          ],
          "a",
          "Çıkarım metnin sınırını aşmamalıdır.",
          "Metin neyi kesin olarak söylüyor?",
        ),
        cQuestion(
          "p1c-reinforcement-3",
          "Bir seçenekte doğru bir bilgi olsa bile neden yanlış olabilir?",
          [
            ["a", "Sorulan sonucu desteklemeyebilir"],
            ["b", "Metinde bulunduğu için"],
            ["c", "Kısa olduğu için"],
            ["d", "Birden fazla cümle olduğu için"],
          ],
          "a",
          "Bilginin metinde bulunması, sorulan sonucu desteklediği anlamına gelmez.",
          "Bilgi sorudaki sonucu açıklıyor mu?",
        ),
      ],
    },
    assessmentExercise: {
      key: "p1c-assessment",
      title: "Çıkarım ve kanıtı kontrol et",
      templateType: "INFERENCE",
      contentKey: "p1c-assessment",
      skillCode: "RC_INFERENCE",
      contract: exerciseContract(
        "Çıkarım ve kanıtı kontrol et",
        "INFERENCE",
        "RC_INFERENCE",
        "Yeni metinde kanıt ile sonucu ilişkilendir.",
      ),
      questions: [
        cQuestion(
          "p1c-assessment-1",
          "‘Müze, eski haritaları dijital ekrana aktardı. Ziyaretçiler haritaları büyüterek farklı dönemleri karşılaştırabiliyor.’ Hangi çıkarım desteklenir?",
          [
            ["a", "Teknoloji, tarihî karşılaştırmayı kolaylaştırıyor"],
            ["b", "Haritalar artık sergilenmiyor"],
            ["c", "Ziyaretçiler haritaları değiştirebiliyor"],
            ["d", "Müze yalnızca dijital ekranlardan oluşuyor"],
          ],
          "a",
          "Dijital aktarım ve karşılaştırma olanağı birlikte bu sonucu destekler.",
          "İki cümledeki ortak işlevi bul.",
          3,
        ),
        cQuestion(
          "p1c-assessment-2",
          "Aynı metinde hangi bilgi sonucu doğrudan destekler?",
          [
            ["a", "Haritaları büyütüp dönemleri karşılaştırabilmek"],
            ["b", "Müzenin tarihî bir binada bulunması"],
            ["c", "Ekranların ziyaretçiler tarafından büyük görülmesi"],
            ["d", "Ziyaretçilerin müzeye farklı günlerde gelmesi"],
          ],
          "a",
          "Karşılaştırma olanağı teknoloji ile öğrenme arasındaki bağı gösterir.",
          "Sonucu açıklayan eylemi ara.",
          3,
        ),
        cQuestion(
          "p1c-assessment-3",
          "Metin ‘öğrenciler daha dikkatli olabilir’ diyorsa hangi ifade metnin sınırını aşar?",
          [
            ["a", "Bütün öğrencilerin dikkatli olduğu"],
            ["b", "Dikkatin artabileceği"],
            ["c", "Metnin bir olasılık belirttiği"],
            ["d", "Sonucun kesin olmadığı"],
          ],
          "a",
          "Olasılığı kesinliğe çevirmek kanıtsız bir genişletmedir.",
          "‘Olabilir’ ifadesini kesinliğe dönüştürme.",
          3,
        ),
        cQuestion(
          "p1c-assessment-4",
          "Güvenilir bir çıkarımın son kontrolü hangisidir?",
          [
            ["a", "Her iddianın metin desteği olması"],
            ["b", "Seçeneğin en uzun olması"],
            ["c", "Kişisel deneyime uyması"],
            ["d", "Metnin başlığıyla aynı kelimeyi içermesi"],
          ],
          "a",
          "Kanıt-sonuç ilişkisi kurulmadan çıkarım güvenilir değildir.",
          "Sonucun dayandığı kanıtı göster.",
          3,
        ),
      ],
    },
  }),
  makeProgram({
    family: "D",
    programId: "OKU-EDUCATION-V2-P1-D-VOCABULARY-CONTEXT",
    pathCode: "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_G8_12",
    title: "P1-D · Kelime, Bağlam ve Alan Bilgisi",
    unitCode: "P1_D_VOCABULARY_CONTEXT",
    unitTitle: "Kelimeyi bağlam içinde çöz",
    teach: {
      key: "p1d-teach",
      title: "Kelimenin anlamını bağlamdan çıkar",
      difficulty: 2,
      skillCode: "RC_DETAIL",
      body: "Bir kelimenin anlamını tek başına değil, cümledeki görevinden ve çevresindeki bilgilerden çıkar. Aynı sözcük farklı bağlamlarda farklı anlam taşıyabilir; kelimeyi cümlenin bütünüyle doğrula.",
      lesson: {
        objective: "Bilinmeyen bir kelimenin cümledeki anlamını bağlam kanıtlarıyla belirlemek.",
        explanation:
          "Yakındaki eylemler, karşılaştırmalar, örnekler ve alan bilgisi kelimenin anlamını sınırlar.",
        workedExample:
          "‘Kaptan, rotayı değiştirdi ve gemiyi sığ sulardan uzaklaştırdı.’ ‘Rota’ sözcüğü burada geminin izlediği yol anlamındadır; cümledeki ‘gemiyi uzaklaştırdı’ ifadesi bunu destekler.",
        guidedPractice:
          "Bir sonraki çalışmada kelimenin yerine seçenekleri koy ve cümlenin anlamını en iyi koruyanı seç.",
        nextExerciseKey: "p1d-study",
      },
    },
    study: {
      key: "p1d-study",
      title: "Sözcük ilişkisini izle",
      difficulty: 2,
      skillCode: "RC_DETAIL",
      body: "Hedef sözcüğün cümlede hangi kelimelerle ilişki kurduğunu bul ve anlamını bu ilişkilerle sınırla.",
    },
    practice: {
      key: "p1d-practice",
      title: "Bağlam ve alan bilgisini birleştir",
      difficulty: 2.5,
      skillCode: "RC_DETAIL",
      body: "Yeni bir metinde sözcük anlamını cümle kanıtı ve konunun temel bilgisiyle birlikte belirle.",
    },
    reinforcement: {
      key: "p1d-reinforcement",
      title: "Anlam ağını pekiştir",
      difficulty: 2.5,
      skillCode: "RC_DETAIL",
      body: "Kelimeyi, ilişkili ifadeleri ve alan bağlamını aynı metin üzerinde yeniden kontrol et.",
    },
    assessment: {
      key: "p1d-assessment",
      title: "Kelime ve bağlam kontrolü",
      difficulty: 3,
      skillCode: "RC_DETAIL",
      body: "Yeni metinlerde kelime anlamını bağlam, sözcük ilişkisi ve alan bilgisiyle doğrula.",
    },
    studyExercise: {
      key: "p1d-study",
      title: "Kelimeyi cümleyle eşleştir",
      templateType: "COMPREHENSION",
      contentKey: "p1d-study",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Kelimeyi cümleyle eşleştir",
        "COMPREHENSION",
        "RC_DETAIL",
        "Kelime anlamını cümledeki kanıtla eşleştir.",
      ),
      questions: [
        dQuestion(
          "p1d-study-1",
          "‘Kışın bazı kuşlar daha sıcak bölgelere göç eder.’ cümlesinde ‘göç eder’ ne anlama gelir?",
          [
            ["a", "Başka yere düzenli gider"],
            ["b", "Yuva yapmadan bekler"],
            ["c", "Kanatlarını saklar"],
            ["d", "Aynı yerde uyur"],
          ],
          "a",
          "Sıcak bölgelere gitmek burada yer değiştirmeyi anlatır.",
          "Kuşlar nereye doğru hareket ediyor?",
        ),
        dQuestion(
          "p1d-study-2",
          "‘Bitkinin kökleri toprağın altındaki suya ulaştı.’ ‘Kök’ sözcüğünün anlamını hangi bilgi destekler?",
          [
            ["a", "Toprağın altında bulunması"],
            ["b", "Bitkinin renginin yeşil olması"],
            ["c", "Suyun soğuk olması"],
            ["d", "Bitkinin uzun olması"],
          ],
          "a",
          "Kökün toprak altında olması bitki bölümünü açıklar.",
          "Sözcüğün bulunduğu yer bilgisine bak.",
        ),
        dQuestion(
          "p1d-study-3",
          "Kelime anlamını bağlamdan çıkarırken ilk olarak ne yapılmalıdır?",
          [
            ["a", "Cümle çevresindeki kanıtları okumak"],
            ["b", "İlk akla gelen anlamı seçmek"],
            ["c", "Sözcüğü metinden koparmak"],
            ["d", "Yalnızca sözlük sırasını düşünmek"],
          ],
          "a",
          "Çevre cümleler anlamı sınırlar.",
          "Kelimenin hangi bilgilerle birlikte kullanıldığına bak.",
        ),
      ],
    },
    practiceExercise: {
      key: "p1d-practice",
      title: "Bağlamdan anlam çıkar",
      templateType: "COMPREHENSION",
      contentKey: "p1d-practice",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Bağlamdan anlam çıkar",
        "COMPREHENSION",
        "RC_DETAIL",
        "Sözcük anlamını bağlam ve alan bilgisiyle doğrula.",
      ),
      questions: [
        dQuestion(
          "p1d-practice-1",
          "‘Araştırmacılar örnekleri mikroskop altında inceledi; hücrelerin yapısını daha ayrıntılı gördü.’ ‘İnceledi’ sözcüğü burada neyi anlatır?",
          [
            ["a", "Dikkatle gözden geçirdi"],
            ["b", "Örnekleri uzaklaştırdı"],
            ["c", "Hücreleri büyüttü"],
            ["d", "Çalışmayı erteledi"],
          ],
          "a",
          "Mikroskop altında görmek, dikkatle gözden geçirmeyi destekler.",
          "Araştırmacılar örneklerle ne yaptı?",
        ),
        dQuestion(
          "p1d-practice-2",
          "‘Kıyıdaki sazlıklar, birçok canlı için doğal bir sığınak oluşturur.’ ‘Sığınak’ sözcüğünün bağlamdaki anlamı hangisidir?",
          [
            ["a", "Canlıların korunabildiği yer"],
            ["b", "Denizin derin bölümü"],
            ["c", "Bitkilerin kesildiği araç"],
            ["d", "Kıyının uzak kısmı"],
          ],
          "a",
          "Canlıların korunması sığınak anlamını açıklar.",
          "Canlılar bu yerde ne buluyor?",
        ),
        dQuestion(
          "p1d-practice-3",
          "Alan bilgisi kelime anlamını nasıl destekler?",
          [
            ["a", "Konu ilişkilerini anlamaya yardım eder"],
            ["b", "Her kelime için yalnızca tek bir anlam belirler"],
            ["c", "Cümle kanıtlarını artık gereksiz hâle getirir"],
            ["d", "Metindeki sözcüklerin anlamını kendiliğinden değiştirir"],
          ],
          "a",
          "Alan bilgisi bağlamdaki ilişkileri yorumlamaya yardım eder.",
          "Konuya ait hangi ilişki sözcüğü açıklıyor?",
        ),
      ],
    },
    reinforcementExercise: {
      key: "p1d-reinforcement",
      title: "Anlam ağını tamamla",
      templateType: "MIXED",
      contentKey: "p1d-reinforcement",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Anlam ağını tamamla",
        "MIXED",
        "RC_DETAIL",
        "Kelimeyi ilişkili ifadeler ve alan bağlamıyla doğrula.",
      ),
      questions: [
        dQuestion(
          "p1d-reinforcement-1",
          "Bir kelime için birden fazla anlam mümkünse en güvenilir seçim hangisidir?",
          [
            ["a", "Cümlenin anlamını koruyan seçim"],
            ["b", "En yaygın görünen seçim"],
            ["c", "En uzun açıklama"],
            ["d", "Kişisel deneyime uyan seçim"],
          ],
          "a",
          "Bağlamdaki bütün kanıtlar birlikte değerlendirilmelidir.",
          "Cümleyi hangi anlam bozmadan tamamlıyor?",
        ),
        dQuestion(
          "p1d-reinforcement-2",
          "‘Arıların çiçeklerden nektar toplaması, bal üretiminin ilk aşamasıdır.’ ‘Aşama’ sözcüğü neyi anlatır?",
          [
            ["a", "Sürecin bir basamağı"],
            ["b", "Bir çiçek türü"],
            ["c", "Toplama aracı"],
            ["d", "Balın rengi"],
          ],
          "a",
          "‘İlk’ sözcüğü bir süreç basamağına işaret eder.",
          "‘İlk’ sözcüğü nasıl bir ilişki kuruyor?",
        ),
        dQuestion(
          "p1d-reinforcement-3",
          "Sözcük ilişkisini kontrol ederken hangi soru yararlıdır?",
          [
            ["a", "Kelime cümlede hangi bilgiyle ilişkili?"],
            ["b", "Bu kelime kaç harfli?"],
            ["c", "Bu kelimeyi daha önce gördüm mü?"],
            ["d", "Bu konu hakkında kişisel fikrim ne?"],
          ],
          "a",
          "İlişkili bilgi kelime anlamını sınırlar.",
          "Kelimenin çevresindeki eylem ve ifadeye bak.",
        ),
      ],
    },
    assessmentExercise: {
      key: "p1d-assessment",
      title: "Kelime ve bağlamı kontrol et",
      templateType: "MIXED",
      contentKey: "p1d-assessment",
      skillCode: "RC_DETAIL",
      contract: exerciseContract(
        "Kelime ve bağlamı kontrol et",
        "MIXED",
        "RC_DETAIL",
        "Yeni metinde kelime anlamını bağlam ve alan bilgisiyle doğrula.",
      ),
      questions: [
        dQuestion(
          "p1d-assessment-1",
          "‘Mimar, binanın taşıyıcı kolonlarını güçlendirdi; böylece yapı daha dayanıklı oldu.’ ‘Taşıyıcı’ sözcüğü neyi anlatır?",
          [
            ["a", "Yapının yükünü destekleyen"],
            ["b", "Binayı başka yere götüren"],
            ["c", "Rengi değiştiren"],
            ["d", "Yalnızca süsleyen"],
          ],
          "a",
          "Kolonların yapıyı desteklemesi alan bağlamından anlaşılır.",
          "Kolonların yapıdaki görevini düşün.",
          3,
        ),
        dQuestion(
          "p1d-assessment-2",
          "‘Düzenli sulama, fidanın köklenmesini kolaylaştırdı.’ ‘Köklenmek’ burada ne demektir?",
          [
            ["a", "Köklerin toprağa yerleşmesi"],
            ["b", "Yapraklarını dökmesi"],
            ["c", "Başka yere taşınması"],
            ["d", "Sulamayı bırakması"],
          ],
          "a",
          "Sulama ve fidan bağlamı köklerin toprağa yerleşmesini gösterir.",
          "Fidanın toprağa tutunmasıyla ilgili anlamı ara.",
          3,
        ),
        dQuestion(
          "p1d-assessment-3",
          "Bir sözcüğün alan bilgisini kullanırken hangi hata yapılmamalıdır?",
          [
            ["a", "Alan anlamını cümle kanıtı olmadan zorla uygulamak"],
            ["b", "Konuya ait ilişkileri incelemek"],
            ["c", "Cümleyi bütünüyle okumak"],
            ["d", "Kelimeyi yakın ifadelerle karşılaştırmak"],
          ],
          "a",
          "Alan bilgisi bağlam kanıtıyla birlikte kullanılmalıdır.",
          "Alan bilgisi tek başına yeterli mi?",
          3,
        ),
        dQuestion(
          "p1d-assessment-4",
          "Kelime anlamının doğru olduğunu son olarak nasıl kontrol edersin?",
          [
            ["a", "Seçtiğin anlam cümleyi açıklıyorsa"],
            ["b", "Kelime tanıdık geliyorsa"],
            ["c", "En kısa seçenekse"],
            ["d", "Metin dışı bir örneğe uyuyorsa"],
          ],
          "a",
          "Doğru anlam cümlenin tamamıyla tutarlı olur.",
          "Anlamı cümleye geri koy ve bütünü kontrol et.",
          3,
        ),
      ],
    },
  }),
  ...buildP1BCDCycle2Programs(),
];

type AuthoredQuestionSpec = {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  hint: string;
};

type AuthoredExerciseSpec = {
  contentKey: string;
  title: string;
  templateType: ProgramExercise["templateType"];
  skillCode: string;
  instructions: string;
  questions: [AuthoredQuestionSpec, AuthoredQuestionSpec, AuthoredQuestionSpec];
};

type AuthoredCycle2Spec = {
  family: P1BCDRouteFamily;
  programId: string;
  pathCode: string;
  title: string;
  unitCode: string;
  unitTitle: string;
  outcome: string;
  sourceReferences: NonNullable<P1BCDProgram["editorialProvenance"]>;
  teaching: {
    title: string;
    body: string;
    objective: string;
    explanation: string;
    example: string;
    guided: string;
  };
  study: { title: string; body: string; skillCode: string };
  practice: { title: string; body: string; skillCode: string };
  reinforcement: { title: string; body: string; skillCode: string };
  assessment: { title: string; body: string; skillCode: string };
  exercises: [
    AuthoredExerciseSpec,
    AuthoredExerciseSpec,
    AuthoredExerciseSpec,
    AuthoredExerciseSpec,
  ];
};

function buildAuthoredP1BCDCycle2(spec: AuthoredCycle2Spec): P1BCDProgram {
  const prefix = `p1${spec.family.toLowerCase()}2`;
  const contentKeys = {
    teaching: `${prefix}-teach`,
    study: `${prefix}-study`,
    practice: `${prefix}-practice`,
    reinforcement: `${prefix}-reinforcement`,
    assessment: `${prefix}-assessment`,
  };
  const authoredContent = (
    key: string,
    title: string,
    body: string,
    skillCode: string,
    difficulty: number,
  ): ProgramContent => ({ key, title, body, skillCode, difficulty });
  const exercises = spec.exercises.map((exercise, exerciseIndex): ProgramExercise => ({
    key: `${prefix}-${["study", "practice", "reinforcement", "assessment"][exerciseIndex]}`,
    title: exercise.title,
    templateType: exercise.templateType,
    contentKey: exercise.contentKey,
    skillCode: exercise.skillCode,
    contract: exerciseContract(
      exercise.title,
      exercise.templateType,
      exercise.skillCode,
      exercise.instructions,
    ),
    questions: exercise.questions.map((item, questionIndex) => {
      const correctText = item.options[item.correctIndex];
      const distractors = item.options.filter((_, index) => index !== item.correctIndex);
      const correctPosition = (exerciseIndex * 3 + questionIndex) % item.options.length;
      let distractorIndex = 0;
      const positionedOptions = item.options.map((_, optionIndex) => {
        if (optionIndex === correctPosition) return correctText;
        const distractor = distractors[distractorIndex];
        distractorIndex += 1;
        if (!distractor) throw new Error(`${prefix}: çeldirici kaynağı eksik`);
        return distractor;
      });
      return question(
        `${prefix}-${["study", "practice", "reinforcement", "assessment"][exerciseIndex]}-${questionIndex + 1}`,
        item.prompt,
        positionedOptions.map((text, optionIndex) => [String.fromCharCode(97 + optionIndex), text]),
        String.fromCharCode(97 + correctPosition),
        item.explanation,
        item.hint,
        3 + exerciseIndex * 0.25,
      );
    }),
  }));
  const [studyExercise, practiceExercise, reinforcementExercise, assessmentExercise] = exercises;
  if (!studyExercise || !practiceExercise || !reinforcementExercise || !assessmentExercise)
    throw new Error(`${spec.programId}: dört uygulama paketi gerekli`);
  return makeProgram({
    family: spec.family,
    cycleVersion: 2,
    sequence: 2,
    stepPrefix: prefix,
    publicationApproved: false,
    learningOutcome: {
      key: `P1${spec.family}_CYCLE_2_${spec.family === "B" ? "FLUENCY" : spec.family === "C" ? "EVIDENCE" : "CONTEXT"}`,
      statement: spec.outcome,
      targetSkillCodes: EDUCATION_V2_P1_BCD_LEARNING_OUTCOMES[spec.family].targetSkillCodes,
    },
    editorialProvenance: spec.sourceReferences,
    programId: spec.programId,
    pathCode: spec.pathCode,
    title: spec.title,
    unitCode: spec.unitCode,
    unitTitle: spec.unitTitle,
    teach: {
      ...authoredContent(
        contentKeys.teaching,
        spec.teaching.title,
        spec.teaching.body,
        "RC_DETAIL",
        3,
      ),
      lesson: {
        objective: spec.teaching.objective,
        explanation: spec.teaching.explanation,
        workedExample: spec.teaching.example,
        guidedPractice: spec.teaching.guided,
        nextExerciseKey: studyExercise.key,
      },
    },
    study: authoredContent(
      contentKeys.study,
      spec.study.title,
      spec.study.body,
      spec.study.skillCode,
      3,
    ),
    practice: authoredContent(
      contentKeys.practice,
      spec.practice.title,
      spec.practice.body,
      spec.practice.skillCode,
      3.25,
    ),
    reinforcement: authoredContent(
      contentKeys.reinforcement,
      spec.reinforcement.title,
      spec.reinforcement.body,
      spec.reinforcement.skillCode,
      3.5,
    ),
    assessment: authoredContent(
      contentKeys.assessment,
      spec.assessment.title,
      spec.assessment.body,
      spec.assessment.skillCode,
      3.75,
    ),
    studyExercise,
    practiceExercise,
    reinforcementExercise,
    assessmentExercise,
  });
}

function buildP1BCDCycle2Programs(): P1BCDProgram[] {
  return [
    buildAuthoredP1BCDCycle2({
      family: "B",
      programId: "OKU-EDUCATION-V2-P1-B-FLUENCY-MEANING-CYCLE-2",
      pathCode: "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_2_G8_12",
      title: "P1-B · Akıcılık ve anlamı koruma 2",
      unitCode: "P1_B_FLUENCY_MEANING_CYCLE_2",
      unitTitle: "Cümle akışını ve anlamı birlikte izle",
      outcome:
        "Noktalama, anlam grupları ve cümle ilişkilerini izleyerek akıcı okurken anlamı korur.",
      sourceReferences: {
        contentOrigin: "ORIGINAL_FICTION",
        factualClaimPolicy: "NO_EXTERNAL_FACTUAL_CLAIMS",
        curriculumReferences: [
          {
            name: "MEB, Türk Dili ve Edebiyatı Dersi Öğretim Programı",
            url: "https://tymm.meb.gov.tr/ogretim-programlari/ders/turk-dili-ve-edebiyati-dersi",
            verifiedAt: "2026-10-17",
            supports:
              "Lise düzeyindeki Türk Dili ve Edebiyatı program çerçevesi; bu paket mevcut P1-B akıcılık kazanımını cümle akışı ve anlamı koruma bağlamında ilerletir.",
          },
          {
            name: "MEB, Ortaokul Türkçe Dersi Öğretim Programı",
            url: "https://tymm.meb.gov.tr/ogretim-programlari/ders/ortaokul-turkce-dersi",
            verifiedAt: "2026-10-17",
            supports:
              "5–8. sınıf Türkçe program çerçevesi; okuma, anlam oluşturma ve akıcı okuma bağlamı.",
          },
        ],
        languageReference: {
          name: "Türk Dil Kurumu, 2026 Yazım Kılavuzu",
          url: "https://yazim.tdk.gov.tr/content/00-ana-sayfa.html",
          verifiedAt: "2026-10-17",
          supports: "Türkçe yazım ve noktalama kontrolü; kılavuzun 2026 baskısı esas alınmıştır.",
        },
      },
      teaching: {
        title: "Durakları anlam için kullan",
        body: "Akıcı okuma, sözcükleri aceleyle geçmek değil, cümlenin anlamını kuracak grupları ve durakları birlikte izlemektir. Virgül, nokta ve bağlaçlar okuma ritmine ipucu verir; her virgülde aynı uzunlukta beklemek gerekmez. Önce cümlenin hangi parçalarının birlikte anlam taşıdığını bul, sonra doğal duraklarla oku. Bir cümle anlaşılmaz hâle gelirse hızını düşürüp grupları yeniden birleştir.",
        objective:
          "Noktalama ve anlam gruplarını kullanarak cümlenin akışını ve anlamını birlikte korumak.",
        explanation:
          "Durak, anlamı bölmek için değil; cümledeki düşünce parçalarını ayırıp yeniden bağlamak için kullanılır.",
        example:
          "‘Ece haritayı açtı, kısa yolu buldu ve ekibe yönü gösterdi.’ Eylem sırası üç parçadır; virgül ilk iki parçayı ayırırken ‘ve’ son parçayı bağlar.",
        guided:
          "Bir sonraki çalışmada cümleyi anlam gruplarına ayır; durakların ardından kimin ne yaptığını kendi sözlerinle yeniden kur.",
      },
      study: {
        title: "Cümle gruplarını izle",
        body: "Okulun tiyatro kulübü prova saatini değiştirdi. Duru, yeni saati panoda görünce arkadaşlarına haber verdi; böylece kimse eski saatte salona gelmedi. Grup, kısa bir kontrol listesi hazırlayıp sonraki provada kullandı.",
        skillCode: "FAST_CHUNKING",
      },
      practice: {
        title: "Akışı bozmadan sırayı kur",
        body: "Bir ekip sergi için önce nesneleri seçti, sonra açıklama kartları yazdı. Kartları yerleştirince ziyaretçiler eserleri karıştırmadan izleyebildi. Ekip, son turda kartların okunaklı olup olmadığını birlikte kontrol etti.",
        skillCode: "FAST_RECOGNITION",
      },
      reinforcement: {
        title: "Durakları yeniden değerlendir",
        body: "Mert, otobüs durağındaki duyuruyu hızlıca okudu ama saati yanlış anladı. Metne yeniden döndü: ‘Toplantı 14.00'te başlayacak; kapılar 13.30'da açılacak.’ İki saati ayrı gruplar hâlinde okuyunca hangisinin başlangıç, hangisinin giriş zamanı olduğunu ayırdı.",
        skillCode: "RC_DETAIL",
      },
      assessment: {
        title: "Akıcılık ve anlamı birlikte kontrol et",
        body: "Atölye görevlisi kutuları etiketledi, ardından araçları kullanım sırasına göre dizdi. Yeni gelenler aradıkları parçayı daha az duraksayarak buldu. Görevli, düzenin işe yarayıp yaramadığını anlamak için bir sonraki çalışmada katılımcılardan kısa geri bildirim aldı.",
        skillCode: "FAST_CHUNKING",
      },
      exercises: [
        {
          contentKey: "p1b2-study",
          title: "Anlam gruplarını bul",
          templateType: "FLUENCY",
          skillCode: "FAST_CHUNKING",
          instructions: "Cümle parçalarını ve aralarındaki anlam bağını koruyarak oku.",
          questions: [
            {
              prompt: "Duru'nun arkadaşlarına haber vermesinin doğrudan sonucu ne oldu?",
              options: [
                "Prova saati panodan kaldırıldı",
                "Kimse eski saatte salona gelmedi",
                "Kulüp yeni bir oyun seçti",
                "Kontrol listesi unutuldu",
              ],
              correctIndex: 1,
              explanation:
                "Metin, haber vermenin ardından kimsenin eski saatte gelmediğini açıkça söylüyor.",
              hint: "‘Böylece’ sözcüğünden sonraki sonucu bul.",
            },
            {
              prompt:
                "‘Grup, kısa bir kontrol listesi hazırlayıp sonraki provada kullandı’ cümlesinde hangi iki eylem birlikte anlatılıyor?",
              options: [
                "Listeyi yazma ve sonra kullanma",
                "Panoyu görme ve arkadaşına haber verme",
                "Prova saatini seçme ve değiştirme",
                "Salona gelme ve oyunu oynama",
              ],
              correctIndex: 0,
              explanation:
                "Cümle, listenin hazırlanmasını ve sonraki provada kullanılmasını aynı sırada veriyor.",
              hint: "‘Hazırlayıp’ eki iki eylemi nasıl bağlıyor?",
            },
            {
              prompt: "Metindeki olayların doğru sırası hangisidir?",
              options: [
                "Saat değişir, ekip listeyi hazırlar, Duru daha sonra panoya bakar",
                "Duru saati panoda görür, listeyi kullanır, saat daha sonra değişir",
                "Saat değişir, Duru panoda görür ve haber verir, liste hazırlanır",
                "Duru listeyi hazırlar, arkadaşlarına haber verir, saat sonra değişir",
              ],
              correctIndex: 2,
              explanation:
                "Önce saat değişir; Duru bunu görüp haber verir; ardından grup liste hazırlar.",
              hint: "İlk cümleden başlayıp eylemleri sırayla izle.",
            },
          ],
        },
        {
          contentKey: "p1b2-practice",
          title: "Eylem sırasını akıcı izle",
          templateType: "FLUENCY",
          skillCode: "FAST_RECOGNITION",
          instructions: "Eylem gruplarını sıralı okuyup metnin anlamını koru.",
          questions: [
            {
              prompt: "Açıklama kartları ne zaman yazılmıştır?",
              options: [
                "Nesneler seçildikten sonra",
                "Ziyaretçiler sergiyi bitirince",
                "Son kontrol tamamlanmadan önce nesneler seçilmeden",
                "Ekip geri bildirim aldıktan sonra",
              ],
              correctIndex: 0,
              explanation:
                "‘Önce... sonra...’ sırası kartların nesne seçiminden sonra yazıldığını gösteriyor.",
              hint: "Metindeki ‘önce’ ve ‘sonra’ ifadelerini takip et.",
            },
            {
              prompt:
                "Ziyaretçilerin eserleri karıştırmadan izlemesine hangi düzenleme yardım etti?",
              options: [
                "Eserlerin kaldırılması",
                "Açıklama kartlarının yerleştirilmesi",
                "Prova saatinin değiştirilmesi",
                "Kutuların etiketlenmesi",
              ],
              correctIndex: 1,
              explanation:
                "Kartların yerleştirilmesinden sonra ziyaretçilerin eserleri karıştırmadığı belirtiliyor.",
              hint: "Sonucu doğrudan önceleyen eylemi bul.",
            },
            {
              prompt: "Ekip son turda neyi kontrol etti?",
              options: [
                "Nesnelerin fiyatını",
                "Ziyaretçi sayısını",
                "Kartların okunaklılığını",
                "Serginin süresini",
              ],
              correctIndex: 2,
              explanation:
                "Son cümlede kartların okunaklı olup olmadığının kontrol edildiği yazıyor.",
              hint: "Son cümledeki ‘olup olmadığını’ ifadesine dön.",
            },
          ],
        },
        {
          contentKey: "p1b2-reinforcement",
          title: "İki zamanı karıştırmadan oku",
          templateType: "MIXED",
          skillCode: "RC_DETAIL",
          instructions: "Zaman ve görev bildiren bilgi gruplarını ayır.",
          questions: [
            {
              prompt: "Toplantı hangi saatte başlayacak?",
              options: ["13.00'te", "13.30'da", "14.00'te", "Saat belirtilmemiş"],
              correctIndex: 2,
              explanation:
                "İlk saat toplantı başlangıcını, ikinci saat kapıların açılmasını bildiriyor.",
              hint: "‘Toplantı’ sözcüğünün bağlı olduğu saati seç.",
            },
            {
              prompt: "Kapılar için verilen bilgi nedir?",
              options: [
                "13.30'da açılacak",
                "14.00'te kapanacak",
                "Toplantıdan sonra açılacak",
                "Bir gün önce açılacak",
              ],
              correctIndex: 0,
              explanation: "Metin kapıların 13.30'da açılacağını belirtiyor.",
              hint: "İkinci zaman grubunu bul.",
            },
            {
              prompt: "Mert metni neden yeniden okudu?",
              options: [
                "Durağı bulamadığı için",
                "Saatleri karıştırdığı için",
                "Duyuruyu kendisi yazdığı için",
                "Otobüsü kaçırdığı için",
              ],
              correctIndex: 1,
              explanation: "İlk okumada saati yanlış anladığını fark edip metne döndü.",
              hint: "İlk cümlenin Mert'le ilgili bölümüne bak.",
            },
          ],
        },
        {
          contentKey: "p1b2-assessment",
          title: "Yeni metinde akış ve anlamı ölç",
          templateType: "FLUENCY",
          skillCode: "FAST_CHUNKING",
          instructions: "Cümle akışını izlerken her çıkarımı metindeki bilgiyle doğrula.",
          questions: [
            {
              prompt: "Katılımcılar aradıkları parçayı nasıl buldu?",
              options: [
                "Kutuların renklerini ve yerlerini karşılaştırarak",
                "Görevliye parçanın yerini sorarak",
                "Etiket ve kullanım sırasından yararlanarak",
                "Her parçayı kutulardan tek tek çıkararak",
              ],
              correctIndex: 2,
              explanation:
                "Araçlar etiketlenip kullanım sırasına dizildi; bu düzen aramayı kolaylaştırdı.",
              hint: "İlk iki eylemin birlikte oluşturduğu düzeni düşün.",
            },
            {
              prompt: "Görevli düzenin işe yarayıp yaramadığını nasıl öğrenecek?",
              options: [
                "Katılımcılardan geri bildirim alarak",
                "Bütün araçları kaldırarak",
                "Sergiyi kapatarak",
                "Etiketleri değiştirmeden sayarak",
              ],
              correctIndex: 0,
              explanation:
                "Metin, sonraki çalışmada kısa geri bildirim alınacağını açıkça söylüyor.",
              hint: "Son cümledeki kontrol yöntemini bul.",
            },
            {
              prompt: "Metnin ana düşüncesi hangisidir?",
              options: [
                "Atölyedeki etiket ve kutuların yalnızca görünüş için kullanılması",
                "Düzenli etiketleme ve sıralamanın araçları bulmayı kolaylaştırması",
                "Katılımcıların düzenli çalışmayı istemeyip atölyeden ayrılması",
                "Geri bildirimlerin bütün katılımcılarca olumlu bulunduğunun anlaşılması",
              ],
              correctIndex: 1,
              explanation:
                "Metnin tamamı düzenleme adımlarını ve bunların aramaya sağladığı katkıyı anlatıyor.",
              hint: "Bütün cümleleri açıklayan ortak mesajı seç.",
            },
          ],
        },
      ],
    }),
    buildAuthoredP1BCDCycle2({
      family: "C",
      programId: "OKU-EDUCATION-V2-P1-C-INFERENCE-EVIDENCE-CYCLE-2",
      pathCode: "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_2_G8_12",
      title: "P1-C · Çıkarım ve kanıt 2",
      unitCode: "P1_C_INFERENCE_EVIDENCE_CYCLE_2",
      unitTitle: "Kanıttan ölçülü çıkarım yap",
      outcome:
        "Birden çok metin kanıtını birleştirerek çıkarım yapar ve kanıtın desteklemediği iddiaları ayıklar.",
      sourceReferences: {
        contentOrigin: "ORIGINAL_FICTION",
        factualClaimPolicy: "NO_EXTERNAL_FACTUAL_CLAIMS",
        curriculumReferences: [
          {
            name: "MEB, Türk Dili ve Edebiyatı Dersi Öğretim Programı",
            url: "https://tymm.meb.gov.tr/ogretim-programlari/ders/turk-dili-ve-edebiyati-dersi",
            verifiedAt: "2026-10-17",
            supports:
              "Lise düzeyindeki programdaki okuma, metin analizi ve değerlendirme çerçevesi; paket mevcut P1-C kanıt ve çıkarım kazanımını çoklu kanıtla sınırlı çıkarıma taşır.",
          },
          {
            name: "MEB, Ortaokul Türkçe Dersi Öğretim Programı",
            url: "https://tymm.meb.gov.tr/ogretim-programlari/ders/ortaokul-turkce-dersi",
            verifiedAt: "2026-10-17",
            supports:
              "5–8. sınıf Türkçe program çerçevesi; yüzey/derin anlam, çıkarım ve yorumlama bağlamı.",
          },
        ],
        languageReference: {
          name: "Türk Dil Kurumu, 2026 Yazım Kılavuzu",
          url: "https://yazim.tdk.gov.tr/content/00-ana-sayfa.html",
          verifiedAt: "2026-10-17",
          supports: "Türkçe yazım ve noktalama kontrolü; kılavuzun 2026 baskısı esas alınmıştır.",
        },
      },
      teaching: {
        title: "Çıkarımın sınırını koru",
        body: "Çıkarım, metinde aynen yazmayan bir sonucu metindeki bilgilerden hareketle kurmaktır. Güvenilir bir çıkarım en az bir açık kanıta dayanır ve kanıtın izin verdiğinden daha ileri gitmez. Önce verilen bilgileri ayrı ayrı işaretle, sonra bu bilgilerin birlikte hangi sonucu desteklediğini söyle. Metnin söylemediği bir nedeni, niyeti veya kesinliği kendiliğinden ekleme.",
        objective:
          "İki metin bilgisini birleştirerek kanıtın desteklediği çıkarımı yapmak ve desteklenmeyen genellemeyi reddetmek.",
        explanation:
          "Çıkarım, metin kanıtıyla okuyucunun kurduğu sonuç arasındaki gerekçeli bağdır; tahmin tek başına yeterli değildir.",
        example:
          "Metinde salonun ışıkları kapatılıyor ve perdeler açılıyor; ardından duvardaki çizimlerin görünür olduğu belirtiliyor. Işığın değişmesi çizimleri görünür kılmış olabilir; metin, çizimlerin yeni yapıldığını söylemez.",
        guided:
          "Her alıştırmada önce iki kanıtı bul. Ardından yalnızca bu kanıtların birlikte desteklediği sonucu seç.",
      },
      study: {
        title: "Kanıtı sonuçtan ayır",
        body: "Okul radyosu için hazırlanan kısa kayıtta Ekin, konuşmadan önce metni iki kez okudu. Yayın sırasında notlarına yalnızca bölüm başlıklarını yazdı. Program bitince dinleyiciler, anlatılan sırayı rahatça takip ettiklerini söyledi.",
        skillCode: "RC_DETAIL",
      },
      practice: {
        title: "İki kanıtı birleştir",
        body: "Sahil yürüyüşü için hazırlanan duyuruda başlangıç noktası bir çizimle gösterildi. Gönüllüler, çizimdeki yön işaretlerini izleyerek buluşma alanına ulaştı. Sonraki hafta aynı işaretler başka bir etkinlik duyurusunda da kullanıldı.",
        skillCode: "RC_INFERENCE",
      },
      reinforcement: {
        title: "Desteklenmeyen iddiayı ayıkla",
        body: "Bir sınıf, proje panosuna taslakları ve son ürünleri yan yana astı. Ziyaretçiler, açıklama kartlarını okuyarak değişiklikleri fark etti. Panoyu gezenlerin bazıları, hangi kararın neden alındığını öğrencilere sordu.",
        skillCode: "RC_DETAIL",
      },
      assessment: {
        title: "Kanıt ve çıkarım kontrolü",
        body: "Bir mahalle atölyesi, onarım öncesi ve sonrası nesnelerin fotoğraflarını aynı dosyada topladı. Katılımcılar, fotoğrafları tarih sırasına koyunca yapılan değişiklikleri daha kolay karşılaştırdı. Dosyayı hazırlayan ekip, fotoğrafların her ayrıntıyı tek başına açıklamadığını; bazı kararların atölye notlarında yer aldığını belirtti.",
        skillCode: "RC_INFERENCE",
      },
      exercises: [
        {
          contentKey: "p1c2-study",
          title: "Açık bilgi ve çıkarımı ayır",
          templateType: "COMPREHENSION",
          skillCode: "RC_DETAIL",
          instructions: "Metinde açıkça verilen kanıtı, bu kanıtın desteklediği sonuçtan ayır.",
          questions: [
            {
              prompt: "Ekin yayın öncesinde ne yaptı?",
              options: [
                "Metni iki kez okudu",
                "Dinleyicilere soru sordu",
                "Başlıkları değiştirdi",
                "Kaydı yeniden başlattı",
              ],
              correctIndex: 0,
              explanation: "İlk cümle Ekin'in metni iki kez okuduğunu açıkça belirtiyor.",
              hint: "Yayın başlamadan önceki eylemi bul.",
            },
            {
              prompt: "Dinleyicilerin sözünden hangi ölçülü çıkarım yapılabilir?",
              options: [
                "Programın süresinin kısa bulunduğu",
                "Anlatım sırası kolayca takip edilebildi",
                "Ekin'in yayında not kullandığı",
                "Dinleyicilerin yeni bir bölüm istediği",
              ],
              correctIndex: 1,
              explanation:
                "Dinleyiciler sırayı rahat takip ettiklerini söylemiş; bu, anlatım düzeninin anlaşılır bulunduğunu destekler.",
              hint: "Dinleyicilerin doğrudan bildirdiği sonucu kullan.",
            },
            {
              prompt: "Metnin desteklemediği iddia hangisidir?",
              options: [
                "Ekin bölüm başlıklarını not etti",
                "Yayın öncesinde metni okudu",
                "Bütün dinleyiciler programı beğendi",
                "Dinleyiciler anlatılan sırayı izledi",
              ],
              correctIndex: 2,
              explanation:
                "Metin yalnızca bazı dinleyicilerin sıra hakkındaki görüşünü aktarıyor; herkesin beğenisinden söz etmiyor.",
              hint: "‘Dinleyiciler’ ifadesini ‘herkes’ diye genişletme.",
            },
          ],
        },
        {
          contentKey: "p1c2-practice",
          title: "Birden çok kanıtla çıkarım yap",
          templateType: "INFERENCE",
          skillCode: "RC_INFERENCE",
          instructions:
            "Birden fazla açık bilgiyi birleştir; metnin sınırını aşan genellemelerden kaçın.",
          questions: [
            {
              prompt: "Çizim ve yön işaretleri ne işe yaramış?",
              options: [
                "Duyurudaki başlangıç noktasının daha az görünür olmasına yol açmış",
                "Gönüllülerin buluşma alanına ulaşmasını sağlamış",
                "Etkinliğin başka bir tarihe alınmasını gerektirmiş",
                "Sahil yolunun katılımcılara tamamen kapatılmasına neden olmuş",
              ],
              correctIndex: 1,
              explanation:
                "Gönüllülerin işaretleri izleyerek buluşma alanına ulaştığı açıkça belirtiliyor.",
              hint: "İşaretleri izleyen kişilerin sonucunu bul.",
            },
            {
              prompt: "Aynı yön işaretlerinin sonraki duyuruda da kullanılması neyi destekler?",
              options: [
                "İşaretlerin farklı duyurularda da işe yarar bulunduğunu",
                "İlk etkinliğin katılım azlığı nedeniyle iptal edildiğini",
                "Her katılımcının aynı mahallede yaşamasının beklendiğini",
                "Çizimin uzman bir tasarımcı tarafından hazırlandığını",
              ],
              correctIndex: 0,
              explanation:
                "Tekrar kullanılması, ekibin işaretleri başka bir etkinlikte de yararlı bulduğunu düşündürür; metin bunun nedenini kesinleştirmez.",
              hint: "Tekrar kullanımın desteklediği en dar sonucu seç.",
            },
            {
              prompt: "Metinden kesin olarak çıkarılamayan bilgi hangisidir?",
              options: [
                "Duyuruda bir çizim vardı",
                "Gönüllüler yön işaretlerini izledi",
                "Etkinliğe tam olarak kaç kişinin katıldığı",
                "Buluşma alanına ulaşıldı",
              ],
              correctIndex: 2,
              explanation: "Katılımcı sayısı metinde verilmemiştir.",
              hint: "Sayı bilgisi açıkça yazıyor mu?",
            },
          ],
        },
        {
          contentKey: "p1c2-reinforcement",
          title: "İddianın kapsamını sınırla",
          templateType: "COMPREHENSION",
          skillCode: "RC_DETAIL",
          instructions:
            "Kanıtla desteklenen kapsamı koru; kişilere veya nedenlere ilişkin ek varsayım yapma.",
          questions: [
            {
              prompt: "Ziyaretçiler değişiklikleri nasıl fark etti?",
              options: [
                "Öğrencilerin sunumunu izleyerek",
                "Açıklama kartlarını okuyarak",
                "Taslakları eve götürerek",
                "Projeyi yeniden yaparak",
              ],
              correctIndex: 1,
              explanation:
                "İkinci cümle, değişikliklerin açıklama kartlarıyla fark edildiğini söylüyor.",
              hint: "‘... okuyarak’ yapısındaki eylemi ara.",
            },
            {
              prompt: "Ziyaretçilerin bazı sorular sorması neyi gösterir?",
              options: [
                "Kararların nedenini merak ettiklerini",
                "Bütün projeleri beğenmediklerini",
                "Kartların okunamadığını",
                "Panonun kapatıldığını",
              ],
              correctIndex: 0,
              explanation:
                "Sorular, en azından bazı ziyaretçilerin kararların gerekçesini öğrenmek istediğini düşündürür.",
              hint: "Soru konusu olan bilgiyi belirle.",
            },
            {
              prompt: "Metne dayanarak hangi iddia söylenemez?",
              options: [
                "Taslak ve son ürünler birlikte sergilendi",
                "Bazı ziyaretçiler kararların nedenini sordu",
                "Bütün ziyaretçiler projeleri tamamen anladı",
                "Kartlar değişiklikleri fark etmeye yardım etti",
              ],
              correctIndex: 2,
              explanation: "Metin tüm ziyaretçilerin anladığına ilişkin bilgi vermiyor.",
              hint: "‘Bazıları’ bilgisini tüm gruba yayma.",
            },
          ],
        },
        {
          contentKey: "p1c2-assessment",
          title: "Yeni metinde kanıt zincirini ölç",
          templateType: "INFERENCE",
          skillCode: "RC_INFERENCE",
          instructions: "Kanıtı, çıkarımı ve metnin açıklamadığı noktaları birlikte değerlendir.",
          questions: [
            {
              prompt: "Fotoğrafları tarih sırasına koymak neyi kolaylaştırdı?",
              options: [
                "Atölyenin maliyetini hesaplamayı",
                "Değişiklikleri karşılaştırmayı",
                "Her kararı fotoğraftan açıklamayı",
                "Katılımcı sayısını bulmayı",
              ],
              correctIndex: 1,
              explanation:
                "Metin tarih sırasının yapılan değişiklikleri karşılaştırmayı kolaylaştırdığını söylüyor.",
              hint: "İkinci cümlenin sonucuna dön.",
            },
            {
              prompt: "Fotoğraflar hakkında ekibin belirttiği sınırlama nedir?",
              options: [
                "Fotoğraflar doğru bir tarih sırasına yerleştirilemez",
                "Fotoğraflar her ayrıntıyı tek başına açıklamaz",
                "Onarım sırasında nesnelerin hiçbir özelliği değişmemiştir",
                "Atölye notlarının ekip tarafından kaybolduğu anlaşılmıştır",
              ],
              correctIndex: 1,
              explanation:
                "Ekip, bazı kararların yalnızca atölye notlarında bulunduğunu belirtiyor.",
              hint: "Son cümlenin ilk bölümünü oku.",
            },
            {
              prompt: "Metinden yapılabilecek en güvenilir çıkarım hangisidir?",
              options: [
                "Fotoğraf kayıtları onarım sürecindeki her kararı tek başına açıklar",
                "Fotoğraf ve notlar birlikte değişim sürecini anlamaya yardım eder",
                "Bütün onarımların aynı sıra ve yöntemle yürütüldüğü görülür",
                "Katılımcıların nesneleri atölyeden önce hiç görmediği anlaşılır",
              ],
              correctIndex: 1,
              explanation:
                "Fotoğraflar değişimi karşılaştırmayı, notlar ise kararların bazı gerekçelerini anlamayı destekliyor.",
              hint: "İki kaynak türünün metinde anlatılan görevlerini birleştir.",
            },
          ],
        },
      ],
    }),
    buildAuthoredP1BCDCycle2({
      family: "D",
      programId: "OKU-EDUCATION-V2-P1-D-VOCABULARY-CONTEXT-CYCLE-2",
      pathCode: "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_2_G8_12",
      title: "P1-D · Sözcük ve bağlam 2",
      unitCode: "P1_D_VOCABULARY_CONTEXT_CYCLE_2",
      unitTitle: "Sözcük anlamını bağlam ipuçlarıyla çöz",
      outcome:
        "Çok anlamlı sözcükleri, yakın ifadeleri ve cümle ilişkilerini kullanarak bağlama uygun anlamı belirler.",
      sourceReferences: {
        contentOrigin: "ORIGINAL_FICTION",
        factualClaimPolicy: "NO_EXTERNAL_FACTUAL_CLAIMS",
        curriculumReferences: [
          {
            name: "MEB, Türk Dili ve Edebiyatı Dersi Öğretim Programı",
            url: "https://tymm.meb.gov.tr/ogretim-programlari/ders/turk-dili-ve-edebiyati-dersi",
            verifiedAt: "2026-10-17",
            supports:
              "Lise düzeyindeki metin tahlili çerçevesi; paket mevcut P1-D bağlamdan sözcük anlamı kazanımını çok anlamlı kullanımlara taşır.",
          },
          {
            name: "MEB, Ortaokul Türkçe Dersi Öğretim Programı",
            url: "https://tymm.meb.gov.tr/ogretim-programlari/ders/ortaokul-turkce-dersi",
            verifiedAt: "2026-10-17",
            supports:
              "5–8. sınıf Türkçe program çerçevesi; bilinmeyen söz varlığını bağlamdan tahmin etme ve anlama.",
          },
        ],
        languageReference: {
          name: "Türk Dil Kurumu, 2026 Yazım Kılavuzu",
          url: "https://yazim.tdk.gov.tr/content/00-ana-sayfa.html",
          verifiedAt: "2026-10-17",
          supports: "Türkçe yazım ve noktalama kontrolü; kılavuzun 2026 baskısı esas alınmıştır.",
        },
      },
      teaching: {
        title: "Sözcüğü cümle içinde sınayarak seç",
        body: "Bir sözcüğün ilk akla gelen anlamı, her cümlede uygun olmayabilir. Önce sözcüğün çevresindeki eylem ve nesneleri incele; sonra olası anlamı cümleye geri koy. Cümle doğal ve tutarlı kalıyorsa seçim desteklenir. Birden çok anlam hâlâ mümkünse, paragraftaki sonraki bilgiye bak. Bağlam kanıtı yetmiyorsa kesin bir anlam uydurmak yerine belirsizliği koru.",
        objective:
          "Çok anlamlı bir sözcüğün bu cümledeki anlamını yakın bağlam kanıtlarıyla belirlemek.",
        explanation:
          "Bağlam, sözcüğün olası anlamlarını sınırlar; seçim hem cümleye hem paragrafın bütününe uymalıdır.",
        example:
          "‘Editör, metnin son taslağını gözden geçirdi.’ Buradaki ‘taslak’, tamamlanmış son metin değil, düzenlenmek üzere hazırlanmış metin biçimidir; ‘son’ sözcüğü bu kullanımın aşamasını gösterir.",
        guided:
          "Her soruda önce hedef sözcüğü çevreleyen ifadeleri belirle, sonra seçenekleri cümleye geri koyarak kontrol et.",
      },
      study: {
        title: "Bağlamdaki anlam ipuçlarını bul",
        body: "Sahne ekibi, dekorun yerini değiştirmeden önce zemine küçük işaretler koydu. Prova sırasında oyuncular, bu işaretlere bakarak sahnedeki duruşlarını ayarladı. Gösteri günü işaretler izleyicilerin göremeyeceği biçimde kapatıldı.",
        skillCode: "RC_DETAIL",
      },
      practice: {
        title: "Çok anlamlı sözcüğü cümlede çöz",
        body: "Ela, sunumun taslağını arkadaşına gönderdi. Arkadaşı, ikinci bölümdeki örneğin düşünceyi daha açık gösterdiğini yazdı. Ela, son metni hazırlarken bu bölümü korudu ve tekrar eden iki cümleyi çıkardı.",
        skillCode: "RC_DETAIL",
      },
      reinforcement: {
        title: "Anlamı yakın ifadelerle doğrula",
        body: "Kulüp, dönem sonunda yaptığı çalışmaları kısa bir bültende topladı. Editör, her haberin başına içeriği özetleyen bir başlık ekledi. Okurlar, ilgilendikleri bölümü başlıklardan seçip ilgili habere geçti.",
        skillCode: "RC_DETAIL",
      },
      assessment: {
        title: "Bağlamdan anlamı ölç",
        body: "Atölyede kullanılan örnek parçalar ayrı kutulara yerleştirildi. Bir notta, ‘Parçanın ölçüsü bu düzeneğe uygun.’ yazıyordu. Başka bir notta ise ‘Bu parça deneme amacına uygun.’ ifadesi yer aldı. Ekip, iki notu karşılaştırıp aynı sözcüğün birinde ölçü, diğerinde amaç için kullanıldığını belirtti.",
        skillCode: "RC_DETAIL",
      },
      exercises: [
        {
          contentKey: "p1d2-study",
          title: "Sözcüğü yakın cümleyle açıkla",
          templateType: "COMPREHENSION",
          skillCode: "RC_DETAIL",
          instructions: "Hedef sözcüğün anlamını çevresindeki eylem ve bilgilerle sınayın.",
          questions: [
            {
              prompt: "Oyuncular işaretleri ne için kullandı?",
              options: [
                "Dekoru boyamak için",
                "Sahnedeki duruşlarını ayarlamak için",
                "İzleyici yerlerini seçmek için",
                "Gösteri tarihini belirlemek için",
              ],
              correctIndex: 1,
              explanation:
                "Metin, oyuncuların işaretlere bakarak sahnedeki duruşlarını ayarladığını söylüyor.",
              hint: "İkinci cümlede işaretlerin hangi eyleme yardım ettiğini bul.",
            },
            {
              prompt: "‘Kapatıldı’ sözcüğü bağlamda ne anlatıyor?",
              options: [
                "İşaretlerin izleyiciye açık bırakılması",
                "Zeminin gösteri öncesinde kaldırılması",
                "İşaretlerin görünmesi engellendi",
                "Perde ve dekorun gösteri sonrasında değişmesi",
              ],
              correctIndex: 2,
              explanation:
                "İşaretler izleyicilerin göremeyeceği hâle getirildi; bağlamdaki anlam görünürlüğü örtmektir.",
              hint: "‘İzleyicilerin göremeyeceği biçimde’ bölümünü düşün.",
            },
            {
              prompt:
                "İşaretlerin prova ve gösteri günlerinde farklı biçimde kullanılması neyi gösterir?",
              options: [
                "İşaretlerin yalnızca gösteri dekorunu değiştirmek için kullanıldığını",
                "Oyuncular provada onlardan yararlanır; izleyiciler gösteride görmez",
                "Prova bitince oyuncuların sahnedeki yerinin rastgele belirlendiğini",
                "Oyuncular provada onları ezberler, gösteride işaretler kaldırılır",
              ],
              correctIndex: 1,
              explanation: "Metin, izleyicilerin işaretleri görmemesini özellikle belirtiyor.",
              hint: "Cümlede kimin görmemesi hedefleniyor?",
            },
          ],
        },
        {
          contentKey: "p1d2-practice",
          title: "Sözcüğün anlamını metne geri koy",
          templateType: "COMPREHENSION",
          skillCode: "RC_DETAIL",
          instructions: "Sözcüğün anlamını cümlenin ve paragrafın bütünüyle doğrula.",
          questions: [
            {
              prompt: "‘Taslak’ sözcüğü Ela'nın cümlesinde neyi anlatıyor?",
              options: [
                "Düzenlenecek sunum metnini",
                "Sunumda kullanılan sahneyi",
                "Arkadaşının yazdığı başlığı",
                "Çıkarılan iki cümleyi",
              ],
              correctIndex: 0,
              explanation:
                "Arkadaşı taslağa yorum yapıyor; Ela da ardından son metni hazırlıyor. Bu sıra, taslağın düzenlenecek metin olduğunu gösterir.",
              hint: "Taslağın ardından hangi metin hazırlanıyor?",
            },
            {
              prompt: "Ela son metinde hangi değişiklikleri yaptı?",
              options: [
                "Örneği metinden çıkardı, başlığı sonradan değiştirdi",
                "Örneği korudu, tekrar eden cümleleri çıkardı",
                "Sunumun ikinci bölümünü ve bütün örneklerini sildi",
                "Arkadaşının önerisini hiçbir değişiklik yapmadan aynen uyguladı",
              ],
              correctIndex: 1,
              explanation: "Son cümle iki işlemi açıkça bildiriyor.",
              hint: "Son cümledeki ‘korudu’ ve ‘çıkardı’ fiillerine bak.",
            },
            {
              prompt: "Arkadaşının yorumu örnek için ne söylüyor?",
              options: [
                "Düşünceyi daha açık gösterdiğini",
                "İkinci bölümde bulunmadığını",
                "Sunumun süresini kısalttığını",
                "Taslağın tamamını değiştirdiğini",
              ],
              correctIndex: 0,
              explanation:
                "Arkadaş, ikinci bölümdeki örneğin düşünceyi daha açık gösterdiğini yazıyor.",
              hint: "Yorumdaki ‘daha açık’ ifadesinin neye bağlandığını bul.",
            },
          ],
        },
        {
          contentKey: "p1d2-reinforcement",
          title: "Başlığın metindeki görevini bul",
          templateType: "COMPREHENSION",
          skillCode: "RC_DETAIL",
          instructions: "Bir sözcüğün metindeki görevini, sonraki eylemlerle birlikte açıklayın.",
          questions: [
            {
              prompt: "Başlıklar bültende hangi görevi üstleniyor?",
              options: [
                "Her haberin içeriğini özetliyor",
                "Haberleri tarih sırasından çıkarıyor",
                "Bülteni uzatıyor",
                "Okurların haber yazmasını sağlıyor",
              ],
              correctIndex: 0,
              explanation: "Başlıkların içeriği özetlediği doğrudan belirtiliyor.",
              hint: "Başlığın ardından hangi açıklama geliyor?",
            },
            {
              prompt: "Okurlar ilgilendikleri habere nasıl geçiyor?",
              options: [
                "Başlıklardan seçim yaparak",
                "Editöre telefon ederek",
                "Bülteni yeniden yazarak",
                "Rastgele bir sayfa açarak",
              ],
              correctIndex: 0,
              explanation: "Okurlar önce başlıklardan bölüm seçiyor, sonra ilgili habere geçiyor.",
              hint: "Son cümledeki eylem sırasını izle.",
            },
            {
              prompt: "‘Toplamak’ sözcüğü metinde hangi anlamda kullanılmıştır?",
              options: [
                "Çalışmaları bir araya getirmek",
                "Bültendeki kâğıtları yerden almak",
                "Okurları bir yerde buluşturmak",
                "Haberleri silmek",
              ],
              correctIndex: 0,
              explanation: "Çalışmalar bültende bir araya getirilmiştir.",
              hint: "Nelerin bir bültende toplandığına bak.",
            },
          ],
        },
        {
          contentKey: "p1d2-assessment",
          title: "Yeni bağlamda anlamı doğrula",
          templateType: "MIXED",
          skillCode: "RC_DETAIL",
          instructions: "Aynı sözcüğün farklı görevlerini bağlam ipuçlarıyla ayır.",
          questions: [
            {
              prompt: "İlk ‘uygun’ kullanımı neyi anlatıyor?",
              options: [
                "Parçanın ölçüsünün denenecek düzeneğe uygun olmasını",
                "Kutunun etiketinin hangi renkle yazıldığını",
                "Ekibin çalışma saatinin deneme amacına göre değişmesini",
                "Örnek parçaların kutulardan birine yerleştirilmesini",
              ],
              correctIndex: 0,
              explanation: "İlk kullanım, parçanın ölçüsüyle ilişkilendirilmiş.",
              hint: "Sözcüğün yanındaki ‘ölçü’ bilgisini kullan.",
            },
            {
              prompt: "İkinci ‘uygun’ kullanımı hangi anlam ayrımını gösteriyor?",
              options: [
                "Parçanın deneme amacına uymasını",
                "Parçanın kutuya sığmamasını",
                "Etiketin yerini",
                "Notların sırasını",
              ],
              correctIndex: 0,
              explanation:
                "İkinci kullanım parçanın ölçüsünden değil, deneme amacından söz ediyor.",
              hint: "‘Bazen ... bazen ...’ yapısındaki iki karşılığı ayır.",
            },
            {
              prompt: "Sözcüğün doğru anlamını seçmek için en sağlam yöntem hangisidir?",
              options: [
                "Her bağlamda sözcüğün ilk akla gelen anlamını seçmek",
                "Sözcüğü cümleye geri koyup anlamı kontrol etmek",
                "Açıklamalar arasında en uzun olanı düşünmeden işaretlemek",
                "Sözcüğün sesine bakıp çevresindeki cümleleri yok saymak",
              ],
              correctIndex: 1,
              explanation: "Anlamın cümle ve paragrafla tutarlı kalması bağlam kanıtını sınar.",
              hint: "Seçtiğin anlamı yeniden cümlede dene.",
            },
          ],
        },
      ],
    }),
  ];
}

/** Only currently released source packages may be written by the legacy B/C/D seed. */
export const EDUCATION_V2_P1_BCD_RELEASED_PROGRAMS = EDUCATION_V2_P1_BCD_PROGRAMS.filter(
  (program) => program.publicationApproved,
);

export function p1BCDId(
  program: P1BCDProgram,
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
  return `edu-v2-p1-${program.routeFamily.toLowerCase()}-${kind}-${key}`;
}

export function p1BCDContentVersionId(program: P1BCDProgram, key: string): string {
  return p1BCDId(program, "contentVersion", `${key}-v1`);
}

export function p1BCDTemplateId(program: P1BCDProgram, key: string): string {
  return p1BCDId(program, "template", key);
}

export function p1BCDTemplateVersionId(program: P1BCDProgram, key: string): string {
  return p1BCDId(program, "templateVersion", `${key}-v1`);
}

export function validateP1BCDProgram(program: P1BCDProgram): string[] {
  const errors: string[] = [];
  const contentKeys = new Set(program.content.map((item) => item.key));
  const contentByKey = new Map(program.content.map((item) => [item.key, item]));
  const exercises = new Map(program.exercises.map((item) => [item.key, item]));
  const steps = program.path.units.flatMap((unit) => unit.steps);
  const contentUsage = new Map<string, number>();
  const exerciseUsage = new Map<string, number>();
  const expectedOutcomeKey = program.learningOutcome.key;
  const expectedOutcome = program.learningOutcome;
  if (!Number.isInteger(program.cycleVersion) || program.cycleVersion < 1)
    errors.push("cycleVersion pozitif tam sayı olmalı");
  if (!Number.isInteger(program.sequence) || program.sequence < 1)
    errors.push("sequence pozitif tam sayı olmalı");
  if (typeof program.publicationApproved !== "boolean")
    errors.push("açık yayın izni boole değeri olmalı");
  if (program.sequence > 1) {
    const provenance = program.editorialProvenance;
    if (
      !provenance ||
      provenance.contentOrigin !== "ORIGINAL_FICTION" ||
      provenance.factualClaimPolicy !== "NO_EXTERNAL_FACTUAL_CLAIMS" ||
      provenance.curriculumReferences.length === 0 ||
      !provenance.languageReference.url.startsWith("https://")
    ) {
      errors.push("yeni döngü için özgün içerik/provenance ve kaynak kaydı gerekli");
    }
    const questions = program.exercises.flatMap((exercise) =>
      exercise.questions.map((item) => ({
        key: item.key,
        prompt: item.prompt,
        contentKey: exercise.contentKey,
        skillCode: exercise.skillCode,
        options: item.options,
        correctOptionId: item.correctOptionId,
        editorialReviewStatus: program.editorialReviewStatus,
      })),
    );
    const quality = assessMultipleChoicePackageQuality(questions);
    if (quality.clearLengthOutlierCount > 0) {
      const keys = quality.questionReports
        .filter((item) => item.clearLengthOutlier)
        .map((item) => item.key)
        .join(", ");
      errors.push(`yeni döngüde doğru cevap için belirgin uzunluk ipucu var: ${keys}`);
    }
    if (quality.correctUniqueLongestRatio > 0.5)
      errors.push("yeni döngüde doğru cevap sistematik biçimde tek başına en uzun");
    if (quality.correctUniqueShortestRatio > 0.5)
      errors.push("yeni döngüde doğru cevap sistematik biçimde tek başına en kısa");
    if (quality.maxCorrectPositionRatio > 0.45)
      errors.push("yeni döngüde doğru seçenek konumu dengesiz");
    if (quality.repeatedSkillQuestionPairs.length > 0)
      errors.push("yeni döngüde aynı içerik/beceride yinelenen soru adayı var");
    if (program.publicationApproved && quality.needsEditorialReview)
      errors.push("yayın öncesi soru paketi kalite ölçütleri ve editoryal inceleme tamamlanmalı");
  }
  const mappedOutcomeKeys = new Set<string>();
  const recordUsage = (usage: Map<string, number>, key: string | undefined) => {
    if (key) usage.set(key, (usage.get(key) ?? 0) + 1);
  };
  if (program.path.units.length !== 1) errors.push("tek pedagojik unit gerekli");
  if (steps.length === 0) errors.push("route en az bir öğrenme adımı içermeli");
  for (const [index, step] of steps.entries()) {
    if (step.type === "TEACHING" && !step.contentKey)
      errors.push(`teach içeriği eksik: ${step.key}`);
    if (
      step.type !== "TEACHING" &&
      step.type !== "ASSESSMENT" &&
      (!step.contentKey || !step.exerciseKey)
    ) {
      errors.push(`exercise bağlantısı eksik: ${step.key}`);
    }
    if (step.type === "ASSESSMENT" && !step.assessmentKey)
      errors.push(`assessment bağlantısı eksik: ${step.key}`);
    if (step.learningOutcomeKeys.length === 0)
      errors.push(`öğrenme kazanımı bağlantısı eksik: ${step.key}`);
    for (const outcomeKey of step.learningOutcomeKeys) {
      if (outcomeKey !== expectedOutcomeKey)
        errors.push(`yanlış öğrenme kazanımı: ${step.key} -> ${outcomeKey}`);
      mappedOutcomeKeys.add(outcomeKey);
    }
    if (step.type !== "ASSESSMENT") {
      const sourceSkillCode = step.contentKey
        ? contentByKey.get(step.contentKey)?.skillCode
        : step.exerciseKey
          ? exercises.get(step.exerciseKey)?.skillCode
          : undefined;
      if (
        sourceSkillCode &&
        !expectedOutcome.targetSkillCodes.some((skillCode) => skillCode === sourceSkillCode)
      ) {
        errors.push(`kazanım içerikle uyumsuz: ${step.key} -> ${sourceSkillCode}`);
      }
    }
    if (step.contentKey && !contentKeys.has(step.contentKey))
      errors.push(`bilinmeyen content: ${step.contentKey}`);
    if (step.exerciseKey && !exercises.has(step.exerciseKey))
      errors.push(`bilinmeyen exercise: ${step.exerciseKey}`);
    if (step.type === "TEACHING" && (step.exerciseKey || step.assessmentKey))
      errors.push(`teach adımı exercise/assessment taşıyamaz: ${step.key}`);
    if (step.type === "ASSESSMENT" && (step.contentKey || step.exerciseKey))
      errors.push(`assessment adımı doğrudan content/exercise taşıyamaz: ${step.key}`);
    recordUsage(contentUsage, step.contentKey);
    recordUsage(exerciseUsage, step.exerciseKey);
    recordUsage(
      exerciseUsage,
      step.assessmentKey
        ? program.assessments.find((assessment) => assessment.key === step.assessmentKey)
            ?.templateExerciseKey
        : undefined,
    );
    const expectedPrevious = steps[index - 1]?.key;
    const prerequisites = step.prerequisiteStepKeys ?? [];
    if (index === 0 && prerequisites.length > 0)
      errors.push(`İlk route adımı prerequisite taşıyamaz: ${step.key}`);
    if (index > 0 && (prerequisites.length !== 1 || prerequisites[0] !== expectedPrevious)) {
      errors.push(`Linear prerequisite zinciri geçersiz: ${step.key}`);
    }
  }
  if (!mappedOutcomeKeys.has(expectedOutcomeKey))
    errors.push(`rota öğrenme kazanımıyla eşleşmiyor: ${expectedOutcomeKey}`);
  const stepExerciseKeys = new Set(
    steps.map((step) => step.exerciseKey).filter((key): key is string => Boolean(key)),
  );
  for (const exercise of program.exercises) {
    if (!contentKeys.has(exercise.contentKey))
      errors.push(`exercise content eksik: ${exercise.key}`);
    if (exercise.questions.length < 3)
      errors.push(`exercise soru sayısı yetersiz: ${exercise.key}`);
    if (exercise.contract.competency !== exercise.skillCode)
      errors.push(`skill eşleşmiyor: ${exercise.key}`);
    const questionKeys = exercise.questions.map((question) => question.key);
    if (new Set(questionKeys).size !== questionKeys.length)
      errors.push(`exercise soru anahtarı tekrarlı: ${exercise.key}`);
    if (!stepExerciseKeys.has(exercise.key)) recordUsage(contentUsage, exercise.contentKey);
    const boundStep = steps.find((step) => step.exerciseKey === exercise.key);
    if (boundStep && boundStep.contentKey !== exercise.contentKey) {
      errors.push(`exercise/content eşleşmesi uyuşmuyor: ${exercise.key}`);
    }
  }
  if (program.assessments.length !== 1) errors.push("tek assessment gerekli");
  for (const assessment of program.assessments) {
    const exercise = exercises.get(assessment.templateExerciseKey);
    if (!exercise) errors.push(`assessment template eksik: ${assessment.key}`);
    if (assessment.questionKeys.length !== assessment.config.questionCount)
      errors.push(`assessment soru sayısı uyuşmuyor: ${assessment.key}`);
    if (exercise) {
      const exerciseQuestionKeys = exercise.questions.map((question) => question.key);
      if (
        assessment.questionKeys.length !== exerciseQuestionKeys.length ||
        assessment.questionKeys.some((key, index) => key !== exerciseQuestionKeys[index])
      ) {
        errors.push(`assessment soru/template eşleşmesi uyuşmuyor: ${assessment.key}`);
      }
    }
    if (
      assessment.config.minimumAnsweredCount > assessment.config.questionCount ||
      assessment.config.minimumScorableCount > assessment.config.questionCount
    ) {
      errors.push(`assessment answered/scorable sınırı geçersiz: ${assessment.key}`);
    }
  }
  for (const content of program.content) {
    if ((contentUsage.get(content.key) ?? 0) !== 1)
      errors.push(`content kullanım sayısı geçersiz: ${content.key}`);
  }
  for (const exercise of program.exercises) {
    if ((exerciseUsage.get(exercise.key) ?? 0) !== 1)
      errors.push(`exercise kullanım sayısı geçersiz: ${exercise.key}`);
  }
  return errors;
}

for (const program of EDUCATION_V2_P1_BCD_PROGRAMS) {
  const errors = validateP1BCDProgram(program);
  if (errors.length > 0) throw new Error(`${program.programId} geçersiz: ${errors.join("; ")}`);
}
