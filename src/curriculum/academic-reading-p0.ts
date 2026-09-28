/**
 * Academic Reading Model P0
 *
 * This is an authoring catalogue, not a database seed. It deliberately does
 * not contain database IDs or invented published records. A later editorial
 * import must bind each practice stage to an existing published template
 * version before the lesson can be exposed to students.
 */

export const ACADEMIC_P0_AGE_BAND = "13-17" as const;

export type AcademicAreaCode = "FAST_READING" | "READING_COMPREHENSION";
export type AcademicSkillCode =
  | "FAST_ATTENTION"
  | "FAST_RECOGNITION"
  | "FAST_CHUNKING"
  | "RC_MAIN_IDEA"
  | "RC_DETAIL"
  | "RC_INFERENCE";
export type AcademicStage = "TEACHING" | "SMALL_STUDY" | "PRACTICE";
export type AcademicMeasurementSignal =
  | "ACCURACY"
  | "COMPREHENSION"
  | "WORD_RECOGNITION"
  | "PHRASE_CHUNKING"
  | "CONTROLLED_TASK_TIME"
  | "ERROR_TYPE"
  | "TRANSFER";

export type AcademicSource = {
  key: string;
  title: string;
  url: string;
  claim: string;
  limitation: string;
  scope: "EVIDENCE" | "CURRICULUM" | "PRODUCT_INFERENCE";
};

export type AcademicLessonStage = {
  stage: AcademicStage;
  title: string;
  instruction: string;
  observableAction: string;
  feedback: string;
};

export type AcademicLesson = {
  lessonKey: string;
  area: AcademicAreaCode;
  skillCode: AcademicSkillCode;
  title: string;
  ageBand: typeof ACADEMIC_P0_AGE_BAND;
  objective: string;
  misconception: string;
  correctFeedback: string;
  incorrectFeedback: string;
  reteach: string;
  stages: readonly [AcademicLessonStage, AcademicLessonStage, AcademicLessonStage];
  transferTask: string;
  completionCondition: string;
  successIndicators: ReadonlyArray<{
    signal: AcademicMeasurementSignal;
    evidence: string;
  }>;
  measurementSignals: readonly AcademicMeasurementSignal[];
  practiceBinding: {
    family: string;
    competency: AcademicSkillCode;
    rendererKey: string;
    publishedTemplateVersionRequired: true;
  };
  sources: readonly AcademicSource[];
};

