# OKU+ — Review & Spaced Repetition Foundation

## 1. Amaç ve sınır

Bu belge, 8G-7 için güvenli ve açıklanabilir bir review foundation tanımlar. Amaç, öğrencinin daha önce yaptığı kişisel çalışmadan sonra uygun bir zamanda farklı ve yayınlanmış bir çalışma önerebilmektir.

Bu aşamada SM-2, FSRS, Leitner, mastery score, adaptive difficulty, AI grading veya yeni bir puanlama kuralı yoktur. Uygulama yalnızca deterministik eligibility, basit önceliklendirme ve mevcut `ExerciseSession` akışına entegrasyon sağlar.

## 2. Review tanımı

Review, tamamlanmış kişisel bir çalışmadan yeterli zaman geçtikten sonra aynı beceriyi farklı yayınlanmış içerik/soru bileşimiyle yeniden çalışmaktır. Review, bir öğrenme geçmişine dayanır ve yeni bir `Attempt`/`ExerciseSession` üretir.

Yanlış cevap tek başına “hemen review” anlamına gelmez. Zaman eşiği, tamamlanmış oturum, yayınlanabilir kaynak ve içerik çeşitliliği birlikte gerekir.

## 3. Retry ve review ayrımı

Retry, aynı oturum içindeki başarısız soruya veya gönderim hatasına yeniden cevap vermektir. Review ise önceki oturum bittikten ve bekleme kapısı geçildikten sonra yeni bir kişisel practice session başlatır. Mevcut soru kartı içi retry davranışı review kuyruğuna yazılmaz.

## 4. Review birimi

Pedagojik mantıksal birim `Skill + source composition` olarak seçildi. Eligibility beceri seviyesinde hesaplanır; öğrenciye sunulan kaynak ise aynı beceriye bağlı yayınlanmış `ExerciseTemplateVersion` ve onun `ContentVersion`/`QuestionVersion` bileşimidir.

Bu seçim, yalnızca tek soruya göre daha anlamlı bir beceri sinyali verir, aynı zamanda içerik çeşitliliğini kontrol eder. `ExerciseSession` review item değildir; yalnızca seçilen review çalışmasının yürütme kaydıdır.

## 5. Eligibility politikası

Bir beceri aşağıdaki koşullarda review adayıdır:

1. Öğrencinin tenant’ında tamamlanmış, kişisel (`INDIVIDUAL`) ve assignment/assessment bağlantısı olmayan bir oturum vardır.
2. Bu oturumlarda en az bir soru denemesi vardır.
3. Son kişisel deneme zamanı `now - 24 saat` eşiğinden eski veya eşittir.
4. Aynı beceri için mevcut, silinmemiş, yayınlanmış content/question/template kaynağı vardır.
5. Son kaynakla aynı content/question fingerprint’ine sahip olmayan başka bir yayınlanmış template version vardır.
6. Seçilecek template version için devam eden bir session yoktur.

Son kişisel denemelerden accuracy hesaplanır: puanlanmış denemelerde doğru sayısı / puanlanmış deneme sayısı. Açık uçlu ve henüz puanlanmamış cevaplar accuracy’ye dahil edilmez; fakat attempted sayılır.

## 6. Priority

Kuyruk şu deterministik sırayla düzenlenir:

1. Accuracy `< 0.80` olanlar (`HIGH`).
2. Daha düşük accuracy.
3. Daha eski `lastAttemptAt`.
4. Türkçe locale ile beceri adı.

Mevcut modelde “skill importance” veya mastery güvenilir olmadığı için öncelik hesabına eklenmedi. Büyük bir review score formülü üretilmedi.

## 7. Interval politikası

24 saat yalnızca `FOUNDATION PROVISIONAL POLICY`dir. Pedagojik olarak doğrulanmış bir unutma eğrisi veya spaced repetition algoritması değildir. Kodda sabit cooldown eligibility kapısı olarak tutulur; `interval`, `dueAt`, `stability`, `difficulty` veya `repetition` state’i persist edilmez.

