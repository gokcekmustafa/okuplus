export const GUEST_DIAGNOSTIC_CREDENTIAL_KEY = "oku.guestDiagnostic.credential.v1";

const NATIVE_TRANSPORT_HEADER = "x-okupratik-guest-transport";
const NATIVE_TRANSPORT_VALUE = "secure-storage";
const NATIVE_TOKEN_HEADER = "x-okupratik-guest-token";
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const SESSION_START_PATH = "/guest/diagnostics";

function guestClientError(code, message) {
  return Object.assign(new Error(message), { code });
}

function isCredential(value) {
  return (
    typeof value?.token === "string" &&
    CREDENTIAL_PATTERN.test(value.token) &&
    typeof value?.csrfToken === "string" &&
    CREDENTIAL_PATTERN.test(value.csrfToken)
  );
}

/**
 * Keeps browser guest sessions on the existing HttpOnly-cookie transport.
 * Native WebViews use the app's secure-storage adapter because their bundled
 * origin and the production API are cross-site and cannot rely on cookies.
 */
export function createGuestDiagnosticClient({
  nativeMobileRuntime = false,
  secureStorage = null,
  fetcher = globalThis.fetch?.bind(globalThis),
  parseResponse,
  browserCsrfHeaders = () => ({}),
}) {
  if (typeof fetcher !== "function" || typeof parseResponse !== "function") {
    throw new TypeError("Guest diagnostic client dependencies are unavailable");
  }

  async function readNativeCredential() {
    if (
      typeof secureStorage?.getItem !== "function" ||
      typeof secureStorage?.setItem !== "function" ||
      typeof secureStorage?.remove !== "function"
    ) {
      throw guestClientError(
        "GUEST_SECURE_STORAGE_UNAVAILABLE",
        "Misafir tanı oturumu bu cihazda güvenli biçimde başlatılamadı.",
      );
    }
    let serialized;
    try {
      serialized = await secureStorage.getItem(GUEST_DIAGNOSTIC_CREDENTIAL_KEY);
    } catch {
      throw guestClientError(
        "GUEST_SECURE_STORAGE_UNAVAILABLE",
        "Misafir tanı oturumu bu cihazda güvenli biçimde açılamadı.",
      );
    }
    if (serialized === null) return null;
    try {
      const value = JSON.parse(serialized);
      if (isCredential(value)) return value;
    } catch {
      // A malformed native credential is rejected and cleared below.
    }
    try {
      await secureStorage.remove(GUEST_DIAGNOSTIC_CREDENTIAL_KEY);
    } catch {
      // Do not expose secure-storage errors or credential data to logs/UI.
    }
    throw guestClientError(
      "GUEST_CREDENTIAL_INVALID",
      "Misafir tanı oturumu geçersiz. Yeni bir tanı başlatabilirsin.",
    );
  }

  async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const headers = {
      ...(method === "POST" && options.body !== undefined && options.body !== null
        ? { "content-type": "application/json" }
        : {}),
      ...(method === "POST" && !nativeMobileRuntime ? browserCsrfHeaders() : {}),
      ...(options.headers || {}),
    };
    let credential = null;

    if (nativeMobileRuntime) {
      credential = await readNativeCredential();
      headers[NATIVE_TRANSPORT_HEADER] = NATIVE_TRANSPORT_VALUE;
      if (credential) {
        headers[NATIVE_TOKEN_HEADER] = credential.token;
        headers["x-csrf-token"] = credential.csrfToken;
      } else if (!(method === "POST" && path === SESSION_START_PATH)) {
        throw guestClientError(
          "GUEST_SESSION_UNAVAILABLE",
          "Tanı oturumu bulunamadı. Yeni bir tanı başlatabilirsin.",
        );
      }
    }

    const response = await fetcher(path, {
      ...options,
      credentials: nativeMobileRuntime ? "omit" : "include",
      headers,
    });
    const data = await parseResponse(response);

    if (nativeMobileRuntime && method === "POST" && path === SESSION_START_PATH) {
      if (data?.nativeCredential !== undefined) {
        if (!isCredential(data.nativeCredential)) {
          throw guestClientError(
            "GUEST_CREDENTIAL_INVALID",
            "Misafir tanı oturumu bu cihazda güvenli biçimde başlatılamadı.",
          );
        }
        try {
          await secureStorage.setItem(
            GUEST_DIAGNOSTIC_CREDENTIAL_KEY,
            JSON.stringify(data.nativeCredential),
          );
        } catch {
          throw guestClientError(
            "GUEST_SECURE_STORAGE_UNAVAILABLE",
            "Misafir tanı oturumu bu cihazda güvenli biçimde kaydedilemedi.",
          );
        }
        const publicData = { ...data };
        delete publicData.nativeCredential;
        return publicData;
      }
      if (!credential || data?.resumed !== true) {
        throw guestClientError(
          "GUEST_CREDENTIAL_MISSING",
          "Misafir tanı oturumu bu cihazda güvenli biçimde kaydedilemedi.",
        );
      }
    }

    return data;
  }

  async function clear() {
    if (nativeMobileRuntime && typeof secureStorage?.remove === "function") {
      try {
        await secureStorage.remove(GUEST_DIAGNOSTIC_CREDENTIAL_KEY);
      } catch {
        throw guestClientError(
          "GUEST_SECURE_STORAGE_UNAVAILABLE",
          "Misafir tanı oturumu bu cihazdan güvenli biçimde kaldırılamadı.",
        );
      }
    }
  }

  return Object.freeze({ request, clear });
}
