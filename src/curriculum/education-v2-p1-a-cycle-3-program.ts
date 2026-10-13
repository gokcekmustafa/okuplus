import {
  parseTrainingExerciseVersionConfig,
  type TrainingExerciseVersionConfig,
} from "../modules/training/exercise-contract.js";
import type {
  ProgramContent,
  ProgramExercise,
  ProgramQuestion,
} from "./education-v2-p0-program.js";
import type { P1APathStep, P1AProgram } from "./education-v2-p1-a-program.js";
import {
  LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "./learning-cycle-manifest.js";

/**
 * P1-A cycle 3 authoring package.
 *
 * This is a new, source-only candidate. It is deliberately not imported by
 * the canonical readiness builder, provisioner or route selector. Its focus
 * is evidence strength and transfer across text types, which extends the
 * structure/relations work in cycles 1 and 2 without changing those cycles.
 */
export const EDUCATION_V2_P1_A_CYCLE_3_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-3";
export const EDUCATION_V2_P1_A_CYCLE_3_VERSION = 3;
export const EDUCATION_V2_P1_A_CYCLE_3_SEQUENCE = 3;
export const EDUCATION_V2_P1_A_CYCLE_3_PATH_CODE =
  "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_3_G8_12";
export const EDUCATION_V2_P1_A_CYCLE_3_AGE_BAND = "13–17";
export const EDUCATION_V2_P1_A_CYCLE_3_TECHNICAL_COMPLETION_SCORE = 0.75;
export const EDUCATION_V2_P1_A_CYCLE_3_STATUS = "EXPERT_REVIEW_REQUIRED" as const;

export const CYCLE_3_LEARNING_OUTCOMES = [
  {
    key: "P1A_V3_EVIDENCE_STRENGTH",
    statement: "Bir iddiayı doğrudan veya dolaylı destekleyen metin kanıtlarını ayırt eder.",
    targetSkillCodes: ["RC_DETAIL", "RC_INFERENCE"],
  },
  {
    key: "P1A_V3_CAUSE_CONSEQUENCE_TRANSFER",
    statement: "Neden-sonuç zincirini farklı bir metinde kanıt ve sonuç arasındaki bağla açıklar.",
    targetSkillCodes: ["RC_DETAIL", "RC_INFERENCE"],
  },
  {
    key: "P1A_V3_GENRE_TRANSFER",
    statement: "Aynı anlam kurma yaklaşımını bilgilendirici ve anlatı metinlerine aktarır.",
    targetSkillCodes: ["RC_MAIN_IDEA", "RC_INFERENCE"],
  },
] as const;

const CYCLE_3_PREFIX = "edu-v2-p1-a-cycle-3";

export function p1ACycle3Id(
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
  return `${CYCLE_3_PREFIX}-${kind}-${key}`;
}

export function p1ACycle3ContentVersionId(contentKey: string): string {
  return p1ACycle3Id("contentVersion", `${contentKey}-v3`);
}

export function p1ACycle3TemplateId(exerciseKey: string): string {
  return p1ACycle3Id("template", exerciseKey);
}

export function p1ACycle3TemplateVersionId(exerciseKey: string): string {
  return p1ACycle3Id("templateVersion", `${exerciseKey}-v3`);
}

export function p1ACycle3QuestionId(exerciseKey: string, questionKey: string): string {
  return p1ACycle3Id("question", `${exerciseKey}-${questionKey}`);
}

export function p1ACycle3QuestionVersionId(exerciseKey: string, questionKey: string): string {
  return p1ACycle3Id("questionVersion", `${exerciseKey}-${questionKey}-v3`);
}

export function p1ACycle3AssessmentId(assessmentKey: string): string {
  return p1ACycle3Id("assessment", `${assessmentKey}-v3`);
}

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
  title: string,
  family: TrainingExerciseVersionConfig["family"],
  competency: TrainingExerciseVersionConfig["competency"],
  difficulty: TrainingExerciseVersionConfig["difficulty"],
  instructions: string,
): TrainingExerciseVersionConfig {
  return parseTrainingExerciseVersionConfig({
    schemaVersion: 1,
    family,
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
    rendererKey: "QUESTION_MULTIPLE_CHOICE",
    settings: { optionCount: 4, mobileLayout: "STACKED", title },
  });
}

const content = (
  key: string,
  title: string,
  body: string,
  difficulty: number,
  skillCode: string,
): ProgramContent => ({ key, title, body, difficulty, skillCode });

const evidenceTeaching = content(
  "p1a-v3-evidence-teaching",
  "Kanıtın iddiayı nasıl desteklediğini gör",
  [
    "Bir metinde bilgi bulunması, o bilginin her zaman kanıt olduğu anlamına gelmez.",
    "Önce yazarın iddiasını belirle; sonra ayrıntının bu iddiayı doğrudan mı, dolaylı mı desteklediğini sor.",
    "Bir ayrıntı yalnızca konuya değiniyor, fakat iddiayı açıklamıyorsa güçlü kanıt sayılmaz. Kanıt ile sonuç arasındaki bağı metindeki ifadelerle kur.",
  ].join("\n\n"),
  4,
  "RC_INFERENCE",
);

