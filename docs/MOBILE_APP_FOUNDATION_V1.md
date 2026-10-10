# OkuPratik Mobil Uygulama Temeli v1

## Kapsam

Bu değişiklik, mevcut vanilla HTML/CSS/JavaScript istemcisini Capacitor 8 ile
yerel Android ve iOS uygulama kabuğuna paketlemek için gereken temeli oluşturur.
Web istemcisi ve Fastify sunucusu ayrı bir uygulama olarak korunur; mobil kabuk
web sitesini yalnızca uzaktan açmaz, `public/` varlıklarını uygulama paketine
alır.

## Mimari ve API sınırı

Mobil hazırlama komutu `public/index.html`, `public/app.js`, `public/styles.css`
ve varlıklarını `mobile/www/` içine kopyalar. Üretilen `mobile-runtime.js`, API
originini açıkça tanımlar. Varsayılan canonical origin
`https://www.okupratik.com`'dur ve `OKUPRATIK_API_BASE_URL` ile başka bir açık
HTTPS origin kullanılabilir. Kullanıcı adı, parola, wildcard veya HTTP adresi
kabul edilmez.

İstemcinin kullandığı `/auth/login`, `/auth/signup`, `/auth/refresh`,
`/auth/logout`, `/auth/me`, öğrenme, antrenman, ödev ve ölçme rotaları mevcut
Fastify uygulamasında kayıtlıdır. Native kabuk aynı path'leri explicit API
originine yönlendirir; web sürümünde aynı-origin fetch davranışı değişmez.

Capacitor Android yerel origini için dağıtım ortamının CORS allowlist'inde
gerekli açık origin ayrıca tanımlanmalıdır. Bu kod değişikliği production
environment değerlerini değiştirmez; yetkili release adımında en azından
`https://localhost` ile canonical web origini birlikte değerlendirilmelidir.
Wildcard CORS kullanılmamalıdır.

## Oturum ve güvenlik

Web tarayıcısındaki mevcut token davranışı korunur. Native kabukta access token,
refresh token ve tenant context bellek içinde kullanılır; kalıcı kopya
`@aparajita/capacitor-secure-storage` ile Android Keystore destekli şifreli
depolamaya ve iOS Keychain'e yazılır. Secure-storage köprüsü yoksa mobil kabuk
tokenları `localStorage`'a düşürmez.

Refresh ve logout mevcut sunucu rotalarını kullanır. Tenant kimliği istemcinin
tek başına yetkisi değildir; mevcut bearer/session ve sunucu tenant izolasyonu
korunur.

Web OAuth callback'i mağaza uygulamasına otomatik olarak yönlendirilmiş değildir.
Native Google/Apple sağlayıcı SDK'sı, redirect/deep-link, mağaza client ID'leri
ve callback sözleşmesi ayrı bir release işidir. Mobil kabuk bu entegrasyon hazır
olana kadar Google girişini yanlış başarı gibi göstermeyip açık durum mesajı
verir; e-posta/şifre girişi ve yenileme akışı mevcut API üzerinden çalışır.

## Native projeler

- App adı: `OkuPratik`
- Aday package/bundle id: `com.okupratik.app`
- Teknik sürüm: `0.1.0` / Android `versionCode=1`, `versionName=1.0`
- Android `minSdk=24`, `compileSdk=36`, `targetSdk=36`
- iOS projesi Swift Package Manager tabanlı Capacitor kabuğudur.

Package/bundle kimliğinin mağazada kayıtlı olduğu, imzalama sertifikalarının
oluşturulduğu veya geliştirici hesaplarının erişilebilir olduğu varsayılmaz.

## Mağaza öncesi açık kapılar

Bu temel, aşağıdaki maddeleri çözülmüş kabul etmez:

- Windows ortamında Xcode/macOS olmadığı için iOS archive doğrulaması yapılamaz.
- Android gerçek derlemesi için Android SDK, JDK 17+ ve Gradle/Android Studio
  gerekir; bu çalışma ortamında bunların tamamı bulunmayabilir.
- Hesap silme ve buna bağlı verilerin saklama/silme politikası uygulama
  sözleşmesi olarak tamamlanmalıdır.
- Gizlilik politikası, veri beyanları, destek URL'si, yaş/veli/onam metinleri ve
  mağaza ekran görüntüleri hazırlanmalıdır.
- Web ödeme akışı native mağaza içi abonelik kuralları açısından ayrıca
  değerlendirilmelidir; App Store/Google Play satın alma ve server-side receipt
  doğrulaması bu temelde eklenmemiştir.
- Google/Apple native giriş, deep-link ve test hesapları ayrıca doğrulanmalıdır.
- Mobile dependency audit çıktısı release gate olarak takip edilmelidir; bu
  belge orta önem dereceli npm audit uyarılarını çözülmüş göstermez.

Öğrenme Yolu, Antrenman, Ödevler ve Ölçme-Değerlendirme ayrımı; P1-B/C/D
kalibrasyon ve atama kapıları; production verisi ve migration akışı bu temel
tarafından değiştirilmez.
