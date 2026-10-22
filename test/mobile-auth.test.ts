import { describe, expect, it, vi } from "vitest";
import {
  createOidcNonce,
  createSecureStorageBridge,
  requestNativeGoogleCredential,
} from "../public/mobile-auth.js";

describe("native mobile authentication bridge", () => {
  it("maps secure session operations to the plugin's native methods and default prefix", async () => {
    const values = new Map<string, string>();
    const nativePlugin = {
      internalGetItem: vi.fn(async ({ prefixedKey }: { prefixedKey: string }) => ({
        data: values.get(prefixedKey) ?? null,
      })),
      internalSetItem: vi.fn(
        async ({ prefixedKey, data }: { prefixedKey: string; data: string }) => {
          values.set(prefixedKey, data);
        },
      ),
      internalRemoveItem: vi.fn(async ({ prefixedKey }: { prefixedKey: string }) => {
        values.delete(prefixedKey);
        return { success: true };
      }),
    };
    const storage = createSecureStorageBridge(nativePlugin);
    expect(storage).not.toBeNull();

    await storage!.setItem("oku.session.v1", "session-json");
    expect(nativePlugin.internalSetItem).toHaveBeenCalledWith({
      prefixedKey: "capacitor-storage_oku.session.v1",
      data: "session-json",
      sync: false,
      access: 0,
    });
    await expect(storage!.getItem("oku.session.v1")).resolves.toBe("session-json");
    await storage!.remove("oku.session.v1");
    await expect(storage!.getItem("oku.session.v1")).resolves.toBeNull();
  });

  it("fails closed when native secure-storage methods are missing", async () => {
    expect(createSecureStorageBridge(null)).toBeNull();
    const bridge = createSecureStorageBridge({ internalSetItem: vi.fn() });
    expect(bridge).toBeNull();
  });

  it("propagates native write failures without substituting browser storage", async () => {
    const nativeFailure = Object.assign(new Error("native storage failure"), { code: "osError" });
    const nativePlugin = {
      internalGetItem: vi.fn(),
      internalSetItem: vi.fn().mockRejectedValue(nativeFailure),
      internalRemoveItem: vi.fn(),
    };
    const storage = createSecureStorageBridge(nativePlugin);

    await expect(storage!.setItem("oku.session.v1", "session-json")).rejects.toMatchObject({
      code: "osError",
    });
    expect(nativePlugin.internalSetItem).toHaveBeenCalledOnce();
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
