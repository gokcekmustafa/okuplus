# Education V2 P0 production release runbook

Bu runbook yalnızca `production-migration` GitHub Environment'ı üzerinden, manuel
ve açık onaylı bir release için kullanılır. Production bağlantı değerleri bu
belgede veya loglarda yer almaz.

## Ön koşullar

- Release PR'ı `master` üzerinde merge edilmiş olmalı.
- `production-migration` Environment'ında `PRODUCTION_DATABASE_URL` secret'ı
  bulunmalı.
- Aşağıdaki protected variables production hedefiyle önceden doğrulanmış olmalı:
  `PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT`, `PRODUCTION_DATABASE_NAME`,
  `PRODUCTION_DATABASE_HOST`,
  `EDUCATION_V2_COMMON_REINFORCEMENT_TEMPLATE_VERSION_ID` ve
  `EDUCATION_V2_COMMON_ASSESSMENT_ID`.
- `PRODUCTION_DB_APPROVED_HISTORICAL_MIGRATION_CHECKSUMS` mevcut migration
  forensics kapısının gerektirdiği şekilde korunmalı.
- `education_v2_production_release_id`, editoryal olarak onaylanmış immutable
  release kimliği olmalı; bir URL, parola veya bağlantı dizesi olmamalı.
- Production Level.code, workflow input'u ile mevcut production kaydı olarak
  ayrıca doğrulanmalı. Seed bu kaydı oluşturmaz.

## Uygulama sırası

1. Workflow'u `master` üzerinden `confirm_migrate=MIGRATE` ile başlat.
2. Aynı çalıştırmada `production_backup_confirmation=I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK` ver; bu değer backup/rollback planının dışarıda kontrol edildiğini ifade eder.
3. Yalnızca P0 yayınlanacaksa `seed_p0=education-v2-p0` seç; migration-only
   çalıştırmalarında `seed_p0=none` kullan.
4. Workflow önce production fingerprint, kimlik, migration history ve Prisma
   schema kapılarını geçer.
5. Prisma migration deploy tamamlandıktan sonra P0 content graph, akademik
   lesson graph ve persistent learning path sırasıyla dry-run/apply edilir.
6. Son postcondition adımı üç seed/provisioner komutunu dry-run ile yeniden
   çalıştırır. Mevcut tam stable graph güvenli `NOOP`; kısmi graph production'da
   fail-closed durumudur.

Her apply adımı production database adı, host, approved fingerprint ve ayrı
`I_HAVE_REVIEWED_EDUCATION_V2_P0_PRODUCTION_EDITORIAL_RELEASE` onayını kontrol
eder. Staging bağlantısı production akışında kullanılamaz.

## Geri dönüş

Migration deploy sonrası otomatik rollback yapılmaz. Uygulama veya seed kapısı
başarısız olursa workflow durur; mevcut veriler silinmez. Geri dönüş kararı,
production backup/restore prosedürü ve migration'ın ileri yönlü uyumluluğu
incelenmeden verilmemelidir. Uygulama kodu için önceki deploy'a dönülebilir;
şema/content kayıtları için ayrı bir onaylı recovery planı gerekir.
