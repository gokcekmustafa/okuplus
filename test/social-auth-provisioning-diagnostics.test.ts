import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { safeGoogleOAuthDiagnostic } from "../src/modules/auth/google-oauth.js";
import { withSocialAuthResolutionDiagnostic } from "../src/modules/auth/social-service.js";
import { provisionPersonalContextInTransaction } from "../src/modules/tenant/personal-service.js";

function transactionWithUserLookup(
  findFirst: () => Promise<{ id: string } | null>,
): Prisma.TransactionClient {
  return {
    $queryRaw: async () => [{ acquired: 1 }],
    user: { findFirst },
  } as unknown as Prisma.TransactionClient;
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected personal-context lookup to fail");
}

describe("social auth personal-context diagnostics", () => {
  it("marks an empty active-user lookup with a safe resolution path", async () => {
    const failure = await captureFailure(
      provisionPersonalContextInTransaction(
        transactionWithUserLookup(async () => null),
        "private-user-id",
      ),
    );
    const diagnosticError = withSocialAuthResolutionDiagnostic(failure, "verified_email_match");

    expect(diagnosticError).toMatchObject({
      name: "SocialAuthProvisioningDiagnosticError",
      code: "UNAUTHORIZED",
      statusCode: 401,
      message: "Sosyal giriş tamamlanamadı",
    });
    expect(safeGoogleOAuthDiagnostic(diagnosticError, "unused", true)).toEqual({
      stage: "social_auth_service",
      errorClass: "SocialAuthProvisioningDiagnosticError",
      errorCode: "PERSONAL_CONTEXT_USER_UNAVAILABLE",
      accountResolutionPath: "verified_email_match",
      idTokenReceived: true,
    });
    expect(JSON.stringify(diagnosticError)).not.toContain("private-user-id");
  });

  it("classifies a thrown database lookup separately and never exposes its message", async () => {
    const failure = await captureFailure(
      provisionPersonalContextInTransaction(
        transactionWithUserLookup(async () => {
          throw new Error("postgres://secret-user:secret-password@host/db");
        }),
        "private-user-id",
      ),
    );
    const diagnosticError = withSocialAuthResolutionDiagnostic(
      failure,
      "existing_provider_identity",
    );
    const diagnostic = safeGoogleOAuthDiagnostic(diagnosticError, "unused", true);

    expect(diagnostic).toEqual({
      stage: "social_auth_service",
      errorClass: "SocialAuthProvisioningDiagnosticError",
      errorCode: "PERSONAL_CONTEXT_USER_LOOKUP_FAILED",
      accountResolutionPath: "existing_provider_identity",
      idTokenReceived: true,
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
    expect(diagnosticError).toMatchObject({ code: "SERVICE_UNAVAILABLE", statusCode: 503 });
  });
});