export const ACADEMIC_P0_LESSONS: readonly AcademicLesson[] = [
  {
    lessonKey: "academic-p0-fast-attention",
    area: "FAST_READING",
    skillCode: "FAST_ATTENTION",
    title: "Dikkatini hedefe yönelt",
    ageBand: ACADEMIC_P0_AGE_BAND,
    objective:
      "Kısa bir metinde sorunun istediği bilgiyi belirleyip, ilgisiz ayrıntılara takılmadan kanıtını göstermesi.",
    misconception: "Hızlı okumayı her kelimeyi atlamak veya ilk göze çarpan bilgiyi seçmek sanmak.",
    correctFeedback:
      "Hedefi belirleyip metindeki kanıtla eşleştirdin. Şimdi aynı yöntemi yeni bir duyuruda dene.",
    incorrectFeedback:
      "Seçimin metindeki bir ayrıntıyı yakalamış olabilir; ancak sorunun istediği hedefle eşleşip eşleşmediğini tekrar kontrol et.",
    reteach:
      "Soruyu önce kişi, yer, sıra veya neden olarak adlandır. Ardından yalnızca bu hedefi destekleyen cümleyi işaretle.",
    stages: [
      {
        stage: "TEACHING",
        title: "Öğretim: hedefi önce belirle",
        instruction:
          "Okumaya başlamadan önce sorunun ne istediğini bir-iki kelimeyle adlandır: kişi, yer, sıra veya neden. Sonra metinde bu hedefi destekleyen kanıtı ara.",
        observableAction: "Öğrenci sorunun hedef türünü ve metindeki kanıt cümlesini işaretler.",
        feedback:
          "Seçtiğin bilgi hedefle eşleşiyor mu? Hedef farklıysa ilk cevaba dönmek yerine sorunun anahtarını yeniden söyle.",
      },
      {
        stage: "SMALL_STUDY",
        title: "Küçük çalışma: hedef–kanıt eşleştir",
        instruction:
          "Üç kısa cümlede yalnızca sorunun istediği bilgiyi bul. Her seçimden önce ‘Bunu metin açıkça söylüyor mu?’ diye kontrol et.",
        observableAction:
          "Öğrenci her cevap için hedefi ve onu destekleyen kısa ifadeyi eşleştirir.",
        feedback:
          "Yanlışsa cevabı hemen ezberleme: hedef kelimeyi tekrar oku, sonra metindeki açık kanıtı ara.",
      },
      {
        stage: "PRACTICE",
        title: "Uygulama: yeni kısa metinde bul",
        instruction:
          "Yeni ve kısa bir metinde hedef bilgiyi bul, cevabını seç ve hangi ifadeye dayandığını belirt.",
        observableAction:
          "Öğrenci yeni metinde hedef bilgiyi doğru seçer ve kanıt konumunu gösterir.",
        feedback:
          "Doğru cevap için seçim ile metindeki kanıtın aynı hedefi göstermesi gerekir; uyuşmuyorsa hedefi yeniden sınıflandır.",
      },
    ],
    transferTask:
      "Günlük bir duyuruda yalnızca tarih, yer veya yapılacak işi hedef olarak seçip metinden kanıtını bul.",
    completionCondition:
      "Uygulama oturumu mevcut sunucu değerlendirmesiyle tamamlanır; yüzde veya evrensel hız eşiği bu katalog tarafından tanımlanmaz.",
    successIndicators: [
      {
        signal: "ACCURACY",
        evidence: "Hedef soruya verilen cevap sunucu tarafından doğru değerlendirildi.",
      },
      {
        signal: "ERROR_TYPE",
        evidence: "Hata varsa hedefi kaçırma ile metinde olmayan bilgi kullanma ayrıştırıldı.",
      },
      { signal: "TRANSFER", evidence: "Öğrenci yeni duyuruda hedef bilgiyi kanıtıyla gösterdi." },
    ],
    measurementSignals: ["ACCURACY", "CONTROLLED_TASK_TIME", "ERROR_TYPE", "TRANSFER"],
    practiceBinding: {
      family: "ATTENTION_BURST",
      competency: "FAST_ATTENTION",
      rendererKey: "QUESTION_ATTENTION_BURST",
      publishedTemplateVersionRequired: true,
    },
    sources: [
      {
        key: "aps-reading-speed-2016",
        title: "Rayner et al. — So Much to Read, So Little Time",
        url: "https://www.psychologicalscience.org/publications/speed_reading.html",
        claim:
          "Göz hareketleri ve geri dönüşler anlam kurmanın parçasıdır; üründeki görev bu nedenle atlama hızı değil hedefe dayalı dikkat ölçer.",
        limitation:
          "Bu kaynak ürün görevindeki başarıyı veya Türkçe 13–17 yaş grubunda bir eşik değeri doğrulamaz; burada yalnızca ölçüm tasarımını sınırlar.",
        scope: "PRODUCT_INFERENCE",
      },
    ],
  },
  {
    lessonKey: "academic-p0-fast-recognition",
    area: "FAST_READING",
    skillCode: "FAST_RECOGNITION",
    title: "Kelimeleri bağlam içinde hızlı tanı",
    ageBand: ACADEMIC_P0_AGE_BAND,
    objective:
      "Sık karşılaşılan bir kelime veya ifadeyi yalnızca görünüşünden değil, cümledeki anlamından doğrulayarak tanıması.",
    misconception:
      "Bir kelimeyi hızlı görmeyi, anlamını bağlamı kontrol etmeden tahmin etmekle karıştırmak.",
    correctFeedback:
      "Kelimeyi cümlenin anlamıyla doğruladın. Hız, bağlamı atlamak değil doğru anlamı daha güvenilir tanımaktır.",
    incorrectFeedback:
      "Kelime tek başına doğru ipucu vermeyebilir. Öncesindeki ve sonrasındaki ilişkiyi okuyarak seçimini yeniden sınayalım.",
    reteach:
      "Hedef ifadeyi kapatıp cümlenin eylemini söyle. Sonra ifadeyi geri getir ve hangi anlamın cümleyle tutarlı olduğunu seç.",
    stages: [
      {
        stage: "TEACHING",
        title: "Öğretim: kelimeyi cümleyle doğrula",
        instruction:
          "Önce kelimenin cümledeki görevine bak: kim ne yapıyor, ne değişiyor? Hızlı tanıma, anlamı bağlamdan koparmadan doğru eşleştirmedir.",
        observableAction: "Öğrenci hedef kelimeyi aynı anlamı taşıyan cümle parçasıyla eşleştirir.",
        feedback:
          "Kelime tek başına birden fazla anlama gelebilir. Cümlenin tamamı seçimini desteklemiyorsa bağlamı tekrar oku.",
      },
      {
        stage: "SMALL_STUDY",
        title: "Küçük çalışma: sözcük–anlam eşleştir",
        instruction:
          "Kısa cümlelerde hedef ifadeyi bul ve cümlenin anlamını en iyi koruyan seçeneği seç.",
        observableAction: "Öğrenci kelimeyi, cümledeki bağlam anlamıyla eşleştirir.",
        feedback:
          "Yanlışsa yalnızca kelimeye bakma; kelimenin öncesi ve sonrasındaki eylem ve ilişkiyi tekrar kontrol et.",
      },
      {
        stage: "PRACTICE",
        title: "Uygulama: yeni bağlamda tanı",
        instruction:
          "Yeni bir kısa metinde hedef ifade farklı bir cümle içinde kullanılır. İfadeyi bul ve bağlamla tutarlı anlamı seç.",
        observableAction: "Öğrenci yeni bağlamda ifadeyi doğru tanır ve anlamını ayırt eder.",
        feedback:
          "Cevap bağlamla çelişiyorsa daha yavaşlamak değil, cümlenin ilişkisini yeniden kurmak gerekir.",
      },
    ],
    transferTask:
      "Bir ders metninde daha önce öğrendiğin bir kelimeyi bul; kelimenin anlamını tek başına değil cümleyle açıkla.",
    completionCondition:
      "Uygulama oturumu mevcut sunucu değerlendirmesiyle tamamlanır; kelime tanıma ile okuma hızını aynı ölçüm sayma.",
    successIndicators: [
      {
        signal: "WORD_RECOGNITION",
        evidence: "Hedef kelime veya ifade bağlama uygun anlamla eşleştirildi.",
      },
      {
        signal: "ACCURACY",
        evidence: "Yeni cümledeki seçim doğru ve sunucu tarafından kaydedildi.",
      },
      { signal: "TRANSFER", evidence: "Öğrenci yeni ders metninde kelimeyi cümleyle açıkladı." },
    ],
    measurementSignals: [
      "ACCURACY",
      "WORD_RECOGNITION",
      "CONTROLLED_TASK_TIME",
      "ERROR_TYPE",
      "TRANSFER",
    ],
    practiceBinding: {
      family: "RAPID_RECOGNITION",
      competency: "FAST_RECOGNITION",
      rendererKey: "QUESTION_RAPID_RECOGNITION",
      publishedTemplateVersionRequired: true,
    },
    sources: [
      {
        key: "bashir-hook-2009",
        title: "Bashir & Hook — Fluency: A Key Skill",
        url: "https://pubmed.ncbi.nlm.nih.gov/18952813/",
        claim:
          "Akıcı okuma, kelime tanıma ve anlam kurma arasındaki ilişkiyi dikkate almalıdır; bu ders tanımayı bağlamdan koparmadan çalıştırır.",
        limitation:
          "Çalışma akıcılık ile kelime tanıma arasındaki ilişkiyi destekler; bu tek başına bir Türkçe yaş normu veya belirli bir hız artışı kanıtı değildir.",
        scope: "EVIDENCE",
      },
    ],
  },
  {
    lessonKey: "academic-p0-fast-chunking",
    area: "FAST_READING",
    skillCode: "FAST_CHUNKING",
    title: "Anlamlı kelime gruplarını yakala",
    ageBand: ACADEMIC_P0_AGE_BAND,
    objective:
      "Kelimeleri tek tek koparmak yerine, cümlede birlikte anlam taşıyan kısa grupları ayırt etmesi.",
    misconception:
      "Daha hızlı olmak için kelimeleri rastgele birleştirmek veya noktalama ve anlam ilişkilerini yok saymak.",
    correctFeedback:
      "Grup sınırını anlamı koruyacak şekilde kurdun. Şimdi aynı ilişkiyi farklı bir cümlede aktar.",
    incorrectFeedback:
      "Grupları yalnızca uzunluklarına göre seçme. Eylem ile onu tamamlayan kelimelerin birlikte anlam taşıyıp taşımadığını kontrol et.",
    reteach:
      "Cümlede önce eylemi bul. Eylemi tamamlayan kişi, nesne veya durumla birlikte okunabilen en küçük anlamlı grubu kur.",
    stages: [
      {
        stage: "TEACHING",
        title: "Öğretim: birlikte anlam taşıyan parçayı gör",
        instruction:
          "Bir cümlede eylemi ve onu tamamlayan kelimeleri birlikte düşün. Grup, cümlenin anlamını koruyan doğal bir parçadır; sabit uzunlukta olmak zorunda değildir.",
        observableAction: "Öğrenci cümlede anlamı bozmayan kısa kelime gruplarını ayırır.",
        feedback:
          "Grup tek başına anlamsızsa veya cümlenin ilişkisini bozuyorsa kelime sınırını yeniden değerlendir.",
      },
      {
        stage: "SMALL_STUDY",
        title: "Küçük çalışma: doğal grubu seç",
        instruction:
          "Üç kısa cümlede birlikte anlam taşıyan kelime grubunu seçenekler arasından seç ve nedenini söyle.",
        observableAction:
          "Öğrenci grup seçimini cümlenin eylem ve tamamlayıcı ilişkisiyle açıklar.",
        feedback: "Yanlışsa grubun cümledeki görevini sor: kim, ne yaptı, neyi veya nasıl yaptı?",
      },
      {
        stage: "PRACTICE",
        title: "Uygulama: yeni cümleyi grupla",
        instruction:
          "Yeni cümlede anlamlı kelime gruplarını ayır ve grupları sıraya koyarak cümlenin anlamını koru.",
        observableAction: "Öğrenci yeni cümlede anlamı koruyan grupları doğru seçer.",
        feedback:
          "Grup sınırı anlamı değiştiriyorsa cümleyi doğal konuşur gibi yeniden oku ve ilişkiyi kontrol et.",
      },
    ],
    transferTask:
      "Bir ders kitabı cümlesinde iki anlamlı kelime grubunu parantezle göster ve cümleyi kendi sözlerinle açıkla.",
    completionCondition:
      "Uygulama oturumu mevcut sunucu değerlendirmesiyle tamamlanır; grup uzunluğu tek başına başarı ölçütü değildir.",
    successIndicators: [
      {
        signal: "PHRASE_CHUNKING",
        evidence: "Öğrenci yeni cümlede anlamı koruyan grupları seçti.",
      },
      {
        signal: "ACCURACY",
        evidence: "Grup seçimi mevcut soru değerlendirmesiyle doğru kaydedildi.",
      },
      {
        signal: "TRANSFER",
        evidence: "Öğrenci ders kitabı cümlesinde grupları gösterip anlamı açıkladı.",
      },
    ],
    measurementSignals: [
      "ACCURACY",
      "PHRASE_CHUNKING",
      "CONTROLLED_TASK_TIME",
      "ERROR_TYPE",
      "TRANSFER",
    ],
    practiceBinding: {
      family: "PHRASE_CHUNKING",
      competency: "FAST_CHUNKING",
      rendererKey: "QUESTION_PHRASE_CHUNKING",
      publishedTemplateVersionRequired: true,
    },
    sources: [
      {
        key: "steinle-stevens-vaughn-2022",
        title: "Steinle, Stevens & Vaughn — Fluency interventions in grades 6–12",
        url: "https://journals.sagepub.com/doi/10.1177/0022219421991249",
        claim:
          "Akıcılık çalışmaları sesli/tekrarlı uygulama ve anlamla birlikte ele alınmalıdır; grup çalışması doğrudan evrensel hız normu olarak sunulmaz.",
        limitation:
          "Sentez, 6–12. sınıf akıcılık müdahalelerini inceler; bu dersin grup sınırlarına doğrudan etkisini veya Türkçe sonuçlarını kanıtlamaz.",
        scope: "EVIDENCE",
      },
    ],
  },
  {
    lessonKey: "academic-p0-rc-main-idea",
    area: "READING_COMPREHENSION",
    skillCode: "RC_MAIN_IDEA",
    title: "Metnin ana fikrini kanıtla",
    ageBand: ACADEMIC_P0_AGE_BAND,
    objective:
      "Bir metnin ana düşüncesini, metindeki birden fazla ayrıntıyı açıklayacak biçimde ifade etmesi.",
    misconception: "Başlığı, en ilginç ayrıntıyı veya metnin yalnızca konusunu ana fikir sanmak.",
    correctFeedback:
      "Ana fikri tek ayrıntıdan ayırdın ve metnin geneline uyan kanıtları kullandın.",
    incorrectFeedback:
      "Seçenek metnin yalnızca bir parçasını açıklıyor olabilir. Metindeki birden fazla ayrıntıyı açıklayan düşünceyi ara.",
    reteach:
      "Önce metnin konusunu tek kelimeyle söyle. Sonra yazarın bu konu hakkında verdiği ortak mesajı iki ayrıntıyla sınayarak yeniden yaz.",
    stages: [
      {
        stage: "TEACHING",
        title: "Öğretim: konu ile ana fikri ayır",
        instruction:
          "Konu ‘metin ne hakkında?’ sorusuna, ana fikir ise ‘yazar bu konuda ne söylüyor?’ sorusuna cevap verir. Tek bir ayrıntı değil, metnin geneline uyan ifadeyi ara.",
        observableAction:
          "Öğrenci konu, ayrıntı ve ana fikir seçeneklerini ayırır; ana fikrini iki kanıtla ilişkilendirir.",
        feedback:
          "Seçimin yalnızca bir cümleyi açıklıyorsa ayrıntıdır. Metnin çoğunu açıklayan daha genel ama metne dayalı ifadeyi ara.",
      },
      {
        stage: "SMALL_STUDY",
        title: "Küçük çalışma: ayrıntıları kümelendir",
        instruction:
          "Kısa metindeki ayrıntıları benzer mesajlarına göre grupla. Grupların ortak söylediğini bir cümleyle yaz.",
        observableAction: "Öğrenci en az iki ayrıntıyı ortak bir düşünceyle ilişkilendirir.",
        feedback:
          "Ortak cümle metindeki ayrıntıları açıklamıyorsa daha geniş veya daha kanıtlı bir ifade dene.",
      },
      {
        stage: "PRACTICE",
        title: "Uygulama: yeni metinde ana fikri seç",
        instruction:
          "Yeni metnin ana fikrini seç; ardından seçimini destekleyen iki farklı ayrıntıyı göster.",
        observableAction:
          "Öğrenci yeni metinde ana fikri ve iki destekleyici ayrıntıyı eşleştirir.",
        feedback:
          "Yanlışsa başlığa veya tek ayrıntıya yaslanma; metnin tamamını açıklayan seçeneği kanıtlarla sınayarak yeniden dene.",
      },
    ],
    transferTask:
      "Bir haber veya ders paragrafına kendi ana fikir cümleni yaz ve bu cümleyi destekleyen iki kanıtı belirt.",
    completionCondition:
      "Değerlendirme yeni metin ve mevcut ürün başarı kuralıyla yapılır; bu ders yeni bir evrensel eşik ilan etmez.",
    successIndicators: [
      {
        signal: "COMPREHENSION",
        evidence: "Ana fikir, en az iki metin ayrıntısıyla tutarlı biçimde açıklanıyor.",
      },
      {
        signal: "ACCURACY",
        evidence: "Yeni metindeki ana fikir seçimi sunucu tarafından doğru değerlendirildi.",
      },
      {
        signal: "TRANSFER",
        evidence: "Öğrenci yeni bir paragraf için kendi ana fikir cümlesini ve kanıtlarını üretti.",
      },
    ],
    measurementSignals: ["ACCURACY", "COMPREHENSION", "ERROR_TYPE", "TRANSFER"],
    practiceBinding: {
      family: "MAIN_IDEA",
      competency: "RC_MAIN_IDEA",
      rendererKey: "QUESTION_MULTIPLE_CHOICE",
      publishedTemplateVersionRequired: true,
    },
    sources: [
      {
        key: "wwc-reading-intervention-2022",
        title: "IES/WWC — Providing Reading Interventions for Students in Grades 4–9",
        url: "https://ies.ed.gov/ncee/wwc/practiceguide/29",
        claim:
          "Anlamayı destekleyen amaçlı okuma ve metin üzerinde düşünme uygulamaları güçlü kanıt alanlarıyla uyumludur.",
        limitation:
          "Rehber okuma müdahaleleri için kanıt sentezidir; bu özel dersin veya Türkçe 13–17 yaş grubundaki etkisini tek başına doğrulamaz.",
        scope: "EVIDENCE",
      },
      {
        key: "meb-turkish-curriculum-2019",
        title: "MEB Türkçe Dersi Öğretim Programı",
        url: "https://mufredat.meb.gov.tr/Dosyalar/20195716392253-02-T%C3%BCrk%C3%A7e%20Ö%C4%9Fretim%20Program%C4%B1%202019.pdf",
        claim:
          "Ana fikir, önemli bilgi, çıkarım ve özetleme Türkçe öğretim çıktıları arasında yer alır.",
        limitation:
          "Bu belge bir öğretim programıdır; etkinlik etkisi veya başarı normu için deneysel kanıt yerine geçmez.",
        scope: "CURRICULUM",
      },
    ],
  },
  {
    lessonKey: "academic-p0-rc-detail",
    area: "READING_COMPREHENSION",
    skillCode: "RC_DETAIL",
    title: "Önemli ayrıntıyı kanıtla bul",
    ageBand: ACADEMIC_P0_AGE_BAND,
    objective:
      "Sorunun istediği ayrıntıyı metindeki açık kanıtla eşleştirmesi ve benzer görünen bilgileri ayırt etmesi.",
    misconception:
      "Metinde geçen her bilgiyi önemli ayrıntı sanmak veya sorunun istediği koşulu atlamak.",
    correctFeedback: "Sorunun tüm koşullarını karşılayan ayrıntıyı açık kanıtıyla eşleştirdin.",
    incorrectFeedback:
      "Metinde geçen bir bilgi doğru olabilir ama soruyu cevaplamayabilir. Kişi, zaman, yer veya neden koşulunu yeniden kontrol et.",
    reteach:
      "Sorudaki koşulları tek tek işaretle. Metindeki her aday cümleyi bu koşullarla karşılaştır ve hepsini karşılayanı seç.",
    stages: [
      {
        stage: "TEACHING",
        title: "Öğretim: soru koşulunu metinle eşleştir",
        instruction:
          "Sorudaki kişi, zaman, yer, neden veya sıra koşulunu belirle. Metinde bu koşulu gerçekten karşılayan cümleyi seç; yalnızca aynı kelimeyi taşıyan seçeneğe güvenme.",
        observableAction: "Öğrenci soru koşulunu ve açık kanıt cümlesini ayrı ayrı gösterir.",
        feedback:
          "Aynı kelimeyi görmek yeterli değildir. Seçeneğin sorudaki tüm koşulları karşılayıp karşılamadığını kontrol et.",
      },
      {
        stage: "SMALL_STUDY",
        title: "Küçük çalışma: kanıt kartları",
        instruction:
          "Kısa paragrafta üç ayrıntıyı kanıt kartlarıyla eşleştir; soruda istenmeyen ama doğru olan bilgiyi ayır.",
        observableAction:
          "Öğrenci istenen ayrıntıyı, ilgili kanıtı ve dikkat dağıtan doğru bilgiyi ayırır.",
        feedback:
          "Bilgi doğru olabilir ama soruyu cevaplamayabilir. Önce sorunun koşulunu tekrar oku.",
      },
      {
        stage: "PRACTICE",
        title: "Uygulama: yeni metinde ayrıntıyı bul",
        instruction:
          "Yeni metinde sorunun istediği ayrıntıyı seç ve seçimindeki kanıtı kısa biçimde belirt.",
        observableAction: "Öğrenci doğru ayrıntıyı kanıtıyla eşleştirir.",
        feedback:
          "Yanlışsa metinde geçen kelimeyi değil, sorunun bütün koşullarını karşılayan ifadeyi ara.",
      },
    ],
    transferTask:
      "Bir ders paragrafından öğretmenin sorabileceği bir ayrıntı sorusu yaz ve cevabının kanıtını cümleyle göster.",
    completionCondition:
      "Uygulama oturumu mevcut sunucu değerlendirmesiyle tamamlanır; ayrıntı doğruluğu okuma süresinden ayrı raporlanır.",
    successIndicators: [
      { signal: "ACCURACY", evidence: "İstenen ayrıntı, sorunun bütün koşullarıyla eşleşti." },
      {
        signal: "COMPREHENSION",
        evidence: "Öğrenci doğru ayrıntının metin kanıtını gösterebildi.",
      },
      {
        signal: "TRANSFER",
        evidence: "Öğrenci yeni paragrafta kendi ayrıntı sorusunu ve kanıtını oluşturdu.",
      },
    ],
    measurementSignals: [
      "ACCURACY",
      "COMPREHENSION",
      "CONTROLLED_TASK_TIME",
      "ERROR_TYPE",
      "TRANSFER",
    ],
    practiceBinding: {
      family: "DETAIL_EVIDENCE",
      competency: "RC_DETAIL",
      rendererKey: "QUESTION_MULTIPLE_CHOICE",
      publishedTemplateVersionRequired: true,
    },
    sources: [
      {
        key: "ies-reading-intervention-2022",
        title: "IES/WWC Reading Intervention Practice Guide",
        url: "https://ies.ed.gov/ncee/wwc/Docs/PracticeGuide/WWC-practice-guide-reading-intervention-full-text.pdf",
        claim:
          "Metin anlamını kurmak için kanıtı izleme ve amaçlı anlama çalışmaları kullanılabilir; bu görev doğrudan okuma hızı normu değildir.",
        limitation:
          "Rehber metin kanıtını izlemeyi destekler; bu tek soru formatının ayrıntı öğrenmesini tek başına kanıtlamaz.",
        scope: "EVIDENCE",
      },
    ],
  },
  {
    lessonKey: "academic-p0-rc-inference",
    area: "READING_COMPREHENSION",
    skillCode: "RC_INFERENCE",
    title: "Çıkarımı metin ve akılla kur",
    ageBand: ACADEMIC_P0_AGE_BAND,
    objective:
      "Metinde açıkça yazmayan ama metin kanıtı ve makul akıl yürütmeyle desteklenen sonucu ayırt etmesi.",
    misconception:
      "Kendi bilgisini metnin kanıtı gibi kullanmak veya hiçbir kanıt olmadan tahmin yürütmek.",
    correctFeedback:
      "Çıkarımı metin işaretleriyle temellendirdin ve kişisel tahmini kanıttan ayırdın.",
    incorrectFeedback:
      "Cevap mümkün görünebilir; ancak metin onu desteklemiyorsa çıkarım değildir. Hangi işaretin hangi sonuca götürdüğünü yeniden göster.",
    reteach:
      "Metindeki iki işareti yaz. Aralarındaki bağlantıyı tek cümleyle açıkla; bağlantı kurulamıyorsa daha sınırlı bir sonuç seç.",
    stages: [
      {
        stage: "TEACHING",
        title: "Öğretim: kanıt + akıl yürütme",
        instruction:
          "Çıkarım, metinde bulunmayan bir cümleyi keyfî tamamlamak değildir. Metindeki iki işareti birleştir ve aralarındaki sonucu açıkla.",
        observableAction:
          "Öğrenci çıkarımını en az bir metin kanıtı ve kısa akıl yürütmeyle açıklar.",
        feedback:
          "Cevabın yalnızca kişisel bilgine dayanıyorsa metne dön. Kanıt ile sonuç arasında nasıl bir bağ kurduğunu söyle.",
      },
      {
        stage: "SMALL_STUDY",
        title: "Küçük çalışma: işaretleri birleştir",
        instruction:
          "Kısa metindeki iki işareti eşleştir ve bunların desteklediği sonucu seçeneklerden ayır.",
        observableAction: "Öğrenci iki metin işaretini makul bir sonuca bağlar.",
        feedback:
          "Sonuç metin işaretlerinden çıkmıyorsa fazla ileri gittin; daha sınırlı ve kanıtlı seçeneği ara.",
      },
      {
        stage: "PRACTICE",
        title: "Uygulama: yeni metinde çıkarımı kanıtla",
        instruction:
          "Yeni metinde en güçlü çıkarımı seç ve metindeki işaret ile sonuç arasındaki bağlantıyı bir cümleyle açıkla.",
        observableAction: "Öğrenci yeni metinde kanıtlı çıkarımı, aşırı yorumdan ayırır.",
        feedback:
          "Yanlışsa kendi varsayımını değil, metnin gerçekten verdiği işaretleri listeleyerek yeniden kur.",
      },
    ],
    transferTask:
      "Bir öykü veya haber paragrafında yazılmayan ama kanıtlanabilen bir sonucu yaz; kullandığın iki işareti göster.",
    completionCondition:
      "Değerlendirme yeni metin ve mevcut ürün kuralıyla yapılır; çıkarım için evrensel puan eşiği bu katalogda tanımlanmaz.",
    successIndicators: [
      {
        signal: "COMPREHENSION",
        evidence: "Çıkarım en az bir metin işareti ve açık bir akıl yürütmeyle desteklendi.",
      },
      { signal: "ACCURACY", evidence: "Yeni metindeki en güçlü çıkarım seçimi doğru kaydedildi." },
      {
        signal: "TRANSFER",
        evidence: "Öğrenci yeni paragrafta kanıtlanabilir bir sonucu ve işaretlerini yazdı.",
      },
    ],
    measurementSignals: ["ACCURACY", "COMPREHENSION", "ERROR_TYPE", "TRANSFER"],
    practiceBinding: {
      family: "INFERENCE",
      competency: "RC_INFERENCE",
      rendererKey: "QUESTION_MULTIPLE_CHOICE",
      publishedTemplateVersionRequired: true,
    },
    sources: [
      {
        key: "retrieval-practice-2021",
        title: "Agarwal, Nunes & Blunt — Retrieval Practice Systematic Review",
        url: "https://doi.org/10.1007/s10648-021-09595-9",
        claim:
          "Hatırlama ve açıklama isteyen etkinlikler öğrenmeyi destekleyebilir; bu bulgu tek başına belirli bir çıkarım eşiği kanıtlamaz.",
        limitation:
          "Derleme farklı eğitim bağlamlarını kapsar; özgül çıkarım becerisi, yaş grubu ve Türkçe için doğrudan norm üretmez.",
        scope: "EVIDENCE",
      },
      {
        key: "meb-turkish-curriculum-2019-inference",
        title: "MEB Türkçe Dersi Öğretim Programı",
        url: "https://mufredat.meb.gov.tr/Dosyalar/20195716392253-02-T%C3%BCrk%C3%A7e%20%C3%96%C4%9Fretim%20Program%C4%B1%202019.pdf",
        claim: "Metinden hareketle çıkarım yapma Türkçe öğretim çıktılarıyla uyumludur.",
        limitation:
          "Program hedefi bir müfredat uyumudur; bu içerik için deneysel etkinlik kanıtı veya başarı standardı değildir.",
        scope: "CURRICULUM",
      },
    ],
  },
] as const;

