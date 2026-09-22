import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  GuestDiagnosticSecurityError,
  withNewGuestSessionContext,
  guestDatabaseUrl,
  hashGuestToken,
  withGuestDbContext,
  withGuestSessionContext,
} from "../src/modules/guest-diagnostic/context.js";

const contextSource = readFileSync(
  new URL("../src/modules/guest-diagnostic/context.ts", import.meta.url),
  "utf8",
);

type QueryRecord = { sql: string; values: readonly unknown[] };

function fakeClient(options?: {
  role?: { role_name: string; is_superuser: boolean; has_bypassrls: boolean };
  session?: { id: string; status: "IN_PROGRESS" | "COMPLETED" | "EXPIRED"; expiresAt: Date } | null;
}) {
  const queries: QueryRecord[] = [];
  const executions: QueryRecord[] = [];
  const role = options?.role ?? {
    role_name: "oku_guest_app",
    is_superuser: false,
    has_bypassrls: false,
  };
  const session =
    options && "session" in options
      ? options.session
      : {
          id: "99999996-0000-7000-8000-000000000001",
          status: "IN_PROGRESS" as const,
          expiresAt: new Date(Date.now() + 60_000),
        };

  const tx = {
    $queryRaw: async <T>(strings: TemplateStringsArray, ...values: readonly unknown[]) => {
      const sql = Array.from(strings).join("?");
      queries.push({ sql, values });
      if (sql.includes("pg_catalog.pg_roles")) return [role] as T;
      if (sql.includes('FROM "GuestDiagnosticSession"')) return (session ? [session] : []) as T;
      return [] as T;
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: readonly unknown[]) => {
      executions.push({ sql: Array.from(strings).join("?"), values });
      return 1;
    },
  };

  const client = {
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  } as unknown as PrismaClient;

  return { client, queries, executions };
}

describe("guest diagnostic security context", () => {
  it("fail-closed şekilde ayrı GUEST_DATABASE_URL ister", () => {
    expect(() => guestDatabaseUrl({})).toThrow(GuestDiagnosticSecurityError);
    expect(() =>
      guestDatabaseUrl({
        DATABASE_URL: "postgresql://postgres:postgres@db:5432/oku_plus",
        GUEST_DATABASE_URL: "postgresql://postgres:postgres@db:5432/oku_plus",
      }),
    ).toThrow("separate restricted database role");
    expect(
      guestDatabaseUrl({
        DATABASE_URL: "postgresql://postgres:postgres@db:5432/oku_plus",
        GUEST_DATABASE_URL: "postgresql://oku_guest_app:secret@db:5432/oku_plus",
      }),
    ).toContain("oku_guest_app");
  });

  it("guest token'ı repository convention'ına uygun SHA-256 ile hashler", () => {
    const hash = hashGuestToken("guest-secret");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashGuestToken("guest-secret"));
    expect(hash).not.toContain("guest-secret");
  });

  it("session ID'yi client input'tan değil, token lookup sonucundan context'e taşır", async () => {
    const fake = fakeClient();
    const callback = async (_tx: unknown, session: { id: string }) => session.id;

    const sessionId = await withGuestSessionContext(
      "guest-secret",
      "ANSWER",
      callback,
      fake.client,
    );

    expect(sessionId).toBe("99999996-0000-7000-8000-000000000001");
    expect(fake.executions.map((entry) => entry.sql)).toEqual([
      expect.stringContaining("app.guest_token_hash"),
      expect.stringContaining("app.guest_operation"),
      expect.stringContaining("app.guest_token_hash"),
      expect.stringContaining("app.guest_session_id"),
      expect.stringContaining("app.guest_operation"),
    ]);
    expect(fake.executions.flatMap((entry) => entry.values)).not.toContain("guest-secret");
    expect(fake.executions.flatMap((entry) => entry.values)).toContain(sessionId);
    expect(fake.executions.flatMap((entry) => entry.values)).toContain("ANSWER");
  });

  it("transaction-local context için set_config(..., true) kullanır", () => {
    expect(contextSource).toContain("set_config('app.guest_session_id', ${sessionId}, true)");
    expect(contextSource).toContain("set_config('app.guest_operation', ${operation}, true)");
    expect(contextSource).toContain("set_config('app.guest_token_hash', ${tokenHash}, true)");
    expect(contextSource).not.toMatch(/SET\s+(SESSION\s+)?app\.guest_/i);
    expect(contextSource).not.toMatch(/global.*guest.*session.*state/i);
  });

  it("BYPASSRLS veya superuser bağlantısını reddeder ve callback'i çalıştırmaz", async () => {
    const fake = fakeClient({
      role: { role_name: "postgres", is_superuser: true, has_bypassrls: true },
    });
    let callbackCalled = false;

    await expect(
      withGuestSessionContext(
        "guest-secret",
        "ANSWER",
        async () => {
          callbackCalled = true;
        },
        fake.client,
      ),
    ).rejects.toThrow("without BYPASSRLS");

    expect(callbackCalled).toBe(false);
    expect(fake.executions).toHaveLength(0);
  });

  it("ham client session ID'si ValidatedGuestSession gibi taklit edilemez", async () => {
    const fake = fakeClient();
    const forgedSession = {
      id: "99999996-0000-7000-8000-000000000099",
      expiresAt: new Date(Date.now() + 60_000),
    };

    await expect(
      withGuestDbContext(forgedSession, "ANSWER", async () => undefined, fake.client),
    ).rejects.toThrow("expired");
    expect(fake.executions).toHaveLength(0);
  });

  it("bulunamayan veya aktif olmayan session'ı reddeder", async () => {
    const missing = fakeClient({ session: null });
    await expect(
      withGuestSessionContext("guest-secret", "ANSWER", async () => undefined, missing.client),
    ).rejects.toThrow("was not found");

    const expired = fakeClient({
      session: {
        id: "99999996-0000-7000-8000-000000000002",
        status: "EXPIRED",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await expect(
      withGuestSessionContext("guest-secret", "ANSWER", async () => undefined, expired.client),
    ).rejects.toThrow("not active");
  });

  it("yeni session context'ini server-generated ID ile CREATE olarak kurar", async () => {
    const fake = fakeClient();
    const expiresAt = new Date(Date.now() + 60_000);
    const sessionId = await withNewGuestSessionContext(
      expiresAt,
      async (_tx, session) => session.id,
      fake.client,
    );

    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(fake.executions.flatMap((entry) => entry.values)).toContain(sessionId);
    expect(fake.executions.flatMap((entry) => entry.values)).toContain("CREATE");
  });
});