const evidenceStudy = content(
  "p1a-v3-evidence-study",
  "Gölgeliklerin etkisini kanıtla",
  "Bir okul, öğle saatlerinde sınıfların çok ısınmasını önlemek için pencerelere dış gölgelikler taktı. Öğretmenler, gölgeliklerin güneş ışığını keserken sınıfların gün ışığından yararlanmasını sürdürdüğünü gözlemledi.",
  4,
  "RC_DETAIL",
);

const evidencePractice = content(
  "p1a-v3-evidence-practice",
  "Yağmur bahçesindeki kanıt zincirini kur",
  "Mahalledeki kullanılmayan arsa, yağmur bahçesine dönüştürüldü. Bahçedeki çukur alanlar yağmur suyunu kısa süre tuttu; suyun bir bölümü toprağa geçerken başka bir bölümü yeni dikilen bitkileri besledi.",
  4,
  "RC_INFERENCE",
);

const evidenceReinforcement = content(
  "p1a-v3-evidence-reinforcement",
  "Kanıtı geri çağır",
  "Otobüs durağına yerleştirilen açık renkli çatı, yazın güneş ışığının bir bölümünü geri yansıttı. Altındaki banklar yine de açıkta kaldı; bu nedenle durakta bekleyenler yalnızca çatının altında daha serin bir alan bulabildi.",
  4,
  "RC_DETAIL",
);

const transferTeaching = content(
  "p1a-v3-transfer-teaching",
  "Anlam kurma yaklaşımını yeni metne taşı",
  [
    "Yeni bir metne geçtiğinde önce metnin türünü değil, iddia ile kanıt arasındaki anlam bağını ara.",
    "Bilgilendirici metinlerde açıklanan bir sonuç, anlatı metinlerinde ise karakterin seçimi veya olayın değişimi aynı akıl yürütmeyi gerektirebilir.",
    "Metni özetlerken kanıtın neyi gösterdiğini ve bunun ana düşünceye nasıl bağlandığını birlikte söyle.",
  ].join("\n\n"),
  4,
  "RC_MAIN_IDEA",
);

const transferPractice = content(
  "p1a-v3-transfer-practice",
  "Anlatı metninde neden ve sonucu izle",
  "Deniz, okul gösterisi için hazırladığı afişi son anda değiştirdi. İlk tasarımda yazılar uzaktan okunmuyordu; yeni tasarımda başlığı büyüttü ve bilgileri üç kısa bölüme ayırdı. Gösteri günü ziyaretçiler programı daha kolay takip etti.",
  5,
  "RC_INFERENCE",
);

const assessmentContent = content(
  "p1a-v3-assessment",
  "Kanıt ve aktarım kontrolü",
  "Kıyıdaki yürüyüş yolu, yağmurdan sonra bazı bölümlerde çamurlaşıyordu. Belediye, suyu kenardaki bitkilere yönlendiren küçük kanallar açtı. Bir süre sonra yolun sorunlu bölümleri daha çabuk kururken bitkilerin çevresindeki toprak nemli kaldı.",
  5,
  "RC_INFERENCE",
);

