import {
  FAST_READING_RENDERERS,
  parseTrainingExerciseVersionConfig,
  type TrainingExerciseVersionConfig,
} from "../modules/training/exercise-contract.js";
import { LESSON_METADATA_TYPE } from "../modules/lessons/contract.js";

/**
 * Oku+ Education V2 P0 content manifest.
 *
 * This file is intentionally persistence-agnostic. It is the reviewed source
 * for the first small, teaching-first program; the companion seed script is
 * the only place that may translate it into database rows. Nothing in this
 * manifest implies that the rows have been applied to any environment.
 */

export const EDUCATION_V2_P0_PROGRAM_ID = "OKU-EDUCATION-V2-P0-FOUNDATION";
export const EDUCATION_V2_P0_AGE_BAND = "13–17";
export const EDUCATION_V2_P0_LEVEL_CODE_ENV = "EDUCATION_V2_P0_LEVEL_CODE";
export const EDUCATION_V2_P0_SKILL_CODES_ENV = "EDUCATION_V2_P0_SKILL_CODES";

export type EducationV2P0SkillDefinition = {
  code: string;
  name: string;
  category: "MAIN_IDEA" | "DETAIL" | "INFERENCE" | "COMPREHENSION";
  description: string;
  displayOrder: number;
};

/**
 * Program-specific catalog definitions. The existing placement manifest stays
 * limited to its three calibrated RC skills; these six codes are the
 * education-path skills used by the first teaching program.
 */
export const EDUCATION_V2_P0_SKILL_MANIFEST: readonly EducationV2P0SkillDefinition[] = [
  {
    code: "FAST_ATTENTION",
    name: "Odaklı Okuma",
    category: "COMPREHENSION",
    description: "Okuma sırasında dikkati anlam taşıyan bilgilere yöneltme.",
    displayOrder: 100,
  },
  {
    code: "FAST_RECOGNITION",
    name: "Hızlı Tanıma",
    category: "COMPREHENSION",
    description: "Anlam ilişkisini kuran kelimeleri hızlı ve doğru fark etme.",
    displayOrder: 110,
  },
  {
    code: "FAST_CHUNKING",
    name: "Anlam Gruplama",
    category: "COMPREHENSION",
    description: "Kelimeleri anlam taşıyan küçük gruplar halinde okuyabilme.",
    displayOrder: 120,
  },
  {
    code: "RC_MAIN_IDEA",
    name: "Ana Fikir",
    category: "MAIN_IDEA",
    description: "Metnin bütünüyle anlatılan temel düşünceyi ayırt etme.",
    displayOrder: 200,
  },
  {
    code: "RC_DETAIL",
    name: "Önemli Ayrıntı",
    category: "DETAIL",
    description: "Ana düşünceyi destekleyen metin kanıtını bulma.",
    displayOrder: 210,
  },
  {
    code: "RC_INFERENCE",
    name: "Çıkarım",
    category: "INFERENCE",
    description: "Birden fazla metin kanıtından güvenilir sonuç çıkarma.",
    displayOrder: 220,
  },
];

export type ProgramQuestion = {
  key: string;
  prompt: string;
  options: Array<{ id: string; text: string; position: number }>;
  correctOptionId: string;
  explanation: string;
  hint: string;
  difficulty: number;
};

export type ProgramContent = {
  key: string;
  title: string;
  body: string;
  difficulty: number;
  skillCode: string;
  lesson?: {
    objective: string;
    explanation: string;
    workedExample: string;
    guidedPractice: string;
    nextExerciseKey: string;
  };
};

export type ProgramExercise = {
  key: string;
  title: string;
  templateType: "COMPREHENSION" | "FLUENCY" | "INFERENCE" | "MIXED";
  contentKey: string;
  skillCode: string;
  contract: TrainingExerciseVersionConfig;
  questions: ProgramQuestion[];
};

