import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  formatGoogleLoginError,
  formatLoginError,
  setupPasswordVisibilityToggle,
} from "../public/auth-ui.js";

const index = readFileSync("public/index.html", "utf8");

describe("login UI behavior", () => {
  it("shows the wrong-credentials message only for authentication rejection", () => {
    expect(formatLoginError({ status: 401, code: "UNAUTHORIZED" })).toContain(
      "E-posta veya şifre yanlış",
    );
    expect(formatLoginError(new TypeError("fetch failed"))).toContain("bağlanılamadı");
    expect(formatLoginError(new TypeError("fetch failed"))).not.toContain(
      "E-posta veya şifre yanlış",
    );
    expect(formatLoginError({ status: 404 })).toContain("Giriş hizmetine bağlanılamadı");
    expect(formatLoginError({ status: 503 })).toContain("geçici bir sorun");
    expect(formatLoginError({ status: 403 })).toContain("güvenlik doğrulamasından");
    expect(formatLoginError({ status: 429 })).toContain("Çok fazla giriş denemesi");
    expect(formatLoginError({ code: "SECURE_STORAGE_UNAVAILABLE" })).toContain(
      "güvenli biçimde kaydedilemedi",
    );
  });

  it("distinguishes native Google cancellation, configuration, verification, network and server failures", () => {
    expect(formatGoogleLoginError({ code: "GOOGLE_SIGN_IN_CANCELLED" })).toContain("iptal edildi");
    expect(formatGoogleLoginError({ code: "GOOGLE_CONFIGURATION_ERROR" })).toContain(
      "yapılandırılmamış",
    );
    expect(formatGoogleLoginError({ code: "GOOGLE_INVALID_CREDENTIAL" })).toContain(
      "doğrulanamadı",
    );
    expect(formatGoogleLoginError(new TypeError("fetch failed"))).toContain("bağlanılamadı");
    expect(formatGoogleLoginError({ status: 503 })).toContain("geçici bir sorun");
  });

  it("keeps the password hidden by default and toggles its accessible state", () => {
    const listeners = new Map<
      string,
      (event?: { pointerType?: string; preventDefault?: () => void }) => void
    >();
    const attributes = new Map<string, string>();
    const input = { type: "password" };
    const button = {
      textContent: "",
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      addEventListener: (
        name: string,
        listener: (event?: { pointerType?: string; preventDefault?: () => void }) => void,
      ) => listeners.set(name, listener),
    };

    setupPasswordVisibilityToggle(input, button);
    expect(input.type).toBe("password");
    expect(button.textContent).toBe("Göster");
    expect(attributes.get("aria-label")).toBe("Şifreyi göster");
    expect(attributes.get("aria-pressed")).toBe("false");

    const preventDefault = vi.fn();
    listeners.get("pointerdown")?.({ pointerType: "touch", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();

    listeners.get("click")?.();
    expect(input.type).toBe("text");
    expect(button.textContent).toBe("Gizle");
    expect(attributes.get("aria-label")).toBe("Şifreyi gizle");
    expect(attributes.get("aria-pressed")).toBe("true");

    listeners.get("click")?.();
    expect(input.type).toBe("password");
    expect(button.textContent).toBe("Göster");
    expect(attributes.get("aria-pressed")).toBe("false");
  });

  it("keeps password autofill and uses a non-submit accessible toggle", () => {
    expect(index).toMatch(/id="login-password"[\s\S]*?autocomplete="current-password"/u);
    expect(index).toContain('id="login-password-toggle"');
    expect(index).toContain('type="button"');
    expect(index).toContain('aria-label="Şifreyi göster"');
    expect(index).toContain('aria-controls="login-password"');
    expect(index).toContain('aria-pressed="false"');
  });
});
