import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import type { Env } from "../../config/env.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { setNoStore } from "../auth/cookies.js";
import { clearGuestCookies, getGuestToken, setGuestCookies } from "./cookies.js";
import { GUEST_DIAGNOSTIC_SESSION_TTL_SECONDS } from "./definition.js";
import { guestRateLimitIdentifier, createGuestRateLimiter } from "./rate-limit.js";
import {
  completeGuestDiagnostic,
  createOrResumeGuestDiagnostic,
  claimGuestDiagnostic,
  getClaimedGuestDiagnostic,
  getGuestDiagnosticQuestions,
  getGuestDiagnosticResult,
  normalizeGuestServiceError,
  submitGuestDiagnosticAnswer,
  type GuestServiceDependencies,
} from "./service.js";

const sessionParamsSchema = z.object({ session: z.string().uuid() });
const answerBodySchema = z
  .object({
    itemId: z.string().regex(/^item-[1-8]$/u),
    clientAnswerId: z.string().trim().min(1).max(128),
    answer: z.unknown(),
    timeSpentMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  })
  .passthrough();

type GuestRateLimiter = ReturnType<typeof createGuestRateLimiter>;

function requestParams(request: FastifyRequest): string {
  return sessionParamsSchema.parse(request.params).session;
}

function allowedOrigins(env: Env): readonly string[] {
  return env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export async function guestDiagnosticRoutes(
  app: FastifyInstance,
  opts: { env: Env; authProvider: AuthProvider; rateLimiter?: GuestRateLimiter },
): Promise<void> {
  let rateLimiter = opts.rateLimiter;
  const getLimiter = (): GuestRateLimiter => {
    return (rateLimiter ??= createGuestRateLimiter(opts.env));
  };

  const dependencies = (request: FastifyRequest): GuestServiceDependencies => {
    const token = getGuestToken(request);
    return {
      request,
      allowedOrigins: allowedOrigins(opts.env),
      rateLimiter: getLimiter(),
      rateLimitIdentifier: guestRateLimitIdentifier(
        opts.env.JWT_SECRET,
        token ? "session" : "ip",
        token ?? request.ip,
      ),
    };
  };

  async function handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      normalizeGuestServiceError(error);
    }
  }

  function sendCreatedCookies(
    reply: FastifyReply,
    result: { token: string; csrfToken: string; resumed: boolean },
  ): void {
    if (!result.resumed) {
      // The token pair never enters the JSON response; the opaque session
      // token is HttpOnly and the CSRF token is a separate host-only cookie.
      setGuestCookies(reply, result.token, result.csrfToken, GUEST_DIAGNOSTIC_SESSION_TTL_SECONDS);
    }
  }

  app.post("/guest/diagnostics", async (request, reply) => {
    setNoStore(reply);
    const result = await handle(() => createOrResumeGuestDiagnostic(dependencies(request)));
    sendCreatedCookies(reply, result);
    const { token: _token, csrfToken: _csrfToken, ...publicResult } = result;
    return reply.status(result.resumed ? 200 : 201).send(ok(publicResult));
  });

  app.get("/guest/diagnostics/:session/questions", async (request, reply) => {
    setNoStore(reply);
    return ok(
      await handle(() =>
        getGuestDiagnosticQuestions(requestParams(request), dependencies(request)),
      ),
    );
  });

  app.post("/guest/diagnostics/:session/answers", async (request, reply) => {
    setNoStore(reply);
    const input = answerBodySchema.parse(request.body);
    return ok(
      await handle(() =>
        submitGuestDiagnosticAnswer(
          requestParams(request),
          {
            itemId: input.itemId,
            clientAnswerId: input.clientAnswerId,
            answer: input.answer as Prisma.JsonValue,
            timeSpentMs: input.timeSpentMs,
          },
          dependencies(request),
        ),
      ),
    );
  });

  app.post("/guest/diagnostics/:session/complete", async (request, reply) => {
    setNoStore(reply);
    return ok(
      await handle(() => completeGuestDiagnostic(requestParams(request), dependencies(request))),
    );
  });

  app.get("/guest/diagnostics/:session/result", async (request, reply) => {
    setNoStore(reply);
    return ok(
      await handle(() => getGuestDiagnosticResult(requestParams(request), dependencies(request))),
    );
  });

  app.post(
    "/guest/diagnostics/:session/claim",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request, reply) => {
      setNoStore(reply);
      const result = await handle(() =>
        claimGuestDiagnostic(requestParams(request), request.authUser!.id, dependencies(request)),
      );
      clearGuestCookies(reply);
      return ok(result);
    },
  );

  app.get(
    "/student/guest-diagnostic",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request, reply) => {
      setNoStore(reply);
      return ok(
        await handle(() => getClaimedGuestDiagnostic(request.authUser!.id, dependencies(request))),
      );
    },
  );
}
