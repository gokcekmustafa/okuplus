import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const helperStart = source.indexOf("let authRefreshPromise = null;");
const helperEnd = source.indexOf("async function logout(", helperStart);
const helperCode = source.slice(helperStart, helperEnd);

function response(status: number) {
  return {
    status,
    ok: status >= 200 && status < 300,
  };
}

function harness(
  fetchImpl: (url: string, options: Record<string, unknown>) => Promise<unknown>,
  nativeMobileRuntime = false,
  secureWriteFails = false,
) {
  const values = new Map<string, string>([
    ["oku.accessToken", "expired-access"],
    ["oku.refreshToken", "refresh-token"],
    ["oku.tenantId", "tenant-1"],
  ]);
  const localStorageWrites: Array<[string, string]> = [];
  let nativeSession = {
    accessToken: "expired-access",
    refreshToken: "refresh-token",
    tenantId: "tenant-1",
  };
  let refreshCalls = 0;
  let loginCalls = 0;
  const context = createContext({
    nativeMobileRuntime,
    STORAGE_KEYS: {
      accessToken: "oku.accessToken",
      refreshToken: "oku.refreshToken",
      tenantId: "oku.tenantId",
    },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageWrites.push([key, value]);
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    },
    getStoredTokens: () =>
      nativeMobileRuntime
        ? { ...nativeSession }
        : {
            accessToken: null,
            refreshToken: null,
            tenantId: values.get("oku.tenantId") ?? null,
          },
    setStoredSession: async (data: {
      tokens: { accessToken: string; refreshToken: string };
      tenantContext: { tenantId: string };
    }) => {
      if (secureWriteFails)
        throw Object.assign(new Error("secure storage unavailable"), {
          code: "SECURE_STORAGE_UNAVAILABLE",
        });
      nativeSession = {
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        tenantId: data.tenantContext.tenantId,
      };
    },
    authHeaders: (accessToken: string | null, tenantId: string | null) => ({
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    }),
    csrfHeaders: () => ({}),
    refreshTokens: async () => {
      refreshCalls += 1;
      return { accessToken: "fresh-access", refreshToken: "fresh-refresh" };
    },
    clearStoredSession: () => {
      values.delete("oku.accessToken");
      values.delete("oku.refreshToken");
      nativeSession = { accessToken: null, refreshToken: null, tenantId: null };
    },
    showLogin: () => {
      loginCalls += 1;
    },
    fetch: fetchImpl,
  });
  runInContext(helperCode, context);
  return {
    context,
    get refreshCalls() {
      return refreshCalls;
    },
    get loginCalls() {
      return loginCalls;
    },
    accessToken: () =>
      nativeMobileRuntime ? nativeSession.accessToken : values.get("oku.accessToken"),
    secureSession: () => ({ ...nativeSession }),
    localStorageWrites: () => localStorageWrites,
  };
}

describe("student authenticated API session recovery", () => {
  it("refreshes an expired access token and retries the original request", async () => {
    const calls: Array<{ url: string; options: Record<string, unknown> }> = [];
    let firstRequest = true;
    const h = harness(async (url, options) => {
      calls.push({ url, options });
      if (firstRequest) {
        firstRequest = false;
        return response(401);
      }
      return response(200);
    });

    const result = await runInContext("authenticatedFetch('/student/today')", h.context);

    expect(result.status).toBe(200);
    expect(h.refreshCalls).toBe(1);
    expect(h.loginCalls).toBe(0);
    expect(h.accessToken()).toBe("expired-access");
    expect(calls).toHaveLength(2);
    expect((calls[0].options.headers as Record<string, string>).authorization).toBeUndefined();
    expect((calls[1].options.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("shares one refresh request across concurrent expired API calls", async () => {
    const calls: Array<{ url: string; options: Record<string, unknown> }> = [];
    let expiredRequests = 0;
    const h = harness(async (url, options) => {
      calls.push({ url, options });
      if (expiredRequests < 2) {
        expiredRequests += 1;
        return response(401);
      }
      return response(200);
    });

    const results = await runInContext(
      "Promise.all([authenticatedFetch('/student/today'), authenticatedFetch('/student/gamification')])",
      h.context,
    );

    expect(results).toHaveLength(2);
    expect(results.every((item: { status: number }) => item.status === 200)).toBe(true);
    expect(h.refreshCalls).toBe(1);
  });

  it("stores refreshed native tokens through the secure session writer only", async () => {
    let firstRequest = true;
    const h = harness(async () => {
      if (firstRequest) {
        firstRequest = false;
        return response(401);
      }
      return response(200);
    }, true);

    const result = await runInContext("authenticatedFetch('/student/today')", h.context);

    expect(result.status).toBe(200);
    expect(h.secureSession()).toEqual({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      tenantId: "tenant-1",
    });
    expect(h.localStorageWrites()).toHaveLength(0);
  });

  it("does not retry an authenticated request or retain a session when secure refresh persistence fails", async () => {
    let firstRequest = true;
    const h = harness(
      async () => {
        if (firstRequest) {
          firstRequest = false;
          return response(401);
        }
        return response(200);
      },
      true,
      true,
    );

    const result = await runInContext("authenticatedFetch('/student/today')", h.context);

    expect(result.status).toBe(401);
    expect(h.secureSession()).toEqual({ accessToken: null, refreshToken: null, tenantId: null });
    expect(h.loginCalls).toBe(1);
    expect(h.localStorageWrites()).toHaveLength(0);
  });
});
