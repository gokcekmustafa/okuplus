# OKU+ — CONTROLLED CONTENT PILOT

## Pilot status

**PILOT CONTENT / PRODUCTION CANDIDATE**

Bu dosya editorial kayıt ve QA referansıdır. Çalışma sırasında içerik gerçek authoring API üzerinden PostgreSQL'e yazılmış, yayın akışından geçirilmiş, gerçek öğrenci oturumunda kullanılmış ve final cleanup ile silinmiştir. Production source of truth schema/DB'dir; bu Markdown dosyası içerik deposu değildir.

## Editorial brief

- Yaş / seviye: 13–17 yaş; ortaokul-lise geçişine uygun.
- Dil: Türkçe.
- Alan: Bilim > İklim ve şehir.
- Primary skill: mevcut `EXUX_1788014963184` kodlu `Ex UX` becerisi; kategori `COMPREHENSION`.
- Learning objective: Öğrenci, kentsel yüzeylerin ısınması ile gölge, bitki ve su döngüsünün serinletici etkisini metne dayalı olarak açıklar; ana fikir, ayrıntı, çıkarım ve temel kavramları ayırt eder.
- Content difficulty: `0.56`.
- Metin uzunluğu: servis tarafından hesaplanan `218` kelime; 8G-3 `Kısa` bandı olan 180–300 kelimeyi karşılar.
- Ton / güvenlik: merak uyandıran, tarafsız, siyasi/dini propaganda, şiddet, cinsel içerik, kendine zarar veya tehlikeli talimat içermez.

## Reading passage

### Şehrin Görünmeyen Serinlik Haritası

Bir yaz günü aynı şehirde iki sokağı düşünün. Biri koyu asfaltla kaplı, binalar birbirine yakın ve neredeyse hiç gölge yok. Diğerinde ağaçlar, küçük bahçeler ve açık renkli yüzeyler bulunuyor. Termometreler aynı havayı ölçse de bu iki sokağın hissettirdiği sıcaklık birbirinden farklı olabilir. Bu farkı anlamak için bilim insanları, şehirlerin serinlik haritasını çıkarmaya çalışıyor.

Kentlerde asfalt, beton ve çatılar güneşten gelen enerjinin önemli bir bölümünü emer. Bu yüzeyler ısındıkça çevrelerine ısı verir; böylece şehir merkezleri, yakınındaki daha yeşil alanlardan daha sıcak hâle gelebilir. Bu olaya kentsel ısı adası etkisi denir. Etki yalnızca gündüz görülmez; gün boyunca depolanan ısı akşam saatlerinde de yavaşça açığa çıkabilir.

Ağaçlar bu haritanın önemli işaretleridir. Geniş yapraklı bir ağaç önce doğrudan gölge sağlar. Ayrıca kökleriyle aldığı suyun bir bölümünü yapraklarından atmosfere bırakır. Evapotranspirasyon adı verilen bu süreç, çevrenin serinlemesine katkıda bulunur. Çim, çalı ve başka bitkiler de benzer yollarla yüzey sıcaklığını azaltabilir.

Uydu görüntüleri, araştırmacıların hangi bölgelerin daha fazla ısındığını görmesine yardım eder. Fakat harita tek başına çözüm değildir. Bir okul bahçesine ağaç dikilecekse suya erişim, yerel iklim, güvenli yürüme alanı ve bitkinin köklerinin ihtiyaçları birlikte düşünülmelidir. En iyi plan, ölçüm verisini yerel bilgiyi dinlemekle birleştirir.

Sonuç olarak serin bir şehir yalnızca daha çok beton döşemekle kurulmaz. Gölgeyi, su döngüsünü ve yeşil alanları birlikte düşünen tasarım kararları, insanların aynı kenti daha rahat deneyimlemesine yardımcı olabilir.

## Question blueprint

| Position | Type            | Objective                                              | Difficulty | Correct answer / scoring note                                                                |
| -------- | --------------- | ------------------------------------------------------ | ---------: | -------------------------------------------------------------------------------------------- |
| 0        | MULTIPLE_CHOICE | Metnin ana fikrini belirlemek                          |       0.48 | `b`: Isı, gölge ve yeşil alanları birlikte düşünmek                                          |
| 1        | TRUE_FALSE      | Metindeki açık bir ayrıntıyı bulmak                    |       0.36 | `true`: Günlük depolanan ısı akşam da açığa çıkabilir                                        |
| 2        | OPEN_ENDED      | Neden-sonuç ilişkisini kısa ve kanıta dayalı açıklamak |       0.68 | Gölge + bitkilerin su bırakmasının serinletici etkisi; otomatik skor yok                     |
| 3        | MATCHING        | Kavramları metindeki açıklamalarıyla eşleştirmek       |       0.59 | Kentsel ısı adası ↔ sıcak şehir merkezi; evapotranspirasyon ↔ suyun yapraklardan bırakılması |
| 4        | FILL_BLANK      | Temel bir terimi metinden doğru biçimde hatırlamak     |       0.41 | `kentsel ısı adası` veya kontrollü `kentsel ısı adası etkisi`                                |

Her soru aynı primary skill'e bağlandı ve her QuestionVersion için `hint` ile öğrenciye gösterilen kısa `explanation` kaydedildi. Çoktan seçmeli soruda tek doğru seçenek ve üç makul çeldirici vardır; doğru seçenek konumu `b` olarak dengelenmiştir. Açık uçlu soruda rubric iki ölçütlüdür ve `isCorrect = null` beklenen normal davranıştır.

## Type-specific editorial notes