const exercises: ProgramExercise[] = [
  {
    key: "p1a-v3-evidence-study",
    title: "Doğrudan kanıtı ayır",
    templateType: "COMPREHENSION",
    contentKey: evidenceStudy.key,
    skillCode: "RC_DETAIL",
    contract: contract(
      "Doğrudan kanıtı ayır",
      "DETAIL_EVIDENCE",
      "RC_DETAIL",
      "DEVELOPING",
      "Bir iddiayı metindeki doğrudan ayrıntılarla ilişkilendir.",
    ),
    questions: [
      question(
        "p1a-v3-evidence-study-1",
        "Gölgeliklerin sınıflara etkisi hangisidir?",
        [
          ["a", "Sınıfların bütün gün karanlık kalması"],
          ["b", "Güneş ışığının bir bölümünün kesilmesi"],
          ["c", "Pencerelerin ders dışında kapalı tutulması"],
          ["d", "Okul bahçesindeki ağaçların budanması"],
        ],
        "b",
        "Metin, gölgeliklerin güneş ışığını kestiğini ve böylece ısınmayı azaltmaya yardım ettiğini söylüyor.",
        "Gölgeliklerin güneş ışığı ve sınıf sıcaklığıyla ilişkisini birlikte düşün.",
        4,
      ),
      question(
        "p1a-v3-evidence-study-2",
        "Gölgeliklerin işe yaradığını en güçlü gösteren bilgi hangisidir?",
        [
          ["a", "Gölgeliklerin yalnızca sınıfların dışında bulunması"],
          ["b", "Öğrencilerin teneffüste bahçede beklemesi"],
          ["c", "Güneş ışığı kesilirken gün ışığının sınıfa ulaşması"],
          ["d", "Derslerin öğle saatlerinde biraz daha kısa sürmesi"],
        ],
        "c",
        "Bu ayrıntı, gölgeliklerin ısınmayı azaltırken doğal aydınlığı tamamen yok etmediğini doğrudan gösteriyor.",
        "İddiayı doğrudan açıklayan gözlemi seç.",
        4,
      ),
      question(
        "p1a-v3-evidence-study-3",
        "Metinden hangi sınırlı çıkarım yapılabilir?",
        [
          ["a", "Gölgelikler okulun bütün enerji ihtiyacını karşılar"],
          ["b", "Gölgelikler her mevsimde aynı etkiyi gösterir"],
          ["c", "Sınıflarda artık hiçbir aydınlatma gerekmez"],
          ["d", "Serinlik ve aydınlık birlikte korunabilir"],
        ],
        "d",
        "Metin yalnızca güneş ışığının azalması ve gün ışığının korunması hakkında sınırlı bir sonuç destekliyor.",
        "Metnin gerçekten desteklediği sınırın dışına çıkma.",
        4,
      ),
    ],
  },
  {
    key: "p1a-v3-evidence-practice",
    title: "Dolaylı kanıtı ve sonucu ilişkilendir",
    templateType: "INFERENCE",
    contentKey: evidencePractice.key,
    skillCode: "RC_INFERENCE",
    contract: contract(
      "Dolaylı kanıtı ve sonucu ilişkilendir",
      "INFERENCE",
      "RC_INFERENCE",
      "CHALLENGING",
      "Birden fazla ayrıntıdan desteklenen sonucu yeni bir metinde kur.",
    ),
    questions: [
      question(
        "p1a-v3-evidence-practice-1",
        "Yağmur bahçesinin temel yararı hangi seçenekte kanıtlanır?",
        [
          ["a", "Yağmur suyunun bir bölümü toprağa geçip bitkilere ulaşır"],
          ["b", "Arsanın mahalledeki diğer binalara yakın olması"],
          ["c", "Bahçedeki çukur alanların yalnızca kısa süre boş kalması"],
          ["d", "Yeni bitkilerin aynı gün içinde çiçek açması"],
        ],
        "a",
        "Suya ilişkin iki sonuç, bahçenin suyu tutup toprağa ve bitkilere yönlendirdiğini destekliyor.",
        "Bahçenin suyu nasıl yönlendirdiğini gösteren ayrıntıyı ara.",
        4,
      ),
      question(
        "p1a-v3-evidence-practice-2",
        "Metinde hangi neden-sonuç zinciri kuruluyor?",
        [
          ["a", "Arsanın boş kalması, mahalledeki yolları uzatıyor"],
          ["b", "Bitkilerin büyümesi, yağmurun hiç yağmamasına yol açıyor"],
          ["c", "Çukurların dolması, toprağın bütün gün kuru kalmasını sağlıyor"],
          ["d", "Su, toprağa ve bitkilere ulaşır"],
        ],
        "d",
        "Metin, çukur alanların suyu kısa süre tutmasından sonra suyun toprağa ve bitkilere ulaşmasını bağlıyor.",
        "Önce suyun tutulmasını, sonra ortaya çıkan etkileri sırala.",
        5,
      ),
      question(
        "p1a-v3-evidence-practice-3",
        "Aşağıdaki sonuçlardan hangisi metinle sınırlı biçimde desteklenir?",
        [
          ["a", "Mahalledeki bütün arsalar artık yağmur bahçesine dönüştürüldü"],
          ["b", "Bahçe, her yağışta bütün mahalleyi kesinlikle korur"],
          ["c", "Bahçe, yağmur suyunun bir kısmını yararlı bir yöne aktarabilir"],
          ["d", "Bitkiler, yağmur yağmadan da aynı miktarda suya ulaşır"],
        ],
        "c",
        "Metin yalnızca bu bahçedeki suyun bir bölümünün toprağa ve bitkilere yöneldiğini gösteriyor.",
        "Sonucu metindeki su hareketiyle sınırlı tut.",
        5,
      ),
    ],
  },
  {
    key: "p1a-v3-evidence-reinforcement",
    title: "Kanıtı geri çağır",
    templateType: "MIXED",
    contentKey: evidenceReinforcement.key,
    skillCode: "RC_DETAIL",
    contract: contract(
      "Kanıtı geri çağır",
      "DETAIL_EVIDENCE",
      "RC_DETAIL",
      "DEVELOPING",
      "Bir ayrıntının iddiayı destekleyip desteklemediğini yeni bir kısa metinde kontrol et.",
    ),
    questions: [
      question(
        "p1a-v3-evidence-reinforcement-1",
        "Çatının hangi etkisi metinde doğrudan anlatılmıştır?",
        [
          ["a", "Bankların bütün gün kapalı bir odada kalması"],
          ["b", "Güneş ışığının bir bölümünün geri yansıtılması"],
          ["c", "Durağın bulunduğu yolun tamamen değişmesi"],
          ["d", "Bekleyenlerin her zaman aynı saatte gelmesi"],
        ],
        "b",
        "Metin, açık renkli çatının güneş ışığının bir bölümünü geri yansıttığını doğrudan söylüyor.",
        "Çatının ışıkla ilgili doğrudan etkisini bul.",
        4,
      ),
      question(
        "p1a-v3-evidence-reinforcement-2",
        "Metne göre bankların durumu nasıldır?",
        [
          ["a", "Banklar çatının altında olmadığı için bütünüyle korunmamıştır"],
          ["b", "Banklar her mevsimde kapalı bir alanda tutulmuştur"],
          ["c", "Banklar durağın dışına taşınarak başka yerde kullanılmıştır"],
          ["d", "Banklar çatının ışığı tamamen kesmesiyle soğumuştur"],
        ],
        "a",
        "Metin, bankların açıkta kaldığını ve serin alanın yalnızca çatının altında bulunduğunu belirtiyor.",
        "Bankların çatının neresinde kaldığına dikkat et.",
        4,
      ),
      question(
        "p1a-v3-evidence-reinforcement-3",
        "Metnin desteklediği en sınırlı sonuç hangisidir?",
        [
          ["a", "Açık renkli çatılar bütün durakları serinletir"],
          ["b", "Çatı, duraktaki herkes için aynı korumayı sağlar"],
          ["c", "Çatı altında bekleyenler için daha serin bir alan oluşabilir"],
          ["d", "Bankların açıkta kalması çatının hiçbir işe yaramadığını gösterir"],
        ],
        "c",
        "Çatı yalnızca altında kalan alan için serinlik sağlıyor; metin daha geniş bir sonuç vermiyor.",
        "Sonucun çatının altında kalan alanla sınırlı olduğunu unutma.",
        4,
      ),
    ],
  },
  {
    key: "p1a-v3-transfer-practice",
    title: "Anlatıdaki kanıt zincirini izle",
    templateType: "INFERENCE",
    contentKey: transferPractice.key,
    skillCode: "RC_INFERENCE",
    contract: contract(
      "Anlatıdaki kanıt zincirini izle",
      "INFERENCE",
      "RC_INFERENCE",
      "CHALLENGING",
      "Bilgilendirici metinlerdeki kanıt-sonuç yaklaşımını kısa bir anlatı metnine aktar.",
    ),
    questions: [
      question(
        "p1a-v3-transfer-practice-1",
        "Deniz afişi neden değiştirmiştir?",
        [
          ["a", "Gösterinin günü ve saati son anda iptal edilmiştir"],
          ["b", "İlk afişin renkleri ziyaretçilerin dikkatini çekmiştir"],
          ["c", "Programda yalnızca tek bir etkinlik bulunduğu anlaşılmıştır"],
          ["d", "İlk tasarım uzaktan okunmadığı için bilgileri yeniden düzenlemiştir"],
        ],
        "d",
        "İlk tasarımın uzaktan okunmaması, başlığın büyütülmesine ve bilgilerin bölünmesine neden oluyor.",
        "Değişiklikten önceki sorun ile sonraki çözümü eşleştir.",
        5,
      ),
      question(
        "p1a-v3-transfer-practice-2",
        "Yeni tasarımın sonucu hangisidir?",
        [
          ["a", "Ziyaretçiler programı daha kolay takip etmiştir"],
          ["b", "Gösteri günü bütün afişler aynı renge boyanmıştır"],
          ["c", "Programdaki bilgilerin tamamı afişten çıkarılmıştır"],
          ["d", "Afiş yalnızca okul çalışanlarının görebileceği yere asılmıştır"],
        ],
        "a",
        "Metnin son cümlesi, yeni düzenlemenin ziyaretçilerin programı izlemesini kolaylaştırdığını söylüyor.",
        "Değişiklikten sonra ziyaretçilerin ne yaptığına bak.",
        5,
      ),
      question(
        "p1a-v3-transfer-practice-3",
        "Bu anlatıda kanıt-sonuç ilişkisini en iyi açıklayan seçenek hangisidir?",
        [
          ["a", "Afişin rengi değiştiği için herkes gösteriye katılmıştır"],
          ["b", "Okunabilirlik sorunu giderilince programı izlemek kolaylaşmıştır"],
          ["c", "Ziyaretçiler programı bilmediği için afiş hazırlanmıştır"],
          ["d", "Başlık büyüdüğü için gösterinin süresi uzamıştır"],
        ],
        "b",
        "Metin, okunabilirliği artıran düzenlemeyi ziyaretçilerin programı daha kolay izlemesiyle bağlıyor.",
        "Sorun, yapılan düzenleme ve sonuç arasındaki anlam bağını kur.",
        5,
      ),
    ],
  },
  {
    key: "p1a-v3-assessment",
    title: "Kanıt ve aktarım kontrolü",
    templateType: "MIXED",
    contentKey: assessmentContent.key,
    skillCode: "RC_INFERENCE",
    contract: contract(
      "Kanıt ve aktarım kontrolü",
      "INFERENCE",
      "RC_INFERENCE",
      "CHALLENGING",
      "Öğretimde kullanılmamış yeni bir metinde kanıt, neden-sonuç ve aktarım becerilerini kontrol et.",
    ),
    questions: [
      question(
        "p1a-v3-assessment-1",
        "Kanalların açılmasıyla ilgili doğrudan sonuç hangisidir?",
        [
          ["a", "Yürüyüş yolunun bütün bölümleri aynı anda yenilenmiştir"],
          ["b", "Belediye kıyıdaki bitkileri başka bir yere taşımıştır"],
          ["c", "Yol kurur, bitki çevresi nemli kalır"],
          ["d", "Yağmurdan sonra kıyıdaki yol artık hiç kullanılmamıştır"],
        ],
        "c",
        "Metin, kanalların açılmasından sonra yolun kuruduğunu ve bitki çevresinin nemli kaldığını birlikte veriyor.",
        "Kanalların açılmasından sonra gözlenen iki sonucu bul.",
        5,
      ),
      question(
        "p1a-v3-assessment-2",
        "Metindeki neden-sonuç zinciri hangisidir?",
        [
          ["a", "Bitkilerin taşınması, kanalların kapanmasına neden olmuştur"],
          ["b", "Yolun kuru kalması, yağmurdan önce kanalların açılmasını sağlamıştır"],
          ["c", "Yağmur, belediyenin kıyıdaki bütün bitkileri kaldırmasına yol açmıştır"],
          ["d", "Kanallar suyu yönlendirmiş, yol kururken bitki çevresi nemli kalmıştır"],
        ],
        "d",
        "Kanalların suyu yönlendirmesi, yol ile bitki çevresinde gözlenen iki farklı sonucu açıklıyor.",
        "Önce yapılan düzenlemeyi, sonra iki sonucu sıraya koy.",
        5,
      ),
      question(
        "p1a-v3-assessment-3",
        "Metne dayalı en sınırlı çıkarım hangisidir?",
        [
          ["a", "Kanallar suyu iki alana yönlendirebilir"],
          ["b", "Bu yöntem her kıyı yolundaki bütün sorunları kesinlikle çözer"],
          ["c", "Belediye artık kıyıdaki yolları hiç onarmayacaktır"],
          ["d", "Bitkiler yalnızca kanallar açıldığında yaşamını sürdürebilir"],
        ],
        "a",
        "Metin, tek bir kıyı yolundaki gözleme dayanarak suyun iki alana farklı etkiler sağladığını gösteriyor.",
        "Çıkarımı metindeki tek örneğin desteklediği sınırda tut.",
        5,
      ),
      question(
        "p1a-v3-assessment-4",
        "Bu metindeki kanıtı başka bir metne aktarırken hangi yöntem izlenmelidir?",
        [
          ["a", "Yeni metne aynı yer ve kişileri eklemek"],
          ["b", "Düzenleme ile sonucu ilişkilendirmek"],
          ["c", "Yeni metnin konusunu okumadan benzer bir cevap seçmek"],
          ["d", "Yalnızca en uzun ayrıntıyı ana düşünce kabul etmek"],
        ],
        "b",
        "Aktarım, eski metni kopyalamak değil; yeni metindeki düzenleme ve sonucu kanıtla ilişkilendirmektir.",
        "Yer ve kişiler değil, kanıt-sonuç ilişkisi taşınır.",
        5,
      ),
    ],
  },
];

