import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serviceUnavailableError, unauthorizedError } from "../../lib/errors.js";
import { GOOGLE_OAUTH_STATE_COOKIE_NAME, googleOAuthStateCookie, getCookie } from "./cookies.js";
import type { FastifyRequest } from "fastify";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const STATE_TTL_SECONDS = 600;
const GOOGLE_ERROR_REDIRECT_REASON = "google-error";

type GoogleOAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

type GoogleTokenResponse = {
  id_token?: unknown;
};

export interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  stateSecret: string;
  fetchImpl?: typeof fetch;
}

export class GoogleOAuthClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GoogleOAuthOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(
      this.options.clientId &&
      this.options.clientSecret &&
      this.options.callbackUrl &&
      this.options.stateSecret,
    );
  }

  begin(): { authorizationUrl: string; stateCookie: string } {
    this.assertConfigured();
    const state = this.randomValue();
    const nonce = this.randomValue();
    const codeVerifier = this.randomValue();
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const expiresAt = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
    const stateCookieValue = this.signState({ state, nonce, codeVerifier, expiresAt });
    const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    authorizationUrl.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
    }).toString();

    return {
      authorizationUrl: authorizationUrl.toString(),
      stateCookie: googleOAuthStateCookie(stateCookieValue, STATE_TTL_SECONDS),
    };
  }

  async exchangeCode(
    request: FastifyRequest,
    code: string,
    state: string,
  ): Promise<{ idToken: string; nonce: string }> {
    this.assertConfigured();
    const stateCookie = getCookie(request, GOOGLE_OAUTH_STATE_COOKIE_NAME);
    const flow = this.verifyState(stateCookie, state);
    const response = await this.fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: this.options.callbackUrl,
        grant_type: "authorization_code",
        code_verifier: flow.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    let payload: GoogleTokenResponse;
    try {
      payload = (await response.json()) as GoogleTokenResponse;
    } catch {
      throw serviceUnavailableError("Google ile giriş geçici olarak kullanılamıyor");
    }
    if (!response.ok || typeof payload.id_token !== "string" || !payload.id_token) {
      throw serviceUnavailableError("Google ile giriş geçici olarak kullanılamıyor");
    }
    return { idToken: payload.id_token, nonce: flow.nonce };
  }

  successRedirect(): string {
    return this.redirectUrl("google-success");
  }

  errorRedirect(): string {
    return this.redirectUrl(GOOGLE_ERROR_REDIRECT_REASON);
  }

  private redirectUrl(reason: string): string {
    const url = new URL(this.options.callbackUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    url.searchParams.set("auth", reason);
    return url.toString();
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw serviceUnavailableError("Google giriş yapılandırması eksik");
    }
  }

  private randomValue(): string {
    return randomBytes(32).toString("base64url");
  }

  private signState(state: GoogleOAuthState): string {
    const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
    const signature = createHmac("sha256", this.options.stateSecret)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  private verifyState(cookie: string | undefined, state: string): GoogleOAuthState {
    if (!cookie || !state) throw unauthorizedError("Google giriş oturumu geçersiz");
    const [payload, signature, ...extra] = cookie.split(".");
    if (!payload || !signature || extra.length > 0) {
      throw unauthorizedError("Google giriş oturumu geçersiz");
    }

    const expected = createHmac("sha256", this.options.stateSecret)
      .update(payload)
      .digest("base64url");
    const actualBytes = Buffer.from(signature, "utf8");
    const expectedBytes = Buffer.from(expected, "utf8");
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw unauthorizedError("Google giriş oturumu geçersiz");
    }

    let parsed: GoogleOAuthState;
    try {
      parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthState;
    } catch {
      throw unauthorizedError("Google giriş oturumu geçersiz");
    }
    if (
      parsed.state !== state ||
      !parsed.nonce ||
      !parsed.codeVerifier ||
      !Number.isInteger(parsed.expiresAt) ||
      parsed.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      throw unauthorizedError("Google giriş oturumu geçersiz");
    }
    return parsed;
  }
}
