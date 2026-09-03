# OKU+ — AŞAMA 8G-8 FIRST REAL CURRICULUM PACK

## Karar ve ortam sınırı

Bu manifest, 13–17 yaş grubu için hazırlanmış 9 özgün Türkçe okuma metni ve 36 soruluk kontrollü production adayıdır. Pack global katalog için tasarlanmıştır; her içerik bir mevcut skill'e, bir objective'e, bir topic/domain eşlemesine ve bir kaynak doğrulama listesine sahiptir.

Bu çalışma alanında Prisma'nın `DATABASE_URL` hedefi `oku_plus_test`tir. 8G-8 recovery doğrulamasında pack yalnızca bu TEST DB'ye, explicit TEST-only onaylarıyla yazılmıştır: 9 published content, 36 published question, 9 template ve ilişkileri. Production DB'ye write yapılmamıştır. Mevcut Level/Skill kayıtları bu local aday için fixture (`E2E`, `LEARN_E2E_*`, `EXUX_*`) niteliğindedir; yeni Level veya Skill oluşturmak bu fazın kurallarına aykırıdır.

Kalıcı promotion yalnızca ayrı, doğrulanmış bir hedef URL ile çalışır. Script `DATABASE_URL` fallback'i kullanmaz; environment ve bağlantı kimliği ayrıca doğrulanır:

```powershell
$env:CURRICULUM_PACK_DATABASE_URL = "postgresql://.../oku_plus_staging?schema=public"
$env:CURRICULUM_PACK_ENVIRONMENT = "STAGING" # veya PRODUCTION
$env:CURRICULUM_PACK_ALLOW_WRITE = "I_HAVE_VERIFIED_8G8_TARGET"
$env:CURRICULUM_PACK_EDITORIAL_APPROVAL = "I_HAVE_REVIEWED_8G8"
$env:CURRICULUM_PACK_LEVEL_CODE = "<mevcut-production-level-code>"
$env:CURRICULUM_PACK_SKILL_CODES = "<skill-1>,<skill-2>,<skill-3>"
npx tsx scripts/seed-curriculum-pack.ts --dry-run
npx tsx scripts/seed-curriculum-pack.ts
```

Local TEST doğrulaması için aynı explicit hedef/onaylar gerekir; 8G-9A itibarıyla production-candidate seed script'i E2E/LEARN/EXUX fixture kataloglarını TEST'te dahi reddeder. Mevcut 8G-8 TEST kaydı korunmuş, MC sırası `scripts/rebalance-curriculum-pack.ts` ile yalnızca immutable v2 kayıtları eklenerek dengelenmiştir. Rebalance ikinci çalışmada NOOP olur; conflict durumunda overwrite/delete yapılmaz.

## Pack yapısı

| İzlek            | Metinler                                                                           | Soru sayısı | Editorial primary skill rolü             |
| ---------------- | ---------------------------------------------------------------------------------- | ----------: | ---------------------------------------- |
| Ana fikri bul    | Gölgeyi Ölçmek; Yukarıdan Bakınca; Kütüphane Rafındaki Harita                      |          12 | Ana düşünceyi ayrıntı ve kanıttan ayırma |
| Detayları yakala | Akşam Işığı ve Beden Saati; Çiçeğin Ziyaretçileri; Toprağın Sünger Gibi Davranması |          12 | Açık bilgiyi doğru ilişkiyle eşleştirme  |
| Çıkarım yap      | Haritanın Sessiz Seçimi; Mesajdaki Boşluk; Eski Fotoğrafın Yanındaki Not           |          12 | Kanıttan sınırlı ve makul sonuç çıkarma  |

Her item:

- 3 çoktan seçmeli + 1 doğru/yanlış soru;
- soru başına passage evidence açıklaması ve metni ele vermeyen ipucu;
- 0–1 item/question difficulty;
- `RECALL`, `UNDERSTAND` veya `INFER` bilişsel talep etiketi;
- özgün body, objective, domain/topic ve source reference listesi;
- tek yayınlı ContentVersion + current v2 TemplateVersion (eski v1 sürümü korunur);
- global (`tenantId = NULL`) katalog kapsamı;
- yayınlanmış sürüm immutable politikası.

