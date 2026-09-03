export type CurriculumQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE";
export type CognitiveDemand = "RECALL" | "UNDERSTAND" | "INFER";

const BALANCED_MC_CORRECT_POSITIONS = [
  0, 2, 1, 3, 1, 3, 2, 0, 3, 1, 0, 2, 2, 0, 3, 1, 0, 3, 1, 2, 3, 0, 2, 1, 1, 3, 0,
] as const;
let mcQuestionIndex = 0;

export interface CurriculumOption {
  id: string;
  text: string;
  position: number;
}
export interface CurriculumQuestion {
  type: CurriculumQuestionType;
  prompt: string;
  options: CurriculumOption[];
  correctAnswer: Record<string, unknown>;
  explanation: string;
  hint: string;
  difficulty: number;
  cognitiveDemand: CognitiveDemand;
}
export interface CurriculumSource {
  id: string;
  title: string;
  url: string;
  checkedClaim: string;
}
export interface CurriculumTrack {
  id: "main-idea" | "detail" | "inference";
  label: string;
  objective: string;
}
export interface CurriculumContentItem {
  slug: string;
  title: string;
  domain: string;
  topic: string;
  trackId: CurriculumTrack["id"];
  objective: string;
  difficulty: number;
  body: string;
  sourceIds: string[];
  questions: CurriculumQuestion[];
}

const mc = (
  prompt: string,
  optionTexts: string[],
  correct: string,
  explanation: string,
  hint: string,
  difficulty: number,
  cognitiveDemand: CognitiveDemand,
): CurriculumQuestion => ({
  type: "MULTIPLE_CHOICE",
  prompt,
  options: (() => {
    const options = optionTexts.map((text, position) => ({
      id: String.fromCharCode(97 + position),
      text,
      position,
    }));
    const desiredPosition = BALANCED_MC_CORRECT_POSITIONS[mcQuestionIndex++];
    const currentPosition = options.findIndex((option) => option.id === correct);
    if (desiredPosition === undefined || currentPosition === -1) {
      throw new Error(`MC option rebalance planı geçersiz: ${prompt}`);
    }
    const [correctOption] = options.splice(currentPosition, 1);
    options.splice(desiredPosition, 0, correctOption!);
    return options.map((option, position) => ({ ...option, position }));
  })(),
  correctAnswer: {
    type: "MULTIPLE_CHOICE",
    correctOptionIds: [correct],
    allowMultiple: false,
    partialCredit: false,
  },
  explanation,
  hint,
  difficulty,
  cognitiveDemand,
});

const tf = (
  prompt: string,
  answer: boolean,
  explanation: string,
  hint: string,
  difficulty: number,
  cognitiveDemand: CognitiveDemand,
): CurriculumQuestion => ({
  type: "TRUE_FALSE",
  prompt,
  options: [
    { id: "true", text: "Doğru", position: 0 },
    { id: "false", text: "Yanlış", position: 1 },
  ],
  correctAnswer: { type: "TRUE_FALSE", answer },
  explanation,
  hint,
  difficulty,
  cognitiveDemand,
});

