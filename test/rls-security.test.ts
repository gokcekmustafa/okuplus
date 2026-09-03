import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type PlatformRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { withTenantContext } from "../src/modules/tenant/index.js";

/**
 * RLS güvenlik doğrulaması — oku_app rolüyle (postgres superuser RLS'i
 * bypass eder, bu yüzden testler oku_app olarak bağlanır).
 *
 * Kapsam: `app.platform_role` GUC'sinin boş string / NULL olması hiçbir
 * platform yetkisi vermemelidir. Policy'ler
 * `current_setting('app.platform_role', true) <> ''` biçiminde güncellendi.
 * (Eski `IS NOT NULL` kontrolü, transaction sonrası GUC kalıntısı boş string
 * iken TRUE döner ve global/tenant verisini açığa çıkarırdı.)
 *
 * Bağlantı: `oku_app` rolü yerel PostgreSQL'e (WSL2, port 5433) bağlanır.
 * URL `RLS_TEST_DATABASE_URL` ortam değişkeniyle (`.env` üzerinden)
 * ezilebilir; böylece production/test `DATABASE_URL`'inden bağımsızdır.
 * `oku_app` süper kullanıcı değildir ve BYPASSRLS'a sahip değildir, bu
 * yüzden RLS policy'leri gerçekten uygulanır.
 *
 * İzolasyon: Test yalnızca kendi `99999995-...` ID'li kayıtlarını oluşturur
 * ve temizler; `TRUNCATE` kullanmaz. Böylece demo/gerçek geliştirme verisi
 * (admin@okuplus.dev, demo@okuplus.dev, Demo Okulu vb.) asla silinmez.
 */

const APP_DB_URL =
  process.env.RLS_TEST_DATABASE_URL ??
  "postgresql://oku_app:oku_app_pass@localhost:5433/oku_plus_test?schema=public&connection_limit=1";

const app = new PrismaClient({
  datasources: { db: { url: APP_DB_URL } },
});

const TENANT_A = "99999995-0000-7000-8000-00000000000a";
const TENANT_B = "99999995-0000-7000-8000-00000000000b";
const USER_ID = "99999995-0000-7000-8000-000000000001";

const GLOBAL_CONTENT = "99999995-0000-7000-8000-0000000000c1";
const CONTENT_A = "99999995-0000-7000-8000-0000000000a1";
const CONTENT_B = "99999995-0000-7000-8000-0000000000b1";

// Testin sahibi olduğu Content ID'leri. Dinamik oluşturulan global içerikler
// (ör. "g-write") de test sırasında bu listeye eklenir ve afterAll'da silinir.
const testContentIds: string[] = [CONTENT_A, CONTENT_B, GLOBAL_CONTENT];

async function idsFrom(rows: Array<{ id: string }>): Promise<string[]> {
  return rows.map((r) => r.id);
}

