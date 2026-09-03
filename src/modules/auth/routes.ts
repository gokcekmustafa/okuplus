import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type {
  AuthProvider,
  LoginCredentials,
  SessionMetadata,
  SignupInput,
  SocialCredentialInput,
} from "./index.js";
import { signupPersonalAccount, signupSchema } from "./index.js";
import type { SocialAuthService } from "./social-service.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { recordDailyLogin } from "../gamification/service.js";

const loginSchema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 3, maxLength: 254 },
    password: { type: "string", minLength: 1, maxLength: 128 },
    tenantId: { type: "string", minLength: 1, maxLength: 128 },
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
    platform: { type: "string", enum: ["WEB", "IOS", "ANDROID", "UNKNOWN"] },
  },
} as const;

const signupBodySchema = {
  type: "object",
  required: ["email", "password", "displayName"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 3, maxLength: 254 },
    password: { type: "string", minLength: 8, maxLength: 128 },
    displayName: { type: "string", minLength: 1, maxLength: 120 },
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
    platform: { type: "string", enum: ["WEB", "IOS", "ANDROID", "UNKNOWN"] },
  },
} as const;

const socialBodySchema = {
  type: "object",
  required: ["idToken", "nonce"],
  additionalProperties: false,
  properties: {
    idToken: { type: "string", minLength: 1, maxLength: 16_384 },
    nonce: { type: "string", minLength: 8, maxLength: 256 },
    displayName: { type: "string", minLength: 1, maxLength: 120 },
    deviceName: { type: "string", minLength: 1, maxLength: 120 },
    platform: { type: "string", enum: ["WEB", "IOS", "ANDROID", "UNKNOWN"] },
  },
} as const;

type SessionBody = SessionMetadata & { tenantId?: string };

function sessionMetadata(body: SessionMetadata): SessionMetadata {
  return { deviceName: body.deviceName ?? null, platform: body.platform ?? "UNKNOWN" };
}

const refreshSchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1, maxLength: 4096 },
  },
} as const;

/**
 * Auth uçları.
 *  POST /auth/signup   — bireysel hesap + personal context oluşturur ve giriş yapar
 *  POST /auth/login    — e-posta + parola, access/refresh token üretir
 *  POST /auth/refresh  — refresh token ile yeni token çifti
 *  POST /auth/logout   — refresh token'ı iptal eder
 *  GET  /auth/me       — doğrulanmış kullanıcı + tenant context
 */
export async function authRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider; socialAuthService: SocialAuthService },
): Promise<void> {
  const { authProvider, socialAuthService } = opts;

  app.post<{ Body: SignupInput & SessionMetadata }>(
    "/auth/signup",
    { schema: { body: signupBodySchema } },
    async (request, reply) => {
      const input = signupSchema.parse(request.body);
      await signupPersonalAccount(input);
      const session = await authProvider.login(input, null, sessionMetadata(request.body));
      await recordDailyLogin(session.user.id, session.tenantContext.tenantId).catch(() => null);
      return reply.code(201).send(ok(session));
    },
  );

  app.post<{ Body: LoginCredentials & SessionBody }>(
    "/auth/login",
    { schema: { body: loginSchema } },
    async (request) => {
      const session = await authProvider.login(
        request.body,
        request.body.tenantId ?? null,
        sessionMetadata(request.body),
      );
      await recordDailyLogin(session.user.id, session.tenantContext.tenantId).catch(() => null);
      return ok(session);
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    "/auth/refresh",
    { schema: { body: refreshSchema } },
    async (request) => {
      if (!request.body.refreshToken) {
        throw validationError("refreshToken gerekli");
      }
      return ok(await authProvider.refreshSession(request.body.refreshToken));
    },
  );

  app.post("/auth/logout-all", { preHandler: [requireAuth(authProvider)] }, async (request) => {
    const revokedCount = await authProvider.revokeAllSessions(request.authUser!.id);
    return ok({ revoked: true, revokedCount });
  });

  const socialLogin = async (
    provider: "GOOGLE" | "APPLE",
    body: SocialCredentialInput & SessionMetadata,
  ) => {
    const session = await socialAuthService.login(provider, body, sessionMetadata(body));
    await recordDailyLogin(session.user.id, session.tenantContext.tenantId).catch(() => null);
    return session;
  };

  app.get("/auth/social/config", async () => {
    return ok({
      google: { configured: socialAuthService.providerConfigured("GOOGLE") },
      apple: { configured: socialAuthService.providerConfigured("APPLE") },
    });
  });

  app.post<{ Body: SocialCredentialInput & SessionMetadata }>(
    "/auth/social/google",
    { schema: { body: socialBodySchema } },
    async (request) => ok(await socialLogin("GOOGLE", request.body)),
  );

  app.post<{ Body: SocialCredentialInput & SessionMetadata }>(
    "/auth/social/apple",
    { schema: { body: socialBodySchema } },
    async (request) => ok(await socialLogin("APPLE", request.body)),
  );

  app.post<{ Body: SocialCredentialInput }>(
    "/auth/social/google/link",
    { schema: { body: socialBodySchema }, preHandler: [requireAuth(authProvider)] },
    async (request) =>
      ok(await socialAuthService.link(request.authUser!.id, "GOOGLE", request.body)),
  );

  app.post<{ Body: SocialCredentialInput }>(
    "/auth/social/apple/link",
    { schema: { body: socialBodySchema }, preHandler: [requireAuth(authProvider)] },
    async (request) =>
      ok(await socialAuthService.link(request.authUser!.id, "APPLE", request.body)),
  );

  app.delete(
    "/auth/social/google",
    { preHandler: [requireAuth(authProvider)] },
    async (request) => {
      await socialAuthService.unlink(request.authUser!.id, "GOOGLE");
      return ok({ unlinked: true });
    },
  );

  app.delete("/auth/social/apple", { preHandler: [requireAuth(authProvider)] }, async (request) => {
    await socialAuthService.unlink(request.authUser!.id, "APPLE");
    return ok({ unlinked: true });
  });

  app.post<{ Body: { refreshToken: string } }>(
    "/auth/logout",
    { schema: { body: refreshSchema } },
    async (request) => {
      if (!request.body.refreshToken) {
        throw validationError("refreshToken gerekli");
      }
      await authProvider.revokeSession(request.body.refreshToken);
      return ok({ revoked: true });
    },
  );

  app.get("/auth/me", { preHandler: [requireAuth(authProvider)] }, async (request) => {
    return ok({
      user: request.authUser,
      tenantContext: request.tenantContext,
    });
  });

  app.get("/auth/contexts", { preHandler: [requireAuth(authProvider)] }, async (request) => {
    const contexts = await authProvider.listContexts(request.authUser!.id);
    return ok({ contexts });
  });
}
