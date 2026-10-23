import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGoogleLoginDiagnostic, formatGoogleLoginError } from "../public/auth-ui.js";

const app = readFileSync("public/app.js", "utf8");
const index = readFileSync("public/index.html", "utf8");
const authApp = readFileSync("src/app.ts", "utf8");
const authRoutes = readFileSync("src/modules/auth/routes.ts", "utf8");

describe("Google login UI contract", () => {
  it("keeps password login and adds a real server-side Google redirect", () => {
    expect(index).toContain('id="login-form"');
    expect(index).toContain('id="google-login-btn"');
    expect(index).toContain("Google ile devam et");
    expect(app).toContain(
      'new URL("/auth/social/google/start", configuredApiBaseUrl || location.origin)',
    );
    expect(app).toContain("nativeMobileRuntime");
    expect(app).toContain('"Google ile giriş yapılıyor…"');
    expect(app).not.toContain("Web SDK bu dağıtımda başlatılmadı; sahte giriş yapılmadı.");
  });

  it("uses Android Credential Manager credentials with a fresh nonce and backend verification", () => {
    expect(app).toContain("requestNativeGoogleCredential(");
    expect(app).toContain("const nonce = createOidcNonce();");
    expect(app).toContain("await completeSocialLogin(");
    expect(app).toMatch(
      /await completeSocialLogin\(\s*"google",\s*credential\.idToken,\s*nonce,\s*credential\.displayName,/u,
    );
    expect(app).toContain("googleSocialConfig?.clientId");
    expect(app).toContain("formatGoogleLoginError(error)");
    expect(app).toContain('$("google-login-btn").addEventListener("click", startGoogleLogin)');
    expect(app).toContain('phase = "CREDENTIAL_MANAGER"');
    expect(app).toContain("phase = nextPhase;");
    expect(app).toContain('console.warn("Google giriş tanılaması", diagnostic)');
    expect(app).not.toContain('console.warn("Google giriş tanılaması", error');
    expect(authRoutes).toContain("googleOAuthClient.publicClientId()");
    expect(authApp).toContain(
      '[env.GOOGLE_OIDC_CLIENT_IDS, env.GOOGLE_OIDC_WEB_CLIENT_ID].filter(Boolean).join(",")',
    );
  });

  it("identifies the failing login stage without exposing exception messages or credentials", () => {
    const diagnostic = createGoogleLoginDiagnostic(
      "CREDENTIAL_MANAGER",
      Object.assign(new Error("id-token private-nonce password"), {
        code: "GOOGLE_PROVIDER_CONFIGURATION",
        status: 403,
        requestId: "req-abc_123",
        idToken: "id-token-secret",
      }),
    );

    expect(diagnostic).toEqual({
      phase: "CREDENTIAL_MANAGER",
      code: "GOOGLE_PROVIDER_CONFIGURATION",
      status: 403,
      requestId: "req-abc_123",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/id-token|private-nonce|password/u);
    expect(
      createGoogleLoginDiagnostic("unexpected-phase", {
        code: "message with token",
        status: 700,
        requestId: "contains spaces",
      }),
    ).toEqual({ phase: "UNKNOWN", code: null, status: null, requestId: null });
    expect(formatGoogleLoginError(new TypeError("fetch failed"))).toContain("bağlanılamadı");
    expect(formatGoogleLoginError({ status: 401 })).toContain("Google hesabı doğrulanamadı");
    expect(formatGoogleLoginError({ status: 401 })).not.toContain("E-posta veya şifre");
  });

  it("does not show the student screen until server exchange and Secure Storage both succeed", () => {
    const start = app.indexOf("async function completeSocialLogin(");
    const end = app.indexOf("// Provider SDK callback", start);
    const completion = app.slice(start, end);

    expect(completion.indexOf('onPhase("SERVER_EXCHANGE")')).toBeLessThan(
      completion.indexOf("await socialLogin("),
    );
    expect(completion.indexOf("await socialLogin(")).toBeLessThan(
      completion.indexOf('onPhase("SECURE_STORAGE_WRITE")'),
    );
    expect(completion.indexOf('onPhase("SECURE_STORAGE_WRITE")')).toBeLessThan(
      completion.indexOf("await setStoredSession(session)"),
    );
    expect(completion.indexOf("await setStoredSession(session)")).toBeLessThan(
      completion.indexOf("showDashboard(session)"),
    );
    expect(completion).toContain('onPhase("STUDENT_SCREEN")');
    expect(completion).toContain("await setStoredSession(session)");
    expect(app).toContain("status.dataset.googleLoginDiagnostic = JSON.stringify(diagnostic)");
    expect(app).toContain("formatGoogleLoginError(error)");
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
