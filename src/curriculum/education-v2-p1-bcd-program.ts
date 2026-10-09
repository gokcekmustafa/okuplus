import {
  parseTrainingExerciseVersionConfig,
  type TrainingExerciseVersionConfig,
} from "../modules/training/exercise-contract.js";
import type {
  ProgramContent,
  ProgramExercise,
  ProgramQuestion,
} from "./education-v2-p0-program.js";

/**
 * P1-B/C/D are authored as separate, pre-built route packages. Their
 * existence does not make them automatically selectable: route-selection.ts
 * still requires the matching official measurement contract.
 */
export type P1BCDRouteFamily = "B" | "C" | "D";

export type P1BCDPathStep = {
  key: string;
  title: string;
  type: "TEACHING" | "SMALL_STUDY" | "PRACTICE" | "REINFORCEMENT" | "ASSESSMENT";
  contentKey?: string;
  exerciseKey?: string;
  assessmentKey?: string;
  prerequisiteStepKeys?: string[];
};

export type P1BCDProgram = {
  programId: string;
  routeFamily: P1BCDRouteFamily;
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
      ? "PHRASE_CHUNKING"
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
      timeRole: "NONE",
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
      contractFamily === "PHRASE_CHUNKING"
        ? "QUESTION_PHRASE_CHUNKING"
        : "QUESTION_MULTIPLE_CHOICE",
    settings: { optionCount: 4, mobileLayout: "STACKED", title },
  });
}

type RouteSpec = {
  family: P1BCDRouteFamily;
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
  const assessmentKey = `${spec.family.toLowerCase()}-assessment`;
  const teachKey = `${spec.family.toLowerCase()}-teach`;
  const studyKey = `${spec.family.toLowerCase()}-study`;
  const practiceKey = `${spec.family.toLowerCase()}-practice`;
  const reinforcementKey = `${spec.family.toLowerCase()}-reinforcement`;
  return {
    programId: spec.programId,
    routeFamily: spec.family,
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
              contentKey: spec.teach.key,
            },
            {
              key: studyKey,
              title: spec.study.title,
              type: "SMALL_STUDY",
              contentKey: spec.study.key,
              exerciseKey: spec.studyExercise.key,
              prerequisiteStepKeys: [teachKey],
            },
            {
              key: practiceKey,
              title: spec.practice.title,
              type: "PRACTICE",
              contentKey: spec.practice.key,
              exerciseKey: spec.practiceExercise.key,
              prerequisiteStepKeys: [studyKey],
            },
            {
              key: reinforcementKey,
              title: spec.reinforcement.title,
              type: "REINFORCEMENT",
              contentKey: spec.reinforcement.key,
              exerciseKey: spec.reinforcementExercise.key,
              prerequisiteStepKeys: [practiceKey],
            },
            {
              key: `${spec.family.toLowerCase()}-assessment-step`,
              title: spec.assessment.title,
              type: "ASSESSMENT",
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
            ["a", "Kütüphane kapanmadan önce"],
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
            ["a", "Gölgeliklerin öğrencilerin dinlenmesini kolaylaştırması"],
            ["b", "Öğle arasının her gün aynı sürmesi"],
            ["c", "Bahçenin okuldan uzakta olması"],
            ["d", "Sıcak günlerin hiç yaşanmaması"],
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
            ["a", "İlk çalışmanın bakımını açıklar"],
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
            ["b", "Ayrıntının cümle içindeki görevini yeniden kontrol etmek"],
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
            ["a", "Kullanılmayan ve temizlenen alanı"],
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
            ["b", "Anlam grubunu ve ilişkiyi yeniden okumak"],
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
            ["a", "Sunum için kaynaklarını düzenlediği"],
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
            ["a", "Sonucu doğrudan destekleyen açık bilgi"],
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
            ["a", "Değirmen hem korunmuş hem de ziyaretçilere açıklanmıştır"],
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
            ["a", "Sonuçları düzenleyip değerlendirmek"],
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
            ["a", "Sonucun hangi açık bilgilerden çıktığı gösterilir"],
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
            ["a", "Metnin kesin olarak desteklediği sınırlı sonuç"],
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
            ["a", "Teknoloji, ziyaretçilerin tarihî bilgiyi karşılaştırmasına yardım ediyor"],
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
            ["a", "Haritaların büyütülüp dönemlerin karşılaştırılabilmesi"],
            ["b", "Müzenin eski olması"],
            ["c", "Ekranların büyük olması"],
            ["d", "Ziyaretçilerin müzeye gelmesi"],
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
            ["a", "Bütün öğrencilerin kesinlikle dikkatli olduğu"],
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
            ["a", "Her iddianın metinde en az bir destekleyici bağı olması"],
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
            ["a", "Başka bir yere düzenli olarak gider"],
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
            ["a", "Kelimenin çevresindeki cümle kanıtlarını okumak"],
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
            ["a", "Konuya özgü ilişkileri anlamayı kolaylaştırır"],
            ["b", "Her kelimeye tek anlam verir"],
            ["c", "Cümle kanıtlarını gereksiz kılar"],
            ["d", "Metindeki sözcükleri değiştirir"],
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
            ["a", "Cümlenin bütün anlamını koruyan seçim"],
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
            ["a", "Bir sürecin basamaklarından biri"],
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
            ["a", "Bu kelime cümlede hangi bilgiyle ilişki kuruyor?"],
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
            ["a", "Köklerinin toprağa yerleşmesi"],
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
            ["a", "Seçtiğin anlam cümlenin tamamını açıklıyorsa"],
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
];

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
  const exercises = new Map(program.exercises.map((item) => [item.key, item]));
  const steps = program.path.units.flatMap((unit) => unit.steps);
  if (program.path.units.length !== 1) errors.push("tek pedagojik unit gerekli");
  if (steps.length !== 5) errors.push("beş adımlı minimum route akışı gerekli");
  for (const step of steps) {
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
    if (step.contentKey && !contentKeys.has(step.contentKey))
      errors.push(`bilinmeyen content: ${step.contentKey}`);
    if (step.exerciseKey && !exercises.has(step.exerciseKey))
      errors.push(`bilinmeyen exercise: ${step.exerciseKey}`);
  }
  for (const exercise of program.exercises) {
    if (!contentKeys.has(exercise.contentKey))
      errors.push(`exercise content eksik: ${exercise.key}`);
    if (exercise.questions.length < 3)
      errors.push(`exercise soru sayısı yetersiz: ${exercise.key}`);
    if (exercise.contract.competency !== exercise.skillCode)
      errors.push(`skill eşleşmiyor: ${exercise.key}`);
  }
  if (program.assessments.length !== 1) errors.push("tek assessment gerekli");
  for (const assessment of program.assessments) {
    const exercise = exercises.get(assessment.templateExerciseKey);
    if (!exercise) errors.push(`assessment template eksik: ${assessment.key}`);
    if (assessment.questionKeys.length !== assessment.config.questionCount)
      errors.push(`assessment soru sayısı uyuşmuyor: ${assessment.key}`);
  }
  return errors;
}

for (const program of EDUCATION_V2_P1_BCD_PROGRAMS) {
  const errors = validateP1BCDProgram(program);
  if (errors.length > 0) throw new Error(`${program.programId} geçersiz: ${errors.join("; ")}`);
}
