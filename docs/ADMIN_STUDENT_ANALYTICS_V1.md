# Yönetim ve Öğrenci Analitiği V1

Bu panel yalnızca kurum yönetimi bağlamında, sunucuda zaten tutulmuş kayıtları okur. Yeni analytics tablosu, migration veya istemci tarafından gönderilen serbest telemetry sözleşmesi eklemez.

## Kapsam ve yetki

- `OWNER`, `ORG_ADMIN` ve `BRANCH_MANAGER` rolleri erişebilir.
- `BRANCH_MANAGER` yalnızca yönettiği şubelerde aktif kaydı bulunan öğrencileri görür.
- `SUPER_ADMIN` için platform kapsamı vardır; aktif kurumsal ve bireysel tenant'lardaki aynı `studentId` tek bir öğrenci olarak sayılır ve tenant bağlantıları ayrı gösterilir.
- `OWNER`, `ORG_ADMIN` ve `BRANCH_MANAGER` için tüm sorgular seçili `tenantId` ve gerektiğinde şube/sınıf ilişkisiyle sınırlandırılır.
- Platform toplamları benzersiz öğrenci sayısını kullanır; oturum, etkinlik ve teknik hata kayıtları kaynak tenant kayıtlarının toplamıdır. Kurum toplamları yalnızca yetkili kurum kapsamını temsil eder.

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

## Yönetim ekranı

- Super Admin, `Öğrenciler` ve `Öğrenci Analitiği` menülerinden platform kapsamına erişir.
- Öğrenci listesi arama, hesap durumu, kurum türü ve tenant filtresi sunar; aynı öğrenci farklı tenant bağlantılarında listede çoğaltılmaz.
- Öğrenci ayrıntısı öğrenme yolu adımlarını ve durumlarını salt okunur gösterir. Bu görünüm 31 → 32 gibi geçiş incelemelerine yardımcı olur; ilerleme yazmaz.

## Performans ve güvenlik

Liste uçları sayfalıdır. Öğrenci ayrıntısı ham cevap, token, e-posta veya serbest telemetry payload'ı döndürmez. Ayrıntılı sorgular yalnızca seçilen öğrencinin yetkili tenant kapsamındaki kayıtlarını okur; hiçbir endpoint yazma işlemi yapmaz.
