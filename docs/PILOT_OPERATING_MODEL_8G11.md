# OKU+ — 8G-11 Closed Pilot Operating Model

Tarih: 2026-09-02  
Kapsam: local/TEST üzerinde kapalı pilot operasyon hazırlığı  
Gerçek pilot durumu: başlatılmadı  
Production DB erişimi: **YOK**  
Production write/promotion: **NO**

## 1. Amaç ve karar sınırları

8G-11’in amacı, mevcut OKU+ öğrenme döngüsünü küçük ve kontrollü bir CLOSED BETA/PILOT için işletilebilir hâle getirmektir. Bu aşama pilot erişimi, kullanıcı kabul ölçütleri, veri sınırları, hata/içerik triage’ı, operatör görünürlüğü ve kapatma/geri alma prosedürünü tanımlar.

Bu belge production promotion onayı değildir. 8G-8 production DB/deployment blocker’ı ve 8G-9B production-grade Level/Skill catalog blocker’ı açık kaldığı için gerçek production pilotu başlatılamaz.

### Pilot kapsamı

- Davet/allowlist ile sınırlı öğrenci hesabı.
- Öğrencinin kişisel `INDIVIDUAL` tenant’ı ve aktif `STUDENT` üyeliği.
- Signup/login → consent → onboarding → hedef → seviye → öğrenme yolu → ilk egzersiz.
- Reading content, kapalı uçlu soru cevaplama, anlık feedback, tamamlanma, XP, streak, progress ve review.
- Bounded feedback ve bug report gönderimi.
- TEST telemetry üzerinden operasyonel KPI gözlemi.
- Küçük operatör görünümü: metrics ve son feedback/bug raporları.

### Pilot kapsamı dışı

- Production DB discovery, production bağlantısı, production write veya promotion.
- Gerçek production Level/Skill sözlüğü veya relation’larının tahmini.
- Subscription, ödeme, reklam, leaderboard, referral veya sosyal büyüme akışları.
- LLM-generated question, open-ended grading veya AI tutor.
- Harici analytics/crash vendor, cihaz fingerprint’i, IP/user-agent profili veya geniş dashboard.
- Yeni onboarding ürünü, büyük öğrenci/veli paneli veya kapsamlı admin operasyon sistemi.

## 2. Önerilen pilot büyüklüğü ve süresi

Öneri: **8–12 davetli öğrenci**, **7 ardışık gün** kullanım ve **2 iş günü** kapanış/triage süresi. Yaş bandı mevcut TEST pack’in 13–17 hedefiyle uyumlu tutulmalı; reşit olmayan kullanıcılar için mevcut parental consent zorunluluğu korunmalı.

Bu sayılar gerçek katılımcı veya sonuç değildir; kontrollü başlangıç için operasyon önerisidir. Allowlist büyütme kararı ancak P0/P1 yokluğu, consent/isolation doğrulaması ve açık bug triage’ı sonrasında verilir.

## 3. Pilot erişimi ve davet modeli

8G-11 için minimum güvenli model mevcut environment allowlist’idir:

- `PILOT_MODE=off` varsayılandır.
- `PILOT_MODE=on` yalnızca non-production process’te etkili olur.
- `PILOT_STUDENT_ACCESS`, virgülle ayrılmış kullanıcı ID veya e-posta allowlist’idir.
- Allowlist boşsa yalnızca local/TEST’te normal öğrenci hesaplarına kolaylaştırılmış erişim vardır; gerçek pilotta liste boş bırakılmamalıdır.
- Platform hesapları öğrenci pilot uçlarından reddedilir.
- Production process’i allowlist dolu olsa bile pilot öğrenci uçlarına erişemez.

Ayrı invite-code/invite-link tablosu bu aşamada eklenmedi. Davet, pilot koordinatörünün dış iletişim kanalıyla yaptığı roster onayı ve deployment/config allowlist değişikliğidir. Davet mesajı parola veya kişisel cevap verisi istememeli; kullanıcı signup/login’den sonra yalnızca allowlist kapsamındaysa pilot uçlarına erişmelidir.

Mevcut kurum üyeliği/invitation modeli kurumsal bağlam içindir. Pilot öğrencinin pilot erişimi için kurum üyeliği gerekmez; signup kişisel tenant ve aktif öğrenci üyeliği oluşturur.

## 4. Öğrenci kabul ölçütleri

Pilot öğrencisi kabul edilmiş sayılmadan önce aşağıdakiler tamamlanmalıdır:

