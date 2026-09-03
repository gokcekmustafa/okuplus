import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Env } from "../../config/env.js";
import { validationError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import {
  billingActor,
  billingCatalog,
  cancelCurrentSubscription,
  createCheckout,
  getCheckout,
  getCurrentSubscription,
  getPaymentHistory,
  handleCheckoutCallback,
  processIyzicoWebhook,
} from "./service.js";
import { cancelSubscriptionSchema, createCheckoutSchema } from "./schemas.js";

function actor(request: FastifyRequest) {
  return billingActor({
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser!.platformRole ?? null,
  });
}

function headerIdempotency(request: FastifyRequest): string | undefined {
  const value = request.headers["idempotency-key"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function callbackToken(request: FastifyRequest): string | null {
  const query = request.query as { token?: unknown };
  if (typeof query?.token === "string" && query.token.trim()) return query.token.trim();
  const body = request.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const value =
      (body as Record<string, unknown>).token ??
      (body as Record<string, unknown>).checkoutFormToken;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function billingRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider; env: Env },
): Promise<void> {
  if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
    app.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_request, body, done) => {
        try {
          done(null, Object.fromEntries(new URLSearchParams(body as string).entries()));
        } catch {
          done(new Error("Geçersiz callback gövdesi"));
        }
      },
    );
  }
  app.get("/billing/catalog", { preHandler: [requireAuth(opts.authProvider)] }, async () =>
    ok(billingCatalog(opts.env)),
  );
  app.get(
    "/billing/subscription",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => ok(await getCurrentSubscription(actor(request))),
  );
  app.get("/billing/payments", { preHandler: [requireAuth(opts.authProvider)] }, async (request) =>
    ok(await getPaymentHistory(actor(request))),
  );
  app.post(
    "/billing/checkout",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const body = createCheckoutSchema.parse({
        ...(request.body as object),
        idempotencyKey:
          headerIdempotency(request) ?? (request.body as Record<string, unknown>)?.idempotencyKey,
      });
      return ok(await createCheckout(actor(request), body, opts.env));
    },
  );
  app.get(
    "/billing/checkouts/:checkoutId",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const params = request.params as { checkoutId?: string };
      if (!params.checkoutId) throw validationError("checkoutId gerekli");
      return ok(await getCheckout(actor(request), params.checkoutId, opts.env));
    },
  );
  app.post(
    "/billing/subscription/cancel",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const body = cancelSubscriptionSchema.parse({
        ...(request.body as object),
        idempotencyKey:
          headerIdempotency(request) ?? (request.body as Record<string, unknown>)?.idempotencyKey,
      });
      return ok(await cancelCurrentSubscription(actor(request), body, opts.env));
    },
  );

  app.all("/billing/iyzico/checkout/callback", async (request) => {
    const token = callbackToken(request);
    if (!token)
      return ok({
        accepted: false,
        status: "MISSING_TOKEN",
        message: "Ödeme sonucu tokenı bulunamadı",
      });
    return ok(await handleCheckoutCallback(token, opts.env));
  });
  app.post("/billing/webhooks/iyzico", async (request) => {
    const body =
      typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? null);
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([key, value]) => [
        key,
        typeof value === "string" ? value : undefined,
      ]),
    );
    return ok(await processIyzicoWebhook(new TextEncoder().encode(body), headers, opts.env));
  });
}
