import {
  parseTrainingExerciseVersionConfig,
  timeRoleForTrainingFamily,
  type TrainingExerciseVersionConfig,
} from "../modules/training/exercise-contract.js";
import type {
  ProgramContent,
  ProgramExercise,
  ProgramQuestion,
} from "./education-v2-p0-program.js";
import {
  LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
  validateLearningCycleManifest,
  type LearningCycleManifest,
  type LearningCycleValidationError,
} from "./learning-cycle-manifest.js";
import type { P1AProgram, P1APathStep } from "./education-v2-p1-a-program.js";

/**
 * P1-A cycle 2 authoring package.
 *
 * This is a versioned production release package. Importing it only exposes
 * the release contract; the protected provisioning script is still required
 * to create the database graph.
 */
export const EDUCATION_V2_P1_A_CYCLE_V2_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE-CYCLE-2";
export const EDUCATION_V2_P1_A_CYCLE_V2_VERSION = 2;
export const EDUCATION_V2_P1_A_CYCLE_V2_SEQUENCE = 2;
export const EDUCATION_V2_P1_A_CYCLE_V2_PATH_CODE =
  "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_2_G8_12";
export const EDUCATION_V2_P1_A_CYCLE_V2_AGE_BAND = "13–17";
export const EDUCATION_V2_P1_A_CYCLE_V2_TECHNICAL_COMPLETION_SCORE = 0.75;
export type EducationV2P1ACycleV2SourceStatus = "PUBLISHED";
/** Product-owner publication decision for this immutable release package. */
export const EDUCATION_V2_P1_A_CYCLE_V2_STATUS: EducationV2P1ACycleV2SourceStatus = "PUBLISHED";
/** Database PUBLISHED rows never substitute for this explicit release decision. */
export const EDUCATION_V2_P1_A_CYCLE_V2_EXPLICIT_PUBLICATION_APPROVED = true as const;

export function isEducationV2P1ACycleV2ProductionAssignmentEnabled(): boolean {
  return (
    EDUCATION_V2_P1_A_CYCLE_V2_STATUS === "PUBLISHED" &&
    EDUCATION_V2_P1_A_CYCLE_V2_EXPLICIT_PUBLICATION_APPROVED
  );
}

export const CYCLE_V2_LEARNING_OUTCOMES = [
  {
    key: "P1A_V2_STRUCTURE_FOUNDATION",
    statement: "Konu, ana düşünce ve destekleyici ayrıntı arasındaki metin yapısını kurar.",
    targetSkillCodes: ["RC_MAIN_IDEA", "RC_DETAIL"],
  },
  {
    key: "P1A_V2_MEANING_RELATIONS",
    statement: "Neden-sonuç, karşılaştırma ve zıtlık ilişkilerini metin kanıtıyla ayırt eder.",
    targetSkillCodes: ["RC_DETAIL"],
  },
  {
    key: "P1A_V2_TRANSFER",
    statement: "Yeni bir metinde ana düşünce, kanıt ve ilişki zincirini aktarır.",
    targetSkillCodes: ["RC_INFERENCE"],
  },
] as const;

const V2_PREFIX = "edu-v2-p1-a-cycle-2";

export function p1ACycleV2Id(
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
  return `${V2_PREFIX}-${kind}-${key}`;
}

export function p1ACycleV2ContentVersionId(contentKey: string): string {
  return p1ACycleV2Id("contentVersion", `${contentKey}-v2`);
}

export function p1ACycleV2TemplateId(exerciseKey: string): string {
  return p1ACycleV2Id("template", exerciseKey);
}

export function p1ACycleV2TemplateVersionId(exerciseKey: string): string {
  return p1ACycleV2Id("templateVersion", `${exerciseKey}-v2`);
}

export function p1ACycleV2QuestionId(exerciseKey: string, questionKey: string): string {
  return p1ACycleV2Id("question", `${exerciseKey}-${questionKey}`);
}

export function p1ACycleV2QuestionVersionId(exerciseKey: string, questionKey: string): string {
  return p1ACycleV2Id("questionVersion", `${exerciseKey}-${questionKey}-v2`);
}

export function p1ACycleV2AssessmentId(assessmentKey: string): string {
  return p1ACycleV2Id("assessment", `${assessmentKey}-v2`);
}

export function p1ACycleV2UnitId(unitCode: string): string {
  return p1ACycleV2Id("unit", unitCode);
}