- **MULTIPLE_CHOICE:** Tek doğru cevap; seçenekler doğrudan metinle çelişen veya kapsamı aşırı daraltan ifadeler yerine metne yakın görünen, fakat yanlış olan çeldiricilerden seçildi.
- **TRUE_FALSE:** Tek anlamlı, olumlu cümle; double negative yok; ikinci paragraftaki açık bilgiye dayanıyor.
- **OPEN_ENDED:** Kısa, açık ve rubric ile değerlendirilebilir. Öğrenci iki serinletici mekanizmayı kendi cümlesiyle kurmalı.
- **MATCHING:** İki kavram ve iki açıklama arasında anlamlı birebir eşleme; kısmi kredi alanı schema'nın desteklediği biçimde kullanıldı.
- **FILL_BLANK:** Metindeki terim kontrollü kabul listesiyle değerlendiriliyor; eş anlamlı belirsizliği özellikle açılmadı.

## Factual basis and provenance

Metin özgün Türkçe anlatımdır; kaynaklardan kopyalanmamıştır. Isı adası, bitkilerin gölge ve evapotranspirasyon katkısı ile şehir ısısının yeşil alanlarla ilişkisi için editorial doğrulama NASA Science ve U.S. EPA'nın kentsel ısı kaynaklarıyla karşılaştırıldı:

- [NASA Science — Ecosystem vegetation can affect the intensity of the urban heat island effect](https://science.nasa.gov/missions/landsat/ecosystem-vegetation-affect-intensity-of-urban-heat-island-effect/)
- [NASA Earth Observatory — Vegetation limits city warming effects](https://science.nasa.gov/earth/earth-observatory/vegetation-limits-city-warming-effects-86440/)
- [U.S. EPA — Benefits of Trees and Vegetation](https://www.epa.gov/heatislands/benefits-trees-and-vegetation)

`license` alanı: `Original OKU+ pilot; NASA/EPA factual basis.`

`changelog` alanı: pilotun özgün editorial üretim olduğunu ve source review'ın bu dosyada kayıtlı olduğunu belirtir.

## Runtime mapping

Pilot sırasında bir geçici Level oluşturuldu; mevcut global COMPREHENSION becerisi kullanıldı; Topic için kalıcı model eklenmedi. `Bilim > İklim ve şehir` eşlemesi ExerciseTemplate config içinde geçici editorial metadata olarak tutuldu. İçerik ve template global scope'ta yayınlandı; öğrenciye personal tenant'a duplicate edilmedi.

## QA outcome

- Content: yaşa uygun, doğal Türkçe, özgün, 218 kelime, tek skill ile hizalı, okunabilir ve soru üretimine elverişli.
- Questions: 5/5 objective, skill, answer, difficulty, explanation, hint, age, bias, accessibility ve text evidence kontrollerinden geçti.
- Student UI: reading card, hint ve cevap sonrası explanation görünür; 390×844 ve 1280×800 ekranlarında yatay taşma yok.
- Pilot evidence: 5 gerçek Attempt, StudentProgress `5` attempt / `4` correct, `accuracy=1`, XP en az `110`, streak `1`, `FIRST_EXERCISE` badge.
- Final state: pilot kayıtları cleanup ile kaldırıldı; bu nedenle bu dosya kayıt defteridir, canlı içerik kaydı değildir.

## 8G-6 hint / explanation quality update

8G-6 kapsamında bu pilot pattern'i üç soruluk ayrı bir gerçek UI/DB koşusunda yeniden doğrulandı:

- İpucu cevap öncesinde secondary CTA olarak açılıyor; cevabı veya doğru seçeneği sızdırmıyor.
- Açıklama doğru cevap, yanlış cevap ve `OPEN_ENDED` pending feedback akışlarında `Kısa açıklamayı göster` disclosure'ı olarak açılıp kapanıyor.
- Disclosure state `aria-expanded` / `aria-controls` ile senkron; klavye Enter ve fare ile aç/kapa çalışıyor.
- Öğrenci question response `correctAnswer` ve attempt `answer` alanlarını taşımıyor.
- `OPEN_ENDED` için `Değerlendirme bekleniyor` korunuyor; yeni scoring veya AI grading eklenmedi.

## Editorial metadata availability matrix

| Feature              | DB                                    | API                         | UI                               | Eksik / karar                          |
| -------------------- | ------------------------------------- | --------------------------- | -------------------------------- | -------------------------------------- |
| hint                 | QuestionVersion                       | authoring + student session | student disclosure + admin form  | hintUsed analytics yok                 |
| explanation          | QuestionVersion                       | authoring + student session | feedback disclosure + admin form | ayrı QA/review kaydı yok               |
| difficulty           | Content / QuestionVersion             | var                         | admin görünür                    | linguistic/conceptual alt alanları yok |
| skill                | Skill, ContentSkill, Question.skillId | var                         | path/admin                       | Level/Topic relation yok               |
| learning objective   | template config / editorial doc       | JSON config                 | dedicated field yok              | first-class field planned              |
| cognitive demand     | yok                                   | yok                         | yok                              | planned                                |
| provenance / license | license + changelog sınırlı           | content authoring           | kısmi admin                      | question provenance/review yok         |
| author               | createdById                           | var                         | admin detay                      | —                                      |
| review status        | version status                        | review/publish endpoints    | status görünümü                  | reviewer actor/decision yok            |
| reviewed by / at     | yok                                   | yok                         | yok                              | ReviewRecord planned                   |
| readability          | readabilityScore nullable             | alan mevcut                 | kısmi                            | hesaplama ve method yok                |
| age / grade band     | Level.gradeBand                       | onboarding/level API        | level UI                         | ContentVersion'a bağlı değil           |
| topic                | yok; pilot config'te geçici           | template config             | dedicated UI yok                 | Topic/Unit planned                     |
| content type         | Content.type                          | var                         | admin/student context            | —                                      |
