import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");

describe("Google login UI contract", () => {
  it("keeps password login and adds a real server-side Google redirect", () => {
    expect(index).toContain('id="login-form"');
    expect(index).toContain('id="google-login-btn"');
    expect(index).toContain("Google ile devam et");
    expect(app).toContain('window.location.assign("/auth/social/google/start")');
    expect(app).toContain('"Google ile giriş yapılıyor…"');
    expect(app).not.toContain("Web SDK bu dağıtımda başlatılmadı; sahte giriş yapılmadı.");
  });

  it("callback ile gelen cookie session'ı mevcut auth ve refresh katmanına bağlar", () => {
    expect(app).toContain("const me = await fetchMe(null, tenantId);");
    expect(app).toContain('"x-auth-transport": "cookie"');
    expect(app).toContain(
      "await refreshStoredTokens(initialTokens.refreshToken, initialTokens.tenantId)",
    );
    expect(app).toContain("await logout(refreshToken, tenantId);");
  });
});
