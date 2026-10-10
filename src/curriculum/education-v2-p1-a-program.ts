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
 * Education V2 P1-A authoring manifest.
 *
 * P1-A is deliberately a separate curriculum package. It reuses the existing
 * reading-comprehension skill catalog and runtime contracts, but its lessons,
 * passages, questions and path records are independently versioned. The
 * companion provisioning script is the only code allowed to translate this
 * manifest into published catalog rows.
 */

export const EDUCATION_V2_P1_A_PROGRAM_ID = "OKU-EDUCATION-V2-P1-A-MEANING-STRUCTURE";
export const EDUCATION_V2_P1_A_AGE_BAND = "13–17";
export const EDUCATION_V2_P1_A_PATH_CODE_PREFIX = "EDUCATION_V2_P1_A_MEANING_STRUCTURE_";
export const EDUCATION_V2_P1_A_LEVEL_CODE = "G8_12";
export const EDUCATION_V2_P1_A_PATH_VERSION = 1;
export const EDUCATION_V2_P1_A_ASSESSMENT_MINIMUM_SCORE = 0.75;

export type P1APathStep = {
  key: string;
  title: string;
  type: "TEACHING" | "SMALL_STUDY" | "PRACTICE" | "REINFORCEMENT" | "ASSESSMENT";
  contentKey?: string;
  exerciseKey?: string;
  assessmentKey?: string;
  prerequisiteStepKeys?: string[];
  completionRule?: { minimumScore?: number };
};

export type P1APathUnit = {
  key: string;
  code: string;
  title: string;
  position: number;
  steps: P1APathStep[];
};

