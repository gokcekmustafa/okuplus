# Yönetim ve Öğrenci Analitiği V1

Bu panel yalnızca kurum yönetimi bağlamında, sunucuda zaten tutulmuş kayıtları okur. Yeni analytics tablosu, migration veya istemci tarafından gönderilen serbest telemetry sözleşmesi eklemez.

## Kapsam ve yetki

- `OWNER`, `ORG_ADMIN` ve `BRANCH_MANAGER` rolleri erişebilir.
- `BRANCH_MANAGER` yalnızca yönettiği şubelerde aktif kaydı bulunan öğrencileri görür.
- Platform kullanıcısı için tenant seçilmeden analitik açılmaz; böylece tenant kapsamı belirsiz bir global rapor oluşmaz.
- Tüm sorgular `tenantId` ve gerektiğinde şube/sınıf ilişkisiyle sınırlandırılır.

## Veri kaynakları

- Öğrenci kapsamı: `StudentProfile`, `User`, `Enrollment` ve `Class`.
- Öğrenme yolu: `StudentLearningPath`, `LearningPath`, `LearningUnit`, `LearningStep` ve `StudentLearningStepProgress`.
- Soru/alıştırma performansı: `ExerciseSession` ve `Attempt`.
- Antrenman oturumu: `TrainingSession`.
- Ölçüm ve başlangıç karşılaştırması: `AssessmentResult`, `StudentBaseline` ve `StudentProgress`.
- Ödev durumu: `StudentAssignment`.
- Teknik hata ve ekran/etkinlik sinyalleri: mevcut, append-only `PilotEvent` kayıtları.

## Tanımlar

- Aktif öğrenci, seçilen tarih aralığında bu kaynaklardan en az birinde server-side etkinlik kaydı bulunan öğrencidir.
- Ortalama süre yalnızca tamamlanan `ExerciseSession.timeSpentMs` değerlerinden hesaplanır. Bu alan yoksa `Veri mevcut değil` gösterilir.
- “Tamamlanmayan” öğrenci, dönemde başlayıp tamamlanmış duruma ulaşmamış `ExerciseSession` veya `TrainingSession` kaydı bulunan öğrencidir.
- Okuma hızı ve anlama ayrı gösterilir. Hız için `FAST_*` becerilerindeki `StudentProgress.fluencyWcpm`, anlama için `RC_*` becerilerindeki aynı kanıt kullanılır.
- Akademik eşik veya yeni mastery kararı üretilmez. “İnceleme sinyali” yalnızca mevcut `AssignmentRecommendation` kaydından gösterilir.

## Tarih ve eksik veri davranışı

Tarih aralığı UTC gün başlangıçlarıyla yorumlanır ve en fazla 366 gün olabilir. Geçmişte event olarak tutulmamış bir ekran veya etkileşim sonradan üretilemez; ilgili yerde `Veri mevcut değil` gösterilir. Panel veriyi Öğrenme Yolu, Bağımsız Antrenman, Ödevler ve Ölçme-Değerlendirme metrikleriyle birleştirmez.

## Performans ve güvenlik

Liste uçları sayfalıdır. Öğrenci ayrıntısı ham cevap, token, e-posta veya serbest telemetry payload'ı döndürmez. Ayrıntılı sorgular yalnızca seçilen öğrencinin yetkili tenant kapsamındaki kayıtlarını okur; hiçbir endpoint yazma işlemi yapmaz.
