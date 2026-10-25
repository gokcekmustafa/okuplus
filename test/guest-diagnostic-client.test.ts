import { describe, expect, it, vi } from "vitest";

import {
  createGuestDiagnosticClient,
  GUEST_DIAGNOSTIC_CREDENTIAL_KEY,
} from "../public/guest-diagnostic-client.js";

const token = "a".repeat(43);
const csrfToken = "b".repeat(43);

function response(data: Record<string, unknown>) {
  return { ok: true, data };
}

describe("guest diagnostic client transport", () => {
  it("uses native secure storage and bearer headers for the complete session round trip", async () => {
    const stored = new Map<string, string>();
    const secureStorage = {
      async getItem(key: string) {
        return stored.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        stored.set(key, value);
      },
      async remove(key: string) {
        stored.delete(key);
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: { sessionId: "session-1", resumed: false, nativeCredential: { token, csrfToken } },
      })
      .mockResolvedValueOnce({ ok: true, data: { questions: [{ id: "item-1" }] } })
      .mockResolvedValueOnce({ ok: true, data: { saved: true } });
    const client = createGuestDiagnosticClient({
      nativeMobileRuntime: true,
      secureStorage,
      fetcher,
      parseResponse: async (res: { data: Record<string, unknown> }) => res.data,
    });

    const started = await client.request("/guest/diagnostics", { method: "POST" });
    expect(started).toEqual({ sessionId: "session-1", resumed: false });
    expect(JSON.parse(stored.get(GUEST_DIAGNOSTIC_CREDENTIAL_KEY)!)).toEqual({
      token,
      csrfToken,
    });

    await client.request("/guest/diagnostics/session-1/questions");
    await client.request("/guest/diagnostics/session-1/answers", {
      method: "POST",
      body: JSON.stringify({ itemId: "item-1" }),
    });

    const [, startOptions] = fetcher.mock.calls[0]!;
    const [, readOptions] = fetcher.mock.calls[1]!;
    const [, answerOptions] = fetcher.mock.calls[2]!;
    expect(startOptions.credentials).toBe("omit");
    expect(startOptions.headers["x-okupratik-guest-transport"]).toBe("secure-storage");
    expect(startOptions.headers["x-okupratik-guest-token"]).toBeUndefined();
    expect(readOptions.headers["x-okupratik-guest-token"]).toBe(token);
    expect(readOptions.credentials).toBe("omit");
    expect(answerOptions.headers["x-okupratik-guest-token"]).toBe(token);
    expect(answerOptions.headers["x-csrf-token"]).toBe(csrfToken);
    expect(answerOptions.credentials).toBe("omit");
    expect(JSON.stringify(started)).not.toContain(token);
    expect(JSON.stringify(started)).not.toContain(csrfToken);

    await client.clear();
    expect(stored.has(GUEST_DIAGNOSTIC_CREDENTIAL_KEY)).toBe(false);
  });

  it("preserves the browser cookie and CSRF flow without exposing native credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ sessionId: "web-session" }));
    const client = createGuestDiagnosticClient({
      fetcher,
      parseResponse: async (res: { data: Record<string, unknown> }) => res.data,
      browserCsrfHeaders: () => ({ "x-csrf-token": "browser-csrf" }),
    });
    await client.request("/guest/diagnostics", { method: "POST" });

    const [, options] = fetcher.mock.calls[0]!;
    expect(options.credentials).toBe("include");
    expect(options.headers["x-csrf-token"]).toBe("browser-csrf");
    expect(options.headers["x-okupratik-guest-transport"]).toBeUndefined();
  });

  it("fails before creating a native session when secure storage is unavailable", async () => {
    const fetcher = vi.fn();
    const client = createGuestDiagnosticClient({
      nativeMobileRuntime: true,
      fetcher,
      parseResponse: async () => ({}),
    });

    await expect(client.request("/guest/diagnostics", { method: "POST" })).rejects.toMatchObject({
      code: "GUEST_SECURE_STORAGE_UNAVAILABLE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
