# OKU+ — 8I-3 Production GO/NO-GO Matrix

**Audit tarihi:** 2026-09-03  
**Kapsam:** Repository/deployment discovery ve local TEST evidence.  
**Production DB erişimi, production write, migration, payment ve catalog promotion:** NO.

## Karar

**NO-GO.** Bu karar gerçek production ortamına bağlanılarak verilmiş bir runtime kararı değildir;
deployment target, production DB identity, staging, backup/restore, production catalog ve iyzico
activation kanıtları repository’de bulunmadığı için promotion’a izin verilmez.

## Matrix

| Kriter                 | Durum       | Kanıt / eksik kanıt                                                                                                                 |
| ---------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| DEPLOYMENT TARGET      | **UNKNOWN** | Docker/Compose, Procfile, Vercel/Railway/Render/Fly manifesti, GitHub Actions ve release config yok; provider tahmini yapılmadı.    |
| PRODUCTION DB IDENTITY | **UNKNOWN** | Production connection binding veya runtime doğrulaması yok; host/port/database/provider/SSL/schema yazılmadı.                       |
| STAGING                | **UNKNOWN** | Ayrı staging service/DB ve aynı artifact ile smoke kanıtı yok.                                                                      |
| BACKUP                 | **BLOCKED** | Production backup/snapshot kanıtı alınmadı; [backup/restore sözleşmesi](./DATABASE_BACKUP_RESTORE_8I2.md) yalnızca prosedürdür.     |
| RESTORE                | **BLOCKED** | Isolated restore rehearsal, RPO/RTO ve restore fingerprint kanıtı yok.                                                              |
| SECURITY               | **BLOCKED** | Local/test hardening PASS; production için localStorage bearer, CSP `unsafe-inline`, TLS/edge limiter ve secret binding çözülmemiş. |
| DEPENDENCIES           | **BLOCKED** | `npm audit` Prisma/deepmerge-ts zincirinde 3 HIGH; güvenli fixed upgrade bulunamadı.                                                |
| SECRETS                | **UNKNOWN** | Production secret manager, binding, rotation owner ve erişim listesi repository’de yok. Secret değerleri incelenmedi.               |
| CATALOG                | **BLOCKED** | Local catalog kayıtları fixture; authorized source ve production-grade Level/Skill/Content relation kanıtı yok.                     |
| IYZICO                 | **BLOCKED** | Sandbox credential/merchant/plan/callback/webhook activation yok; production activation yapılmadı.                                  |
| MIGRATIONS             | **BLOCKED** | Test migration state PASS; production DB ve staging safety/rehearsal bilinmiyor.                                                    |
| HEALTH                 | **UNKNOWN** | `/health` local/test 200; production service/monitor binding bilinmiyor.                                                            |
| READINESS              | **UNKNOWN** | `/ready` local/test DB+migration check ile PASS; production ingress/probe binding bilinmiyor.                                       |
| SMOKE TEST             | **UNKNOWN** | Local browser/regression PASS; production URL, synthetic account ve release artifact yok.                                           |
| ROLLBACK               | **BLOCKED** | Deployment target, previous artifact, migration rehearsal ve restore-backed rollback kanıtı yok.                                    |

## Local/test evidence

- TEST database: `127.0.0.1:5432/oku_plus_test`, schema `public`; migration `14/14 applied`.
- TEST combined fingerprint: `544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`.
- `npm test`: **37 test dosyası / 636 test PASS**.
- lint, format check, typecheck, build, Prisma validate/status: **PASS**.
- 8F final, billing lifecycle, billing account, closed-pilot ve curriculum pack browser regresyonları: **PASS**.
- Fixture QA: **PASS / TEST_FIXTURE_READ_ONLY**. Catalog QA: **BLOCKED / beklenen 8G-9B**.

## GO Candidate koşulları

Bu matris GO vermemektedir. GO Candidate değerlendirmesi için en azından şu kayıtlar gerekir:

1. Authorized deployment source, provider/service, public URL, release SHA/digest.
2. Production DB server/database/schema identity ve bu repository’ye ait fingerprint.
3. Ayrı staging service/DB’de aynı artifact ile migration, health, readiness, smoke ve rollback rehearsal.
4. Provider-native backup + isolated restore kanıtı, RPO/RTO ve retention owner.
5. Secret manager binding/rotation/access evidence; production CORS, TLS, monitoring ve shared rate limiter.
6. Security risk acceptance veya localStorage bearer → HttpOnly/Secure/SameSite cookie migration.
7. Authorized catalog export → validation → promotion zinciri.
8. iyzico sandbox activation/contract test ve ayrıca production merchant/plan/webhook activation.
