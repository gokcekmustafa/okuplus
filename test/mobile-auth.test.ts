import { describe, expect, it, vi } from "vitest";
import {
  createOidcNonce,
  createSecureStorageBridge,
  detectNativeMobilePlatform,
  detectNativeMobileRuntime,
  requestNativeGoogleCredential,
} from "../public/mobile-auth.js";

describe("native mobile authentication bridge", () => {
  it("recognizes native bridges even if Capacitor core has not finished initializing", () => {
    expect(detectNativeMobileRuntime({}, { androidBridge: {} })).toBe(true);
    expect(detectNativeMobilePlatform({}, { androidBridge: {} })).toBe("android");
    expect(detectNativeMobileRuntime({}, { webkit: { messageHandlers: { bridge: {} } } })).toBe(
      true,
    );
    expect(detectNativeMobilePlatform({}, { webkit: { messageHandlers: { bridge: {} } } })).toBe(
      "ios",
    );
    expect(detectNativeMobileRuntime({}, {})).toBe(false);
    expect(detectNativeMobilePlatform({}, {})).toBe("web");
  });

  it("uses the upstream SecureStorage adapter for native session operations", async () => {
    const values = new Map<string, string>();
    const nativePlugin = {
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        values.delete(key);
      }),
    };
    const storage = createSecureStorageBridge(nativePlugin);
    expect(storage).not.toBeNull();

    await storage!.setItem("oku.session.v1", "session-json");
    expect(nativePlugin.setItem).toHaveBeenCalledWith("oku.session.v1", "session-json");
    await expect(storage!.getItem("oku.session.v1")).resolves.toBe("session-json");
    await storage!.remove("oku.session.v1");
    await expect(storage!.getItem("oku.session.v1")).resolves.toBeNull();
    expect(nativePlugin.getItem).toHaveBeenCalledWith("oku.session.v1");
    expect(nativePlugin.removeItem).toHaveBeenCalledWith("oku.session.v1");
  });

  it("fails closed when native secure-storage methods are missing", async () => {
    expect(createSecureStorageBridge(null)).toBeNull();
    const bridge = createSecureStorageBridge({ setItem: vi.fn() });
    expect(bridge).toBeNull();
  });

  it("propagates native write failures without substituting browser storage", async () => {
    const nativeFailure = Object.assign(new Error("native storage failure"), { code: "osError" });
    const nativePlugin = {
      getItem: vi.fn(),
      setItem: vi.fn().mockRejectedValue(nativeFailure),
      removeItem: vi.fn(),
    };
    const storage = createSecureStorageBridge(nativePlugin);

    await expect(storage!.setItem("oku.session.v1", "session-json")).rejects.toMatchObject({
      code: "osError",
    });
    expect(nativePlugin.setItem).toHaveBeenCalledOnce();
  });

  it("creates a cryptographically random URL-safe OIDC nonce", () => {
    const cryptoApi = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(7);
        return bytes;
      },
    };
    const nonce = createOidcNonce(cryptoApi, (value) => btoa(value));
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(nonce).not.toContain("+");
    expect(nonce).not.toContain("/");
    expect(nonce).not.toContain("=");
  });

  it("passes the server client ID and nonce to Android Credential Manager without logging tokens", async () => {
    const plugin = {
      signIn: vi.fn(async () => ({ idToken: "opaque-id-token", displayName: "Öğrenci" })),
    };
    await expect(
      requestNativeGoogleCredential(
        plugin,
        "public-web-client.apps.googleusercontent.com",
        "cryptographic-nonce",
      ),
    ).resolves.toEqual({ idToken: "opaque-id-token", displayName: "Öğrenci" });
    expect(plugin.signIn).toHaveBeenCalledWith({
      clientId: "public-web-client.apps.googleusercontent.com",
      nonce: "cryptographic-nonce",
    });
  });

  it("preserves native cancellation and separates Google errors from credential errors", async () => {
    const cancelled = Object.assign(new Error("cancelled"), {
      code: "GOOGLE_SIGN_IN_CANCELLED",
    });
    await expect(
      requestNativeGoogleCredential(
        { signIn: vi.fn().mockRejectedValue(cancelled) },
        "client",
        "nonce",
      ),
    ).rejects.toMatchObject({ code: "GOOGLE_SIGN_IN_CANCELLED" });
  });
});