const steps: P1APathStep[] = [
  {
    key: "evidence-teaching-v3",
    title: "Kanıtın iddiayı nasıl desteklediğini gör",
    type: "TEACHING",
    contentKey: evidenceTeaching.key,
    learningOutcomeKeys: ["P1A_V3_EVIDENCE_STRENGTH"],
  },
  {
    key: "evidence-small-study-v3",
    title: "Doğrudan kanıtı ayır",
    type: "SMALL_STUDY",
    exerciseKey: "p1a-v3-evidence-study",
    learningOutcomeKeys: ["P1A_V3_EVIDENCE_STRENGTH"],
    prerequisiteStepKeys: ["evidence-teaching-v3"],
  },
  {
    key: "evidence-practice-v3",
    title: "Dolaylı kanıtı ve sonucu ilişkilendir",
    type: "PRACTICE",
    exerciseKey: "p1a-v3-evidence-practice",
    learningOutcomeKeys: ["P1A_V3_EVIDENCE_STRENGTH", "P1A_V3_CAUSE_CONSEQUENCE_TRANSFER"],
    prerequisiteStepKeys: ["evidence-small-study-v3"],
  },
  {
    key: "evidence-reinforcement-v3",
    title: "Kanıtı geri çağır",
    type: "REINFORCEMENT",
    exerciseKey: "p1a-v3-evidence-reinforcement",
    learningOutcomeKeys: ["P1A_V3_EVIDENCE_STRENGTH"],
    prerequisiteStepKeys: ["evidence-practice-v3"],
  },
  {
    key: "transfer-teaching-v3",
    title: "Anlam kurma yaklaşımını yeni metne taşı",
    type: "TEACHING",
    contentKey: transferTeaching.key,
    learningOutcomeKeys: ["P1A_V3_GENRE_TRANSFER"],
    prerequisiteStepKeys: ["evidence-reinforcement-v3"],
  },
  {
    key: "transfer-practice-v3",
    title: "Anlatıdaki kanıt zincirini izle",
    type: "PRACTICE",
    exerciseKey: "p1a-v3-transfer-practice",
    learningOutcomeKeys: ["P1A_V3_CAUSE_CONSEQUENCE_TRANSFER", "P1A_V3_GENRE_TRANSFER"],
    prerequisiteStepKeys: ["transfer-teaching-v3"],
  },
  {
    key: "assessment-v3",
    title: "Kanıt ve aktarım kontrolü",
    type: "ASSESSMENT",
    assessmentKey: "p1a-v3-assessment",
    learningOutcomeKeys: [
      "P1A_V3_EVIDENCE_STRENGTH",
      "P1A_V3_CAUSE_CONSEQUENCE_TRANSFER",
      "P1A_V3_GENRE_TRANSFER",
    ],
    prerequisiteStepKeys: ["transfer-practice-v3"],
    completionRule: { minimumScore: EDUCATION_V2_P1_A_CYCLE_3_TECHNICAL_COMPLETION_SCORE },
  },
];

