import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { withTenantContext } from "../src/modules/tenant/index.js";

/**
 * withTenantContext: GUC'lerin transaction içinde set edildiğini ve
 * transaction dışında set edilmediğini doğrular.
 *
 * NOT: PostgreSQL'de bir kez set edilen transaction-local GUC transaction
 * sonrasında NULL değil boş string olarak kalır. RLS policy'leri
 * `current_setting('app.platform_role', true) IS NOT NULL` biçiminde olduğu
 * için boş string bu kontrolü TRUE yapar — bu yüzden uygulama veri erişimini
 * MUTLAKA withTenantContext transaction'ı içinden yapmalıdır. (Rapor J)
 */
describe("tenant context helper", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("transaction içinde app.tenant_id / app.user_id / app.platform_role set eder", async () => {
    const context = {
      userId: "11111111-0000-7000-8000-000000000001",
      tenantId: "aaaaaaaa-0000-7000-8000-000000000001",
      platformRole: "SUPER_ADMIN" as const,
    };

    const values = await withTenantContext(context, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ tenant_id: string | null; user_id: string | null; role: string | null }>
      >`
        SELECT current_setting('app.tenant_id', true) AS tenant_id,
               current_setting('app.user_id', true) AS user_id,
               current_setting('app.platform_role', true) AS role
      `;
      return rows[0];
    });

    expect(values?.tenant_id).toBe(context.tenantId);
    expect(values?.user_id).toBe(context.userId);
    expect(values?.role).toBe(context.platformRole);
  });

  it("platformRole null ise app.platform_role GUC'si set edilmez", async () => {
    const context = {
      userId: "11111111-0000-7000-8000-000000000001",
      tenantId: "aaaaaaaa-0000-7000-8000-000000000001",
      platformRole: null,
    };

    const values = await withTenantContext(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ role: string | null }>>`
        SELECT current_setting('app.platform_role', true) AS role
      `;
      return rows[0];
    });

    expect(values?.role).not.toBe("SUPER_ADMIN");
  });

  it("transaction içindeki GUC değerleri transaction dışına taşmaz (RLS gereksinimi)", async () => {
    const context = {
      userId: "11111111-0000-7000-8000-000000000001",
      tenantId: "aaaaaaaa-0000-7000-8000-000000000001",
      platformRole: null,
    };

    await withTenantContext(context, async () => {});

    const rows = await prisma.$queryRaw<Array<{ tenant_id: string | null }>>`
      SELECT current_setting('app.tenant_id', true) AS tenant_id
    `;
    // Transaction dışında değer artık tenant id DEĞİLDİR (NULL veya boş string).
    expect(rows[0]?.tenant_id).not.toBe(context.tenantId);
  });
});
