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

| Alan                  | Beklenen karar                                         | 8I-2 durumu                                |
| --------------------- | ------------------------------------------------------ | ------------------------------------------ |
| Backup türü           | Günlük full + WAL/PITR veya provider eşdeğeri          | MANUAL SNAPSHOT OBSERVED; COVERAGE PENDING |
| RPO                   | Ürün sahibi tarafından saat/dakika cinsinden           | OWNER DECISION PENDING                     |
| RTO                   | Ürün sahibi tarafından saat/dakika cinsinden           | OWNER DECISION PENDING                     |
| Retention             | Günlük/haftalık/aylık kopya sınıfları ve silme takvimi | OWNER DECISION PENDING                     |
| Encryption at rest    | KMS/provider-managed key, key owner ve rotation        | PENDING                                    |
| Encryption in transit | TLS-only DB bağlantısı ve certificate policy           | PENDING                                    |
| Access                | Least privilege backup/restore role, break-glass audit | PENDING                                    |
| Immutability          | Ransomware/silme koruması, ayrı hesap/region           | PENDING                                    |
| Restore verification  | Otomatik checksum/fingerprint + uygulama smoke         | PARTIAL; APP SMOKE PENDING                 |
| Owner                 | On-call/platform owner ve escalation                   | PENDING                                    |

## Uygulama prosedürü (production’da, onaylı change window’da)

1. Hedef kimliğini `environment=PRODUCTION`, service, DB host/port/name/schema, release SHA ve
   migration fingerprint ile doğrula. `oku_plus_test` hedefi production yerine kullanılamaz.
2. Backup job’ın başarılı ve encrypted olduğunu provider audit log’dan doğrula; secret veya dump
   içeriğini ticket/repo’ya koyma.
3. Restore’ı izole restore target’a yap; mevcut production üzerine destructive restore yapmadan önce
   incident/change approval ve yeni rollback noktası oluştur.
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

Dump dosyaları encrypted, kısa ömürlü ve access-audited tutulmalı; local workstation’a indirilmemeli.
Auth token, password hash, payment secret, kart/CVV veya raw provider payload’ı backup ticket/log’una
çıkarılmamalı. Yasal retention/deletion politikası ürün ve hukuk owner’ı tarafından ayrıca imzalanmalı.