export type ProgramStep = {
  key: string;
  title: string;
  type: "TEACHING" | "SMALL_STUDY" | "PRACTICE" | "REINFORCEMENT" | "ASSESSMENT";
  contentKey?: string;
  exerciseKey?: string;
  assessmentKey?: string;
  prerequisiteStepKeys?: string[];
  completionRule?: { minimumScore?: number };
};

export type ProgramPath = {
  key: string;
  code: string;
  title: string;
  area: "FAST_READING" | "READING_COMPREHENSION" | "COMMON";
  unitCode: string;
  unitTitle: string;
  steps: ProgramStep[];
};

export type ProgramAssessment = {
  key: string;
  title: string;
  templateExerciseKey: string;
  questionKeys: string[];
  config: {
    questionCount: number;
    minimumScorableCount: number;
    minimumAnsweredCount: number;
    completionMinimumScore: number;
  };
};

export type EducationV2P0Program = {
  programId: string;
  ageBand: string;
  content: ProgramContent[];
  exercises: ProgramExercise[];
  assessments: ProgramAssessment[];
  paths: ProgramPath[];
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

function contract(
  key: string,
  title: string,
  family: TrainingExerciseVersionConfig["family"],
  competency: TrainingExerciseVersionConfig["competency"],
  difficulty: TrainingExerciseVersionConfig["difficulty"],
  rendererKey: string,
  instructions: string,
): TrainingExerciseVersionConfig {
  return parseTrainingExerciseVersionConfig({
    schemaVersion: 1,
    family,
    competency,
    difficulty,
    estimatedDurationSeconds: 150,
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
    rendererKey,
    settings: {
      optionCount: 4,
      mobileLayout: "STACKED",
      title,
    },
  });
}

export const EDUCATION_V2_P0_PROGRAM: EducationV2P0Program = {
  programId: EDUCATION_V2_P0_PROGRAM_ID,
  ageBand: EDUCATION_V2_P0_AGE_BAND,
  content: [
    {
      key: "fast-attention-lesson",
      title: "Dikkatini metinde tut",
      difficulty: 1,
      skillCode: "FAST_ATTENTION",
      body: [
        "Hızlı okumada amaç her kelimeyi aceleyle geçmek değil, dikkati anlam taşıyan kelimelerde tutmaktır.",
        "Okumaya başlamadan önce kısa bir hedef belirlemek, gözün metin içinde dağılmasını azaltır. Bir cümleyi bitirdiğinde tek bir soruyla kontrol et: Bu cümle ne anlatıyor?",
        "Kısa odak aralıklarıyla çalışmak, uzun süre zorlanmaktan daha verimlidir. Önce birkaç cümleye dikkatini ver, sonra ne anladığını kendi sözlerinle söyle.",
      ].join("\n\n"),
      lesson: {
        objective: "Kısa bir metin parçasında dikkatini anlam taşıyan bilgilere yönlendirmek.",
        explanation:
          "Okumaya başlamadan önce küçük bir hedef belirle. Örneğin, metnin hangi olaydan söz ettiğini bulmaya çalış. Her cümlede bütün kelimelere aynı ağırlığı vermek yerine anlamı taşıyan kelimeleri fark et.",
        workedExample:
          "‘Sabah yağmur yağdı; bu nedenle parkta daha az kişi vardı.’ cümlesinde dikkat edilmesi gereken ilişki yağmur ile parktaki kişi sayısı arasındadır.",
        guidedPractice:
          "Bir sonraki kısa alıştırmada önce soruyu oku, sonra metni tek bir hedefle incele. Cevabı seçmeden önce hedefinle ilgili kelimeleri zihninde işaretle.",
        nextExerciseKey: "fast-attention-study",
      },
    },
    {
      key: "fast-recognition-practice",
      title: "Anlam taşıyan kelimeleri yakala",
      difficulty: 1.5,
      skillCode: "FAST_RECOGNITION",
      body: [
        "Bir metnin anlamını kurarken bazı kelimeler olayın yönünü değiştirir: çünkü, ancak, önce, sonra ve bu nedenle gibi ifadeler bunlara örnektir.",
        "Bu kelimeleri fark etmek, cümleleri tek tek okumaktan daha hızlı biçimde ilişki kurmana yardımcı olur.",
        "Şimdi kısa bir metinde anlamı değiştiren kelimeyi bul ve cümlenin hangi parçasını birbirine bağladığını düşün.",
      ].join("\n\n"),
    },
    {
      key: "fast-chunking-reinforcement",
      title: "Cümleyi anlam gruplarıyla oku",
      difficulty: 2,
      skillCode: "FAST_CHUNKING",
      body: [
        "Okurken kelimeleri tek tek saymak yerine birlikte anlam taşıyan küçük gruplar halinde görmeyi dene.",
        "‘Kütüphanenin sessiz köşesindeki masa’ ifadesi dört ayrı kelime değil, tek bir yer bilgisidir.",
        "Anlam gruplarını fark etmek hem göz hareketini düzenler hem de cümlenin ana ilişkisini korumana yardım eder.",
      ].join("\n\n"),
    },
    {
      key: "rc-main-idea-lesson",
      title: "Ana fikri tek cümlede söyle",
      difficulty: 1,
      skillCode: "RC_MAIN_IDEA",
      body: [
        "Bir metnin ana fikri, yazarın metnin bütünüyle anlatmak istediği temel düşüncedir.",
        "Ana fikri bulmak için yalnızca en çarpıcı ayrıntıya değil, bütün cümlelerin ortak yönüne bak. Ayrıntılar ana fikri destekler; ana fikrin kendisi olmak zorunda değildir.",
        "Metni bitirdiğinde ‘Bu metin en çok neyi anlatıyor?’ sorusuna kendi cümlenle cevap ver. Cevabın metnin tamamını kapsıyorsa ana fikre yaklaşmışsındır.",
      ].join("\n\n"),
      lesson: {
        objective: "Kısa bir metnin tamamını kapsayan ana fikri ayırt etmek.",
        explanation:
          "Ana fikir, tek bir ayrıntı değil, metindeki bilgileri bir arada tutan düşüncedir. Önce metnin tekrar ettiği konuya, sonra bu konu hakkında verdiği ortak mesaja bak.",
        workedExample:
          "Bir metin farklı öğrencilerin küçük not kartları kullandığını anlatıyorsa ana fikir ‘Not kartları düzenli çalışmayı kolaylaştırabilir’ olabilir; tek bir öğrencinin kart rengini söylemek ana fikir değildir.",
        guidedPractice:
          "Kısa metni okuduktan sonra iki ayrıntıyı birleştiren tek cümle yaz. Yalnızca bir örneği tekrar eden cümleleri ele.",
        nextExerciseKey: "rc-detail-study",
      },
    },
    {
      key: "rc-detail-study",
      title: "Önemli ayrıntıyı kanıtla",
      difficulty: 1.5,
      skillCode: "RC_DETAIL",
      body: [
        "Önemli ayrıntı, metindeki ana düşünceyi destekleyen ve sorunun cevabını doğrudan kanıtlayan bilgidir.",
        "Cevap seçeneklerini okurken metinde karşılığı olmayan ama kulağa doğru gelen cümlelere dikkat et.",
        "Bir seçeneği işaretlemeden önce ‘Bunu metnin hangi cümlesi destekliyor?’ diye sor.",
      ].join("\n\n"),
    },
    {
      key: "rc-inference-practice",
      title: "Metinden çıkarım yap",
      difficulty: 2,
      skillCode: "RC_INFERENCE",
      body: [
        "Çıkarım, metinde kelimesi kelimesine yazmayan fakat verilen bilgilerden mantıklı biçimde ulaşılan sonuçtur.",
        "Çıkarım yaparken kendi bilgini metnin yerine koyma. Önce metindeki iki veya daha fazla kanıtı birleştir, sonra bu kanıtların zorunlu olarak gösterdiği sonuca bak.",
        "Kanıt bulunamayan güçlü yorumlar çıkarım değil, tahmindir.",
      ].join("\n\n"),
    },
    {
      key: "common-reinforcement",
      title: "Odaklan ve anlamı birleştir",
      difficulty: 2,
      skillCode: "FAST_CHUNKING",
      body: [
        "İyi okuma, gözün metinde ilerlemesiyle anlamın zihinde kurulmasını birlikte gerektirir.",
        "Önce anlam taşıyan kelime gruplarını fark et, sonra bu grupların metnin ana düşüncesini nasıl desteklediğini kontrol et.",
        "Bu kısa pekiştirmede hızlı okuma dikkatini ve okuduğunu anlama becerini aynı görevde kullanacaksın.",
      ].join("\n\n"),
    },
    {
      key: "common-test",
      title: "İlk öğrenme döngüsü kontrolü",
      difficulty: 2.5,
      skillCode: "RC_MAIN_IDEA",
      body: [
        "Bir öğrenme adımını tamamlamak yalnızca hızlı cevap vermekle değil, metindeki kanıtı doğru yorumlamakla ilgilidir.",
        "Bu kısa kontrol; dikkatini toplama, anlam gruplarını fark etme, ana fikri ve metin kanıtını kullanma becerilerini birlikte yoklar.",
        "Her cevapta önce metne dön, sonra en kapsamlı ve kanıtlanabilir seçeneği işaretle.",
      ].join("\n\n"),
    },
  ],
  exercises: [
    {
      key: "fast-attention-study",
      title: "Dikkat hedefini seç",
      templateType: "FLUENCY",
      contentKey: "fast-attention-lesson",
      skillCode: "FAST_ATTENTION",
      contract: contract(
        "EDU-V2-P0-FAST-ATTENTION-STUDY",
        "Dikkat hedefini seç",
        "ATTENTION_BURST",
        "FAST_ATTENTION",
        "FOUNDATION",
        FAST_READING_RENDERERS.ATTENTION_BURST,
        "Soruyu oku, kısa metni tek bir dikkat hedefiyle incele ve en uygun seçeneği seç.",
      ),
      questions: [
        question(
          "fast-attention-study-1",
          "Okumaya başlamadan önce dikkatini toplamak için en yararlı ilk adım hangisidir?",
          [
            ["a", "Metindeki her kelimeyi ezberlemek"],
            ["b", "Kısa bir okuma hedefi belirlemek"],
            ["c", "Yalnızca son cümleyi okumak"],
            ["d", "Cevap seçeneklerine bakmadan tahmin etmek"],
          ],
          "b",
          "Küçük ve açık bir hedef, dikkatin metindeki ilgili bilgiye yönelmesine yardım eder.",
          "Okumadan önce kendine tek bir soru sor.",
          1,
        ),
        question(
          "fast-attention-study-2",
          "‘Yağmur başladığı için maç ertelendi.’ cümlesinde dikkat edilmesi gereken temel ilişki hangisidir?",
          [
            ["a", "Yağmur ile erteleme arasındaki neden-sonuç ilişkisi"],
            ["b", "Maçın hangi gün oynandığı"],
            ["c", "Cümlenin kaç kelimeden oluştuğu"],
            ["d", "Yağmurun renginin nasıl göründüğü"],
          ],
          "a",
          "‘İçin’ sözcüğü yağmur ile erteleme arasında neden-sonuç bağı kurar.",
          "Cümlede sonucu açıklayan bölümü bul.",
          1,
        ),
      ],
    },
    {
      key: "fast-recognition-practice",
      title: "Anlam taşıyan kelimeyi bul",
      templateType: "FLUENCY",
      contentKey: "fast-recognition-practice",
      skillCode: "FAST_RECOGNITION",
      contract: contract(
        "EDU-V2-P0-FAST-RECOGNITION-PRACTICE",
        "Anlam taşıyan kelimeyi bul",
        "RAPID_RECOGNITION",
        "FAST_RECOGNITION",
        "DEVELOPING",
        FAST_READING_RENDERERS.RAPID_RECOGNITION,
        "Kısa cümlede anlam ilişkisini kuran kelimeyi fark et ve doğru seçeneği işaretle.",
      ),
      questions: [
        question(
          "fast-recognition-practice-1",
          "‘Kütüphane sessizdi, bu nedenle öğrenciler daha kolay odaklandı.’ cümlesindeki bağ hangi seçenekte doğru açıklanmıştır?",
          [
            ["a", "Sessizlik odaklanmayı kolaylaştırmıştır"],
            ["b", "Öğrenciler kütüphaneden ayrılmıştır"],
            ["c", "Kütüphane gürültülüydü"],
            ["d", "Odaklanmanın nedeni belirtilmemiştir"],
          ],
          "a",
          "‘Bu nedenle’ ifadesi sessizlik ile daha kolay odaklanma arasında sonuç ilişkisi kurar.",
          "Bağlaçtan önceki ve sonraki bilgiyi birlikte oku.",
          1.5,
        ),
        question(
          "fast-recognition-practice-2",
          "‘Önce başlığı okudu, sonra metne geçti.’ cümlesinde sırayı gösteren kelimeler hangileridir?",
          [
            ["a", "başlığı ve metne"],
            ["b", "önce ve sonra"],
            ["c", "okudu ve geçti"],
            ["d", "başlığı ve geçti"],
          ],
          "b",
          "‘Önce’ ve ‘sonra’ olayların sırasını doğrudan gösterir.",
          "Zaman sırasını anlatan kelimeleri ara.",
          1.5,
        ),
      ],
    },
    {
      key: "rc-detail-study",
      title: "Ayrıntıyı metinle eşleştir",
      templateType: "COMPREHENSION",
      contentKey: "rc-detail-study",
      skillCode: "RC_DETAIL",
      contract: contract(
        "EDU-V2-P0-RC-DETAIL-STUDY",
        "Ayrıntıyı metinle eşleştir",
        "DETAIL_EVIDENCE",
        "RC_DETAIL",
        "FOUNDATION",
        "QUESTION_MULTIPLE_CHOICE",
        "Metindeki doğrudan kanıtı bul ve sorunun cevabını bu kanıtla eşleştir.",
      ),
      questions: [
        question(
          "rc-detail-study-1",
          "Bir cevabın metinle desteklendiğini kontrol etmek için hangi soru sorulmalıdır?",
          [
            ["a", "Bu seçenek kulağa ilginç geliyor mu?"],
            ["b", "Bunu metnin hangi cümlesi destekliyor?"],
            ["c", "Bu seçenek en uzun olan mı?"],
            ["d", "Bu bilgiyi daha önce duydum mu?"],
          ],
          "b",
          "Önemli ayrıntı, metindeki doğrudan bir kanıtla gösterilebilir olmalıdır.",
          "Cevabı metindeki bir cümleyle eşleştir.",
          1,
        ),
        question(
          "rc-detail-study-2",
          "Ana fikri destekleyen ayrıntı aşağıdakilerden hangisidir?",
          [
            ["a", "Metindeki düşünceyi örnekleyen veya kanıtlayan bilgi"],
            ["b", "Metinde hiç geçmeyen kişisel yorum"],
            ["c", "Soruyla ilgisiz en küçük ayrıntı"],
            ["d", "Yalnızca başlığın tekrar edilmesi"],
          ],
          "a",
          "Ayrıntı, ana düşünceyi görünür kılan ve metinle doğrulanabilen bilgidir.",
          "Ana fikri hangi bilgi görünür kılıyor, onu ara.",
          1,
        ),
      ],
    },
    {
      key: "rc-inference-practice",
      title: "Kanıtlardan çıkarım yap",
      templateType: "INFERENCE",
      contentKey: "rc-inference-practice",
      skillCode: "RC_INFERENCE",
      contract: contract(
        "EDU-V2-P0-RC-INFERENCE-PRACTICE",
        "Kanıtlardan çıkarım yap",
        "INFERENCE",
        "RC_INFERENCE",
        "DEVELOPING",
        "QUESTION_MULTIPLE_CHOICE",
        "Metindeki birden fazla bilgiyi birleştirerek kanıtlanabilir sonucu bul.",
      ),
      questions: [
        question(
          "rc-inference-practice-1",
          "Metinde açıkça yazmayan bir sonuca ulaşırken ilk olarak ne yapılmalıdır?",
          [
            ["a", "Kendi deneyimini kanıt yerine koymak"],
            ["b", "Metindeki ilgili kanıtları birleştirmek"],
            ["c", "En güçlü görünen seçeneği seçmek"],
            ["d", "Başlığı okumadan cevap vermek"],
          ],
          "b",
          "Çıkarım, metindeki kanıtların birlikte işaret ettiği sonuçtan oluşur.",
          "Önce metindeki kanıtları işaretle.",
          2,
        ),
        question(
          "rc-inference-practice-2",
          "Kanıtı olmayan güçlü bir yorum için hangi ifade daha doğrudur?",
          [
            ["a", "Her zaman kesin çıkarımdır"],
            ["b", "Metne dayalı zorunlu bir sonuçtur"],
            ["c", "Tahmin olabilir, fakat güvenilir çıkarım değildir"],
            ["d", "Ana fikrin kendisidir"],
          ],
          "c",
          "Metin kanıtı yoksa yorum, metinden zorunlu olarak çıkan bir çıkarım sayılamaz.",
          "Bir çıkarımın mutlaka metinden kanıtı olmalı.",
          2,
        ),
      ],
    },
    {
      key: "common-reinforcement",
      title: "Odak ve anlamı birlikte kullan",
      templateType: "MIXED",
      contentKey: "common-reinforcement",
      skillCode: "FAST_CHUNKING",
      contract: contract(
        "EDU-V2-P0-COMMON-REINFORCEMENT",
        "Odak ve anlamı birlikte kullan",
        "PHRASE_CHUNKING",
        "FAST_CHUNKING",
        "DEVELOPING",
        FAST_READING_RENDERERS.PHRASE_CHUNKING,
        "Anlam gruplarını fark et, ardından bu grupların metnin düşüncesini nasıl desteklediğini seç.",
      ),
      questions: [
        question(
          "common-reinforcement-1",
          "‘Düzenli kısa tekrarlar, uzun ve düzensiz çalışmadan daha sürdürülebilirdir.’ cümlesindeki anlam grubu hangisidir?",
          [
            ["a", "düzenli kısa tekrarlar"],
            ["b", "uzun ve"],
            ["c", "daha"],
            ["d", "sürdürülebilirdir"],
          ],
          "a",
          "‘Düzenli kısa tekrarlar’ birlikte tek bir çalışma biçimini anlatır.",
          "Birlikte tek bir anlam kuran kelimeleri seç.",
          2,
        ),
        question(
          "common-reinforcement-2",
          "Bir metni anlamayı hızlandırırken hangi yaklaşım daha uygundur?",
          [
            ["a", "Kelimeleri anlamdan bağımsız tek tek saymak"],
            ["b", "Anlam gruplarını ve metin kanıtını birlikte izlemek"],
            ["c", "Yalnızca ilk cümleyi okumak"],
            ["d", "Kanıt aramadan tahminde bulunmak"],
          ],
          "b",
          "Hızlı ve doğru okuma, anlam gruplarını fark etmeyi ve kanıtı kontrol etmeyi birlikte gerektirir.",
          "Hız ile anlam kontrolünü birlikte düşün.",
          2,
        ),
      ],
    },
    {
      key: "common-test",
      title: "İlk döngüyü ölç",
      templateType: "COMPREHENSION",
      contentKey: "common-test",
      skillCode: "RC_MAIN_IDEA",
      contract: contract(
        "EDU-V2-P0-COMMON-TEST",
        "İlk döngüyü ölç",
        "MAIN_IDEA",
        "RC_MAIN_IDEA",
        "CHALLENGING",
        "QUESTION_MULTIPLE_CHOICE",
        "Metindeki ana düşünceyi, ayrıntıyı ve çıkarımı birlikte kontrol et.",
      ),
      questions: [
        question(
          "common-test-1",
          "İyi bir okuma çalışmasının ana fikri bulmaya en doğrudan katkısı nedir?",
          [
            ["a", "Metnin bütünündeki ortak düşünceyi görmeyi sağlaması"],
            ["b", "Yalnızca en uzun kelimeyi bulması"],
            ["c", "Metni okumadan cevap vermesi"],
            ["d", "Her ayrıntıyı ana fikir sayması"],
          ],
          "a",
          "Ana fikir, metnin bütününü kapsayan ortak düşüncedir.",
          "Bütün metni kapsayan seçeneği ara.",
          2.5,
        ),
        question(
          "common-test-2",
          "Bir seçeneği işaretlemeden önce en güvenilir kontrol hangisidir?",
          [
            ["a", "Seçeneğin metin kanıtıyla eşleşip eşleşmediğini kontrol etmek"],
            ["b", "Seçeneğin en kısa olmasını beklemek"],
            ["c", "Yalnızca kendi bilgine güvenmek"],
            ["d", "Açıklamayı okumadan ilerlemek"],
          ],
          "a",
          "Doğru cevap, metindeki kanıt ve soru ile birlikte anlamlı olmalıdır.",
          "Cevabı metne geri bağla.",
          2.5,
        ),
        question(
          "common-test-3",
          "Çıkarım ile tahmin arasındaki temel fark nedir?",
          [
            ["a", "Çıkarım metin kanıtına dayanır; tahmin kanıtsız kalabilir"],
            ["b", "Tahmin her zaman daha doğrudur"],
            ["c", "Çıkarım yalnızca başlığa dayanır"],
            ["d", "Aralarında fark yoktur"],
          ],
          "a",
          "Çıkarım, metindeki kanıtların zorunlu olarak gösterdiği sonucu arar.",
          "Kanıtın varlığını sorgula.",
          2.5,
        ),
        question(
          "common-test-4",
          "Hızlı okuma çalışmasında anlamı korumak için ne yapılmalıdır?",
          [
            ["a", "Anlam gruplarını fark edip metnin düşüncesini kontrol etmek"],
            ["b", "Her cümleyi atlamak"],
            ["c", "Sadece süreyi önemsemek"],
            ["d", "Cevapları metin dışında aramak"],
          ],
          "a",
          "Hızlı okumada amaç yalnızca süreyi kısaltmak değil, anlamı koruyarak ilerlemektir.",
          "Hızı anlam kontrolünden ayırma.",
          2.5,
        ),
      ],
    },
  ],
  assessments: [
    {
      key: "common-assessment",
      title: "İlk öğrenme döngüsü başarı ölçümü",
      templateExerciseKey: "common-test",
      questionKeys: ["common-test-1", "common-test-2", "common-test-3", "common-test-4"],
      config: {
        questionCount: 4,
        minimumScorableCount: 4,
        minimumAnsweredCount: 4,
        completionMinimumScore: 0.75,
      },
    },
  ],
  paths: [
    {
      key: "fast-reading-foundation",
      code: "EDU-V2-P0-FAST-FOUNDATION",
      title: "Hızlı Okuma Başlangıcı",
      area: "FAST_READING",
      unitCode: "EDU-V2-P0-FAST-UNIT-1",
      unitTitle: "Dikkat ve anlam ritmi",
      steps: [
        {
          key: "fast-teaching",
          title: "Dikkatini metinde tutmayı öğren",
          type: "TEACHING",
          contentKey: "fast-attention-lesson",
        },
        {
          key: "fast-small-study",
          title: "Dikkat hedefini seç",
          type: "SMALL_STUDY",
          exerciseKey: "fast-attention-study",
        },
        {
          key: "fast-practice",
          title: "Anlam taşıyan kelimeyi bul",
          type: "PRACTICE",
          exerciseKey: "fast-recognition-practice",
        },
      ],
    },
    {
      key: "reading-comprehension-foundation",
      code: "EDU-V2-P0-RC-FOUNDATION",
      title: "Okuduğunu Anlama Başlangıcı",
      area: "READING_COMPREHENSION",
      unitCode: "EDU-V2-P0-RC-UNIT-1",
      unitTitle: "Ana fikirden kanıta",
      steps: [
        {
          key: "reading-comprehension-teaching",
          title: "Ana fikri tek cümlede söyle",
          type: "TEACHING",
          contentKey: "rc-main-idea-lesson",
        },
        {
          key: "reading-comprehension-small-study",
          title: "Ayrıntıyı metinle eşleştir",
          type: "SMALL_STUDY",
          exerciseKey: "rc-detail-study",
        },
        {
          key: "reading-comprehension-practice",
          title: "Kanıtlardan çıkarım yap",
          type: "PRACTICE",
          exerciseKey: "rc-inference-practice",
        },
      ],
    },
    {
      key: "common-learning-cycle",
      code: "EDU-V2-P0-COMMON-CYCLE",
      title: "Ortak pekiştirme ve başarı ölçümü",
      area: "COMMON",
      unitCode: "EDU-V2-P0-COMMON-UNIT-1",
      unitTitle: "Pekiştirme ve başarı ölçümü",
      steps: [
        {
          key: "shared-reinforcement",
          title: "Odak ve anlamı birlikte kullan",
          type: "REINFORCEMENT",
          exerciseKey: "common-reinforcement",
          prerequisiteStepKeys: ["fast-practice", "reading-comprehension-practice"],
        },
        {
          key: "shared-assessment",
          title: "İlk öğrenme döngüsünü ölç",
          type: "ASSESSMENT",
          assessmentKey: "common-assessment",
          prerequisiteStepKeys: ["shared-reinforcement"],
          completionRule: { minimumScore: 0.75 },
        },
      ],
    },
  ],
};

export function getProgramContent(key: string): ProgramContent {
  const value = EDUCATION_V2_P0_PROGRAM.content.find((entry) => entry.key === key);
  if (!value) throw new Error(`Education V2 P0 content bulunamadı: ${key}`);
  return value;
}

export function getProgramExercise(key: string): ProgramExercise {
  const value = EDUCATION_V2_P0_PROGRAM.exercises.find((entry) => entry.key === key);
  if (!value) throw new Error(`Education V2 P0 exercise bulunamadı: ${key}`);
  return value;
}

export function getProgramAssessment(key: string): ProgramAssessment {
  const value = EDUCATION_V2_P0_PROGRAM.assessments.find((entry) => entry.key === key);
  if (!value) throw new Error(`Education V2 P0 assessment bulunamadı: ${key}`);
  return value;
}

export function getProgramIds(
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
  return `edu-v2-p0-${kind}-${key}`;
}

export function lessonMetadataFor(content: ProgramContent): Record<string, unknown> | null {
  if (!content.lesson) return null;
  const exerciseVersionId = getProgramIds("templateVersion", content.lesson.nextExerciseKey);
  return {
    lessonType: LESSON_METADATA_TYPE,
    contractVersion: 1,
    skillCode: content.skillCode,
    objective: content.lesson.objective,
    explanation: content.lesson.explanation,
    workedExample: content.lesson.workedExample,
    guidedPractice: content.lesson.guidedPractice,
    exerciseTemplateVersionId: exerciseVersionId,
    completionLabel: "Dersi tamamladım",
  };
}

export function questionVersionId(exerciseKey: string, questionKey: string): string {
  return getProgramIds("questionVersion", `${exerciseKey}-${questionKey}-v1`);
}

export function questionId(exerciseKey: string, questionKey: string): string {
  return getProgramIds("question", `${exerciseKey}-${questionKey}`);
}

export function contentId(contentKey: string): string {
  return getProgramIds("content", contentKey);
}

export function contentVersionId(contentKey: string): string {
  return getProgramIds("contentVersion", `${contentKey}-v1`);
}

export function templateId(exerciseKey: string): string {
  return getProgramIds("template", exerciseKey);
}

export function templateVersionId(exerciseKey: string): string {
  return getProgramIds("templateVersion", `${exerciseKey}-v1`);
}
