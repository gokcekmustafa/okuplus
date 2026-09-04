import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
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
import {
  clearAuthCookies,
  getCookie,
  isCookieTransportRequested,
  REFRESH_COOKIE_NAME,
  resolveRefreshToken,
  setAuthCookies,
  setNoStore,
} from "./cookies.js";
import { createCookieOriginGuard, createCsrfToken } from "./csrf.js";

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
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1, maxLength: 4096 },
  },
} as const;

const allowEmptyRefreshBody = async (request: FastifyRequest): Promise<void> => {
  if (request.body === undefined) request.body = {};
};

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
  opts: {
    authProvider: AuthProvider;
    socialAuthService: SocialAuthService;
    csrfSecret: string;
    allowedOrigins: readonly string[];
    enforceAuthOrigin: boolean;
    cookieAuthEnabled: boolean;
  },
): Promise<void> {
  const {
    authProvider,
    socialAuthService,
    csrfSecret,
    allowedOrigins,
    enforceAuthOrigin,
    cookieAuthEnabled,
  } = opts;
  const cookieOriginGuard = createCookieOriginGuard(allowedOrigins);
  const authOriginPreHandler = cookieAuthEnabled && enforceAuthOrigin ? [cookieOriginGuard] : [];

  function sendSession(
    request: FastifyRequest,
    reply: FastifyReply,
    session: Awaited<ReturnType<AuthProvider["login"]>>,
    statusCode = 200,
  ) {
    setNoStore(reply);
    if (cookieAuthEnabled && isCookieTransportRequested(request)) {
      setAuthCookies(reply, session.tokens, createCsrfToken(csrfSecret));
    }
    return reply.code(statusCode).send(ok(session));
  }

  app.post<{ Body: SignupInput & SessionMetadata }>(
    "/auth/signup",
    { schema: { body: signupBodySchema }, preHandler: authOriginPreHandler },
    async (request, reply) => {
      const input = signupSchema.parse(request.body);
      await signupPersonalAccount(input);
      const session = await authProvider.login(input, null, sessionMetadata(request.body));
      await recordDailyLogin(session.user.id, session.tenantContext.tenantId).catch(() => null);
      return sendSession(request, reply, session, 201);
    },
  );

  app.post<{ Body: LoginCredentials & SessionBody }>(
    "/auth/login",
    { schema: { body: loginSchema }, preHandler: authOriginPreHandler },
    async (request, reply) => {
      const session = await authProvider.login(
        request.body,
        request.body.tenantId ?? null,
        sessionMetadata(request.body),
      );
      await recordDailyLogin(session.user.id, session.tenantContext.tenantId).catch(() => null);
      return sendSession(request, reply, session);
    },
  );

  app.post<{ Body: { refreshToken?: string } }>(
    "/auth/refresh",
    {
      schema: { body: refreshSchema },
      preValidation: allowEmptyRefreshBody,
      preHandler: authOriginPreHandler,
    },
    async (request, reply) => {
      setNoStore(reply);
      const refreshToken = resolveRefreshToken(request, request.body?.refreshToken);
      const tokens = await authProvider.refreshSession(refreshToken);
      if (
        cookieAuthEnabled &&
        (isCookieTransportRequested(request) ||
          getCookie(request, REFRESH_COOKIE_NAME) !== undefined)
      ) {
        setAuthCookies(reply, tokens, createCsrfToken(csrfSecret));
      }
      return reply.send(ok(tokens));
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
    { schema: { body: socialBodySchema }, preHandler: authOriginPreHandler },
    async (request, reply) =>
      sendSession(request, reply, await socialLogin("GOOGLE", request.body)),
  );

  app.post<{ Body: SocialCredentialInput & SessionMetadata }>(
    "/auth/social/apple",
    { schema: { body: socialBodySchema }, preHandler: authOriginPreHandler },
    async (request, reply) => sendSession(request, reply, await socialLogin("APPLE", request.body)),
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

  app.post<{ Body: { refreshToken?: string } }>(
    "/auth/logout",
    {
      schema: { body: refreshSchema },
      preValidation: allowEmptyRefreshBody,
      preHandler: authOriginPreHandler,
    },
    async (request, reply) => {
      setNoStore(reply);
      const refreshToken = resolveRefreshToken(request, request.body?.refreshToken);
      try {
        await authProvider.revokeSession(refreshToken);
      } finally {
        clearAuthCookies(reply);
      }
      return reply.send(ok({ revoked: true }));
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
