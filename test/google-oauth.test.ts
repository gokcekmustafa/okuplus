import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { GoogleOAuthClient } from "../src/modules/auth/google-oauth.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const CALLBACK_URL = "https://www.okupratik.com/auth/social/google/callback";
const STATE_SECRET = "local-google-oauth-state-secret-that-is-long-enough";

function requestWithCookie(cookie: string): FastifyRequest {
  return { headers: { cookie } } as FastifyRequest;
}

function cookieValue(setCookie: string): string {
  return decodeURIComponent(setCookie.slice(setCookie.indexOf("=") + 1).split(";", 1)[0]!);
}

describe("Google web OAuth", () => {
  it("creates a signed state cookie and S256 PKCE authorization URL", () => {
    const client = new GoogleOAuthClient({
      clientId: "google-web-client.apps.googleusercontent.com",
      clientSecret: "google-client-secret-value",
      callbackUrl: CALLBACK_URL,
      stateSecret: STATE_SECRET,
    });

    const flow = client.begin();
    const url = new URL(flow.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-web-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(CALLBACK_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(flow.stateCookie).toContain("HttpOnly");
    expect(flow.stateCookie).toContain("SameSite=Lax");
    expect(flow.stateCookie).toContain("Secure");
  });

  it("exchanges a code only with the signed browser flow and keeps provider token server-side", async () => {
    let requestBody = "";
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id_token: "verified-google-id-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new GoogleOAuthClient({
      clientId: "google-web-client.apps.googleusercontent.com",
      clientSecret: "google-client-secret-value",
      callbackUrl: CALLBACK_URL,
      stateSecret: STATE_SECRET,
      fetchImpl,
    });
    const flow = client.begin();
    const state = new URL(flow.authorizationUrl).searchParams.get("state")!;
    const result = await client.exchangeCode(
      requestWithCookie(`__Host-oku_google_oauth=${cookieValue(flow.stateCookie)}`),
      "one-time-code",
      state,
    );

    expect(result.idToken).toBe("verified-google-id-token");
    expect(result.nonce).toBeTruthy();
    expect(requestBody).toContain("code=one-time-code");
    expect(requestBody).toContain("code_verifier=");
    expect(requestBody).toContain("client_secret=google-client-secret-value");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a missing or tampered state before contacting Google", async () => {
    const fetchImpl = vi.fn();
    const client = new GoogleOAuthClient({
      clientId: "google-web-client.apps.googleusercontent.com",
      clientSecret: "google-client-secret-value",
      callbackUrl: CALLBACK_URL,
      stateSecret: STATE_SECRET,
      fetchImpl,
    });
    const flow = client.begin();
    const state = new URL(flow.authorizationUrl).searchParams.get("state")!;

    await expect(
      client.exchangeCode(
        requestWithCookie(`__Host-oku_google_oauth=${cookieValue(flow.stateCookie)}-tampered`),
        "one-time-code",
        state,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exposes the configured route without touching the database", async () => {
    const app = await buildApp(
      loadEnv({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/oku_plus_test",
        GOOGLE_OIDC_CLIENT_IDS: "google-web-client.apps.googleusercontent.com",
        GOOGLE_OIDC_WEB_CLIENT_ID: "google-web-client.apps.googleusercontent.com",
        GOOGLE_OIDC_CLIENT_SECRET: "google-client-secret-value",
        GOOGLE_OIDC_CALLBACK_URL: CALLBACK_URL,
      }),
      {
        socialTokenVerifier: {
          isConfigured: (provider) => provider === "GOOGLE",
          verify: async () => {
            throw new Error("not used in this route test");
          },
        },
      },
    );
    await app.ready();

    const config = await app.inject({ method: "GET", url: "/auth/social/config" });
    const start = await app.inject({ method: "GET", url: "/auth/social/google/start" });

    expect(config.statusCode).toBe(200);
    expect(config.json().data.google.configured).toBe(true);
    expect(start.statusCode).toBe(302);
    expect(start.headers.location).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(start.headers["set-cookie"]).toBeTruthy();
    await app.close();
  });
});
