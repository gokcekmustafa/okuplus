# OkuPratik — Placement Kalibrasyon Veri Gereksinimleri v1

**Durum:** Hazırlık paketi; placement assignment kapalı
**İlişkili paketler:** P1_ADAPTIVE_MEASUREMENT_EVIDENCE_MATRIX_V1, P1_ADAPTIVE_EXPERT_REVIEW_FORM_V1, P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1

Bu belge, ölçüm uzmanı ve veri sorumlusu için hangi kanıtların toplanması gerektiğini tanımlar. Sayısal eşik, örneklem büyüklüğü veya akademik karar uydurmaz. Bu veri oluşmadan calibrationStatus CALIBRATED veya productionAssignmentEnabled=true yapılmamalıdır.

## 1. Değişmezler

- Item bank ve published assessment version'ları immutable kabul edilir.
- Geçmiş assessment sonucu geriye dönük değiştirilmez.
- Pilot kayıtları production öğrenci ilerlemesine, P0/P1 progress'ine veya route assignment'a yazılmaz.
- Training, WPM, istemci payload'ı ve tek aggregate skor placement evidence yerine kullanılamaz.
- Eksik, çelişkili, yanlış version'lı, ambiguous veya tamamlanmamış sonuç REVIEW_REQUIRED olarak kalır.

## 2. Her yanıt için gerekli iz

Kalibrasyon veri setindeki her kayıt, anonim pilot participant ID ile aşağıdaki alanları taşımalıdır:

| Alan                        | Gereklilik                                                                  |
| --------------------------- | --------------------------------------------------------------------------- |
| Assessment identity/version | Assessment ID, version ve lifecycle                                         |
| Item identity/version       | Stable question ID, question version, content/passage version               |
| Item bank/mapping version   | Mapping ve item-bank manifest kimlikleri                                    |
| Template/session identity   | TemplateVersion, session ve tamamlanma durumu                               |
| Server response evaluation  | Sunucunun hesapladığı answer outcome, raw score ve reason                   |
| Question type               | MC, TF, MATCHING veya FILL_BLANK                                            |
| Skill/dimension             | Primary skill ve trusted editorial dimension                                |
| Completeness                | Eksik, duplicate, invalid veya ambiguous response bilgisi                   |
| Context signals             | Süre gibi sinyaller yalnız yardımcı bağlamdır; tek başına evidence değildir |
| Human label                 | Gerekirse uzman/rater label'ı ve anonim rater kodu                          |
| Route decision              | Sadece gözlemsel karar; pilot sırasında production assignment yok           |

Secret, connection URL, öğrenci adı, gerçek tenant kimliği veya serbest metin kişisel veri bu pakete alınmamalıdır.

## 3. Dimension bazında asgari gerçek kanıt

### P1-B — Akıcılık ve Anlam

| Boyut                | Gerekli veri                                                                         | Bu placement bankasının durumu        |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| FLUENCY              | Kontrollü bağlı okuma koşulu, gözlenen hız/doğruluk ve gerekirse prosodi/akış ölçümü | Mevcut 36 cevap maddesi yeterli değil |
| ACCURACY             | Okuma sırasında doğru işleme veya ayrı doğruluk görevi                               | Soru cevabı doğruluğuna indirgenemez  |
| MEANING_PRESERVATION | Koşul/tempo değişiminde anlamı koruyan eşleştirilmiş görev                           | Mevcut bankada yok                    |
| TRANSFER             | Yeni metin/bağlam veya gecikmeli transfer görevi                                     | Mevcut bankada yok                    |

B ancak dört boyutun her biri ayrı görev, server scoring ve uzman kararıyla izlenebildiğinde değerlendirilebilir.

### P1-C — Çıkarım ve Kanıt

| Boyut             | Gerekli veri                                                   | Mevcut durum                                                  |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| INFERENCE         | Passage kanıtından desteklenen sonucu seçme/kurma              | Teknik aday mapping var; calibration yok                      |
| EVIDENCE_FINDING  | Sonucu destekleyen ifade/parçayı bulma                         | Bazı detail/evidence maddeleri aday; uzman ayrımı gerekli     |
| EVIDENCE_RELATION | Bulunan kanıtın seçilen sonucu neden desteklediğini ayrı kurma | Aynı inference cevabından türetilemez; bağımsız kanıt gerekli |

C için mapping bulunması route'un akademik olarak kalibre edildiği anlamına gelmez.

### P1-D — Kelime, Bağlam ve Alan Bilgisi

| Boyut              | Gerekli veri                                       | Mevcut durum                             |
| ------------------ | -------------------------------------------------- | ---------------------------------------- |
| CONTEXTUAL_MEANING | Sözcük/ifadenin passage içi anlamını çıkarma       | Mevcut bankada özel güvenilir görev yok  |
| LEXICAL_RELATION   | Sözcük/ifade yapı veya anlam ilişkisini ayırt etme | Ayrı trusted mapping ve scorer yok       |
| DOMAIN_CONTEXT     | Alan bağlamındaki bilgiyi yeni örneğe uygulama     | Genel kelime sorusu bunun yerine geçemez |

D için her boyut ayrı ölçülmeden otomatik seçim açılmaz.

## 4. Analiz planı

Kalibrasyon incelemesi aşağıdaki çıktıları üretmelidir:

1. Item güçlüğü ve cevap dağılımı, question type ve passage sırası etkisinden ayrıştırılmış olarak.
2. Çeldirici seçilme örüntüsü ve ikinci savunulabilir cevap kontrolü.
3. Missing/ambiguous/invalid response oranı ve bunların route kararına etkisi.
4. Her skill ve dimension için coverage ve item overlap.
5. Soru türü, metin uzunluğu, kelime yükü, yaş/grade ve domain ön bilgisi confound analizi.
6. C EVIDENCE_RELATION için inference'tan bağımsız görev veya kanıt.
7. B transfer/meaning preservation ve D domain context için doğrudan veri.
8. Version değişiminde eski sonuçların korunması ve yeni sonuçların yeniden üretilebilirliği.
9. Classification stability, ölçüm belirsizliği ve REVIEW_REQUIRED sınırlarının uzman gerekçesi.
10. Uzmanlar arası anlaşmazlıkların ayrı çözüm kaydı.

Bu analiz planı otomatik olarak bir threshold seçmez. Her kabul kuralı uzman ve veri sorumlusu tarafından hedef yaş/dil bağlamı ile gerekçelendirilmelidir.

## 5. Kalibrasyon karar şablonu

| Alan                                             | Doldurulacak kanıt |
| ------------------------------------------------ | ------------------ |
| Calibration decision ID                          |                    |
| Item bank / assessment / template version        |                    |
| Mapping / measurement / scoring contract version |                    |
| Uzman inceleme sonucu                            |                    |
| Pilot veri sürümü                                |                    |
| Her dimension için coverage kararı               |                    |
| Eksik/çelişkili evidence policy                  |                    |
| Threshold ve gerekçesi                           |                    |
| Classification stability ve belirsizlik          |                    |
| Rollback kararı                                  |                    |
| Product/release onayı                            |                    |

Bu alanlar boşken sonuç NOT_CALIBRATED ve productionAssignmentEnabled=false kalır.
