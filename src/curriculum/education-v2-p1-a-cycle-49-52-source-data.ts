/** Source-checked, original Turkish readings and evidence-based questions for Cycles 49–52. */
export const EDUCATION_V2_P1_A_CYCLE_49_52_SOURCE_DATA = [
  {
    sequence: 49,
    stations: [
      {
        key: "a49-fast-tonga-timeline",
        title: "Tonga patlamasının zaman sırasını hızla bul",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_SEQUENCE"],
        outcome: "Tonga'daki patlamaların tarih sırasını metinden hızla belirler.",
        textTitle: "Tonga'da gün gün değişim",
        text: "Hunga Tonga-Hunga Ha'apai çevresinde etkinlik Aralık 2021'in sonlarında yeniden başladı. 13 Ocak 2022'de güçlü patlamalar görüldü; 15 Ocak'ta çok daha yoğun bir patlama atmosferik şok dalgaları ve tsunami dalgaları oluşturdu. Dünya gözlem uyduları olay sırasında ve sonrasında veri topladı. Görüntülerde geniş bir kül ve parçacık bulutu belirdi.",
        sourceTitle: "Hunga Tonga-Hunga Ha'apai Erupts",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/hunga-tonga-hunga-haapai-erupts-149347/",
        verifiedFacts: [
          "Etkinlik Aralık 2021 sonlarında başladı; güçlü patlamalar 13 Ocak'ta, daha yoğun patlamalar 15 Ocak 2022'de gerçekleşti.",
          "15 Ocak olayı atmosferik şok dalgaları ve tsunami oluşturdu; uydular olay sırasında ve sonrasında veri topladı.",
        ],
        contentRelation: "Özgün metin kaynakta bildirilen olay sırasını ve uydu gözlemini aktarır.",
        questions: [
          {
            key: "a49-timeline-1",
            prompt: "Daha yoğun patlama hangi tarihte gerçekleşti?",
            correct: "15 Ocak 2022'de",
            distractors: ["13 Aralık 2021'de", "13 Ocak 2022'de", "15 Şubat 2022'de"],
            explanation: "Metin, çok daha yoğun patlamayı 15 Ocak 2022 ile ilişkilendirir.",
            hint: "İkinci cümledeki en yoğun olayın tarihini bul.",
          },
          {
            key: "a49-timeline-2",
            prompt: "15 Ocak'taki patlamayla birlikte hangi iki dalga türü oluştu?",
            correct: "Atmosferik şok ve tsunami dalgaları",
            distractors: [
              "Gelgit ve kıyı akıntısı dalgaları",
              "Işık ve radyo iletim dalgaları",
              "Rüzgâr ve yağış kaynaklı dalgalar",
            ],
            explanation:
              "İkinci cümle atmosferik şok dalgalarıyla tsunami dalgalarını birlikte sayar.",
            hint: "İkinci cümlede iki kez geçen 'dalga' ifadesini tara.",
          },
          {
            key: "a49-timeline-3",
            prompt: "Uydular olayın hangi aşamalarında veri topladı?",
            correct: "Olay sırasında ve sonrasında",
            distractors: [
              "Yalnızca yıllar önce",
              "Sadece patlamadan önce",
              "Yalnızca kıyıdaki ölçümlerde",
            ],
            explanation:
              "Üçüncü cümle uyduların olay sırasında ve sonrasında veri topladığını belirtir.",
            hint: "Üçüncü cümledeki zaman ifadesini seç.",
          },
        ],
      },
      {
        key: "a49-comprehension-ruang-images",
        title: "Ruang'ın uydu görüntülerindeki değişimi açıkla",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_EVIDENCE", "RC_DETAIL"],
        outcome:
          "Ruang'ın patlama öncesi ve sonrası görüntülerini karşılaştırıp görünür değişimi açıklar.",
        textTitle: "Patlamadan önce ve sonra",
        text: "Landsat uyduları Ruang Adası'nın 12 ve 20 Nisan 2024 tarihli görüntülerini sağladı. İlk görüntüde bitki örtüsü yeşil görünürken ikinci görüntüde kül ve volkanik parçalar adanın yüzeyini kapladı. Karşılaştırma, aynı yerin iki tarihte nasıl değiştiğini gösterir. Görüntüler patlamanın tüm etkilerini tek başına açıklamaz; araştırmacılar başka gözlem ve bilgilerden de yararlanır.",
        sourceTitle: "A Blanket of Ash from Ruang",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/a-blanket-of-ash-from-ruang-152716/",
        verifiedFacts: [
          "Landsat görüntüleri 12 ve 20 Nisan 2024 tarihlerinde alındı; ikinci görüntüde yüzeyi kül ve volkanik parçalar kapladı.",
          "NASA yazısı aynı bölgenin önce-sonra görüntülerini karşılaştırır.",
        ],
        contentRelation:
          "Metin, kaynaktaki iki tarihli Landsat görüntüsünün karşılaştırmasını ve gözlem sınırını açıklar.",
        questions: [
          {
            key: "a49-ruang-1",
            prompt: "İki Landsat görüntüsü hangi tarihlerde alındı?",
            correct: "12 ve 20 Nisan 2024'te",
            distractors: [
              "12 ve 20 Ocak 2022'de",
              "3 ve 7 Temmuz 2025'te",
              "12 ve 20 Nisan 2023'te",
            ],
            explanation: "İlk cümle görüntü tarihlerini 12 ve 20 Nisan 2024 olarak verir.",
            hint: "İlk cümledeki iki tarihi birlikte bul.",
          },
          {
            key: "a49-ruang-2",
            prompt: "İkinci görüntüde yüzeyde ne görülüyordu?",
            correct: "Kül ve volkanik parçalar",
            distractors: ["Yeni buz örtüsü", "Yoğun kar tabakası", "Yalnızca deniz köpüğü"],
            explanation: "İkinci cümle kül ve volkanik parçaların yüzeyi kapladığını söyler.",
            hint: "İkinci cümlede yüzeyi kaplayan malzemeyi bul.",
          },
          {
            key: "a49-ruang-3",
            prompt: "İki tarihli görüntü karşılaştırması en doğrudan neyi gösterir?",
            correct: "Aynı yerin zaman içindeki görünür değişimini",
            distractors: [
              "Patlamanın tüm etkilerinin nedenini",
              "Adadaki her canlının durumunu",
              "Volkanın gelecekte ne zaman patlayacağını",
            ],
            explanation:
              "Üçüncü ve dördüncü cümleler karşılaştırmanın görünür değişimi gösterdiğini, tüm etkileri tek başına açıklamadığını belirtir.",
            hint: "Üçüncü cümlede görüntü karşılaştırmasının neyi gösterdiğini seç.",
          },
        ],
      },
      {
        key: "a49-common-home-reef",
        title: "Home Reef'te oluşum ve aşınma izlerini karşılaştır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_CAUSE_EFFECT", "RC_DETAIL"],
        outcome:
          "Home Reef adasının büyüme ve aşınma süreçlerinin kıyı çizgisini değiştirebildiğini karşılaştırır.",
        textTitle: "Denizin içindeki genç ada",
        text: "Tonga adalarındaki Home Reef, deniz ortasında bulunan etkin bir volkandır. Burada püskürmeler yeni kara oluşturabilir; dalga ve aşınma ise küçük adanın bir bölümünü zamanla ortadan kaldırabilir. Haziran 2024'teki etkinlikte lav akışı adanın alanına ek yaptı ve kıyı çizgisini doğuya doğru genişletti. Landsat 9 görüntüsü aynı zamanda çevredeki deniz suyundaki renk değişimini gösterdi.",
        sourceTitle: "Home Reef Volcano Grows",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/home-reef-volcano-grows-153003/",
        verifiedFacts: [
          "Home Reef'te püskürme ve aşınma dönemleri küçük adayı oluşturup yok edebiliyor.",
          "Haziran 2024 etkinliğinde lav akışı kara alanını artırdı ve kıyıyı doğuya doğru genişletti; Landsat 9 görüntüsü su rengini de gösterdi.",
        ],
        contentRelation:
          "Özgün metin kaynaktaki dönemsel ada oluşumu, lavla büyüme ve uydu gözlemini ayırır.",
        questions: [
          {
            key: "a49-reef-1",
            prompt: "Home Reef'te küçük adanın alanını hangi süreçler değiştirebilir?",
            correct: "Püskürmeler ve aşınma",
            distractors: [
              "Yalnızca gelgit saatleri",
              "Bulut oluşumu ve rüzgâr",
              "Kar yağışı ve donma",
            ],
            explanation:
              "İkinci cümle püskürmelerin kara oluşturabildiğini, aşınmanın ise adanın bir bölümünü yok edebildiğini söyler.",
            hint: "İkinci cümlede ada için belirtilen iki süreci bul.",
          },
          {
            key: "a49-reef-2",
            prompt: "Haziran 2024'te kıyı çizgisi hangi yöne genişledi?",
            correct: "Doğuya doğru",
            distractors: ["Batıya doğru", "Kuzeye doğru", "Güneye doğru"],
            explanation: "Üçüncü cümlede kıyının doğuya doğru genişlediği belirtilir.",
            hint: "Üçüncü cümlede yön bildiren sözcüğü tara.",
          },
          {
            key: "a49-reef-3",
            prompt: "Landsat 9 görüntüsünde lav akışının yanı sıra hangi değişim görülüyordu?",
            correct: "Deniz suyundaki renk değişimi",
            distractors: [
              "Adanın iç kesimlerindeki sıcaklık",
              "Deniz tabanındaki çatlakların yeri",
              "Yakındaki gemilerin izlediği yön",
            ],
            explanation:
              "Son cümle görüntünün çevredeki deniz suyundaki renk değişimini de gösterdiğini söyler.",
            hint: "Son cümlede görüntünün gösterdiği ikinci unsuru bul.",
          },
        ],
      },
      {
        key: "a49-integrated-tonga-plume",
        title: "Tonga bulutunun atmosferdeki yüksekliğini değerlendir",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_DATA_INTERPRETATION", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Uydu gözlemlerinden volkanik bulutun yüksekliğine ilişkin çıkarımı ve ölçüm sınırını ayırt eder.",
        textTitle: "Bulut ne kadar yükseldi?",
        text: "NASA araştırmacıları, Ocak 2022'deki Hunga Tonga patlamasının bulutunu iki hava uydusunun verileriyle izledi. Uydu ölçümlerini inceleyen ekip, yükselen malzemenin atmosferin mezosfer katmanına kadar ulaştığını hesapladı; yüksekliğin yaklaşık 58 kilometre olduğu bildirildi. Bu değer, görüntü ve ölçümlerin birlikte yorumlanmasından elde edilen bir tahmindir. Tek bir uydu fotoğrafı, bulutun bileşimini veya bütün etkilerini tek başına vermez.",
        sourceTitle: "Tonga Volcano Plume Reached the Mesosphere",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/tonga-volcano-plume-reached-the-mesosphere-149474/",
        verifiedFacts: [
          "İki hava uydusu Tonga patlaması bulutunun yüksekliğini ve genişliğini gözlemledi.",
          "NASA makalesi bulutun yaklaşık 58 kilometre yükselerek mezosfere ulaştığını bildirir.",
        ],
        contentRelation:
          "Metin, uydu gözlemini yükseklik tahmininden ayırır ve fotoğrafın tek başına kanıtlayamayacağı bilgileri belirtir.",
        questions: [
          {
            key: "a49-plume-1",
            prompt: "Araştırmacılar bulutun yüksekliğini hangi veriyle inceledi?",
            correct: "İki hava uydusunun gözlemleriyle",
            distractors: [
              "Tek bir kıyı termometresiyle",
              "Yalnızca gemi günlükleriyle",
              "Ay yüzeyindeki radarlarla",
            ],
            explanation: "İlk cümle bulutun iki hava uydusunun verileriyle izlendiğini belirtir.",
            hint: "İlk cümlede gözlem araçlarını belirle.",
          },
          {
            key: "a49-plume-2",
            prompt: "Makalede bildirilen yaklaşık bulut yüksekliği kaç kilometredir?",
            correct: "58 kilometre",
            distractors: ["15 kilometre", "5 kilometre", "580 kilometre"],
            explanation: "İkinci cümle yaklaşık 58 kilometrelik yüksekliği verir.",
            hint: "İkinci cümledeki yaklaşık ölçümü seç.",
          },
          {
            key: "a49-plume-3",
            prompt: "Bu yükseklik bilgisi nasıl elde edilmiştir?",
            correct: "Uydu ölçümlerinin birlikte yorumlanmasıyla",
            distractors: [
              "Yalnızca fotoğrafın rengine bakılarak",
              "Bir tanığın göz kararıyla",
              "Deniz seviyesindeki dalga sayılarak",
            ],
            explanation:
              "İkinci ve üçüncü cümleler yüksekliğin uydu verilerinden hesaplanan bir tahmin olduğunu açıklar.",
            hint: "İkinci ve üçüncü cümlelerde ölçümün nasıl yorumlandığını izle.",
          },
        ],
      },
      {
        key: "a49-assessment-lewotobi",
        title: "Lewotobi gözlemlerini kanıt ve çıkarım açısından değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Uydu görüntüsündeki kül izlerini ve raporlanan etkinliği kanıta dayalı biçimde birleştirir.",
        textTitle: "Landsat'ın kaydettiği kül izi",
        text: "Endonezya'nın Flores Adası'ndaki Lewotobi Laki-Laki yanardağı 2023 sonlarında yeniden etkinleşti. Landsat 9, 5 Kasım 2024'teki görüntüsünde kraterin batısındaki arazinin kül nedeniyle koyulaştığını gösterdi; önceki görüntü 12 Ekim'de alınmıştı. Ülkenin izleme kurumu güçlü patlamadan önce derin volkanik deprem sayısında artış bildirdi. Uydu görüntüsü yüzeydeki kül izini gösterir; deprem verisi ise etkinlik öncesindeki ayrı bir işarettir.",
        sourceTitle: "Mount Lewotobi Laki-Laki Spews Ash",
        sourceUrl:
          "https://science.nasa.gov/earth/earth-observatory/mount-lewotobi-laki-laki-spews-ash-153549/",
        verifiedFacts: [
          "Landsat 9'ın 5 Kasım görüntüsü, 12 Ekim görüntüsüyle karşılaştırıldığında kraterin batısındaki arazide kül kaynaklı koyulaşma gösterdi.",
          "Endonezya izleme kurumu güçlü patlamadan önce derin volkanik deprem sayısında artış bildirdi.",
        ],
        contentRelation:
          "Değerlendirme uydu görüntüsünün gösterdiği yüzey izini, izleme kurumunun bildirdiği deprem bulgusundan ayırır.",
        questions: [
          {
            key: "a49-assess-1",
            prompt: "Landsat 9 görüntüsü hangi tarihte alındı?",
            correct: "5 Kasım 2024'te",
            distractors: ["12 Ekim 2023'te", "7 Temmuz 2025'te", "15 Ocak 2022'de"],
            explanation: "İkinci cümle Landsat 9 görüntüsünü 5 Kasım 2024'e tarihler.",
            hint: "İkinci cümlede görüntünün tarihini bul.",
          },
          {
            key: "a49-assess-2",
            prompt: "Görüntüde kraterin batısındaki koyulaşma neyle ilişkilendirildi?",
            correct: "Arazide biriken külle",
            distractors: [
              "Yeni bitki örtüsüyle",
              "Deniz suyunun gelgitiyle",
              "Bulut gölgesinin kesin ölçümüyle",
            ],
            explanation: "İkinci cümle batıdaki arazinin kül nedeniyle koyulaştığını açıklar.",
            hint: "İkinci cümlede koyulaşmanın nedenini seç.",
          },
          {
            key: "a49-assess-3",
            prompt: "Metne göre deprem sayısındaki artış hangi kanıt türüdür?",
            correct: "Deprem verisine dayalı ayrı bir işaret",
            distractors: [
              "Landsat'ın ölçtüğü kül miktarı",
              "Uydu görüntüsündeki renk değişimi",
              "Patlama sonrası kıyı çizgisi değişimi",
            ],
            explanation:
              "Son cümle deprem verisini uydu görüntüsündeki kül izinden ayrı bir işaret olarak tanımlar.",
            hint: "Son cümlede iki kanıt türünün nasıl ayrıldığını oku.",
          },
        ],
      },
    ],
  },
  {
    sequence: 50,
    stations: [
      {
        key: "a50-fast-cycle-sunspots",
        title: "Güneş döngüsünü leke sayısıyla hızla izle",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_DETAIL"],
        outcome: "Güneş lekesi sayısının döngüsel değişimini ve izleme amacını belirler.",
        textTitle: "Güneş'teki değişimi saymak",
        text: "Güneş'in etkinliği yaklaşık 11 yıllık bir döngü içinde artıp azalır. Etkin döneme yaklaşırken Güneş lekelerinin sayısı belirgin biçimde yükselir; daha sakin dönemde ise azalır. Bilim insanları yüzyıllardır bu lekeleri sayarak döngünün ilerleyişini izliyor. Günümüzde uzay araçlarının görüntüleri de sayımlara yardımcı oluyor.",
        sourceTitle: "Track the Solar Cycle with Sunspots",
        sourceUrl: "https://science.nasa.gov/sun/track-the-solar-cycle-with-sunspots/",
        verifiedFacts: [
          "Güneş etkinliği yaklaşık 11 yıllık döngüde artıp azalır.",
          "Leke sayımı yüzyıllardır döngüyü izlemek için kullanılır; NASA uzay aracı görüntüleri bu çalışmaya yardım eder.",
        ],
        contentRelation:
          "Özgün metin kaynakta açıklanan döngü, leke sayısı ve gözlem aracını bir araya getirir.",
        questions: [
          {
            key: "a50-cycle-1",
            prompt: "Güneş etkinliği yaklaşık kaç yıllık bir döngüde değişir?",
            correct: "11 yıllık",
            distractors: ["2 yıllık", "5 yıllık", "50 yıllık"],
            explanation: "İlk cümle döngünün yaklaşık 11 yıl sürdüğünü söyler.",
            hint: "İlk cümledeki süreyi bul.",
          },
          {
            key: "a50-cycle-2",
            prompt: "Güneş etkinliği yükseldiğinde leke sayısı genellikle nasıl değişir?",
            correct: "Artar",
            distractors: ["Sabit kalır", "Tamamen yok olur", "Önceki sayıya eşitlenir"],
            explanation:
              "İkinci cümle etkin döneme yaklaşırken leke sayısının yükseldiğini belirtir.",
            hint: "İkinci cümledeki yönü belirle.",
          },
          {
            key: "a50-cycle-3",
            prompt: "Bilim insanları Güneş lekelerini sayarak neyi izler?",
            correct: "Güneş döngüsünün ilerleyişini",
            distractors: [
              "Dünya'nın günlük dönüşünü",
              "Ay'ın yüzey sıcaklığını",
              "Gezegenlerin atmosfer basıncını",
            ],
            explanation: "Üçüncü cümle leke sayımının döngüyü izlemek için kullanıldığını açıklar.",
            hint: "Üçüncü cümlede sayımın amacını seç.",
          },
        ],
      },
      {
        key: "a50-comprehension-sunspots",
        title: "Güneş lekelerinin neden koyu göründüğünü açıkla",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_CAUSE_EFFECT", "RC_DETAIL", "RC_EVIDENCE"],
        outcome:
          "Güneş lekelerinin güçlü manyetik alanlarla ve çevresine göre daha düşük sıcaklıkla ilişkisini açıklar.",
        textTitle: "Güneş'teki koyu bölgeler",
        text: "Güneş lekeleri, Güneş'in görünür katmanında seçilen daha koyu bölgelerdir. Bu bölgelerde manyetik alan çizgileri yoğunlaşır; alanların oluşturduğu karmaşık yapı ısının yüzeye akışını azaltabilir. Bu yüzden lekeler çevresindeki bölgelere göre daha soğuktur. Daha soğuk olmaları, çevrelerinden daha az ışık yaymalarına ve koyu görünmelerine yol açar.",
        sourceTitle: "Sunspots",
        sourceUrl: "https://science.nasa.gov/sun/sunspots/",
        verifiedFacts: [
          "Güneş lekeleri, yoğun manyetik alan çizgileriyle ilişkili daha soğuk bölgelerdir.",
          "Manyetik düğümlenmeler ısının yüzeye akışını engelleyerek koyu görünüşe katkıda bulunur.",
        ],
        contentRelation:
          "Metin, koyu görünüşü daha düşük sıcaklıkla ilişkilendiren kaynak açıklamasını neden-sonuç sırasıyla verir.",
        questions: [
          {
            key: "a50-spots-1",
            prompt: "Güneş lekeleri hangi katmanda görülebilir?",
            correct: "Güneş'in görünür katmanında",
            distractors: [
              "Dünya'nın okyanus tabanında",
              "Ay'ın iç çekirdeğinde",
              "Güneş'in yörüngesindeki boşlukta",
            ],
            explanation: "İlk cümle lekelerin Güneş'in görünür katmanında seçildiğini belirtir.",
            hint: "İlk cümlede lekenin bulunduğu yeri bul.",
          },
          {
            key: "a50-spots-2",
            prompt: "Metne göre manyetik alan yapısı ısı akışını nasıl etkileyebilir?",
            correct: "Yüzeye doğru akışı azaltabilir",
            distractors: [
              "Isıyı Ay'a aktarabilir",
              "Tüm ısıyı ışığa dönüştürür",
              "Güneş'in dönüşünü durdurur",
            ],
            explanation:
              "İkinci cümle karmaşık manyetik yapının ısının yüzeye akışını azaltabileceğini söyler.",
            hint: "İkinci cümledeki etkiyi seç.",
          },
          {
            key: "a50-spots-3",
            prompt: "Güneş lekeleri neden çevrelerine göre koyu görünür?",
            correct: "Daha soğuk oldukları için daha az ışık yayarlar",
            distractors: [
              "Güneş ışığını Dünya'ya yönelttikleri için",
              "Güneş'in görünür katmanının dışında kaldıkları için",
              "Yalnızca gece gözlemlendikleri için",
            ],
            explanation:
              "Son iki cümle düşük sıcaklığın daha az ışık yayımına ve koyu görünüşe yol açtığını açıklar.",
            hint: "Üçüncü ve dördüncü cümlelerdeki neden-sonuç zincirini izle.",
          },
        ],
      },
      {
        key: "a50-common-flare-cme",
        title: "Güneş patlamasıyla madde püskürmesini ayır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_DETAIL", "RC_EVIDENCE"],
        outcome:
          "Güneş patlaması ve koronal kütle atımının metinde tanımlanan farklı özelliklerini karşılaştırır.",
        textTitle: "Işık patlaması ve parçacık bulutu",
        text: "Güneş patlaması, Güneş'te manyetik enerjinin açığa çıkmasıyla oluşan yoğun ışık ve parçacık çıkışıdır. Koronal kütle atımı ise uzaya fırlatılan büyük, manyetik yüklü madde bulutudur. İki olay birlikte görülebilse de aynı şey değildir. Dünya'ya yönelen bir kütle atımı manyetik çevremizi etkileyebilir; bu etki uzay araçları ve bazı altyapılar açısından önem taşır.",
        sourceTitle: "Solar Storms and Flares",
        sourceUrl: "https://science.nasa.gov/sun/solar-storms-and-flares/",
        verifiedFacts: [
          "Güneş patlamaları manyetik enerjinin açığa çıkmasıyla ilişkilidir.",
          "Koronal kütle atımları Güneş'ten uzaya fırlayan büyük manyetize parçacık bulutlarıdır; Dünya'ya yönelirse manyetik fırtınalar oluşturabilir.",
        ],
        contentRelation:
          "Metin iki Güneş olayının tanımlarını ayırır ve kaynakta belirtilen olası Dünya etkisini sınırlandırır.",
        questions: [
          {
            key: "a50-storm-1",
            prompt: "Güneş patlaması hangi enerjiyle ilişkilidir?",
            correct: "Güneş manyetik enerjisinin açığa çıkmasıyla",
            distractors: [
              "Dünya okyanus akıntılarının yön değiştirmesiyle",
              "Ay gelgitlerinin kıyılarda yükselip alçalmasıyla",
              "Yıldızlararası buzun Güneş ışığıyla erimesiyle",
            ],
            explanation:
              "İlk cümle Güneş patlamasını manyetik enerjinin açığa çıkmasıyla ilişkilendirir.",
            hint: "İlk cümlede olayın enerji kaynağını ara.",
          },
          {
            key: "a50-storm-2",
            prompt: "Koronal kütle atımı nasıl tanımlanır?",
            correct: "Uzaya fırlatılan büyük manyetik madde bulutu",
            distractors: [
              "Güneş yüzeyinde sabit duran koyu leke",
              "Dünya'dan çıkan bir radyo sinyali",
              "Ay çevresinde dönen buz halkası",
            ],
            explanation:
              "İkinci cümlede kütle atımı büyük ve manyetik yüklü madde bulutu olarak tanımlanır.",
            hint: "İkinci cümledeki tanımı seç.",
          },
          {
            key: "a50-storm-3",
            prompt: "Metin bu iki olayın ilişkisini nasıl açıklar?",
            correct: "Birlikte görünür, fakat farklı olaylardır",
            distractors: [
              "Birlikte görünseler de birbirini yok ederler",
              "Yalnızca Dünya’da gerçekleşen iki olaydır",
              "Aynı ölçüm aracının verdiği iki addır",
            ],
            explanation:
              "Üçüncü cümle birlikte görülebilmelerini, ancak aynı şey olmadıklarını açıkça belirtir.",
            hint: "Üçüncü cümledeki karşılaştırmayı bul.",
          },
        ],
      },
      {
        key: "a50-integrated-aurora",
        title: "Kutup ışıklarını Güneş kaynaklı kanıtla ilişkilendir",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_CAUSE_EFFECT", "RC_METHOD", "RC_LIMITS"],
        outcome:
          "Güneş'ten gelen yüklü parçacıklar ile Dünya çevresindeki manyetik etkinlik arasındaki ilişkiyi açıklar.",
        textTitle: "Gökyüzündeki ışıkların kaynağı",
        text: "Güneş'ten uzaya yayılan parçacıklar Dünya'nın manyetik çevresine ulaştığında aurora oluşumunu destekleyebilir. Güneş'teki koronal kütle atımları, Dünya'ya yönelirse manyetik fırtınaları güçlendirebilir. Bu süreçlerin etkisi her olayda aynı değildir; parçacıkların yönü ve Dünya çevresindeki koşullar önem taşır. Bu nedenle tek bir aurora görüntüsü, Güneş'teki olayın bütün özelliklerini göstermez.",
        sourceTitle: "Auroras",
        sourceUrl: "https://science.nasa.gov/sun/auroras/",
        verifiedFacts: [
          "Güneş kaynaklı yüklü parçacıklar ve koronal kütle atımları Dünya'nın manyetik çevresiyle etkileşebilir.",
          "Dünya'ya yönelen hızlı kütle atımları manyetik fırtınaları güçlendirebilir.",
        ],
        contentRelation:
          "Özgün metin aurora ve manyetik fırtına ilişkisini koşullu anlatır, tek görüntüden geniş sonuç çıkarmaz.",
        questions: [
          {
            key: "a50-aurora-1",
            prompt: "Aurora oluşumunu destekleyen parçacıklar nereden gelir?",
            correct: "Güneş’ten uzaya yayılan parçacıklardan",
            distractors: [
              "Okyanus tabanındaki sıcak kaynaklardan",
              "Ay yüzeyindeki kayaların parçalanmasından",
              "Dünya atmosferindeki bulut oluşumundan",
            ],
            explanation: "İlk cümle parçacıkların Güneş'ten uzaya yayıldığını söyler.",
            hint: "İlk cümlede parçacıkların kaynağını bul.",
          },
          {
            key: "a50-aurora-2",
            prompt: "Dünya'ya yönelen koronal kütle atımları neyi güçlendirebilir?",
            correct: "Manyetik fırtınaları",
            distractors: ["Gelgit akıntılarını", "Ay'ın dönüşünü", "Kıyı rüzgârlarını"],
            explanation:
              "İkinci cümle Dünya'ya yönelen atımların manyetik fırtınaları güçlendirebildiğini belirtir.",
            hint: "İkinci cümledeki olası sonucu seç.",
          },
          {
            key: "a50-aurora-3",
            prompt: "Tek bir aurora görüntüsü neden Güneş olayının bütün özelliklerini vermez?",
            correct: "Yön ve çevre koşulları her olayda değişebilir",
            distractors: [
              "Fotoğraf, Dünya’nın manyetik alanını tek başına ölçer",
              "Bulut örtüsü aurora ışığını yere yansıtarak gösterir",
              "Renk değişimi Güneş olaylarının büyüklüğünü doğrudan verir",
            ],
            explanation:
              "Üçüncü ve dördüncü cümleler koşulların değişebildiğini ve tek görüntünün tüm özellikleri göstermediğini söyler.",
            hint: "Son iki cümledeki sınırlama ve koşulları ilişkilendir.",
          },
        ],
      },
      {
        key: "a50-assessment-solar-wind",
        title: "Güneş rüzgârı ve döngü kanıtlarını birlikte değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Güneş rüzgârı, koronal delik ve 11 yıllık etkinlik döngüsünü metin kanıtıyla birleştirir.",
        textTitle: "Güneş'ten uzaya taşınan akış",
        text: "Güneş, uzaya her yönde elektrik yüklü gaz akışı gönderir; bu akışa Güneş rüzgârı denir. Güneş'in manyetik alanı da bu akışla Güneş Sistemi boyunca taşınır. Koronal delikler, çevresine göre daha seyrek bölgeler olarak görülür ve hızlı Güneş rüzgârının çıkabildiği alanlarla ilişkilidir. Güneş etkinliği yaklaşık 11 yıllık döngü içinde değiştiğinden, gözlemler zaman içinde karşılaştırılır.",
        sourceTitle: "Sun: Facts",
        sourceUrl: "https://science.nasa.gov/sun/facts/",
        verifiedFacts: [
          "Güneş rüzgârı Güneş'ten dışarı akan elektrik yüklü gazdır ve manyetik alanı taşır.",
          "Koronal delikler, hızlı Güneş rüzgârı akışlarının çıkabildiği düşük yoğunluklu bölgelerdir; Güneş etkinliği yaklaşık 11 yıllık döngü izler.",
        ],
        contentRelation:
          "Değerlendirme kaynakta açıklanan Güneş rüzgârı, koronal delik ve döngü bilgisini birlikte kullanır.",
        questions: [
          {
            key: "a50-assess-1",
            prompt: "Güneş rüzgârı metinde nasıl tanımlanır?",
            correct: "Güneş'ten uzaya akan elektrik yüklü gaz",
            distractors: [
              "Dünya atmosferindeki bulut akımı",
              "Ay yüzeyinden çıkan su buharı",
              "Yıldızlar arası katı toz tabakası",
            ],
            explanation: "İlk cümle Güneş rüzgârını elektrik yüklü gaz akışı olarak tanımlar.",
            hint: "İlk cümledeki tanımı seç.",
          },
          {
            key: "a50-assess-2",
            prompt: "Koronal deliklerin hangi akışla ilişkisi vardır?",
            correct: "Hızlı Güneş rüzgârıyla",
            distractors: [
              "Yavaş okyanus gelgitiyle",
              "Ay'dan gelen tozla",
              "Dünya'daki yağış akışıyla",
            ],
            explanation:
              "Üçüncü cümle koronal delikleri hızlı Güneş rüzgârının çıkabildiği alanlarla ilişkilendirir.",
            hint: "Üçüncü cümlede koronal deliklerin yakınındaki akışı bul.",
          },
          {
            key: "a50-assess-3",
            prompt:
              "Güneş etkinliğini anlamak için neden farklı zamanlardaki gözlemler karşılaştırılır?",
            correct: "Etkinlik yaklaşık 11 yıllık döngüde değiştiği için",
            distractors: [
              "Güneş her gün aynı göründüğü için",
              "Koronal delikler Dünya'nın mevsimlerini oluşturduğu için",
              "Güneş rüzgârı yalnızca geceleri estiği için",
            ],
            explanation:
              "Son cümle etkinliğin döngüsel değiştiğini ve bu nedenle zaman içi karşılaştırma yapıldığını söyler.",
            hint: "Son cümledeki gerekçeyi bul.",
          },
        ],
      },
    ],
  },
  {
    sequence: 51,
    stations: [
      {
        key: "a51-fast-transit",
        title: "Geçiş yönteminin ışık izini hızla bul",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_DETAIL"],
        outcome: "Bir ötegezegen geçişinin yıldız ışığında oluşturduğu ölçülebilir izi belirler.",
        textTitle: "Yıldız ışığındaki küçük düşüş",
        text: "Bir ötegezegen, gözlemci ile yörüngesinde bulunduğu yıldızın arasından geçerse yıldız ışığının küçük bir bölümünü engeller. Bu sırada yıldız kısa süreliğine daha sönük görünür. Teleskoplar parlaklığın zaman içindeki değişimini ölçer; bu ölçümler ışık eğrisi olarak gösterilebilir. Yöntem gezegeni doğrudan fotoğraflamak yerine, yıldız ışığındaki düzenli düşüşten ipucu çıkarır.",
        sourceTitle: "What's a Transit?",
        sourceUrl: "https://science.nasa.gov/exoplanets/whats-a-transit/",
        verifiedFacts: [
          "Geçiş, gezegenin yıldız ile gözlemci arasından geçmesidir.",
          "Geçiş yıldız ışığında küçük bir parlaklık düşüşü oluşturur; bu düşüş ışık eğrisinde izlenebilir.",
        ],
        contentRelation:
          "Özgün metin geçiş yönteminin gözlem geometrisini ve ışık eğrisindeki işaretini açıklar.",
        questions: [
          {
            key: "a51-transit-1",
            prompt: "Geçiş sırasında ötegezegen hangi iki gözlem noktası arasından geçer?",
            correct: "Yıldız ile gözlemci arasından",
            distractors: [
              "İki uydu arasından",
              "Dünya ile Ay arasından",
              "Yıldızın çekirdeği ile yüzeyi arasından",
            ],
            explanation: "İlk cümle gezegenin gözlemci ile yıldız arasından geçtiğini söyler.",
            hint: "İlk cümlede konumları sırayla bul.",
          },
          {
            key: "a51-transit-2",
            prompt: "Gezegen geçerken yıldızın parlaklığı nasıl değişebilir?",
            correct: "Kısa süreliğine azalabilir",
            distractors: [
              "Sürekli sıfırlanır",
              "Her zaman iki katına çıkar",
              "Gezegenin rengiyle aynı olur",
            ],
            explanation: "İkinci cümle yıldızın kısa süreliğine daha sönük göründüğünü açıklar.",
            hint: "İkinci cümledeki parlaklık değişimini seç.",
          },
          {
            key: "a51-transit-3",
            prompt: "Işık eğrisi neyi gösterir?",
            correct: "Yıldızdan alınan ışığın zamanla değişimini",
            distractors: [
              "Gezegen yüzeyinin tüm renklerini",
              "Yıldızın içindeki gaz basıncını",
              "Teleskobun Dünya üzerindeki yüksekliğini",
            ],
            explanation:
              "Üçüncü cümle ışık eğrisini parlaklığın zaman içindeki değişimi olarak açıklar.",
            hint: "Üçüncü cümlede grafiğin gösterdiği değişkeni bul.",
          },
        ],
      },
      {
        key: "a51-comprehension-wobble",
        title: "Yıldızın yalpalamasından hangi kanıtın çıkarıldığını açıkla",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_CAUSE_EFFECT", "RC_METHOD", "RC_DETAIL"],
        outcome:
          "Bir gezegenin kütleçekim etkisinin yıldız ışığında ölçülen değişimle nasıl ilişkilendirildiğini açıklar.",
        textTitle: "Görünmeyen gezegenin çekimi",
        text: "Bir gezegen yıldızının çevresinde dolanırken yıldızını da kütleçekimiyle hafifçe hareket ettirir. Bu hareket yıldızın ışığında dalga boyu değişimleri oluşturabilir. Gökbilimciler yıldız ışığındaki bu kaymayı ölçerek yıldızın bize doğru mu yoksa bizden uzak mı hareket ettiğini araştırır. Yıldızın yalpalaması gezegenin varlığına işaret edebilir; tek başına gezegenin yüzeyini göstermez.",
        sourceTitle: "In Depth: How Do We Find Exoplanets?",
        sourceUrl: "https://science.nasa.gov/exoplanets/facts/",
        verifiedFacts: [
          "Yörüngedeki gezegenin kütleçekimi yıldızda küçük hareketler oluşturabilir.",
          "Yıldız ışığındaki tayfsal kaymalar radyal hız yönteminde incelenir; yöntem doğrudan gezegen görüntüsü değildir.",
        ],
        contentRelation:
          "Metin radyal hız yönteminin kütleçekim, yıldız hareketi ve ışık kayması zincirini verir.",
        questions: [
          {
            key: "a51-wobble-1",
            prompt: "Gezegen yıldızının hareketini hangi etkiyle oluşturabilir?",
            correct: "Gezegenin kütleçekimiyle",
            distractors: [
              "Yıldız ışığını soğurarak",
              "Yıldızın rengini boyayarak",
              "Yıldızın sıcaklığını dondurarak",
            ],
            explanation: "İlk cümle yıldızın gezegenin kütleçekimiyle hareket ettiğini belirtir.",
            hint: "İlk cümlede yıldızın hareket nedenini bul.",
          },
          {
            key: "a51-wobble-2",
            prompt: "Gökbilimciler yıldızın ışığında hangi değişimi ölçebilir?",
            correct: "Dalga boyundaki kaymayı",
            distractors: [
              "Yıldızın çevresindeki hava basıncını",
              "Gezegen yüzeyindeki krater sayısını",
              "Teleskobun kendi dönüş hızını",
            ],
            explanation:
              "İkinci ve üçüncü cümleler yıldız hareketinin ışığın dalga boyundaki kaymayla incelendiğini söyler.",
            hint: "İkinci cümlede ışıkta oluşan değişimi tara.",
          },
          {
            key: "a51-wobble-3",
            prompt: "Yıldızın yalpalaması tek başına hangi bilgiyi vermez?",
            correct: "Gezegenin yüzey görüntüsünü",
            distractors: [
              "Yıldızın hareket edebildiğini",
              "Işıkta kayma ölçülebildiğini",
              "Gezegen çekiminin etkili olabileceğini",
            ],
            explanation:
              "Son cümle yalpalamanın gezegenin varlığına işaret edebildiğini ama yüzeyini göstermediğini belirtir.",
            hint: "Son cümlede belirtilen sınırı seç.",
          },
        ],
      },
      {
        key: "a51-common-detection-methods",
        title: "Mikro mercek ve doğrudan görüntü kanıtlarını karşılaştır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_METHOD", "RC_EVIDENCE"],
        outcome:
          "Mikro mercek yöntemindeki parlaklık artışını doğrudan görüntülemenin yıldız parıltısını azaltma yöntemiyle karşılaştırır.",
        textTitle: "İki farklı gözlem yolu",
        text: "Mikro mercek yönteminde öndeki yıldızın kütleçekimi, arka plandaki yıldızın ışığını büyütebilir; çevresinde bir gezegen varsa parlaklıkta ek bir iz oluşabilir. Doğrudan görüntülemede ise teleskop, yıldızın güçlü parıltısını maskeleyerek daha sönük gezegeni görmeye çalışır. İlk yöntem ışık artışındaki değişimi, ikincisi gezegenden gelen ışığı kullanır. Her iki yaklaşım da gözlem koşullarına ve araçların yeteneğine bağlıdır.",
        sourceTitle: "How We Find and Characterize Exoplanets",
        sourceUrl: "https://science.nasa.gov/exoplanets/how-we-find-and-characterize/",
        verifiedFacts: [
          "Mikro mercek, öndeki yıldızın kütleçekiminin arka yıldız ışığını büyütmesine dayanır; gezegen ek bir parlaklık izi oluşturabilir.",
          "Doğrudan görüntüleme, yıldız ışığını koronagraf gibi araçlarla bastırarak sönük gezegeni görüntülemeye çalışır.",
        ],
        contentRelation:
          "Metin iki yöntemin gözlem sinyallerini ayırır ve sonuçların araç/koşullara bağlı olduğunu belirtir.",
        questions: [
          {
            key: "a51-methods-1",
            prompt: "Mikro mercek yönteminde arka yıldızın ışığını ne büyütebilir?",
            correct: "Öndeki yıldızın kütleçekimi",
            distractors: [
              "Gezegenin bulut örtüsü",
              "Teleskobun gövde rengi",
              "Dünya'nın okyanus gelgiti",
            ],
            explanation:
              "İlk cümle arka yıldızın ışığının öndeki yıldızın kütleçekimiyle büyüyebileceğini söyler.",
            hint: "İlk cümlede ışığı büyüten nedeni seç.",
          },
          {
            key: "a51-methods-2",
            prompt: "Doğrudan görüntülemede yıldız parıltısına ne yapılır?",
            correct: "Parıltı maskelenip bastırılmaya çalışılır",
            distractors: [
              "Yıldızın ışığı bir perdeyle bütünüyle kapatılır",
              "Gezegenin yörüngesi sabit bir noktada durdurulur",
              "Arka plandaki yıldız ışığı özellikle artırılır",
            ],
            explanation:
              "İkinci cümle teleskobun yıldızın parıltısını maskeleyerek gezegeni görmeye çalıştığını açıklar.",
            hint: "İkinci cümlede kullanılan yöntemi bul.",
          },
          {
            key: "a51-methods-3",
            prompt: "İki yöntem hangi yönden ayrılır?",
            correct: "Biri parlaklık artışını, diğeri gezegen ışığını kullanır",
            distractors: [
              "İkisi de gezegeni çıplak gözle ve doğrudan görür",
              "Biri radyo sinyali, diğeri ses titreşimi ölçer",
              "İkisi de yıldız parlaklığındaki değişimi yok sayar",
            ],
            explanation:
              "Üçüncü cümle mikro mercek sinyalindeki artışla doğrudan görüntüdeki gezegen ışığını karşılaştırır.",
            hint: "Üçüncü cümlede iki yaklaşımın kullandığı sinyalleri eşleştir.",
          },
        ],
      },
      {
        key: "a51-integrated-habitable-zone",
        title: "Yaşanabilir bölge bilgisinin sınırını çıkar",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_INFERENCE", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Yaşanabilir bölgeyi sıvı su olasılığıyla ilişkilendirir ve bu ölçütün yaşam kanıtı olmadığını çıkarır.",
        textTitle: "Uygun uzaklık, kesin yaşam değil",
        text: "Yaşanabilir bölge, bir yıldızdan olan uzaklığın yüzeyde sıvı su bulunmasına elverişli olabileceği aralıktır. Bu aralığın yeri yıldızın büyüklüğüne ve parlaklığına göre değişir. Bir gezegenin bu bölgede bulunması, yalnızca su koşulları açısından araştırmaya değer bir ipucudur. Bu bilgi tek başına atmosferi, yüzey koşullarını veya yaşamın varlığını kanıtlamaz.",
        sourceTitle: "The Habitable Zone",
        sourceUrl: "https://science.nasa.gov/exoplanets/habitable-zone/",
        verifiedFacts: [
          "Yaşanabilir bölge, yıldızdan sıvı suyun gezegen yüzeyinde bulunabileceği uzaklıktır.",
          "Bölgenin konumu yıldızın boyutu ve parlaklığına göre değişir; bu tanım yaşamın varlığını göstermez.",
        ],
        contentRelation:
          "Metin yaşanabilir bölge tanımını ve bundan çıkarılamayacak yaşam sonucunu ayırır.",
        questions: [
          {
            key: "a51-habitable-1",
            prompt: "Yaşanabilir bölge hangi olasılıkla tanımlanır?",
            correct: "Yüzeyde sıvı su bulunabilmesiyle",
            distractors: [
              "Her gezegende canlı bulunmasıyla",
              "Yıldızın hiç ışık yaymamasıyla",
              "Gezegenin Dünya ile aynı büyüklükte olmasıyla",
            ],
            explanation: "İlk cümle tanımı yüzeyde sıvı su bulunabilmesiyle ilişkilendirir.",
            hint: "İlk cümledeki temel koşulu seç.",
          },
          {
            key: "a51-habitable-2",
            prompt: "Yaşanabilir bölgenin konumu hangi yıldız özelliklerine bağlıdır?",
            correct: "Yıldızın büyüklüğü ve parlaklığına",
            distractors: [
              "Gezegenin adının uzunluğuna",
              "Gözlemcinin yaşına",
              "Teleskobun rengine",
            ],
            explanation:
              "İkinci cümle yıldızın büyüklük ve parlaklığının bölgeyi etkilediğini söyler.",
            hint: "İkinci cümlede sıralanan yıldız özelliklerini bul.",
          },
          {
            key: "a51-habitable-3",
            prompt: "Bir gezegenin yaşanabilir bölgede bulunması neyi tek başına kanıtlamaz?",
            correct: "Üzerinde yaşam bulunduğu sonucunu",
            distractors: [
              "Sıvı su koşullarının araştırılabilmesini",
              "Yıldızın parlaklığının önemli olmasını",
              "Yörünge uzaklığının değerlendirilmesini",
            ],
            explanation: "Son iki cümle bu konumun ipucu olduğunu, yaşamı kanıtlamadığını açıklar.",
            hint: "Son cümlede kanıtlanmadığı açıkça belirtilen sonucu seç.",
          },
        ],
      },
      {
        key: "a51-assessment-search-worlds",
        title: "Ötegezegen kanıt türlerini birlikte değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_SYNTHESIS", "RC_METHOD", "RC_LIMITS"],
        outcome:
          "Geçiş, yıldız yalpalaması ve doğrudan görüntüleme yöntemlerinin sağladığı kanıtları ve sınırlarını birleştirir.",
        textTitle: "Bir gezegen için farklı ipuçları",
        text: "Ötegezegenler başka yıldızların çevresinde dolanan gezegenlerdir. Geçiş yönteminde yıldız ışığındaki küçük düşüş, gezegenin önünden geçtiğine işaret eder; yıldızın yalpalaması ise gezegen çekiminin yıldız hareketine etkisini gösterir. Doğrudan görüntülemede yıldız parıltısı azaltılarak gezegenden gelen ışık aranır. Bu yöntemler farklı kanıtlar sunar ve tek başına hiçbiri bir gezegende yaşam olduğunu göstermez.",
        sourceTitle: "The Search for Other Earths",
        sourceUrl: "https://science.nasa.gov/resource/the-search-for-other-earths-fact-sheet/",
        verifiedFacts: [
          "NASA ötegezegen kaynakları geçişte yıldız ışığı düşüşünü, radyal hızda yıldız yalpalamasını ve doğrudan görüntülemede yıldız parıltısının bastırılmasını tanımlar.",
          "Gezegen bulma yöntemi tek başına yaşam kanıtı değildir; yaşanabilirlik ayrıca değerlendirilir.",
        ],
        contentRelation:
          "Değerlendirme üç gözlem yolunun kanıt türlerini karşılaştırır ve yaşam iddiasını sınırlar.",
        questions: [
          {
            key: "a51-assess-1",
            prompt: "Geçiş yöntemi hangi ölçülebilir izi kullanır?",
            correct: "Yıldız ışığındaki küçük düşüşü",
            distractors: [
              "Gezegenin yüzeyindeki kraterleri",
              "Yıldızın sesini",
              "Dünya'nın gelgit yüksekliğini",
            ],
            explanation: "İkinci cümle geçişi yıldız ışığındaki küçük düşüşle ilişkilendirir.",
            hint: "İkinci cümlede geçişin ışık üzerindeki etkisini bul.",
          },
          {
            key: "a51-assess-2",
            prompt: "Yıldızın yalpalaması hangi etkiyle ilişkilendirilir?",
            correct: "Gezegenin kütleçekim etkisiyle",
            distractors: [
              "Yıldızın Dünya çevresindeki yörüngesiyle",
              "Gezegen bulutlarının yansımasıyla",
              "Teleskobun renk filtresiyle",
            ],
            explanation:
              "İkinci cümle yalpalamayı gezegen çekiminin yıldız hareketine etkisi olarak açıklar.",
            hint: "İkinci cümlede yalpalamanın nedenini seç.",
          },
          {
            key: "a51-assess-3",
            prompt: "Bu yöntemlerden herhangi biri tek başına neyi göstermez?",
            correct: "Gezegende yaşam bulunduğunu",
            distractors: [
              "Yıldız ışığının değişebildiğini",
              "Bir yıldızın hareket edebildiğini",
              "Gezegenden ışık aranabildiğini",
            ],
            explanation: "Son cümle bu yöntemlerin tek başına yaşam kanıtı olmadığını belirtir.",
            hint: "Son cümlede reddedilen sonucu seç.",
          },
        ],
      },
    ],
  },
  {
    sequence: 52,
    stations: [
      {
        key: "a52-fast-sea-level-measurement",
        title: "Deniz seviyesi ölçüm araçlarını hızla ayır",
        category: "FAST_READING",
        skillCodes: ["FAST_SCANNING", "RC_COMPARE_CONTRAST"],
        outcome:
          "Gelgit ölçerlerin yerel, uyduların geniş alanlı deniz seviyesi gözlemi sağladığını ayırt eder.",
        textTitle: "Kıyıdan ve uzaydan ölçüm",
        text: "Gelgit ölçerleri kıyıdaki deniz yüksekliğini yakındaki karaya göre kaydeder. Bu araçlar belirli bir yerdeki değişimi ayrıntılı izler, ancak tek başına tüm okyanusları kapsamaz. Radar altimetresi taşıyan uydular ise okyanus yüzeyine mikrodalga gönderip geri dönüş süresini ölçer. Farklı bölgelerden toplanan uydu ölçümleri birleştirilerek küresel ortalama hesaplanabilir.",
        sourceTitle: "How Do We Measure Sea Level?",
        sourceUrl: "https://science.nasa.gov/kids/earth/how-do-we-measure-sea-level/",
        verifiedFacts: [
          "Gelgit ölçerleri deniz yüksekliğini yakındaki karaya göre ve belirli bir konumda ölçer.",
          "Radar altimetresi uyduları mikrodalganın gidiş-dönüş süresini kullanır; çok sayıda ölçüm küresel deniz seviyesini hesaplamaya yardım eder.",
        ],
        contentRelation:
          "Metin yerel ve küresel ölçüm araçlarını ve uydu radarının temel yöntemini karşılaştırır.",
        questions: [
          {
            key: "a52-measure-1",
            prompt: "Gelgit ölçerleri deniz yüksekliğini neye göre kaydeder?",
            correct: "Yakındaki karaya göre",
            distractors: [
              "Ay'ın yüzeyine göre",
              "Yıldız ışığına göre",
              "Okyanus tabanındaki canlılara göre",
            ],
            explanation:
              "İlk cümle gelgit ölçerinin yüksekliği yakındaki karaya göre kaydettiğini söyler.",
            hint: "İlk cümlede karşılaştırma yapılan yeri bul.",
          },
          {
            key: "a52-measure-2",
            prompt: "Radar altimetresi uydusu hangi işlemi yapar?",
            correct: "Mikrodalganın geri dönüş süresini ölçer",
            distractors: [
              "Kıyıdaki kum miktarını sayar",
              "Gelgitin nedenini tek başına belirler",
              "Deniz suyunun rengini boyar",
            ],
            explanation:
              "Üçüncü cümle uydunun mikrodalga gönderip dönüş süresini ölçtüğünü belirtir.",
            hint: "Üçüncü cümledeki ölçüm yöntemini seç.",
          },
          {
            key: "a52-measure-3",
            prompt: "Küresel ortalama deniz seviyesi nasıl hesaplanabilir?",
            correct: "Birçok bölgenin uydu ölçümünü birleştirerek",
            distractors: [
              "Bir kıyı istasyonundan tek ölçüm alarak",
              "Yalnızca bir fırtınanın etkisini izleyerek",
              "Ay’ın evrelerini takvim boyunca sayarak",
            ],
            explanation:
              "Son cümle farklı bölgelerdeki uydu ölçümlerinin birleştirilmesini açıklar.",
            hint: "Son cümledeki birleştirme adımını bul.",
          },
        ],
      },
      {
        key: "a52-comprehension-local-global",
        title: "Yerel ve küresel deniz seviyesini karşılaştır",
        category: "READING_COMPREHENSION",
        skillCodes: ["RC_COMPARE_CONTRAST", "RC_DETAIL", "RC_INFERENCE"],
        outcome: "Yerel deniz seviyesi ile küresel ortalama arasındaki ölçek farkını açıklar.",
        textTitle: "Aynı deniz, farklı ölçekler",
        text: "Yerel deniz seviyesi, belirli bir kıyıdaki su yüksekliğinin yakındaki kara düzeyine göre durumudur. Küresel deniz seviyesi ise gezegen genelindeki ortalamayı anlatır. Kıyıda ölçülen değişim, küresel ortalamadan daha büyük ya da daha küçük olabilir. Bu nedenle tek bir kıyı istasyonunun verisi, bütün okyanusların aynı şekilde değiştiğini göstermeye yetmez.",
        sourceTitle: "Is Sea Level Rising?",
        sourceUrl: "https://science.nasa.gov/kids/earth/is-sea-level-rising/",
        verifiedFacts: [
          "NASA yerel deniz seviyesini belirli yerde kara yüksekliğine göre; küresel deniz seviyesini gezegen ortalaması olarak tanımlar.",
          "Yerel değişimler küresel ortalamadan farklı olabilir; uydu ölçümleri geniş alanı kapsar.",
        ],
        contentRelation:
          "Metin ölçekteki farkı açıklar ve tek yerel gözlemden küresel sonuç çıkarmayı sınırlar.",
        questions: [
          {
            key: "a52-local-1",
            prompt: "Yerel deniz seviyesi hangi karşılaştırmaya dayanır?",
            correct: "Suyun yakındaki kara düzeyine göre konumu",
            distractors: [
              "Okyanustaki suyun toplam kütlesi ve ağırlığı",
              "Ay ile Dünya arasındaki uzaklığın değişimi",
              "Bir geminin denizde geçirdiği toplam yolculuk süresi",
            ],
            explanation:
              "İlk cümle yerel seviyeyi kıyıdaki suyu yakındaki kara düzeyine göre tanımlar.",
            hint: "İlk cümledeki yerel ölçüm karşılaştırmasını seç.",
          },
          {
            key: "a52-local-2",
            prompt: "Küresel deniz seviyesi neyi anlatır?",
            correct: "Gezegen genelindeki ortalamayı",
            distractors: [
              "Tek bir limandaki günlük ölçümü",
              "Bir kıyıdaki en yüksek dalgayı",
              "Yalnızca deniz tabanının şeklini",
            ],
            explanation:
              "İkinci cümle küresel seviyeyi gezegen genelindeki ortalama olarak tanımlar.",
            hint: "İkinci cümledeki tanımı bul.",
          },
          {
            key: "a52-local-3",
            prompt: "Tek bir kıyı istasyonu neden tüm okyanusları temsil etmeyebilir?",
            correct: "Yerel değişim küresel ortalamadan farklı olabildiği için",
            distractors: [
              "Kıyı istasyonları hiçbir ölçüm yapamadığı için",
              "Küresel ortalama yalnızca rüzgârı gösterdiği için",
              "Okyanusların tümü karada bulunduğu için",
            ],
            explanation:
              "Üçüncü ve dördüncü cümle yerel değişimin farklı olabileceğini ve tek istasyonun tüm okyanusları göstermediğini açıklar.",
            hint: "Son iki cümledeki ölçek farkını kullan.",
          },
        ],
      },
      {
        key: "a52-common-sea-level-causes",
        title: "Deniz seviyesindeki artışın iki nedenini ayır",
        category: "COMMON_STRATEGIES",
        skillCodes: ["RC_CAUSE_EFFECT", "RC_COMPARE_CONTRAST", "RC_DETAIL"],
        outcome:
          "Karadaki buz erimesi ile ısınan okyanusun genleşmesini ayrı nedenler olarak açıklar.",
        textTitle: "Su eklenmesi ve genleşme",
        text: "Küresel deniz seviyesinin yükselmesinde iki temel süreç öne çıkar. Karadaki buzullar ve buz tabakaları eridiğinde su okyanusa eklenir. Okyanus suyu ısındığında ise genleşerek daha fazla yer kaplar. Bu iki süreç farklıdır: biri okyanustaki su miktarını artırır, diğeri mevcut suyun hacmini büyütür. NASA uydu verileri uzun dönemli küresel değişimi izlemeye yardım eder.",
        sourceTitle: "Sea Level: Earth Indicator",
        sourceUrl: "https://science.nasa.gov/earth/explore/earth-indicators/sea-leve/",
        verifiedFacts: [
          "Küresel deniz seviyesi artışının iki temel nedeni karadaki buzların erimesiyle su eklenmesi ve okyanus suyunun ısınınca genleşmesidir.",
          "Uydu gözlemleri küresel deniz seviyesini zaman içinde izler.",
        ],
        contentRelation:
          "Metin su eklenmesi ile ısıl genleşmeyi farklı nedenler olarak ayırır; güncel oran belirtmez.",
        questions: [
          {
            key: "a52-causes-1",
            prompt: "Karadaki buz eridiğinde deniz seviyesini yükselten doğrudan etki nedir?",
            correct: "Okyanusa su eklenmesi",
            distractors: [
              "Okyanus suyunun donması",
              "Kıyıdaki karanın alçalması",
              "Deniz suyunun buluta dönüşmesi",
            ],
            explanation: "İkinci cümle eriyen karasal buzun suyunun okyanusa eklendiğini belirtir.",
            hint: "İkinci cümledeki su hareketini izle.",
          },
          {
            key: "a52-causes-2",
            prompt: "Okyanus suyu ısındığında hangi değişim gerçekleşebilir?",
            correct: "Genleşip daha fazla yer kaplar",
            distractors: [
              "Tuzunu tamamen kaybeder",
              "Kütlesi yok olur",
              "Kıyıdan uzaklaşarak donar",
            ],
            explanation: "Üçüncü cümle ısınan okyanus suyunun genleştiğini söyler.",
            hint: "Üçüncü cümlede ısınmanın sonucunu bul.",
          },
          {
            key: "a52-causes-3",
            prompt: "Metin iki nedeni hangi yönden farklılaştırır?",
            correct: "Biri su miktarını artırır, diğeri hacmi büyütür",
            distractors: [
              "Biri yalnız kıyıda, diğeri yalnız uzayda oluşur",
              "İkisi de okyanustan suyu uzaklaştırır",
              "Biri günlük, diğeri saatlik gelgittir",
            ],
            explanation: "Dördüncü cümle su eklenmesi ve mevcut suyun genleşmesini açıkça ayırır.",
            hint: "Dördüncü cümledeki karşılaştırmayı seç.",
          },
        ],
      },
      {
        key: "a52-integrated-monitoring",
        title: "Deniz seviyesi değişimini izleyen uydu kanıtlarını ilişkilendir",
        category: "INTEGRATED_PRACTICE",
        skillCodes: ["RC_METHOD", "RC_DATA_INTERPRETATION", "RC_LIMITS"],
        outcome:
          "Uydu altimetrisi, buz kütlesi ölçümleri ve kara hareketi verilerinin farklı soruları yanıtladığını açıklar.",
        textTitle: "Birden fazla ölçüm, farklı sorular",
        text: "NASA'nın deniz seviyesi izleme yaklaşımı farklı ölçüm türlerini birleştirir. Uydu altimetreleri okyanus yüzeyinin yüksekliğini izler; GRACE ve GRACE-FO görevleri Dünya'nın çekim alanındaki değişimlerden buz kütlesi kaybını ölçmeye yardım eder. Buzulların yüksekliği için radar veya lazer altimetreleri kullanılabilir. Gelgit ölçerlerinin yanına GPS verisi eklemek, kıyıdaki kara hareketinin deniz seviyesi ölçümünü nasıl etkilediğini anlamayı sağlar.",
        sourceTitle: "Rising Waters: How NASA Is Monitoring Sea Level Rise",
        sourceUrl: "https://science.nasa.gov/science-research/earth-science/rising-waters/",
        verifiedFacts: [
          "Uydu altimetresi deniz yüzeyi yüksekliğini ölçer; GRACE/GRACE-FO yerçekimi değişimleriyle buz kütlesi değişimini izler.",
          "Buz yüksekliği için radar/lazer altimetreleri, kara hareketinin etkisini incelemek için gelgit ölçerleriyle GPS verisi kullanılabilir.",
        ],
        contentRelation: "Metin farklı sensör ve verilerin farklı değişkenleri ölçtüğünü ayırır.",
        questions: [
          {
            key: "a52-monitor-1",
            prompt: "Uydu altimetreleri hangi büyüklüğü izler?",
            correct: "Okyanus yüzeyinin yüksekliğini",
            distractors: [
              "Bir buz tabakasının içindeki canlı sayısını",
              "Kıyıdaki günlük yağış miktarını",
              "Güneş lekelerinin sıcaklığını",
            ],
            explanation:
              "İkinci cümle altimetrelerin okyanus yüzeyinin yüksekliğini izlediğini belirtir.",
            hint: "İkinci cümlede altimetreyle ölçülen değişkeni bul.",
          },
          {
            key: "a52-monitor-2",
            prompt: "GRACE ve GRACE-FO hangi değişimi izlemeye yardım eder?",
            correct: "Buz kütlesi kaybını",
            distractors: [
              "Kıyıdaki gemi trafiğini",
              "Okyanusun tuz tadını",
              "Günlük bulut yüksekliğini",
            ],
            explanation:
              "İkinci cümle bu görevlerin çekim alanı değişimlerinden buz kütlesi kaybını izlediğini açıklar.",
            hint: "İkinci cümlede GRACE görevlerinin rolünü seç.",
          },
          {
            key: "a52-monitor-3",
            prompt: "Gelgit ölçerine GPS verisi eklemek hangi etkiyi anlamaya yardım eder?",
            correct: "Kıyıdaki kara hareketinin ölçüme etkisini",
            distractors: [
              "Güneş'in yüzeyindeki leke sayısını",
              "Okyanus suyunun rengini tek başına",
              "Buzulların içindeki hava boşluklarını",
            ],
            explanation:
              "Son cümle GPS'in kıyıdaki kara hareketinin deniz seviyesi ölçümünü nasıl etkilediğini anlamaya yardım ettiğini söyler.",
            hint: "Son cümlede GPS verisinin hangi etkisini arayın.",
          },
        ],
      },
      {
        key: "a52-assessment-satellite-record",
        title: "1993–2024 deniz seviyesi kaydını kanıt sınırlarıyla değerlendir",
        category: "MULTI_SKILL_ASSESSMENT",
        skillCodes: ["RC_DATA_INTERPRETATION", "RC_EVIDENCE", "RC_LIMITS"],
        outcome:
          "Uydu gözlem dönemini, ölçülen eğriyi ve grafikteki gelecek projeksiyonunu birbirinden ayırır.",
        textTitle: "Ölçüm ile öngörüyü ayırmak",
        text: "NASA'nın yayımladığı grafik, 1993–2024 arasında beş uluslararası uydudan gelen verilerle küresel ortalama deniz seviyesini gösterir. Grafikteki düz çizgi ölçüm kayıtlarının yönünü, noktalı çizgi ise geleceğe dönük projeksiyonu temsil eder. Projeksiyon bir uydu ölçümü değildir; belirli varsayımlara dayanan bir tahmindir. Bu nedenle geçmiş gözlem ile gelecek beklentisini aynı tür kanıt gibi okumamak gerekir.",
        sourceTitle: "Satellite Record of Sea Level Rise From 1993 to 2024",
        sourceUrl:
          "https://science.nasa.gov/photojournal/satellite-record-of-sea-level-rise-from-1993-to-2024/",
        verifiedFacts: [
          "Grafik 1993–2024 küresel ortalama deniz seviyesi kaydını beş uluslararası uydunun verileriyle sunar.",
          "NASA açıklamasında düz çizgi gözlenen eğilimi, noktalı çizgi geleceğe dönük projeksiyonu gösterir.",
        ],
        contentRelation:
          "Değerlendirme ölçülen geçmiş veri ile model projeksiyonu arasındaki kanıt farkını sınar.",
        questions: [
          {
            key: "a52-assess-1",
            prompt: "Grafikteki gözlem dönemi hangi yılları kapsar?",
            correct: "1993–2024 arasını",
            distractors: ["1980–1992 arasını", "2001–2010 arasını", "2025–2040 arasını"],
            explanation: "İlk cümle uydu kaydının 1993–2024 dönemini kapsadığını söyler.",
            hint: "İlk cümledeki başlangıç ve bitiş yıllarını bul.",
          },
          {
            key: "a52-assess-2",
            prompt: "Noktalı çizgi neyi temsil eder?",
            correct: "Geleceğe dönük projeksiyonu",
            distractors: [
              "Her kıyıdaki gelgit ölçerini",
              "Sadece 1993'teki uydu verisini",
              "Ölçümlerdeki günlük dalga boyunu",
            ],
            explanation:
              "İkinci cümle noktalı çizginin geleceğe dönük projeksiyon olduğunu belirtir.",
            hint: "İkinci cümlede noktalı çizginin anlamını seç.",
          },
          {
            key: "a52-assess-3",
            prompt: "Geleceğe dönük projeksiyon neden doğrudan ölçüm sayılmaz?",
            correct: "Varsayımlara dayalı bir tahmin olduğu için",
            distractors: [
              "Uydu verisi hiçbir zaman kullanılmadığı için",
              "Yalnızca geçmiş yılları gösterdiği için",
              "Kıyı çizgisini fotoğrafladığı için",
            ],
            explanation: "Üçüncü cümle projeksiyonun varsayımlara dayanan tahmin olduğunu açıklar.",
            hint: "Üçüncü cümlede ölçümden farklı olan niteliği bul.",
          },
        ],
      },
    ],
  },
] as const;