- Davet edilen e-posta veya kullanıcı ID’si allowlist’te olmalı.
- Signup/login başarılı olmalı; auth session geçerli olmalı.
- Kişisel tenant `INDIVIDUAL` olmalı ve aktif `STUDENT` membership bulunmalı.
- Terms/data processing consent verilmiş olmalı.
- Reşit olmayan öğrenci için parental consent verilmiş olmalı.
- Profilde display name, mevcut seviye ve learning goal kaydedilmiş olmalı.
- Öğrenme yolu açılmalı ve ilk TEST/local published exercise görülebilmeli.
- Soru cevabı sonrası feedback, completion ve ürünün mevcut XP/streak/progress/review kaynakları görülebilmeli.
- Refresh sonrası session/onboarding state korunmalı; logout/login sonrası session yeniden kurulabilmeli.
- Yarım kalan egzersiz tekrar açıldığında aynı öğrenciye resume edilebilmeli.
- Feedback ve bug report, cevap metni/parola gibi hassas veri girmeden gönderilebilmeli.
- Öğrenci başka tenant veya başka öğrenci session/question/progress verisini okuyamamalı ya da değiştirememeli.

Bu ölçütlerin hiçbirisi gerçek pilot katılımcı sonucu olarak raporlanmamalıdır; local/TEST browser regression kanıtıdır.

## 5. Kullanıcı yolculuğu

Kabul edilen uçtan uca sıra:

`invite/allowlist → signup veya login → consent → onboarding → goal → level → learning path → first exercise → content → question → answer → feedback → completion → XP → streak → progress → review → bug report/feedback`

Mevcut onboarding ekranı ve route’ları kullanılır. Yeni onboarding akışı eklenmez. Consent, minor/parental consent ve personal-context provisioning mevcut canonical servislerde kalır.

Operasyonel kenar durumları:

- Refresh: `/auth/me` ve refresh token ile session restore.
- Logout/login: refresh token revoke edilir, local session temizlenir, yeniden login yapılır.
- Interrupted exercise: `IN_PROGRESS` session bugün ekranında resume edilir.
- Network error/lost response: mevcut retry/reconciliation ve client idempotency davranışı kullanılır.
- Duplicate submission: aynı `clientAttemptId` veya pilot idempotency ID’si ikinci kayıt oluşturmamalıdır.

## 6. Veri toplama sınırları

Toplanabilecek minimum pilot verisi:

- `tenantId`, `studentId`, izinli event tipi, client idempotency ID’si ve zaman.
- Gerekirse sahipliği doğrulanmış `sessionId` ve `questionVersionId`.
- Feedback kategorisi, 1–5 rating ve en fazla 1000 karakter mesaj.
- Bug kategorisi, durum ve en fazla 2000 karakter açıklama.
- Ürün kaynaklarından aggregate öğrenme ölçümleri: attempt doğruluğu, session durumu, completion, progress, XP/streak/review.

Toplanmayacak veriler:

- Ham cevap, cevap metni, parola veya consent dışı kişisel veri.
- IP, user-agent, cihaz fingerprint’i, konum veya reklam/profil kimliği.
- Raw stack trace, secret, token veya geniş hata payload’ı.
- Harici analytics veya crash vendor gönderimi.

Pilot telemetry tenant/student scope’ludur. TEST RLS politikaları pilot tablolarına read/insert sınırı uygular; admin aggregate/report erişimi platform rolüyle sınırlıdır. Retention ve production KVKK operasyon kararı production öncesi ayrıca onaylanmalıdır.

## 7. Telemetry ve KPI sözleşmesi

Kaynak event allowlist’i:

`SIGNUP_COMPLETED`, `ONBOARDING_STARTED`, `ONBOARDING_COMPLETED`, `LEARNING_PATH_OPENED`, `TODAY_OPENED`, `EXERCISE_STARTED`, `QUESTION_VIEWED`, `QUESTION_ATTEMPTED`, `QUESTION_ANSWERED`, `EXERCISE_COMPLETED`, `EXERCISE_ABANDONED`, `EXERCISE_RESUMED`, `ASSESSMENT_STARTED`, `ASSESSMENT_COMPLETED`, `REVIEW_STARTED`, `REVIEW_COMPLETED`, `STREAK_STARTED`, `STREAK_CONTINUED`, `TECHNICAL_ERROR`.

Operatör metrics endpoint son 30 UTC gününü döndürür. `dataStatus` yalnız `NO_PILOT_DATA` veya `PILOT_DATA_ONLY` olabilir; bu alan gerçek pilot başarısı iddiası değildir.

