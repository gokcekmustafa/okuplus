# OKU+ — Database Backup & Restore Contract (8I-2)

Bu belge production DB’ye bağlanmaz ve backup komutu çalıştırmaz. Amaç, deployment owner’ın
uygulayacağı ve kanıtlayacağı PostgreSQL backup/restore sözleşmesini tanımlamaktır.

## Durum

**PARTIAL / NO-GO.** Üretim için manuel snapshot ve izole geri yükleme dalı bulundu; bu kanıtlar
backup/restore kabulünü tek başına tamamlamaz. İzole dalda uygulama smoke testi henüz doğrulanmadı
ve production için otomatik snapshot takvimi boş.

21 Ekim 2026 tarihli [Production Forensics #39](https://github.com/gokcekmustafa/okuplus/actions/runs/39647112930)
salt-okunur çalışmasında PostgreSQL sağlayıcısı Neon olarak tanındı ve onaylı production hedef
fingerprint’i eşleşti. Proje/dal metadata’sı SQL kimlik sorgusuyla doğrulanmadı.

21 Ekim 2026 tarihli görev kapsamında bildirilen Neon inceleme bulguları:

- Manuel snapshot `OKUPRATIK-PRODUCTION-PRE-CYCLE3-RESTORE-REHEARSAL-20261016`, 16 Ekim 2026’da
  oluşturulmuş.
- Bu snapshot ile ilişkili izole geri yükleme dalı mevcut ve `ready`.
- Restore dalı ile production dalının şema karşılaştırması boş fark döndürmüş; her iki tarafta 73
  tablo raporlanmış.
- Production dalı için otomatik snapshot takvimi boş.
- İzole restore dalında uygulama smoke testi henüz kanıtlanmamış.

Bu ayrıntılar görev sahibinin Neon incelemesinden aktardığı bulgulardır; repository’de provider
kanıt artefaktı veya restore dalı kimliği bulunmuyor. Boş şema farkı ve eşit tablo sayısı, uygulama
çalışırlığını, backup/PITR kapsamını veya geri yükleme prosedürünün uçtan uca başarısını kanıtlamaz.
Bu nedenle kabul durumu **PARTIAL / NO-GO** olarak kalır.

**Kalan kanıt ve sorumlu:** Neon projesine yetkili platform/DB operatörü, provider’dan snapshot’ın
başarılı/PITR kapsamındaki durumunu doğrulamalı ve izole restore dalında salt-okunur
`/health`, `/health/db`, `/ready` smoke testlerini tamamlayıp sonuçları kaydetmelidir. Snapshot,
restore dalı, zaman damgası, gerçek provider proje/dal kimlikleri ve şema karşılaştırması için
erişimi kısıtlı kanıt bağlantısı veya redakte edilmiş kayıt eklenmelidir. Dump, bağlantı bilgileri
ve kişisel veriler rapora/loglara konmamalıdır.

## Zorunlu politika alanları

| Alan                  | Beklenen karar                                         | 8I-2 durumu                                                        |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| Backup türü           | Günlük full + WAL/PITR veya provider eşdeğeri          | MANUAL SNAPSHOT OBSERVED; AGE DUMP PREPARED, NOT RUN; PITR PENDING |
| RPO                   | Ürün sahibi tarafından saat/dakika cinsinden           | OWNER DECISION PENDING                                             |
| RTO                   | Ürün sahibi tarafından saat/dakika cinsinden           | OWNER DECISION PENDING                                             |
| Retention             | Günlük/haftalık/aylık kopya sınıfları ve silme takvimi | OWNER DECISION PENDING                                             |
| Encryption at rest    | Provider encryption plus client-side encrypted export  | AGE EXPORT PREPARED; PROVIDER AT-REST PENDING                      |
| Encryption in transit | TLS-only DB bağlantısı ve certificate policy           | BACKUP WORKFLOW ENFORCES VERIFY-FULL; NOT RUN                      |
| Access                | Least privilege backup/restore role, break-glass audit | PENDING                                                            |
| Immutability          | Ransomware/silme koruması, ayrı hesap/region           | PENDING                                                            |
| Restore verification  | Otomatik checksum/fingerprint + uygulama smoke         | PARTIAL; APP SMOKE PENDING                                         |
| Owner                 | On-call/platform owner and escalation                  | PENDING                                                            |

## Manuel age şifreli mantıksal yedek

`.github/workflows/production-encrypted-logical-backup.yml` yalnızca `master` dalında manuel
başlatılabilir. Mevcut `production-migration` GitHub Environment korumasını kullanır; üretim
migration workflow'unu çağırmaz. Workflow henüz çalıştırılmadı. Bu belge, yedek veya geri yükleme
başarısı kanıtı değildir; genel kabul durumu **PARTIAL / NO-GO** olarak kalır.

### GitHub Environment yapılandırması

`production-migration` Environment içinde aşağıdaki alanlar workflow için gereklidir:

| Tür               | Ad                                | Değerin gereği                                                                                                                                |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret            | `PRODUCTION_BACKUP_DATABASE_URL`  | Neon'un doğrudan (pooler olmayan) bağlantı adresi ve özel, salt-okunur yedekleme rolü. `PRODUCTION_DATABASE_URL` fallback olarak kullanılmaz. |
| Variable          | `PRODUCTION_BACKUP_AGE_RECIPIENT` | `age-keygen` ile oluşturulmuş `age1…` **açık** alıcı anahtarı.                                                                                |
| Existing variable | `PRODUCTION_DB_APPROVED_HOST`     | Onaylı doğrudan Neon endpoint host'u.                                                                                                         |
| Existing variable | `PRODUCTION_DB_APPROVED_DATABASE` | Beklenen üretim veritabanı adı.                                                                                                               |

Bu Environment değerlerinin mevcut olduğu bu görevde doğrulanmadı. Workflow çalıştırılmadan önce
Environment yöneticisi host/veritabanı değişkenlerini doğrulamalı, ayrı yedekleme rolünün yalnızca
gerekli okuma erişimini verdiğini teyit etmeli ve recipient ile çevrimdışı/kurumsal kasada tutulan
private identity'nin eşleşmesini sınamalıdır. **Private age identity GitHub'a, repoya, Actions
çıktısına veya loglara konmamalıdır.** Açık recipient gizli değildir; yine de rapora yazılmaz.

### Workflow'un güvenlik kontrolleri ve çıktısı

- `workflow_dispatch`, `refs/heads/master`, master SHA eşleşmesi ve açık bir çalışma ifadesi gerekir;
  korumalı Environment onayı da uygulanır.
- Secret'taki URL ayrıştırılır; host onaylı host ile tam eşleşmeli, Neon doğrudan endpoint biçiminde
  olmalı, `-pooler` içermemeli, port 5432 olmalı ve URL veritabanı adı onaylı adla aynı olmalıdır.
  Yalnızca `sslmode` ve isteğe bağlı `channel_binding` URL parametreleri kabul edilir. TLS,
  sertifika/hostname doğrulamasıyla `verify-full` zorlanır.
- Önce `BEGIN READ ONLY` içinde hedef veritabanı, efektif tablo/sequence yazma izinleri ve rol
  bayrakları sorgulanır. `pg_dump` istemci oturumları da `default_transaction_read_only=on` ile
  başlar. Superuser, `BYPASSRLS`, rol/veritabanı yönetim yetkisi veya kalıcı yazma izni reddedilir.
  Veritabanı kimliği uyuşmazsa veya okuma/izin kontrolü başarısızsa dump yapılmaz.
- `pg_dump --format=custom` stdout'u doğrudan `age` şifreleme sürecine pipe edilir. Şifresiz dump
  dosyası oluşturulmaz; `.pgpass` geçici dosyası 0600 izinle kullanılır ve işlem sonunda silinir.
- Workflow, PostgreSQL 18 istemcisini resmi PGDG paket kaynağından sabitler. `pg_dump`, kendi major
  sürümünden daha yeni PostgreSQL sunucularını dışa aktaramaz; sunucu sürümü 18'den yeniyse adım
  güvenli biçimde başarısız olur ve istemci sürümü ayrıca güncellenip test edilmelidir.
- Artifact yalnızca `database.dump.age` ve hassas olmayan `manifest.json` içerir; manifest şifreli
  dosyanın SHA-256 özeti/boyutu, commit ve güvenli hedef eşleşme bayraklarını taşır, bağlantı/rol
  adı veya veritabanı içeriği taşımaz. GitHub Artifact saklama süresi 7 gündür. Artifact erişimi
  repo yetkilerine tabidir; bu, uzun süreli/bağımsız bir backup deposu veya Neon PITR yerine geçmez.

### Şifreli artifact'i indirme ve geri yükleme provası

1. Yalnızca başarılı workflow run'ının artifact'ini indirin; `manifest.json` içindeki SHA-256 ile
   indirilen `database.dump.age` dosyasının SHA-256 değerini karşılaştırın. Eşleşme yoksa durun.
2. Şifre çözme kimliğine yalnızca onaylı, şifreli depolama/operatör kasası üzerinden erişin. Kimliği
   komut satırı argümanı, terminal çıktısı, Actions secret veya loglara koymayın. Kontrollü bir
   operatör ortamında `age --decrypt --identity <korumalı-kimlik-yolu> database.dump.age | pg_restore
--list -` ile deşifre ve arşiv yapısını doğrulayın; arşiv listesini genel loga dökmeyin.
3. Gerçek prova için yeni ve boş bir **izole** Neon branch/database kullanın. Restore hedefinin doğrudan
   host ve database kimliğini önceden onaylı izole değerlerle eşleştirin; üretim host'uyla eşitlik,
   pooler kullanımı, eksik hedef bilgisi veya mevcut hedef verisi varsa durun. Bağlantıyı komut
   satırında URL olarak vermeyin; 0600 `PGPASSFILE` ile `PGHOST`/`PGDATABASE` gibi libpq alanlarını
   ayarlayın. `age --decrypt … | pg_restore --no-password --exit-on-error --single-transaction`
   akışını yalnızca doğrulanmış boş izole hedefe yönlendirin; `--clean`/`--create` kullanmayın.
4. İzole hedefte restore tamamlanınca uygulamanın read-only health/smoke kontrollerini, migration
   durumunu ve içerik dışı şema/DB fingerprint'ini doğrulayın. Sonuç, hedef branch kimliği, süre ve
   restore SHA'sını PII/veritabanı satırları olmadan erişimi kısıtlı kanıt olarak saklayın. Başarısız
   veya denenmemiş prova **başarılı** sayılmaz; production'a restore hiçbir zaman yapılmaz.

Bu görev kapsamında GitHub Environment secret/variable değerleri oluşturulmadı veya doğrulanmadı;
workflow çalıştırılmadı; şifreli artifact, decryption veya restore provası üretilmedi.

## Uygulama prosedürü (production’da, onaylı change window’da)

1. Hedef kimliğini `environment=PRODUCTION`, service, DB host/port/name/schema, release SHA ve
   migration fingerprint ile doğrula. `oku_plus_test` hedefi production yerine kullanılamaz.
2. Backup job’ın başarılı ve encrypted olduğunu provider audit log’dan doğrula; secret veya dump
   içeriğini ticket/repo’ya koyma.
3. Restore provasını yalnızca doğrulanmış, boş ve izole hedefte yap. Bu prosedür production'a
   `pg_restore` uygulamaz veya buna izin vermez; production kurtarma ayrı incident/change prosedürü
   ve ayrı yetkilendirme gerektirir.
4. Restore sonrası `prisma validate`, migration status, read-only DB fingerprint ve uygulama smoke
   (`/health`, `/health/db`, `/ready`) çalıştır.
5. Şema/migration hash, row-count/checksum örnekleri, restore start/end, operator, target ve test
   sonucunu non-secret evidence olarak sakla. PII dump’ını loglama.
6. Restore başarısızsa tekrar tekrar blind retry yerine provider incident/change prosedürünü uygula;
   migration repair veya forward fix kararı ayrıca onaylanmalıdır.

## Test sıklığı ve kabul

- Backup success: her job’da alert; failure için on-call alarmı.
- Restore rehearsal: en az üç aylık dönem veya RPO/RTO sözleşmesinin gerektirdiği daha sık aralık.
- Quarterly access review: backup/restore role üyeleri ve KMS erişimi.
- Her rehearsal sonunda hedef RPO/RTO ölçümü, fingerprint karşılaştırması ve smoke sonucu bulunmalı.
- Son başarılı restore kanıtı yoksa production promotion **NO-GO**.

## Data protection

Şifrelenmiş artifact kısa ömürlü ve access-audited tutulmalı; deşifre edilmiş dump yerel diskte
kalıcılaştırılmamalı veya paylaşılmamalı.
Auth token, password hash, payment secret, kart/CVV veya raw provider payload’ı backup ticket/log’una
çıkarılmamalı. Yasal retention/deletion politikası ürün ve hukuk owner’ı tarafından ayrıca imzalanmalı.
