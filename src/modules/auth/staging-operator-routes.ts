import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { forbiddenError, unauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import type { AuthProvider } from "./index.js";
import {
  COOKIE_AUTH_TRANSPORT,
  isCookieTransportRequested,
  setAuthCookies,
  setNoStore,
} from "./cookies.js";
import { assertRequestOrigin, createCsrfToken } from "./csrf.js";

/**
 * Staging E2E/operator bootstrap only. This route is deliberately not a
 * normal login alternative and is never registered outside APP_ENV=staging.
 */
export const STAGING_OPERATOR_SESSION_PATH = "/internal/staging/super-admin/session";
export const STAGING_SUPER_ADMIN_ACTOR_ID = "01a08604-8779-7791-b409-3c2b1def2623";
export const STAGING_OPERATOR_SECRET_HEADER = "x-staging-operator-secret";
export const STAGING_OPERATOR_SECRET_ENV = "STAGING_OPERATOR_AUTH_SECRET";

const MIN_OPERATOR_SECRET_LENGTH = 32;
const MAX_OPERATOR_SECRET_LENGTH = 256;

type StagingOperatorRouteOptions = {
  authProvider: AuthProvider;
  appEnv: string;
  operatorSecret: string;
  csrfSecret: string;
  allowedOrigins: readonly string[];
};

function isConfiguredSecret(secret: string): boolean {
  return (
    secret.length >= MIN_OPERATOR_SECRET_LENGTH &&
    secret.length <= MAX_OPERATOR_SECRET_LENGTH &&
    secret.trim() === secret &&
    !/^([\s\S])\1+$/u.test(secret)
  );
}

function readSecretHeader(request: FastifyRequest): string | undefined {
  const value = request.headers[STAGING_OPERATOR_SECRET_HEADER];
  return typeof value === "string" ? value : undefined;
}

function matchesSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const actualDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

/**
 * Registers one staging-only operator session route. An empty/weak secret
 * disables the route, and the route is not registered at all for production
 * or any other environment.
 */
export async function stagingOperatorRoutes(
  app: FastifyInstance,
  options: StagingOperatorRouteOptions,
): Promise<void> {
  if (options.appEnv !== "staging" || !isConfiguredSecret(options.operatorSecret)) return;

  app.post(
    STAGING_OPERATOR_SESSION_PATH,
    {
      schema: {
        body: { type: "object", additionalProperties: false },
      },
      preHandler: async (request) => {
        if (!isCookieTransportRequested(request)) {
          throw unauthorizedError("Staging operator transport'u gerekli");
        }
        assertRequestOrigin(request, options.allowedOrigins);
        if (!matchesSecret(readSecretHeader(request), options.operatorSecret)) {
          throw unauthorizedError("Staging operator kimlik doğrulaması başarısız");
        }
      },
    },
    async (_request, reply) => {
      const session = await options.authProvider.startSession(STAGING_SUPER_ADMIN_ACTOR_ID, null, {
        deviceName: "staging-operator-e2e",
        platform: "WEB",
      });

      if (
        session.user.id !== STAGING_SUPER_ADMIN_ACTOR_ID ||
        session.user.platformRole !== "SUPER_ADMIN" ||
        session.tenantContext.platformRole !== "SUPER_ADMIN" ||
        session.tenantContext.tenantId !== null
      ) {
        throw forbiddenError("Staging operator actor uygun değil");
      }

      setAuthCookies(reply, session.tokens, createCsrfToken(options.csrfSecret));
      setNoStore(reply);
      return reply.code(200).send(
        ok({
          user: session.user,
          tenantContext: session.tenantContext,
          transport: COOKIE_AUTH_TRANSPORT,
        }),
      );
    },
  );
}