const program: P1AProgram = {
  programId: EDUCATION_V2_P1_A_CYCLE_3_ID,
  ageBand: EDUCATION_V2_P1_A_CYCLE_3_AGE_BAND,
  content: [
    evidenceTeaching,
    evidenceStudy,
    evidencePractice,
    evidenceReinforcement,
    transferTeaching,
    transferPractice,
    assessmentContent,
  ],
  exercises,
  assessments: [
    {
      key: "p1a-v3-assessment",
      title: "P1-A Cycle 3 · Kanıt ve aktarım kontrolü",
      templateExerciseKey: "p1a-v3-assessment",
      questionKeys: exercises.at(-1)!.questions.map((item) => item.key),
      config: {
        questionCount: 4,
        minimumScorableCount: 4,
        minimumAnsweredCount: 4,
        completionMinimumScore: EDUCATION_V2_P1_A_CYCLE_3_TECHNICAL_COMPLETION_SCORE,
      },
    },
  ],
  path: {
    code: EDUCATION_V2_P1_A_CYCLE_3_PATH_CODE,
    title: "P1-A Cycle 3 · Kanıt ve aktarım",
    area: "READING_COMPREHENSION",
    units: [
      {
        key: "evidence-foundation-v3",
        code: "P1_A_V3_EVIDENCE_FOUNDATION",
        title: "Kanıtı ve sonucu ilişkilendir",
        position: 1,
        steps: steps.slice(0, 4),
      },
      {
        key: "transfer-v3",
        code: "P1_A_V3_TRANSFER",
        title: "Yeni metne aktar",
        position: 2,
        steps: steps.slice(4),
      },
    ],
  },
};

