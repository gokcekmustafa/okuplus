# OKU+ — 8H-6 Billing Business Decisions Register

Bu kayıt teknik güvenlik kararlarını ticari, hukuki, muhasebesel ve provider'a
bağlı kararlardan ayırır. `PENDING` olan bir konu uygulamada fiyat, süre,
entitlement veya kullanıcı vaadi olarak uydurulamaz.

## DECIDED

| Konu                 | Karar                                                                                                          | Kanıt / sınır                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Plan kodları         | `PLAN_FREE` ve `PLAN_PREMIUM` mevcut entitlement planlarıdır                                                   | `src/modules/entitlements/service.ts`      |
| Premium kapsamı      | Şimdilik yalnız sınırsız practice ve practice-question                                                         | 8H-2 feature map; diğer yetenekler planned |
| Billing scope        | Yalnız `INDIVIDUAL` tenant + authenticated active `STUDENT` owner                                              | billing service owner guard                |
| Organization         | Organization billing bu aşamada kapsam dışıdır ve etkilenmez                                                   | `ORGANIZATION` checkout 403                |
| Provider environment | iyzico sandbox-only; production base URL reddedilir                                                            | adapter configuration guard                |
| Card data boundary   | Hosted checkout kullanılır; OKU+ raw card/CVV saklamaz veya almaz                                              | iyzico adapter / data minimization         |
| Entitlement source   | Client payload veya callback tek başına kaynak değildir; verified provider event + local owner mapping gerekir | webhook processor                          |
| Webhook idempotency  | `(providerCode, providerEventId)` unique inbox; farklı hash conflict                                           | `BillingWebhookEvent`                      |
| Payment duplicate    | `(providerCode, providerOrderReference)` unique payment upsert                                                 | `BillingPayment`                           |
| Audit minimization   | Opaque provider references ve canonical hash tutulur; raw payload/secret/card tutulmaz                         | 8H-6 audit migration                       |
| Production safety    | Production DB write, production payment ve destructive QA yok                                                  | stage gate                                 |

## PENDING — karar sahibi atanmalı

| Konu                | Açık karar                                                                 | Teknik etkisi                                       |
| ------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| Aylık fiyat         | TRY tutarı ve fiyatın vergi dahil gösterimi                                | Published immutable price/catalog snapshot          |
| Yıllık fiyat        | TRY tutarı, aylıkla ilişkisi ve indirim/tasarruf mesajı                    | Separate plan reference + UI disclosure             |
| Currency            | Ürün katalog para birimi ve bölgesel fiyatlandırma                         | Provider plan/catalog contract                      |
| Trial               | Trial var mı, süresi, uygunluk, tekrar trial ve otomatik dönüşüm           | `TRIAL` lifecycle + consent/notification            |
| Grace period        | Failed recurring payment sonrası erişimin korunup korunmayacağı ve süre    | `PAST_DUE` entitlement policy; timer/reconciliation |
| Cancellation policy | Immediate vs period-end; period-end erişim ve pro-rata davranışı           | `CANCELED` entitlement/UI                           |
| Renewal             | Retry sayısı, retry aralığı, failure sonrası expiry ve kullanıcı bildirimi | `PAST_DUE` → `ACTIVE` / `EXPIRED` orchestration     |
| Refund policy       | Full/partial refund, cutoff, refund sonrası Premium erişimi                | Payment vs subscription vs entitlement rule         |
| Reactivation        | Yeni abonelikte eski dönem, entitlement continuity ve refund ilişkisi      | New subscription linkage / UI history               |
| Premium UI          | Billing history, invoice, retry/update-card akışı ve status copy           | Route/UX contract                                   |
| Payment owner       | Adult user, parent/guardian veya farklı payer modeli                       | Authorization and legal flow                        |

8H-3 kararının devamı olarak trial, grace, gerçek fiyat ve cancellation sonrası
erişim bu aşamada ürün kararı değildir. Uygulamanın current fail-safe no-grant
sonucu bu PENDING başlıkları için ticari onay sayılmaz.

## LEGAL REVIEW

- Minor kullanıcıların recurring payment kullanımı, veli/ebeveyn onayı ve
  ödeme sahibi;
- yaş doğrulama, consent kaydı ve iletişim izinleri;
- mesafeli satış/abonelik şartları, iptal-iade metni, otomatik yenileme bildirimi;
- tüketiciye sunulacak refund/cancel ve dönem sonu erişim açıklamaları;
- satış ülkesi, kişisel veri aktarımı ve provider sözleşmesi.

Bu kayıt hukuki görüş veya yaşa göre otomatik yetki üretmez.

## ACCOUNTING REVIEW

- KDV/VAT oranı ve fiyatların vergi dahil/dahil değil gösterimi;
- fatura/e-arşiv/e-belge türü, fatura sahibi ve fatura adresi;
- refund/cancel muhasebe kaydı ve dönemsel mutabakat;
- currency conversion, settlement ve provider rapor eşleştirmesi.

## PROVIDER DEPENDENCY

| Konu                 | Mevcut provider bağımlılığı                                                | OKU+ kararı                                          |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Subscription product | iyzico hesabında subscription add-on ve plan gerekir                       | Credential/plan yokken sandbox E2E yok               |
| Plan reference       | Merchant panel/API plan reference code'u server env'den gelir              | Client price/plan seçemez                            |
| Webhook activation   | HTTPS URL ve `X-IYZ-SIGNATURE-V3` hesap aktivasyonu gerekir                | Aktivasyon yoksa E2E BLOCKED                         |
| Notification seti    | Subscription webhook success/failure ve recurring attempts                 | CANCELED/EXPIRED için detail/reconciliation gerekir  |
| Signature            | V3 HMAC alan sırası provider contract'a bağlıdır                           | Eski V1/V2 fallback yok                              |
| Cancellation         | Provider cancel endpoint'i immediate; period-end adapter contract'ında yok | `cancelAtPeriodEnd=true` reddedilir                  |
| Retry                | `orderReferenceCode` failed retry korelasyonu için kullanılır              | Gerçek retry zamanı varsayılmaz                      |
| Refund               | `/v2/payment/refund` verified payment ID + price ister                     | Subscription webhook payment ID'siz refund başlatmaz |
| Trial                | Plan `trialPeriodDays` destekler                                           | Product trial kararı alınmadan kullanılmaz           |

## Karar tamamlanmadan yapılmayacaklar

Fiyat/currency/trial/grace/refund/cancellation kararları ve gerekli legal/
accounting incelemeleri tamamlanmadan gerçek satış, production payment, period-
end entitlement vaadi, otomatik grace timer veya minor kullanıcıya recurring
billing açılmaz.

Kaynaklar: [8H-3 Pricing Policy](PRICING_POLICY_8H3.md),
[iyzico Subscription](https://docs.iyzico.com/en/products/subscription),
[iyzico Webhook](https://docs.iyzico.com/en/advanced/webhook),
[iyzico Refund & Cancel](https://docs.iyzico.com/en/advanced/refund-and-cancel).