export const ACADEMIC_P0_COMMON_FLOW = {
  prerequisiteSkillCodes: [
    "FAST_ATTENTION",
    "FAST_RECOGNITION",
    "FAST_CHUNKING",
    "RC_MAIN_IDEA",
    "RC_DETAIL",
    "RC_INFERENCE",
  ] as const,
  stages: ["REINFORCEMENT", "ASSESSMENT", "MEASUREMENT", "NEXT_LEARNING"] as const,
  rule: "Ortak aşama yalnızca iki alandaki tüm PRACTICE kanıtları mevcut olduğunda adaydır; uygulama kodu bunu mevcut ilerleme kayıtlarından hesaplamalıdır.",
  assessmentRule:
    "Değerlendirme pekiştirmeden sonra ve mümkün olduğunca yeni metinle yürütülür; eşik mevcut ürün politikasıdır, akademik evrensel norm değildir.",
} as const;

export function validateAcademicReadingP0Catalog(
  lessons: readonly AcademicLesson[] = ACADEMIC_P0_LESSONS,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expected = new Set<AcademicSkillCode>(ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes);
  const seen = new Set<string>();

  for (const lesson of lessons) {
    if (seen.has(lesson.lessonKey)) errors.push(`Ders anahtarı tekrarlı: ${lesson.lessonKey}`);
    seen.add(lesson.lessonKey);
    if (!expected.has(lesson.skillCode)) errors.push(`Bilinmeyen beceri: ${lesson.skillCode}`);
    if (lesson.practiceBinding.competency !== lesson.skillCode) {
      errors.push(`Uygulama becerisi eşleşmiyor: ${lesson.skillCode}`);
    }
    if (lesson.stages.map((stage) => stage.stage).join(",") !== "TEACHING,SMALL_STUDY,PRACTICE") {
      errors.push(`Aşama sırası geçersiz: ${lesson.skillCode}`);
    }
    if (lesson.sources.length === 0) errors.push(`Kaynak yok: ${lesson.skillCode}`);
    if (lesson.sources.some((source) => source.limitation.trim().length === 0)) {
      errors.push(`Kaynak sınırlılığı yok: ${lesson.skillCode}`);
    }
    if (lesson.correctFeedback.trim().length === 0) {
      errors.push(`Doğru cevap geri bildirimi yok: ${lesson.skillCode}`);
    }
    if (lesson.incorrectFeedback.trim().length === 0) {
      errors.push(`Yanlış cevap geri bildirimi yok: ${lesson.skillCode}`);
    }
    if (lesson.reteach.trim().length === 0) {
      errors.push(`Yeniden öğretim yok: ${lesson.skillCode}`);
    }
    if (lesson.successIndicators.length < 2) {
      errors.push(`Başarı göstergeleri yetersiz: ${lesson.skillCode}`);
    }
    if (lesson.transferTask.trim().length === 0)
      errors.push(`Aktarım görevi yok: ${lesson.skillCode}`);
  }

  for (const skillCode of expected) {
    if (lessons.filter((lesson) => lesson.skillCode === skillCode).length !== 1) {
      errors.push(`Her beceri için tam bir P0 dersi gerekli: ${skillCode}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

const catalogValidation = validateAcademicReadingP0Catalog();
if (!catalogValidation.valid) {
  throw new Error(`Academic Reading P0 kataloğu geçersiz: ${catalogValidation.errors.join("; ")}`);
}
