# OKU+ — 8H-1 Entitlement Architecture

## Amaç ve sınır

8H-1, OKU+'nın ücretsiz/premium ürün modelinin teknik temelidir. Bu aşama
ödeme, faturalama veya production promotion yapmaz. Entitlement, bir hesap ve
tenant context'i için o anda geçerli ürün planını ve özellik politikasını
hesaplayan erişim katmanıdır.

Model yalnızca iki plan tanımlar:

- `PLAN_FREE`: varsayılan plan; kişisel pratik için günlük kota uygulanır.
- `PLAN_PREMIUM`: TEST/manual grant ile temsil edilen, kişisel pratik ve soru
  kotalarını kaldıran plan.

## Kavramlar

### Entitlement

`Entitlement` satırı planın sahibini, kapsamını, kaynağını ve geçerlilik
aralığını taşır: `plan`, `active`, `source`, `effectiveAt` ve isteğe bağlı
`expiresAt`. Ödeme işlemi değildir; gelecekte bir billing adapter'ının
okuyacağı durum kaydıdır.

### Feature

Merkezi feature kataloğu şu capability'leri içerir:

`PRACTICE`, `PRACTICE_QUESTION`, `REVIEW`, `LEARNING_PATH`, `ASSESSMENT`,
`PROGRESS`, `GAMIFICATION`, `ADS_ENABLED`.

`ADS_ENABLED` yalnızca geleceğe dönük capability'dir. Bu aşamada reklam SDK'sı
ve reklam gösterimi yoktur; Free ve Premium için kapalıdır.

### Limit ve usage