export const EDUCATION_V2_P1_A_CYCLE_3_PROGRAM = program;

export function validateP1ACycle3Program(candidate: P1AProgram = program): string[] {
  const errors: string[] = [];
  const contentKeys = new Set(candidate.content.map((item) => item.key));
  const contentByKey = new Map(candidate.content.map((item) => [item.key, item]));
  const assessmentByKey = new Map(candidate.assessments.map((item) => [item.key, item]));
  const exerciseByKey = new Map(candidate.exercises.map((item) => [item.key, item]));
  const pathSteps = candidate.path.units.flatMap((unit) => unit.steps);
  const usedContent = new Map<string, number>();
  const usedExercises = new Map<string, number>();
  const outcomeKeys = new Set<string>(CYCLE_3_LEARNING_OUTCOMES.map((outcome) => outcome.key));
  const outcomeByKey = new Map<string, (typeof CYCLE_3_LEARNING_OUTCOMES)[number]>(
    CYCLE_3_LEARNING_OUTCOMES.map((outcome) => [outcome.key, outcome]),
  );
  const stepKeys = new Set<string>();
  const mappedOutcomeKeys = new Set<string>();
  const instructionalOutcomeKeys = new Set<string>();
  const instructionalStepTypes = new Set(["TEACHING", "SMALL_STUDY", "PRACTICE", "REINFORCEMENT"]);

  if (candidate.programId !== EDUCATION_V2_P1_A_CYCLE_3_ID)
    errors.push("Cycle 3 program ID uyuşmuyor.");
  if (candidate.path.code !== EDUCATION_V2_P1_A_CYCLE_3_PATH_CODE)
    errors.push("Cycle 3 path kodu uyuşmuyor.");
  if (candidate.path.units.length !== 2) errors.push("Cycle 3 iki unit içermeli.");
  if (pathSteps.length === 0) errors.push("Cycle 3 en az bir öğrenme adımı içermeli.");

  for (const [index, unit] of candidate.path.units.entries()) {
    if (unit.position !== index + 1) errors.push(`Unit sırası geçersiz: ${unit.code}`);
    if (unit.steps.length === 0) errors.push(`Boş unit: ${unit.code}`);
  }

  for (const [index, step] of pathSteps.entries()) {
    if (stepKeys.has(step.key)) errors.push(`Tekrarlı step: ${step.key}`);
    stepKeys.add(step.key);
    if (step.contentKey)
      usedContent.set(step.contentKey, (usedContent.get(step.contentKey) ?? 0) + 1);
    if (step.exerciseKey)
      usedExercises.set(step.exerciseKey, (usedExercises.get(step.exerciseKey) ?? 0) + 1);
    if (step.assessmentKey) {
      const assessment = assessmentByKey.get(step.assessmentKey);
      if (!assessment) errors.push(`Assessment bulunamadı: ${step.assessmentKey}`);
      else
        usedExercises.set(
          assessment.templateExerciseKey,
          (usedExercises.get(assessment.templateExerciseKey) ?? 0) + 1,
        );
    }
    if (step.learningOutcomeKeys.length === 0)
      errors.push(`Öğrenme kazanımı bağlantısı eksik: ${step.key}`);
    const stepOutcomeKeys = new Set<string>();
    for (const outcomeKey of step.learningOutcomeKeys) {
      if (stepOutcomeKeys.has(outcomeKey)) {
        errors.push(`Tekrarlı öğrenme kazanımı: ${step.key} -> ${outcomeKey}`);
      } else if (!outcomeKeys.has(outcomeKey)) {
        errors.push(`Bilinmeyen öğrenme kazanımı: ${step.key} -> ${outcomeKey}`);
      } else {
        mappedOutcomeKeys.add(outcomeKey);
        if (instructionalStepTypes.has(step.type)) instructionalOutcomeKeys.add(outcomeKey);
      }
      stepOutcomeKeys.add(outcomeKey);
    }
    if (step.type !== "ASSESSMENT") {
      const sourceSkillCode = step.contentKey
        ? contentByKey.get(step.contentKey)?.skillCode
        : step.exerciseKey
          ? exerciseByKey.get(step.exerciseKey)?.skillCode
          : undefined;
      if (
        sourceSkillCode &&
        !step.learningOutcomeKeys.some((key) =>
          outcomeByKey
            .get(key)
            ?.targetSkillCodes.some((skillCode) => skillCode === sourceSkillCode),
        )
      ) {
        errors.push(`Kazanım içerikle uyumsuz: ${step.key} -> ${sourceSkillCode}`);
      }
    }
    if (index === 0 && (step.prerequisiteStepKeys ?? []).length > 0)
      errors.push(`İlk adım prerequisite taşıyamaz: ${step.key}`);
    if (index > 0) {
      const expectedPrevious = pathSteps[index - 1]!.key;
      const prerequisites = step.prerequisiteStepKeys ?? [];
      if (prerequisites.length !== 1 || prerequisites[0] !== expectedPrevious)
        errors.push(`Cycle 3 linear prerequisite zinciri geçersiz: ${step.key}`);
    }
    for (const prerequisite of step.prerequisiteStepKeys ?? []) {
      if (!pathSteps.some((item) => item.key === prerequisite))
        errors.push(`Bilinmeyen cycle 3 prerequisite: ${step.key} -> ${prerequisite}`);
    }
  }

  const assessmentSteps = pathSteps.filter((step) => step.type === "ASSESSMENT");
  for (const outcome of CYCLE_3_LEARNING_OUTCOMES) {
    if (!mappedOutcomeKeys.has(outcome.key))
      errors.push(`Öğrenme kazanımı hiçbir adıma bağlanmamış: ${outcome.key}`);
    if (!instructionalOutcomeKeys.has(outcome.key))
      errors.push(`Öğrenme kazanımı öğretim/uygulama adımı taşımıyor: ${outcome.key}`);
    if (!assessmentSteps.some((step) => step.learningOutcomeKeys.includes(outcome.key)))
      errors.push(`Öğrenme kazanımı değerlendirmede ölçülmüyor: ${outcome.key}`);
  }

  for (const exercise of candidate.exercises) {
    if (!contentKeys.has(exercise.contentKey))
      errors.push(`Exercise content eksik: ${exercise.key}`);
    usedContent.set(exercise.contentKey, (usedContent.get(exercise.contentKey) ?? 0) + 1);
    if (exercise.questions.length < 3)
      errors.push(`Exercise soru sayısı yetersiz: ${exercise.key}`);
    if (exercise.contract.competency !== exercise.skillCode)
      errors.push(`Exercise skill eşleşmiyor: ${exercise.key}`);
    const ids = exercise.questions.map((item) => item.key);
    if (new Set(ids).size !== ids.length)
      errors.push(`Exercise soru anahtarı tekrarlı: ${exercise.key}`);
    if ((usedExercises.get(exercise.key) ?? 0) !== 1)
      errors.push(`Exercise kullanım sayısı geçersiz: ${exercise.key}`);
    for (const item of exercise.questions) {
      const optionIds = item.options.map((optionItem) => optionItem.id);
      if (
        optionIds.length !== 4 ||
        new Set(optionIds).size !== 4 ||
        !optionIds.includes(item.correctOptionId)
      ) {
        errors.push(`Soru seçenek sözleşmesi geçersiz: ${item.key}`);
      }
    }
  }
  for (const item of candidate.content) {
    if ((usedContent.get(item.key) ?? 0) !== 1)
      errors.push(`Content kullanım sayısı geçersiz: ${item.key}`);
  }
  return errors;
}

