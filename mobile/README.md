# OkuPratik mobil uygulama temeli

Bu dizin, mevcut `public/` SPA'sını yerel web varlıkları olarak paketleyen Capacitor
Android ve iOS kabuğunu içerir. Uygulama yalnızca uzak web sitesini açmaz; web
varlıkları uygulamanın içine kopyalanır ve API istekleri açıkça yapılandırılmış
`OKUPRATIK_API_BASE_URL` adresine gider.

## Geliştirme akışı

```powershell
cd mobile
npm install
$env:OKUPRATIK_API_BASE_URL = "https://www.okupratik.com"
npm run sync
npm run open:android
npm run open:ios
```

`OKUPRATIK_API_BASE_URL` varsayılan olarak canonical web/API origin olan
`https://www.okupratik.com` değerini kullanır. Başka bir ortam için adres açık bir
HTTPS origin olarak ayrıca verilmelidir; wildcard, kullanıcı adı veya parola kabul
edilmez.

## Oturum güvenliği

Web uygulaması web tarayıcısında mevcut davranışını korur. Native kabukta erişim,
yenileme ve tenant tokenları `@aparajita/capacitor-secure-storage` üzerinden iOS
Keychain ve Android Keystore destekli depolamaya alınır. Native secure-storage
köprüsü kullanılamazsa mobil çalışma zamanı tokenları kalıcı `localStorage`'a
yazmaz ve oturum açma güvenli biçimde başarısız olur.

## Durum ve mağaza öncesi sınırlar

- `com.okupratik.app` teknik bir aday kimliktir; Google Play/App Store kaydının
  yapıldığı varsayılmaz.
- iOS derlemesi macOS/Xcode ve Apple Developer hesabı gerektirir.
- Android derlemesi Android SDK, JDK ve Gradle/Android Studio gerektirir.
- Üretim sırları, mağaza imzalama anahtarları ve provider kimlikleri bu dizinde
  tutulmaz.
- Hesap silme, gizlilik beyanı/veri saklama metni ve uygulama içi ödeme kuralları
  mağaza gönderiminden önce ürün/hukuk/mağaza sahipleri tarafından tamamlanmalıdır.
- Mobil uygulama mevcut Learning Path, Training, Assignment ve Measurement
  ayrımını değiştirmez.
