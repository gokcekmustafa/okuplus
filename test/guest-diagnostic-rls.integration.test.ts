import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { withGuestSessionContext } from "../src/modules/guest-diagnostic/context.js";
import { withTenantContext } from "../src/modules/tenant/context.js";

const appUrl = process.env.GUEST_RLS_TEST_DATABASE_URL?.trim();
const sessionAToken = process.env.GUEST_RLS_SESSION_A_TOKEN?.trim();
const sessionBToken = process.env.GUEST_RLS_SESSION_B_TOKEN?.trim();
const sessionAId = process.env.GUEST_RLS_SESSION_A_ID?.trim();
const sessionBId = process.env.GUEST_RLS_SESSION_B_ID?.trim();
const hasFixture = Boolean(appUrl && sessionAToken && sessionBToken && sessionAId && sessionBId);

const app = hasFixture ? new PrismaClient({ datasources: { db: { url: appUrl } } }) : null;

const guestRlsDescribe = hasFixture ? describe : describe.skip;

async function visibleSessionIds(token: string, requestedId: string): Promise<string[]> {
  if (!app) throw new Error("Guest RLS fixture is not configured");

  return withGuestSessionContext(
    token,
    "ANSWER",
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "GuestDiagnosticSession"
        WHERE "id" = ${requestedId}
      `;
      return rows.map((row) => row.id);
    },
    app,
  );
}

guestRlsDescribe("guest diagnostic RLS integration contract", () => {
  beforeAll(async () => {
    await app?.$connect();
  });

  afterAll(async () => {
    await app?.$disconnect();
  });

  it("Session A context Session A'yı okuyabilir", async () => {
    expect(await visibleSessionIds(sessionAToken!, sessionAId!)).toEqual([sessionAId]);
  });

  it("Session A context Session B'yi okuyamaz", async () => {
    expect(await visibleSessionIds(sessionAToken!, sessionBId!)).toEqual([]);
  });

  it("guest context olmadan guest data görünmez", async () => {
    const rows = await app!.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "GuestDiagnosticSession"
      WHERE "id" = ${sessionAId}
    `;
    expect(rows).toEqual([]);
  });

  it("client'ın gönderdiği sahte session ID ile veri açılmaz", async () => {
    const fakeId = "99999996-0000-7000-8000-000000000099";
    const rows = await app!.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.guest_session_id', ${fakeId}, true)
      `;
      return tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "GuestDiagnosticSession"
        WHERE "id" = ${sessionAId}
      `;
    });
    expect(rows).toEqual([]);
  });

  it("transaction bitince guest context temizlenir", async () => {
    await visibleSessionIds(sessionAToken!, sessionAId!);
    const rows = await app!.$queryRaw<Array<{ guest_session_id: string | null }>>`
      SELECT current_setting('app.guest_session_id', true) AS guest_session_id
    `;
    expect(rows[0]?.guest_session_id).not.toBe(sessionAId);
  });

  it("connection pool'dan alınan sonraki transaction önceki guest context'i taşımaz", async () => {
    const rows = await app!.$transaction(
      async (tx) =>
        tx.$queryRaw<Array<{ guest_session_id: string | null }>>`
        SELECT current_setting('app.guest_session_id', true) AS guest_session_id
      `,
    );
    expect(rows[0]?.guest_session_id).not.toBe(sessionAId);
  });

  it("guest operation olmadan write etkisiz kalır", async () => {
    const affected = await app!.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.guest_session_id', ${sessionAId}, true)
      `;
      return tx.$executeRaw`
        UPDATE "GuestDiagnosticSession"
        SET "lastActivityAt" = "lastActivityAt"
        WHERE "id" = ${sessionAId}
      `;
    });
    expect(affected).toBe(0);
  });

  it("RLS test bağlantısı superuser veya BYPASSRLS değildir", async () => {
    const rows = await app!.$queryRaw<
      Array<{ role_name: string; is_superuser: boolean; has_bypassrls: boolean }>
    >`
      SELECT current_user::text AS role_name,
             rol.rolsuper AS is_superuser,
             rol.rolbypassrls AS has_bypassrls
      FROM pg_catalog.pg_roles AS rol
      WHERE rol.rolname = current_user
    `;
    expect(rows[0]?.is_superuser).toBe(false);
    expect(rows[0]?.has_bypassrls).toBe(false);
  });

  it("authenticated tenant context guest context'i açmaz ve tenant GUC'sini korur", async () => {
    const rows = await withTenantContext(
      {
        userId: "99999996-0000-7000-8000-000000000010",
        tenantId: "99999996-0000-7000-8000-000000000011",
        platformRole: null,
      },
      (tx) =>
        tx.$queryRaw<Array<{ tenant_id: string | null; guest_session_id: string | null }>>`
          SELECT current_setting('app.tenant_id', true) AS tenant_id,
                 current_setting('app.guest_session_id', true) AS guest_session_id
        `,
      app!,
    );
    expect(rows[0]?.tenant_id).toBe("99999996-0000-7000-8000-000000000011");
    expect(rows[0]?.guest_session_id).not.toBe(sessionAId);
  });
});