Gelecekte bu kapı, ölçüm ve deney sonuçlarıyla ReviewSchedule/FSRS benzeri bir policy’ye dönüştürülebilir.

## 8. Veri kaynakları ve güvenilirlik

Review seçimi için:

- `ExerciseSession`: tamamlanma, kişisel/assignment/assessment ayrımı ve son kaynak.
- `Attempt`: kişisel review için context-safe attempted, scored, correct ve `answeredAt` gerçekleri.
- `Question.skillId` / template `skillId`: beceri hizalaması.
- `ContentVersion`, `QuestionVersion`, `ExerciseTemplateVersion`: yayınlanabilir ve değişmez kaynak.
- `StudentProgress`: mevcut haftalık hesaplanmış read model ve gelecek raporlama için temel.

`StudentProgress` mevcut şemada session context’ini ayırmadığından kişisel review kararının tek kaynağı yapılmadı. Kişisel/kurumsal karışmayı önlemek için uygulama ham `Attempt` kayıtlarını yalnızca kişisel completed session’lar içinden toplar. `masteryScore` nullable bir alandır; bu aşamada hesaplanmış mastery gibi kullanılmaz. `QuestionVersion.difficulty` ve attempt calibration alanları review algoritması için henüz yeterli kanıt değildir.

## 9. Review kaynağı ve içerik kıtlığı

Review, son kullanılan kaynakla farklı content/question fingerprint’i olan yayınlanmış bir template version arar. Pilot hacmi tek bir setle sınırlıysa sistem fake variation üretmez ve `available: false` ile `blocked.insufficientVariation` döner. Böylece aynı beş soru sonsuz review gibi gösterilmez.

Draft, archived, deleted veya root kaydı silinmiş kaynaklar candidate sorgusuna alınmaz. Start endpoint’i ayrıca mevcut session validation’ını çalıştırır.

## 10. Student flow

Öğrenci dashboard’a geldiğinde `/student/today` içindeki review projection değerlendirilir. Eligible item varsa `Tekrara başla` kartı görünür. CTA `/student/review/start` çağırır, dönen session mevcut exercise ekranında açılır. Öğrenci soruları çözer; attempt ve completion mevcut endpoint’lerden devam eder.

Review completion için yeni bir completion yolu yoktur. `POST /student/sessions/:id/complete` ve mevcut attempt akışı kullanılır.

## 11. Student Today ve nextAction

`TodayResponse` içine ayrı bir `review` alanı eklendi. Review kartı `nextAction` değerinin yerine geçmez. Öncelik sırası mevcut haliyle korunur:

`active session → assignment → assessment → normal personal exercise → no content`

Bu nedenle yarım kalmış bir assignment/assessment/personal session varken review CTA’sı ana next action’ı override etmez. Review kartı ayrı ve ikincil bir action’dır.

## 12. Learning Path

8F learning path’in `SKILL`/`TEMPLATE` graph’ı yeniden yazılmadı. Review, path node’u yerine Student Today altında ayrı card olarak gösterilir. Path’in mevcut “yeni öğrenme” sıralaması ile review sıralaması birbirine karıştırılmaz.

## 13. Personal ve organization context

Review endpoint’i request’te doğrulanmış tenant context’i kullanır ve yalnızca `studentId + tenantId` kapsamını okur. Global published template’ler personal tenant tarafından kullanılabilir; organization template’i yalnızca kendi tenant’ında görünür.

Kişisel review kaynağı için `ExerciseSession.context = INDIVIDUAL`, `assignmentId = null` ve `assessmentId = null` zorunludur. Assignment remediation veya assessment sonucu personal review session’a dönüştürülmez. Bu aşamada assignment/assessment remediation ayrı ürün kavramlarıdır.

## 14. Review session ve exercise integration

Yeni `ReviewSession` modeli veya yeni enum eklenmedi. Review start, mevcut `ExerciseSession` modelinde:

- `context = INDIVIDUAL`
- `sessionType = PRACTICE`
- `assignmentId = null`
- `assessmentId = null`

