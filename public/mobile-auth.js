function secureStorageUnavailable() {
  return Object.assign(new Error("Native secure storage is unavailable"), {
    code: "SECURE_STORAGE_UNAVAILABLE",
  });
}

export function detectNativeMobileRuntime(runtimeConfig = {}, environment = globalThis) {
  return (
    runtimeConfig.nativeMobile === true ||
    environment?.Capacitor?.isNativePlatform?.() === true ||
    Boolean(environment?.androidBridge) ||
    Boolean(environment?.webkit?.messageHandlers?.bridge)
  );
}

export function detectNativeMobilePlatform(runtimeConfig = {}, environment = globalThis) {
  const platform = runtimeConfig.platform ?? environment?.Capacitor?.getPlatform?.();
  if (platform === "android" || platform === "ios") return platform;
  if (environment?.androidBridge) return "android";
  if (environment?.webkit?.messageHandlers?.bridge) return "ios";
  return runtimeConfig.nativeMobile === true ? "unknown" : "web";
}

/**
 * Accept the upstream package's public adapter. It owns the native method
 * mapping, key prefix, synchronization, and platform-specific storage options.
 */
export function createSecureStorageBridge(secureStorageAdapter) {
  if (
    !secureStorageAdapter ||
    typeof secureStorageAdapter.getItem !== "function" ||
    typeof secureStorageAdapter.setItem !== "function" ||
    typeof secureStorageAdapter.removeItem !== "function"
  ) {
    return null;
  }

  const validKey = (key) => {
    if (typeof key !== "string" || !key) throw secureStorageUnavailable();
    return key;
  };

  return Object.freeze({
    async getItem(key) {
      const result = await secureStorageAdapter.getItem(validKey(key));
      return typeof result === "string" ? result : null;
    },
    async setItem(key, value) {
      if (typeof value !== "string") throw secureStorageUnavailable();
      await secureStorageAdapter.setItem(validKey(key), value);
    },
    async remove(key) {
      await secureStorageAdapter.removeItem(validKey(key));
    },
  });
}

export function createOidcNonce(cryptoApi = globalThis.crypto, base64Encoder = globalThis.btoa) {
  if (typeof cryptoApi?.getRandomValues !== "function" || typeof base64Encoder !== "function") {
    throw Object.assign(new Error("Secure random generation is unavailable"), {
      code: "SECURE_RANDOM_UNAVAILABLE",
    });
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return base64Encoder(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export async function requestNativeGoogleCredential(plugin, clientId, nonce) {
  if (typeof plugin?.signIn !== "function") {
    throw Object.assign(new Error("Native Google sign-in is unavailable"), {
      code: "GOOGLE_NATIVE_UNAVAILABLE",
    });
  }
  if (typeof clientId !== "string" || !clientId || typeof nonce !== "string" || !nonce) {
    throw Object.assign(new Error("Google sign-in configuration is unavailable"), {
      code: "GOOGLE_CONFIGURATION_ERROR",
    });
  }

  const credential = await plugin.signIn({ clientId, nonce });
  if (typeof credential?.idToken !== "string" || !credential.idToken) {
    throw Object.assign(new Error("Google credential is invalid"), {
      code: "GOOGLE_INVALID_CREDENTIAL",
    });
  }
  return {
    idToken: credential.idToken,
    displayName: typeof credential.displayName === "string" ? credential.displayName : "",
  };
}
