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
 * P1-A cycle 3 authoring and release package.
 *
 * The product owner has explicitly approved this immutable source release.
 * Production assignment still requires its separately provisioned, complete
 * PUBLISHED database graph. Its focus is evidence strength and transfer across
 * text types, extending cycles 1 and 2 without changing those cycles.
 */
export const EDUCATION_V2_P1_A_CYCLE_3_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-3";
export const EDUCATION_V2_P1_A_CYCLE_3_VERSION = 3;
export const EDUCATION_V2_P1_A_CYCLE_3_SEQUENCE = 3;
export const EDUCATION_V2_P1_A_CYCLE_3_PATH_CODE =
  "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_3_G8_12";
export const EDUCATION_V2_P1_A_CYCLE_3_AGE_BAND = "13–17";
export const EDUCATION_V2_P1_A_CYCLE_3_TECHNICAL_COMPLETION_SCORE = 0.75;
export type EducationV2P1ACycle3SourceStatus = "PUBLISHED";
/** Product-owner publication decision for this immutable release package. */
export const EDUCATION_V2_P1_A_CYCLE_3_STATUS: EducationV2P1ACycle3SourceStatus = "PUBLISHED";
/** A published database graph never substitutes for this explicit release decision. */
export const EDUCATION_V2_P1_A_CYCLE_3_EXPLICIT_PUBLICATION_APPROVED = true as const;

export function isEducationV2P1ACycle3ProductionAssignmentEnabled(): boolean {
  return (
    EDUCATION_V2_P1_A_CYCLE_3_STATUS === "PUBLISHED" &&
    EDUCATION_V2_P1_A_CYCLE_3_EXPLICIT_PUBLICATION_APPROVED
  );
}

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

const evidenceTeaching: ProgramContent = {
  ...content(
    "p1a-v3-evidence-teaching",
    "Kanıtın iddiayı nasıl desteklediğini gör",
    [
      "Bir metinde bilgi bulunması, o bilginin her zaman kanıt olduğu anlamına gelmez.",
      "Önce yazarın iddiasını belirle; sonra ayrıntının bu iddiayı doğrudan mı, dolaylı mı desteklediğini sor.",
      "Bir ayrıntı yalnızca konuya değiniyor, fakat iddiayı açıklamıyorsa güçlü kanıt sayılmaz. Kanıt ile sonuç arasındaki bağı metindeki ifadelerle kur.",
    ].join("\n\n"),
    4,
    "RC_INFERENCE",
  ),
  lesson: {
    objective: "Metindeki iddiayı, onu destekleyen ayrıntıdan ayırmak.",
    explanation:
      "Önce yazarın temel iddiasını bul. Sonra ayrıntının bu iddiayı gerçekten gösterip göstermediğini sor. Aynı konudan söz eden her bilgi, tek başına kanıt değildir.",
    workedExample:
      "Atölyedeki araçlara etiket yapıştırıldı. Ekip, aradığı aracı rafta daha çabuk buldu. İddia: etiketler araçları bulmayı kolaylaştırdı. Kanıt: ekibin aradığı araca daha çabuk ulaşması.",
    guidedPractice:
      "Şimdi dene: Kütüphanede raflara numara verildi ve ziyaretçiler aradığı bölümü daha çabuk buldu. Numara vermenin işe yaradığını gösteren ayrıntıyı kendi cümlenle söyle.",
    nextExerciseKey: "p1a-v3-evidence-study",
  },
};

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
  "Sahne işaretlerinin etkisini kanıtla",
  "Drama kulübü, oyuncuların sahneye çıkış sırasını zemindeki çizgilerle belirledi. Prova sırasında oyuncular sıralarını daha az karıştırdı; oyunun süresi ise aynı kaldı.",
  4,
  "RC_DETAIL",
);

