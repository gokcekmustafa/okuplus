# Release 0.4 — Production Smoke Runbook

Bu runbook yalnızca onaylı synthetic student hesabı ile production release
sonrası authenticated smoke içindir. Gerçek kullanıcı hesabı, staging
operator auth'u, SQL veya doğrudan production DB bağlantısı kullanılmaz.

## Environment contract

Değişkenler uygulama runtime'ına veya repository'ye yazılmaz. Bir defalık
operator process'i ya da erişimi sınırlı CI secret store'unda tanımlanır:

- `APP_ENV=production`
- `NODE_ENV=production`
- `PRODUCTION_SMOKE_BASE_URL=https://okuplus.vercel.app`
- `PRODUCTION_SMOKE_EMAIL`: yalnızca
  `okuplus.production.smoke[@+suffix]@synthetic.invalid` formatı
- `PRODUCTION_SMOKE_PASSWORD`: secret store'dan gelen, en az 16 karakterlik secret
- `PRODUCTION_SMOKE_CONFIRM=CREATE`

`PRODUCTION_SMOKE_EMAIL` gerçek kullanıcı domain'i veya gerçek kullanıcı adresi
olamaz. Password hiçbir zaman source control, `.env`, log veya rapora yazılmaz.

## Preflight

Preflight yalnız environment/config doğrular; HTTP request göndermez ve DB'ye
bağlanmaz:

```powershell
npm run production:smoke:preflight
```

Şunlardan biri yanlışsa process non-zero exit ile durur:

- environment production değilse;
- base URL tam olarak `https://okuplus.vercel.app` değilse;
- staging, localhost veya başka host kullanılıyorsa;
- synthetic `.invalid` email guard başarısızsa;
- password eksik/çok kısaysa;
- `PRODUCTION_SMOKE_CONFIRM=CREATE` değilse.

## Controlled apply

Preflight PASS olmadan apply çalıştırılmaz. Apply yalnız resmi
`POST /auth/signup` endpointini kullanır. Duplicate `409` durumunda yeni kayıt
oluşturmaz; mevcut synthetic hesap ile normal login ve `/auth/me` doğrulaması
yapar.

```powershell
npx tsx scripts/provision-production-smoke-student.ts --apply
```

Başarılı apply sonrasında yalnız güvenli identity özeti raporlanır. Token,
cookie ve password raporlanmaz. Bu araç placement, training, attempt, GP,
quota veya dashboard metriği oluşturmaz.

## Authenticated smoke

Hesap hazırlandıktan ve release deployment/migration tamamlandıktan sonra:

1. `POST /auth/login`
2. `GET /auth/me`
3. dashboard ve student read endpointleri
4. `/health`, `/health/db`, `/ready`
5. tenant isolation ve unauthenticated `401` kontrolleri

Gereksiz attempt, GP, quota veya training write yapılmaz. Herhangi bir
production failure'da release durdurulur; hotfix veya SQL uygulanmaz.