export function p1ACycleV2StepId(stepKey: string): string {
  return p1ACycleV2Id("step", stepKey);
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
      timeRole: timeRoleForTrainingFamily(family),
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

const structureTeaching: ProgramContent = {
  ...content(
    "p1a-v2-structure-teach",
    "Metnin omurgasını kur",
    [
      "Bir metnin omurgasını kurarken üç soruyu sırayla sor: Metin ne hakkında? Yazar bu konuda ne söylüyor? Hangi bilgiler bu düşünceyi destekliyor?",
      "Konu, metnin üzerinde durduğu genel alandır. Ana düşünce, yazarın bu konu hakkındaki temel mesajıdır. Destekleyici ayrıntı ise bu mesajı açıklayan, örnekleyen veya kanıtlayan bilgidir.",
      "Bir ayrıntı ilginç olabilir; fakat bütün metnin mesajını açıklamıyorsa ana düşünce değildir. Ana düşünceyi seçmeden önce seçeneğin birden fazla cümleyi açıklayıp açıklamadığını kontrol et.",
    ].join("\n\n"),
    3,
    "RC_MAIN_IDEA",
  ),
  lesson: {
    objective: "Konu, ana düşünce ve destekleyici ayrıntıyı ayırt etmek",
    explanation:
      "Metnin omurgası konu, ana düşünce ve bu düşünceyi destekleyen ayrıntılardan oluşur.",
    workedExample:
      "Önce metnin tamamında tekrar eden mesajı bul, sonra bu mesajı açıklayan ayrıntıyı seç.",
    guidedPractice:
      "Kısa metinde konuyu, ana düşünceyi ve onu destekleyen ayrıntıyı sırayla işaretle.",
    nextExerciseKey: "p1a-v2-structure-study",
  },
};

const structureStudy = content(
  "p1a-v2-structure-study",
  "Bilgilerin metindeki görevini ayır",
  "Kısa bir paragrafta konu, ana düşünce ve destekleyici ayrıntıyı aynı anlam bütünü içinde ayır. Bir cümlenin önceki bilgiyi açıklayıp açıklamadığını ve metnin mesajına nasıl bağlandığını düşün.",
  3,
  "RC_MAIN_IDEA",
);

const evidencePractice = content(
  "p1a-v2-evidence-practice",
  "Ana düşünceyi kanıtla bağla",
  "Yeni bir paragrafta ana düşünceyi seçtikten sonra bu düşünceyi doğrudan destekleyen bilgileri bul. Metinde geçen her bilgi kanıt değildir; kanıt, iddianın anlamını taşıyan veya onu açıklayan bilgidir.",
  3,
  "RC_DETAIL",
);

const structureReinforcement = content(
  "p1a-v2-structure-reinforcement",
  "Metin omurgasını geri çağır",
  "Daha önce öğrendiğin konu, ana düşünce ve ayrıntı ayrımını yeni ve kısa metinlerde yeniden kur. Cevabını seçerken en uzun veya en dikkat çekici seçeneğe değil, metnin ortak mesajına dayan.",
  3,
  "RC_MAIN_IDEA",
);

const relationsTeaching: ProgramContent = {
  ...content(
    "p1a-v2-relations-teach",
    "Bilgiler arasındaki ilişkiyi gör",
    [
      "Cümleler yalnızca art arda dizilmez; aralarında neden-sonuç, karşılaştırma, zıtlık, sıralama veya örnekleme ilişkisi kurulabilir.",
      "‘Çünkü’ ve ‘nedeniyle’ nedeni, ‘bu nedenle’ ve ‘böylece’ sonucu, ‘oysa’ ve ‘buna karşılık’ karşılaştırma veya zıtlığı, ‘örneğin’ ise açıklayıcı örneği işaret edebilir.",
      "Önce bağlanan iki bilgiyi belirle, sonra aralarındaki ilişkiyi adlandır. Sadece bağlaç kelimesini bulmak, ilişkinin anlamını tek başına kanıtlamaz.",
    ].join("\n\n"),
    3,
    "RC_DETAIL",
  ),
  lesson: {
    objective: "Metindeki cümleler arasındaki anlam ilişkisini belirlemek",
    explanation:
      "Cümleler neden-sonuç, karşılaştırma, zıtlık veya örnekleme gibi ilişkilerle birbirine bağlanır.",
    workedExample:
      "Önce iki bilgiyi ayır, ardından aralarındaki ilişkiyi taşıyan ifadeyi ve anlamı birlikte kontrol et.",
    guidedPractice:
      "Kısa metindeki iki cümleyi eşleştir ve aralarındaki ilişkiyi metin kanıtıyla adlandır.",
    nextExerciseKey: "p1a-v2-relations-study",
  },
};

const relationsStudy = content(
  "p1a-v2-relations-study",
  "İlişkiyi kanıtıyla eşleştir",
  "Cümleler arasındaki ilişkiyi belirlerken ilişkinin iki tarafını ve bunu taşıyan ifadeyi birlikte seç. Neden ile sonucu, benzerlik ile zıtlığı birbirine karıştırma.",
  3,
  "RC_DETAIL",
);

const transferPractice = content(
  "p1a-v2-transfer-practice",
  "Yeni metinde yapıyı çöz",
  "Daha önce karşılaşmadığın bir bilgilendirici metinde ana düşünceyi, destekleyici kanıtları ve cümleler arasındaki ilişkiyi birlikte çöz. Önce metnin bütününü, sonra ayrıntıların görevini değerlendir.",
  4,
  "RC_INFERENCE",
);

const relationsReinforcement = content(
  "p1a-v2-relations-reinforcement",
  "Metin haritasını tamamla",
  "Bir metin haritasında ana düşünceyi, onu destekleyen kanıtları ve kanıtlarla düşünce arasındaki ilişkiyi birlikte göster. Metinde geçen ancak ana düşünceyi desteklemeyen bir bilgiyi kanıt olarak işaretleme.",
  4,
  "RC_INFERENCE",
);

const assessmentContent = content(
  "p1a-v2-assessment",
  "Anlam ve metin yapısı kontrolü",
  "Bu kontrol için öğretim ve alıştırmalarda kullanılmamış yeni metinler kullanılmalıdır. Konu, ana düşünce, kanıt, ilişki ve yeni metne aktarım becerilerini birbirinden ayrı gözlemle.",
  4,
  "RC_MAIN_IDEA",
);

const exercises: ProgramExercise[] = [
  {
    key: "p1a-v2-structure-study",
    title: "Metin parçalarının görevini ayır",
    templateType: "COMPREHENSION",
    contentKey: structureStudy.key,
    skillCode: "RC_MAIN_IDEA",
    contract: contract(
      "Metin parçalarının görevini ayır",
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
      "DEVELOPING",
      "Konu, ana düşünce ve ayrıntıyı kısa metinlerin bütünüyle eşleştir.",
    ),
    questions: [
      question(
        "p1a-v2-structure-study-1",
        "‘Okul çatısına yağmur depoları yerleştirildi. Biriken su, bahçedeki bitkileri sulamak için kullanıldı.’ İkinci cümle hangi görevi üstlenir?",
        [
          ["a", "İlk cümleden bağımsız yeni bir uygulamayı tanıtır"],
          ["b", "Okulun çatısının ve çevresinin özelliklerini anlatır"],
          ["c", "İlk cümledeki uygulamanın yararını açıklar"],
          ["d", "Metnin yazarı ve çalışmanın amacı hakkında bilgi verir"],
        ],
        "c",
        "İkinci cümle, depolanan suyun nasıl kullanıldığını söyleyerek ilk cümledeki uygulamanın yararını açıklıyor.",
        "İkinci cümle ilk bilgiyi açıklıyor mu, yoksa ondan kopuk yeni bir bilgi mi veriyor?",
        3,
      ),
      question(
        "p1a-v2-structure-study-2",
        "Aynı parçanın ana düşüncesi hangisidir?",
        [
          ["a", "Bahçedeki bitkilerin sulama ihtiyacını tek başına anlatması"],
          ["b", "Okul çatısına yerleştirilen depoların görünüşünü tanıtması"],
          ["c", "Yağmur suyunun hangi mevsimde toplandığını açıklaması"],
          ["d", "Yağmur suyunun biriktirilip bahçede kullanılması"],
        ],
        "d",
        "İki cümle birlikte yağmur suyunun toplanarak bahçe bakımında kullanılmasını anlatıyor.",
        "Tek bir ayrıntıyı değil, iki cümlenin ortak mesajını seç.",
        3,
      ),
      question(
        "p1a-v2-structure-study-3",
        "Ana düşünceyi ayrıntıdan ayırmak için en güvenilir kontrol hangisidir?",
        [
          ["b", "Seçenekler içinde en uzun ve ayrıntılı olanı işaretlemek"],
          ["c", "Kendi deneyimini metindeki bilgilerin yerine koymak"],
          ["d", "Yalnızca son cümlenin verdiği bilgiye göre karar vermek"],
          ["a", "Seçeneğin metnin bütünüyle uyuşup uyuşmadığını sınamak"],
        ],
        "a",
        "Ana düşünce, metnin birden fazla bölümünü ortak bir mesaj altında açıklayabilmelidir.",
        "Cevabın yalnızca bir parçaya mı, metnin tamamına mı uyduğunu kontrol et.",
        3,
      ),
    ],
  },
  {
    key: "p1a-v2-evidence-practice",
    title: "Ana düşünceyi metin kanıtıyla bağla",
    templateType: "COMPREHENSION",
    contentKey: evidencePractice.key,
    skillCode: "RC_DETAIL",
    contract: contract(
      "Ana düşünceyi metin kanıtıyla bağla",
      "DETAIL_EVIDENCE",
      "RC_DETAIL",
      "DEVELOPING",
      "Ana düşünceyi destekleyen kanıtları yeni bir paragraftan seç.",
    ),
    questions: [
      question(
        "p1a-v2-evidence-practice-1",
        "‘Mahalle pazarı yeniden düzenlendi. Ürün grupları ayrı sıralara alındı ve girişlere yönlendirme levhaları kondu.’ Düzenlemenin yapıldığını en doğrudan hangi bilgi gösterir?",
        [
          ["b", "Pazarın her hafta aynı gün yeniden kurulması"],
          ["c", "Mahallenin şehir merkezine yakın bir yerde bulunması"],
          ["d", "Bazı ürünlerin belirli mevsimlerde satılabilmesi"],
          ["a", "Ürünlerin ayrılması, levhaların eklenmesi"],
        ],
        "a",
        "Bu iki bilgi, pazarın düzenlenmesi düşüncesini doğrudan gösteren uygulamalardır.",
        "Düşünceyi metinde hangi somut uygulamalar kanıtlıyor?",
        3,
      ),
      question(
        "p1a-v2-evidence-practice-2",
        "Bir bilginin metin kanıtı sayılabilmesi için ne gerekir?",
        [
          ["a", "Okuyucunun kendi deneyimiyle de uyumlu olması"],
          ["b", "Metindeki düşünceyi desteklemesi"],
          ["c", "Diğer seçeneklerden daha ayrıntılı ve uzun yazılması"],
          ["d", "Metinde geçen herhangi bir kelimeyle bağlantı kurması"],
        ],
        "b",
        "Kanıt, yalnızca metinde geçmekle kalmaz; iddianın anlamını destekler veya açıklar.",
        "Bilgi, seçtiğin düşünceyi gerçekten gösteriyor mu?",
        3,
      ),
      question(
        "p1a-v2-evidence-practice-3",
        "‘Müze, eski fotoğrafları öğrencilerin çizimleriyle aynı salonda sergiledi.’ Serginin özelliğini açıklayan kanıt hangisidir?",
        [
          ["a", "Müzenin hangi ilçede ve hangi sokakta bulunduğu"],
          ["b", "Salonun gün içinde hangi saatlere kadar açık olduğu"],
          ["c", "Fotoğraflarla çizimlerin birlikte sergilenmesi"],
          ["d", "Öğrencilerin müzeye yürüyerek birlikte gitmesi"],
        ],
        "c",
        "Serginin özelliğini doğrudan açıklayan bilgi, iki farklı çalışmanın aynı salonda birlikte sunulmasıdır.",
        "Serginin nasıl düzenlendiğini doğrudan söyleyen bölümü ara.",
        3,
      ),
    ],
  },
  {
    key: "p1a-v2-structure-reinforcement",
    title: "Metin omurgasını geri çağır",
    templateType: "MIXED",
    contentKey: structureReinforcement.key,
    skillCode: "RC_MAIN_IDEA",
    contract: contract(
      "Metin omurgasını geri çağır",
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
      "DEVELOPING",
      "Konu, ana düşünce ve ayrıntının görevlerini yeni kısa metinlerde geri çağır.",
    ),
    questions: [
      question(
        "p1a-v2-structure-reinforcement-1",
        "Bir paragrafta ana düşünceyi bulduktan sonra hangi kontrol yapılmalıdır?",
        [
          ["b", "Metindeki bütün ayrıntıları yok saymak"],
          ["c", "Kendi fikrini ana düşünce yerine koymak"],
          ["d", "Yalnızca ilk cümledeki ayrıntıyı tekrar etmek"],
          ["a", "Destekleyici ayrıntıları metinde bulmak"],
        ],
        "a",
        "Ana düşünce, metindeki destekleyici ayrıntılarla sınanmalıdır.",
        "Ana düşünceyi metnin hangi bilgileri taşıyor?",
        3,
      ),
      question(
        "p1a-v2-structure-reinforcement-2",
        "‘Okul bahçelerinde geri dönüşüm çalışmaları’ ifadesi tek başına hangi tür bilgidir?",
        [
          ["a", "Metnin konusu"],
          ["b", "Ana düşünceyi destekleyen sonuç"],
          ["c", "Yazarın vardığı çıkarım"],
          ["d", "İki bilgi arasındaki neden-sonuç ilişkisi"],
        ],
        "a",
        "Bu ifade yalnızca metnin ne hakkında olduğunu söyler; yazarın bu konuda ne söylediğini tamamlamaz.",
        "İfade konu alanını mı, yazarın mesajını mı söylüyor?",
        3,
      ),
      question(
        "p1a-v2-structure-reinforcement-3",
        "Bir seçeneğin metnin bütününü açıklayıp açıklamadığı nasıl sınanır?",
        [
          ["a", "Seçeneğin en şaşırtıcı veya en dikkat çekici ifade olup olmadığını sorarak"],
          ["b", "Kişisel görüşüne en yakın seçeneği metni incelemeden seçerek"],
          ["c", "Birden fazla ayrıntıyla anlamlı bağ kurup kurmadığını kontrol ederek"],
          ["d", "Metnin tamamını okumadan en kısa seçeneği işaretleyerek"],
        ],
        "c",
        "Bütün metni açıklayan düşünce, birden fazla ayrıntıyla anlamlı biçimde bağ kurar.",
        "Seçenek, metnin birden fazla bölümünü birlikte açıklıyor mu?",
        3,
      ),
    ],
  },
  {
    key: "p1a-v2-relations-study",
    title: "Cümleler arasındaki ilişkiyi ve kanıtını bul",
    templateType: "COMPREHENSION",
    contentKey: relationsStudy.key,
    skillCode: "RC_DETAIL",
    contract: contract(
      "Cümleler arasındaki ilişkiyi ve kanıtını bul",
      "DETAIL_EVIDENCE",
      "RC_DETAIL",
      "DEVELOPING",
      "İlişki türünü ve ilişkiyi taşıyan metin kanıtını birlikte seç.",
    ),
    questions: [
      question(
        "p1a-v2-relations-study-1",
        "‘Kampanya boyunca öğrenciler bez çanta kullandı; böylece tek kullanımlık poşetlerin sayısı azaldı.’ İlişki hangisidir?",
        [
          ["a", "Neden-sonuç"],
          ["b", "Karşılaştırma"],
          ["c", "Tanımlama"],
          ["d", "Zaman sıralaması"],
        ],
        "a",
        "Bez çanta kullanımı bir uygulama, poşetlerin azalması ise bu uygulamanın sonucudur.",
        "‘Böylece’den önce ve sonra hangi iki bilgi var?",
        3,
      ),
      question(
        "p1a-v2-relations-study-2",
        "‘Birinci taslak kısa ve doğrudandı; oysa ikinci taslak daha fazla örnek içeriyordu.’ Bu cümledeki ilişkiyi en iyi gösteren ifade hangisidir?",
        [
          ["a", "İki taslağın aynı özellikleri taşıdığını söylemesi"],
          ["b", "İki taslağın farklı özelliklerinin karşılaştırılması"],
          ["c", "İlk taslağın ikinci taslağın ortaya çıkmasına neden olması"],
          ["d", "Taslakların yalnızca hazırlanma zamanına göre sıralanması"],
        ],
        "b",
        "‘Oysa’ sözcüğü, iki taslağın farklı özelliklerini karşılaştırarak zıtlık kuruyor.",
        "İki taslağın özellikleri aynı mı, farklı mı?",
        3,
      ),
      question(
        "p1a-v2-relations-study-3",
        "Bir metindeki ilişkiyi bulurken ilk olarak ne yapılmalıdır?",
        [
          ["a", "İki bilgiyi ayrı ayrı bulmak"],
          ["b", "Yalnızca bağlaç kelimesini ezberlemek"],
          ["c", "Metnin son cümlesini cevap saymak"],
          ["d", "Metinde bulunmayan bir neden eklemek"],
        ],
        "a",
        "İlişkiyi anlamak için önce iki tarafın hangi bilgileri bağladığını görmek gerekir.",
        "İlişkinin iki tarafında hangi bilgiler bulunuyor?",
        3,
      ),
    ],
  },
  {
    key: "p1a-v2-transfer-practice",
    title: "Yeni metinde yapıyı çöz",
    templateType: "INFERENCE",
    contentKey: transferPractice.key,
    skillCode: "RC_INFERENCE",
    contract: contract(
      "Yeni metinde yapıyı çöz",
      "INFERENCE",
      "RC_INFERENCE",
      "CHALLENGING",
      "Yeni bir bilgilendirici metinde ana düşünceyi, kanıt zincirini ve ilişkiyi birlikte çöz.",
    ),
    questions: [
      question(
        "p1a-v2-transfer-practice-1",
        "‘Kasabadaki su değirmeni onarıldı. Ziyaretçiler artık değirmenin çalışma düzenini görebiliyor; bilgi panolarında yöre halkının anlattığı öyküler de yer alıyor.’ Metnin ana düşüncesi hangisidir?",
        [
          ["a", "Değirmenin yalnızca dış görünüşünün değişmesi"],
          ["b", "Panoların kasabada bulunması"],
          ["c", "Değirmenin işleyişi ve yerel öyküleri"],
          ["d", "Ziyaretçilerin değirmeni uzaktan görmesi"],
        ],
        "c",
        "Metin, değirmenin çalışma düzeniyle birlikte yöre öykülerinin de ziyaretçilere sunulmasını anlatıyor.",
        "İki cümlenin ortak mesajını kapsayan seçeneği ara.",
        4,
      ),
      question(
        "p1a-v2-transfer-practice-2",
        "Aynı metinde bilgi panolarının eklenmesi neyi destekler?",
        [
          ["a", "Değirmenin bulunduğu yerden hemen başka bir kasabaya taşınmasını"],
          ["b", "İşleyişi ve yerel öyküleri birlikte anlamayı"],
          ["c", "Kasabada yaşayan insanların ve ziyaretçilerin sayısının artmasını"],
          ["d", "Değirmenin onarıldığı hâlde yeniden çalıştırılmamasını"],
        ],
        "b",
        "Panolar, değirmenin nasıl çalıştığı ile yöreye ait anlatıları ziyaretçilerin birlikte anlamasına yardım ediyor.",
        "Panolar iki cümledeki hangi bilgileri birbirine bağlıyor?",
        4,
      ),
      question(
        "p1a-v2-transfer-practice-3",
        "Bu metindeki kanıt zinciri neyi gösterir?",
        [
          ["a", "Değirmenin kaç yaşında olduğunu ve kimlerce yapıldığını"],
          ["b", "Ziyaretçilerin değirmenle ilgili kişisel deneyimlerini"],
          ["c", "Kasabanın kuruluşundan bugüne bütün tarihini"],
          ["d", "Ayrıntıların ana düşünceye nasıl bağlandığını"],
        ],
        "d",
        "Çalışma düzeni ve panolar, değirmenin teknik ve kültürel yönleriyle tanıtıldığı ana düşüncesini destekliyor.",
        "Ayrıntılar ana düşünceyi hangi yoldan açıklıyor?",
        4,
      ),
    ],
  },
  {
    key: "p1a-v2-relations-reinforcement",
    title: "Metin haritasını tamamla",
    templateType: "MIXED",
    contentKey: relationsReinforcement.key,
    skillCode: "RC_INFERENCE",
    contract: contract(
      "Metin haritasını tamamla",
      "INFERENCE",
      "RC_INFERENCE",
      "CHALLENGING",
      "Ana düşünceyi, kanıtları ve aralarındaki ilişkiyi yeni bir metin haritasında birleştir.",
    ),
    questions: [
      question(
        "p1a-v2-relations-reinforcement-1",
        "Metin haritasında ana düşünce ile ayrıntılar arasındaki bağ nasıl kontrol edilir?",
        [
          ["a", "Ayrıntıların ana düşünceye katkısını göstererek"],
          ["b", "Yalnızca ayrıntıların uzunluğunu karşılaştırarak"],
          ["c", "Ana düşünceyi metinden bağımsız yazarak"],
          ["d", "En çok kelime içeren ayrıntıyı seçerek"],
        ],
        "a",
        "Haritadaki her kanıt, ana düşünceyle anlamlı bir bağ kurmalıdır.",
        "Ayrıntı ana düşünceyi gerçekten açıklıyor mu?",
        4,
      ),
      question(
        "p1a-v2-relations-reinforcement-2",
        "Bir bilgi metinde geçiyor ancak ana düşünceyi desteklemiyorsa ne yapılmalıdır?",
        [
          ["a", "Sırf metinde geçiyor diye ana düşünce sayılmalıdır"],
          ["b", "Bilginin işlevi yeniden değerlendirilmelidir"],
          ["c", "Metnin konusu değiştirilmelidir"],
          ["d", "Kişisel bir örnek eklenmelidir"],
        ],
        "b",
        "Bir bilginin metinde bulunması, onun ana düşünceyi desteklediği anlamına gelmez; görevini yeniden kontrol etmek gerekir.",
        "Bu bilgi metnin mesajına nasıl hizmet ediyor?",
        4,
      ),
      question(
        "p1a-v2-relations-reinforcement-3",
        "Güçlü bir metin haritası hangisini birlikte gösterir?",
        [
          ["a", "Yalnızca metnin başlığını ve ilk cümlesini birlikte göstermesi"],
          ["b", "Ana düşünceyi, kanıtları ve aralarındaki ilişkileri"],
          ["c", "Okuyucunun metin dışındaki kişisel bilgisini temel alması"],
          ["d", "Metindeki yalnızca en uzun cümleyi öne çıkarması"],
        ],
        "b",
        "Metin haritası yalnızca parçaları değil, parçalar arasındaki anlam bağını da göstermelidir.",
        "Haritada düşünce, kanıt ve bağ birlikte bulunuyor mu?",
        4,
      ),
    ],
  },
  {
    key: "p1a-v2-assessment",
    title: "Anlam ve metin yapısı kontrolü",
    templateType: "MIXED",
    contentKey: assessmentContent.key,
    skillCode: "RC_MAIN_IDEA",
    contract: contract(
      "Anlam ve metin yapısı kontrolü",
      "MAIN_IDEA",
      "RC_MAIN_IDEA",
      "CHALLENGING",
      "Öğretimde ve alıştırmalarda kullanılmamış metinlerde konu, ana düşünce, kanıt ve ilişki bilgisini birlikte kullan.",
    ),
    questions: [
      question(
        "p1a-v2-assessment-1",
        "‘İlçe, kullanılmayan bir binayı öğrenci çalışma merkezine dönüştürdü. Merkezde sessiz odalar, danışma masası ve ortak proje alanı bulunuyor.’ Ana düşünce hangisidir?",
        [
          ["a", "Binanın öğrenci çalışma alanına dönüşmesi"],
          ["b", "Danışma masasının hangi renkte olduğu"],
          ["c", "Öğrencilerin hangi gün buluştuğu"],
          ["d", "Proje alanında yapılan bütün işlerin listesi"],
        ],
        "a",
        "İki cümle birlikte binanın öğrenci çalışmaları için düzenlenmesini anlatıyor.",
        "İki cümleyi birlikte açıklayan seçeneği ara.",
        4,
      ),
      question(
        "p1a-v2-assessment-2",
        "Aynı metinde ‘danışma masası bulunuyor’ bilgisi hangi görevdedir?",
        [
          ["a", "Ana düşünceye karşıt bir sonuç veya zıt görüş bildiren bilgi"],
          ["b", "Dönüştürülen merkezin bir özelliğini açıklayan ayrıntı"],
          ["c", "Merkezle hiçbir ilgisi olmayan, metin dışında kalan bilgi"],
          ["d", "Metnin içeriğini açıklamayan yalnızca bir başlık olması"],
        ],
        "b",
        "Danışma masası, merkezin öğrencilere sunduğu olanaklardan birini açıklıyor.",
        "Bu bilgi çalışma merkezinin hangi özelliğini gösteriyor?",
        4,
      ),
      question(
        "p1a-v2-assessment-3",
        "‘Yağış nedeniyle açık hava etkinliği ertelendi.’ cümlesindeki ilişki hangisidir?",
        [
          ["a", "Karşılaştırma"],
          ["b", "Örnekleme"],
          ["c", "Neden-sonuç"],
          ["d", "Tanımlama"],
        ],
        "c",
        "Yağış neden, etkinliğin ertelenmesi sonuçtur.",
        "‘Nedeniyle’ sözcüğünün iki tarafındaki bilgileri ayır.",
        4,
      ),
      question(
        "p1a-v2-assessment-4",
        "Metin dışı güçlü bir tahmin yerine kanıtlı çıkarımı seçmek için ne yapılmalıdır?",
        [
          ["a", "Kendi deneyimini tek başına kanıt saymak"],
          ["b", "En iddialı seçeneği gerekçesiz işaretlemek"],
          ["c", "Yalnızca ilk kelimeye bakarak karar vermek"],
          ["d", "Sonucu metin kanıtına bağlamak"],
        ],
        "d",
        "Kanıtlı çıkarım, metindeki bilgilerin birlikte desteklediği sınırlı sonuca dayanır.",
        "Seçimin metindeki hangi bilgilerden çıktığını gösterebilir misin?",
        4,
      ),
    ],
  },
];

const steps: P1APathStep[] = [
  {
    key: "structure-teaching-v2",
    title: "Metnin omurgasını kur",
    type: "TEACHING",
    contentKey: structureTeaching.key,
    learningOutcomeKeys: ["P1A_V2_STRUCTURE_FOUNDATION"],
  },
  {
    key: "structure-small-study-v2",
    title: "Bilgilerin görevini ayır",
    type: "SMALL_STUDY",
    exerciseKey: "p1a-v2-structure-study",
    learningOutcomeKeys: ["P1A_V2_STRUCTURE_FOUNDATION"],
    prerequisiteStepKeys: ["structure-teaching-v2"],
  },
  {
    key: "evidence-practice-v2",
    title: "Ana düşünceyi kanıtla bağla",
    type: "PRACTICE",
    exerciseKey: "p1a-v2-evidence-practice",
    learningOutcomeKeys: ["P1A_V2_STRUCTURE_FOUNDATION"],
    prerequisiteStepKeys: ["structure-small-study-v2"],
  },
  {
    key: "structure-reinforcement-v2",
    title: "Metin omurgasını geri çağır",
    type: "REINFORCEMENT",
    exerciseKey: "p1a-v2-structure-reinforcement",
    learningOutcomeKeys: ["P1A_V2_STRUCTURE_FOUNDATION"],
    prerequisiteStepKeys: ["evidence-practice-v2"],
  },
  {
    key: "relations-teaching-v2",
    title: "Bilgiler arasındaki ilişkiyi gör",
    type: "TEACHING",
    contentKey: relationsTeaching.key,
    learningOutcomeKeys: ["P1A_V2_MEANING_RELATIONS"],
    prerequisiteStepKeys: ["structure-reinforcement-v2"],
  },
  {
    key: "relations-small-study-v2",
    title: "İlişkiyi ve kanıtını bul",
    type: "SMALL_STUDY",
    exerciseKey: "p1a-v2-relations-study",
    learningOutcomeKeys: ["P1A_V2_MEANING_RELATIONS"],
    prerequisiteStepKeys: ["relations-teaching-v2"],
  },
  {
    key: "transfer-practice-v2",
    title: "Yeni metinde yapıyı çöz",
    type: "PRACTICE",
    exerciseKey: "p1a-v2-transfer-practice",
    learningOutcomeKeys: ["P1A_V2_TRANSFER"],
    prerequisiteStepKeys: ["relations-small-study-v2"],
  },
  {
    key: "relations-reinforcement-v2",
    title: "Metin haritasını tamamla",
    type: "REINFORCEMENT",
    exerciseKey: "p1a-v2-relations-reinforcement",
    learningOutcomeKeys: ["P1A_V2_MEANING_RELATIONS", "P1A_V2_TRANSFER"],
    prerequisiteStepKeys: ["transfer-practice-v2"],
  },
  {
    key: "assessment-v2",
    title: "Anlam ve metin yapısı kontrolü",
    type: "ASSESSMENT",
    assessmentKey: "p1a-v2-assessment",
    learningOutcomeKeys: [
      "P1A_V2_STRUCTURE_FOUNDATION",
      "P1A_V2_MEANING_RELATIONS",
      "P1A_V2_TRANSFER",
    ],
    prerequisiteStepKeys: ["relations-reinforcement-v2"],
    completionRule: { minimumScore: EDUCATION_V2_P1_A_CYCLE_V2_TECHNICAL_COMPLETION_SCORE },
  },
];

const program: P1AProgram = {
  programId: EDUCATION_V2_P1_A_CYCLE_V2_ID,
  ageBand: EDUCATION_V2_P1_A_CYCLE_V2_AGE_BAND,
  content: [
    structureTeaching,
    relationsTeaching,
    structureStudy,
    evidencePractice,
    structureReinforcement,
    relationsStudy,
    transferPractice,
    relationsReinforcement,
    assessmentContent,
  ],
  exercises,
  assessments: [
    {
      key: "p1a-v2-assessment",
      title: "P1-A Cycle 2 · Anlam ve metin yapısı kontrolü",
      templateExerciseKey: "p1a-v2-assessment",
      questionKeys: exercises.at(-1)!.questions.map((item) => item.key),
      config: {
        questionCount: 4,
        minimumScorableCount: 4,
        minimumAnsweredCount: 4,
        completionMinimumScore: EDUCATION_V2_P1_A_CYCLE_V2_TECHNICAL_COMPLETION_SCORE,
      },
    },
  ],
  path: {
    code: EDUCATION_V2_P1_A_CYCLE_V2_PATH_CODE,
    title: "P1-A Cycle 2 · Anlam ve Metin Yapısı",
    area: "READING_COMPREHENSION",
    units: [
      {
        key: "structure-foundation-v2",
        code: "P1_A_V2_STRUCTURE_FOUNDATION",
        title: "Metin omurgası",
        position: 1,
        steps: steps.slice(0, 4),
      },
      {
        key: "meaning-relations-v2",
        code: "P1_A_V2_MEANING_RELATIONS",
        title: "Anlam ilişkileri ve aktarım",
        position: 2,
        steps: steps.slice(4),
      },
    ],
  },
};

export const EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM = program;

export function validateP1ACycleV2Program(candidate: P1AProgram = program): string[] {
  const errors: string[] = [];
  const contentKeys = new Set(candidate.content.map((item) => item.key));
  const contentByKey = new Map(candidate.content.map((item) => [item.key, item]));
  const assessmentByKey = new Map(candidate.assessments.map((item) => [item.key, item]));
  const exerciseByKey = new Map(candidate.exercises.map((item) => [item.key, item]));
  const pathSteps = candidate.path.units.flatMap((unit) => unit.steps);
  const usedContent = new Map<string, number>();
  const usedExercises = new Map<string, number>();
  const outcomeKeys = new Set<string>(CYCLE_V2_LEARNING_OUTCOMES.map((outcome) => outcome.key));
  const outcomeByKey = new Map<string, (typeof CYCLE_V2_LEARNING_OUTCOMES)[number]>(
    CYCLE_V2_LEARNING_OUTCOMES.map((outcome) => [outcome.key, outcome]),
  );
  const mappedOutcomeKeys = new Set<string>();
  const instructionalOutcomeKeys = new Set<string>();
  const instructionalStepTypes = new Set(["TEACHING", "SMALL_STUDY", "PRACTICE", "REINFORCEMENT"]);

  if (candidate.programId !== EDUCATION_V2_P1_A_CYCLE_V2_ID)
    errors.push("Cycle v2 program ID uyuşmuyor.");
  if (candidate.path.code !== EDUCATION_V2_P1_A_CYCLE_V2_PATH_CODE)
    errors.push("Cycle v2 path kodu uyuşmuyor.");
  if (candidate.path.units.length !== 2) errors.push("Cycle v2 iki unit içermeli.");
  if (pathSteps.length === 0) errors.push("Cycle v2 en az bir öğrenme adımı içermeli.");

  for (const step of pathSteps) {
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
    if (step.learningOutcomeKeys.length === 0) {
      errors.push(`Öğrenme kazanımı bağlantısı eksik: ${step.key}`);
    }
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
    for (const prerequisite of step.prerequisiteStepKeys ?? []) {
      if (!pathSteps.some((candidateStep) => candidateStep.key === prerequisite)) {
        errors.push(`Bilinmeyen cycle v2 prerequisite: ${step.key} -> ${prerequisite}`);
      }
    }
  }

  const assessmentSteps = pathSteps.filter((step) => step.type === "ASSESSMENT");
  for (const outcome of CYCLE_V2_LEARNING_OUTCOMES) {
    if (!mappedOutcomeKeys.has(outcome.key)) {
      errors.push(`Öğrenme kazanımı hiçbir adıma bağlanmamış: ${outcome.key}`);
    }
    if (!instructionalOutcomeKeys.has(outcome.key)) {
      errors.push(`Öğrenme kazanımı öğretim/uygulama adımı taşımıyor: ${outcome.key}`);
    }
    if (!assessmentSteps.some((step) => step.learningOutcomeKeys.includes(outcome.key))) {
      errors.push(`Öğrenme kazanımı değerlendirmede ölçülmüyor: ${outcome.key}`);
    }
  }

  for (const exercise of candidate.exercises) {
    if (!contentKeys.has(exercise.contentKey))
      errors.push(`Exercise content eksik: ${exercise.key}`);
    usedContent.set(exercise.contentKey, (usedContent.get(exercise.contentKey) ?? 0) + 1);
    if (exercise.questions.length < 3)
      errors.push(`Exercise soru sayısı yetersiz: ${exercise.key}`);
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
  for (const contentItem of candidate.content) {
    if ((usedContent.get(contentItem.key) ?? 0) !== 1)
      errors.push(`Content kullanım sayısı geçersiz: ${contentItem.key}`);
  }
  return errors;
}

function questionVersionIds(exercise: ProgramExercise): string[] {
  return exercise.questions.map((item) => p1ACycleV2QuestionVersionId(exercise.key, item.key));
}

function buildCycleV2Manifest(): LearningCycleManifest {
  const contentVersions = program.content.map((item) => ({
    key: item.key,
    versionId: p1ACycleV2ContentVersionId(item.key),
  }));
  const exerciseVersions = program.exercises.map((exercise) => ({
    key: exercise.key,
    versionId: p1ACycleV2TemplateVersionId(exercise.key),
    questionVersionIds: questionVersionIds(exercise),
  }));
  const assessmentVersions = program.assessments.map((assessment) => ({
    key: assessment.key,
    versionId: p1ACycleV2AssessmentId(assessment.key),
    questionVersionIds: assessment.questionKeys.map((questionKey) =>
      p1ACycleV2QuestionVersionId(assessment.templateExerciseKey, questionKey),
    ),
  }));
  const allQuestionVersionIds = [
    ...new Set(exerciseVersions.flatMap((item) => item.questionVersionIds ?? [])),
  ];
  const pathSteps = program.path.units.flatMap((unit) => unit.steps);

  return {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: EDUCATION_V2_P1_A_CYCLE_V2_PATH_CODE,
    cycleVersion: EDUCATION_V2_P1_A_CYCLE_V2_VERSION,
    sequence: EDUCATION_V2_P1_A_CYCLE_V2_SEQUENCE,
    routeFamily: "A",
    targetSkillCodes: ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
    learningOutcomes: CYCLE_V2_LEARNING_OUTCOMES.map((outcome) => ({
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
            versionId: p1ACycleV2TemplateVersionId(exercise.key),
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
            : step.type === "PRACTICE" && step.key === "transfer-practice-v2"
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
                versionId: p1ACycleV2ContentVersionId(step.contentKey),
              },
            }
          : {}),
        ...(exerciseReference ? { exercise: exerciseReference } : {}),
        ...(assessment
          ? {
              assessment: {
                key: assessment.key,
                versionId: p1ACycleV2AssessmentId(assessment.key),
                questionVersionIds: assessment.questionKeys.map((questionKey) =>
                  p1ACycleV2QuestionVersionId(assessment.templateExerciseKey, questionKey),
                ),
              },
            }
          : {}),
      };
    }),
    completion: {
      requiredStepKeys: pathSteps.map((step) => step.key),
      checkpointStepKeys: ["assessment-v2"],
      requiresFinalMeasurement: false,
      nextCycle: "REVIEW_REQUIRED",
    },
  };
}

export function buildEducationV2P1ACycleV2LearningCycleManifest(): LearningCycleManifest {
  return buildCycleV2Manifest();
}

export function validateEducationV2P1ACycleV2Manifest(): readonly LearningCycleValidationError[] {
  return validateLearningCycleManifest(buildCycleV2Manifest()).errors;
}

export const EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST = buildCycleV2Manifest();
