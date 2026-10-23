import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { timingSafeEqual } from "node:crypto";
import type { AuthIdentityProvider } from "@prisma/client";
import { ApiError, serviceUnavailableError } from "../../lib/errors.js";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const APPLE_ISSUER = "https://appleid.apple.com";

export interface VerifiedSocialIdentity {
  provider: AuthIdentityProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
  displayName: string | null;
}

export interface SocialTokenVerifier {
  verify(
    provider: AuthIdentityProvider,
    idToken: string,
    expectedNonce: string,
  ): Promise<VerifiedSocialIdentity>;
  isConfigured(provider: AuthIdentityProvider): boolean;
}

export interface OidcSocialTokenVerifierOptions {
  googleAudiences: string[];
  appleAudiences: string[];
  googleKey?: JWTVerifyGetKey;
  appleKey?: JWTVerifyGetKey;
}

export class SocialTokenVerificationError extends ApiError {
  constructor(readonly diagnosticCode: string) {
    super("UNAUTHORIZED", "Provider tokenı geçersiz", 401);
    this.name = "SocialTokenVerificationError";
  }
}

function safeJoseDiagnosticCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "TOKEN_INVALID";
  }

  const code = (error as { code?: unknown }).code;
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") return "TOKEN_SIGNATURE_INVALID";
  if (code === "ERR_JWKS_NO_MATCHING_KEY") return "SIGNING_KEY_NOT_FOUND";
  if (code === "ERR_JWKS_FETCH_FAILED" || code === "ERR_JWKS_TIMEOUT") {
    return "SIGNING_KEYS_UNAVAILABLE";
  }
  if (code === "ERR_JWT_EXPIRED") return "TOKEN_EXPIRED";
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && "claim" in error) {
    const claim = (error as { claim?: unknown }).claim;
    if (claim === "aud") return "TOKEN_AUDIENCE_INVALID";
    if (claim === "iss") return "TOKEN_ISSUER_INVALID";
    if (claim === "exp") return "TOKEN_EXPIRED";
    if (claim === "nbf" || claim === "iat") return "TOKEN_NOT_YET_VALID";
    if (claim === "nonce") return "TOKEN_NONCE_MISSING";
  }
  return "TOKEN_INVALID";
}

function booleanClaim(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizedEmail(payload: JWTPayload): string | null {
  return typeof payload.email === "string" && payload.email.trim()
    ? payload.email.trim().toLowerCase()
    : null;
}

function nonceMatches(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string" || !actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Google ve Apple ID tokenlarını resmi JWKS uçlarıyla yerel olarak doğrular.
 * Tokeninfo/introspection çağrısı yapılmaz ve provider tokenı saklanmaz.
 */
export class OidcSocialTokenVerifier implements SocialTokenVerifier {
  private readonly googleKey: JWTVerifyGetKey;
  private readonly appleKey: JWTVerifyGetKey;

  constructor(private readonly options: OidcSocialTokenVerifierOptions) {
    this.googleKey =
      options.googleKey ??
      createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    this.appleKey =
      options.appleKey ?? createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  }

  isConfigured(provider: AuthIdentityProvider): boolean {
    return this.audiences(provider).length > 0;
  }

  async verify(
    provider: AuthIdentityProvider,
    idToken: string,
    expectedNonce: string,
  ): Promise<VerifiedSocialIdentity> {
    const audiences = this.audiences(provider);
    if (audiences.length === 0) {
      throw serviceUnavailableError(`${provider} giriş yapılandırması eksik`);
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(
        idToken,
        provider === "GOOGLE" ? this.googleKey : this.appleKey,
        {
          algorithms: ["RS256"],
          issuer: provider === "GOOGLE" ? GOOGLE_ISSUERS : APPLE_ISSUER,
          audience: audiences,
          requiredClaims: ["sub", "iat", "exp", "nonce"],
        },
      );
      payload = verified.payload;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "SERVICE_UNAVAILABLE"
      ) {
        throw error;
      }
      throw new SocialTokenVerificationError(safeJoseDiagnosticCode(error));
    }

    if (!payload.sub) {
      throw new SocialTokenVerificationError("TOKEN_SUBJECT_INVALID");
    }
    if (!nonceMatches(payload.nonce, expectedNonce)) {
      throw new SocialTokenVerificationError("TOKEN_NONCE_MISMATCH");
    }

    const email = normalizedEmail(payload);
    const emailVerified = booleanClaim(payload.email_verified);
    const displayName =
      typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;

    return {
      provider,
      subject: payload.sub,
      email,
      emailVerified,
      isPrivateEmail:
        provider === "APPLE" &&
        (booleanClaim(payload.is_private_email) ||
          Boolean(email?.endsWith("@privaterelay.appleid.com"))),
      displayName,
    };
  }

  private audiences(provider: AuthIdentityProvider): string[] {
    return provider === "GOOGLE" ? this.options.googleAudiences : this.options.appleAudiences;
  }
}

export function parseAudienceList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
