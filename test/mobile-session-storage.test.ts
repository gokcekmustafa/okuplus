import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const hydrateStart = source.indexOf("async function hydrateNativeSession() {");
const hydrateEnd = source.indexOf("function soundEffectsEnabled()", hydrateStart);
const setStart = source.indexOf("async function setStoredSession(data) {");
const setEnd = source.indexOf("function clearStoredSession()", setStart);
const sessionHelpers = [
  source.slice(hydrateStart, hydrateEnd),
  source.slice(setStart, setEnd),
].join("\n");

function harness(
  secureStoragePlugin: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  } | null,
) {
  const removals: string[] = [];
  const writes: Array<[string, string]> = [];
  const nativeSession = { accessToken: null, refreshToken: null, tenantId: null };
  const context = createContext({
    nativeMobileRuntime: true,
    secureStoragePlugin,
    SECURE_SESSION_KEY: "oku.session.v1",
    nativeSession,
    STORAGE_KEYS: {
      accessToken: "oku.accessToken",
      refreshToken: "oku.refreshToken",
      tenantId: "oku.tenantId",
    },
    localStorage: {
      removeItem: (key: string) => removals.push(key),
      setItem: (key: string, value: string) => writes.push([key, value]),
    },
  });
  runInContext(sessionHelpers, context);
  return { context, nativeSession, removals, writes };
}

describe("native secure session persistence", () => {
  it("restores both tokens from SecureStorage and removes legacy WebView token copies", async () => {
    const secureStoragePlugin = {
      getItem: vi.fn(async () =>
        JSON.stringify({ accessToken: "access", refreshToken: "refresh", tenantId: "tenant" }),
      ),
      setItem: vi.fn(async () => undefined),
    };
    const h = harness(secureStoragePlugin);

    await h.context.hydrateNativeSession();

    expect(h.nativeSession).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      tenantId: "tenant",
    });
    expect(secureStoragePlugin.getItem).toHaveBeenCalledWith("oku.session.v1");
    expect(h.removals).toEqual(["oku.accessToken", "oku.refreshToken", "oku.tenantId"]);
  });

  it("fails closed on secure-read errors without restoring a session", async () => {
    const h = harness({
      getItem: vi.fn().mockRejectedValue(new Error("native read failed")),
      setItem: vi.fn(async () => undefined),
    });

    await h.context.hydrateNativeSession();

    expect(h.nativeSession).toEqual({ accessToken: null, refreshToken: null, tenantId: null });
    expect(h.removals).toEqual(["oku.accessToken", "oku.refreshToken", "oku.tenantId"]);
    expect(h.writes).toEqual([]);
  });

  it("does not activate a login session or fall back to localStorage when secure write fails", async () => {
    const writeError = Object.assign(new Error("native write failed"), { code: "osError" });
    const secureStoragePlugin = {
      getItem: vi.fn(async () => null),
      setItem: vi.fn().mockRejectedValue(writeError),
    };
    const h = harness(secureStoragePlugin);

    await expect(
      h.context.setStoredSession({
        tokens: { accessToken: "access", refreshToken: "refresh" },
        tenantContext: { tenantId: "tenant" },
      }),
    ).rejects.toMatchObject({ code: "osError" });

    expect(h.nativeSession).toEqual({ accessToken: null, refreshToken: null, tenantId: null });
    expect(secureStoragePlugin.setItem).toHaveBeenCalledWith(
      "oku.session.v1",
      JSON.stringify({ accessToken: "access", refreshToken: "refresh", tenantId: "tenant" }),
    );
    expect(h.writes).toEqual([]);
  });

  it("rejects native login persistence if the adapter was not loaded", async () => {
    const h = harness(null);

    await expect(
      h.context.setStoredSession({
        tokens: { accessToken: "access", refreshToken: "refresh" },
        tenantContext: { tenantId: "tenant" },
      }),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_UNAVAILABLE" });

    expect(h.nativeSession).toEqual({ accessToken: null, refreshToken: null, tenantId: null });
    expect(h.writes).toEqual([]);
  });
});
