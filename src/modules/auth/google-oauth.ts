import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serviceUnavailableError, unauthorizedError } from "../../lib/errors.js";
import { GOOGLE_OAUTH_STATE_COOKIE_NAME, googleOAuthStateCookie, getCookie } from "./cookies.js";
import type { FastifyRequest } from "fastify";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const STATE_TTL_SECONDS = 600;
const GOOGLE_ERROR_REDIRECT_REASON = "google-error";
const SAFE_GOOGLE_PROVIDER_ERRORS = new Set([
  "access_denied",
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
  "unauthorized_client",
  "unsupported_grant_type",
]);

type GoogleOAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

type GoogleTokenResponse = {
  id_token?: unknown;
  error?: unknown;
};

export interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  stateSecret: string;
  fetchImpl?: typeof fetch;
}

export type GoogleOAuthFailureStage = "configuration" | "state_validation" | "token_exchange";

export class GoogleOAuthDiagnosticError extends Error {
  constructor(
    readonly stage: GoogleOAuthFailureStage,
    readonly diagnosticCode: string,
    readonly upstreamStatus?: number,
    readonly providerErrorCode?: string,
  ) {
    super("Google OAuth flow failed");
    this.name = "GoogleOAuthDiagnosticError";
  }
}

const SAFE_API_ERROR_CODES = new Set([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
const SAFE_GOOGLE_OAUTH_ERROR_CODES = new Set([
  "OAUTH_CONFIGURATION_MISSING",
  "STATE_COOKIE_INVALID",
  "TOKEN_ENDPOINT_TIMEOUT",
  "TOKEN_ENDPOINT_UNREACHABLE",
  "TOKEN_RESPONSE_INVALID",
  "TOKEN_ENDPOINT_REJECTED",
  "ID_TOKEN_MISSING",
]);
const SAFE_SOCIAL_TOKEN_CODES = new Set([
  "TOKEN_AUDIENCE_INVALID",
  "TOKEN_ISSUER_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_NOT_YET_VALID",
  "TOKEN_NONCE_MISSING",
  "TOKEN_SUBJECT_INVALID",
  "TOKEN_NONCE_MISMATCH",
  "TOKEN_SIGNATURE_INVALID",
  "SIGNING_KEY_NOT_FOUND",
  "SIGNING_KEYS_UNAVAILABLE",
  "TOKEN_INVALID",
]);

/** Returns only fixed diagnostic labels; never returns an exception message or cause. */
export function safeGoogleOAuthDiagnostic(
  error: unknown,
  fallbackStage: string,
  idTokenReceived: boolean,
): {
  stage: string;
  errorClass: string;
  errorCode: string;
  upstreamStatus?: number;
  providerErrorCode?: string;
  idTokenReceived: boolean;
} {
  if (error instanceof GoogleOAuthDiagnosticError) {
    return {
      stage:
        error.stage === "configuration" ||
        error.stage === "state_validation" ||
        error.stage === "token_exchange"
          ? error.stage
          : "oauth_flow",
      errorClass: "GoogleOAuthDiagnosticError",
      errorCode: SAFE_GOOGLE_OAUTH_ERROR_CODES.has(error.diagnosticCode)
        ? error.diagnosticCode
        : "OAUTH_FLOW_FAILED",
      ...(Number.isInteger(error.upstreamStatus) &&
      error.upstreamStatus! >= 400 &&
      error.upstreamStatus! <= 599
        ? { upstreamStatus: error.upstreamStatus }
        : {}),
      ...(error.providerErrorCode && SAFE_GOOGLE_PROVIDER_ERRORS.has(error.providerErrorCode)
        ? { providerErrorCode: error.providerErrorCode }
        : {}),
      idTokenReceived,
    };
  }

  if (error instanceof Error && error.name === "SocialTokenVerificationError") {
    const candidate =
      typeof error === "object" && "diagnosticCode" in error
        ? (error as { diagnosticCode?: unknown }).diagnosticCode
        : undefined;
    return {
      stage: "id_token_verification",
      errorClass: "SocialTokenVerificationError",
      errorCode:
        typeof candidate === "string" && SAFE_SOCIAL_TOKEN_CODES.has(candidate)
          ? candidate
          : "TOKEN_INVALID",
      idTokenReceived,
    };
  }

  const apiError =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown })
      : undefined;
  const errorCode =
    typeof apiError?.code === "string" && SAFE_API_ERROR_CODES.has(apiError.code)
      ? apiError.code
      : "UNCLASSIFIED";
  const errorClass =
    error instanceof Error && error.name === "ApiError"
      ? "ApiError"
      : error instanceof Error && error.name === "TimeoutError"
        ? "TimeoutError"
        : error instanceof Error && error.name === "TypeError"
          ? "TypeError"
          : "UnknownError";

  return { stage: fallbackStage, errorClass, errorCode, idTokenReceived };
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

  /** OAuth client IDs are public identifiers used by native sign-in clients. */
  publicClientId(): string {
    return this.options.clientId;
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
    try {
      this.assertConfigured();
    } catch {
      throw new GoogleOAuthDiagnosticError("configuration", "OAUTH_CONFIGURATION_MISSING");
    }
    const stateCookie = getCookie(request, GOOGLE_OAUTH_STATE_COOKIE_NAME);
    let flow: GoogleOAuthState;
    try {
      flow = this.verifyState(stateCookie, state);
    } catch {
      throw new GoogleOAuthDiagnosticError("state_validation", "STATE_COOKIE_INVALID");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
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
    } catch (error) {
      throw new GoogleOAuthDiagnosticError(
        "token_exchange",
        error instanceof Error && error.name === "TimeoutError"
          ? "TOKEN_ENDPOINT_TIMEOUT"
          : "TOKEN_ENDPOINT_UNREACHABLE",
      );
    }

    let payload: GoogleTokenResponse;
    try {
      payload = (await response.json()) as GoogleTokenResponse;
    } catch {
      if (!response.ok) {
        throw new GoogleOAuthDiagnosticError(
          "token_exchange",
          "TOKEN_ENDPOINT_REJECTED",
          response.status,
        );
      }
      throw new GoogleOAuthDiagnosticError("token_exchange", "TOKEN_RESPONSE_INVALID");
    }
    if (!response.ok) {
      throw new GoogleOAuthDiagnosticError(
        "token_exchange",
        "TOKEN_ENDPOINT_REJECTED",
        response.status,
        typeof payload.error === "string" && SAFE_GOOGLE_PROVIDER_ERRORS.has(payload.error)
          ? payload.error
          : undefined,
      );
    }
    if (typeof payload.id_token !== "string" || !payload.id_token) {
      throw new GoogleOAuthDiagnosticError("token_exchange", "ID_TOKEN_MISSING");
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
