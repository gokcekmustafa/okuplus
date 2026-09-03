# OKU+ — AŞAMA 8H-4 FINAL REPORT

STATUS:
PASS

8H-4 güncel resmi provider araştırması, gerekçeli sağlayıcı önerisi ve
provider-independent ödeme entegrasyon mimarisi olarak tamamlandı. Karar
bekleyen ticari/hukuki alanlar `VERIFY`, `UNKNOWN` veya açık review etiketiyle
bırakıldı; teknik doküman PASS olarak kapatıldı.

PRIMARY PROVIDER:

**iyzico — RECOMMENDED.** Türkiye-first B2C Premium, TRY, recurring
subscription, plan/trial ihtimali, refund/cancel, webhook ve küçük/orta SaaS
operasyonu birlikte değerlendirildiğinde mevcut kanıta göre en düşük domain
uyumsuzluğu bu adayda görünüyor. Merchant onboarding, account activation,
foreign card, installment, ücret ve uyum koşulları ayrıca VERIFY edilmelidir.

SECONDARY PROVIDER:

**PayTR — SECONDARY OPTION.** Türkiye merchant/API, TRY, installment, card
storage, recurring payment, callback/hash ve sandbox yüzeyi güçlüdür. Native
subscription lifecycle'ın açık olmaması, recurring akışın NON3D olması ve
callback/retry sorumluluğunun daha fazla merchant kodu gerektirmesi nedeniyle
ikincil bırakıldı.

REASONING:

iyzico resmi dokümanında product/plan/subscription, trial, status, retry,
cancel, recurring webhook, signature V3, refund/partial refund ve sandbox
akışları aynı ürün ailesinde belgeleniyor. PayTR uygulanabilir bir yedek olsa
da registered-card recurring + NON3D ve internal lifecycle yükü daha yüksek.
Stripe teknik olarak kapsamlıdır; ancak güncel resmi global availability
listesinde Türkiye merchant ülkesi olarak yer almadığı için mevcut Turkey-first
launch için seçilmedi. Bu, mutlak kalite sıralaması değil, mevcut OKU+ kapsamına
göre bir karardır.

PROVIDER COMPARISON:

iyzico, PayTR ve Stripe; recurring/subscription, TRY, 3DS, webhook signature,
refund/partial refund, cancellation, installment, international cards, sandbox,
idempotency, API maturity, Türkiye uygunluğu ve riskler başlıklarında resmi
kaynaklarla karşılaştırıldı. Açıkça belgelenmeyen alanlar `UNKNOWN/VERIFY`
olarak işaretlendi.

CHECKOUT:

Kesin akış: Student → Premium CTA → authenticated backend → personal/individual
tenant authorization → active Price snapshot → provider checkout → payment →
verified webhook → billing state → entitlement resolver → server-side Premium
access. Success/cancel redirect veya client iddiası entitlement kaynağı değildir.

WEBHOOK:

Signature verification, raw body, timestamp/replay protection, provider event
ID uniqueness, transaction boundary, retry safety, auditability ve ordering
kuralları kesinleştirildi. Duplicate webhook sonucu **NO DUPLICATE EFFECT**.
`ACTIVE → CANCELED` sonrasında eski `ACTIVE` webhook Premium'u tekrar açamaz.

BILLING MODEL:

Migration uygulanmadan kavramsal `BillingCustomer`, `Subscription`, `Payment`,
`WebhookEvent` ve gerekirse `Invoice` modelleri; internal/provider ID, scope,
status, timestamps, amount/currency ve provider metadata ayrımları tanımlandı.
Raw card data ve CVV yoktur. Billing state ile `PLAN_FREE`/`PLAN_PREMIUM`
entitlement state'i ayrıdır.

SECURITY:

Card number/CVV saklama yok; payment secret client'a gitmez; provider secret
env/secret-only; webhook signature zorunlu; server-side authorization; provider
response client trust source değil. Replay, event uniqueness, redacted logs ve
minimum audit kuralları tanımlandı.

MOBILE:

Web, iOS ve Android aynı billing/entitlement backend'ini kullanır. Native
uygulamalar provider SDK'sına core domain seviyesinde bağlanmaz; channel ve
store/provider ayrıntıları backend adapter sınırında normalize edilir.

MINOR USER:

Payment ownership, parent payer, parental consent, recurring authorization,
refund/cancellation ve yaşa bağlı uygunluk `BUSINESS/LEGAL REVIEW REQUIRED`.
Kodda veya provider seçiminde hukuki varsayım yapılmadı.

TESTS:

8H-3 baseline korunarak `npm test -- --reporter=dot`: 33 test dosyası,
604/604 test PASS. Lint, format check, typecheck, build, Prisma validate ve
TEST migration status PASS; TEST veritabanı 11 migration up to date.

BROWSER:

Seçili browser regression 9/9 PASS. Closed-pilot operations browser regression
PASS: TEST preflight, personal tenant, Premium/paywall, entitlement response
tampering'in erişim açmaması, telemetry, replay/cleanup ve session restore
kontrolleri geçti. 8H-4 docs-only olduğu için gerçek ödeme veya provider
checkout test edilmedi.

PRODUCTION WRITE:
NO

8G-8:
OPEN

8G-9B:
OPEN

BUSINESS/LEGAL DECISIONS:

- iyzico merchant onboarding, KYC, sözleşme, ücret ve account activation;
- Premium aylık/yıllık TRY fiyatı, currency ve tax-inclusive display;
- trial seçimi, eligibility, payment method ve conversion;
- subscription 3DS/NON3D, foreign card ve installment kapsamı;
- renewal, PAST_DUE/grace, cancel-at-period-end ve restore;
- full/partial refund ve refund sonrası entitlement;
- invoice/e-document, tax/VAT/KDV, legal entity ve accounting workflow;
- minor/parent payer/consent/recurring authorization;
- Web/iOS/Android kanalının provider/store stratejisi;
- organization billing'in gelecekte ayrı aşamada ele alınması.

FINAL RECOMMENDATION:

8H-4 için PASS. iyzico primary, PayTR secondary olarak tutulmalı; ancak
provider seçimi henüz canlı entegrasyon yetkisi değildir. Merchant ve
business/legal doğrulamaları yazılı olarak tamamlanmadan provider secret,
sandbox dışı checkout, canlı webhook, migration veya production billing write
başlatılmamalıdır. 8G-8 ve 8G-9B blocker'ları açık kalmalıdır.