| Ölçüm               | Kaynak / tanım                                                      |
| ------------------- | ------------------------------------------------------------------- |
| Signup              | `SIGNUP_COMPLETED` adet                                             |
| Onboarding          | `StudentProfile.onboardingCompletedAt` ile tamamlanan öğrenci adedi |
| İlk egzersiz        | unique `EXERCISE_STARTED` / `EXERCISE_COMPLETED` öğrencileri        |
| DAU/aktif kullanıcı | event penceresinde görülen unique öğrenci                           |
| Exercise completion | `EXERCISE_COMPLETED` / `EXERCISE_STARTED`                           |
| Accuracy            | `Attempt.isCorrect=true` / scored attempt                           |
| Abandonment         | `EXERCISE_ABANDONED` adedi                                          |
| Resume              | `EXERCISE_RESUMED` / `EXERCISE_STARTED`                             |
| Review              | `REVIEW_STARTED` adedi                                              |
| Technical errors    | `TECHNICAL_ERROR` adedi ve tüm event’lere oranı                     |
| Retention           | ilk görülen telemetry gününden D1/D7/D14 active day dönüşü          |
| Feedback/bug        | son 30 gündeki bounded report adedi                                 |

`operator` özeti, pilot allowlist cardinality’si değil, current window içinde telemetry ile gözlenen kullanıcı ve operasyon kayıtlarını verir.

## 8. Minimum operatör görünümü

Büyük dashboard yapılmaz. Platform `SUPER_ADMIN` veya `ANALYST` için read-only API görünümü yeterlidir:

- `GET /admin/pilot/metrics`
  - `operator.pilotUsers`, `activeUsers`, `onboardingCompletions`, `exerciseStarts`, `exerciseCompletions`, `technicalErrorCount`, `feedbackCount`, `bugReportCount`.
  - acquisition, activation, engagement, learning, retention, habit, UX ve data status ayrıntıları.
- `GET /admin/pilot/reports?kind=feedback&limit=50`
- `GET /admin/pilot/reports?kind=bug&limit=50`

Raporlar e-posta/display name döndürmez. Öğrenci admin metrics/reports uçlarına erişemez. Operatör, teknik hata veya rapor sayısını kalite triage’ına aktarır; gerçek kullanıcı sonucu olmayan boş TEST penceresini başarı olarak yorumlamaz.

## 9. Bug triage

Bug triage içerik triage’ından ayrıdır. Her rapor `OPEN` başlar; operatör durumunu `TRIAGED` veya `RESOLVED` yapabilir. Öncelik, etkilenen kullanıcı sayısı ve yeniden üretilebilirlik ayrıca kaydedilir.

| Seviye | Tanım                                                                                               | Operasyon kararı                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P0     | Data loss, cross-tenant exposure, auth/security failure veya uygulamanın kullanılamaz olması        | Pilot erişimini derhal kapat; etkilenen akışı durdur; güvenlik incelemesi ve rollback/disable uygula |
| P1     | Core learning loop’un kırılması, tekrarlanan cevap corruption’ı, progress/gamification corruption’ı | Yeni davetleri durdur; etkilenen akışı disable et; düzeltme ve regression olmadan devam etme         |
| P2     | Significant UX veya content olmayan teknik kullanım sorunu                                          | Triage kuyruğuna al; etkilenen yüzeyi izole ederek pilotu sınırlı sürdürebilirsin                    |
| P3     | Cosmetic/minor sorun                                                                                | Planlı backlog; pilot kabulünü tek başına durdurmaz                                                  |

P0 veya doğrulanamayan güvenlik şüphesinde “bekleyip veri toplama” kararı verilmez. Rapor açıklamasına parola, token veya ham cevap eklenmemelidir.

## 10. Content triage

İçerik triage’ı kod bug’ından ayrı tutulur. İçerik raporu ilgili content/question/version ve pedagojik karar sahibiyle incelenir; doğrudan kod bug’ı olarak kapatılmaz.

| Seviye   | Tanım                                                                          | Operasyon kararı                                                                                        |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| CRITICAL | Wrong answer, factual error, dangerous instruction veya misleading instruction | İlgili content/question’ı derhal yayın dışı bırak; insan editorial review ve düzeltme olmadan geri açma |
| HIGH     | Ambiguous question, broken explanation veya wrong skill/level binding          | İlgili item’ı durdur; content/skill/level review ve regression yap                                      |
| MEDIUM   | Language quality sorunu                                                        | Editoryal sıraya al; anlam/öğrenme etkisini değerlendir                                                 |
| LOW      | Typo veya cosmetic içerik sorunu                                               | Planlı editoryal düzeltme                                                                               |

TEST pack’in production-grade catalog olduğu varsayılmaz. Gerçek production content/Level/Skill ve provenance kararı 8G-9B çözülmeden içerik promotion’ı yapılamaz.

