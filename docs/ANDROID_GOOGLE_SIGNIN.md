# Android Google girişi: dağıtım ve imza doğrulaması

Android uygulaması Google Credential Manager ile Google ID belirteci alır. Mobil paket hazırlanırken sunucunun `/auth/social/config` yanıtındaki Web OAuth istemci kimliği `GetSignInWithGoogleOption` çağrısına verilir. Sunucu aynı Web istemci kimliğini kabul edilen audience listesine ekler; ID belirtecinin imza, issuer, audience ve istek nonce'u ayrıca doğrulanır. Token, nonce veya parola istemci tanılama kayıtlarına yazılmaz.

## Android OAuth istemci eşleşmesi

Her test APK'sının `com.okupratik.app` paket adı ve gerçek imza sertifikası SHA-1 değeri `mobile-native-builds.yml` iş akışının **Android test APK identity** adım özetinde raporlanır. Google Cloud Console'da, uygulamanın kullandığı Google Cloud projesinin Google Auth Platform / Clients bölümündeki **Android OAuth istemcisi** için paket adı ve SHA-1 birebir aynı olmalıdır. Bu iş akışı Google Cloud istemci kayıtlarını okuyamaz; özet yalnızca APK kimliğini kanıtlar, OAuth eşleşmesini değil.

Play App Signing ile yayımlanan APK'nın sertifikası test APK'sından farklı olabilir. Mağaza dağıtımında Play Console'daki App integrity bölümünde gösterilen uygulama imza sertifikasının SHA-1'i için de Android OAuth istemcisi kaydı bulunmalıdır. Upload key parmak izi Play tarafından kullanıcıya dağıtılan APK'nın imza parmak izi yerine geçmez.

## Tekrarlanabilir test imzası (isteğe bağlı)

Varsayılan CI debug imzası runner'a aittir ve başka bir iş akışı çalıştırmasında değişebilir. Aynı anahtarla güncellenebilir test APK'ları için güvenilir bir yönetici JKS test anahtarı oluşturup GitHub Actions repository secrets alanında şu adları birlikte tanımlayabilir:

- `ANDROID_TEST_KEYSTORE_BASE64` — JKS dosyasının Base64 içeriği.
- `ANDROID_TEST_STORE_PASSWORD` — JKS parolası.
- `ANDROID_TEST_KEY_ALIAS` — anahtar takma adı.
- `ANDROID_TEST_KEY_PASSWORD` — anahtar parolası.

İş akışı bu sırları yalnızca `master` push veya `master` workflow dispatch derlemesinde kullanır; değerleri loglamaz. Dördü birlikte yoksa standart runner debug anahtarı kullanılır; eksik bir alt küme varsa derleme kapalı biçimde başarısız olur. Anahtar dosyasını depoya, artifact'e veya loglara eklemeyin. Yeni sabit imza, cihazdaki farklı imzalı mevcut APK'nın üstüne kurulumla güncellenemeyebilir; önce mevcut APK'yı kaldırmak uygulamadaki yerel veriyi silebileceği için kullanıcının verisini yedeklemeden kaldırma önermeyin.

## Güvenli hata teşhisi

Android Google girişi başarısız olduğunda destek tanılaması yalnızca aşamayı (`CREDENTIAL_MANAGER`, `SERVER_EXCHANGE`, `SECURE_STORAGE_WRITE` vb.), güvenli hata kodunu, HTTP durumunu ve varsa istek kimliğini içerir. ID belirteci, nonce, parola, çerez ve ham hata mesajı bu tanılamaya dahil edilmez. Google Cloud Android istemci kaydıyla eşleşme, bu tanılama alanlarından çıkarılamaz; APK özeti ile Cloud Console kaydı ayrı ayrı karşılaştırılmalıdır.