const transferTeaching: ProgramContent = {
  ...content(
    "p1a-v3-transfer-teaching",
    "Anlam kurma yaklaşımını yeni metne taşı",
    [
      "Yeni bir metne geçtiğinde önce metnin türünü değil, iddia ile kanıt arasındaki anlam bağını ara.",
      "Bilgilendirici metinlerde açıklanan bir sonuç, anlatı metinlerinde ise karakterin seçimi veya olayın değişimi aynı akıl yürütmeyi gerektirebilir.",
      "Metni özetlerken kanıtın neyi gösterdiğini ve bunun ana düşünceye nasıl bağlandığını birlikte söyle.",
    ].join("\n\n"),
    4,
    "RC_MAIN_IDEA",
  ),
  lesson: {
    objective:
      "Bilgilendirici ve anlatı metinlerinde düzenleme ile sonucu kanıt üzerinden ilişkilendirmek.",
    explanation:
      "Metin türü değişse de önce yapılan değişikliği, sonra metinde gözlenen sonucu bul. Bilgilendirici metin bir düzenlemeyi açıklayabilir; anlatı metni bir kişinin eylemini izletebilir.",
    workedExample:
      "Bilgilendirici metin: Bisiklet yoluna yansıtıcı çizgiler eklendi; akşam kullananlar yolun sınırını daha kolay gördü. Anlatı: Eren kartlarını konuya göre ayırdı; aradığı kartı daha hızlı buldu. Her iki metinde de düzenleme ile gözlenen sonucu eşleştir.",
    guidedPractice:
      "Şimdi dene: Örnekteki iki metinde düzenlemeden sonra neyin kolaylaştığını ayrı ayrı bul. Her sonuç için metinden bir kanıt göster.",
    nextExerciseKey: "p1a-v3-transfer-practice",
  },
};

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
  [
    "Bilgilendirici metin",
    "Kent müzesinde ziyaretçiler bazı sergi nesnelerinin ne işe yaradığını karıştırıyordu. Müze, nesnelerin yanına kısa kullanım açıklamaları ekledi. Sonraki gözlemde doğru eşleştirmeler daha sık görüldü.",
    "Anlatı metni",
    "Mina, okulun kuş gözlem ekibiyle tuttuğu çizelgede günleri ve kuş türlerini karıştırıyordu. Sütunlara başlık ekleyip her gözlemi ayrı satıra yazdı. Sonraki hafta ekip, gördüklerini aynı sırayla kaydedip karşılaştırabildi.",
  ].join("\n\n"),
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
          ["d", "Çukurlar suyu tutar; su toprağa ve bitkilere ulaşır"],
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
          ["c", "Bahçe suyun bir bölümünü toprağa ve bitkilere ulaştırabilir"],
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
    title: "Sahne işaretlerinin etkisini kanıtla",
    templateType: "MIXED",
    contentKey: evidenceReinforcement.key,
    skillCode: "RC_DETAIL",
    contract: contract(
      "Sahne işaretlerinin etkisini kanıtla",
      "DETAIL_EVIDENCE",
      "RC_DETAIL",
      "DEVELOPING",
      "Bir düzenlemenin etkisini yeni bir kısa metindeki gözlemle kontrol et.",
    ),
    questions: [
      question(
        "p1a-v3-evidence-reinforcement-1",
        "Zemindeki çizgiler hangi amaçla kullanılmıştır?",
        [
          ["a", "Oyuncuların sahneye hangi taraftan çıkacağını göstermek"],
          ["b", "Oyuncuların sahneye çıkış sırasını göstermek"],
          ["c", "Sahne süresini uzatıp yeni bölümler eklemek"],
          ["d", "Dekorları prova yapılmadan yerleştirmek"],
        ],
        "b",
        "Metin, zemindeki çizgilerin oyuncuların sahneye çıkış sırasını belirlemek için kullanıldığını söylüyor.",
        "Çizgilerin oyunculara hangi sırayı gösterdiğini bul.",
        4,
      ),
      question(
        "p1a-v3-evidence-reinforcement-2",
        "Metne göre oyuncuların sıraları karıştırması nasıl değişmiştir?",
        [
          ["a", "Daha az karıştırmışlardır"],
          ["b", "Her provada daha çok karıştırmışlardır"],
          ["c", "Sıraları karıştırmadan oyunun süresini uzatmışlardır"],
          ["d", "Sıraları değiştirip çizgileri kaldırmışlardır"],
        ],
        "a",
        "Metne göre oyuncular prova sırasında çıkış sıralarını daha az karıştırdı.",
        "Prova sırasında gözlenen değişikliği metnin son bölümünde ara.",
        4,
      ),
      question(
        "p1a-v3-evidence-reinforcement-3",
        "Metnin desteklediği en sınırlı sonuç hangisidir?",
        [
          ["a", "Oyuncular artık prova yapmadan sahneye çıkabilir"],
          ["b", "Çizgiler her oyunun süresini kesin olarak kısaltır"],
          ["c", "Çizgiler çıkış sırasını izlemeyi kolaylaştırabilir"],
          ["d", "Kulüp dekorları çizgilerin rengine göre değiştirmiştir"],
        ],
        "c",
        "Metin, bu prova düzeninde çizgilerin sırayı izlemeyi kolaylaştırdığını destekliyor; her oyuna ilişkin kesin bir sonuç vermiyor.",
        "Sonucu anlatılan prova düzeniyle sınırlı tut.",
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
          ["d", "İlk tasarımın yazıları uzaktan okunmuyordu"],
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
          ["b", "Yazılar okununca programı izlemek kolaylaştı"],
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
        "Açıklamalar eklendikten sonra hangi doğrudan sonuç gözlenmiştir?",
        [
          ["a", "Müzedeki bütün eserler başka bir salona taşınmıştır"],
          ["b", "Ziyaretçiler açıklamaları görmeden sergiyi tamamlamıştır"],
          ["c", "Doğru eşleştirme sayısı artmıştır"],
          ["d", "Sergi nesnelerinin kullanım amacı değişmiştir"],
        ],
        "c",
        "Metin, kısa kullanım açıklamaları eklendikten sonra doğru eşleştirmelerin daha sık görüldüğünü bildiriyor.",
        "Açıklamalar eklendikten sonra yapılan gözlemi seç.",
        5,
      ),
      question(
        "p1a-v3-assessment-2",
        "Metindeki neden-sonuç zinciri hangisidir?",
        [
          ["a", "Müze açıklamaları kaldırdı; doğru eşleştirmeler daha az görüldü"],
          ["b", "Nesnelerin işlevi değişti; açıklamalar aynı kaldı"],
          ["c", "Doğru eşleştirmeler arttı; ardından kısa açıklamalar eklendi"],
          ["d", "Kısa açıklamalar eklendi; doğru eşleştirmeler daha sık görüldü"],
        ],
        "d",
        "Kısa açıklamaların eklenmesinden sonra nesne ve işlevlerin doğru eşleştirilmesi daha sık gözlendi.",
        "Önce müzenin ne yaptığını, sonra hangi sonucun arttığını sırala.",
        5,
      ),
      question(
        "p1a-v3-assessment-3",
        "Metne dayalı en sınırlı çıkarım hangisidir?",
        [
          ["a", "Kısa açıklamalar nesnelerin işlevini anlamaya yardım edebilir"],
          ["b", "Bu yöntem her müzede bütün ziyaretçilerin yanılmasını önler"],
          ["c", "Açıklamalar sergideki nesnelerin değerini kesin olarak artırır"],
          ["d", "Ziyaretçiler müzedeki her ayrıntıyı açıklamasız da hatırlar"],
        ],
        "a",
        "Bu metin, eklenen kısa açıklamaların bu sergide nesnelerin işlevini anlamaya yardım edebileceğini destekliyor; tüm müzeler için kesinlik vermiyor.",
        "Çıkarımı anlatılan tek sergi gözlemiyle sınırla.",
        5,
      ),
      question(
        "p1a-v3-assessment-4",
        "İki metindeki düzenlemelerin işe yaradığını hangi kanıtlar gösterir?",
        [
          ["a", "Açıklamalar eklendi; çizelge de hafta boyunca dolduruldu"],
          ["b", "Açıklamalar eşleştirmeyi; başlıklar karşılaştırmayı kolaylaştırdı"],
          ["c", "Önce eşleştirme ve karşılaştırma kolaylaştı, sonra düzenleme yapıldı"],
          ["d", "İki metindeki değişiklikler yalnızca görünüşü etkiledi"],
        ],
        "b",
        "Bilgilendirici metinde açıklamalar eşleştirmeyi; anlatıda başlıklar gözlemleri karşılaştırmayı kolaylaştırdı. İkisinde de değişiklik ile sonucu eşleştirdin.",
        "Her metinde yapılan değişikliği, ardından görülen sonuçla eşleştir.",
        5,
      ),
    ],
  },
];