ile kayıt oluşturur. API response’unda `mode = REVIEW` bulunur; bu response semantiğidir, kalıcı bir review state’i değildir. `clientSessionId`, mevcut offline idempotency sözleşmesiyle uyumludur.

Session creation mevcut yayın, tenant, öğrenci ownership ve child-version kontrollerini tekrar kullanır. Soru endpoint’i correct answer göndermeye devam etmez.

## 15. Progress, gamification ve streak

Review attempt’leri mevcut `Attempt` tablosuna, completion mevcut `ExerciseSession` akışına gider. Var olan aggregation review sorularını ilgili `Question.skillId` üzerinden `StudentProgress` read modeline dahil eder.

Yeni review point type veya yeni streak algoritması eklenmedi. Mevcut `EXERCISE_COMPLETED`, `CORRECT_ANSWER` ve streak davranışı kullanılır. Review için özel XP çarpanı yoktur.

## 16. Assessment ve assignment

Assessment review değildir; assessment session `ASSESSMENT` olarak kalır. Assignment completion da personal review session değildir. Mevcut sistem bu akışları birbirinden ayırır; review eligibility yalnızca kişisel practice session history’sini kaynak kabul eder.

## 17. Version safety

Review candidate yalnızca yayınlanmış `ContentVersion`, `QuestionVersion` ve `ExerciseTemplateVersion` bileşiminden seçilir. Published version’lar immutable olduğu için review başlarken görülen prompt/body, session history’sindeki source ile uyumludur.

Yeni bir version yayınlandığında eski completed session silinmez. Eski fingerprint artık candidate değilse, yeni published version farklı bir fingerprint oluşturduğu takdirde sonraki review kaynağı olabilir.

## 18. Deleted/archived content

Root content/template/question archived veya deleted ise candidate query dışına çıkar. Eski session ve attempt history’si silinmez; yalnızca yeni review başlatma engellenir. Böylece retention history korunurken öğrenciye kullanılamayan kaynak gösterilmez.

## 19. API sözleşmesi

Minimum public student surface:

```text
GET  /student/today
GET  /student/review
POST /student/review/start
```

`GET /student/review` örneği:

```json
{
  "mode": "FOUNDATION",
  "available": true,
  "cooldownHours": 24,
  "items": [
    {
      "skillId": "…",
      "skillName": "…",
      "skillCode": "…",
      "templateVersionId": "…",
      "templateTitle": "…",
      "templateVersion": 1,
      "lastAttemptAt": "…",
      "accuracy": 0,
      "priority": "HIGH",
      "reason": "LOW_ACCURACY"
    }
  ],
  "blocked": {
    "cooldown": 0,
    "activeSession": 0,
    "insufficientVariation": 0,
    "noPublishedSource": 0
  }
}
```

`POST /student/review/start` yalnızca o an authenticated öğrenciye ait güncel queue item’ını kabul eder. Gövdedeki `skillId`/`templateVersionId` eşleşmiyorsa 400 döner; istemciye arbitrary template başlatma yetkisi verilmez.

## 20. Frontend, mobile ve accessibility

Review card, mevcut card/blue CTA/soft blue accent dilini korur. Eligible review yoksa card gizlenir. Alternatif kaynak yokluğu varsa öğrenciye “aynı soru setini tekrar tekrar göstermiyoruz” açıklaması verilir.

390×844 görünümde CTA minimum 48px yüksekliğindedir, kart dar ekranda dikeyleşir ve mevcut bottom navigation ile çakışmaz. Card başlığı semantic heading, durum metni `aria-live`, action gerçek button’dır. Review seçiminde reduced-motion gerektiren yeni animasyon yoktur.

## 21. Analytics ve offline

Bu aşamada telemetry modeli eklenmedi. Gelecekte `review_eligible`, `review_started`, `review_completed` ve `review_skipped` event’leri; source version, policy version, context ve tenant scope ile ölçülebilir.

Review selection server source of truth’tur. `clientSessionId` mevcut idempotency alanını kullanır. Offline queue/sync bu aşamanın dışında bırakıldı; istemci review eligibility’yi kendi başına üretmez.

## 22. Security

