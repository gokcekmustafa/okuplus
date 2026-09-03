# OKU+ — 8I-1 Production Deployment Runbook

**Durum:** Contract/runbook hazır; production promotion yapılmaz.  
**Hedef:** Verified artifact + verified environment + backup/restore evidence ile kontrollü deploy.  
**Deployment target:** Bu repository’de tanımlı değil; provider seçilmeden platform komutu uydurulmaz.

## 0. Promotion ön koşulları

Aşağıdakiler yazılı kanıt olmadan production’a geçilmez:

- Deployment provider, service name, public URL ve release SHA.
- Production DB’nin secret manager’dan gelen connection binding’i ve bağımsız DB identity doğrulaması.
- Staging’de aynı artifact ile smoke/health/migration kanıtı.
- Production backup ve en az bir restore verification kaydı.
- Secret manager binding, rotation owner’ı ve deploy/runtime erişim listesi.
- HTTPS, CORS allowlist, rate limit, security headers, health monitoring ve alert route’u.
- iyzico production merchant activation, production credentials, plan references, callback/webhook,
  signature secret, cancel/refund test planı.
- 8G-9B production-grade Level/Skill/catalog ve relation release kanıtı.

## 1. Backup

1. Change ticket/release kaydında release SHA, migration listesi ve beklenen fingerprint tutulur.
2. Production DB için provider-native consistent backup/snapshot alınır; backup ID, timestamp,
   retention ve owner kaydedilir.
3. Backup’ın yalnızca alındığı değil, restore edilebilir olduğu staging/isolated restore DB’de
   kanıtlanır. Restore sonucu `database/schema/migration` identity ve uygulama smoke ile doğrulanır.
4. Backup/restore kanıtı yoksa deploy **STOP**. Uygulama rollback’i DB rollback’i yerine geçmez.

## 2. Deploy

Deployment target repository’de bilinmediği için bu adım provider-neutral’dır:

1. CI veya release runner’da `npm ci` ile lockfile’a bağlı artifact üret.
2. `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` ve test gate’lerini
   tamamla.
3. Runtime Node.js `>=20` ve `public/` statik asset’lerinin artifact’te bulunduğunu doğrula.
4. Secret manager’dan yalnız hedef environment binding’lerini enjekte et. `.env` dosyası, secret
   değeri veya full `DATABASE_URL` artifact’e/log’a girmez.
5. Önce staging’de deploy et; production release aynı artifact digest/SHA ile hazırlanır.
6. Current application `src/server.ts` migration çalıştırmaz. Migration release adımı tamamlanmadan
   yeni app instance’larını trafik almaya açma.

## 3. Migration

Prisma production stratejisi **forward-only, versioned, explicit**’tir:

```powershell
npx prisma validate
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
npm run db:fingerprint
```

Kurallar:

- `migrate dev`, `migrate reset`, `db push` production’da yasaktır.
- Her migration önce disposable/restore staging DB’de denenir; lockfile ve migration SQL review edilir.
- Schema değişiklikleri expand → backfill/dual-read → contract sırasıyla backward-compatible yapılır.
- Destructive change aynı release içinde uygulanmaz; ayrı onay ve backup gerektirir.
- Migration başarısız olursa trafik açılmaz, `_prisma_migrations` durumu ve DB log’u saklanır;
  failed migration elle silinmez. Onaylı forward fix veya restore planı kullanılır.
- Prisma migration’ları ile `prisma/manual/` içeriği migration SQL’ine gömülmüş sırasıyla birlikte
  review edilir. Manual SQL ayrı ve izsiz bir production komutu olarak çalıştırılmaz.

## 4. Health/readiness

Mevcut endpoint semantiği:

- `GET /health`: process liveness; `{ status: "ok" }`, DB kontrolü yapmaz.
- `GET /health/db`: `SELECT 1`; DB erişilemiyorsa HTTP 503 döner.
- `GET /ready`: app started + DB reachable + `_prisma_migrations` içinde tamamlanmamış/geri alınmış
  migration bulunmaması koşullarını kontrol eder; başarılı durumda 200, bağımlılık veya migration
  sorunu varsa secret sızdırmadan 503 döner. Endpoint local/test üzerinde implement edilmiş ve
  doğrulanmıştır. Production ingress bağlantısı ve platform probe konfigürasyonu deployment target
  bilinmediği için **UNKNOWN** kalır.

