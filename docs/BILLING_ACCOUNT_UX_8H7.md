# OKU+ — 8H-7 Billing Account UX

## Kapsam ve mevcut kontrat

8H-7, mevcut iyzico SANDBOX billing kontratının üzerine kişisel kullanıcı için Türkçe bir hesap ve ödeme görünümü ekler. Provider değişmedi; production bağlantısı, production write, gerçek ödeme, recurring payment ve gerçek refund yapılmadı.

Billing account yalnızca `INDIVIDUAL` tenant içindeki aktif `STUDENT` üyeye açıktır. Organization context billing kapsamı dışındadır. Server her billing okuma/yazmasında `userId + tenantId + providerCode` scope kontrolü yapar; client tenant, plan, tutar veya subscription state seçemez.

## Sayfa ve navigasyon

Öğrenci menüsünde `Hesap ve Ödeme` sayfası bulunur. Dashboard entitlement kartındaki Premium CTA önce mevcut Premium bilgi ekranına gider; bilgi ekranındaki `Aboneliği ve ödemeleri yönet` ve Ayarlar’daki aynı bağlantı billing account sayfasını açar.

Sayfa şu alanları gösterir:

- mevcut plan ve kişisel scope;
- FREE kullanım özeti ve Premium avantajları;
- doğrulanmış subscription durumu, dönem, bilinen dönem sonu ve iptal bilgisi;
- mevcut kontrata göre abonelik yönetimi;
- server’dan scope’lanmış basit ödeme geçmişi;
- fatura için açık bekleme mesajı.

Bilinmeyen tutar, tarih, yenileme veya dönem sonu UI tarafından üretilmez.

## UI state sözleşmesi

| UI state            | Backend kaynağı                                                                   | Kullanıcıya gösterilen davranış                                   |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `FREE`              | subscription yok, entitlement Free                                                | Günlük kullanım, Premium avantajları ve checkout CTA              |
| `PREMIUM_ACTIVE`    | `ACTIVE` + Premium entitlement                                                    | Premium aktif, dönem bilgisi ve iptal yönetimi                    |
| `PREMIUM_PENDING`   | `PENDING`, `TRIAL`, `PAST_DUE` veya `ACTIVE` olup entitlement henüz Premium değil | Provider doğrulaması bekleniyor; webhook olmadan Premium açılmaz  |
| `PREMIUM_CANCELING` | `ACTIVE` + `cancelRequestedAt` + `canceledAt` yok                                 | İptal isteği işleniyor; dönem sonu bilinmiyorsa varsayım yapılmaz |
| `PREMIUM_CANCELED`  | `CANCELED`                                                                        | Eski abonelik yeniden açılmaz; yeni checkout CTA                  |
| `PREMIUM_EXPIRED`   | `EXPIRED`                                                                         | Yeni checkout CTA; iptal düğmesi yok                              |

Unknown provider state’i desteklenen bir state’e dönüştürülmez; yönetim düğmeleri kapatılır ve durumun doğrulanamadığı açıkça yazılır.

## Checkout ve reaktivasyon

FREE, CANCELED ve EXPIRED için CTA aynı backend `POST /billing/checkout` kontratını kullanır. CANCELED/EXPIRED için metin özellikle `Yeni Premium aboneliği başlat` şeklindedir. Client eski subscription kaydını `ACTIVE` yapamaz; yeni checkout yeni provider/subscription akışına bırakılır. Premium entitlement yalnızca doğrulanmış provider webhook’u sonrasında verilir.

Catalog fiyatı ve vergi kararı hâlâ `PENDING_BUSINESS_DECISION` olduğu için tutar uydurulmaz. iyzico SANDBOX yapılandırması yoksa CTA disabled kalır ve gerçek ödeme başlatılmayacağı yazılır.

## İptal UX ve mevcut karar

İptal düğmesi yalnız backend’in kabul ettiği `PENDING`, `TRIAL`, `ACTIVE`, `PAST_DUE` durumlarında ve provider subscription kimliği doğrulanmışsa görünür. Dialog:

1. açık uyarı ve olası hak etkisini;
2. mevcut backend kontratının provider’a `cancelAtPeriodEnd: false` ile immediate cancellation isteği gönderdiğini;
3. bilinen `currentPeriodEnd` değerini veya değerin bilinmediğini;
4. `İptali onayla` ve `Vazgeç` seçeneklerini gösterir.

Onay server `POST /billing/subscription/cancel` çağrısıdır. Client DB’ye yazmaz. Başarıda sayfa subscription ve entitlement verilerini yeniden çeker; failure dialog içinde görünür ve tekrar denemeye izin verir.

Scheduled cancellation UI’da varsayılmıyor. Mevcut teknik kontrat immediate cancellation’dır; dönem sonuna kadar erişim/yenileme ticari kuralı kesinleştirilene kadar `PENDING / REVIEW REQUIRED` olarak tutulur. UI, provider tarafından bilinmeyen bir hak kaybı veya yenileme tarihi vaat etmez.

## Ödeme geçmişi ve fatura

`GET /billing/payments` yalnız kişisel aktörün kendi `BillingPayment` kayıtlarını, en fazla 50 kayıt olacak şekilde, şu minimize edilmiş alanlarla döndürür:

- ödeme tarihi (`occurredAt`, yoksa server `createdAt`);
- `amountMinor` + `currency`;
- normalize edilmiş ödeme durumu.

Local payment ID, provider kimlikleri, provider payload’ı, kart numarası, CVV ve benzeri kart verileri response’a alınmaz. Gerçek payment yoksa boş geçmişte `Henüz doğrulanmış ödeme kaydı yok.` yazılır; sentetik browser fixture’ı production verisi gibi gösterilmez.

Fatura alanı şu açık mesajı kullanır:

> Fatura bilgileri ödeme altyapısı tamamlandığında burada gösterilecektir.

Sahte fatura veya e-belge oluşturulmaz.

## Refresh, telemetry ve erişilebilirlik

Billing account açıldığında entitlements, catalog, subscription ve payment history birlikte yeniden alınır. Login sonrası dashboard entitlement fetch’i korunur; billing sayfası focus olduğunda yeniden fetch edilir; checkout veya cancellation sonrasında subscription ve entitlement tekrar yüklenir.

Mevcut telemetry event’leri korunur: Premium bilgi görüntüleme/CTA, checkout started/completed/failed ve subscription canceled. Yeni event enum’u eklenmedi; payment/card verisi hiçbir telemetry payload’ına girmez.

Sayfa ve iptal dialog’u Türkçedir; native dialog başlık ilişkisi (`aria-labelledby`), status/alert bölgeleri, klavye ile çalışabilen düğmeler, 48px minimum etkileşim hedefleri, mobil grid/table davranışı ve reduced-motion ile uyumluluk browser regression’da kontrol edilir.

## Kapsam dışı

- Organization billing veya organization payment history.
- Provider değiştirme.
- Production DB/deployment/write.
- Gerçek iyzico sandbox E2E; credential yokluğu nedeniyle **NOT RUN**.
- Gerçek ödeme, refund veya recurring charge.
- 8G-8 production promotion ve 8G-9B production catalog.
