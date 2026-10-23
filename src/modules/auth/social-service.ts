import { Prisma, type AuthIdentityProvider } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError, conflictError, notFoundError } from "../../lib/errors.js";
import {
  PersonalContextLookupError,
  provisionPersonalContextInTransaction,
  type PersonalContextLookupDiagnosticCode,
} from "../tenant/personal-service.js";
import type { AuthProvider, AuthSession, SessionMetadata } from "./types.js";
import type { SocialTokenVerifier, VerifiedSocialIdentity } from "./social-verifier.js";

export interface SocialCredentialInput {
  idToken: string;
  nonce: string;
  displayName?: string | null;
}

export type SocialAuthResolutionPath =
  "existing_provider_identity" | "verified_email_match" | "new_user";

/** Generic client error plus fixed internal diagnostics; contains no account identifiers. */
export class SocialAuthProvisioningDiagnosticError extends ApiError {
  constructor(
    readonly diagnosticCode: PersonalContextLookupDiagnosticCode,
    readonly accountResolutionPath: SocialAuthResolutionPath,
  ) {
    const userUnavailable = diagnosticCode === "PERSONAL_CONTEXT_USER_UNAVAILABLE";
    super(
      userUnavailable ? "UNAUTHORIZED" : "SERVICE_UNAVAILABLE",
      "Sosyal giriş tamamlanamadı",
      userUnavailable ? 401 : 503,
    );
    this.name = "SocialAuthProvisioningDiagnosticError";
  }
}

export function withSocialAuthResolutionDiagnostic(
  error: unknown,
  accountResolutionPath: SocialAuthResolutionPath,
): unknown {
  return error instanceof PersonalContextLookupError
    ? new SocialAuthProvisioningDiagnosticError(error.diagnosticCode, accountResolutionPath)
    : error;
}

async function provisionSocialLoginContext(
  tx: Prisma.TransactionClient,
  userId: string,
  accountResolutionPath: SocialAuthResolutionPath,
) {
  try {
    return await provisionPersonalContextInTransaction(tx, userId);
  } catch (error) {
    throw withSocialAuthResolutionDiagnostic(error, accountResolutionPath);
  }
}

function safeDisplayName(input: SocialCredentialInput, identity: VerifiedSocialIdentity): string {
  const supplied = input.displayName?.trim();
  if (supplied) return supplied.slice(0, 120);
  if (identity.displayName) return identity.displayName.slice(0, 120);
  if (identity.email)
    return (identity.email.split("@")[0] || "OkuPratik Kullanıcısı").slice(0, 120);
  return "OkuPratik Kullanıcısı";
}

export class SocialAuthService {
  constructor(
    private readonly verifier: SocialTokenVerifier,
    private readonly authProvider: AuthProvider,
  ) {}

  providerConfigured(provider: AuthIdentityProvider): boolean {
    return this.verifier.isConfigured(provider);
  }

  async login(
    provider: AuthIdentityProvider,
    input: SocialCredentialInput,
    metadata: SessionMetadata,
  ): Promise<AuthSession> {
    const verified = await this.verifier.verify(provider, input.idToken, input.nonce);

    const existing = await prisma.authIdentity.findUnique({
      where: { provider_subject: { provider, subject: verified.subject } },
    });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.authIdentity.update({
          where: { id: existing.id },
          data: {
            providerEmail: verified.email,
            emailVerified: verified.emailVerified,
            isPrivateEmail: verified.isPrivateEmail,
            lastUsedAt: new Date(),
          },
        });
        await provisionSocialLoginContext(tx, existing.userId, "existing_provider_identity");
      });
      return this.authProvider.startSession(existing.userId, null, metadata);
    }

    if (verified.email) {
      const collision = await prisma.user.findUnique({ where: { email: verified.email } });
      if (collision) {
        if (provider === "GOOGLE" && verified.emailVerified) {
          try {
            await prisma.$transaction(async (tx) => {
              await provisionSocialLoginContext(tx, collision.id, "verified_email_match");
              await tx.authIdentity.create({
                data: {
                  userId: collision.id,
                  provider,
                  subject: verified.subject,
                  providerEmail: verified.email,
                  emailVerified: true,
                  isPrivateEmail: verified.isPrivateEmail,
                },
              });
            });
            return this.authProvider.startSession(collision.id, null, metadata);
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
              throw conflictError("Google kimliği başka bir hesaba bağlı");
            }
            throw error;
          }
        }
        throw conflictError(
          "Bu e-posta mevcut bir hesaba ait; doğrulanmış oturumla provider kimliğini bağlayın",
        );
      }
    }

    let userId: string;
    try {
      userId = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: verified.email,
            displayName: safeDisplayName(input, verified),
            status: "ACTIVE",
            emailVerifiedAt: verified.emailVerified && verified.email ? new Date() : null,
          },
          select: { id: true },
        });
        await provisionSocialLoginContext(tx, user.id, "new_user");
        await tx.authIdentity.create({
          data: {
            userId: user.id,
            provider,
            subject: verified.subject,
            providerEmail: verified.email,
            emailVerified: verified.emailVerified,
            isPrivateEmail: verified.isPrivateEmail,
          },
        });
        return user.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const racedIdentity = await prisma.authIdentity.findUnique({
          where: { provider_subject: { provider, subject: verified.subject } },
        });
        if (racedIdentity) {
          return this.authProvider.startSession(racedIdentity.userId, null, metadata);
        }
        throw conflictError("Provider kimliği veya e-posta zaten kullanımda");
      }
      throw error;
    }

    return this.authProvider.startSession(userId, null, metadata);
  }

  async link(
    userId: string,
    provider: AuthIdentityProvider,
    input: SocialCredentialInput,
  ): Promise<{ id: string; provider: AuthIdentityProvider; subject: string }> {
    const verified = await this.verifier.verify(provider, input.idToken, input.nonce);

    try {
      return await prisma.$transaction(async (tx) => {
        const subjectIdentity = await tx.authIdentity.findUnique({
          where: { provider_subject: { provider, subject: verified.subject } },
        });
        if (subjectIdentity && subjectIdentity.userId !== userId) {
          throw conflictError("Provider kimliği başka bir hesaba bağlı");
        }
        if (subjectIdentity) {
          const updated = await tx.authIdentity.update({
            where: { id: subjectIdentity.id },
            data: { lastUsedAt: new Date() },
          });
          return { id: updated.id, provider: updated.provider, subject: updated.subject };
        }

        const identity = await tx.authIdentity.create({
          data: {
            userId,
            provider,
            subject: verified.subject,
            providerEmail: verified.email,
            emailVerified: verified.emailVerified,
            isPrivateEmail: verified.isPrivateEmail,
          },
        });
        return { id: identity.id, provider: identity.provider, subject: identity.subject };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflictError("Bu provider kullanıcı hesabına zaten bağlı");
      }
      throw error;
    }
  }

  async unlink(userId: string, provider: AuthIdentityProvider): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, authIdentities: { select: { id: true, provider: true } } },
      });
      if (!user) throw notFoundError("Kullanıcı bulunamadı");
      const target = user.authIdentities.find((identity) => identity.provider === provider);
      if (!target) throw notFoundError("Bağlı provider kimliği bulunamadı");
      if (!user.passwordHash && user.authIdentities.length <= 1) {
        throw conflictError("Hesabın son giriş yöntemi kaldırılamaz");
      }
      await tx.authIdentity.delete({ where: { id: target.id } });
    });
  }
}