Production trafiği `/health` tek başına 200 verdi diye açılmaz. En azından `/health/db`, migration
status/fingerprint ve deploy config aynı release kaydında PASS olmalıdır. Health response’ları URL,
DB name, version, secret veya kullanıcı verisi döndürmez.

## 5. Smoke

Staging ve production smoke yalnızca onaylı sentetik test hesabı/tenant ile çalışır:

1. `GET /health` → 200.
2. `GET /health/db` → 200 ve beklenen DB identity release kaydıyla eşleşir.
3. Login → `/auth/me` → refresh rotation → logout; bearer token scope ve tenant context doğrula.
4. Personal account isolation: organization context billing’e 403; başka kullanıcının payment/subscription
   kaynağına erişim 403/404.
5. Learning read path ve bir non-destructive progress read doğrula.
6. Billing production’da gerçek checkout başlatma; iyzico için yalnızca provider onaylı sandbox/staging
   contract testi. Gerçek charge/refund/cancel, açık approval olmadan çalıştırılmaz.
7. Production catalog write/promote çalıştırılmaz; 8G-9B release evidence ayrı gate’tir.

## 6. Verification and observation

Deploy sonrası gözlem penceresinde şu kanıtlar kaydedilir:

- release SHA/artifact digest, service URL ve deployment timestamp;
- fingerprint: host, port, database, schema, server version, `schemaHash`, `liveSchemaHash`,
  migration manifest hash, last applied migration;
- health/readiness probe sonuçları ve HTTP latency/error rate;
- structured log’da request ID/error correlation; auth, token, cookie, password, card/CVV, raw
  provider payload ve gereksiz PII bulunmadığı;
- 5xx, DB connection pool, migration error, webhook rejection/replay ve billing lifecycle alert’leri.

Mevcut logger Pino structured output ve `authorization`/`cookie`/token/password redaction sağlıyor;
harici metrics/tracing/alerting konfigürasyonu repository’de **UNKNOWN**. Production monitörleri
bağlanmadan promotion tamamlanmış sayılmaz.

## 7. Rollback

1. Yeni release’in trafiğini durdur veya önceki uyumlu artifact’e yönlendir.
2. Migration uygulanmamışsa uygulama rollback’i yapılabilir; migration uygulanmışsa otomatik down
   migration çalıştırılmaz.
3. Önceki release’in yeni schema ile çalışabildiği backward-compatible migration kuralıyla kanıtlanır.
4. Veri bozulması veya geri dönüş gerektiren migration’da restore planı, change approval ve incident
   owner devreye girer; backup’tan restore sonrası fingerprint/health/smoke yeniden alınır.
5. Rollback sonrası webhook duplicate/replay, entitlement ve billing audit kayıtları ayrıca doğrulanır.

## Secret ve güvenlik kuralları

- Secret kategorileri: `DATABASE_URL`, `JWT_SECRET`, provider API/secret key, merchant/plan/callback
  binding’leri, webhook signature secret ve OIDC private credentials.
- Secret manager zorunlu; repo `.env` yalnız local örnek/çalışma içindir, production artifact’e konmaz.
- Rotation owner ve süreleri release kaydında tutulur; secret değerleri shell history, CI output,
  request log, error response ve browser telemetry’ye girmez.
- CORS yalnız explicit HTTP(S) allowlist; wildcard yok. Security headers, CSP ve process-local
  brute-force/rate limit uygulamada mevcut ve local/test ile doğrulanmıştır. HTTPS/TLS termination,
  edge/WAF veya Redis-backed shared limiter ve production probe/alert binding’i deployment target
  bilinmediği için **UNKNOWN** olarak ayrıca doğrulanmalıdır.
- Browser auth şu anda bearer token’ları `localStorage`’da tutuyor; production güvenlik kararı olarak
  XSS etkisi ve HttpOnly/Secure/SameSite cookie migration’ı ayrıca çözülmelidir.

## Promotion kararı

Bu runbook tamamlanmış bir production deploy emri değildir. Current state’te deployment target,
staging, production DB identity, backup/restore evidence, production probe binding’i, production
payment ve production catalog kanıtlanmadığı için promotion kararı **NO-GO**’dur.
