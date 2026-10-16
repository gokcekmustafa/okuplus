import {
  LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "./learning-cycle-manifest.js";
import type { LearningRouteCycle } from "./learning-route-catalog.js";

export const EDUCATION_V2_P1_800_TARGET_PER_ROUTE = 200;

export const EDUCATION_V2_P1_800_CATEGORY_TARGETS = {
  FAST_READING: 60,
  READING_COMPREHENSION: 80,
  COMMON_STRATEGIES: 20,
  INTEGRATED_PRACTICE: 25,
  MULTI_SKILL_ASSESSMENT: 15,
} as const;

export type EducationV2P1ExpansionCategory = keyof typeof EDUCATION_V2_P1_800_CATEGORY_TARGETS;

type DraftQuestion = {
  key: string;
  prompt: string;
  correct: string;
  distractors: [string, string, string];
  explanation: string;
  hint: string;
};

type DraftStation = {
  key: string;
  title: string;
  category: EducationV2P1ExpansionCategory;
  skillCodes: string[];
  outcome: string;
  textTitle: string;
  text: string;
  sourceReference: string;
  questions: [DraftQuestion, DraftQuestion, DraftQuestion];
};

type RouteDraft = {
  routeFamily: "A" | "B" | "C" | "D";
  priorSequence: number;
  priorPathCode: string;
  nextSequence: number;
  positionOffset: number;
  stations: [DraftStation, DraftStation, DraftStation, DraftStation, DraftStation];
};

const q = (
  key: string,
  prompt: string,
  correct: string,
  distractors: [string, string, string],
  explanation: string,
  hint: string,
): DraftQuestion => ({ key, prompt, correct, distractors, explanation, hint });

const station = (
  key: string,
  title: string,
  category: EducationV2P1ExpansionCategory,
  skillCodes: string[],
  outcome: string,
  textTitle: string,
  text: string,
  sourceReference: string,
  questions: [DraftQuestion, DraftQuestion, DraftQuestion],
): DraftStation => ({
  key,
  title,
  category,
  skillCodes,
  outcome,
  textTitle,
  text,
  sourceReference,
  questions,
});

const routeDrafts: RouteDraft[] = [
  {
    routeFamily: "A",
    priorSequence: 3,
    priorPathCode: "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_3_G8_12",
    nextSequence: 4,
    positionOffset: 0,
    stations: [
      station(
        "a4-fast-reading",
        "Duyuruda gereken bilgiyi hızlı bul",
        "FAST_READING",
        ["FAST_ATTENTION", "RC_DETAIL"],
        "Duyurudaki saat ve koşul bilgisini hızla bulur, seçimini metin kanıtıyla doğrular.",
        "Atölye duyurusu",
        "Kent kütüphanesindeki harita atölyesi cumartesi 10.30'da başlayacak. Katılımcıların kayıt masasından numara alması gerekiyor. Etkinlik ücretsiz; ancak çalışma kâğıtları sınırlı olduğu için kayıt 24 kişiyle kapanacak.",
        "Özgün 800 istasyon genişleme içeriği; hızlı bilgi bulma kazanımı için hazırlandı.",
        [
          q(
            "a4-fast-1",
            "Atölye hangi gün ve saatte başlayacak?",
            "Cumartesi 10.30'da",
            ["Cuma 10.30'da", "Cumartesi 11.30'da", "Pazar 10.00'da"],
            "Duyuruda başlangıç zamanı cumartesi 10.30 olarak veriliyor.",
            "İlk cümledeki gün ve saati birlikte bul.",
          ),
          q(
            "a4-fast-2",
            "Katılımcıların kayıt masasından ne alması gerekiyor?",
            "Bir numara",
            ["Çalışma kitabı", "Harita çantası", "Ücret makbuzu"],
            "Kayıt masasından numara alınması isteniyor.",
            "İkinci cümlede kayıt masasından alınan şeyi ara.",
          ),
          q(
            "a4-fast-3",
            "Kayıt en fazla kaç kişiyle sınırlı?",
            "24 kişiyle",
            ["20 kişiyle", "28 kişiyle", "40 kişiyle"],
            "Duyuru kayıt sayısının 24 kişide kapanacağını söylüyor.",
            "Son cümledeki sayı sınırını bul.",
          ),
        ],
      ),
      station(
        "a4-comprehension",
        "Bir ayrıntının ana düşünceye katkısını çöz",
        "READING_COMPREHENSION",
        ["RC_MAIN_IDEA", "RC_DETAIL"],
        "Bir metindeki ayrıntının ana düşünceyi nasıl desteklediğini açıklar.",
        "Okulun yağmur bahçesi",
        "Okulun arka bahçesinde yağmur suyu birikince öğrenciler küçük bir yağmur bahçesi kurdu. Suyu seven bitkiler çukur alana yerleştirildi. Yağmurdan sonra su daha kısa sürede çekildi; öğrenciler de gözlem çizelgesine değişimi kaydetti.",
        "Özgün 800 istasyon genişleme içeriği; ana düşünce ve ayrıntı ilişkisi için hazırlandı.",
        [
          q(
            "a4-comp-1",
            "Öğrenciler yağmur bahçesini öncelikle hangi sorun için kurdu?",
            "Bahçede biriken yağmur suyu için",
            [
              "Bitkilerin gölgede kalması için",
              "Gözlem çizelgesinin kaybolması için",
              "Okul yolunun uzaması için",
            ],
            "İlk cümle, bahçede su birikmesini başlangıç sorunu olarak veriyor.",
            "Metnin ilk cümlesindeki sorunu belirle.",
          ),
          q(
            "a4-comp-2",
            "Bitkilerin çukur alana yerleştirilmesi metne nasıl katkı sağlar?",
            "Suyun bu alanda toplanmasını açıklar",
            [
              "Öğrencilerin çizelgeyi hazırlamasını açıklar",
              "Bahçenin neden gölgeli olduğunu açıklar",
              "Yağmurun ne zaman yağacağını gösterir",
            ],
            "Suyu seven bitkiler, suyun toplandığı çukur alana yerleştirilmiştir.",
            "Bitki seçimi ile çukur alanın işlevini eşleştir.",
          ),
          q(
            "a4-comp-3",
            "Metnin desteklediği sonuç hangisidir?",
            "Bahçedeki su daha çabuk çekildi",
            [
              "Bahçedeki su daha geç çekildi",
              "Yağmur suyu her yerde birikti",
              "Bitkiler bütün alanı kapladı",
            ],
            "Metin yalnızca bahçedeki suyun daha kısa sürede çekildiğini bildiriyor.",
            "Sonuç cümlesinin kapsamını aşmayan seçeneği bul.",
          ),
        ],
      ),
      station(
        "a4-common-strategy",
        "İddia ile kanıtı yeniden eşleştir",
        "COMMON_STRATEGIES",
        ["RC_DETAIL", "RC_INFERENCE"],
        "Bir çıkarım yapmadan önce iddiayı destekleyen iki ayrı metin ayrıntısını kontrol eder.",
        "Sessiz çalışma alanı",
        "Kütüphane, sınav haftasında sessiz çalışma alanını ikinci kata taşıdı. Yeni bölümde masalar aralıklı yerleştirildi ve ödünç kulaklıklar girişte bırakıldı. Görevli, öğleden sonra bu alandaki doluluğun arttığını gözlemledi.",
        "Özgün 800 istasyon genişleme içeriği; ortak kanıt kontrol stratejisi için hazırlandı.",
        [
          q(
            "a4-common-1",
            "Yeni alanın daha sakin çalışmaya uygun olduğunu destekleyen ayrıntılar hangileridir?",
            "Masaların aralıklı olması ve ödünç kulaklıklar",
            [
              "İkinci kattaki masa düzeni ve sınav haftası",
              "Görevlinin gözlemi ve öğleden sonraki doluluk",
              "Kütüphane bölümü ve öğrencilerin önerileri",
            ],
            "İki ayrıntı da çalışma ortamındaki sesi ve düzeni doğrudan etkiler.",
            "İddiayı destekleyen çevre düzeni ayrıntılarını seç.",
          ),
          q(
            "a4-common-2",
            "Doluluğun öğleden sonra arttığı bilgisi neyi kanıtlar?",
            "Öğleden sonra kullanımın arttığını",
            [
              "Bütün öğrencilerin sessiz çalıştığını",
              "Kulaklıkların tüm gün yettiğini",
              "İkinci katın her zaman dolu olduğunu",
            ],
            "Gözlem yalnızca öğleden sonraki doluluğa ilişkindir.",
            "Gözlemin zaman sınırını koru.",
          ),
          q(
            "a4-common-3",
            "Bir iddiayı metne dayandırırken en güvenilir yaklaşım hangisidir?",
            "İki kanıtı bulup iddianın sınırını denetlemek",
            [
              "İlk ayrıntıyı bütün durumlar için yeterli saymak",
              "Metinde olmayan nedeni olası açıklama olarak kabul etmek",
              "Dikkat çeken cümleyi başka ayrıntıyla karşılaştırmadan seçmek",
            ],
            "İki ayrıntı ve kapsam karşılaştırması, desteklenmeyen genellemeyi önler.",
            "İddiayı kanıtın ne kadar desteklediğini kontrol et.",
          ),
        ],
      ),
      station(
        "a4-integrated",
        "İki ölçümü ve metindeki sınırı birleştir",
        "INTEGRATED_PRACTICE",
        ["RC_DETAIL", "RC_INFERENCE", "FAST_ATTENTION"],
        "Tablodaki ölçümü metindeki açıklamayla birleştirerek sınırlı ve kanıta bağlı sonuç çıkarır.",
        "Fide gözlem notu",
        "Fen kulübü, aynı tür iki fideyi farklı ışık alan noktalara yerleştirdi. A noktası sabah dört saat, B noktası bir saat ışık aldı. Bir hafta sonra A'daki fidenin yaprakları daha genişti. Kulüp, tek denemenin kesin bir kural oluşturmadığını not etti.",
        "Özgün 800 istasyon genişleme içeriği; ölçüm, metin kanıtı ve çıkarım aktarımı için hazırlandı.",
        [
          q(
            "a4-integrated-1",
            "Hangi fide daha uzun süre ışık aldı?",
            "A noktasındaki fide",
            ["B noktasındaki fide", "İki fide eşit süre aldı", "Notta bu bilgi verilmedi"],
            "A noktası dört, B noktası bir saat ışık almıştır.",
            "Önce süreleri karşılaştır.",
          ),
          q(
            "a4-integrated-2",
            "Bir hafta sonraki gözlem nedir?",
            "A fidesinin yaprakları daha genişti",
            [
              "B fidesinin yaprakları daha genişti",
              "İki fidenin yaprakları eşit genişlikteydi",
              "A fidesinin gövdesi daha uzundu",
            ],
            "Metin yalnızca A fidesinin yapraklarının daha geniş olduğunu bildiriyor.",
            "Son iki cümlede gözlenen farkı bul.",
          ),
          q(
            "a4-integrated-3",
            "Kulübün notuyla uyumlu çıkarım hangisidir?",
            "Bu gözlem yalnızca bu denemeyle sınırlı",
            [
              "Dört saat ışık her fideyi kesin büyütür",
              "Işık süresi yaprakları tek başına belirler",
              "B fidesi bu hafta daha küçük yaprak verdi",
            ],
            "Kulüp, tek denemenin kesin bir kural oluşturmadığını belirtiyor.",
            "Gözlemi genellemeden ifade et.",
          ),
        ],
      ),
      station(
        "a4-assessment",
        "Kanıtı, ilişkiyi ve çıkarımı birlikte değerlendir",
        "MULTI_SKILL_ASSESSMENT",
        ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
        "Ana düşünceyi, açık ayrıntıyı ve sınırlı çıkarımı yeni bir metinde birlikte uygular.",
        "Mahalle tamir günü",
        "Mahalle atölyesi ayda bir kez küçük ev eşyalarını onarmak için buluşma düzenliyor. Gönüllüler önce arızayı dinliyor, sonra gerekli parçayı kontrol ediyor. Geçen ay on iki eşyanın sekizi kullanılabilir hâle geldi. Atölye, bu sonuçtan yola çıkarak her eşyanın onarılabileceğini söylemiyor.",
        "Özgün 800 istasyon genişleme içeriği; çoklu beceri kontrolü için hazırlandı.",
        [
          q(
            "a4-assessment-1",
            "Atölyenin temel amacı nedir?",
            "Küçük ev eşyalarını onarmak",
            [
              "Kullanılmış ev eşyalarını satın almak",
              "Gönüllülere yedek parça dağıtmak",
              "Mahalle buluşmalarını seyrekleştirmek",
            ],
            "İlk cümle atölyenin onarım amacıyla toplandığını belirtiyor.",
            "İlk cümledeki amaç ifadesini bul.",
          ),
          q(
            "a4-assessment-2",
            "Geçen ay kaç eşya kullanılabilir hâle geldi?",
            "Sekiz eşya",
            ["Altı eşya", "On iki eşya", "Yirmi eşya"],
            "On iki eşyanın sekizi onarılmıştır.",
            "Toplam ile sonuç sayısını ayır.",
          ),
          q(
            "a4-assessment-3",
            "Atölye hangi iddiadan özellikle kaçınıyor?",
            "Atölyedeki her eşyanın kesinlikle onarılabileceği",
            [
              "Atölyenin ayda bir kez buluşma düzenlediği",
              "Gönüllülerin arızayı dinleyip parça kontrol ettiği",
              "Geçen ay sekiz eşyanın kullanılabilir hâle geldiği",
            ],
            "Son cümle, her eşyanın onarılabileceği yönünde genelleme yapılmadığını söylüyor.",
            "Son cümlede özellikle reddedilen genellemeyi bul.",
          ),
        ],
      ),
    ],
  },
  {
    routeFamily: "B",
    priorSequence: 2,
    priorPathCode: "EDUCATION_V2_P1_B_FLUENCY_MEANING_CYCLE_2_G8_12",
    nextSequence: 3,
    positionOffset: 1,
    stations: [
      station(
        "b3-fast-reading",
        "Programda aradığın saati bul",
        "FAST_READING",
        ["FAST_ATTENTION", "FAST_RECOGNITION"],
        "Kısa programda hedef etkinliğin saatini hızlı bulur ve benzer kayıtlarla karıştırmaz.",
        "Bilim merkezi programı",
        "Bilim merkezindeki kısa etkinlikler: Su döngüsü 09.20, Işık ve gölge 10.05, Ses deneyi 11.10. Kayıtlar etkinlikten beş dakika önce kapanır. Katılımcılar salona girişte görevli kartını gösterir.",
        "Özgün 800 istasyon genişleme içeriği; hızlı tarama ve doğru ayrıntı seçimi için hazırlandı.",
        [
          q(
            "b3-fast-1",
            "Işık ve gölge etkinliği saat kaçta?",
            "10.05'te",
            ["09.20'de", "10.50'de", "11.10'da"],
            "Programda etkinlik 10.05 olarak listelenmiştir.",
            "Etkinlik adını programdaki saatle eşleştir.",
          ),
          q(
            "b3-fast-2",
            "Kayıtlar ne zaman kapanıyor?",
            "Etkinlikten beş dakika önce",
            [
              "Etkinlikten on dakika önce",
              "Etkinlik başladıktan beş dakika sonra",
              "Kapıdaki kart kontrolünden sonra",
            ],
            "İkinci cümle kapanış zamanını veriyor.",
            "Saat bilgisinden sonraki cümleyi tara.",
          ),
          q(
            "b3-fast-3",
            "Salona girişte ne gösteriliyor?",
            "Görevli kartı",
            ["Etkinlik notu", "Kayıt makbuzu", "Deney sonucu"],
            "Son cümlede görevli kartı isteniyor.",
            "Giriş koşulunu belirten son cümleye dön.",
          ),
        ],
      ),
      station(
        "b3-comprehension",
        "Akıcı okurken anlam bağını koru",
        "READING_COMPREHENSION",
        ["FAST_CHUNKING", "RC_MAIN_IDEA"],
        "Cümleleri anlamlı öbeklerle izleyerek olay sırasını ve metnin ana düşüncesini korur.",
        "Bisiklet yolu denemesi",
        "Belediye, okul çevresindeki sokağı sabah giriş saatinde araçlara kapattı. Öğrenciler yürüyerek ya da bisikletle geldi. Deneme sonunda okul kapısındaki araç yoğunluğu azaldı; belediye uygulamanın kalıcı olup olmayacağını ailelerden gelen görüşlerle değerlendirecek.",
        "Özgün 800 istasyon genişleme içeriği; akıcılık-anlam aktarımı için hazırlandı.",
        [
          q(
            "b3-comp-1",
            "Sokak hangi zaman aralığında araçlara kapatıldı?",
            "Sabah giriş saatinde",
            ["Öğle vaktinde", "Akşam çıkışında", "Hafta sonunda"],
            "Metin kapatma zamanını sabah giriş saatiyle sınırlar.",
            "Zaman belirten ilk cümleyi bul.",
          ),
          q(
            "b3-comp-2",
            "Deneme sonunda hangi değişim gözlendi?",
            "Okul kapısında araç yoğunluğu azaldı",
            [
              "Sokakta bisiklet yoğunluğu arttı",
              "Kapıdaki araç sayısı değişmedi",
              "Sabah girişindeki yaya akışı durdu",
            ],
            "Metin yoğunluğun azaldığını bildiriyor.",
            "‘Deneme sonunda’ ifadesinden sonrasını oku.",
          ),
          q(
            "b3-comp-3",
            "Belediye kalıcılık kararını nasıl verecek?",
            "Aile görüşlerini de değerlendirerek",
            [
              "Sokağı hemen yeniden açarak",
              "Yalnızca bisiklet sayısını ölçerek",
              "Ailelere yeni bir saat belirleterek",
            ],
            "Kararın aile görüşleriyle değerlendirileceği belirtiliyor.",
            "Son cümlenin karar koşulunu bul.",
          ),
        ],
      ),
      station(
        "b3-common-strategy",
        "Anlamlı öbeklerde durup yeniden kontrol et",
        "COMMON_STRATEGIES",
        ["FAST_CHUNKING", "RC_DETAIL"],
        "Noktalama ve bağlaçları izleyerek okuma hızını anlamı koruyacak biçimde düzenler.",
        "Sesli okuma provası",
        "Ece, duyuru metnini ilk provada hızlı okudu; fakat tarih bilgisini atladı. İkinci provada virgüllerde kısa durdu ve ‘çünkü’ sözcüğünden sonraki açıklamayı birlikte okudu. Dinleyenler bu kez etkinliğin neden ertelendiğini doğru aktardı.",
        "Özgün 800 istasyon genişleme içeriği; okuma öbekleri ve anlam denetimi için hazırlandı.",
        [
          q(
            "b3-common-1",
            "İlk provada Ece neyi atladı?",
            "Tarih bilgisini",
            ["Etkinliğin adını", "Duyurunun başlığını", "Dinleyenlerin sorusunu"],
            "Metin ilk provada tarih bilgisinin atlandığını söylüyor.",
            "İlk cümledeki ‘fakat’ sonrasına dikkat et.",
          ),
          q(
            "b3-common-2",
            "İkinci provada hangi okuma davranışı değişti?",
            "Virgüllerde durdu ve bağlaçlı bölümü izledi",
            [
              "Metnin tarihini yeniden okuyup sırayla not aldı",
              "Duraklarda daha yüksek sesle konuştu",
              "Cümleleri baştan sona ara vermeden okudu",
            ],
            "İkinci cümlede iki yeni davranış açıklanıyor.",
            "İkinci cümledeki eylemleri birlikte seç.",
          ),
          q(
            "b3-common-3",
            "Bu örneğin desteklediği strateji hangisidir?",
            "Önemli anlam bağlarını koruyarak hızlanmak",
            [
              "Hız uğruna anlamı etkileyen durakları kaldırmak",
              "Tarih bilgisini atlayıp metni baştan sona okumak",
              "Noktalama işaretlerini görmezden gelmek",
            ],
            "İkinci provadaki durak ve bağlaç, anlamın korunmasına yardımcı olmuştur.",
            "Okuma davranışı ile doğru aktarılan nedeni ilişkilendir.",
          ),
        ],
      ),
      station(
        "b3-integrated",
        "Gözlem çizelgesini anlatımla eşleştir",
        "INTEGRATED_PRACTICE",
        ["FAST_ATTENTION", "RC_DETAIL", "RC_INFERENCE"],
        "Çizelgedeki ölçümleri metnin koşullarıyla birleştirip sınırları belli bir çıkarım kurar.",
        "Fide sulama çizelgesi",
        "Sınıf iki saksıyı aynı pencereye koydu. Birinci saksı pazartesi ve perşembe, ikinci saksı her gün sulandı. Cuma günü birinci saksının toprağı nemli, ikincininki çok ıslaktı. Öğrenciler sonraki hafta sulama miktarını da eşitleyerek gözlemi tekrarlayacak.",
        "Özgün 800 istasyon genişleme içeriği; hızlı tarama ve çoklu kanıt bağlama için hazırlandı.",
        [
          q(
            "b3-integrated-1",
            "Birinci saksı hangi günlerde sulandı?",
            "Pazartesi ve perşembe",
            ["Pazartesi ve salı günleri", "Pazartesi ile cuma günleri", "Çarşamba ve perşembe"],
            "Sulama günleri ikinci cümlede açıkça belirtilmiştir.",
            "Saksı numarasını günlerle eşleştir.",
          ),
          q(
            "b3-integrated-2",
            "Cuma günü hangi saksının toprağı çok ıslaktı?",
            "İkinci saksının",
            ["Birinci saksının", "İki saksının da", "Metinde belirtilmiyor"],
            "Cuma gözleminde ikinci saksının toprağı çok ıslak olarak verilmiştir.",
            "Cuma gününe ait iki toprak durumunu ayır.",
          ),
          q(
            "b3-integrated-3",
            "Öğrenciler sonraki hafta neyi de eşitleyecek?",
            "Sulama miktarını",
            ["Saksıların yerini", "Toprağın rengini", "Pencerenin yönünü"],
            "Son cümle sulama miktarının eşitleneceğini söylüyor.",
            "Son cümledeki yeni deneme koşulunu bul.",
          ),
        ],
      ),
      station(
        "b3-assessment",
        "Akıcılık ve anlamı birlikte yokla",
        "MULTI_SKILL_ASSESSMENT",
        ["FAST_ATTENTION", "FAST_CHUNKING", "RC_MAIN_IDEA", "RC_DETAIL"],
        "Kısa yönergede bilgiyi bulur, anlamlı öbekleri izler ve ana sonucu metinle doğrular.",
        "Müze sesli turu",
        "Müzenin kısa sesli turu üç bölümden oluşuyor: taş eserler, günlük yaşam ve kent planı. Ziyaretçiler her bölümün sonunda bir durak sorusunu yanıtlıyor. Tur ekibi, hızlı ilerlemek isteyenlerin de durak sorularını atlamamasını öneriyor; sorular bir sonraki bölümdeki bağlantıyı fark etmeye yardım ediyor.",
        "Özgün 800 istasyon genişleme içeriği; çoklu beceri değerlendirmesi için hazırlandı.",
        [
          q(
            "b3-assess-1",
            "Sesli tur kaç bölümden oluşuyor?",
            "Üç ayrı bölümden",
            ["İki ana bölümden", "Dört farklı bölümden", "Tek bir bölümden"],
            "Metin üç bölüm adını sıralıyor.",
            "İki noktadan sonra sayılan bölümleri say.",
          ),
          q(
            "b3-assess-2",
            "Durak soruları ne zaman yanıtlanıyor?",
            "Her bölümün sonunda",
            ["Tura başlamadan önce", "Yalnızca son bölümde", "Müze kapanırken"],
            "İkinci cümle soruların her bölüm sonunda olduğunu söylüyor.",
            "Zamanı belirten ikinci cümleyi bul.",
          ),
          q(
            "b3-assess-3",
            "Tur ekibi hızlı ilerleyenlere ne öneriyor?",
            "Durak sorularını atlamamalarını",
            [
              "Bir bölümü iki kez dinlemelerini",
              "Kent planını sona bırakmalarını",
              "Sesli turu yarıda kesmelerini",
            ],
            "Öneri, soruların sonraki bölümle bağlantıyı fark ettirmesine dayanıyor.",
            "Son iki cümledeki öneri ile gerekçeyi eşleştir.",
          ),
        ],
      ),
    ],
  },
  {
    routeFamily: "C",
    priorSequence: 2,
    priorPathCode: "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE_CYCLE_2_G8_12",
    nextSequence: 3,
    positionOffset: 2,
    stations: [
      station(
        "c3-fast-reading",
        "Rapor içindeki kanıtı çabuk seç",
        "FAST_READING",
        ["FAST_ATTENTION", "RC_DETAIL"],
        "Kısa raporda ölçüm ve zaman bilgisini hızlı bulup kanıtın hangi iddiaya ait olduğunu belirler.",
        "Kuş gözlem raporu",
        "Park ekibi salı günü gölet çevresinde 18 kuş gözledi. Perşembe günü aynı saatte yapılan sayımda 23 kuş kaydedildi. Ekip, iki gözlemin kuş sayısının arttığını gösterdiğini yazdı; hangi kuşların yeni geldiği ayrıca araştırılacak.",
        "Özgün 800 istasyon genişleme içeriği; kanıtı hızlı bulma kazanımı için hazırlandı.",
        [
          q(
            "c3-fast-1",
            "Salı günü kaç kuş gözlendi?",
            "18 kuş",
            ["13 kuş", "21 kuş", "23 kuş"],
            "Salı sayımı 18 olarak verilmiştir.",
            "Gün adını sayıyla eşleştir.",
          ),
          q(
            "c3-fast-2",
            "Perşembe sayımı Salı sayımına göre hangi zaman koşulunda yapıldı?",
            "Salıdakiyle aynı saatte",
            ["Sabah erken", "Öğleden sonra", "Metinde saat belirtilmiyor"],
            "Metin iki sayımın aynı saatte yapıldığını söylüyor.",
            "Perşembe cümlesindeki karşılaştırma ifadesini ara.",
          ),
          q(
            "c3-fast-3",
            "Hangi konu ayrıca araştırılacak?",
            "Hangi kuşların yeni geldiği",
            [
              "Sayımın hangi gün bittiği",
              "Göletin ne zaman yapıldığı",
              "Park ekibinin kaç kişi olduğu",
            ],
            "Son cümle yeni gelen kuşların kimliğinin araştırılacağını belirtir.",
            "Son cümlenin araştırma konusunu bul.",
          ),
        ],
      ),
      station(
        "c3-comprehension",
        "Neden ile sonucu metinden ayır",
        "READING_COMPREHENSION",
        ["RC_DETAIL", "RC_INFERENCE"],
        "Neden-sonuç bağını, metinde açıkça verilen olaylar üzerinden kurar.",
        "Atölye saati değişikliği",
        "Seramik atölyesi kışın daha erken karardığı için başlangıç saatini yarım saat öne aldı. Katılımcılar yeni saatte çalışmaya gün ışığında başlayabiliyor. Eğitmen, değişikliğin ürünlerin daha kısa sürede pişmesini sağlamadığını özellikle belirtti.",
        "Özgün 800 istasyon genişleme içeriği; metinsel neden-sonuç kanıtı için hazırlandı.",
        [
          q(
            "c3-comp-1",
            "Atölye başlangıç saatini neden öne aldı?",
            "Kışın daha erken karardığı için",
            [
              "Ürünler daha çabuk piştiği için",
              "Katılımcılar geç kaldığı için",
              "Gün ışığı arttığı için",
            ],
            "İlk cümlede neden erken kararma olarak verilmiştir.",
            "‘İçin’ bağlacının neden bildiren tarafını bul.",
          ),
          q(
            "c3-comp-2",
            "Yeni saatin katılımcılara sağladığı yarar nedir?",
            "Katılımcıların gün ışığında çalışmaya başlayabilmesi",
            [
              "Seramik ürünlerin daha kısa sürede pişirilebilmesi",
              "Eğitmenin ürünleri aynı gün teslim edebilmesi",
              "Atölye günlerinin kışın daha sık düzenlenebilmesi",
            ],
            "İkinci cümle yararı açıkça açıklıyor.",
            "Yeni saatte neyin mümkün olduğu yazıyor?",
          ),
          q(
            "c3-comp-3",
            "Eğitmen hangi sonucu özellikle reddediyor?",
            "Pişirme süresinin kısalmasını",
            [
              "Çalışmanın gün ışığında başlamasını",
              "Saatin yarım saat öne alınmasını",
              "Kışın erken kararmasını",
            ],
            "Eğitmen, saat değişikliğinin pişirme süresini kısaltmadığını belirtiyor.",
            "‘Sağlamadığını’ sözcüğünün nesnesini bul.",
          ),
        ],
      ),
      station(
        "c3-common-strategy",
        "Çıkarımı iki kanıtla sınırla",
        "COMMON_STRATEGIES",
        ["RC_DETAIL", "RC_INFERENCE"],
        "Çıkarımını destekleyen ayrı ayrıntıları seçer ve kanıtın izin vermediği genellemeyi dışarıda bırakır.",
        "Sınıf kitaplığı",
        "Sınıf kitaplığındaki yeni kitaplar, öğrencilerin önerileri alınarak seçildi. İlk hafta en çok bilim kitapları ödünç verildi. Öğretmen, bu sayının sınıftaki herkesin yalnızca bilim kitaplarını sevdiğini göstermediğini hatırlattı.",
        "Özgün 800 istasyon genişleme içeriği; iddia ve kanıt sınırını kontrol etmek için hazırlandı.",
        [
          q(
            "c3-common-1",
            "Kitaplar seçilirken hangi bilgi kullanıldı?",
            "Öğrenci önerileri",
            ["Yayınevi fiyatları", "Ödünç verme saati", "Kitapların sayfa rengi"],
            "İlk cümle öğrenci önerilerinin alındığını söylüyor.",
            "Seçim sürecini anlatan ilk cümleyi bul.",
          ),
          q(
            "c3-common-2",
            "İlk hafta en çok hangi kitaplar ödünç verildi?",
            "Bilim kitapları",
            ["Şiir kitapları", "Tarih kitapları", "Öykü kitapları"],
            "İkinci cümle en çok ödünç verilen türü belirtir.",
            "‘En çok’ ifadesinin yanındaki türü bul.",
          ),
          q(
            "c3-common-3",
            "Metnin desteklemediği genelleme hangisidir?",
            "Sınıftaki herkesin yalnızca bilim kitaplarını sevdiği",
            [
              "İlk hafta bilim kitaplarının daha çok ödünç verildiği",
              "Öğrenci önerilerinin seçimde dikkate alındığı",
              "Tek haftalık sayının herkesin tercihini göstermediği",
            ],
            "Tek haftalık ödünç sayısı herkesin tercihini kanıtlamaz.",
            "Öğretmenin özellikle sınır koyduğu iddiayı seç.",
          ),
        ],
      ),
      station(
        "c3-integrated",
        "İki gözlemden ölçülü çıkarım yap",
        "INTEGRATED_PRACTICE",
        ["RC_DETAIL", "RC_INFERENCE", "FAST_ATTENTION"],
        "İki ayrı gözlem bilgisini birleştirerek metnin desteklediği sınırlı çıkarımı yapar.",
        "Bisiklet park yeri",
        "Okul, bisiklet park yerini giriş kapısına yaklaştırdı. Bir hafta sonra sabahları park alanının daha düzenli kullanıldığı, öğleden sonra ise boş yer kaldığı görüldü. Okul yönetimi, bu gözlemlerin yalnızca ilk haftayı kapsadığını ve uzun dönem alışkanlığını göstermediğini not etti.",
        "Özgün 800 istasyon genişleme içeriği; iki ayrıntıdan çıkarım ve kapsam kontrolü için hazırlandı.",
        [
          q(
            "c3-integrated-1",
            "Bisiklet park yeri nereye taşındı?",
            "Giriş kapısına yaklaştırıldı",
            [
              "Spor salonuna uzaklaştırıldı",
              "Ana kapının karşısına taşındı",
              "Girişten yan bahçeye alındı",
            ],
            "İlk cümle yeni konumu açıkça söylüyor.",
            "İlk cümledeki yön bilgisini bul.",
          ),
          q(
            "c3-integrated-2",
            "İlk hafta öğleden sonra ne gözlendi?",
            "Park yerinde boş yer kaldı",
            ["Bisikletler girişe alınmadı", "Alan tamamen doldu", "Park yeri kapalı tutuldu"],
            "İkinci cümlede öğleden sonra boş yer kaldığı belirtiliyor.",
            "Günün iki bölümüne ait gözlemleri ayır.",
          ),
          q(
            "c3-integrated-3",
            "İki gözlem birlikte hangi sınırlı sonucu destekler?",
            "İlk hafta kullanım günün saatine göre değişti",
            [
              "Yeni yerleşim kalıcı bir alışkanlık oluşturdu",
              "Bütün öğrenciler bisikletle geldi",
              "Öğleden sonra bisiklet kullanımı sona erdi",
            ],
            "Sabah düzenli kullanım, öğleden sonra boş yer bilgisi ilk haftadaki saat farkını gösterir.",
            "Yönetimin süre uyarısını aşmadan gözlemleri birleştir.",
          ),
        ],
      ),
      station(
        "c3-assessment",
        "Kanıt seçimini ve çıkarımı değerlendir",
        "MULTI_SKILL_ASSESSMENT",
        ["RC_DETAIL", "RC_INFERENCE", "RC_MAIN_IDEA"],
        "Bilgilendirici metinde açık bilgiyi, kanıtı ve genelleme sınırını birlikte değerlendirir.",
        "Yürüyüş yolu ölçümü",
        "Gönüllüler dere kenarındaki kısa yürüyüş yoluna iki dinlenme bankı ekledi. İlk hafta sonu gözleminde ziyaretçiler bankları kullandı; bazıları yolun tamamını yürüdü, bazıları bankta dinlenip geri döndü. Ekip, bankların ziyaret süresini uzattığını ölçmediği için bu konuda sonuç çıkarmadı.",
        "Özgün 800 istasyon genişleme içeriği; çoklu beceri değerlendirmesi için hazırlandı.",
        [
          q(
            "c3-assess-1",
            "Yürüyüş yoluna ne eklendi?",
            "İki dinlenme bankı",
            ["Yeni bir köprü", "İki ölçüm panosu", "Bir bisiklet noktası"],
            "İlk cümle eklenen iki bankı bildiriyor.",
            "İlk cümledeki nesneyi ve sayıyı bul.",
          ),
          q(
            "c3-assess-2",
            "Ziyaretçilerin davranışı nasıldı?",
            "Bazıları yürüdü, bazıları dinlenip geri döndü",
            [
              "Herkes yolu tamamlayıp bankta dinlendi",
              "Bazıları bankta oturup yolu yeniden yürüdü",
              "Hiçbiri bankları kullanmadan geri döndü",
            ],
            "İkinci cümle iki farklı davranışı karşılaştırıyor.",
            "Noktali virgülden önce ve sonra anlatılanları birleştir.",
          ),
          q(
            "c3-assess-3",
            "Ekip neden ziyaret süresi hakkında sonuç çıkarmadı?",
            "Bu süreyi ölçmediği için",
            [
              "Banklar kullanılmadığı için",
              "Yol hafta sonu kapalı olduğu için",
              "Ziyaretçiler geri dönmediği için",
            ],
            "Son cümle, sürenin ölçülmediğini gerekçe gösteriyor.",
            "Son cümledeki neden-sonuç bağını bul.",
          ),
        ],
      ),
    ],
  },
  {
    routeFamily: "D",
    priorSequence: 2,
    priorPathCode: "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT_CYCLE_2_G8_12",
    nextSequence: 3,
    positionOffset: 3,
    stations: [
      station(
        "d3-fast-reading",
        "Bağlam ipucunu hızlı bul",
        "FAST_READING",
        ["FAST_ATTENTION", "RC_DETAIL"],
        "Hedef sözcüğün anlamını açıklayan yakın bağlam bilgisini hızlıca bulur.",
        "Pazar tezgâhı notu",
        "Kooperatif, satış gününden önce elmaların ezilmiş bölümlerini ayırdı. Kalan sağlam meyveler küçük kasalara dizildi ve kasaların üzerine tür adı yazıldı. Böylece alıcılar, ürünleri birbirine karıştırmadan seçebildi.",
        "Özgün 800 istasyon genişleme içeriği; bağlam ipucunu hızlı seçme için hazırlandı.",
        [
          q(
            "d3-fast-1",
            "Satış gününden önce hangi ürün ayrıldı?",
            "Ezilmiş bölümü olan elmalar",
            ["Sağlam armutlar", "Küçük boş kasalar", "Tür etiketi olmayan meyveler"],
            "İlk cümlede ayrılan elmaların durumu açıklanıyor.",
            "İlk cümlede hangi ürünün niteliği var?",
          ),
          q(
            "d3-fast-2",
            "Kasaların üzerine ne yazıldı?",
            "Kasadaki meyvenin türü",
            ["Kasadaki meyvenin fiyatı", "Kasaya konan ürün sayısı", "Meyvenin toplandığı gün"],
            "İkinci cümlede tür adının yazıldığı belirtiliyor.",
            "Kasaya eklenen bilgiyi bul.",
          ),
          q(
            "d3-fast-3",
            "Ürünlerin karışmadan seçilmesine hangi bilgi yardım etti?",
            "Kasaların üzerindeki tür adları",
            [
              "Kasadaki ürünlerin sıralanması",
              "Satış gününün önceden duyurulması",
              "Elmaların ezilmiş veya sağlam olması",
            ],
            "Tür etiketi alıcıların ürünleri ayırmasını sağlıyor.",
            "Sonuç cümlesindeki ‘böylece’ ifadesinden önceki bilgiye bak.",
          ),
        ],
      ),
      station(
        "d3-comprehension",
        "Sözcüğün anlamını cümlede doğrula",
        "READING_COMPREHENSION",
        ["RC_DETAIL", "RC_MAIN_IDEA"],
        "Bir sözcüğün bağlamdaki anlamını cümle ve paragrafın bütünüyle doğrular.",
        "Kıyıdaki işaretler",
        "Kıyı yürüyüş yolundaki soluk işaretler yenilendi. Görevliler, işaretlerin kaybolduğunu değil, güneş ve yağmur nedeniyle renklerinin belirginliğini yitirdiğini açıkladı. Yeni boyanın uzaktan daha kolay fark edilmesi bekleniyor.",
        "Özgün 800 istasyon genişleme içeriği; sözcük anlamını bağlamla doğrulama için hazırlandı.",
        [
          q(
            "d3-comp-1",
            "Metindeki ‘soluk’ sözcüğü hangi durumu anlatıyor?",
            "Rengi solup belirginliği azalan işaretleri",
            [
              "Yolu gösterme işlevini yitiren levhaları",
              "Güneş görmediği için silinen işaretleri",
              "Yeni boyayla rengi koyulaştırılan levhaları",
            ],
            "Sonraki cümle renklerin belirginliğini yitirdiğini açıklıyor.",
            "Sözcükten sonra gelen açıklayıcı cümleyi kullan.",
          ),
          q(
            "d3-comp-2",
            "İşaretlerin rengi neden solmuş?",
            "Güneş ve yağmur nedeniyle",
            [
              "Yürüyüş yolu değiştiği için",
              "Yeni boya seçildiği için",
              "İşaretler uzakta kaldığı için",
            ],
            "Görevliler iki çevresel nedeni açıkça veriyor.",
            "‘Nedeniyle’ sözcüğünden önceki etkenleri bul.",
          ),
          q(
            "d3-comp-3",
            "Yeni boyadan ne bekleniyor?",
            "İşaretlerin uzaktan daha kolay fark edilmesi",
            [
              "Yeni rengin güneşte daha soluk kalması",
              "İşaretlerin kıyıdan daha uzakta görülmesi",
              "Yürüyüş yolunun daha kolay bulunması",
            ],
            "Son cümle yeni boyanın görünürlüğü artırmasını bekliyor.",
            "Son cümledeki beklentiyi bul.",
          ),
        ],
      ),
      station(
        "d3-common-strategy",
        "Bilinmeyen sözcüğü bağlamla sınayarak çöz",
        "COMMON_STRATEGIES",
        ["RC_DETAIL", "RC_INFERENCE"],
        "Bilinmeyen sözcük için yakın ipucu bulur, önerdiği anlamı cümleye geri koyup sınar.",
        "Arşiv kutuları",
        "Arşiv görevlisi, belgeleri ‘kronolojik’ sıraya koydu. En eski kayıt kutunun başına, daha yeni tarihliler arkasına yerleştirildi. Görevli, bu düzenin aranan yılı bulmayı kolaylaştırdığını söyledi.",
        "Özgün 800 istasyon genişleme içeriği; bağlam temelli sözcük çözümleme stratejisi için hazırlandı.",
        [
          q(
            "d3-common-1",
            "Belgeler hangi sırayla yerleştirildi?",
            "En eskiden daha yeni tarihlilere doğru",
            [
              "En yenilerden daha eski tarihlilere doğru",
              "Başlıklara göre alfabetik bir sırayla",
              "Kutulara gelişigüzel ve karışık biçimde",
            ],
            "İkinci cümle sıralamanın eskiden yeniye olduğunu gösteriyor.",
            "En eski ve yeni kayıtların yerini karşılaştır.",
          ),
          q(
            "d3-common-2",
            "‘Kronolojik’ sözcüğünün anlamını açıklayan ipucu hangisidir?",
            "Kayıtların tarihlerine göre dizilmesi",
            [
              "Belgelerin türlerine göre ayrılması",
              "Belgelerin konu başlıklarına göre gruplanması",
              "Dosyaların kutulara gelişigüzel konması",
            ],
            "En eski ve daha yeni tarihlerin sıralanması zaman düzenini açıklar.",
            "Tarihlerle ilgili ayrıntıyı kullan.",
          ),
          q(
            "d3-common-3",
            "Önerilen anlamı doğrulamak için hangi adım uygundur?",
            "Önerilen anlamı cümlede yeniden denemek",
            [
              "Sözcüğü metinden çıkarıp okumayı bırakmak",
              "İlk akla gelen anlamı kanıtsız seçmek",
              "Yalnızca sözcüğün sesine bakmak",
            ],
            "Anlamı cümleye geri koymak bağlam tutarlılığını sınar.",
            "Seçtiğin anlamı cümlede dene.",
          ),
        ],
      ),
      station(
        "d3-integrated",
        "Kelime, ana düşünce ve kanıtı birleştir",
        "INTEGRATED_PRACTICE",
        ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
        "Bağlamdan sözcük anlamı çıkarır ve bu anlamı metnin ana düşüncesiyle ilişkilendirir.",
        "Kurutma rafı",
        "Meyve bahçesinde hasat edilen armutlar gölgeli bir rafa yayıldı. Görevli, meyveleri ‘havalandırmak’ için aralarında boşluk bıraktı; sıkışık duranların daha geç kuruduğunu gözlemlemişti. Rafın amacı meyveyi güneşte tutmak değil, hava akımını kesmeden saklamaktı.",
        "Özgün 800 istasyon genişleme içeriği; kelime, ayrıntı ve ana düşünceyi bütünleştirmek için hazırlandı.",
        [
          q(
            "d3-integrated-1",
            "Armutlar nereye yayıldı?",
            "Gölgeli bir rafa",
            ["Güneşli bir duvara", "Kapalı bir kutuya", "Sulama kanalına"],
            "İlk cümle rafın yerini belirtiyor.",
            "İlk cümlede meyvenin konumunu bul.",
          ),
          q(
            "d3-integrated-2",
            "Metinde ‘havalandırmak’ ne anlama geliyor?",
            "Aralarda boşluk bırakmak",
            [
              "Meyveleri güneşte uzun süre tutmak",
              "Armutları suyla yıkamak",
              "Rafı kapalı bir yere taşımak",
            ],
            "Görevli boşluk bırakıyor ve hava akımını kesmemeyi amaçlıyor.",
            "Açıklamadaki boşluk ve hava ipuçlarını birleştir.",
          ),
          q(
            "d3-integrated-3",
            "Rafın temel amacı hangisidir?",
            "Hava dolaşımını koruyarak saklamak",
            [
              "Hasat zamanını ertelemek",
              "Meyveleri doğrudan güneşte kurutmak",
              "Rafın yerini daha sık değiştirmek",
            ],
            "Son cümle rafın amacını açıkça sınırlar.",
            "Son cümlede ‘değil’ ile ayrılan iki amacı karşılaştır.",
          ),
        ],
      ),
      station(
        "d3-assessment",
        "Bağlamı, kanıtı ve ana düşünceyi değerlendir",
        "MULTI_SKILL_ASSESSMENT",
        ["RC_MAIN_IDEA", "RC_DETAIL", "RC_INFERENCE"],
        "Yeni bir bağlamda sözcük anlamını çözer, açık bilgiyi bulur ve metin kapsamını aşmayan sonuç çıkarır.",
        "Müze sergi etiketi",
        "Müzedeki eski haritaların yanına küçük açıklama kartları kondu. Kartlarda haritanın basım yılı ve hangi kıyı çizgisini gösterdiği yazıyor. Ziyaretçiler, iki haritayı yan yana inceleyerek çizginin zamanla değiştiğini fark edebiliyor; kartlar değişimin nedenini açıklamıyor.",
        "Özgün 800 istasyon genişleme içeriği; çoklu beceri değerlendirmesi için hazırlandı.",
        [
          q(
            "d3-assess-1",
            "Açıklama kartlarında hangi iki bilgi var?",
            "Basım yılı ve kıyı çizgisi",
            [
              "Haritayı çizen kişi ve satış ücreti",
              "Ziyaretçi sayısı ve gezi süresi",
              "Kâğıdın rengi ile harita ölçüsü",
            ],
            "İkinci cümle iki kart bilgisini sıralıyor.",
            "Kartların içeriğini anlatan cümleyi oku.",
          ),
          q(
            "d3-assess-2",
            "Ziyaretçiler haritaları yan yana inceleyince neyi fark ediyor?",
            "Kıyı çizgisinin zamanla değiştiğini",
            [
              "Haritaların aynı yıl basıldığını",
              "Kartların değişim nedenini anlattığını",
              "Müzenin yer değiştirdiğini",
            ],
            "İki haritanın karşılaştırılması zaman içindeki çizgi değişimini gösteriyor.",
            "‘Yan yana’ incelemenin sonucunu bul.",
          ),
          q(
            "d3-assess-3",
            "Ziyaretçiler kıyı çizgisinin değiştiğini fark edebilir; ancak hangi sorunun yanıtı verilmez?",
            "Bu değişimin hangi nedenle gerçekleştiği",
            [
              "Haritaların ne zaman basıldığı",
              "Kartların hangi kıyı çizgisini anlattığı",
              "Çizginin iki haritada farklı olup olmadığı",
            ],
            "Kartlar basım yılını ve kıyı çizgisini bildirir, ancak değişimin nedenini açıklamaz.",
            "Kartlarda bulunan bilgileri ayırıp yanıtlanmayan soruyu seç.",
          ),
        ],
      ),
    ],
  },
];

export type EducationV2P1ExpansionDraftQuestion = DraftQuestion & {
  versionId: string;
  options: Array<{ id: string; text: string; position: number }>;
  correctOptionId: string;
};

export type EducationV2P1ExpansionDraftStation = Omit<DraftStation, "questions"> & {
  routeFamily: RouteDraft["routeFamily"];
  sequence: number;
  pathCode: string;
  stepOrder: number;
  prerequisiteKey: string | null;
  contentVersionId: string;
  exerciseVersionId: string;
  questions: EducationV2P1ExpansionDraftQuestion[];
};

export type EducationV2P1ExpansionDraftCycle = LearningRouteCycle & {
  authoredStationCategories: readonly EducationV2P1ExpansionCategory[];
  authoringStatus: "DRAFT_NOT_RELEASED";
  sourceStations: readonly EducationV2P1ExpansionDraftStation[];
};

function buildDraftCycle(route: RouteDraft): EducationV2P1ExpansionDraftCycle {
  const routeCode = {
    A: "EDUCATION_V2_P1_A_MEANING_STRUCTURE",
    B: "EDUCATION_V2_P1_B_FLUENCY_MEANING",
    C: "EDUCATION_V2_P1_C_INFERENCE_EVIDENCE",
    D: "EDUCATION_V2_P1_D_VOCABULARY_CONTEXT",
  }[route.routeFamily];
  const pathCode = `${routeCode}_CYCLE_${route.nextSequence}_G8_12`;
  const prefix = `EDU_V2_P1_${route.routeFamily}_EXPANSION_${route.nextSequence}`;
  let orderedQuestionIndex = 0;
  const sourceStations: EducationV2P1ExpansionDraftStation[] = route.stations.map(
    (draft, stepIndex) => {
      const stationKey = `${prefix}_${draft.key.replace(/-/gu, "_").toUpperCase()}`;
      const contentVersionId = `${prefix}_CONTENT_${draft.key.toUpperCase()}_V1`;
      const exerciseVersionId = `${prefix}_EXERCISE_${draft.key.toUpperCase()}_V1`;
      const questions = draft.questions.map((question) => {
        const correctIndex = (route.positionOffset + orderedQuestionIndex++) % 4;
        let distractorIndex = 0;
        const rawOptions = [question.correct, ...question.distractors];
        const options = rawOptions.map((_, position) => {
          const text =
            position === correctIndex ? question.correct : question.distractors[distractorIndex++];
          return { id: String.fromCharCode(97 + position), text: text!, position: position + 1 };
        });
        return {
          ...question,
          versionId: `${prefix}_QUESTION_${draft.key.toUpperCase()}_${question.key.toUpperCase()}_V1`,
          options,
          correctOptionId: String.fromCharCode(97 + correctIndex),
        };
      });
      return {
        ...draft,
        key: stationKey,
        routeFamily: route.routeFamily,
        sequence: route.nextSequence,
        pathCode,
        stepOrder: stepIndex + 1,
        prerequisiteKey:
          stepIndex === 0
            ? null
            : `${prefix}_${route.stations[stepIndex - 1]!.key.replace(/-/gu, "_").toUpperCase()}`,
        contentVersionId,
        exerciseVersionId,
        questions,
      };
    },
  );

  const lastStation = sourceStations[sourceStations.length - 1]!;
  const questionVersionIds = sourceStations.flatMap((sourceStation) =>
    sourceStation.questions.map((question) => question.versionId),
  );
  const learningOutcomes = sourceStations.map((sourceStation) => ({
    key: `${prefix}_${sourceStation.key.replace(/-/gu, "_").toUpperCase()}_OUTCOME`,
    statement: sourceStation.outcome,
    targetSkillCodes: sourceStation.skillCodes,
  }));
  const assessmentKey = `${prefix}_${lastStation.key.toUpperCase()}_ASSESSMENT`;
  const assessmentVersionId = `${assessmentKey}_V1`;
  const manifest: LearningCycleManifest = {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: pathCode,
    cycleVersion: route.nextSequence,
    sequence: route.nextSequence,
    routeFamily: route.routeFamily,
    targetSkillCodes: [...new Set(sourceStations.flatMap((item) => item.skillCodes))],
    learningOutcomes,
    resourceCatalog: {
      contentKeys: sourceStations.map((item) => item.key),
      exerciseKeys: sourceStations.slice(0, -1).map((item) => item.key),
      assessmentKeys: [assessmentKey],
      questionVersionIds,
      contentVersions: sourceStations.map((item) => ({
        key: item.key,
        versionId: item.contentVersionId,
      })),
      exerciseVersions: sourceStations.slice(0, -1).map((item) => ({
        key: item.key,
        versionId: item.exerciseVersionId,
        questionVersionIds: item.questions.map((question) => question.versionId),
      })),
      assessmentVersions: [
        {
          key: assessmentKey,
          versionId: assessmentVersionId,
          questionVersionIds: lastStation.questions.map((question) => question.versionId),
        },
      ],
    },
    steps: sourceStations.map((item, index) => {
      const outcomeKey = learningOutcomes[index]!.key;
      const prerequisiteKeys = item.prerequisiteKey ? [item.prerequisiteKey] : [];
      if (index === sourceStations.length - 1) {
        return {
          stableKey: item.key,
          order: item.stepOrder,
          type: "ASSESSMENT" as const,
          taskKind: "CHECKPOINT" as const,
          learningOutcomeKeys: [outcomeKey],
          prerequisiteKeys,
          required: true,
          assessment: {
            key: assessmentKey,
            versionId: assessmentVersionId,
            questionVersionIds: item.questions.map((question) => question.versionId),
          },
        };
      }
      return {
        stableKey: item.key,
        order: item.stepOrder,
        type: index === 2 ? ("REINFORCEMENT" as const) : ("PRACTICE" as const),
        taskKind: index === 2 ? ("RETRIEVAL" as const) : ("TRANSFER" as const),
        learningOutcomeKeys: [outcomeKey],
        prerequisiteKeys,
        required: true,
        content: { key: item.key, versionId: item.contentVersionId },
        exercise: {
          key: item.key,
          versionId: item.exerciseVersionId,
          questionVersionIds: item.questions.map((question) => question.versionId),
        },
      };
    }),
    completion: {
      requiredStepKeys: sourceStations.map((item) => item.key),
      checkpointStepKeys: [lastStation.key],
      requiresFinalMeasurement: false,
      nextCycle: "REVIEW_REQUIRED",
    },
  };
  const validation = validateLearningCycleManifest(manifest);
  if (!validation.valid) {
    throw new Error(`${pathCode}: ${validation.errors.map((item) => item.message).join("; ")}`);
  }

  const candidateCycle = {
    pathCode,
    programId: `${prefix}_PROGRAM`,
    version: route.nextSequence,
    sequence: route.nextSequence,
    routeFamily: route.routeFamily,
    scopeCode: "G8_12",
    title: `${route.routeFamily} rotası · Genişleme adımları ${route.nextSequence}`,
    units: [
      {
        code: `${prefix}_UNIT`,
        steps: sourceStations.map((item) => ({ key: item.key })),
      },
    ],
    manifest,
    nextPathCode: null,
    publicationApproved: () => false,
    authoredStationCategories: sourceStations.map((item) => item.category),
    authoringStatus: "DRAFT_NOT_RELEASED" as const,
    sourceStations,
  } satisfies EducationV2P1ExpansionDraftCycle;
  return candidateCycle;
}

export const EDUCATION_V2_P1_800_DRAFT_CYCLES = routeDrafts.map(buildDraftCycle);

export const EDUCATION_V2_P1_800_CATEGORY_TARGETS_BY_ROUTE = {
  A: EDUCATION_V2_P1_800_CATEGORY_TARGETS,
  B: EDUCATION_V2_P1_800_CATEGORY_TARGETS,
  C: EDUCATION_V2_P1_800_CATEGORY_TARGETS,
  D: EDUCATION_V2_P1_800_CATEGORY_TARGETS,
} as const;