## 11. Pilot termination, disable ve rollback

### Derhal termination kriterleri

- Herhangi bir P0 doğrulaması veya cross-tenant/auth/consent ihlali şüphesi.
- Öğrenci verisi kaybı ya da progress/XP/streak corruption’ının güvenilir biçimde durdurulamaması.
- CRITICAL content hatasının birden fazla öğrenciye açık kalması.
- Pilotun consent veya allowlist sınırının dışına taşması.
- Production hedefi veya production write yoluna dair kontrol kaybı.

### Kapatma ve geri alma sırası

1. `PILOT_MODE=off` yap ve yeni pilot route erişimini kapat.
2. Gerekirse `PILOT_STUDENT_ACCESS` listesini boşalt veya yalnızca onaylı hesapları bırak.
3. İlgili exercise/content/question yüzeyini mevcut yayın/feature kontrolüyle disable et; yeni ürün özelliği ekleme.
4. Açık P0/P1 raporlarını triage et, etkilenen session/tenant/student kapsamını belirle.
5. Düzeltme sonrası targeted isolation, consent, idempotency, browser ve quality gate’lerini yeniden çalıştır.
6. Pilot yeniden açılacaksa yeni küçük allowlist ve açık operator onayı kullan.

Bu aşamada production rollback komutu veya production backup/restore kanıtı uydurulmaz. Local/TEST verisi için hedefli cleanup yalnız sentetik fixture’larda yapılır; reset/drop/truncate kullanılmaz.

## 12. Güvenlik ve mahremiyet kabul listesi

- [x] Student route’ları authenticated session ister.
- [x] Aktif `STUDENT` membership ve tenant context doğrulanır.
- [x] Personal tenant kurum üyeliği olmadan çalışır.
- [x] Session/question context öğrenci ve tenant ownership ile doğrulanır.
- [x] Pilot tablolarında tenant/student scoped unique key ve TEST RLS vardır.
- [x] Admin metrics/reports `SUPER_ADMIN`/`ANALYST` ile sınırlıdır.
- [x] Consent ve minor/parental consent mevcut onboarding canonical akışında kalır.
- [x] Feedback/bug payload’ları bounded ve idempotent’tir.
- [x] Raw answer, IP, device fingerprint, password/token ve raw stack trace toplanmaz.
- [x] Production pilot erişimi process guard ile reddedilir.

## 13. TEST kapsamı ve doğrulama

Mevcut local TEST curriculum pack kapsamı: **9 content / 36 question**. Manifestte 3 pedagojik track (`main-idea`, `detail`, `inference`), TEST DB pack relation’ında 3 fixture skill binding ve 1 TEST fixture level metadata binding vardır. Bu sayıların hiçbiri production catalog sonucu değildir.

Question type dağılımı: **27 MULTIPLE_CHOICE, 9 TRUE_FALSE**. Cognitive demand: **14 RECALL, 11 UNDERSTAND, 11 INFER**.

Content difficulty dağılımı: `0.45×2`, `0.50×2`, `0.55×2`, `0.60×1`, `0.65×1`, `0.70×1`.

Question difficulty dağılımı: `0.35×6`, `0.40×5`, `0.45×8`, `0.50×5`, `0.55×5`, `0.60×4`, `0.65×2`, `0.70×1`.

Her QA komutu explicit local TEST URL ile çalıştırılmalıdır. Catalog QA’nın TEST fixture nedeniyle `BLOCKED` vermesi beklenen durumdur; bu aşamada production blocker çözülmez.

Doğrulama kapsamı:

- `npm test`
- lint, format check, typecheck, build
- `npx prisma validate`, `npx prisma migrate status`
- explicit TEST pack QA, catalog QA, fixture QA
- mevcut 9 browser regression akışı
- closed-pilot browser journey: signup/login, consent/onboarding, personal tenant, learning path, exercise/answer/feedback/completion, XP/streak/progress/review, refresh/resume, feedback/bug, duplicate replay, logout/login

## 14. Pilot başlamadan önce açık production bağımlılıkları

- 8G-8: production DB fingerprint, deployment source ve write/promotion kontrolü.
- 8G-9B: production-grade Level/Skill catalog, Level→Skill ve Content→Level relation kararı.
- Production allowlist/deployment secret’ları ve operator sahipliği.
- KVKK consent/retention ve minor pilot operasyon onayı.
- Production observability/alerting, backup/restore ve gerçek production smoke kanıtı.

Bu bağımlılıklar çözülmeden öneri: local/TEST foundation PASS olarak kabul edilebilir; gerçek production pilotu **başlatılmamalı**.
