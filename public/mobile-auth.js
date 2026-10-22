const SECURE_STORAGE_PREFIX = "capacitor-storage_";

function secureStorageUnavailable() {
  return Object.assign(new Error("Native secure storage is unavailable"), {
    code: "SECURE_STORAGE_UNAVAILABLE",
  });
}

/**
 * The upstream SecureStorage package maps its public methods to these native
 * methods. Capacitor's bare registerPlugin proxy does not include that mapper.
 */
export function createSecureStorageBridge(nativePlugin) {
  if (
    !nativePlugin ||
    typeof nativePlugin.internalGetItem !== "function" ||
    typeof nativePlugin.internalSetItem !== "function" ||
    typeof nativePlugin.internalRemoveItem !== "function"
  ) {
    return null;
  }

  const prefixedKey = (key) => {
    if (typeof key !== "string" || !key) throw secureStorageUnavailable();
    return SECURE_STORAGE_PREFIX + key;
  };

  return Object.freeze({
    async getItem(key) {
      const result = await nativePlugin.internalGetItem({
        prefixedKey: prefixedKey(key),
        sync: false,
      });
      return typeof result?.data === "string" ? result.data : null;
    },
    async setItem(key, value) {
      if (typeof value !== "string") throw secureStorageUnavailable();
      await nativePlugin.internalSetItem({
        prefixedKey: prefixedKey(key),
        data: value,
        sync: false,
        access: 0,
      });
    },
    async remove(key) {
      await nativePlugin.internalRemoveItem({
        prefixedKey: prefixedKey(key),
        sync: false,
      });
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
