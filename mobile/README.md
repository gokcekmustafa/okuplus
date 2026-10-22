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

## Uygulama simgeleri

`assets/okupratik-app-icon-master.png` marka simgesinin kaynak görselidir. iOS için
1024×1024 App Store simgesi, Android için yoğunluğa göre launcher ve adaptive
icon görselleri projeye eklenmiştir. `assets/okupratik-splash-source.png` ise
Android yön/density varyantları ve iOS açılış ekranı için kaynak görseldir.
Native splash çıktıları JPEG biçimindedir; böylece yüksek çözünürlüklü degrade
görseller gereksiz PNG boyutu oluşturmaz. `test/mobile-native-config.test.ts`
görsel ölçülerini ve platform kimliklerinin eşleşmesini denetler.

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
