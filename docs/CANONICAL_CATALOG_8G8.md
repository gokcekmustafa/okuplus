# OKU+ 8G-8 Canonical Pilot Catalog

Bu doküman yalnızca 8G-8 First Real Pack pilot kataloğunun version-controlled
manifest ve promotion sözleşmesini tanımlar. Full 5–12 production curriculum
değildir.

## Source of truth

Canonical manifest ve validation:

- `src/curriculum/canonical-catalog.ts`
- `src/curriculum/catalog-validation.ts`

Manifestteki Level/Skill code değerleri runtime kullanıcı metni değildir. Code
değişikliği, immutable baseline guard nedeniyle bilinçli bir manifest sürümü ve
code migration kararı gerektirir. Aynı anlamdaki bir kaydın code'u değiştirilmez;
anlamsal değişiklik yeni bir katalog kaydı olarak ele alınır.

## Pilot catalog

- Level: `G8_12`, `8–12. Sınıf Okuma Başlangıç`
- Score model: normalize `0–100`
- Level content difficulty: `0.45–0.70`
- Skills: `RC_MAIN_IDEA`, `RC_DETAIL`, `RC_INFERENCE`
- Pack: `OKU-8G8-FIRST-REAL-CURRICULUM`
- Expected pack size: 9 Content / 36 Question

`main-idea`, `detail` ve `inference` pack track ID’leridir. Seed scriptine
verilen Skill code sırası ile canonical manifestteki track sırası birebir aynı
olmalıdır.

## Validation and promotion

Manifest validation, tam olarak bir Level ve üç Skill olmasını, code formatını,
category/track alignment’ını, display order uniqueness’ini, score/difficulty
aralıklarını ve fixture marker’larını kontrol eder. Genel manifest şeması ile
First Real Pack’e özel `1 Level / 3 Skill / 1 pack` kuralları ayrı katmanlardır.

Sadece manifest validation:

```powershell
npm run catalog:validate
```

Staging dry-run için explicit hedef değişkenleri gerekir:

```powershell
$env:CANONICAL_CATALOG_DATABASE_URL = "<verified-staging-url>"
$env:CANONICAL_CATALOG_ENVIRONMENT = "STAGING"
$env:CANONICAL_CATALOG_EXPECTED_DATABASE = "<verified-staging-database>"
$env:CANONICAL_CATALOG_APPROVED_TARGET_FINGERPRINT = "<independently-approved-sha256>"
npm run catalog:bootstrap:dry-run
```

Fingerprint; environment/provider, URL endpoint hostname/port ve canlı
`current_database()`/`current_user` identity’sinden password içermeden hesaplanır.
Üretim/staging onayında ayrı bir hedef kaynağından sağlanmalıdır. Aynı komutta
URL’den tek başına türetilip onay değeri olarak kullanılmamalıdır.
Live identity yalnızca `current_database()` ve `current_user` ile doğrulanır;
Neon pooler backend adresi olan `inet_server_addr()` hedef kanıtı sayılmaz.

Staging hedef fingerprint’ini read-only üretmek için:

```powershell
npm run catalog:target-fingerprint
```

Dry-run yalnızca identity ve mevcut canonical Level/Skill kayıtlarını okur.
Write yolu yalnızca `--apply`, explicit environment, expected database ve
approved target fingerprint ile staging/editorial approval değerleri birlikte
sağlandığında açılır. Production ayrıca ayrı production approval ister.

Bootstrap davranışı:

- Eksik kayıtlar: tek transaction içinde CREATE.
- Aynı metadata’ya sahip mevcut kayıtlar: NOOP.
- Aynı code ile metadata farkı veya fixture işareti: CONFLICT/BLOCKED.
- Mevcut kayıtlar otomatik güncellenmez, silinmez ve üzerine yazılmaz.
- Transaction içi conflict veya hata tüm yeni katalog yazılarını rollback eder.

DB’ye yazılan runtime metadata Level’ın tüm alanları ile Skill’in `code`, `name`,
`category`, `description` ve `displayOrder` alanlarıdır. `learningOutcome`,
`rubricSummary`, manifest lifecycle/scope ve pack binding bilgileri bu pilotta
editorial-only manifest metadata’sıdır; bootstrap bunları persisted gibi raporlamaz.

## First Real Pack binding

Mevcut `scripts/seed-curriculum-pack.ts` generic explicit code girişini
korur. `--canonical-catalog` verildiğinde şu binding zorunlu hale gelir:

```powershell
$env:CURRICULUM_PACK_LEVEL_CODE = "G8_12"
$env:CURRICULUM_PACK_SKILL_CODES = "RC_MAIN_IDEA,RC_DETAIL,RC_INFERENCE"
$env:CURRICULUM_PACK_APPROVED_TARGET_FINGERPRINT = "<independently-approved-sha256>"
npx tsx scripts/seed-curriculum-pack.ts --canonical-catalog --dry-run
```

Bu adımda pack seed edilmez; `--dry-run` yalnızca preflight ve conflict
kontrolü yapar. Pack promotion ancak canonical catalog bootstrap ve ayrı
staging write approval sonrasında yürütülmelidir.
Canonical modda DB’deki Level/Skill runtime metadata’sı da manifest ile birebir
karşılaştırılır; mismatch durumunda overwrite yapılmadan CONFLICT ile durur.

TEST fixture katalogları canonical manifestin parçası değildir. `E2E`, `LEARN`,
`EXUX`, `fixture`, `test` ve benzeri marker’lar promotion öncesinde reddedilir.