describe("RLS: app.platform_role boş string / NULL asla yetki vermez", () => {
  beforeAll(async () => {
    await app.$connect();

    // Olası kesinti kalıntısını temizle (idempotent): yalnızca bu testin
    // kendi ID'lerini siler, demo/gerçek veriye dokunmaz.
    await prisma.content.deleteMany({ where: { id: { in: testContentIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });

    // Tenant tablosunda RLS yok; oku_app INSERT yetkisine sahip.
    await app.tenant.create({
      data: { id: TENANT_A, type: "ORGANIZATION", name: "Tenant A" },
    });
    await app.tenant.create({
      data: { id: TENANT_B, type: "ORGANIZATION", name: "Tenant B" },
    });

    // Content A: kendi tenant context'i ile.
    await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: null },
      async (tx) => {
        await tx.content.create({
          data: {
            id: CONTENT_A,
            tenantId: TENANT_A,
            type: "PASSAGE",
            title: "Tenant A icerigi",
            difficulty: 0.5,
          },
        });
      },
      app,
    );

    // Content B: kendi tenant context'i ile (başka tenant yazamaz).
    await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_B, platformRole: null },
      async (tx) => {
        await tx.content.create({
          data: {
            id: CONTENT_B,
            tenantId: TENANT_B,
            type: "PASSAGE",
            title: "Tenant B icerigi",
            difficulty: 0.5,
          },
        });
      },
      app,
    );

    // Global content: platform rolü ile.
    await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        await tx.content.create({
          data: {
            id: GLOBAL_CONTENT,
            tenantId: null,
            type: "PASSAGE",
            title: "Global icerik",
            difficulty: 0.5,
          },
        });
      },
      app,
    );
  });

  afterAll(async () => {
    // Yalnızca bu testin oluşturduğu kayıtları siler; TRUNCATE kullanmaz,
    // böylece demo/gerçek geliştirme verisi asla silinmez.
    await prisma.content.deleteMany({ where: { id: { in: testContentIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    await app.$disconnect();
  });

  it("platformRole null: global (tenantId NULL) content INSERT reddedilir", async () => {
    await expect(
      withTenantContext(
        { userId: USER_ID, tenantId: TENANT_A, platformRole: null },
        async (tx) => {
          await tx.content.create({
            data: { tenantId: null, type: "ARTICLE", title: "g-1", difficulty: 0.5 },
          });
        },
        app,
      ),
    ).rejects.toThrow();
  });

  it("platformRole '': global content INSERT reddedilir (boş string rol değildir)", async () => {
    await expect(
      withTenantContext(
        { userId: USER_ID, tenantId: TENANT_A, platformRole: "" as unknown as PlatformRole },
        async (tx) => {
          await tx.content.create({
            data: { tenantId: null, type: "ARTICLE", title: "g-2", difficulty: 0.5 },
          });
        },
        app,
      ),
    ).rejects.toThrow();
  });

  it("platformRole SUPER_ADMIN: global content INSERT ve DELETE izinlidir", async () => {
    const created = await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        return tx.content.create({
          data: { tenantId: null, type: "ARTICLE", title: "g-write", difficulty: 0.6 },
        });
      },
      app,
    );
    testContentIds.push(created.id);

    await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        await tx.content.delete({ where: { id: created.id } });
      },
      app,
    );
  });

  it("normal tenant kullanıcı: yalnızca kendi tenant + global veriyi görür", async () => {
    const rows = await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: null },
      async (tx) => {
        return tx.content.findMany({ select: { id: true } });
      },
      app,
    );
    const ids = await idsFrom(rows);

    expect(ids).toContain(CONTENT_A);
    expect(ids).toContain(GLOBAL_CONTENT);
    expect(ids).not.toContain(CONTENT_B);
  });

  it("platformRole '': diğer tenant verisi görünmez (boş string izolasyonu kırmaz)", async () => {
    const rows = await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: "" as unknown as PlatformRole },
      async (tx) => {
        return tx.content.findMany({ select: { id: true } });
      },
      app,
    );
    const ids = await idsFrom(rows);

    expect(ids).toContain(CONTENT_A);
    expect(ids).not.toContain(CONTENT_B);
  });

  it("transaction sonrası platform yetkisi taşmaz (GUC kalıntısı boş string)", async () => {
    // SUPER_ADMIN transaction'ı: bu bağlantıya (connection_limit=1) GUC yazar.
    await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        await tx.content.count();
      },
      app,
    );

    // Aynı bağlantıda yeni transaction: platform_role set edilmez, GUC
    // kalıntısı boş string kalır. Eski `IS NOT NULL` bunu TRUE yapardı.
    const visibleCount = await withTenantContext(
      { userId: USER_ID, tenantId: TENANT_A, platformRole: null },
      async (tx) => {
        return tx.content.count({ where: { tenantId: TENANT_B } });
      },
      app,
    );

    expect(visibleCount).toBe(0);
  });
});