/**
 * Editorial construct map for the candidate package. This is intentionally
 * explicit: a question is not considered evidence for an outcome merely
 * because its exercise happens to use the same broad skill code.
 *
 * The map is an authoring contract, not psychometric validation. The product
 * owner still controls whether this candidate is released.
 */
export const CYCLE_3_EXERCISE_OUTCOME_KEYS = {
  "p1a-v3-evidence-study": ["P1A_V3_EVIDENCE_STRENGTH"],
  "p1a-v3-evidence-practice": ["P1A_V3_EVIDENCE_STRENGTH", "P1A_V3_CAUSE_CONSEQUENCE_TRANSFER"],
  "p1a-v3-evidence-reinforcement": ["P1A_V3_EVIDENCE_STRENGTH"],
  "p1a-v3-transfer-practice": ["P1A_V3_CAUSE_CONSEQUENCE_TRANSFER", "P1A_V3_GENRE_TRANSFER"],
  "p1a-v3-assessment": [
    "P1A_V3_EVIDENCE_STRENGTH",
    "P1A_V3_CAUSE_CONSEQUENCE_TRANSFER",
    "P1A_V3_GENRE_TRANSFER",
  ],
} as const;

export const CYCLE_3_QUESTION_OUTCOME_KEYS = {
  "p1a-v3-evidence-study": {
    "p1a-v3-evidence-study-1": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-evidence-study-2": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-evidence-study-3": ["P1A_V3_EVIDENCE_STRENGTH"],
  },
  "p1a-v3-evidence-practice": {
    "p1a-v3-evidence-practice-1": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-evidence-practice-2": ["P1A_V3_CAUSE_CONSEQUENCE_TRANSFER"],
    "p1a-v3-evidence-practice-3": ["P1A_V3_EVIDENCE_STRENGTH"],
  },
  "p1a-v3-evidence-reinforcement": {
    "p1a-v3-evidence-reinforcement-1": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-evidence-reinforcement-2": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-evidence-reinforcement-3": ["P1A_V3_EVIDENCE_STRENGTH"],
  },
  "p1a-v3-transfer-practice": {
    "p1a-v3-transfer-practice-1": ["P1A_V3_CAUSE_CONSEQUENCE_TRANSFER"],
    "p1a-v3-transfer-practice-2": ["P1A_V3_GENRE_TRANSFER"],
    "p1a-v3-transfer-practice-3": ["P1A_V3_CAUSE_CONSEQUENCE_TRANSFER", "P1A_V3_GENRE_TRANSFER"],
  },
  "p1a-v3-assessment": {
    "p1a-v3-assessment-1": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-assessment-2": ["P1A_V3_CAUSE_CONSEQUENCE_TRANSFER"],
    "p1a-v3-assessment-3": ["P1A_V3_EVIDENCE_STRENGTH"],
    "p1a-v3-assessment-4": ["P1A_V3_GENRE_TRANSFER"],
  },
} as const;

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
    if (step.type === "TEACHING") {
      const lesson = step.contentKey ? contentByKey.get(step.contentKey)?.lesson : undefined;
      const nextStep = pathSteps[index + 1];
      if (!lesson) {
        errors.push(`Öğretim içeriğinde yapılandırılmış ders eksik: ${step.key}`);
      } else {
        if (
          !lesson.objective.trim() ||
          !lesson.explanation.trim() ||
          !lesson.workedExample.trim() ||
          !lesson.guidedPractice.trim()
        ) {
          errors.push(`Öğretim içeriği eksik: ${step.key}`);
        }
        if (
          !candidate.exercises.some((exercise) => exercise.key === lesson.nextExerciseKey) ||
          nextStep?.exerciseKey !== lesson.nextExerciseKey
        ) {
          errors.push(`Öğretim ve sonraki alıştırma bağlantısı geçersiz: ${step.key}`);
        }
      }
    }
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
    const mappedExerciseOutcomeKeys = (
      CYCLE_3_EXERCISE_OUTCOME_KEYS as Record<string, readonly string[]>
    )[exercise.key];
    if (!mappedExerciseOutcomeKeys?.length) {
      errors.push(`Exercise kazanım eşlemesi eksik: ${exercise.key}`);
    }
    const linkedStep = pathSteps.find(
      (step) =>
        step.exerciseKey === exercise.key ||
        (step.assessmentKey &&
          assessmentByKey.get(step.assessmentKey)?.templateExerciseKey === exercise.key),
    );
    if (!linkedStep) errors.push(`Exercise öğrenme adımıyla eşleşmiyor: ${exercise.key}`);
    for (const outcomeKey of mappedExerciseOutcomeKeys ?? []) {
      if (!outcomeKeys.has(outcomeKey)) {
        errors.push(`Bilinmeyen exercise kazanımı: ${exercise.key} -> ${outcomeKey}`);
      } else if (linkedStep && !linkedStep.learningOutcomeKeys.includes(outcomeKey)) {
        errors.push(`Exercise kazanımı adımla uyumsuz: ${exercise.key} -> ${outcomeKey}`);
      }
    }
    const questionOutcomeMap = (
      CYCLE_3_QUESTION_OUTCOME_KEYS as Record<string, Record<string, readonly string[]>>
    )[exercise.key];
    const mappedQuestionKeys = new Set(Object.keys(questionOutcomeMap ?? {}));
    for (const item of exercise.questions) {
      if (
        !questionOutcomeMap ||
        !Object.prototype.hasOwnProperty.call(questionOutcomeMap, item.key)
      ) {
        errors.push(`Soru kazanım eşlemesi eksik: ${exercise.key} -> ${item.key}`);
      }
      const questionOutcomeKeys = questionOutcomeMap?.[item.key];
      for (const outcomeKey of questionOutcomeKeys ?? []) {
        if (!outcomeKeys.has(outcomeKey)) {
          errors.push(`Bilinmeyen soru kazanımı: ${item.key} -> ${outcomeKey}`);
        }
        if (!mappedExerciseOutcomeKeys?.includes(outcomeKey)) {
          errors.push(`Soru exercise kazanımıyla uyumsuz: ${item.key} -> ${outcomeKey}`);
        }
        if (linkedStep && !linkedStep.learningOutcomeKeys.includes(outcomeKey)) {
          errors.push(`Soru adım kazanımıyla uyumsuz: ${item.key} -> ${outcomeKey}`);
        }
      }
      const optionIds = item.options.map((optionItem) => optionItem.id);
      if (
        optionIds.length !== 4 ||
        new Set(optionIds).size !== 4 ||
        !optionIds.includes(item.correctOptionId)
      ) {
        errors.push(`Soru seçenek sözleşmesi geçersiz: ${item.key}`);
      }
    }
    for (const mappedQuestionKey of mappedQuestionKeys) {
      if (!exercise.questions.some((item) => item.key === mappedQuestionKey)) {
        errors.push(
          `Kazanım eşlemesi için soru bulunamadı: ${exercise.key} -> ${mappedQuestionKey}`,
        );
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
