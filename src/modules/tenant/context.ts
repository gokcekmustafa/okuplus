import type { Prisma, PrismaClient, PlatformRole, TenantType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

/**
 * Authenticated istek bağlamı. Şimdilik authentication yazılmadığı için bu
 * tip ileride auth modülü tarafından doldurulacaktır.
 */
export interface RequestContext {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
  tenantType?: TenantType | null;
  tenantName?: string | null;
}

export type DbClient = PrismaClient;

/**
 * PostgreSQL GUC değerlerini transaction scope içinde ayarlar.
 * `SET LOCAL` yerine `set_config(..., true)` kullanılır: üçüncü parametre
 * `true` olduğu için değer transaction sonunda sıfırlanır.
 *
 * Prisma template literal (`$executeRaw`) değerleri bind parametresi olarak
 * gönderir; asla string interpolasyonla SQL'e gömülmez.
 *
 * NOT: platformRole null ise `app.platform_role` GUC'si hiç set edilmez.
 * PostgreSQL'de bir kez set edilen GUC transaction sonrasında NULL değil
 * boş string olarak kalır; boş string `IS NOT NULL` kontrolünü TRUE yapar ve
 * RLS policy'lerini (ör. `current_setting('app.platform_role', true)
 * IS NOT NULL`) ihlal edebilir. Detay için son rapor J maddesine bakınız.
 */
export async function applyTenantContext(
  tx: Prisma.TransactionClient,
  context: RequestContext,
): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.user_id', ${context.userId}, true)
  `;

  if (context.tenantId !== null) {
    await tx.$executeRaw`
      SELECT set_config('app.tenant_id', ${context.tenantId}, true)
    `;
  }

  if (context.platformRole !== null) {
    await tx.$executeRaw`
      SELECT set_config('app.platform_role', ${context.platformRole}, true)
    `;
  }
}

/**
 * Verilen bağlam ile bir transaction açar, GUC'leri ayarlar ve callback'i
 * çalıştırır. Transaction kapanınca GUC'ler otomatik temizlenir.
 *
 * Kullanım:
 *   await withTenantContext(ctx, async (tx) => {
 *     await tx.user.findMany(...);
 *   });
 */
export async function withTenantContext<T>(
  context: RequestContext,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await applyTenantContext(tx, context);
    return callback(tx);
  });
}
