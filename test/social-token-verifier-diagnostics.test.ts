import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type KeyLike } from "jose";
import {
  OidcSocialTokenVerifier,
  SocialTokenVerificationError,
} from "../src/modules/auth/social-verifier.js";
import { safeGoogleOAuthDiagnostic } from "../src/modules/auth/google-oauth.js";

const AUDIENCE = "oku-google-diagnostic-test";
const NONCE = "oauth-diagnostic-test-nonce";

describe("Google ID token safe diagnostics", () => {
  async function createVerifierAndToken(
    overrides: {
      audience?: string;
      issuer?: string;
      nonce?: string;
    } = {},
  ) {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "diagnostic-test-key";
    jwk.alg = "RS256";
    const verifier = new OidcSocialTokenVerifier({
      googleAudiences: [AUDIENCE],
      appleAudiences: [],
      googleKey: createLocalJWKSet({ keys: [jwk] }),
    });
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ nonce: overrides.nonce ?? NONCE })
      .setProtectedHeader({ alg: "RS256", kid: "diagnostic-test-key" })
      .setIssuer(overrides.issuer ?? "https://accounts.google.com")
      .setAudience(overrides.audience ?? AUDIENCE)
      .setSubject("diagnostic-test-subject")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey as KeyLike);
    return { verifier, idToken };
  }

  it.each([
    ["audience", { audience: "wrong-audience" }, "TOKEN_AUDIENCE_INVALID"],
    ["issuer", { issuer: "https://wrong.example" }, "TOKEN_ISSUER_INVALID"],
    ["nonce", { nonce: "wrong-nonce" }, "TOKEN_NONCE_MISMATCH"],
  ] as const)(
    "classifies an invalid %s without exposing token claims",
    async (_label, options, code) => {
      const { verifier, idToken } = await createVerifierAndToken(options);
      let failure: unknown;
      try {
        await verifier.verify("GOOGLE", idToken, NONCE);
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(SocialTokenVerificationError);
      expect(safeGoogleOAuthDiagnostic(failure, "unused", true)).toEqual({
        stage: "id_token_verification",
        errorClass: "SocialTokenVerificationError",
        errorCode: code,
        idTokenReceived: true,
      });
    },
  );
});