function questionVersionIds(exercise: ProgramExercise): string[] {
  return exercise.questions.map((item) => p1ACycle3QuestionVersionId(exercise.key, item.key));
}

function buildCycle3Manifest(): LearningCycleManifest {
  const contentVersions = program.content.map((item) => ({
    key: item.key,
    versionId: p1ACycle3ContentVersionId(item.key),
  }));
  const exerciseVersions = program.exercises.map((exercise) => ({
    key: exercise.key,
    versionId: p1ACycle3TemplateVersionId(exercise.key),
    questionVersionIds: questionVersionIds(exercise),
  }));
  const assessmentVersions = program.assessments.map((assessment) => ({
    key: assessment.key,
    versionId: p1ACycle3AssessmentId(assessment.key),
    questionVersionIds: assessment.questionKeys.map((questionKey) =>
      p1ACycle3QuestionVersionId(assessment.templateExerciseKey, questionKey),
    ),
  }));
  const allQuestionVersionIds = [
    ...new Set(exerciseVersions.flatMap((item) => item.questionVersionIds ?? [])),
  ];
  const pathSteps = program.path.units.flatMap((unit) => unit.steps);

  return {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: EDUCATION_V2_P1_A_CYCLE_3_PATH_CODE,
    cycleVersion: EDUCATION_V2_P1_A_CYCLE_3_VERSION,
    sequence: EDUCATION_V2_P1_A_CYCLE_3_SEQUENCE,
    routeFamily: "A",
    targetSkillCodes: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
    learningOutcomes: CYCLE_3_LEARNING_OUTCOMES.map((outcome) => ({
      key: outcome.key,
      statement: outcome.statement,
      targetSkillCodes: [...outcome.targetSkillCodes],
    })),
    resourceCatalog: {
      contentKeys: program.content.map((item) => item.key),
      exerciseKeys: program.exercises.map((item) => item.key),
      assessmentKeys: program.assessments.map((item) => item.key),
      questionVersionIds: allQuestionVersionIds,
      contentVersions,
      exerciseVersions,
      assessmentVersions,
    },
    steps: pathSteps.map((step, index) => {
      const exercise = step.exerciseKey
        ? program.exercises.find((item) => item.key === step.exerciseKey)
        : undefined;
      const assessment = step.assessmentKey
        ? program.assessments.find((item) => item.key === step.assessmentKey)
        : undefined;
      const exerciseReference = exercise
        ? {
            key: exercise.key,
            versionId: p1ACycle3TemplateVersionId(exercise.key),
            questionVersionIds: questionVersionIds(exercise),
          }
        : undefined;
      return {
        stableKey: step.key,
        order: index + 1,
        type: step.type,
        learningOutcomeKeys: step.learningOutcomeKeys,
        taskKind:
          step.type === "REINFORCEMENT"
            ? "RETRIEVAL"
            : step.type === "PRACTICE" && step.key === "transfer-practice-v3"
              ? "TRANSFER"
              : step.type === "ASSESSMENT"
                ? "CHECKPOINT"
                : "NEW",
        prerequisiteKeys: step.prerequisiteStepKeys ?? [],
        required: true,
        ...(step.contentKey
          ? {
              content: {
                key: step.contentKey,
                versionId: p1ACycle3ContentVersionId(step.contentKey),
              },
            }
          : {}),
        ...(exerciseReference ? { exercise: exerciseReference } : {}),
        ...(assessment
          ? {
              assessment: {
                key: assessment.key,
                versionId: p1ACycle3AssessmentId(assessment.key),
                questionVersionIds: assessment.questionKeys.map((questionKey) =>
                  p1ACycle3QuestionVersionId(assessment.templateExerciseKey, questionKey),
                ),
              },
            }
          : {}),
      };
    }),
    completion: {
      requiredStepKeys: pathSteps.map((step) => step.key),
      checkpointStepKeys: ["assessment-v3"],
      requiresFinalMeasurement: false,
      nextCycle: "REVIEW_REQUIRED",
    },
  };
}

export function buildEducationV2P1ACycle3LearningCycleManifest(): LearningCycleManifest {
  return buildCycle3Manifest();
}

export const EDUCATION_V2_P1_A_CYCLE_3_MANIFEST = buildCycle3Manifest();

export function validateEducationV2P1ACycle3Manifest(): string[] {
  const result = validateLearningCycleManifest(EDUCATION_V2_P1_A_CYCLE_3_MANIFEST);
  return result.errors.map((error) => `${error.code}: ${error.path}: ${error.message}`);
}

const validationErrors = [...validateP1ACycle3Program(), ...validateEducationV2P1ACycle3Manifest()];
if (validationErrors.length > 0) {
  throw new Error(`Education V2 P1-A cycle 3 kataloğu geçersiz: ${validationErrors.join("; ")}`);
}