Backend her review query’sini authenticated `userId + tenantId` ile sınırlar. Başka kullanıcının review history’si ve başka tenant’ın review kaynağı görünmez. Start endpoint’i queue tekrar hesapladığı için yalnızca UI’da gizlemekle yetinmez.

Tenant ayrımı auth context’ten gelir; istemcinin gönderdiği arbitrary tenant ID yetki sağlamaz. Kaynak template global veya aktif tenant’a ait olmalıdır; başka organization kaynağı kabul edilmez.

## 23. Data model kararı

Karar: mevcut `ExerciseSession + Attempt + StudentProgress + immutable version` stack’i foundation için yeterli; yeni `ReviewSchedule` henüz gerekli değil.

Bu kararın önemli nüansı şudur: `StudentProgress` tek başına context-safe değildir. Bu nedenle mevcut read model, ham kişisel attempt/session gerçekleriyle birlikte kullanılır. Persisted `dueAt`/`interval`/`state` gerekmediği için migration, index ve backfill yükü doğuracak yeni model eklenmedi.

`ReviewSchedule` ancak per-item due state, skip/snooze, algorithm versioning, idempotent rescheduling, offline reconciliation veya analytics retention ihtiyacı kanıtlandığında gündeme alınmalıdır.

## 24. Test stratejisi

Saf policy yardımcıları için unit testler cooldown boundary’sini, priority ordering’i ve input mutation olmamasını kontrol eder. Browser E2E fixture’ı her çalışmada unique prefix kullanır ve şunları doğrular:

- düşük accuracy + eski personal attempt review queue’ya girer;
- farklı published source seçilir;
- cross-user ve cross-tenant istekleri ayrılır;
- mobile Today card gerçek UI’da görünür;
- review start mevcut ExerciseSession üretir;
- active session `nextAction` önceliğini korur;
- candidate archived olduğunda shortage gösterilir;
- cooldown sonrası queue kapanır;
- tüm fixture kayıtları cleanup ile sıfırlanır.

Gerçek bekleme yapılmaz; kontrollü `answeredAt` timestamp kullanılır. Demo/test tenant ve content kayıtlarına dokunulmaz, TRUNCATE kullanılmaz.

## 25. Gelecek mastery katmanı

Review, mastery değildir. Mastery ileride skill/topic/unit seviyesinde ayrı outcome rubric’i, minimum evidence, zaman aralığı, açıklanabilir karar ve version-aware aggregation ile tasarlanmalıdır. Nullable `masteryScore` bugün bu kararı temsil etmez.

## 26. Gelecek adaptive learning katmanı

Review priority ile adaptive difficulty farklıdır. Bu aşamadaki HIGH/STANDARD yalnızca queue sırasıdır; yeni sorunun zorluğunu değiştirmez ve sonraki içeriği otomatik seçmez. Adaptive engine için learner state, item difficulty, exposure, objective ve safety guard’ları ayrıca tanımlanmalıdır.

## 27. Gelecek algorithm upgrade

SM-2, FSRS veya Leitner adaylarıdır; 8G-7’de seçilmemiştir. İleride karşılaştırma için en az şu veriler gerekir: item/source version, attempt outcome, response time, session context, answer confidence, review start/complete/skip, interval, policy version, content change ve retention outcome. Önce ölçüm sözleşmesi ve offline/idempotency kararı, sonra algoritma seçimi yapılmalıdır.

## 28. Uygulama çıktıları

- `src/modules/student-learning/review-service.ts`: deterministic queue, priority, source variation ve secure start.
- `src/modules/student-learning/routes.ts`: `GET /student/review` ve `POST /student/review/start`.
- `src/modules/student-learning/service.ts`: Today response içine review projection.
- `public/index.html`, `public/app.js`, `public/styles.css`: Student Today review card ve mobile CTA.
- `scripts/browser-review-spaced-repetition-test.ts`: unique fixture browser E2E.
- `test/review.test.ts`: pure foundation policy unit tests.

Bu foundation, review/mastery/adaptive katmanlarını birbirine karıştırmadan sonraki curriculum ve editorial çalışmalarına açık bir seam bırakır.