Limitli bir feature için `EntitlementUsage` satırı bir kullanım hakkını temsil
eder. Kullanım anahtarı idempotent'tir ve `tenantId + userId + feature +
usageDate + idempotencyKey` birleşimiyle tekrar yazılamaz. `usageDate`, hesap
timezone'ı ayrı bir tercih olarak eklenene kadar `ENTITLEMENT_TIMEZONE`
ayarından (varsayılan `UTC`) üretilen yerel takvim günüdür.

Günlük kota kontrolü transaction içinde PostgreSQL advisory transaction lock,
duplicate key kontrolü ve insert öncesi count ile yapılır. Aynı istek retry
edilirse ikinci hak yazılmaz; eşzamanlı istekler kota üstüne çıkamaz. Yeni gün
ilk yerel gece yarısından sonra otomatik başlar; scheduler gerekmez.

## Plan politikası

| Feature                    | Free            | Premium  | Uygulama durumu                          |
| -------------------------- | --------------- | -------- | ---------------------------------------- |
| Personal practice          | 3 session / gün | Sınırsız | Server-side enforce                      |
| Personal practice question | 20 soru / gün   | Sınırsız | Server-side enforce                      |
| Review                     | Açık            | Açık     | Mevcut akış korunur                      |
| Learning path              | Açık            | Açık     | Mevcut akış korunur                      |
| Assessment                 | Açık            | Açık     | B2C günlük practice kotasına dahil değil |
| Progress                   | Açık            | Açık     | Mevcut akış korunur                      |
| Gamification               | Açık            | Açık     | Mevcut akış korunur                      |
| Ads                        | Kapalı          | Kapalı   | SDK/entegrasyon yok                      |

Free kotaları ürün kararı olarak merkezi politikada sabittir; route'lara
dağılmış `if (plan === ...)` kontrolleri yoktur. Premium için şu anda yalnızca
çalışan davranış olan genişletilmiş pratik ve soru kotası tanımlıdır. Review
genişlemesi, reklamsız kullanım ve gelişmiş ilerleme API'si gelecekteki
capability alanlarıdır; henüz satılan özellik değildir.

## Merkezi servis API'si

`src/modules/entitlements/service.ts` şu sözleşmeyi sağlar:

- `getEntitlements(actor)`: plan, scope, timezone, kullanım ve feature matrisi.
- `getCurrentPlan(actor)`: geçerli `PLAN_FREE`/`PLAN_PREMIUM` kodu.
- `canAccess(actor, feature)`: feature erişimi, limit, kullanım ve reset zamanı.
- `checkLimit(actor, feature)`: limit kontrolünün açık adı.
- `recordUsage(actor, feature, idempotencyKey)`: atomic/idempotent kullanım.
- `enforceUsage(...)` ve `requireFeatureAccess(...)`: server-side enforcement
  yardımcıları.

Personal practice başlatma ve personal practice sorusu cevaplama bu servisi
transaction içinde kullanır. Admin/import attempt endpoint'i B2C kullanım
değildir ve öğrenci kotasını tüketmez. Assignment ve assessment akışları da
personal daily practice kotasıyla karıştırılmaz.

## Personal ve organization scope

Tenant tipi entitlement scope'unu belirler:

- `INDIVIDUAL` tenant → `PERSONAL`: grant `tenantId + userId` ile eşleşir.
- `ORGANIZATION` tenant → `ORGANIZATION`: grant tenant'a aittir ve `userId`
  null'dır.

Her authenticated request'in aktif membership'i doğrulanır. Context değişince
service yeni tenant'ın scope ve grant'ını yeniden çözer; personal Premium grant
organization context'e taşınmaz. Bu aşamada organization billing veya okul
abonelik yönetimi yoktur. 8H-2 ile organization Premium'in aktif olmadığı ve
yalnızca personal scope'un Premium grant değerlendirdiği netleştirilmiştir.

## API contract

`GET /account/entitlements` authenticated ve aktif tenant context gerektirir.
Web, iOS ve Android aynı response'u kullanabilir. Response şu alanları taşır:

- `scope` ve tenant kimliği/tipi,
- `plan.code`, label, active, source, effective/expiry,
- `timezone` ve `usageDate`,
- feature bazında `allowed`, `dailyLimit`, `usedToday`, `remainingToday`,
  `resetAt`, `reason`,
- ödeme kapalıyken `premium.paymentAvailable: false` ve bilgilendirici CTA.

Client'ın gönderdiği `plan`, `premium` veya `remainingLimit` alanları karar
mekanizmasının parçası değildir.

## Student UI

Dashboard'daki entitlement kartı mevcut planı, günlük pratik/soru kullanımını
ve kişisel/organization scope'u gösterir. Kota dolduğunda API'nin Türkçe net
mesajı kullanılır. Premium CTA yalnızca 8H-2 bilgi ekranını açar; kart
bilgisi, kampanya, ödeme sayfası veya gerçek satın alma akışı yoktur.

## Database ve güvenlik

8H-1 migration'ı additive ve minimumdur: iki enum, `Entitlement` ve
`EntitlementUsage` tabloları, gerekli index/foreign key/CHECK kısıtları ve
tenant RLS policy'leri eklenmiştir. Tablolar `FORCE ROW LEVEL SECURITY`
durumundadır. Service tarafındaki membership/scope kontrolü RLS'in yanında
uygulama savunmasıdır.

Migration yalnızca TEST veritabanına deploy edilmiştir. Production DB'ye
bağlanılmamış, production migration/promotion/write yapılmamıştır.

## Gelecekte billing entegrasyonu için sınır

Ödeme sağlayıcısı ekleneceği zaman provider webhook/transaction katmanı ayrı
modül olarak entitlement grant üretir. Bu katman `source`, effective/expiry ve
active durumlarını günceller; practice route'ları ödeme sağlayıcısını doğrudan
çağırmaz. Webhook idempotency, audit ve cancellation/renewal kuralları o
çalışmanın kapsamıdır.

## Doğrulama

TEST fixture'ları Free default, Premium grant, kota exhaustion/reset,
timezone boundary, duplicate retry, 30 concurrent question request,
client tampering ve personal/organization scope ayrımını kapsar. Mevcut
student-learning regresyonu ayrıca korunmuştur. Gerçek pilot veya gerçek
Premium müşteri sonucu bu aşamada yoktur.