## Kaynak ve provenance

Metinler kaynaklardan kopyalanmamış, özgün Türkçe anlatımla yazılmıştır. Kaynaklar yalnızca doğrulanabilir olgusal dayanağı ve öğrencinin pasaj içindeki iddiasını kontrol etmek için kullanılır. ContentVersion `license` ve `changelog`, template `config` ve QuestionVersion `generationMetadata` pack marker, objective, skill role ve source reference bilgilerini taşımaya hazırdır.

- [U.S. EPA — Benefits of Trees and Vegetation](https://www.epa.gov/heatislands/benefits-trees-and-vegetation): gölge ve evapotranspirasyonun yerel serinlemeyle ilişkisi.
- [NASA — Earth Observations](https://www.nasa.gov/wp-content/uploads/2023/03/earth-observations-ngs.pdf): uyduların kara, su ve atmosfer gözlemleri.
- [UNESCO — Media and Information Literacy](https://www.unesco.org/en/articles/media-and-information-literacy): bilgiyi bulma, değerlendirme ve üretme çerçevesi.
- [NHLBI/NIH — How Sleep Works](https://www.nhlbi.nih.gov/health/sleep/sleep-wake-cycle): ışık-karanlık döngüsü ve uyku-uyanıklık ilişkisi.
- [USDA — Pollinator Activity Book](https://www.fsa.usda.gov/Internet/FSA_File/pollinator_activity_book.pdf): tozlaştırıcı çeşitliliği ve polenin taşınması.
- [USDA NRCS — Role of Organic Matter](https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/role-of-organic-matter): organik madde, infiltrasyon ve su tutma ilişkisi.
- [USGS — Generalization](https://www.usgs.gov/centers/cegis/science/generalization): harita ölçeğinde ayrıntıların genellenmesi.

## Teknik mapping

Yeni tablo, enum veya migration eklenmedi. Mevcut model şu şekilde kullanılır:

| Editorial ihtiyaç              | Mevcut alan                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Production adayı marker        | `ExerciseTemplate.config.packId`, `QuestionVersion.generationMetadata.packId` |
| Objective / primary skill rolü | template config + question generationMetadata                                 |
| Topic / domain                 | template config + content changelog                                           |
| Factual provenance             | template config/source listesi + ContentVersion license/changelog             |
| Student exercise               | tek ContentVersion + tek TemplateVersion + 4 QuestionVersion                  |
| Path görünürlüğü               | skill bağlı birden çok yayınlı TemplateVersion                                |

`src/modules/student-learning/service.ts`, aynı skill'de birden çok yayınlı template bulunduğunda template-version başına Learning Path düğümü üretir. Böylece 9 item öğrenci yolunda ayrı başlatılabilir; tek template kullanan mevcut path testleri skill düğümü davranışını korur.

## Promotion sonrası doğrulama

Uygulama sunucusu promotion hedef DB'ye yönlendirilip restart edildikten sonra:

```powershell
npx tsx scripts/browser-curriculum-pack-test.ts
```

Bu test pack içeriklerini silmez. Yalnızca kendi oluşturduğu geçici personal student/session kayıtlarını exact ID ile temizler; `test-tenant`, `test-content` ve pack marker'larına dokunmaz. Preflight 9 published content, 9 current published template version, 36 current published question, hint/explanation ve 3 skill doğrular; browser akışı Learning Path → reading → question privacy → 390×844 overflow/page error kontrollerini yapar. Önceki v1 QuestionVersion/TemplateVersion kayıtları immutable geçmiş olarak korunur.

## Bilinen sınır

Bu repo'da 8G-8 pack için doğrulanmış production DB ve production-ready Level/Skill kataloğu yoktur. Bu nedenle manifest ve guard'lı promotion scripti hazırdır; kalıcı DB promotionı, doğru hedef ve mevcut gerçek katalog kodları sağlanana kadar bilinçli olarak bekletilir. `OPEN_ENDED`, per-item ReviewSchedule, first-class Topic/Unit ve first-class provenance bu pack'e eklenmemiştir; mevcut 8G-7 review foundation yalnız yayınlı template çeşitliliği üzerinden çalışır.