export const FIRST_REAL_CURRICULUM_PACK = {
  packId: "OKU-8G8-FIRST-REAL-CURRICULUM",
  title: "OKU+ İlk Gerçek Müfredat Paketi",
  ageBand: "13–17",
  catalog: {
    kind: "PRODUCTION_CANDIDATE",
    levelCodeEnv: "CURRICULUM_PACK_LEVEL_CODE",
    skillCodesEnv: "CURRICULUM_PACK_SKILL_CODES",
    requireNonFixtureRecords: true,
  },
  editorialStatus: "PROMOTION_READY_PENDING_TARGET_DB",
  tracks: [
    {
      id: "main-idea",
      label: "Ana fikri bul",
      objective: "Metnin ana düşüncesini, onu destekleyen önemli ayrıntılardan ayırır.",
    },
    {
      id: "detail",
      label: "Detayları yakala",
      objective: "Metindeki açık bilgileri doğru konum ve ilişkiyle eşleştirir.",
    },
    {
      id: "inference",
      label: "Çıkarım yap",
      objective: "Metindeki kanıtlardan hareketle makul ve metne dayalı sonuç çıkarır.",
    },
  ] satisfies CurriculumTrack[],
  sources: [
    {
      id: "EPA-TREES-VEGETATION",
      title: "Benefits of Trees and Vegetation",
      url: "https://www.epa.gov/heatislands/benefits-trees-and-vegetation",
      checkedClaim: "Bitkiler gölge ve evapotranspirasyon yoluyla yerel sıcaklığı azaltabilir.",
    },
    {
      id: "NASA-EARTH-OBSERVATION",
      title: "Earth Observations",
      url: "https://www.nasa.gov/wp-content/uploads/2023/03/earth-observations-ngs.pdf",
      checkedClaim: "Uydular kara, okyanus ve atmosfer hakkında gözlem verisi toplayabilir.",
    },
    {
      id: "UNESCO-MIL",
      title: "Media and Information Literacy",
      url: "https://www.unesco.org/en/articles/media-and-information-literacy",
      checkedClaim:
        "Bilgiyi bulma, değerlendirme ve üretme medya ve bilgi okuryazarlığının parçalarıdır.",
    },
    {
      id: "NHLBI-SLEEP-WAKE",
      title: "How Sleep Works — Your Sleep/Wake Cycle",
      url: "https://www.nhlbi.nih.gov/health/sleep/sleep-wake-cycle",
      checkedClaim: "Işık-karanlık döngüsü ve yapay ışık, uyku-uyanıklık döngüsünü etkileyebilir.",
    },
    {
      id: "USDA-POLLINATORS",
      title: "Pollinator Activity Book",
      url: "https://www.fsa.usda.gov/Internet/FSA_File/pollinator_activity_book.pdf",
      checkedClaim: "Tozlaşmada arıların yanı sıra farklı hayvan grupları da rol oynayabilir.",
    },
    {
      id: "USDA-SOIL-ORGANIC-MATTER",
      title: "Role of Organic Matter",
      url: "https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/role-of-organic-matter",
      checkedClaim:
        "Organik madde, toprağın su tutma ve suyun toprağa sızma özellikleriyle ilişkilidir.",
    },
    {
      id: "USGS-MAP-GENERALIZATION",
      title: "Generalization",
      url: "https://www.usgs.gov/centers/cegis/science/generalization",
      checkedClaim:
        "Haritalar farklı ölçeklerde okunabilir kalmak için ayrıntıları genelleyebilir.",
    },
  ] satisfies CurriculumSource[],
  contents: [
    {
      slug: "golgeyi-olcmek",
      title: "Gölgeyi Ölçmek",
      domain: "Doğa ve çevre",
      topic: "Şehir ısısı ve okul bahçesi gözlemi",
      trackId: "main-idea",
      objective:
        "Öğrenci, bir gözlem ekibinin ölçüm yapma amacını ve kanıt toplama sürecini açıklar.",
      difficulty: 0.45,
      sourceIds: ["EPA-TREES-VEGETATION"],
      body: [
        "Okulun arka bahçesindeki beton zemin, öğleden sonra öğrencilerin dikkatini çekecek kadar ısınıyordu. Fen kulübü bu gözlemi bir tahmin olarak bırakmak yerine küçük bir ölçüm planı hazırladı. Aynı türden iki termometreden biri doğrudan güneş alan betona, diğeri ise ağacın gölgesindeki toprağa yerleştirildi. Ekip, ölçümleri üç farklı saatte kaydetti ve her seferinde termometreleri aynı yerlere koydu.",
        "İlk sonuçlar gölgedeki toprağın daha serin olduğunu gösterdi. Öğrenciler bu farkı yalnızca “ağaçlar havayı soğutur” cümlesiyle açıklamadı. Gölgenin yüzeyi doğrudan güneş ışığından koruduğunu, bitkilerin kökleriyle aldığı suyun bir bölümünü yapraklarından atmosfere verdiğini de not ettiler. Böylece gözlemlerini, olası açıklamalarla birlikte raporladılar.",
        "Ekip, tek bir günün ölçümünün kesin bir hüküm olmadığını biliyordu. Yağmur, rüzgâr ve ölçüm saatleri değişirse sonuçlar da değişebilirdi. Bu nedenle raporun sonunda yeni günlerde, farklı zeminlerde ve daha çok noktada ölçüm yapmayı önerdiler. Onlar için önemli olan yalnızca serin bir köşe bulmak değil, iddiayı kanıtla sınamaktı.",
      ].join("\n\n"),
      questions: [
        mc(
          "Metnin ana düşüncesi aşağıdakilerden hangisidir?",
          [
            "Beton zeminler her zaman ağaçlardan daha sıcaktır.",
            "Bir gözlemi anlamlandırmak için düzenli ölçüm ve kanıt karşılaştırması gerekir.",
            "Fen kulübü yalnızca gölgede oynanabilecek oyunlar aramıştır.",
            "Yağmur, okul bahçesindeki bütün ölçümleri geçersiz kılar.",
          ],
          "b",
          "Ekip, sıcaklık farkını düzenli ölçümlerle incelemiş ve tek gözlem yerine kanıta dayalı bir açıklama kurmuştur.",
          "Son paragrafta ekibin neden yeni ölçümler önermesine bak.",
          0.45,
          "UNDERSTAND",
        ),
        mc(
          "İki termometre hangi yüzeylere yerleştirilmiştir?",
          [
            "Biri çatıya, diğeri sınıf penceresine.",
            "Biri çimenlere, diğeri oyun alanındaki suya.",
            "Biri güneş alan betona, diğeri gölgedeki toprağa.",
            "Biri ağacın yaprağına, diğeri rüzgâr ölçerine.",
          ],
          "c",
          "İlk paragraf ölçüm noktalarını güneş alan beton ve ağacın gölgesindeki toprak olarak verir.",
          "İlk paragraftaki iki ölçüm noktasını bul.",
          0.35,
          "RECALL",
        ),
        mc(
          "Ekip neden tek bir günün ölçümünü kesin hüküm olarak görmemiştir?",
          [
            "Termometreleri kullanmayı bilmedikleri için.",
            "Hava koşulları ve ölçüm koşulları değişebileceği için.",
            "Ağaçların gölge oluşturmadığını düşündükleri için.",
            "Betonun sıcaklığını ölçmek istemedikleri için.",
          ],
          "b",
          "Yağmur, rüzgâr ve saat değişirse sonuçların da değişebileceği söylenir.",
          "Son paragraftaki yağmur ve rüzgâr örneklerini düşün.",
          0.6,
          "INFER",
        ),
        tf(
          "Ekip, gözlemlerini açıklarken yalnızca kişisel tahminlere dayanmıştır.",
          false,
          "Ekip tahmini ölçümle sınamış, sonuçlarını kaydetmiş ve açıklamasını kanıtlarla ilişkilendirmiştir.",
          "İlk paragrafta tahmini nasıl test ettiklerini bul.",
          0.4,
          "UNDERSTAND",
        ),
      ],
    },
    {
      slug: "yukaridan-bakinca",
      title: "Yukarıdan Bakınca",
      domain: "Bilim ve teknoloji",
      topic: "Uydu verileri ve Dünya gözlemi",
      trackId: "main-idea",
      objective:
        "Öğrenci, uzaktan gözlem verilerinin yeryüzündeki değişimleri anlamaya nasıl yardım ettiğini açıklar.",
      difficulty: 0.5,
      sourceIds: ["NASA-EARTH-OBSERVATION"],
      body: [
        "Mina, okul projesi için aynı gölün farklı aylarda çekilmiş uydu görüntülerini yan yana koydu. İlk bakışta görüntüler yalnızca renkli haritalar gibi görünüyordu. Birinde kıyıya yakın alanlar daha koyu, diğerinde daha açık görünüyordu. Mina hemen “Göl küçülmüş” demek yerine görüntülerin hangi tarihlerde ve hangi koşullarda elde edildiğini araştırdı.",
        "Uydu gözlemleri, Dünya’nın kara, su ve atmosfer gibi bölümleri hakkında geniş alanlardan bilgi toplamaya yarayabilir. Bu veriler tek başına yerdeki her ayrıntıyı açıklamaz; ancak farklı zamanlardaki görüntüler karşılaştırıldığında değişim işaretleri görülebilir. Mina, gölün çevresindeki bitki örtüsünü ve su çizgisini ayrı ayrı işaretledi. Bulutlu bir günün görüntüsünde bazı bölgelerin neden seçilemediğini de raporuna ekledi.",
        "Sunumda arkadaşlarına renk farkının tek bir anlama gelmeyebileceğini anlattı. Mevsim, ışık, bulutlar ve görüntünün işlenme biçimi sonucu etkileyebilirdi. Onun vardığı sonuç şuydu: Yukarıdan bakmak, yeryüzünü daha geniş bir çerçevede görmeyi sağlar; doğru yorum için görüntünün tarihi ve nasıl üretildiği de bilinmelidir.",
      ].join("\n\n"),
      questions: [
        mc(
          "Mina görüntülere bakınca neden hemen “Göl küçülmüş” dememiştir?",
          [
            "Uydu görüntülerini hiç beğenmediği için.",
            "Tarih ve görüntü koşullarını kontrol etmeden renk farkını yorumlamak istemediği için.",
            "Gölün çevresinde hiç bitki olmadığını düşündüğü için.",
            "Sunum yapmayı ertelemek istediği için.",
          ],
          "b",
          "Mina önce tarihleri ve görüntü koşullarını araştırmış, renk farkını doğrudan tek sonuca bağlamamıştır.",
          "İlk paragrafta Mina’nın ilk tepkisinden sonraki adımına bak.",
          0.5,
          "INFER",
        ),
        mc(
          "Uydu verileri metne göre hangi işe yarayabilir?",
          [
            "Geniş alanlardaki değişim işaretlerini karşılaştırmaya.",
            "Yerdeki her ayrıntıyı ek bilgi olmadan açıklamaya.",
            "Bulutlu günlerde bütün görüntüleri daha net yapmaya.",
            "Mevsimlerin etkisini tamamen ortadan kaldırmaya.",
          ],
          "a",
          "Uydu verileri geniş alanlardan bilgi toplar ve farklı zamanlardaki değişimleri karşılaştırmaya yardım eder.",
          "İkinci paragrafta “geniş alan” ve “karşılaştırma” ifadelerini ara.",
          0.45,
          "UNDERSTAND",
        ),
        mc(
          "Mina’nın sunumundaki temel uyarı nedir?",
          [
            "Renk farkları her zaman aynı nedeni gösterir.",
            "Görüntüleri yorumlarken tarih ve üretim koşulları dikkate alınmalıdır.",
            "Uydu görüntüleri yalnızca göller için kullanılabilir.",
            "Yukarıdan gözlem yapmak yerdeki ölçümleri gereksiz kılar.",
          ],
          "b",
          "Son cümle doğru yorum için görüntünün tarihinin ve nasıl üretildiğinin bilinmesi gerektiğini açıklar.",
          "Metnin son cümlesi bir koşul söylüyor.",
          0.55,
          "UNDERSTAND",
        ),
        tf(
          "Metin, tek bir uydu görüntüsünün bütün değişim nedenlerini kesin olarak açıkladığını savunur.",
          false,
          "Metin, görüntünün her ayrıntıyı açıklamayacağını ve renk farkının birden fazla nedeni olabileceğini belirtir.",
          "İkinci ve üçüncü paragraflardaki sınırlamaları kontrol et.",
          0.45,
          "UNDERSTAND",
        ),
      ],
    },
    {
      slug: "kutuphane-rafindaki-harita",
      title: "Kütüphane Rafındaki Harita",
      domain: "Kültür ve günlük yaşam",
      topic: "Bilgi kaynaklarını karşılaştırma",
      trackId: "main-idea",
      objective:
        "Öğrenci, bir bilgi iddiasını değerlendirirken başlık, kaynak ve destekleyici kanıt arasındaki ilişkiyi fark eder.",
      difficulty: 0.55,
      sourceIds: ["UNESCO-MIL"],
      body: [
        "Okul kütüphanesinde “Bir haber nasıl okunur?” başlıklı küçük bir sergi açıldı. Sergide aynı olayla ilgili iki haber, bir kitap katalog kaydı ve bir araştırma notu vardı. İlk haberin başlığı çok iddialıydı; fakat metin içinde olayın tarihi ve kaynağı açıkça belirtilmiyordu. İkinci haber daha sakindi ve farklı kişilerin açıklamalarını karşılaştırıyordu.",
        "Ece, en etkileyici başlığı seçmek yerine her kaynağın ne sunduğunu bir tabloya yazdı. “Bu bilgi nereden geliyor?”, “Yazar hangi kanıtı gösteriyor?” ve “Başka bir kaynak aynı noktayı destekliyor mu?” sorularını kullandı. Katalog kaydının bir haber olmadığını, kitabın adı, yazarı ve konusunu bulmaya yarayan ayrı bir araç olduğunu da fark etti.",
        "Serginin sonunda Ece tek bir kaynağı hemen doğru ya da yanlış ilan etmedi. Kaynakların amacı, kanıtı ve eksik bıraktığı noktalar farklı olabilirdi. Ona göre iyi okuma, yalnızca metni anlamak değil, bilginin nasıl üretildiğini ve hangi dayanakla sunulduğunu da incelemekti.",
      ].join("\n\n"),
      questions: [
        mc(
          "Ece kaynakları karşılaştırırken hangi soruyu kullanmamıştır?",
          [
            "Bu bilgi nereden geliyor?",
            "Yazar hangi kanıtı gösteriyor?",
            "Başka bir kaynak aynı noktayı destekliyor mu?",
            "Bu başlık en uzun başlık mı?",
          ],
          "d",
          "Metin Ece’nin kullandığı üç soruyu verir; başlığın uzunluğunu karşılaştırdığı söylenmez.",
          "İkinci paragraftaki tırnak içindeki soruları tek tek kontrol et.",
          0.4,
          "RECALL",
        ),
        mc(
          "Kitap katalog kaydının işlevi nedir?",
          [
            "Bir haberin doğruluğunu tek başına kanıtlamak.",
            "Kitabın adı, yazarı ve konusu hakkında bilgi bulmaya yardım etmek.",
            "İki haberi aynı başlıkta birleştirmek.",
            "Araştırma notundaki eksikleri silmek.",
          ],
          "b",
          "Katalog kaydı haber değildir; kitabın adı, yazarı ve konusu hakkında bilgi bulmaya yarar.",
          "Katalog kaydıyla ilgili cümleyi bul.",
          0.4,
          "RECALL",
        ),
        mc(
          "Ece’nin tek bir kaynağı hemen doğru ya da yanlış ilan etmemesi neyi gösterir?",
          [
            "Kaynakların amaç ve kanıtlarını birlikte değerlendirdiğini.",
            "Hiçbir kaynağın okunmaya değer olmadığını düşündüğünü.",
            "Yalnızca başlıklara baktığını.",
            "Katalog kayıtlarını haber sandığını.",
          ],
          "a",
          "Son paragraf Ece’nin amaç, kanıt ve eksik bırakılan noktaları birlikte düşündüğünü gösterir.",
          "Son paragraftaki “amaç, kanıt ve eksik” üçlüsüne bak.",
          0.6,
          "INFER",
        ),
        tf(
          "Metne göre en iddialı başlığa sahip haber mutlaka en güvenilir haberdir.",
          false,
          "İddialı başlığın yanında tarih ve kaynak açık değilse başlık tek başına yeterli değildir.",
          "İlk paragrafta iddialı başlıkla metnin dayanağı nasıl karşılaştırılıyor?",
          0.5,
          "INFER",
        ),
      ],
    },
    {
      slug: "aksam-isigi-ve-beden-saati",
      title: "Akşam Işığı ve Beden Saati",
      domain: "Sağlık ve iyi yaşam",
      topic: "Işık-karanlık döngüsü ve uyku",
      trackId: "detail",
      objective:
        "Öğrenci, metinde verilen ışık, karanlık ve uyku ilişkisini kanıt cümleleriyle eşleştirir.",
      difficulty: 0.5,
      sourceIds: ["NHLBI-SLEEP-WAKE"],
      body: [
        "İnsan bedeni, günün aydınlık ve karanlık döngüsüne uyum sağlayan yaklaşık yirmi dört saatlik bir ritim taşır. Bu ritim uyku ve uyanıklık zamanlamasının yanı sıra bazı hormonların salınmasını da etkiler. Akşam karanlığı, beynin geceye hazırlanmasına yardım eden işaretlerden biridir.",
        "Deniz, ödevini bitirdikten sonra odasının ışığını açıp telefonuna bakmaya devam ediyordu. Bir akşam bunu gözlemlemek için küçük bir günlük tuttu: ışığı kapattığı saat, ekranı bıraktığı saat ve uykuya daldığını düşündüğü saat. Günlüğü, çok parlak yapay ışık altında kaldığı akşamlarda yatağa geçse bile zihninin daha uzun süre meşgul olduğunu gösterdi. Bu kayıt tek başına tıbbi bir sonuç değildi; yalnızca kendi alışkanlığı hakkında bir gözlemdi.",
        "Deniz, uyku hakkında kesin bir karar vermek yerine düzenli bir akşam rutini denemeye karar verdi. Telefonunu yatağın yanında tutmadı, odasını daha loş yaptı ve birkaç hafta boyunca günlüğünü sürdürdü. Böylece bir öneriyi körü körüne uygulamak yerine, davranışını izleyip değişimi not etmeyi seçti.",
      ].join("\n\n"),
      questions: [
        mc(
          "Metne göre ışık-karanlık döngüsü hangi işlevle ilişkilidir?",
          [
            "Uyku ve uyanıklık zamanlamasıyla.",
            "Telefonun pilinin ne kadar dayanacağıyla.",
            "Odadaki mobilyaların rengiyle.",
            "Ödevin hangi derse ait olduğuyla.",
          ],
          "a",
          "İlk paragraf ritmin uyku ve uyanıklık zamanlamasını etkilediğini açıkça söyler.",
          "İlk paragrafta ritmin etkilediği işlevleri bul.",
          0.35,
          "RECALL",
        ),
        mc(
          "Deniz günlüğüne hangi bilgileri yazmıştır?",
          [
            "Yalnızca odasının sıcaklığını.",
            "Işığı kapattığı, ekranı bıraktığı ve uykuya daldığını düşündüğü saatleri.",
            "Her gün kaç sayfa kitap okuduğunu.",
            "Telefonundaki uygulamaların adlarını.",
          ],
          "b",
          "İkinci paragraf günlüğündeki üç zaman bilgisini açıkça listeler.",
          "“Küçük bir günlük tuttu” cümlesinden sonraki listeyi bul.",
          0.35,
          "RECALL",
        ),
        mc(
          "Deniz’in gözlemini tıbbi sonuç olarak görmemesi neden önemlidir?",
          [
            "Tek kişilik bir kaydın yalnızca kendi alışkanlığı hakkında fikir vermesi nedeniyle.",
            "Günlük tutmanın hiçbir işe yaramaması nedeniyle.",
            "Akşamları ışığın hiç değişmemesi nedeniyle.",
            "Telefon kullanımının her zaman zararsız olması nedeniyle.",
          ],
          "a",
          "Metin, günlüğün Deniz’in kendi alışkanlığı hakkında bir gözlem olduğunu ve tıbbi sonuç olmadığını belirtir.",
          "İkinci paragrafın son cümlesi gözlemin sınırını açıklıyor.",
          0.65,
          "INFER",
        ),
        tf(
          "Deniz, davranışını değiştirdikten sonra gözlem yapmayı tamamen bırakmıştır.",
          false,
          "Yeni rutinini denerken günlüğünü birkaç hafta sürdürmeye devam etmiştir.",
          "Son paragrafta günlüğü sürdürüp sürdürmediğine bak.",
          0.45,
          "RECALL",
        ),
      ],
    },
    {
      slug: "cicegin-ziyaretcileri",
      title: "Çiçeğin Ziyaretçileri",
      domain: "Doğa ve yaşam",
      topic: "Tozlaşma ve tozlaştırıcılar",
      trackId: "detail",
      objective:
        "Öğrenci, tozlaşma sürecindeki canlıların ve çiçek ziyaretlerinin metindeki rollerini ayırt eder.",
      difficulty: 0.45,
      sourceIds: ["USDA-POLLINATORS"],
      body: [
        "Okul bahçesindeki çiçekli alan, yalnızca renkleriyle değil, gün içinde değişen ziyaretçileriyle de dikkat çekiyordu. Arılar nektar ve polen toplamak için çiçeklere konuyor, bu sırada vücutlarına yapışan polen tanelerinin bir bölümü başka çiçeklere taşınıyordu. Bahçede kelebekler, bazı sinekler ve küçük böcekler de görülüyordu.",
        "Elif’in grubu bu canlılara “çiçek yardımcıları” adını verdi; ancak hepsinin aynı işi aynı biçimde yaptığını varsaymadı. Gözlem çizelgesinde ziyaretçinin türünü, hangi çiçeğe konduğunu ve ne kadar süre kaldığını yazdılar. Bir canlıyı görmemeleri, o canlının bahçeye hiç uğramadığı anlamına gelmeyebilirdi; grup yalnızca kendi gözlem saatleri içinde kanıt toplamıştı.",
        "Çizelgeleri, çiçekler ile ziyaretçileri arasında bir ilişki olabileceğini gösterdi. Yine de öğrenciler, birkaç günlük gözlemle bütün bahçedeki tozlaşmayı ölçtüklerini iddia etmedi. Daha uzun süre, daha çok çiçek ve farklı saatler içeren yeni bir çalışma planladılar.",
      ].join("\n\n"),
      questions: [
        mc(
          "Arılar çiçekleri ziyaret ederken polen nasıl taşınabilir?",
          [
            "Arının vücuduna yapışan polen başka çiçeklere taşınabilir.",
            "Çiçekler poleni toprağın altına gönderir.",
            "Kelebekler arıların taşıdığı poleni siler.",
            "Polen yalnızca rüzgârla hareket eder.",
          ],
          "a",
          "İlk paragraf, arının vücuduna yapışan polenin başka çiçeklere taşınabildiğini anlatır.",
          "Arının çiçeğe konması ile başka çiçeğe geçmesi arasındaki cümleleri izle.",
          0.4,
          "RECALL",
        ),
        mc(
          "Elif’in grubu gözlem çizelgesine hangisini yazmıştır?",
          [
            "Çiçeklerin satış fiyatını.",
            "Ziyaretçinin türünü, konduğu çiçeği ve kalma süresini.",
            "Bahçedeki öğrencilerin sınav notlarını.",
            "Her çiçeğin kök uzunluğunu.",
          ],
          "b",
          "İkinci paragraf çizelgedeki üç gözlem alanını açıkça verir.",
          "“Gözlem çizelgesinde” ifadesinden sonraki üç unsuru bul.",
          0.35,
          "RECALL",
        ),
        mc(
          "Grup neden bir canlıyı görmemeyi onun hiç gelmediğinin kanıtı saymamıştır?",
          [
            "Gözlem yalnızca belirli saatlerde yapılmıştır.",
            "Çiçekler gün içinde hiç açılmamıştır.",
            "Polen yalnızca gece taşınır.",
            "Bahçede hiç çizelge tutulmamıştır.",
          ],
          "a",
          "Grup yalnızca kendi gözlem saatleri içinde kanıt toplamıştır; gözlem dışı zamanlar belirsizdir.",
          "İkinci paragrafın sonundaki “gözlem saatleri” ifadesine bak.",
          0.6,
          "INFER",
        ),
        tf(
          "Öğrenciler birkaç günlük gözlemle bütün bahçedeki tozlaşmayı ölçtüklerini iddia etmiştir.",
          false,
          "Öğrenciler böyle bir iddiada bulunmamış, daha uzun ve kapsamlı bir çalışma önermiştir.",
          "Son paragrafta öğrencilerin sonuçlarını nasıl sınırladığına bak.",
          0.45,
          "RECALL",
        ),
      ],
    },
    {
      slug: "topragin-sunger-gibi-davranmasi",
      title: "Toprağın Sünger Gibi Davranması",
      domain: "Bilim ve çevre",
      topic: "Toprağın su tutması ve organik madde",
      trackId: "detail",
      objective:
        "Öğrenci, toprağın su tutma kapasitesini etkileyen unsurları ve bitkilerin kullanabildiği su ayrımını açıklar.",
      difficulty: 0.55,
      sourceIds: ["USDA-SOIL-ORGANIC-MATTER"],
      body: [
        "Yağmurdan sonra okulun iki bahçesinde farklı manzaralar oluştu. Kumlu bölümde su hızla aşağı süzülürken, yapısı daha zengin olan bölümde toprak bir süre nemli kaldı. Öğretmen bu farkı “toprak bir sünger gibidir” benzetmesiyle anlattı; fakat her süngerin aynı miktarda su tutmadığını da ekledi.",
        "Toprağın su tutma özelliği; taneciklerin yapısı, sıkışma durumu ve organik madde miktarı gibi özelliklerle ilişkilidir. Organik madde, toprağın suyu tutmasına ve suyun içeri sızmasına yardım edebilir. Ancak toprakta bulunan suyun tamamı bitki köklerinin kullanabileceği durumda değildir. Bu nedenle “toprakta çok su var” demek, bitkinin bütün suya ulaşabildiği anlamına gelmez.",
        "Öğrenciler iki bölümden küçük örnekler aldı ve suyun ne kadar sürede süzüldüğünü kaydetti. Sonuçlarını genellemeden önce örnek sayısını artırmaları gerektiğini fark ettiler. Deney, toprağın yalnızca bir zemin değil, suyun hareketini etkileyen canlı ve cansız bileşenleri olan bir ortam olduğunu düşünmelerini sağladı.",
      ].join("\n\n"),
      questions: [
        mc(
          "Öğretmen neden toprağı süngere benzetmiştir?",
          [
            "Toprağın suyu tutup bir süre nemli kalabilmesini anlatmak için.",
            "Toprağın her zaman aynı miktarda su tuttuğunu göstermek için.",
            "Kumlu bölümde hiç su bulunmadığını söylemek için.",
            "Bitki köklerinin süngerden oluştuğunu açıklamak için.",
          ],
          "a",
          "Benzetme, bazı toprağın suyu bir süre tutabilmesini anlatır; hemen ardından her toprağın aynı olmadığı açıklanır.",
          "İlk paragraftaki iki bahçenin su sonrası farkını düşün.",
          0.45,
          "UNDERSTAND",
        ),
        mc(
          "Metne göre toprağın su tutma özelliği hangi unsurlarla ilişkilidir?",
          [
            "Taneciklerin yapısı, sıkışma durumu ve organik madde miktarıyla.",
            "Yalnızca bahçenin duvar rengiyle.",
            "Sadece yağmurun ses düzeyiyle.",
            "Öğrencilerin örnekleri etiketlemesiyle.",
          ],
          "a",
          "İkinci paragraf bu üç özelliği birlikte sıralar.",
          "İkinci paragrafta “özelliği” kelimesinden sonra gelen listeye bak.",
          0.4,
          "RECALL",
        ),
        mc(
          "“Toprakta çok su var” cümlesi neden tek başına yeterli değildir?",
          [
            "Suyun tamamı bitki köklerinin kullanabileceği durumda olmayabilir.",
            "Bitkilerin suya hiç ihtiyacı yoktur.",
            "Organik madde suyun toprağa girmesini engeller.",
            "Kumlu toprak her zaman suyla kaplıdır.",
          ],
          "a",
          "Metin, topraktaki bütün suyun bitki köklerinin ulaşabileceği biçimde olmadığını belirtir.",
          "İkinci paragrafın son iki cümlesini birlikte oku.",
          0.55,
          "UNDERSTAND",
        ),
        tf(
          "Öğrenciler, iki küçük örnekten hareketle bütün topraklar için kesin bir sonuç çıkarmıştır.",
          false,
          "Öğrenciler genelleme yapmadan önce örnek sayısını artırmaları gerektiğini fark etmiştir.",
          "Son paragrafta örnek sayısıyla ilgili cümleyi bul.",
          0.45,
          "RECALL",
        ),
      ],
    },
    {
      slug: "haritanin-sessiz-secimi",
      title: "Haritanın Sessiz Seçimi",
      domain: "Coğrafya ve teknoloji",
      topic: "Ölçek, sembol ve harita genellemesi",
      trackId: "inference",
      objective:
        "Öğrenci, bir haritanın ayrıntıları seçerek göstermesinden hareketle harita ile gerçek alan arasındaki farkı çıkarır.",
      difficulty: 0.6,
      sourceIds: ["USGS-MAP-GENERALIZATION"],
      body: [
        "Arda, mahallesini gösteren iki dijital haritayı açtı. Haritalardan biri çok yaklaştırılmıştı; sokak köşeleri, küçük park ve birkaç bina seçilebiliyordu. Diğeri daha geniş bir bölgeyi gösteriyor, fakat aynı ayrıntıların çoğunu göstermiyordu. Arda önce ikinci haritanın eksik çizildiğini düşündü.",
        "Öğretmeni, haritanın bir fotoğraf olmadığını hatırlattı. Harita, belirli bir alanı ve o alanla ilgili bilgileri okunabilir biçimde göstermek için semboller ve seçimler kullanır. Harita uzaklaştırıldığında çok fazla ayrıntı üst üste binebilir. Bu nedenle bazı yollar, binalar ya da küçük noktalar gösterilmeyebilir; daha önemli görülen özellikler seçilip sadeleştirilebilir.",
        "Arda iki görüntüyü karşılaştırınca ikinci haritanın “yanlış” değil, farklı bir kullanım amacı taşıdığını anladı. Yakın harita adres bulmaya, geniş harita ise mahallenin çevreyle ilişkisini görmeye daha uygundu. Bir haritada bir şeyi görememek, o şeyin gerçekte hiç var olmadığı sonucunu tek başına desteklemiyordu.",
      ].join("\n\n"),
      questions: [
        mc(
          "Arda ilk olarak geniş bölgeyi gösteren harita hakkında ne düşünmüştür?",
          [
            "Eksik çizildiğini düşünmüştür.",
            "Adres bulmak için en uygun harita olduğunu düşünmüştür.",
            "Bir fotoğraf olduğunu düşünmüştür.",
            "Mahallenin dışını göstermediğini düşünmüştür.",
          ],
          "a",
          "İlk paragraf Arda’nın ikinci haritanın eksik çizildiğini düşündüğünü söyler.",
          "İlk paragrafın son cümlesine bak.",
          0.35,
          "RECALL",
        ),
        mc(
          "Harita uzaklaştırıldığında neden bazı ayrıntılar gösterilmeyebilir?",
          [
            "Ayrıntılar üst üste binip haritanın okunmasını zorlaştırabileceği için.",
            "Gerçek alandaki yollar kaybolduğu için.",
            "Haritalar hiç sembol kullanmadığı için.",
            "Yakınlaştırılmış haritalar daha az alan gösterdiği için.",
          ],
          "a",
          "Geniş görünümde ayrıntılar üst üste binebilir; bu yüzden bazı özellikler sadeleştirilebilir.",
          "İkinci paragrafta “üst üste” ifadesinin geçtiği cümleyi bul.",
          0.5,
          "UNDERSTAND",
        ),
        mc(
          "Bir haritada bir özelliği görememek metne göre hangi sonucu tek başına desteklemez?",
          [
            "O özelliğin gerçekte hiç var olmadığı sonucunu.",
            "Haritanın belirli bir amaçla hazırlandığı sonucunu.",
            "Haritalarda seçim yapılabildiği sonucunu.",
            "Yakın ve geniş görünümün farklı olabildiği sonucunu.",
          ],
          "a",
          "Son cümle, haritada görünmeyen bir şeyin gerçekte hiç olmadığı sonucunun çıkarılamayacağını belirtir.",
          "Metnin son cümlesi “tek başına” hangi sonuca izin vermiyor?",
          0.65,
          "INFER",
        ),
        tf(
          "Arda, iki haritanın farklı amaçlara daha uygun olabileceğini anlamıştır.",
          true,
          "Yakın harita adres bulmaya, geniş harita ise çevreyle ilişkiyi görmeye daha uygundur.",
          "Son paragrafta iki haritanın kullanım amaçlarını karşılaştır.",
          0.45,
          "INFER",
        ),
      ],
    },
    {
      slug: "mesajdaki-bosluk",
      title: "Mesajdaki Boşluk",
      domain: "Psikoloji ve dijital yaşam",
      topic: "Yazılı iletişimde bağlam ve çıkarım",
      trackId: "inference",
      objective:
        "Öğrenci, kısa bir dijital mesajdan çıkarım yaparken metinde bulunan ve bulunmayan ipuçlarını ayırır.",
      difficulty: 0.65,
      sourceIds: ["UNESCO-MIL"],
      body: [
        "Selin, grup çalışmasının dosyasını arkadaşlarına gönderdi. Kısa süre sonra Mert’ten yalnızca “Peki.” mesajı geldi. Selin bu cevabı önce kızgınlık olarak yorumladı. Oysa mesajda Mert’in ses tonu, yüz ifadesi ya da o sırada ne yaptığı görünmüyordu. Aynı kelime farklı durumlarda onay, şaşkınlık veya konuşmayı bitirme isteği anlamına gelebilirdi.",
        "Selin, kendi yorumunu kesin gerçek gibi yazmak yerine Mert’e “Dosyada değiştirmemi istediğin bir yer var mı?” diye sordu. Mert, o sırada otobüse yetişmeye çalıştığını ve mesajı aceleyle yazdığını söyledi. Asıl düşüncesi dosyayı kabul etmekti. Selin’in ilk tahmini tamamen anlamsız değildi; kısa ve noktalı cevap ona öyle hissettirmişti. Fakat bu tahmin, karşı tarafın niyetine dair kesin bir kanıt da değildi.",
        "Grup daha sonra önemli kararları yalnızca tek kelimelik cevaplarla bırakmamaya karar verdi. Gerekirse kısa bir açıklama ekleyecek, emin olmadıkları bir mesajı soru sorarak netleştireceklerdi. Selin, dijital iletişimde boşlukları kendi varsayımlarıyla doldurmanın kolay olduğunu; dikkatli okumanın ise kanıtla tahmini birbirinden ayırmayı gerektirdiğini fark etti.",
      ].join("\n\n"),
      questions: [
        mc(
          "Selin, “Peki.” mesajını neden kesin olarak kızgınlık kanıtı saymamıştır?",
          [
            "Mesajda ses tonu ve yüz ifadesi gibi bağlam ipuçları bulunmadığı için.",
            "Mert’in hiç mesaj göndermediği için.",
            "Dosyanın henüz hazırlanmadığı için.",
            "Tek kelimelik mesajların her zaman olumlu olduğu için.",
          ],
          "a",
          "Yazılı mesajda ses tonu, yüz ifadesi ve o anki durum görünmediği için anlam kesinleşmez.",
          "İlk paragrafta mesajda görünmeyen ipuçlarını ara.",
          0.55,
          "UNDERSTAND",
        ),
        mc(
          "Mert’in gerçek durumu neymiş?",
          [
            "Dosyaya kızmış ve çalışmayı bırakmış.",
            "Otobüse yetişmeye çalıştığı için mesajı aceleyle yazmış.",
            "Mesajı Selin yerine başka birine göndermiş.",
            "Dosyayı hiç açmamış ve cevap vermemiş.",
          ],
          "b",
          "İkinci paragraf Mert’in otobüse yetişmeye çalıştığını ve bu yüzden aceleyle yazdığını söyler.",
          "Selin açıklama isteyince Mert ne söylemiş?",
          0.35,
          "RECALL",
        ),
        mc(
          "Metnin sonunda grubun benimsediği davranış hangisidir?",
          [
            "Belirsiz mesajları açıklama istemeden yorumlamak.",
            "Önemli kararları yalnızca tek kelimelik cevaplarla vermek.",
            "Emin olmadıkları mesajları soru sorarak netleştirmek.",
            "Dijital iletişimi tamamen bırakmak.",
          ],
          "c",
          "Grup gerektiğinde açıklama eklemeye ve soru sorarak netleştirmeye karar verir.",
          "Son paragraftaki “gerekirse” ve “netleştireceklerdi” ifadelerine bak.",
          0.55,
          "UNDERSTAND",
        ),
        tf(
          "Selin’in ilk tahmini, Mert’in niyeti hakkında kesin kanıt olarak sunulmuştur.",
          false,
          "Tahmin anlaşılabilir olsa da karşı tarafın niyeti için kesin kanıt değildir.",
          "İkinci paragrafta “kesin bir kanıt” ifadesinin çevresine bak.",
          0.6,
          "INFER",
        ),
      ],
    },
    {
      slug: "eski-fotografin-yanindaki-not",
      title: "Eski Fotoğrafın Yanındaki Not",
      domain: "Tarih ve kültür",
      topic: "Arşiv belgesini bağlamıyla okuma",
      trackId: "inference",
      objective:
        "Öğrenci, bir tarihsel görseli yorumlarken görsel kanıt ile arşiv bağlamını birlikte kullanır.",
      difficulty: 0.7,
      sourceIds: ["UNESCO-MIL"],
      body: [
        "Tarih kulübü, okulun eski mezunlarından kalmış siyah beyaz bir fotoğraf buldu. Fotoğrafta bir meydan, birkaç dükkân ve ellerinde pankart taşıyan insanlar vardı. Görüntü ilgi çekiciydi; ancak fotoğrafın ne zaman ve hangi olay sırasında çekildiği ilk bakışta belli değildi. Öğrenciler yalnızca insanların yüzlerine bakarak uzun bir hikâye kurmanın riskli olacağını fark etti.",
        "Fotoğrafın arkasında kurşun kalemle yazılmış kısa bir not vardı: “Bahar şenliği, 1978, eski istasyon önü.” Kulüp bu notu başlangıç ipucu olarak aldı, kesin kanıt olarak değil. Kütüphane kataloğundaki yer adı kaydıyla okulun yıllıklarını karşılaştırdılar. Yıllıkta aynı meydanda düzenlenen bir öğrenci etkinliğinden söz ediliyordu; fakat pankartların ne anlama geldiğini açıklamıyordu.",
        "Öğrenciler sunumlarında fotoğrafı, arka yüzündeki notu ve yıllık kaydını ayrı ayrı belirtti. Bazı soruların hâlâ açık kaldığını da yazdılar. Onlara göre tarihsel bir belgeyi dikkatli okumak, gördüğünü inkâr etmek değil; gördüğünü bağlam, kaynak ve belirsizlikle birlikte ifade etmekti.",
      ].join("\n\n"),
      questions: [
        mc(
          "Öğrenciler fotoğraftaki yüzlere bakarak neden uzun bir hikâye kurmamıştır?",
          [
            "Görselin zamanı ve olayı tek başına açıkça göstermediği için.",
            "Fotoğraf siyah beyaz olduğu için.",
            "Meydanda hiç insan bulunmadığı için.",
            "Kütüphane kataloğu olmadığı için.",
          ],
          "a",
          "Fotoğrafın ne zaman ve hangi olay sırasında çekildiği ilk bakışta belli değildir.",
          "İlk paragrafta fotoğraf hakkında hangi bilgilerin eksik olduğunu bul.",
          0.55,
          "INFER",
        ),
        mc(
          "Fotoğrafın arkasındaki not öğrenciler için nasıl bir işlev görmüştür?",
          [
            "Araştırmayı başlatan bir ipucu olmuştur.",
            "Bütün soruları kesin olarak cevaplamıştır.",
            "Yıllık kaydının yerine geçmiştir.",
            "Pankartların anlamını açıklamıştır.",
          ],
          "a",
          "Kulüp notu başlangıç ipucu olarak kullanmış, kesin kanıt saymamış ve başka kayıtlarla karşılaştırmıştır.",
          "İkinci paragrafta notun nasıl adlandırıldığına bak.",
          0.5,
          "UNDERSTAND",
        ),
        mc(
          "Sunumda bazı soruların açık bırakılması hangi yaklaşımı gösterir?",
          [
            "Kanıtın yetmediği yerde belirsizliği dürüstçe belirtmeyi.",
            "Tarihsel belgeleri hiç kullanmamayı.",
            "Yalnızca fotoğrafın görünüşüne güvenmeyi.",
            "Her ipucunu kesin gerçek kabul etmeyi.",
          ],
          "a",
          "Öğrenciler fotoğrafı ve kayıtları kullanırken cevaplanmamış soruları da açıkça yazmıştır.",
          "Son paragrafta öğrencilerin neyi ayrıca belirttiğini bul.",
          0.7,
          "INFER",
        ),
        tf(
          "Yıllık kaydı, fotoğraftaki pankartların anlamını kesin olarak açıklamıştır.",
          false,
          "Yıllık etkinlikten söz etmiş, ancak pankartların anlamını açıklamamıştır.",
          "İkinci paragrafın son cümlesini kontrol et.",
          0.5,
          "RECALL",
        ),
      ],
    },
  ] satisfies CurriculumContentItem[],
} as const;

export const curriculumPackContentCount = FIRST_REAL_CURRICULUM_PACK.contents.length;
export const curriculumPackQuestionCount = FIRST_REAL_CURRICULUM_PACK.contents.reduce(
  (total, content) => total + content.questions.length,
  0,
);
