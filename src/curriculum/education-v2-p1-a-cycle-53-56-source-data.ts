/** Source-checked original Turkish readings for A-route Cycles 53–56 (stations 293–312). */
export const EDUCATION_V2_P1_A_CYCLE_53_56_SOURCE_DATA = [
  {
    sequence: 53,
    stations: [
      {
        key: "a53-fast-arctic-season",
        title: "Arktik deniz buzunun mevsim takvimini bul",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_SEQUENCE"],
        outcome:
          "Arktik deniz buzunun yıllık en yüksek ve en düşük dönemlerini metinden hızla bulur.",
        textTitle: "Buzun yıllık takvimi",
        text: "Arktik Okyanusu'nu kaplayan deniz buzu uzun kutup kışında büyür. Buz alanı genellikle martta yılın en geniş düzeyine ulaşır. İlkbahar ve yaz boyunca erime sürer; yıllık en düşük düzey çoğunlukla eylülde görülür. Bu mevsimsel büyüme ve küçülme doğal bir döngüdür. Uydu kayıtları, bu döngünün zaman içindeki değişimini karşılaştırmaya yardımcı olur.",
        sourceTitle: "World of Change: Arctic Sea Ice",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/world-of-change/arctic-sea-ice/",
        verifiedFacts: [
          "Arktik deniz buzu kış boyunca büyür; yıllık en yüksek alan genellikle martta, en düşük alan eylülde görülür.",
          "Uydu kayıtları Arktik deniz buzunun uzun dönemli değişimini gösterir.",
        ],
        contentRelation:
          "Özgün metin NASA'nın bildirdiği mevsim sırasını ve uydu kayıtlarının amacını sadeleştirerek aktarır.",
        questions: [
          {
            key: "a53-season-1",
            prompt: "Deniz buzu genellikle hangi ayda en geniş alana ulaşır?",
            correct: "Martta",
            distractors: ["Eylülde", "Haziranda", "Aralıkta"],
            explanation:
              "İkinci cümle yıllık en geniş düzeyin genellikle martta görüldüğünü söyler.",
            hint: "Metindeki en geniş alanın zamanını bul.",
          },
          {
            key: "a53-season-2",
            prompt: "Yıllık en düşük buz alanı çoğunlukla ne zaman görülür?",
            correct: "Eylülde",
            distractors: ["Martta", "Ocakta", "Mayısta"],
            explanation: "Üçüncü cümle yıllık en düşük düzeyi eylül ayına bağlar.",
            hint: "Erime döneminin sonuna yakın verilen ayı ara.",
          },
          {
            key: "a53-season-3",
            prompt: "Metne göre uydu kayıtları hangi işe yardımcı olur?",
            correct: "Buz döngüsündeki değişimi karşılaştırmaya",
            distractors: [
              "Mevsimlere göre buz alanını ölçmeye",
              "Buz hareketinin yönünü değiştirmeye",
              "Yıllık ölçüm yerine hava durumu seçmeye",
            ],
            explanation:
              "Son cümle uydu kayıtlarının zaman içindeki değişimi karşılaştırmaya yaradığını belirtir.",
            hint: "Son cümlede kayıtların kullanım amacını bul.",
          },
        ],
      },
      {
        key: "a53-comprehension-ice-record",
        title: "Uydu kayıtlarının gösterdiği uzun dönemli örüntüyü açıkla",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_MAIN_IDEA", "RC_EVIDENCE", "RC_LIMITS"],
        outcome: "Uzun dönemli uydu eğilimini tek bir yılın hava koşullarından ayırır.",
        textTitle: "Bir yıl değil, uzun kayıt",
        text: "Bilim insanları Arktik deniz buzunun büyümesini ve geri çekilmesini 1978'in sonlarından beri uydularla kesintisiz izliyor. Kayıtlar, buz alanının yıllar içinde genel olarak azaldığını gösteriyor. Bununla birlikte bir yazdan diğerine erime miktarı hava koşullarına göre değişebilir. Bu nedenle tek bir yılın ölçümü uzun dönemli eğilimin tamamını anlatmaz. Bir eğilimi değerlendirmek için çok yıllı kayıtlar birlikte incelenir.",
        sourceTitle: "Arctic Sea Ice Reaches 2026 Annual Minimum Extent",
        sourceUrl:
          "https://science.nasa.gov/science-research/earth-science/climate-science/sea-ice/arctic-sea-ice-2026-min/",
        verifiedFacts: [
          "Arktik deniz buzunun yıllık büyüme ve geri çekilmesi 1978'in sonlarından beri uydu ölçümleriyle izleniyor.",
          "Uzun dönemli azalma eğilimi sürerken hava koşulları yıllar arasındaki yaz erimesini etkileyebilir.",
        ],
        contentRelation:
          "Metin kaynakta açıklanan uydu kayıt başlangıcını, uzun dönem eğilimini ve yıllık değişkenlik sınırını ayırır.",
        questions: [
          {
            key: "a53-record-1",
            prompt: "Kesintisiz uydu gözlemi yaklaşık ne zamandan beri sürüyor?",
            correct: "1978'in sonlarından beri",
            distractors: ["1998'in başlarından beri", "2008'den beri", "Yalnızca 2026'dan beri"],
            explanation: "İlk cümle sürekli gözlem dönemini 1978'in sonlarından başlatır.",
            hint: "İlk cümledeki başlangıç zamanını tara.",
          },
          {
            key: "a53-record-2",
            prompt: "Kayıtların uzun dönem için gösterdiği genel değişim nedir?",
            correct: "Buz alanının azalması",
            distractors: [
              "Buz alanının her yıl aynı kalması",
              "Buzun yalnızca kışın oluşması",
              "Okyanusun karaya dönüşmesi",
            ],
            explanation: "İkinci cümle buz alanının yıllar içinde genel olarak azaldığını söyler.",
            hint: "İkinci cümledeki genel yönü belirle.",
          },
          {
            key: "a53-record-3",
            prompt: "Bir yılın ölçümü neden uzun dönem eğilimini tek başına anlatmaz?",
            correct: "Yıllık erime hava koşullarına göre değişebildiği için",
            distractors: [
              "Uzun dönem kayıtları yalnızca tek yazı kapsadığı için",
              "Yıllık ölçüm bütün yılları aynı biçimde temsil ettiği için",
              "Uydular hava koşullarını doğrudan değiştirdiği için",
            ],
            explanation:
              "Üçüncü ve dördüncü cümleler yıllık değişkenliğin uzun eğilimden ayrılması gerektiğini açıklar.",
            hint: "Tek yıl ile çok yıllı kayıt arasındaki farkı ara.",
          },
        ],
      },
      {
        key: "a53-common-barents-image",
        title: "Barents Denizi görüntüsünden kanıt ve çıkarımı ayır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_DETAIL", "RC_CLAIM_EVIDENCE", "RC_LIMITS"],
        outcome: "Uydu görüntüsünde doğrudan görülen özellikleri bölgesel açıklamadan ayırır.",
        textTitle: "Barents Denizi'nde kırık buz",
        text: "Terra uydusundaki MODIS aracı, 17 Mart 2026'da kuzey Barents Denizi'nin görüntüsünü aldı. Görüntüde ince ve parçalanmış deniz buzu ile açık su alanları yan yana görünüyordu. Arktik buzunun marttaki 2026 en yüksek alanı 15 Mart'ta ölçüldü ve uydu kayıtlarının en düşük maksimumuyla istatistiksel olarak eşleşti. Görüntü bölgedeki görünümü gösterir; tek başına bütün Arktik buz değişiminin nedenini kanıtlamaz.",
        sourceTitle: "Barents Sea Tied to Low Arctic Sea Ice",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/barents-sea-tied-to-low-arctic-sea-ice/",
        verifiedFacts: [
          "Terra üzerindeki MODIS, kuzey Barents Denizi'ni 17 Mart 2026'da görüntüledi; ince kırık buz ve açık su görüldü.",
          "Arktik deniz buzunun 2026 maksimumu 15 Mart'ta gerçekleşti ve uydu kaydındaki en düşük maksimumla istatistiksel olarak eşleşti.",
        ],
        contentRelation:
          "Özgün metin belirli bir görüntüde gözlenen özellikleri, ayrı bir bölgesel ölçüm ve çıkarım sınırıyla ilişkilendirir.",
        questions: [
          {
            key: "a53-barents-1",
            prompt: "Kuzey Barents Denizi görüntüsü hangi tarihte alındı?",
            correct: "17 Mart 2026'da",
            distractors: ["15 Eylül 2026'da", "17 Mart 1979'da", "17 Mayıs 2025'te"],
            explanation: "İlk cümle Terra görüntüsünün tarihini 17 Mart 2026 olarak verir.",
            hint: "İlk cümledeki görüntü tarihini bul.",
          },
          {
            key: "a53-barents-2",
            prompt: "Görüntüde hangi iki yüzey görünümü yan yana yer alıyordu?",
            correct: "Parçalanmış buz ve açık su",
            distractors: ["Yoğun orman ve çöl", "Kar örtüsü ve lav", "Buzul ve tarım alanı"],
            explanation: "İkinci cümle ince parçalı buz ile açık suyu birlikte tarif eder.",
            hint: "İkinci cümlede karşılaştırılan yüzeyleri eşleştir.",
          },
          {
            key: "a53-barents-3",
            prompt: "Tek bir bölgesel görüntü hakkında hangi sınır korunmalıdır?",
            correct: "Tüm Arktik değişiminin nedenini tek başına kanıtlamaz",
            distractors: [
              "Bölgedeki yüzey desenlerini tarihle birlikte göstermez",
              "Deniz buzunun kapladığı alanı yaklaşık veremez",
              "Açık suyla buz arasındaki farkı görünür kılamaz",
            ],
            explanation:
              "Son cümle görüntünün bölgesel kanıt sunduğunu, bütün nedenleri açıklamadığını belirtir.",
            hint: "Son cümledeki çıkarım sınırını seç.",
          },
        ],
      },
      {
        key: "a53-integrated-microwave-method",
        title: "Mikrodalga ölçüm yöntemini hava koşullarından bağımsız olarak yorumla",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_METHOD", "RC_CAUSE_EFFECT", "RC_LIMITS"],
        outcome:
          "Pasif mikrodalga ölçümünün sinyal farkını ve bulut koşullarındaki avantajını açıklar.",
        textTitle: "Bulutların arkasındaki ölçüm",
        text: "Pasif mikrodalga sensörleri Dünya'nın doğal olarak yaydığı mikrodalga enerjisini ölçer. Deniz buzu, açık sudan daha fazla enerji yaydığı için bu görüntülerde ayırt edilebilir. Mikrodalgalar bulutların içinden geçebildiğinden gözlem yalnızca açık gökyüzüyle sınırlı değildir. Bu yöntem buzun varlığını ve kapladığı alanı izlemeye yardım eder. Ölçüm, deniz buzunun her ayrıntısını görünür ışık fotoğrafı gibi göstermez.",
        sourceTitle: "World of Change: Arctic Sea Ice — Seeing Through the Clouds",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/world-of-change/arctic-sea-ice/",
        verifiedFacts: [
          "Pasif mikrodalga sensörleri Dünya'nın doğal yaydığı mikrodalga enerjisini ölçer; deniz buzu açık sudan daha çok enerji yayar.",
          "Mikrodalgalar bulutlardan geçebildiği için deniz buzu farklı hava koşullarında düzenli gözlenebilir.",
        ],
        contentRelation:
          "Metin kaynakta açıklanan ölçüm yöntemini, sinyal farkını ve gözlem sınırını özgün ifadelerle açıklar.",
        questions: [
          {
            key: "a53-microwave-1",
            prompt: "Pasif mikrodalga sensörü neyi ölçer?",
            correct: "Dünya'nın doğal olarak yaydığı mikrodalga enerjisini",
            distractors: [
              "Güneş ışığından yansıyan mikrodalga enerjisini",
              "Deniz yüzeyinin tuz oranını doğrudan ve tam olarak",
              "Yalnızca buzun üstünde oluşan görünür ışık değişimini",
            ],
            explanation: "İlk cümle sensörün ölçtüğü enerjiyi tanımlar.",
            hint: "İlk cümlede ölçülen sinyali bul.",
          },
          {
            key: "a53-microwave-2",
            prompt: "Buz mikrodalga görüntüsünde açık sudan nasıl ayrılır?",
            correct: "Daha fazla enerji yaydığı için",
            distractors: [
              "Daha sıcak olduğu için",
              "Bulut oluşturduğu için",
              "Görünür ışığı tamamen soğurduğu için",
            ],
            explanation: "İkinci cümle buzun açık sudan daha fazla enerji yaydığını söyler.",
            hint: "İkinci cümledeki sinyal farkını bul.",
          },
          {
            key: "a53-microwave-3",
            prompt: "Mikrodalga ölçümü bulutlu havada neden işe yarar?",
            correct: "Mikrodalgalar bulutların içinden geçebildiği için",
            distractors: [
              "Kalın bulutları radar sinyaline dönüştürebildiği için",
              "Bulut örtüsünü ölçümden tamamen kaldırdığı için",
              "Görünür ışık bulutlardan etkilenmediği için",
            ],
            explanation: "Üçüncü cümle yöntemin bulutların içinden ölçüm yapabilmesini açıklar.",
            hint: "Üçüncü cümledeki neden-sonuç bağlantısını izle.",
          },
        ],
      },
      {
        key: "a53-assessment-ice-claim",
        title: "Arktik buz verisinde ölçüm, değişkenlik ve çıkarımı değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Mevsimsel döngü ile çok yıllı ölçüm eğilimini birleştirerek desteklenen çıkarımı seçer.",
        textTitle: "Birbiriyle tamamlanan kanıtlar",
        text: "Arktik deniz buzu çoğunlukla martta en geniş, eylülde en dar alana ulaşır. Uydu kayıtları 1978'in sonlarından beri bu mevsimsel döngüyü izler ve genel buz alanının zamanla azaldığını gösterir. Hava koşulları her yıl erime miktarını değiştirebilir; bu nedenle tek bir yaz, uzun dönem eğilimini tek başına temsil etmez. Pasif mikrodalga ölçümü bulutların içinden veri sağlar. Birlikte okunduğunda bu bilgiler hem ölçüm yöntemini hem kanıtın zaman ölçeğini gösterir.",
        sourceTitle: "World of Change: Arctic Sea Ice",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/world-of-change/arctic-sea-ice/",
        verifiedFacts: [
          "Arktik deniz buzu genellikle martta maksimuma, eylülde minimuma ulaşır ve uydu kayıtları 1978'in sonlarından beri sürer.",
          "Uzun dönemli alan azalması yıllar arası hava değişkenliğiyle birlikte değerlendirilmelidir; pasif mikrodalgalar bulutlardan geçebilir.",
        ],
        contentRelation:
          "Değerlendirme metni döngü, uzun dönemli kayıt ve ölçüm yöntemi kanıtlarını bir araya getirir; tek yıllık genellemeyi sınırlar.",
        questions: [
          {
            key: "a53-assess-1",
            prompt: "Metne göre buz alanının genel uzun dönem değişimi hangisidir?",
            correct: "Azalma yönündedir; yıllık değişim de vardır",
            distractors: [
              "Uzun dönem boyunca hemen hemen sabit kalır",
              "Yalnızca son yazın ölçümünden çıkarılmıştır",
              "Yıllar arasında değişse de düzenli biçimde büyür",
            ],
            explanation: "İkinci ve üçüncü cümleler genel azalmayı yıllık değişkenlikten ayırır.",
            hint: "Genel eğilim ile yıl farkını birlikte düşün.",
          },
          {
            key: "a53-assess-2",
            prompt: "Uzun dönem eğilimi değerlendirirken neden çok yıl gerekir?",
            correct: "Tek bir yaz hava koşullarından etkilenebilir",
            distractors: [
              "Uydu kayıtları yalnızca eylülde başladığı için",
              "Martta deniz buzu oluşmadığı için",
              "Her yıl aynı hava yaşandığı için",
            ],
            explanation:
              "Üçüncü cümle tek yazın yıllık hava koşullarından etkilenebileceğini açıklar.",
            hint: "Metnin tek yıllık ölçüme getirdiği uyarıyı bul.",
          },
          {
            key: "a53-assess-3",
            prompt: "Bulutlu havada düzenli gözleme hangi yöntem yardım eder?",
            correct: "Pasif mikrodalga ölçümü",
            distractors: ["Yalnızca renkli fotoğraf", "Kıyıdaki cetvel", "Deniz tabanı haritası"],
            explanation:
              "Dördüncü cümle pasif mikrodalga ölçümünün bulutlardan veri sağladığını söyler.",
            hint: "Dördüncü cümlede adı geçen yöntemi seç.",
          },
        ],
      },
    ],
  },
  {
    sequence: 54,
    stations: [
      {
        key: "a54-fast-radar-fires",
        title: "Radarın yangın izlemedeki iki avantajını tara",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_DETAIL"],
        outcome:
          "Radarın gözlem zamanı ve bulut/duman koşullarındaki kullanım özelliklerini bulur.",
        textTitle: "Dumanın arkasındaki iz",
        text: "Uydu ve uçaklara yerleştirilen radar araçları yangının araziye verdiği zararı gözlemleyebilir. Radar gündüz de gece de çalışabilir ve bulutların ya da dumanın içinden yeryüzünü inceleyebilir. Bu nedenle yangın sürerken alev cephesi, sonrasında ise yanık alanlar izlenebilir. Radar sinyalleri yüzeyden geri yansır; bilim insanları bu yansımaları farklı zamanlardaki uçuşlarla karşılaştırır.",
        sourceTitle: "A Mosaic of Fire Data",
        sourceUrl: "https://science.nasa.gov/earth/earth-observatory/a-mosaic-of-fire-data-147872/",
        verifiedFacts: [
          "Uydu ve uçak radarları yangın hasarını saptamak için kullanılır; gece ve gündüz çalışabilir, bulut ve duman içinden yüzeyi gözleyebilir.",
          "Radarın farklı geçişlerdeki sinyalleri karşılaştırılarak yangın sonrası yüzey değişimi incelenebilir.",
        ],
        contentRelation:
          "Özgün metin NASA'nın radar gözlemine ilişkin çalışma tanımını ve karşılaştırma yöntemini aktarır.",
        questions: [
          {
            key: "a54-radar-1",
            prompt: "Kaynakta radar araçlarının taşındığı iki platform hangileridir?",
            correct: "Uydular ve uçaklar",
            distractors: [
              "Denizaltılar ve trenler",
              "Balonlar ve tekneler",
              "Yalnızca kara araçları",
            ],
            explanation: "İlk cümle radar araçlarının uydu ve uçaklarda bulunduğunu söyler.",
            hint: "İlk cümledeki iki platformu bul.",
          },
          {
            key: "a54-radar-2",
            prompt: "Radar hangi zamanlarda gözlem yapabilir?",
            correct: "Gündüz ve gece",
            distractors: [
              "Yalnızca öğle vakti",
              "Sadece yaz aylarında",
              "Yalnızca yangın söndükten sonra",
            ],
            explanation: "İkinci cümle radarın gündüz ve gece çalışabildiğini belirtir.",
            hint: "İkinci cümledeki zaman karşıtlığını ara.",
          },
          {
            key: "a54-radar-3",
            prompt: "Yangın sonrası arazi değişimi nasıl incelenebilir?",
            correct: "Farklı zamanlardaki radar yansımalarını karşılaştırarak",
            distractors: [
              "Yangın sonrası sıcaklık haritalarını karşılaştırarak",
              "Yalnızca tek tarihteki optik renkleri inceleyerek",
              "Arazideki ses kayıtlarını yangın öncesiyle eşleştirerek",
            ],
            explanation:
              "Son cümle farklı zamanlardaki radar sinyallerinin karşılaştırıldığını açıklar.",
            hint: "Son cümlede karşılaştırılan veriyi seç.",
          },
        ],
      },
      {
        key: "a54-comprehension-los-alamos",
        title: "Los Alamos öncesi-sonrası görüntülerindeki değişimi açıkla",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_DETAIL", "RC_EVIDENCE"],
        outcome: "Aynı bölgenin iki tarihli Landsat görüntüsünden görünür değişimi çıkarır.",
        textTitle: "İki tarihin karşılaştırması",
        text: "Landsat 7'nin ETM+ algılayıcısı Los Alamos bölgesini 14 Nisan ve 17 Haziran 2000'de görüntüledi. Nisan görüntüsü yangından önce, haziran görüntüsü ise yangın söndürüldükten kısa süre sonra alındı. Görüntü çifti, yangının arazide bıraktığı etkinin alanını karşılaştırmayı sağlar. Yanlış renkli görüntüde bitki örtüsü yeşil tonlarla gösterilir. Görüntüler zarar gören alanı ortaya koysa da tek başına her ekolojik sonucu açıklamaz.",
        sourceTitle: "Los Alamos Before and After the Fire",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/los-alamos-before-and-after-the-fire-701/",
        verifiedFacts: [
          "Landsat 7 ETM+ görüntüleri 14 Nisan 2000'de yangından önce, 17 Haziran'da yangın söndürüldükten kısa süre sonra alındı.",
          "NASA yanlış renkli kompozitinde bitki örtüsü yeşil tonlarda görünür; görüntü çifti yangın zararının yayılımını gösterir.",
        ],
        contentRelation:
          "Özgün metin kaynakta belirtilen iki tarihi, algılayıcıyı ve renk yorumunu karşılaştırmalı biçimde özetler.",
        questions: [
          {
            key: "a54-los-1",
            prompt: "Yangından önceki görüntü hangi tarihte alındı?",
            correct: "14 Nisan 2000'de",
            distractors: ["17 Haziran 2000'de", "14 Nisan 2020'de", "4 Mayıs 2000'de"],
            explanation: "İlk cümle 14 Nisan tarihini görüntü çiftinin ilk tarihi olarak verir.",
            hint: "İlk cümledeki önce görüntüsünün tarihini bul.",
          },
          {
            key: "a54-los-2",
            prompt: "Yangın söndükten kısa süre sonraki görüntünün tarihi nedir?",
            correct: "17 Haziran 2000",
            distractors: ["14 Nisan 2000", "17 Temmuz 2000", "17 Haziran 2010"],
            explanation: "İkinci cümle haziran görüntüsünü yangın sonrası olarak açıklar.",
            hint: "İkinci cümledeki sonraki tarihi seç.",
          },
          {
            key: "a54-los-3",
            prompt: "Yanlış renkli kompozitte bitki örtüsü hangi tonda gösterilir?",
            correct: "Yeşil tonlarda",
            distractors: ["Yalnızca mor", "Koyu mavi", "Parlak turuncu"],
            explanation: "Dördüncü cümle bitki örtüsünün yeşil tonlarla gösterildiğini belirtir.",
            hint: "Dördüncü cümlede renk ile bitki örtüsünü eşleştir.",
          },
        ],
      },
      {
        key: "a54-common-false-color",
        title: "Yanlış renkli yangın görüntüsünde kanıtı dikkatle oku",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_METHOD", "RC_DATA_INTERPRETATION", "RC_LIMITS"],
        outcome:
          "Görüntüdeki renk kodunu yüzey özelliğiyle eşleştirir ve renklerin doğal olmadığını fark eder.",
        textTitle: "Renk bir kod olabilir",
        text: "Uydu görüntüsündeki her renk, yeryüzünün çıplak gözle görülen rengi değildir. NASA'nın yangın örneğinde kısa dalga kızılötesi, yakın kızılötesi ve yeşil ışık bantları birleştirilerek dumanın altındaki yanık alan belirginleştirildi. Bu kompozitte yanık izleri kahverengi görünür. Farklı bantların renk kanallarına atanması belirli yüzeyleri ayırt etmeye yardım eder. Rengin anlamı kullanılan bant birleşimine bağlıdır; tek bir renk kuralı tüm görüntüler için geçerli değildir.",
        sourceTitle: "Scarred Land and Smoky Skies",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/scarred-land-and-smoky-skies-150175/",
        verifiedFacts: [
          "Landsat 8'in 6-5-3 yanlış renkli kompoziti kısa dalga kızılötesi, yakın kızılötesi ve yeşil bantları kullanarak duman altındaki yanık izlerini gösterdi.",
          "NASA örneğinde yanık alanlar kahverengi görünür; renkler seçilen bant birleşimine bağlıdır.",
        ],
        contentRelation:
          "Metin görüntü rengi ile yeryüzünün doğal rengini ayırır ve kaynaktaki bant birleşimi örneğini sınırlarıyla anlatır.",
        questions: [
          {
            key: "a54-color-1",
            prompt: "NASA örneğinde hangi alan kahverengi görünür?",
            correct: "Yanık izleri",
            distractors: ["Bulutların tamamı", "Deniz buzu", "Şehir ışıkları"],
            explanation: "Üçüncü cümle kompozitte yanık izlerinin kahverengi göründüğünü söyler.",
            hint: "Üçüncü cümlede renk ile yüzey alanını eşleştir.",
          },
          {
            key: "a54-color-2",
            prompt:
              "Duman altındaki yanık alanı belirginleştirmek için kaç bant türü birleştirilmiştir?",
            correct: "Üç bant türü",
            distractors: ["Tek bir ses kanalı", "Yalnızca görünür kırmızı", "Beş sıcaklık ölçeri"],
            explanation: "İkinci cümlede üç farklı bant türü sayılır.",
            hint: "İkinci cümlede listelenen bant adlarını say.",
          },
          {
            key: "a54-color-3",
            prompt: "Bir rengin görüntüdeki anlamı neye bağlıdır?",
            correct: "Kullanılan bant birleşimine",
            distractors: [
              "Ekranın markasına",
              "Yangının adındaki harflere",
              "Fotoğrafın dosya boyutuna",
            ],
            explanation:
              "Son cümle renk anlamının seçilen bant birleşimine bağlı olduğunu belirtir.",
            hint: "Son cümledeki koşulu bul.",
          },
        ],
      },
      {
        key: "a54-integrated-fire-scar",
        title: "Yangın alanının zaman içindeki büyümesini değerlendir",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_SEQUENCE", "RC_EVIDENCE", "RC_INFERENCE"],
        outcome:
          "Ardışık uydu görüntülerini kullanarak yangın alanındaki değişimi sınırlarıyla yorumlar.",
        textTitle: "Mayıstan sonraki yayılım",
        text: "Santa Rosa Adası'ndaki bir yangın 15 Mayıs 2026'da fark edildi. Landsat 8 ve Landsat 9'ın OLI algılayıcıları 16 ve 24 Mayıs'ta aynı bölgenin görüntülerini aldı. Yanlış renkli görüntülerde yanmış alanın 16 Mayıs'tan 24 Mayıs'a büyüdüğü görülüyor; sonraki tarihte büyüme durmuştu. Tarihli görüntüler değişimin yönünü karşılaştırmaya yarar. Ancak iki görüntü, yangının her saat nasıl ilerlediğini gösteren kesintisiz bir kayıt değildir.",
        sourceTitle: "Fire’s Footprint on Santa Rosa Island",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/fires-footprint-on-santa-rosa-island/",
        verifiedFacts: [
          "Santa Rosa Adası yangını 15 Mayıs 2026'da fark edildi; Landsat görüntüleri 16 ve 24 Mayıs'taki yanık alanı karşılaştırır.",
          "Görüntülerde yanık alan 16 Mayıs'tan 24 Mayıs'a genişledi ve 24 Mayıs'ta büyüme durmuştu.",
        ],
        contentRelation:
          "Özgün metin kaynakta verilen olay ve görüntü tarihlerini sıralar; iki görüntünün zamansal sınırını açıklar.",
        questions: [
          {
            key: "a54-santa-1",
            prompt: "Yangın hangi tarihte fark edildi?",
            correct: "15 Mayıs 2026'da",
            distractors: ["16 Mayıs 2026'da", "24 Mayıs 2026'da", "15 Haziran 2026'da"],
            explanation: "İlk cümle yangının fark edildiği tarihi verir.",
            hint: "İlk cümlede yangının başlangıç bilgisini ara.",
          },
          {
            key: "a54-santa-2",
            prompt: "Yanık alanın genişlemesi hangi tarihler arasındaki görüntülerle izleniyor?",
            correct: "16 ve 24 Mayıs arasında",
            distractors: [
              "15 Nisan ile 15 Mayıs arasında",
              "24 Mayıs ile 24 Haziran arasında",
              "Yalnızca 15 Mayıs görüntüsünde",
            ],
            explanation: "İkinci ve üçüncü cümleler 16 ve 24 Mayıs görüntülerini karşılaştırır.",
            hint: "İkinci cümlede geçen iki görüntü tarihini seç.",
          },
          {
            key: "a54-santa-3",
            prompt: "Bu iki görüntünün kanıt sınırı nedir?",
            correct: "Yangının her saatlik ilerleyişini vermez",
            distractors: [
              "Yanık alanın değişimini gösteremez",
              "Tarihleri karşılaştıramaz",
              "Uydu görüntüsü içermez",
            ],
            explanation: "Son cümle iki tarihin kesintisiz bir saatlik kayıt olmadığını söyler.",
            hint: "Son cümlede iki görüntüyle ilgili uyarıyı bul.",
          },
        ],
      },
      {
        key: "a54-assessment-fire-recovery",
        title: "Yangın sonrası iyileşme kanıtlarını bir arada değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_METHOD", "RC_LIMITS"],
        outcome:
          "Radar ve optik zaman serilerinin farklı kanıtlarını karşılaştırıp uygun çıkarımı seçer.",
        textTitle: "Hasarı görmek, iyileşmeyi izlemek",
        text: "Bir yangından hemen sonraki görüntü yanık alanın konumunu gösterir; yıllar sonra alınan ölçümler ise bitki örtüsünün yeniden gelişimini izlemeye yardım edebilir. NASA araştırmalarında uçak radarının 2010, 2017 ve 2020 uçuşları karşılaştırılarak farklı yüzey evreleri haritalandı. Radarın yansımaları çıplak yanık arazi ile bitki örtülü yüzeyde farklıdır. Bu yaklaşım zaman içindeki değişimi incelemek için tasarlanmıştır; tek bir uçuş bütün iyileşme sürecini açıklamaz.",
        sourceTitle: "A Mosaic of Fire Data",
        sourceUrl: "https://science.nasa.gov/earth/earth-observatory/a-mosaic-of-fire-data-147872/",
        verifiedFacts: [
          "UAVSAR radar verileri 2010, 2017 ve 2020'deki uçuşlardan derlendi; yüzey sinyalleri yanık çıplak zemin ile bitki örtüsünde farklıdır.",
          "Araştırma, yangından sonraki yıllarda bitki örtüsünün yeniden gelişimini zaman içinde izlemeyi amaçlar.",
        ],
        contentRelation:
          "Değerlendirme metni yangın hasarı ile uzun dönemli toparlanma ölçümünü ve çok tarihli veri gereğini ayırır.",
        questions: [
          {
            key: "a54-assess-1",
            prompt: "Radar karşılaştırmasında hangi yılların uçuş verileri kullanıldı?",
            correct: "2010, 2017 ve 2020",
            distractors: ["2000, 2005 ve 2010", "2012, 2016 ve 2024", "Yalnızca 2020"],
            explanation: "İkinci cümle karşılaştırılan üç uçuş yılını sayar.",
            hint: "İkinci cümledeki yıl dizisini bul.",
          },
          {
            key: "a54-assess-2",
            prompt: "Radar yansımaları hangi iki yüzeyde farklılık gösterebilir?",
            correct: "Yanık çıplak arazi ve bitki örtülü yüzey",
            distractors: [
              "Yanık arazi ve açık deniz yüzeyi",
              "Nemli toprak ve kuru bitki örtüsü",
              "Çıplak kaya ve yoğun orman örtüsü",
            ],
            explanation:
              "Üçüncü cümle çıplak yanık arazi ile bitkili yüzeyin yansımalarını karşılaştırır.",
            hint: "Üçüncü cümlede karşılaştırılan yüzeyleri seç.",
          },
          {
            key: "a54-assess-3",
            prompt: "İyileşmeyi değerlendirmek için neden çok tarihli veri gerekir?",
            correct: "Değişim yıllar içinde gerçekleştiği için",
            distractors: [
              "Radar yalnızca tek renk verdiği için",
              "Yangınlar yalnızca gece çıktığı için",
              "Tek uçuş bitki örtüsünü yok ettiği için",
            ],
            explanation:
              "Metin farklı yıllardaki uçuşları karşılaştırır ve tek uçuşun süreci açıklamayacağını belirtir.",
            hint: "Son iki cümlede zaman içindeki değişimle ilgili gerekçeyi bul.",
          },
        ],
      },
    ],
  },
  {
    sequence: 55,
    stations: [
      {
        key: "a55-fast-gandak-dates",
        title: "Gandak taşkınındaki tarih ve araç bilgilerini bul",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_DETAIL"],
        outcome:
          "Taşkın gözlemindeki görüntü tarihlerini ve kullanılan uydu araçlarını hızlıca bulur.",
        textTitle: "İki görüntü, iki tarih",
        text: "Nepal'in dağlık bölgelerine 24–27 Eylül 2026 arasında şiddetli yağmur yağdı. Terra ve Aqua uydularındaki MODIS araçları Gandak Nehri çevresini 20 ve 29 Eylül'de görüntüledi. İkinci görüntüde nehir belirgin biçimde daha genişti. Yağış, nehrin taşmasına ve çevredeki alanların su altında kalmasına yol açtı. Tarihleri birlikte okumak, yağış dönemiyle uydu gözlemlerini karıştırmadan karşılaştırmaya yardım eder.",
        sourceTitle: "Rains Swamp the Gandak River",
        sourceUrl: "https://science.nasa.gov/earth/earth-observatory/rains-swamp-the-gandak-river/",
        verifiedFacts: [
          "Nepal'in Lumbini ve Gandaki bölgelerinde 24–27 Eylül 2026 arasında yoğun yağış oldu.",
          "Terra ve Aqua üzerindeki MODIS, Gandak çevresini 20 ve 29 Eylül 2026'da görüntüledi; sonraki görüntüde nehir daha genişti.",
        ],
        contentRelation:
          "Özgün metin kaynakta yer alan yağış aralığını uydu görüntülerinin iki tarihiyle ayrı ayrı verir.",
        questions: [
          {
            key: "a55-gandak-1",
            prompt: "Yoğun yağış hangi tarih aralığında gerçekleşti?",
            correct: "24–27 Eylül 2026",
            distractors: ["20–29 Eylül 2026", "14–17 Haziran 2000", "24–27 Ekim 2025"],
            explanation: "İlk cümle yağış aralığını 24–27 Eylül olarak verir.",
            hint: "İlk cümledeki yağış tarihlerini tara.",
          },
          {
            key: "a55-gandak-2",
            prompt: "Gandak çevresinin görüntü tarihleri hangileridir?",
            correct: "20 ve 29 Eylül",
            distractors: ["24 ve 27 Eylül", "20 ve 29 Ağustos", "14 ve 17 Ekim"],
            explanation: "İkinci cümle iki MODIS görüntü tarihini belirtir.",
            hint: "İkinci cümledeki uydu gözlemi tarihlerini seç.",
          },
          {
            key: "a55-gandak-3",
            prompt: "Görüntüleri hangi araç aldı?",
            correct: "Terra ve Aqua'daki MODIS",
            distractors: [
              "Landsat 7'deki ETM+",
              "NASA'nın Nimbus-7 radarı",
              "Yalnızca kıyı ölçerleri",
            ],
            explanation: "İkinci cümle Terra ve Aqua üzerindeki MODIS araçlarını tanımlar.",
            hint: "İkinci cümlede uydu ve aracı eşleştir.",
          },
        ],
      },
      {
        key: "a55-comprehension-flood-colors",
        title: "Yanlış renkli taşkın görüntüsündeki işaretleri yorumla",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_DATA_INTERPRETATION", "RC_DETAIL", "RC_LIMITS"],
        outcome: "Yanlış renkli görüntüde su, bitki ve bulut işaretlerini eşleştirir.",
        textTitle: "Renk anahtarını kullan",
        text: "Gandak Nehri'ni gösteren yanlış renkli MODIS görüntüsü, görünür ışık ile kızılötesi gözlemleri birleştirir. Bu görüntüde taşkın suyu mavi, bitki örtüsü parlak yeşil, bulutlar ise açık mavi görünür. Renkler, farklı yüzeyleri ayırt etmeyi kolaylaştıran bir görüntüleme düzenidir; suyun gerçek rengi olarak okunmamalıdır. Mavi görünen alanın sınırını belirlerken görüntü tarihini ve çevredeki diğer renkleri de birlikte kontrol etmek gerekir.",
        sourceTitle: "Rains Swamp the Gandak River — Reading the Images",
        sourceUrl: "https://science.nasa.gov/earth/earth-observatory/rains-swamp-the-gandak-river/",
        verifiedFacts: [
          "NASA'nın MODIS 7-2-1 yanlış renkli görüntüsünde taşkın suyu mavi, bitki örtüsü parlak yeşil, bulutlar açık mavidir.",
          "Görüntü görünür ve kızılötesi bantları birleştirerek suyu ayırt etmeyi kolaylaştırır.",
        ],
        contentRelation:
          "Metin NASA'nın görüntü açıklamasındaki renk kodunu verir ve rengin doğal görünüm olmadığını açıklar.",
        questions: [
          {
            key: "a55-color-1",
            prompt: "Yanlış renkli görüntüde taşkın suyu hangi renkte görünür?",
            correct: "Mavi",
            distractors: ["Parlak yeşil", "Açık turuncu", "Koyu mor"],
            explanation: "İkinci cümle taşkın suyunu mavi olarak tanımlar.",
            hint: "İkinci cümlede su için kullanılan rengi bul.",
          },
          {
            key: "a55-color-2",
            prompt: "Parlak yeşil renk hangi yüzeyi gösterir?",
            correct: "Bitki örtüsünü",
            distractors: ["Taşkın suyunu", "Bulutları", "Yerleşim ışıklarını"],
            explanation: "İkinci cümle parlak yeşili bitki örtüsüyle eşleştirir.",
            hint: "Renk anahtarındaki yeşil eşleşmesini seç.",
          },
          {
            key: "a55-color-3",
            prompt: "Yanlış renkli görüntüde mavi alanı nasıl yorumlamalıyız?",
            correct: "Görüntüleme koduyla gösterilen su alanı olarak",
            distractors: [
              "Suyun doğal olarak mavi olduğunun kanıtı olarak",
              "Her mavi pikseli bulut sayarak",
              "Görüntü tarihinden bağımsız bir alan olarak",
            ],
            explanation:
              "Üçüncü ve dördüncü cümleler renklerin görüntüleme düzeni olduğunu ve ek işaretlerle kontrol edilmesi gerektiğini söyler.",
            hint: "Renklerin nasıl üretildiğini açıklayan cümleyi bul.",
          },
        ],
      },
      {
        key: "a55-common-lake-powell-images",
        title: "Lake Powell görüntülerini aynı yer ve farklı zamanla karşılaştır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_DETAIL", "RC_EVIDENCE"],
        outcome: "2017 ve 2026 tarihli görüntülerden su alanındaki görünür farkı çıkarır.",
        textTitle: "Aynı kıyı, farklı yıllar",
        text: "Landsat 8, Lake Powell'ın Glen Canyon Barajı üzerindeki bölümünü 1 Eylül 2017 ve 10 Eylül 2026'da görüntüledi. NASA karşılaştırmasında 2017'de göl son on yılın yüksek düzeylerinden birindeydi; 2026 görüntüsünde su seviyesi rekor düşük olarak bildirildi. Dağlardaki az kar birikimi ve sıcak koşullar, ilkbaharda gölü besleyen kar erimesini azalttı. Görüntü farkı su alanındaki değişimi gösterir; nedenleri anlamak için ayrıca su ve hava verileri gerekir.",
        sourceTitle: "Lake Powell Drops to Record-Low Levels",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/lake-powell-drops-to-record-low-levels/",
        verifiedFacts: [
          "Landsat 8 OLI görüntüleri 1 Eylül 2017 ve 10 Eylül 2026'da Lake Powell'ın aynı bölümünü gösterir; 2017 seviyesi son on yılın yükseklerinden, 2026 ise rekor düşüktür.",
          "Az kar birikimi ve sıcak koşullar ilkbaharda gölü besleyen kar erimesini azaltmıştır.",
        ],
        contentRelation:
          "Metin NASA'nın karşılaştırmalı görüntü tarihlerini ve açıklanan kar erimesi bağlantısını kanıt sınırıyla aktarır.",
        questions: [
          {
            key: "a55-powell-1",
            prompt: "2017 görüntüsü hangi tarihte alındı?",
            correct: "1 Eylül 2017'de",
            distractors: ["10 Eylül 2026'da", "1 Eylül 2026'da", "10 Ağustos 2017'de"],
            explanation: "İlk cümle 2017 görüntüsünün tarihini verir.",
            hint: "İlk cümledeki eski görüntünün tarihini bul.",
          },
          {
            key: "a55-powell-2",
            prompt: "2026 görüntüsünde su seviyesi nasıl tanımlanıyor?",
            correct: "Rekor düşük",
            distractors: ["Son on yılın en yükseklerinden", "Değişmemiş", "Ölçülememiş"],
            explanation: "İkinci cümle 2026 seviyesinin rekor düşük olarak bildirildiğini söyler.",
            hint: "İkinci cümlede 2026 için kullanılan düzeyi seç.",
          },
          {
            key: "a55-powell-3",
            prompt: "Kar erimesinin azalmasına hangi koşullar bağlanıyor?",
            correct: "Az kar birikimi ve sıcak koşullar",
            distractors: [
              "Yoğun kar ve soğuk hava",
              "Gelgit ve deniz tuzu",
              "Bulut rengi ve kıyı ışığı",
            ],
            explanation:
              "Üçüncü cümle kar birikiminin azlığı ile sıcak koşulları neden olarak verir.",
            hint: "Üçüncü cümlede iki koşulu birlikte bul.",
          },
        ],
      },
      {
        key: "a55-integrated-reservoir-history",
        title: "Rezervuar görüntülerinden uzun dönemli değişim çıkar",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_SEQUENCE", "RC_COMPARE_CONTRAST", "RC_LIMITS"],
        outcome:
          "Farklı yılların uydu görüntülerini su düzeyleriyle birleştirerek temkinli çıkarım yapar.",
        textTitle: "1994, 2013 ve 2026 karşılaştırması",
        text: "Elephant Butte Rezervuarı'nın Landsat görüntüleri 2 Haziran 1994, 8 Temmuz 2013 ve 27 Temmuz 2026 tarihlerinden örnekler sunar. 1994'te rezervuar neredeyse doluydu; diğer iki tarihte kuraklık dönemleriyle birlikte su düzeyi düşüktü. NASA yazısı, Rio Grande havzasındaki kuraklığın düşüşe katkıda bulunduğunu bildirir. Farklı yıllardan seçilmiş görüntüler uzun vadeli görünür değişimi gösterir, ancak her ara yılın su miktarını tek başına açıklamaz.",
        sourceTitle: "Elephant Butte Reservoir Runs Low",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/elephant-butte-reservoir-runs-low/",
        verifiedFacts: [
          "Landsat görüntüleri 2 Haziran 1994'te neredeyse dolu rezervuarı, 8 Temmuz 2013 ve 27 Temmuz 2026'da kuraklık dönemlerindeki düşük seviyeleri karşılaştırır.",
          "NASA yazısı Rio Grande havzasındaki kuraklığın rezervuarın düşmesine katkı verdiğini bildirir.",
        ],
        contentRelation:
          "Özgün metin kaynakta verilen üç tarihli görüntüyü ve kuraklıkla ilgili ifadeyi, görüntülerin ara yılları kapsamadığı uyarısıyla birleştirir.",
        questions: [
          {
            key: "a55-reservoir-1",
            prompt: "Rezervuarın neredeyse dolu olduğu görüntü hangi tarihe aittir?",
            correct: "2 Haziran 1994",
            distractors: ["8 Temmuz 2013", "27 Temmuz 2026", "2 Haziran 2026"],
            explanation: "İkinci cümle 1994 görüntüsünü neredeyse dolu dönem olarak tanımlar.",
            hint: "İlk iki cümlede dolulukla ilişkilendirilen tarihi bul.",
          },
          {
            key: "a55-reservoir-2",
            prompt: "NASA yazısı su düzeyinin düşmesine hangi etkenin katkısını bildiriyor?",
            correct: "Rio Grande havzasındaki kuraklığın",
            distractors: [
              "Colorado havzasındaki yağış fazlasının",
              "Rio Grande'deki deniz gelgitlerinin",
              "Rezervuar çevresindeki kar birikiminin",
            ],
            explanation: "Üçüncü cümle düşüşe katkı veren kuraklığı belirtir.",
            hint: "Üçüncü cümledeki neden bildiren ifadeyi ara.",
          },
          {
            key: "a55-reservoir-3",
            prompt: "Üç seçilmiş görüntünün tek başına gösteremeyeceği bilgi hangisidir?",
            correct: "Her ara yılın su miktarı",
            distractors: [
              "1994'teki görüntü tarihi",
              "2026'daki görünür su alanı",
              "Rezervuarın adının Elephant Butte olduğu",
            ],
            explanation: "Son cümle seçilmiş tarihlerin aradaki her yılı açıklamadığını söyler.",
            hint: "Son cümlede belirtilen zaman kapsamı sınırını bul.",
          },
        ],
      },
      {
        key: "a55-assessment-water-evidence",
        title: "Taşkın ve kuraklık görüntülerinin kanıtlarını değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Taşkın ve rezervuar görüntülerini yöntem, zaman ve çıkarım sınırı bakımından karşılaştırır.",
        textTitle: "Görüntünün gösterdiği ve göstermediği",
        text: "Gandak çevresinin iki MODIS görüntüsü 20 ve 29 Eylül 2026 tarihlerinde alındı; daha sonraki görüntüde nehir daha genişti. Yanlış renk düzeninde su mavi, bitki örtüsü parlak yeşil görünür. Lake Powell karşılaştırması ise Landsat 8'in 2017 ve 2026 görüntülerinden yararlanır. İki örnek de uydu görüntülerinin yüzey değişimini karşılaştırabileceğini gösterir. Fakat görüntüler nedenleri tek başına kanıtlamaz; yağış, kar birikimi ve su düzeyi ölçümleri ek kanıt sağlar.",
        sourceTitle: "Rains Swamp the Gandak River; Lake Powell Drops to Record-Low Levels",
        sourceUrl: "https://science.nasa.gov/earth/earth-observatory/rains-swamp-the-gandak-river/",
        additionalSources: [
          {
            title: "Lake Powell Drops to Record-Low Levels",
            url: "https://science.nasa.gov/earth/earth-observatory/lake-powell-drops-to-record-low-levels/",
          },
        ],
        verifiedFacts: [
          "Gandak için 20 ve 29 Eylül 2026 MODIS görüntüleri karşılaştırılır; yanlış renkli görüntüde su mavi, bitki örtüsü parlak yeşildir.",
          "Lake Powell için Landsat 8'in 2017 ve 2026 görüntüleri kullanılır; uydu görüntüsü yüzey farkını gösterirken nedenler ek verilerle değerlendirilir.",
        ],
        contentRelation:
          "Değerlendirme iki NASA gözlem örneğini karşılaştırır ve görünür değişim ile nedensel açıklama arasındaki farkı korur.",
        questions: [
          {
            key: "a55-assess-1",
            prompt: "Gandak örneğinde sonraki görüntüde ne değişmişti?",
            correct: "Nehir daha geniş görünüyordu",
            distractors: [
              "Rezervuar dolmuştu",
              "Buz alanı artmıştı",
              "Bulutlar tamamen kaybolmuştu",
            ],
            explanation: "İlk cümle 29 Eylül görüntüsünde nehrin daha geniş olduğunu belirtir.",
            hint: "İlk cümlede iki tarihli görüntü arasındaki farkı bul.",
          },
          {
            key: "a55-assess-2",
            prompt: "İki örneğin ortak kullanım amacı nedir?",
            correct: "Yüzey değişimini farklı tarihler arasında karşılaştırmak",
            distractors: [
              "Görüntü renklerinden her olayın nedenini kesinleştirmek",
              "Farklı uydu araçlarını suyun altına indirmek",
              "Tarihler arasında ölçüm yapmadan her yılı açıklamak",
            ],
            explanation:
              "Dördüncü cümle iki örneğin ortak amacını yüzey değişimini karşılaştırmak olarak açıklar.",
            hint: "Dördüncü cümledeki ortak noktayı seç.",
          },
          {
            key: "a55-assess-3",
            prompt: "Nedenleri değerlendirmek için görüntülere ek olarak ne gerekir?",
            correct: "Yağış, kar birikimi ve su düzeyi ölçümleri",
            distractors: [
              "Görüntülerin tarih ve bulut örtüsü bilgisi",
              "Su yüzeyinin renk ve kıyı sınırı değişimleri",
              "Nehir ile rezervuar kıyılarının fotoğrafları",
            ],
            explanation:
              "Son cümle nedenler için yağış, kar ve su ölçümlerini ek kanıt olarak sayar.",
            hint: "Son cümlede listelenen ek kanıtları bul.",
          },
        ],
      },
    ],
  },
  {
    sequence: 56,
    stations: [
      {
        key: "a56-fast-baltic-bloom",
        title: "Baltık Denizi görüntüsündeki tarih ve araçları tara",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_DETAIL"],
        outcome:
          "Fitoplankton görüntüsünün tarihini, uydusunu ve algılayıcısını metinden hızla bulur.",
        textTitle: "Yeşil girdabın görüntüsü",
        text: "Landsat 9'daki OLI-2, Baltık Denizi'ndeki fitoplankton çoğalmasını 20 Temmuz 2025'te görüntüledi. Görüntüler İsveç'in Gotland Adası'nın güneyindeki ve Stockholm'ün güneydoğusundaki deniz alanlarını kapsıyordu. Küçük canlıların sayısı arttığında yüzeyde parlak yeşil lekeler ve girdaplar görülebildi. Görüntüdeki koyu, düz izler ise suyun içinden geçen teknelerin bıraktığı izlerdi.",
        sourceTitle: "Brilliant Bloom in the Baltic Sea",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/brilliant-bloom-in-the-baltic-sea-154581/",
        verifiedFacts: [
          "Landsat 9 üzerindeki OLI-2, Baltık Denizi'nde 20 Temmuz 2025'te fitoplankton çiçeklenmesini görüntüledi.",
          "Görüntüde parlak yeşil lekeler fitoplankton çoğalmasıyla, koyu düz çizgiler teknelerin izleriyle ilişkilendirildi.",
        ],
        contentRelation:
          "Metin NASA'nın belirttiği görüntü tarihi, araçlar ve iki görsel işareti kendi Türkçe anlatımıyla sunar.",
        questions: [
          {
            key: "a56-baltic-1",
            prompt: "Baltık Denizi görüntüsü hangi tarihte alındı?",
            correct: "20 Temmuz 2025'te",
            distractors: ["20 Temmuz 2026'da", "23 Haziran 2025'te", "10 Ocak 2026'da"],
            explanation: "İlk cümle OLI-2 görüntüsünün tarihini verir.",
            hint: "İlk cümledeki görüntü tarihini bul.",
          },
          {
            key: "a56-baltic-2",
            prompt: "Görüntüyü hangi uydu ve algılayıcı aldı?",
            correct: "Landsat 9 ve OLI-2",
            distractors: ["Terra ve MODIS", "NOAA-20 ve VIIRS", "Landsat 7 ve ETM+"],
            explanation: "İlk cümle uyduyu ve algılayıcıyı birlikte adlandırır.",
            hint: "İlk cümlede araçları eşleştir.",
          },
          {
            key: "a56-baltic-3",
            prompt: "Görüntüdeki koyu, düz izler neyi gösteriyordu?",
            correct: "Teknelerin su üzerindeki izlerini",
            distractors: ["Deniz tabanındaki yarıkları", "Buzul sınırlarını", "Bulut gölgelerini"],
            explanation: "Son cümle koyu düz izleri teknelerin bıraktığı izler olarak tanımlar.",
            hint: "Son cümlede çizgilerin açıklamasını seç.",
          },
        ],
      },
      {
        key: "a56-comprehension-chatham-bloom",
        title: "Chatham Adaları çevresindeki girdapların izini sür",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_CAUSE_EFFECT", "RC_SEQUENCE", "RC_DETAIL"],
        outcome:
          "Akıntıların ve girdapların yüzen canlıları nasıl şekillendirdiğini metin kanıtıyla açıklar.",
        textTitle: "Akıntının çizdiği desen",
        text: "Chatham Adaları çevresindeki parlak yeşil ve mavi okyanus girdabı 10 Ocak 2026'da NOAA-20 uydusundaki VIIRS aracıyla görüntülendi. Fitoplankton, sayıları çok arttığında uydulardan görülebilen küçük fotosentetik canlılardır. Yüzey akıntıları ve girdaplar bu yüzen canlıları ince şeritler ve kıvrımlar hâlinde taşır. Bölgedeki sığ deniz yükseltisiyle farklı sıcaklıktaki akıntıların buluşması, plankton için besin sağlayan koşullara katkı verir.",
        sourceTitle: "Blooming Seas Around the Chatham Islands",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/blooming-seas-around-the-chatham-islands/",
        verifiedFacts: [
          "NOAA-20 üzerindeki VIIRS, Chatham Adaları çevresindeki fitoplankton görüntüsünü 10 Ocak 2026'da aldı.",
          "Yüzey akıntıları ve girdaplar yüzen fitoplanktonu şerit ve girdap biçimlerine taşır; sığ Chatham Rise çevresindeki akıntılar besin sağlar.",
        ],
        contentRelation:
          "Özgün metin kaynaktaki gözlem tarihini, akıntıların biçim verme rolünü ve bölgesel besin koşullarını ilişkilendirir.",
        questions: [
          {
            key: "a56-chatham-1",
            prompt: "Görüntü hangi tarihte alınmıştır?",
            correct: "10 Ocak 2026'da",
            distractors: ["10 Ocak 2025'te", "16 Ocak 2026'da", "20 Temmuz 2025'te"],
            explanation: "İlk cümle görüntü tarihini açıkça verir.",
            hint: "İlk cümledeki tarih bilgisini bul.",
          },
          {
            key: "a56-chatham-2",
            prompt: "Fitoplanktonu ince şerit ve kıvrımlara taşıyan etkenler hangileridir?",
            correct: "Yüzey akıntıları ve girdaplar",
            distractors: ["Uydu ve algılayıcı", "Yağmur ve kar", "Ada yolları ve limanlar"],
            explanation: "Üçüncü cümle biçimi veren iki su hareketini belirtir.",
            hint: "Üçüncü cümledeki taşıyıcıları seç.",
          },
          {
            key: "a56-chatham-3",
            prompt: "Metne göre bu canlılar uydudan ne zaman görünür hâle gelir?",
            correct: "Sayıları çok arttığında",
            distractors: [
              "Yalnızca kıyıya çıktıklarında",
              "Deniz suyu donduğunda",
              "Her bir hücre tek tek büyütüldüğünde",
            ],
            explanation:
              "İkinci cümle fitoplanktonun sayıları arttığında uydu görüntüsünde görünür olduğunu söyler.",
            hint: "İkinci cümlede görünürlük koşulunu ara.",
          },
        ],
      },
      {
        key: "a56-common-upwelling",
        title: "Rüzgâr ile besin taşıyan su arasındaki ilişkiyi karşılaştır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_CAUSE_EFFECT", "RC_COMPARE_CONTRAST", "RC_INFERENCE"],
        outcome:
          "Kıyıdan uzaklaşan yüzey suyu ile yükselen soğuk ve besinli su arasındaki neden-sonuç ilişkisini açıklar.",
        textTitle: "Kıyıdan açılan su",
        text: "NASA'nın fitoplankton gözlemlerini anlattığı bir örnekte muson rüzgârları kış ve ilkbahar başındaki çiçeklenmeyi etkiler. Rüzgârlar yüzey suyunu kıyıdan uzaklaştırınca derinlerden daha soğuk ve besin bakımından zengin su yükselir. Bu sürece yükselim denir. Besinli su, fitoplanktonların gelişmesini destekleyen koşullardan biridir. Yalnızca uydu görüntüsündeki renk, rüzgârın veya yükselimin tek başına kesin kanıtı değildir; süreç başka gözlemlerle birlikte değerlendirilir.",
        sourceTitle: "A Swirl of a Day for Phytoplankton",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/a-swirl-of-a-day-for-phytoplankton-154086/",
        verifiedFacts: [
          "NASA'nın örneğinde muson rüzgârları yüzey sularını kıyıdan uzaklaştırarak soğuk, besinli suyun yükselmesine yol açar.",
          "Bu yükselim kış ve ilkbahar başı fitoplankton çiçeklenmesini destekleyen etkenlerden biridir.",
        ],
        contentRelation:
          "Metin kaynakta anlatılan rüzgâr-yükselim-besin ilişkisini açıklar ve tek görüntünün neden kanıtı sayılamayacağını belirtir.",
        questions: [
          {
            key: "a56-upwelling-1",
            prompt: "Yüzey suyunu kıyıdan uzaklaştıran etken nedir?",
            correct: "Muson rüzgârları",
            distractors: ["Gelgit ölçerleri", "Uydu yörüngesi", "Deniz tabanındaki ışık"],
            explanation:
              "İlk ve ikinci cümlelerde yüzey suyunu kıyıdan uzaklaştıran rüzgârlar tanımlanır.",
            hint: "İlk iki cümledeki hareketi başlatan etkeni bul.",
          },
          {
            key: "a56-upwelling-2",
            prompt: "Yüzey suyu uzaklaşınca derinden nasıl bir su yükselir?",
            correct: "Soğuk ve besin bakımından zengin",
            distractors: [
              "Ilık ve besin düzeyi düşük",
              "Tatlı ve mineral bakımından fakir",
              "Yüzeye yakın ve oksijeni az",
            ],
            explanation: "İkinci cümle yükselen suyun soğuk ve besinli olduğunu söyler.",
            hint: "İkinci cümlede suyu tanımlayan iki özelliği seç.",
          },
          {
            key: "a56-upwelling-3",
            prompt: "Besinli su fitoplankton için nasıl bir rol oynar?",
            correct: "Gelişmeyi destekleyen koşullardan biridir",
            distractors: [
              "Fitoplanktonun besinini bütünüyle oluşturur",
              "Büyümeyi etkileyen tek etmene dönüşür",
              "Deniz yüzeyini sürekli soğuk tutar",
            ],
            explanation:
              "Dördüncü cümle besinli suyun gelişmeyi destekleyen koşullardan biri olduğunu belirtir.",
            hint: "Dördüncü cümledeki katkıyı bul.",
          },
        ],
      },
      {
        key: "a56-integrated-patagonia-colors",
        title: "Okyanus renklerini tür kesinliğiyle karıştırmadan yorumla",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_DATA_INTERPRETATION", "RC_LIMITS", "RC_EVIDENCE"],
        outcome:
          "PACE renk gözlemlerini olası plankton gruplarından ayırıp sınıflandırma sınırını açıklar.",
        textTitle: "Renk bir ipucudur, kesin ad değil",
        text: "NASA'nın PACE uydusundaki Okyanus Rengi Aracı, 28 Aralık 2024'te Patagonya Sahanlığı çevresinde bir fitoplankton çiçeklenmesini görüntüledi. Yüzey sularında yeşil ve mavi tonlar ile farklı renk şeritleri vardı. Bu renklerin, farklı plankton topluluklarının karışımını yansıtması olasıdır; akıntılar farklı su kütlelerini yan yana taşıyabilir. Uydu görüntüsünden türleri kesin belirlemek uzun süredir güçtür. PACE'in ayrıntılı dalga boyu ölçümleri ayırımı geliştirebilir, ancak araştırma yöntemi hâlâ geliştirilmektedir.",
        sourceTitle: "Phytoplankton Flourish in Patagonian Waters",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/phytoplankton-flourish-in-patagonian-waters-153782/",
        verifiedFacts: [
          "NASA'nın PACE Okyanus Rengi Aracı 28 Aralık 2024'te Patagonya Sahanlığı çevresindeki çiçeklenmeyi görüntüledi; farklı renkler plankton topluluklarının karışımını yansıtıyor olabilir.",
          "Uzaktan algılamayla plankton türlerini belirlemek zordur; PACE'in ince dalga boyu verileriyle geliştirilen ayırma aracı umut vericidir ancak geliştirme aşamasındadır.",
        ],
        contentRelation:
          "Metin renklerden çıkarılabilecek olasılığı kesin tür teşhisinden ayırır ve yöntemin geliştirme durumunu korur.",
        questions: [
          {
            key: "a56-patagonia-1",
            prompt: "PACE görüntüsü hangi tarihte alındı?",
            correct: "28 Aralık 2024'te",
            distractors: ["28 Aralık 2025'te", "20 Temmuz 2025'te", "10 Ocak 2026'da"],
            explanation: "İlk cümle PACE gözleminin tarihini verir.",
            hint: "İlk cümledeki görüntü tarihini tara.",
          },
          {
            key: "a56-patagonia-2",
            prompt: "Farklı renk şeritleri neyi yansıtıyor olabilir?",
            correct: "Farklı plankton topluluklarının karışımını",
            distractors: [
              "Sığ deniz tabanındaki mineral çizgilerini",
              "Tek bir plankton türünün kesin dağılımını",
              "Algılayıcıların yüzeyde bıraktığı gölgeleri",
            ],
            explanation:
              "Üçüncü cümle renklerin karışık toplulukları yansıtmasının olası olduğunu söyler.",
            hint: "Üçüncü cümlede olasılık bildiren açıklamayı bul.",
          },
          {
            key: "a56-patagonia-3",
            prompt: "Türleri görüntüden belirleme yöntemi hakkında hangi ifade doğrudur?",
            correct: "Geliştirilen ayırma aracı umut verici olsa da yöntem sürmektedir",
            distractors: [
              "Uzaktan algılama ile plankton türleri artık kesin biçimde ayrılmaktadır",
              "PACE dalga boyu ölçümleri her türü doğrudan adıyla gösterir",
              "Geliştirilen araç farklı türleri tüm koşullarda kesin sınıflandırır",
            ],
            explanation:
              "Son iki cümle uzaktan tür belirleme zorluğunu ve geliştirme aşamasındaki aracı açıklar.",
            hint: "Son cümlede yöntemin mevcut durumunu seç.",
          },
        ],
      },
      {
        key: "a56-assessment-observation-limits",
        title: "Uydu renklerinden yapılabilecek ve yapılamayacak çıkarımları değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_CLAIM_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Fitoplankton ve toz görüntülerinde doğrudan gözlemi, açıklamayı ve kesinlik sınırını ayırır.",
        textTitle: "Gözlemden yoruma",
        text: "Uydu görüntüleri okyanus yüzeyindeki renkli desenleri ve Sahra tozunun açık deniz üzerindeki izini gösterebilir. Baltık Denizi örneğinde Landsat 9, 20 Temmuz 2025'te parlak yeşil alanları görüntüledi; uzmanların yüzey verileri bu alanda siyanobakteri bulunduğunu bildirdi. Başka bir görüntüde Sahra tozu yarı saydam bej, bulutlar opak beyaz görünüyordu. Görüntü rengi araştırmaya ipucu verir; canlı türünü veya her parçacığın yapısını tek başına kesinleştirmez.",
        sourceTitle: "Brilliant Bloom in the Baltic Sea; Dust off Northwestern Africa",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/brilliant-bloom-in-the-baltic-sea-154581/",
        additionalSources: [
          {
            title: "Dust off Northwestern Africa",
            url: "https://science.nasa.gov/earth/earth-observatory/dust-off-northwestern-africa-17667",
          },
        ],
        verifiedFacts: [
          "Landsat 9'ın 20 Temmuz 2025 Baltık görüntüsündeki fitoplankton türü görüntüden tek başına belirlenemez; yüzeyde siyanobakteri olduğu uzmanlarca bildirilmiştir.",
          "Terra MODIS'in 21 Kasım 2006 Kuzeybatı Afrika görüntüsünde toz yarı saydam bej, bulutlar opak beyaz görünür.",
        ],
        contentRelation:
          "Değerlendirme, iki ayrı NASA gözleminde görünen renkleri ve uzman verisiyle desteklenen tanımlamayı ayırır; görüntü yorumunun sınırını sınar.",
        questions: [
          {
            key: "a56-assess-1",
            prompt: "Baltık Denizi görüntüsü hangi gün alınmıştır?",
            correct: "20 Temmuz 2025'te",
            distractors: ["21 Kasım 2006'da", "10 Ocak 2026'da", "20 Temmuz 2026'da"],
            explanation: "İkinci cümle Landsat görüntüsünün tarihini belirtir.",
            hint: "Baltık örneğini anlatan cümledeki tarihi bul.",
          },
          {
            key: "a56-assess-2",
            prompt: "Sahra tozu ve bulutlar görüntüde nasıl ayrılıyordu?",
            correct: "Toz bej ve yarı saydam, bulutlar beyaz ve opak",
            distractors: [
              "Toz beyaz ve opak, bulutlar bej ve yarı saydam",
              "Toz yeşil ve geçirgen, bulutlar mavi ve yoğun",
              "Toz ile bulut aynı renkte, geçirgenlikleri farklı",
            ],
            explanation: "Üçüncü cümle iki yüzeyin renk ve geçirgenlik görünümünü karşılaştırır.",
            hint: "Üçüncü cümledeki iki nitelemeyi eşleştir.",
          },
          {
            key: "a56-assess-3",
            prompt: "Uydu görüntüsü bir plankton türünü tek başına kesinleştirir mi?",
            correct: "Hayır; tür için ek uzman/yüzey kanıtı gerekir",
            distractors: [
              "Evet; her renk yalnızca bir türe karşılık gelir",
              "Evet; bulut rengi türü belirler",
              "Hayır; görüntüler hiçbir renk göstermez",
            ],
            explanation:
              "İkinci ve son cümleler görüntünün türü tek başına belirlemediğini, ek kanıt kullanıldığını açıklar.",
            hint: "Son cümlede görüntünün tek başına neyi belirleyemediğini bul.",
          },
        ],
      },
    ],
  },
] as const;
