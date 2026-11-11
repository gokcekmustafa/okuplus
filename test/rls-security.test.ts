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
const OTHER_USER_ID = "99999995-0000-7000-8000-000000000002";
const ACCOUNT_DELETION_REQUEST_ID = "99999995-0000-7000-8000-0000000000d1";
const SUPPORT_TICKET_ID = "99999995-0000-7000-8000-0000000000d2";
const OTHER_SUPPORT_TICKET_ID = "99999995-0000-7000-8000-0000000000d3";
const SUPPORT_NOTIFICATION_ID = "99999995-0000-7000-8000-0000000000d4";

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
    await prisma.supportTicketMessage.deleteMany({
      where: { ticketId: { in: [SUPPORT_TICKET_ID, OTHER_SUPPORT_TICKET_ID] } },
    });
    await prisma.supportTicketActivity.deleteMany({
      where: { ticketId: { in: [SUPPORT_TICKET_ID, OTHER_SUPPORT_TICKET_ID] } },
    });
    await prisma.supportTicket.deleteMany({
      where: { id: { in: [SUPPORT_TICKET_ID, OTHER_SUPPORT_TICKET_ID] } },
    });
    await prisma.notification.deleteMany({ where: { id: SUPPORT_NOTIFICATION_ID } });
    await prisma.accountDeletionRequestMessage.deleteMany({
      where: { request: { userId: { in: [USER_ID, OTHER_USER_ID] } } },
    });
    await prisma.accountDeletionRequestActivity.deleteMany({
      where: { request: { userId: { in: [USER_ID, OTHER_USER_ID] } } },
    });
    await prisma.accountDeletionRequest.deleteMany({
      where: { userId: { in: [USER_ID, OTHER_USER_ID] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_USER_ID] } } });
    await prisma.content.deleteMany({ where: { id: { in: testContentIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });

    await prisma.user.createMany({
      data: [
        { id: USER_ID, email: "rls-deletion-owner@example.test", displayName: "RLS Owner" },
        {
          id: OTHER_USER_ID,
          email: "rls-deletion-other@example.test",
          displayName: "RLS Other",
        },
      ],
    });

    await prisma.supportTicket.createMany({
      data: [
        {
          id: SUPPORT_TICKET_ID,
          ownerUserId: USER_ID,
          subject: "RLS owner support ticket",
          category: "TECHNICAL",
          status: "NEW",
        },
        {
          id: OTHER_SUPPORT_TICKET_ID,
          ownerUserId: OTHER_USER_ID,
          subject: "RLS other support ticket",
          category: "ACCOUNT",
          status: "NEW",
        },
      ],
    });
    await prisma.supportTicketMessage.createMany({
      data: [
        {
          id: "99999995-0000-7000-8000-0000000000d5",
          ticketId: SUPPORT_TICKET_ID,
          authorUserId: USER_ID,
          body: "Owner message",
        },
        {
          id: "99999995-0000-7000-8000-0000000000d6",
          ticketId: OTHER_SUPPORT_TICKET_ID,
          authorUserId: OTHER_USER_ID,
          body: "Other message",
        },
      ],
    });
    await prisma.notification.create({
      data: {
        id: SUPPORT_NOTIFICATION_ID,
        recipientUserId: USER_ID,
        recipientAudience: "USER",
        kind: "SUPPORT_TICKET_UPDATED",
        title: "Support update",
        body: "Your ticket was updated.",
        targetType: "SUPPORT_TICKET",
        targetId: SUPPORT_TICKET_ID,
        dedupeKey: "rls-security-support-notification-owner",
      },
    });

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
    await prisma.supportTicketMessage.deleteMany({
      where: { ticketId: { in: [SUPPORT_TICKET_ID, OTHER_SUPPORT_TICKET_ID] } },
    });
    await prisma.supportTicketActivity.deleteMany({
      where: { ticketId: { in: [SUPPORT_TICKET_ID, OTHER_SUPPORT_TICKET_ID] } },
    });
    await prisma.supportTicket.deleteMany({
      where: { id: { in: [SUPPORT_TICKET_ID, OTHER_SUPPORT_TICKET_ID] } },
    });
    await prisma.notification.deleteMany({ where: { id: SUPPORT_NOTIFICATION_ID } });
    await prisma.accountDeletionRequestMessage.deleteMany({
      where: { request: { userId: { in: [USER_ID, OTHER_USER_ID] } } },
    });
    await prisma.accountDeletionRequestActivity.deleteMany({
      where: { request: { userId: { in: [USER_ID, OTHER_USER_ID] } } },
    });
    await prisma.accountDeletionRequest.deleteMany({
      where: { userId: { in: [USER_ID, OTHER_USER_ID] } },
    });
    await prisma.content.deleteMany({ where: { id: { in: testContentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_USER_ID] } } });
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

  it("silme talebi RLS'i sahibe iptal/yanıt, SUPER_ADMIN'e sınırlı inceleme izni verir", async () => {
    const request = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: null },
      (tx) =>
        tx.accountDeletionRequest.create({
          data: { id: ACCOUNT_DELETION_REQUEST_ID, userId: USER_ID },
        }),
      app,
    );
    const otherRequest = await withTenantContext(
      { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.accountDeletionRequest.create({ data: { userId: OTHER_USER_ID } }),
      app,
    );

    const ownRows = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.accountDeletionRequest.findMany({ select: { id: true } }),
      app,
    );
    const otherRows = await withTenantContext(
      { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.accountDeletionRequest.findMany({ select: { id: true } }),
      app,
    );

    expect(ownRows.map(({ id }) => id)).toContain(request.id);
    expect(ownRows.map(({ id }) => id)).not.toContain(otherRequest.id);
    expect(otherRows.map(({ id }) => id)).not.toContain(request.id);
    await expect(
      withTenantContext(
        { userId: USER_ID, tenantId: null, platformRole: null },
        (tx) =>
          tx.accountDeletionRequest.update({
            where: { id: request.id },
            data: { status: "COMPLETED" },
          }),
        app,
      ),
    ).rejects.toThrow();
    await expect(
      withTenantContext(
        { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
        (tx) =>
          tx.accountDeletionRequest.update({
            where: { id: request.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          }),
        app,
      ),
    ).rejects.toThrow();
    const cancelled = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: null },
      (tx) =>
        tx.accountDeletionRequest.update({
          where: { id: request.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
          select: { id: true, status: true, cancelledAt: true },
        }),
      app,
    );
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);

    const adminRows = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: "SUPER_ADMIN" },
      (tx) => tx.accountDeletionRequest.findMany({ select: { id: true } }),
      app,
    );
    expect(adminRows.map(({ id }) => id)).toContain(request.id);
    expect(adminRows.map(({ id }) => id)).toContain(otherRequest.id);
    await expect(
      withTenantContext(
        { userId: USER_ID, tenantId: null, platformRole: "SUPER_ADMIN" },
        (tx) =>
          tx.accountDeletionRequest.update({
            where: { id: otherRequest.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          }),
        app,
      ),
    ).rejects.toThrow();
    await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: "SUPER_ADMIN" },
      (tx) =>
        tx.accountDeletionRequest.update({
          where: { id: otherRequest.id },
          data: { status: "AWAITING_USER" },
        }),
      app,
    );
    const ownerReplyTransition = await withTenantContext(
      { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
      (tx) =>
        tx.accountDeletionRequest.updateMany({
          where: { id: otherRequest.id, status: "AWAITING_USER" },
          data: { status: "UNDER_REVIEW" },
        }),
      app,
    );
    expect(ownerReplyTransition.count).toBe(1);
    await expect(
      withTenantContext(
        { userId: USER_ID, tenantId: null, platformRole: null },
        (tx) =>
          tx.accountDeletionRequest.updateMany({
            where: { id: otherRequest.id, status: "UNDER_REVIEW" },
            data: { status: "IDENTITY_REQUIRED" },
          }),
        app,
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(
      withTenantContext(
        { userId: USER_ID, tenantId: null, platformRole: null },
        (tx) => tx.accountDeletionRequest.create({ data: { userId: OTHER_USER_ID } }),
        app,
      ),
    ).rejects.toThrow();

    const ownerTickets = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.supportTicket.findMany({ select: { id: true } }),
      app,
    );
    const otherTickets = await withTenantContext(
      { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.supportTicket.findMany({ select: { id: true } }),
      app,
    );
    const ownerMessages = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.supportTicketMessage.findMany({ select: { id: true } }),
      app,
    );
    const otherNotifications = await withTenantContext(
      { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
      (tx) => tx.notification.findMany({ select: { id: true } }),
      app,
    );
    expect(ownerTickets.map(({ id }) => id)).toEqual([SUPPORT_TICKET_ID]);
    expect(otherTickets.map(({ id }) => id)).toEqual([OTHER_SUPPORT_TICKET_ID]);
    expect(ownerMessages.map(({ id }) => id)).toEqual(["99999995-0000-7000-8000-0000000000d5"]);
    expect(otherNotifications).toEqual([]);
    const foreignRead = await withTenantContext(
      { userId: OTHER_USER_ID, tenantId: null, platformRole: null },
      (tx) =>
        tx.notification.updateMany({
          where: { id: SUPPORT_NOTIFICATION_ID },
          data: { readAt: new Date() },
        }),
      app,
    );
    expect(foreignRead.count).toBe(0);
    const ownerRead = await withTenantContext(
      { userId: USER_ID, tenantId: null, platformRole: null },
      (tx) =>
        tx.notification.updateMany({
          where: { id: SUPPORT_NOTIFICATION_ID },
          data: { readAt: new Date() },
        }),
      app,
    );
    expect(ownerRead.count).toBe(1);
  });
});