export type P1AProgram = {
  programId: string;
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
      completionMinimumScore: number;
    };
  }>;
  path: {
    code: string;
    title: string;
    area: "READING_COMPREHENSION";
    units: P1APathUnit[];
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

export const EDUCATION_V2_P1_A_PROGRAM: P1AProgram = {
  programId: EDUCATION_V2_P1_A_PROGRAM_ID,
  ageBand: EDUCATION_V2_P1_A_AGE_BAND,
  content: [
    {
      key: "p1a-structure-teach",
      title: "Metnin omurgasını gör",
      difficulty: 2,
      skillCode: "RC_MAIN_IDEA",
      body: [
        "Bir metni anlamak, cümleleri tek tek hatırlamaktan önce metnin omurgasını kurmayı gerektirir.",
        "Önce metnin konusunu, ardından yazarın bu konu hakkında söylediği ana düşünceyi ayır. Ana düşünceyi destekleyen ayrıntılar metnin omurgasına bağlanır; tek başına kalan ilginç bir bilgi ana düşünce değildir.",
        "Kendine şu sırayla sor: Metin ne hakkında? Yazar bu konuda ne söylüyor? Bunu hangi ayrıntılar destekliyor? Bu üç soruya verilen cevaplar birbirini açıklıyorsa metin yapısını doğru kuruyorsun.",
      ].join("\n\n"),
      lesson: {
        objective:
          "Kısa bir metinde konu, ana düşünce ve destekleyici ayrıntı arasındaki yapıyı kurmak.",
        explanation:
          "Konu, metnin hakkında olduğu şeydir. Ana düşünce, yazarın bu konu hakkındaki temel mesajıdır. Ayrıntılar ise bu mesajı açıklayan veya kanıtlayan bilgilerdir.",
        workedExample:
          "Bir paragraf okul bahçesindeki yağmur suyu biriktirme düzenini anlatıyorsa konu yağmur suyudur; ana düşünce okulun suyu verimli kullanmak için bu düzenekten yararlandığıdır. Depodaki ölçü tek başına ayrıntıdır.",
        guidedPractice:
          "Bir sonraki alıştırmada önce konuyu tek kelimeyle söyle. Sonra bütün paragrafı açıklayan ana düşünceyi, onu destekleyen ayrıntıdan ayır.",
        nextExerciseKey: "p1a-structure-study",
      },
    },
    {
      key: "p1a-relations-teach",
      title: "Bilgiler arasındaki ilişkiyi izle",
      difficulty: 2,
      skillCode: "RC_DETAIL",
      body: [
        "Metin yapısı yalnızca bilgilerin sırasından oluşmaz; cümleler arasında neden-sonuç, karşılaştırma, örnekleme ve açıklama ilişkileri de kurulur.",
        "Bağlantı ifadeleri bu ilişkilere işaret eder. ‘Çünkü’ nedeni, ‘bu nedenle’ sonucu, ‘oysa’ karşılaştırmayı, ‘örneğin’ ise açıklayıcı örneği öne çıkarır.",
        "Bir cümleyi okurken yalnızca anahtar kelimeyi arama. Önce iki bilginin nasıl bağlandığını söyle, sonra sorunun istediği kanıtı bu ilişkiye göre seç.",
      ].join("\n\n"),
      lesson: {
        objective:
          "Bir metindeki cümleleri bağlayan ilişkiyi ve bu ilişkiyi taşıyan kanıtı ayırt etmek.",
        explanation:
          "Aynı konuya ait iki cümle farklı ilişkiler kurabilir. Neden ile sonucu, karşılaştırılan iki durumu ve bir düşünceyi açıklayan örneği birbirine karıştırmamak anlamı korur.",
        workedExample:
          "‘Kütüphane sessizdi; bu nedenle öğrenciler daha uzun süre çalıştı.’ cümlesinde sessizlik neden, uzun çalışma ise sonuçtur.",
        guidedPractice:
          "Alıştırmada önce iki bilgi arasındaki ilişkiyi adlandır. Ardından bu ilişkiyi açıkça destekleyen seçeneği işaretle.",
        nextExerciseKey: "p1a-relations-study",
      },
    },
    {
      key: "p1a-structure-study",
      title: "Konu, ana düşünce ve ayrıntıyı ayır",
      difficulty: 2,
      skillCode: "RC_MAIN_IDEA",
      body: "Kısa paragraflarda metnin konusunu, ana düşüncesini ve onu destekleyen ayrıntıyı aynı yapı içinde ayırt et.",
    },
    {
      key: "p1a-evidence-practice",
      title: "Ana düşünceyi kanıtla eşleştir",
      difficulty: 2.5,
      skillCode: "RC_DETAIL",
      body: "Yeni bir paragrafta ana düşünceyi seç ve seçimini destekleyen iki farklı ayrıntıyı metindeki görevleriyle eşleştir.",
    },
    {
      key: "p1a-structure-reinforcement",
      title: "Metin omurgasını pekiştir",
      difficulty: 2.5,
      skillCode: "RC_MAIN_IDEA",
      body: "Konu, ana düşünce ve ayrıntı kartlarını paragrafın anlamını koruyacak biçimde bir araya getir.",
    },
    {
      key: "p1a-relations-study",
      title: "Neden, sonuç ve karşılaştırmayı eşleştir",
      difficulty: 2.5,
      skillCode: "RC_DETAIL",
      body: "Bağlantı ifadelerini izleyerek cümleler arasındaki ilişkiyi doğru adlandır ve metindeki kanıtla eşleştir.",
    },
    {
      key: "p1a-structure-practice",
      title: "Yeni metinde yapıyı çöz",
      difficulty: 3,
      skillCode: "RC_INFERENCE",
      body: "Yeni bir metinde bilgilerin nasıl bağlandığını çöz, metnin ana düşüncesini ve bu düşünceye götüren kanıt zincirini belirle.",
    },
    {
      key: "p1a-relations-reinforcement",
      title: "Metin haritasını tamamla",
      difficulty: 3,
      skillCode: "RC_INFERENCE",
      body: "Bir paragraftaki ana düşünceyi, kanıtları ve aralarındaki ilişkiyi tek bir metin haritasında birleştir.",
    },
    {
      key: "p1a-assessment",
      title: "Anlam ve metin yapısı kontrolü",
      difficulty: 3,
      skillCode: "RC_MAIN_IDEA",
      body: "Yeni metinlerde konu, ana düşünce, kanıt ve cümleler arası ilişkiyi birlikte kullanarak öğrenme döngünü kontrol et.",
    },
  ],
  exercises: [
    {
      key: "p1a-structure-study",
      title: "Metnin temel parçalarını ayır",
      templateType: "COMPREHENSION",
      contentKey: "p1a-structure-study",
      skillCode: "RC_MAIN_IDEA",
      contract: contract(
        "Metnin temel parçalarını ayır",
        "MAIN_IDEA",
        "RC_MAIN_IDEA",
        "DEVELOPING",
        "Konu, ana düşünce ve destekleyici ayrıntıyı kısa metnin bütünüyle eşleştir.",
      ),
      questions: [
        question(
          "p1a-structure-study-1",
          "‘Mahalledeki boş alan, öğrencilerin önerileriyle küçük bir okuma bahçesine dönüştürüldü. Bahçede kitap rafları ve gölgelikli oturma yerleri bulunuyor.’ Bu parçanın ana düşüncesi hangisidir?",
          [
            ["a", "Bahçedeki rafların rengi"],
            ["b", "Öğrenci önerileriyle boş alanın okuma bahçesine dönüştürülmesi"],
            ["c", "Mahallede boş alanların bulunması"],
            ["d", "Gölgelikli oturma yerlerinin sayısı"],
          ],
          "b",
          "Parçanın bütünü, öğrencilerin önerileriyle alanın okuma amacıyla düzenlenmesini anlatıyor.",
          "Tek bir ayrıntıyı değil, iki cümlenin ortak mesajını seç.",
          2,
        ),
        question(
          "p1a-structure-study-2",
          "Aynı parçada ‘kitap rafları ve gölgelikli oturma yerleri’ bilgisi hangi görevi üstlenir?",
          [
            ["a", "Ana düşünceyi destekleyen ayrıntı"],
            ["b", "Metnin konusu olmayan bilgi"],
            ["c", "Ana düşünceyle çelişen sonuç"],
            ["d", "Parçanın yazarı"],
          ],
          "a",
          "Bu bilgi, okuma bahçesinin nasıl düzenlendiğini açıklayarak ana düşünceyi destekliyor.",
          "Bu bilgi bahçenin hangi yönünü açıklıyor?",
          2,
        ),
        question(
          "p1a-structure-study-3",
          "Bir metnin ana düşüncesini seçerken en güvenilir kontrol hangisidir?",
          [
            ["a", "En uzun cümleyi seçmek"],
            ["b", "Yalnızca başlığa bakmak"],
            ["c", "İfadenin metnin birden fazla ayrıntısını açıklayıp açıklamadığına bakmak"],
            ["d", "Kendi deneyimini metnin yerine koymak"],
          ],
          "c",
          "Ana düşünce, metnin bütününü ve birden fazla ayrıntıyı açıklayabilmelidir.",
          "Ana düşünce metnin yalnızca bir parçasına mı, tamamına mı uyuyor?",
          2,
        ),
      ],
    },
    {
      key: "p1a-evidence-practice",
      title: "Ana düşünceyi metin kanıtıyla doğrula",
      templateType: "COMPREHENSION",
      contentKey: "p1a-evidence-practice",
      skillCode: "RC_DETAIL",
      contract: contract(
        "Ana düşünceyi metin kanıtıyla doğrula",
        "DETAIL_EVIDENCE",
        "RC_DETAIL",
        "DEVELOPING",
        "Yeni paragrafta ana düşünceyi destekleyen açık kanıtları seç.",
      ),
      questions: [
        question(
          "p1a-evidence-practice-1",
          "‘Okulun koridorlarına yönlendirme levhaları eklendi. Öğrenciler sınıfları daha kısa sürede buldu ve teneffüslerdeki bekleme azaldı.’ Ana düşünceyi en iyi destekleyen kanıt hangisidir?",
          [
            ["a", "Levhaların koridorlara eklenmesi"],
            ["b", "Öğrencilerin sınıfları daha kısa sürede bulması ve beklemenin azalması"],
            ["c", "Teneffüslerin okulda yapılması"],
            ["d", "Koridorların sınıflara yakın olması"],
          ],
          "b",
          "İkinci cümle, levhaların işe yaradığını gösteren iki sonucu birlikte veriyor.",
          "Düzenlemenin sonucunu gösteren bilgiyi ara.",
          2.5,
        ),
        question(
          "p1a-evidence-practice-2",
          "‘Yerel müze, eski fotoğrafları öğrencilerin çizimleriyle aynı salonda sergiledi.’ Bu cümlede serginin özelliğini açıklayan ayrıntı hangisidir?",
          [
            ["a", "Müzenin yerel olması"],
            ["b", "Fotoğraflar ile öğrenci çizimlerinin aynı salonda bulunması"],
            ["c", "Öğrencilerin okula gitmesi"],
            ["d", "Salonun büyük olması"],
          ],
          "b",
          "Cümlede serginin nasıl düzenlendiğini doğrudan açıklayan bilgi budur.",
          "Serginin düzenlenişini anlatan bölümü seç.",
          2.5,
        ),
        question(
          "p1a-evidence-practice-3",
          "Bir seçeneğin metin kanıtı olduğunu söylemek için ne gerekir?",
          [
            ["a", "Seçeneğin metinde açıkça desteklenmesi"],
            ["b", "Seçeneğin çok ayrıntılı olması"],
            ["c", "Seçeneğin okuyucunun deneyimine uyması"],
            ["d", "Seçeneğin diğerlerinden uzun olması"],
          ],
          "a",
          "Kanıt, metnin söylediği veya zorunlu olarak gösterdiği bilgiye dayanır.",
          "Cevabı metindeki hangi ifadeyle gösterebileceğini düşün.",
          2.5,
        ),
      ],
    },
    {
      key: "p1a-structure-reinforcement",
      title: "Metin omurgasını pekiştir",
      templateType: "MIXED",
      contentKey: "p1a-structure-reinforcement",
      skillCode: "RC_MAIN_IDEA",
      contract: contract(
        "Metin omurgasını pekiştir",
        "MAIN_IDEA",
        "RC_MAIN_IDEA",
        "DEVELOPING",
        "Konu, ana düşünce ve ayrıntıların metin içindeki görevini birlikte değerlendir.",
      ),
      questions: [
        question(
          "p1a-structure-reinforcement-1",
          "Bir paragrafta ana düşünceyi bulduktan sonra hangi kontrol yapılmalıdır?",
          [
            ["a", "Ana düşünceyi destekleyen ayrıntıları göstermek"],
            ["b", "Yalnızca ilk cümleyi tekrar okumak"],
            ["c", "Metnin konusunu değiştirmek"],
            ["d", "Cevabı metin dışından tamamlamak"],
          ],
          "a",
          "Ana düşünce, metindeki destekleyici ayrıntılarla sınanmalıdır.",
          "Ana düşünceyi metnin hangi bilgileri taşıyor?",
          2.5,
        ),
        question(
          "p1a-structure-reinforcement-2",
          "Aşağıdakilerden hangisi yalnızca konuyu söyler, ana düşünceyi tamamlamaz?",
          [
            ["a", "Okul bahçelerinde geri dönüşüm çalışmaları"],
            ["b", "Geri dönüşüm kutuları öğrencilerin atıkları ayırmasını kolaylaştırdı"],
            ["c", "Atıkları ayırmak okulun temiz kalmasına yardım etti"],
            ["d", "Öğrenciler kutuların kullanımını sınıflarında öğrendi"],
          ],
          "a",
          "İlk seçenek yalnızca metnin ne hakkında olabileceğini söyler; yazarın mesajını açıklamaz.",
          "Bu seçenek yazarın ne söylediğini mi, yalnızca ne hakkında yazdığını mı söylüyor?",
          2.5,
        ),
        question(
          "p1a-structure-reinforcement-3",
          "Metnin bütününü açıklayan bir seçenek ile tek ayrıntıyı açıklayan seçenek arasında nasıl karar verilir?",
          [
            ["a", "Bütün cümlelerin ortak yönünü açıklayan seçenek seçilir"],
            ["b", "En şaşırtıcı seçenek seçilir"],
            ["c", "En kısa seçenek seçilir"],
            ["d", "Kişisel görüşe en yakın seçenek seçilir"],
          ],
          "a",
          "Ana düşünce, metnin ortak mesajını açıklamalıdır.",
          "Cevabın birden fazla ayrıntıyı bir arada açıklıyor mu?",
          2.5,
        ),
      ],
    },
    {
      key: "p1a-relations-study",
      title: "Cümleler arasındaki ilişkiyi bul",
      templateType: "COMPREHENSION",
      contentKey: "p1a-relations-study",
      skillCode: "RC_DETAIL",
      contract: contract(
        "Cümleler arasındaki ilişkiyi bul",
        "DETAIL_EVIDENCE",
        "RC_DETAIL",
        "DEVELOPING",
        "Bağlantı ifadelerini kullanarak cümleler arasındaki anlam ilişkisini belirle.",
      ),
      questions: [
        question(
          "p1a-relations-study-1",
          "‘Kampanya boyunca öğrenciler bez çanta kullandı; böylece tek kullanımlık poşetlerin sayısı azaldı.’ Cümledeki ilişki hangisidir?",
          [
            ["a", "Neden-sonuç"],
            ["b", "Karşılaştırma"],
            ["c", "Zıtlık"],
            ["d", "Tanımlama"],
          ],
          "a",
          "Bez çanta kullanımı neden, poşet sayısının azalması sonuçtur.",
          "‘Böylece’ ifadesinden sonra hangi sonuç geliyor?",
          2.5,
        ),
        question(
          "p1a-relations-study-2",
          "‘Birinci taslak kısa ve doğrudandı; oysa ikinci taslak daha fazla örnek içeriyordu.’ Bu cümlede hangi ilişki kurulmuştur?",
          [
            ["a", "Karşılaştırma ve zıtlık"],
            ["b", "Neden-sonuç"],
            ["c", "Sıralama"],
            ["d", "Tanım"],
          ],
          "a",
          "‘Oysa’ ifadesi iki taslağın farklı özelliklerini karşılaştırıyor.",
          "İki taslağın özellikleri aynı mı, farklı mı?",
          2.5,
        ),
        question(
          "p1a-relations-study-3",
          "Bir metindeki ilişkiyi bulurken ilk olarak ne yapılmalıdır?",
          [
            ["a", "Bağlanan iki bilgiyi ayrı ayrı belirlemek"],
            ["b", "Yalnızca bağlaç kelimesini ezberlemek"],
            ["c", "Metnin son cümlesini seçmek"],
            ["d", "Kendi nedenini eklemek"],
          ],
          "a",
          "İlişkiyi anlamak için önce cümlelerin hangi bilgileri bağladığını görmek gerekir.",
          "İlişkinin iki tarafında hangi bilgiler var?",
          2.5,
        ),
      ],
    },
    {
      key: "p1a-structure-practice",
      title: "Yeni metinde yapıyı çöz",
      templateType: "INFERENCE",
      contentKey: "p1a-structure-practice",
      skillCode: "RC_INFERENCE",
      contract: contract(
        "Yeni metinde yapıyı çöz",
        "INFERENCE",
        "RC_INFERENCE",
        "CHALLENGING",
        "Yeni bir metindeki ana düşünceyi, kanıt zincirini ve cümleler arası ilişkiyi birlikte çöz.",
      ),
      questions: [
        question(
          "p1a-structure-practice-1",
          "‘Kasabanın eski su değirmeni onarıldı. Ziyaretçiler artık değirmenin nasıl çalıştığını görebiliyor; ayrıca yöre halkının anlattığı öyküler de panolarda yer alıyor.’ Metnin ana düşüncesi hangisidir?",
          [
            ["a", "Değirmenin yalnızca dış görünüşünün değişmesi"],
            ["b", "Onarılan değirmenin işleyişi ve yerel öykülerle birlikte tanıtılması"],
            ["c", "Panoların kasabada bulunması"],
            ["d", "Ziyaretçilerin değirmeni uzaktan görmesi"],
          ],
          "b",
          "İki cümle birlikte değirmenin hem işleyişi hem de yerel öyküleriyle tanıtıldığını gösteriyor.",
          "Her iki cümlenin ortak mesajını kapsayan seçeneği ara.",
          3,
        ),
        question(
          "p1a-structure-practice-2",
          "Aynı metinde panoların eklenmesi, ziyaretçilere ne sağlar?",
          [
            ["a", "Değirmenin çalışmasını ve yöre öykülerini birlikte anlamalarını"],
            ["b", "Değirmeni onarmalarını"],
            ["c", "Kasabadan ayrılmalarını"],
            ["d", "Suyun miktarını ölçmelerini"],
          ],
          "a",
          "Panolar, teknik işleyiş ile yerel anlatıları ziyaretçilerin birlikte anlamasına yardım ediyor.",
          "Panoların iki cümledeki hangi bilgileri birleştirdiğine bak.",
          3,
        ),
        question(
          "p1a-structure-practice-3",
          "Metnin yapısını çözerken kanıt zinciri neyi gösterir?",
          [
            ["a", "Ayrıntıların ana düşünceyi nasıl desteklediğini"],
            ["b", "Yazarın hayatındaki bütün olayları"],
            ["c", "Okuyucunun kişisel deneyimini"],
            ["d", "Metnin kaç kelimeden oluştuğunu"],
          ],
          "a",
          "Kanıt zinciri ayrıntılar ile ana düşünce arasındaki anlam bağını görünür kılar.",
          "Ayrıntı ana düşünceyi hangi yoldan açıklıyor?",
          3,
        ),
      ],
    },
    {
      key: "p1a-relations-reinforcement",
      title: "Metin haritasını tamamla",
      templateType: "MIXED",
      contentKey: "p1a-relations-reinforcement",
      skillCode: "RC_INFERENCE",
      contract: contract(
        "Metin haritasını tamamla",
        "INFERENCE",
        "RC_INFERENCE",
        "CHALLENGING",
        "Ana düşünceyi, kanıtları ve bilgiler arasındaki ilişkiyi tek bir metin haritasında birleştir.",
      ),
      questions: [
        question(
          "p1a-relations-reinforcement-1",
          "Metin haritasında ana düşünce ile ayrıntılar arasındaki bağ nasıl kontrol edilir?",
          [
            ["a", "Her ayrıntının ana düşünceyi açıklayıp açıklamadığına bakılır"],
            ["b", "Yalnızca ayrıntıların uzunluğu karşılaştırılır"],
            ["c", "Ana düşünce metinden bağımsız yazılır"],
            ["d", "En çok kelime içeren ayrıntı seçilir"],
          ],
          "a",
          "Haritadaki her kanıt ana düşünceyle anlamlı bir bağ kurmalıdır.",
          "Ayrıntı ana düşünceyi gerçekten açıklıyor mu?",
          3,
        ),
        question(
          "p1a-relations-reinforcement-2",
          "Bir kanıt ana düşünceyle bağlantı kurmuyorsa ne yapılmalıdır?",
          [
            ["a", "Kanıtın görevini yeniden okuyup daha uygun bağlantıyı aramak"],
            ["b", "Kanıtı sırf metinde geçiyor diye ana düşünce saymak"],
            ["c", "Metnin konusunu değiştirmek"],
            ["d", "Kişisel bir örnek eklemek"],
          ],
          "a",
          "Kanıtın metindeki görevini yeniden değerlendirmek yapı hatasını düzeltir.",
          "Bu bilgi metnin mesajına nasıl hizmet ediyor?",
          3,
        ),
        question(
          "p1a-relations-reinforcement-3",
          "Güçlü bir metin haritası aşağıdakilerden hangisini birlikte gösterir?",
          [
            ["a", "Ana düşünceyi, kanıtları ve aralarındaki ilişkiyi"],
            ["b", "Yalnızca başlığı ve ilk cümleyi"],
            ["c", "Okuyucunun metin dışı bilgisini"],
            ["d", "Sadece en uzun cümleyi"],
          ],
          "a",
          "Metin haritası, metnin anlam yapısını bu üç öğe arasındaki bağla açıklar.",
          "Haritada yalnızca parçalar değil, parçalar arasındaki bağ da olmalı.",
          3,
        ),
      ],
    },
    {
      key: "p1a-assessment",
      title: "Anlam ve metin yapısı kontrolü",
      templateType: "MIXED",
      contentKey: "p1a-assessment",
      skillCode: "RC_MAIN_IDEA",
      contract: contract(
        "Anlam ve metin yapısı kontrolü",
        "MAIN_IDEA",
        "RC_MAIN_IDEA",
        "CHALLENGING",
        "Yeni metinlerde konu, ana düşünce, kanıt ve ilişki bilgisini birlikte kullan.",
      ),
      questions: [
        question(
          "p1a-assessment-1",
          "‘İlçe, kullanılmayan bir binayı öğrenci çalışma merkezine dönüştürdü. Merkezde sessiz çalışma odaları, danışma masası ve ortak proje alanı bulunuyor.’ Ana düşünce hangisidir?",
          [
            ["a", "Binadaki masaların rengi"],
            [
              "b",
              "Kullanılmayan binanın öğrencilerin farklı çalışma ihtiyaçlarına göre düzenlenmesi",
            ],
            ["c", "İlçede binaların bulunması"],
            ["d", "Ortak proje alanının büyüklüğü"],
          ],
          "b",
          "Paragraf, binanın öğrenci çalışma ihtiyaçlarına göre dönüştürülmesini bütünüyle anlatıyor.",
          "İki cümleyi birlikte açıklayan seçeneği ara.",
          3,
        ),
        question(
          "p1a-assessment-2",
          "‘Merkezde danışma masası bulunuyor.’ bilgisi paragrafta hangi görevdedir?",
          [
            ["a", "Dönüşümün nasıl kullanıma sunulduğunu açıklayan ayrıntı"],
            ["b", "Paragrafın ana düşüncesine karşıt sonuç"],
            ["c", "Metnin dışında kalan bilgi"],
            ["d", "Yalnızca başlık"],
          ],
          "a",
          "Danışma masası, çalışma merkezinin öğrencilere hangi olanakları sunduğunu açıklıyor.",
          "Bu bilgi merkezin hangi özelliğini gösteriyor?",
          3,
        ),
        question(
          "p1a-assessment-3",
          "‘Yağış nedeniyle açık hava etkinliği ertelendi.’ cümlesindeki ilişki hangisidir?",
          [
            ["a", "Neden-sonuç"],
            ["b", "Karşılaştırma"],
            ["c", "Örnekleme"],
            ["d", "Tanımlama"],
          ],
          "a",
          "Yağış neden, etkinliğin ertelenmesi sonuçtur.",
          "‘Nedeniyle’ sözcüğünün iki tarafındaki bilgileri ayır.",
          3,
        ),
        question(
          "p1a-assessment-4",
          "Metin dışı güçlü bir tahmin yerine kanıtlı çıkarımı seçmek için ne yapılmalıdır?",
          [
            ["a", "Sonucu metindeki birden fazla bilgiyle ilişkilendirmek"],
            ["b", "Kendi deneyimini tek kanıt saymak"],
            ["c", "En iddialı seçeneği işaretlemek"],
            ["d", "Yalnızca ilk kelimeye bakmak"],
          ],
          "a",
          "Kanıtlı çıkarım metindeki bilgilerin birlikte zorunlu kıldığı sınırlı sonuçtur.",
          "Seçimin metindeki hangi bilgilerden çıktığını göster.",
          3,
        ),
      ],
    },
  ],
  assessments: [
    {
      key: "p1a-assessment",
      title: "P1-A · Anlam ve metin yapısı kontrolü",
      templateExerciseKey: "p1a-assessment",
      questionKeys: [
        "p1a-assessment-1",
        "p1a-assessment-2",
        "p1a-assessment-3",
        "p1a-assessment-4",
      ],
      config: {
        questionCount: 4,
        minimumScorableCount: 4,
        minimumAnsweredCount: 4,
        completionMinimumScore: EDUCATION_V2_P1_A_ASSESSMENT_MINIMUM_SCORE,
      },
    },
  ],
  path: {
    code: `${EDUCATION_V2_P1_A_PATH_CODE_PREFIX}${EDUCATION_V2_P1_A_LEVEL_CODE}`,
    title: "P1-A · Anlam ve Metin Yapısı",
    area: "READING_COMPREHENSION",
    units: [
      {
        key: "structure-foundation",
        code: "P1_A_STRUCTURE_FOUNDATION",
        title: "Metin omurgası",
        position: 1,
        steps: [
          {
            key: "structure-teaching",
            title: "Metnin omurgasını gör",
            type: "TEACHING",
            contentKey: "p1a-structure-teach",
          },
          {
            key: "structure-small-study",
            title: "Metnin temel parçalarını ayır",
            type: "SMALL_STUDY",
            exerciseKey: "p1a-structure-study",
            prerequisiteStepKeys: ["structure-teaching"],
          },
          {
            key: "evidence-practice",
            title: "Ana düşünceyi kanıtla eşleştir",
            type: "PRACTICE",
            exerciseKey: "p1a-evidence-practice",
            prerequisiteStepKeys: ["structure-small-study"],
          },
          {
            key: "structure-reinforcement",
            title: "Metin omurgasını pekiştir",
            type: "REINFORCEMENT",
            exerciseKey: "p1a-structure-reinforcement",
            prerequisiteStepKeys: ["evidence-practice"],
          },
        ],
      },
      {
        key: "meaning-relations",
        code: "P1_A_MEANING_RELATIONS",
        title: "Anlam ilişkileri",
        position: 2,
        steps: [
          {
            key: "relations-teaching",
            title: "Bilgiler arasındaki ilişkiyi izle",
            type: "TEACHING",
            contentKey: "p1a-relations-teach",
            prerequisiteStepKeys: ["structure-reinforcement"],
          },
          {
            key: "relations-small-study",
            title: "Neden, sonuç ve karşılaştırmayı eşleştir",
            type: "SMALL_STUDY",
            exerciseKey: "p1a-relations-study",
            prerequisiteStepKeys: ["relations-teaching"],
          },
          {
            key: "structure-practice",
            title: "Yeni metinde yapıyı çöz",
            type: "PRACTICE",
            exerciseKey: "p1a-structure-practice",
            prerequisiteStepKeys: ["relations-small-study"],
          },
          {
            key: "relations-reinforcement",
            title: "Metin haritasını tamamla",
            type: "REINFORCEMENT",
            exerciseKey: "p1a-relations-reinforcement",
            prerequisiteStepKeys: ["structure-practice"],
          },
          {
            key: "assessment",
            title: "Anlam ve metin yapısı kontrolü",
            type: "ASSESSMENT",
            assessmentKey: "p1a-assessment",
            prerequisiteStepKeys: ["relations-reinforcement"],
            completionRule: { minimumScore: EDUCATION_V2_P1_A_ASSESSMENT_MINIMUM_SCORE },
          },
        ],
      },
    ],
  },
};

export function p1AId(
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
  return `edu-v2-p1-a-${kind}-${key}`;
}

export function p1AContentVersionId(contentKey: string): string {
  return p1AId("contentVersion", `${contentKey}-v1`);
}

export function p1ATemplateId(exerciseKey: string): string {
  return p1AId("template", exerciseKey);
}

export function p1ATemplateVersionId(exerciseKey: string): string {
  return p1AId("templateVersion", `${exerciseKey}-v1`);
}

export function p1AQuestionId(exerciseKey: string, questionKey: string): string {
  return p1AId("question", `${exerciseKey}-${questionKey}`);
}

export function p1AQuestionVersionId(exerciseKey: string, questionKey: string): string {
  return p1AId("questionVersion", `${exerciseKey}-${questionKey}-v1`);
}

export function p1AAssessmentId(assessmentKey: string): string {
  return p1AId("assessment", assessmentKey);
}

export function p1AUnitId(unitCode: string): string {
  return p1AId("unit", unitCode);
}

export function p1AStepId(stepKey: string): string {
  return p1AId("step", stepKey);
}

export function validateP1AProgram(program: P1AProgram = EDUCATION_V2_P1_A_PROGRAM): string[] {
  const errors: string[] = [];
  const contentKeys = new Set(program.content.map((content) => content.key));
  const exerciseByKey = new Map(program.exercises.map((exercise) => [exercise.key, exercise]));
  const assessmentByKey = new Map(
    program.assessments.map((assessment) => [assessment.key, assessment]),
  );
  const stepKeys = new Set<string>();
  const referencedPrerequisites = new Set<string>();
  const pathSteps = program.path.units.flatMap((unit) => unit.steps);
  const contentUsage = new Map<string, number>();
  const exerciseUsage = new Map<string, number>();

  const recordUsage = (usage: Map<string, number>, key: string | undefined) => {
    if (key) usage.set(key, (usage.get(key) ?? 0) + 1);
  };

  if (
    program.path.code !== `${EDUCATION_V2_P1_A_PATH_CODE_PREFIX}${EDUCATION_V2_P1_A_LEVEL_CODE}`
  ) {
    errors.push("P1-A path kodu canonical değil");
  }
  if (program.path.units.length !== 2) errors.push("P1-A iki pedagojik unit içermeli");
  if (pathSteps.length !== 9) errors.push("P1-A dokuz adımlı akış içermeli");
  for (const [index, unit] of program.path.units.entries()) {
    if (unit.position !== index + 1) errors.push(`Unit sırası geçersiz: ${unit.code}`);
    if (unit.steps.length === 0) errors.push(`Boş unit: ${unit.code}`);
    for (const step of unit.steps) {
      if (stepKeys.has(step.key)) errors.push(`Tekrarlı step: ${step.key}`);
      stepKeys.add(step.key);
      if (step.type === "TEACHING" && !step.contentKey)
        errors.push(`Teach içeriği eksik: ${step.key}`);
      if (step.type !== "TEACHING" && step.type !== "ASSESSMENT" && !step.exerciseKey) {
        errors.push(`Exercise bağlantısı eksik: ${step.key}`);
      }
      if (step.type === "ASSESSMENT" && !step.assessmentKey)
        errors.push(`Assessment bağlantısı eksik: ${step.key}`);
      if (step.type === "TEACHING" && (step.exerciseKey || step.assessmentKey))
        errors.push(`Teach adımı exercise/assessment taşıyamaz: ${step.key}`);
      if (step.type === "ASSESSMENT" && (step.contentKey || step.exerciseKey))
        errors.push(`Assessment adımı doğrudan content/exercise taşıyamaz: ${step.key}`);
      if (step.type !== "TEACHING" && step.type !== "ASSESSMENT" && step.contentKey)
        errors.push(`Exercise adımı doğrudan content taşıyamaz: ${step.key}`);
      recordUsage(contentUsage, step.contentKey);
      recordUsage(exerciseUsage, step.exerciseKey);
      recordUsage(
        exerciseUsage,
        step.assessmentKey
          ? assessmentByKey.get(step.assessmentKey)?.templateExerciseKey
          : undefined,
      );
      for (const prerequisite of step.prerequisiteStepKeys ?? []) {
        referencedPrerequisites.add(prerequisite);
        if (!pathSteps.some((candidate) => candidate.key === prerequisite)) {
          errors.push(`Bilinmeyen prerequisite: ${step.key} -> ${prerequisite}`);
        }
      }
      const globalStepIndex = pathSteps.indexOf(step);
      const expectedPrevious = pathSteps[globalStepIndex - 1]?.key;
      const prerequisites = step.prerequisiteStepKeys ?? [];
      if (globalStepIndex === 0 && prerequisites.length > 0) {
        errors.push(`İlk unit adımı prerequisite taşıyamaz: ${step.key}`);
      }
      if (
        globalStepIndex > 0 &&
        (prerequisites.length !== 1 || prerequisites[0] !== expectedPrevious)
      ) {
        errors.push(`P1-A linear prerequisite zinciri geçersiz: ${step.key}`);
      }
    }
  }
  for (const step of pathSteps) {
    if (step.contentKey && !contentKeys.has(step.contentKey))
      errors.push(`Bilinmeyen content: ${step.contentKey}`);
    if (step.exerciseKey && !exerciseByKey.has(step.exerciseKey))
      errors.push(`Bilinmeyen exercise: ${step.exerciseKey}`);
    if (step.assessmentKey && !assessmentByKey.has(step.assessmentKey))
      errors.push(`Bilinmeyen assessment: ${step.assessmentKey}`);
  }
  for (const exercise of program.exercises) {
    if (!contentKeys.has(exercise.contentKey))
      errors.push(`Exercise content eksik: ${exercise.key}`);
    if (exercise.questions.length < 3)
      errors.push(`Exercise soru sayısı yetersiz: ${exercise.key}`);
    if (exercise.contract.competency !== exercise.skillCode)
      errors.push(`Exercise skill eşleşmiyor: ${exercise.key}`);
    const questionKeys = exercise.questions.map((question) => question.key);
    if (new Set(questionKeys).size !== questionKeys.length)
      errors.push(`Exercise soru anahtarı tekrarlı: ${exercise.key}`);
    recordUsage(contentUsage, exercise.contentKey);
  }
  for (const assessment of program.assessments) {
    const exercise = exerciseByKey.get(assessment.templateExerciseKey);
    if (!exercise) errors.push(`Assessment template eksik: ${assessment.key}`);
    if (assessment.questionKeys.length !== assessment.config.questionCount)
      errors.push(`Assessment soru sayısı uyuşmuyor: ${assessment.key}`);
    if (exercise) {
      const exerciseQuestionKeys = exercise.questions.map((question) => question.key);
      if (
        assessment.questionKeys.length !== exerciseQuestionKeys.length ||
        assessment.questionKeys.some((key, index) => key !== exerciseQuestionKeys[index])
      ) {
        errors.push(`Assessment soru/template eşleşmesi uyuşmuyor: ${assessment.key}`);
      }
    }
    if (assessment.config.minimumAnsweredCount > assessment.config.questionCount)
      errors.push(`Assessment answered sınırı geçersiz: ${assessment.key}`);
    if (
      assessment.config.minimumScorableCount > assessment.config.questionCount ||
      assessment.config.completionMinimumScore < 0 ||
      assessment.config.completionMinimumScore > 1
    ) {
      errors.push(`Assessment completion sınırı geçersiz: ${assessment.key}`);
    }
  }
  for (const content of program.content) {
    if ((contentUsage.get(content.key) ?? 0) !== 1)
      errors.push(`Content kullanım sayısı geçersiz: ${content.key}`);
  }
  for (const exercise of program.exercises) {
    if ((exerciseUsage.get(exercise.key) ?? 0) !== 1)
      errors.push(`Exercise kullanım sayısı geçersiz: ${exercise.key}`);
  }
  if (referencedPrerequisites.size === 0) errors.push("P1-A prerequisite zinciri yok");
  return errors;
}

const validationErrors = validateP1AProgram();
if (validationErrors.length > 0) {
  throw new Error(`Education V2 P1-A kataloğu geçersiz: ${validationErrors.join("; ")}`);
}
