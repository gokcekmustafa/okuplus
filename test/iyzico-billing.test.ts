import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { parseEnv } from "../src/config/env.js";
import {
  createIyzicoAuthorization,
  createSubscriptionWebhookSignature,
  IyzicoProviderError,
  IyzicoSubscriptionProvider,
  mapIyzicoSubscriptionStatus,
  parseIyzicoWebhook,
  processIyzicoWebhook,
} from "../src/modules/billing/index.js";
import { iyzicoCheckoutConfigured } from "../src/modules/billing/config.js";
import { createCheckoutSchema } from "../src/modules/billing/schemas.js";
import {
  cancelCurrentSubscription,
  createCheckout,
  getCheckout,
  getPaymentHistory,
  refundPayment,
} from "../src/modules/billing/service.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/oku_plus_test?schema=public";
const USER_ID = "8h5-billing-user";
const TENANT_ID = "8h5-billing-personal";
const ORG_TENANT_ID = "8h5-billing-organization";
const CUSTOMER_ID = "8h5-billing-customer";
const SUBSCRIPTION_ID = "8h5-billing-subscription";
const CHECKOUT_ID = "8h5-billing-checkout";
const PAYMENT_ID = "8h5-billing-payment";
const CUSTOMER_REF = "8h5-provider-customer";
const SUBSCRIPTION_REF = "8h5-provider-subscription";
const PLAN_REF = "8h5-provider-plan";
const MERCHANT_ID = "3404590";
const SECRET_KEY = "sandbox-8h5-test-secret";

const env = parseEnv({
  NODE_ENV: "test",
  DATABASE_URL,
  IYZICO_API_KEY: "sandbox-8h5-api-key",
  IYZICO_SECRET_KEY: SECRET_KEY,
  IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com",
  IYZICO_MERCHANT_ID: MERCHANT_ID,
  IYZICO_SUBSCRIPTION_PLAN_MONTHLY: PLAN_REF,
  IYZICO_SUBSCRIPTION_PLAN_YEARLY: "8h5-provider-yearly-plan",
  IYZICO_CHECKOUT_CALLBACK_URL: "https://test.example.invalid/billing/iyzico/checkout/callback",
});

function response(body: unknown, status = 200) {
  return {
    status,
    async json() {
      return body;
    },
  };
}

function subscriptionPayload(
  eventId: string,
  eventType = "subscription.order.success",
  eventTime = Date.now(),
) {
  return {
    orderReferenceCode: `order-${eventId}`,
    customerReferenceCode: CUSTOMER_REF,
    subscriptionReferenceCode: SUBSCRIPTION_REF,
    iyziReferenceCode: eventId,
    iyziEventType: eventType,
    iyziEventTime: eventTime,
  };
}

function signedHeaders(payload: ReturnType<typeof subscriptionPayload>) {
  return {
    "x-iyz-signature-v3": createSubscriptionWebhookSignature({
      merchantId: MERCHANT_ID,
      secretKey: SECRET_KEY,
      eventType: payload.iyziEventType,
      subscriptionReferenceCode: payload.subscriptionReferenceCode,
      orderReferenceCode: payload.orderReferenceCode,
      customerReferenceCode: payload.customerReferenceCode,
    }),
  };
}

describe("iyzico sandbox adapter", () => {
  it("resmi IYZWSv2 authorization formülünü üretir ve provider status'larını fail-safe map eder", () => {
    const auth = createIyzicoAuthorization({
      apiKey: "sandbox-api",
      secretKey: "sandbox-secret",
      uriPath: "/v2/subscription/checkoutform/initialize",
      requestBody: "{}",
      randomKey: "fixed-random",
    });
    expect(auth.authorization).toMatch(/^IYZWSv2 /);
    expect(Buffer.from(auth.authorization.slice("IYZWSv2 ".length), "base64").toString()).toContain(
      "apiKey:sandbox-api&randomKey:fixed-random&signature:",
    );
    expect(mapIyzicoSubscriptionStatus("ACTIVE")).toBe("ACTIVE");
    expect(mapIyzicoSubscriptionStatus("UNPAID")).toBe("PAST_DUE");
    expect(mapIyzicoSubscriptionStatus("new-provider-state")).toBe("UNKNOWN");
  });

  it("checkout adapter yalnız signed sandbox API çağrısı yapar, card payload taşımaz", async () => {
    let requestedBody = "";
    const provider = new IyzicoSubscriptionProvider(
      { apiKey: "sandbox-api", secretKey: "sandbox-secret", merchantId: MERCHANT_ID },
      {
        fetchImpl: async (_url, init) => {
          requestedBody = init?.body ?? "";
          return response({
            status: "success",
            token: "checkout-token",
            checkoutFormContent: "<script>/* test */</script>",
            tokenExpireTime: 1800,
          });
        },
      },
    );
    const checkout = await provider.createCheckout({
      providerCustomerId: null,
      pricingPlanReferenceCode: PLAN_REF,
      customer: { name: "Test", surname: "User", email: "test@example.invalid" },
      callbackUrl: "https://test.example.invalid/billing/iyzico/checkout/callback",
      idempotencyKey: "checkout-idempotency-1",
    });
    expect(checkout.providerCheckoutId).toBe("checkout-token");
    expect(requestedBody).toContain("pricingPlanReferenceCode");
    expect(requestedBody).not.toContain("cardNumber");
  });

  it("X-IYZ-SIGNATURE-V3 forged, missing and replay webhook'larını reddeder", async () => {
    const provider = new IyzicoSubscriptionProvider(
      {
        apiKey: "sandbox-api",
        secretKey: SECRET_KEY,
        merchantId: MERCHANT_ID,
        webhookMaxAgeSeconds: 60,
      },
      { now: () => new Date("2026-09-02T12:00:00.000Z") },
    );
    const payload = subscriptionPayload(
      "adapter-event-1",
      "subscription.order.success",
      Date.parse("2026-09-02T11:59:30.000Z"),
    );
    const rawBody = new TextEncoder().encode(JSON.stringify(payload));
    const verified = await provider.verifyWebhook({
      rawBody,
      headers: signedHeaders(payload),
      receivedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(verified.signatureVerified).toBe(true);
    expect(parseIyzicoWebhook(verified.rawPayload, verified.occurredAt).status).toBe("ACTIVE");
    await expect(
      provider.verifyWebhook({
        rawBody,
        headers: { "x-iyz-signature-v3": "forged" },
        receivedAt: "2026-09-02T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(IyzicoProviderError);
    await expect(
      provider.verifyWebhook({ rawBody, headers: {}, receivedAt: "2026-09-02T12:00:00.000Z" }),
    ).rejects.toBeInstanceOf(IyzicoProviderError);
    const oldPayload = subscriptionPayload(
      "adapter-event-old",
      "subscription.order.success",
      Date.parse("2026-09-01T00:00:00.000Z"),
    );
    await expect(
      provider.verifyWebhook({
        rawBody: new TextEncoder().encode(JSON.stringify(oldPayload)),
        headers: signedHeaders(oldPayload),
        receivedAt: "2026-09-02T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(IyzicoProviderError);
  });

  it("production base URL'yi kabul etmez", () => {
    expect(
      () =>
        new IyzicoSubscriptionProvider({
          apiKey: "a",
          secretKey: "b",
          merchantId: "m",
          baseUrl: "https://api.iyzipay.com",
        }),
    ).toThrow("sandbox");
  });

  it("checkout catalog'unu yalnız HTTPS callback ve sandbox yapılandırmasıyla açar", () => {
    expect(iyzicoCheckoutConfigured(env)).toBe(true);
    expect(
      iyzicoCheckoutConfigured({
        ...env,
        IYZICO_CHECKOUT_CALLBACK_URL:
          "http://test.example.invalid/billing/iyzico/checkout/callback",
      }),
    ).toBe(false);
  });
});

describe("iyzico billing webhook security and entitlement boundary", () => {
  beforeAll(async () => {
    await prisma.entitlement.deleteMany({ where: { userId: USER_ID, tenantId: TENANT_ID } });
    await prisma.billingWebhookEvent.deleteMany({
      where: { providerCode: "iyzico", providerEventId: { startsWith: "8h5-event" } },
    });
    await prisma.billingPayment.deleteMany({ where: { userId: USER_ID, tenantId: TENANT_ID } });
    await prisma.billingSubscription.deleteMany({ where: { id: SUBSCRIPTION_ID } });
    await prisma.billingCheckout.deleteMany({ where: { id: CHECKOUT_ID } });
    await prisma.billingCustomer.deleteMany({ where: { id: CUSTOMER_ID } });
    await prisma.pilotEvent.deleteMany({ where: { tenantId: { in: [TENANT_ID, ORG_TENANT_ID] } } });
    await prisma.membership.deleteMany({
      where: { userId: USER_ID, tenantId: { in: [TENANT_ID, ORG_TENANT_ID] } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, ORG_TENANT_ID] } } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.user.create({
      data: { id: USER_ID, email: "8h5@example.invalid", displayName: "8H5 Test User" },
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_ID, type: "INDIVIDUAL", name: "8H5 Personal" },
        { id: ORG_TENANT_ID, type: "ORGANIZATION", name: "8H5 Organization" },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: TENANT_ID, userId: USER_ID, role: "STUDENT", status: "ACTIVE" },
        { tenantId: ORG_TENANT_ID, userId: USER_ID, role: "STUDENT", status: "ACTIVE" },
      ],
    });
    await prisma.billingCustomer.create({
      data: {
        id: CUSTOMER_ID,
        userId: USER_ID,
        tenantId: TENANT_ID,
        scope: "PERSONAL",
        providerCode: "iyzico",
        providerCustomerId: CUSTOMER_REF,
        status: "ACTIVE",
      },
    });
    await prisma.billingCheckout.create({
      data: {
        id: CHECKOUT_ID,
        customerId: CUSTOMER_ID,
        userId: USER_ID,
        tenantId: TENANT_ID,
        providerCode: "iyzico",
        providerCheckoutId: "8h5-checkout-token",
        idempotencyKey: "8h5-checkout-key",
        billingPeriod: "MONTHLY",
        pricingPlanReference: PLAN_REF,
        status: "COMPLETED",
      },
    });
    await prisma.billingSubscription.create({
      data: {
        id: SUBSCRIPTION_ID,
        customerId: CUSTOMER_ID,
        checkoutId: CHECKOUT_ID,
        userId: USER_ID,
        tenantId: TENANT_ID,
        providerCode: "iyzico",
        providerSubscriptionId: SUBSCRIPTION_REF,
        pricingPlanReference: PLAN_REF,
        billingPeriod: "MONTHLY",
        status: "PENDING",
      },
    });
  });

  afterAll(async () => {
    await prisma.entitlement.deleteMany({ where: { userId: USER_ID, tenantId: TENANT_ID } });
    await prisma.billingWebhookEvent.deleteMany({
      where: { providerCode: "iyzico", providerEventId: { startsWith: "8h5-event" } },
    });
    await prisma.billingPayment.deleteMany({ where: { userId: USER_ID, tenantId: TENANT_ID } });
    await prisma.billingSubscription.deleteMany({ where: { id: SUBSCRIPTION_ID } });
    await prisma.billingCheckout.deleteMany({ where: { id: CHECKOUT_ID } });
    await prisma.billingCustomer.deleteMany({ where: { id: CUSTOMER_ID } });
    await prisma.pilotEvent.deleteMany({ where: { tenantId: { in: [TENANT_ID, ORG_TENANT_ID] } } });
    await prisma.membership.deleteMany({
      where: { userId: USER_ID, tenantId: { in: [TENANT_ID, ORG_TENANT_ID] } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, ORG_TENANT_ID] } } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
  });

  it("verified success webhook Premium grant üretir, aynı event ikinci kez NOOP olur", async () => {
    const payload = subscriptionPayload("8h5-event-success");
    const rawBody = new TextEncoder().encode(JSON.stringify(payload));
    const first = await processIyzicoWebhook(rawBody, signedHeaders(payload), env, new Date());
    expect(first).toMatchObject({ accepted: true, duplicate: false, status: "ACTIVE" });
    expect(
      await prisma.entitlement.findMany({
        where: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          source: `IYZICO_SUBSCRIPTION:${SUBSCRIPTION_ID}`,
        },
      }),
    ).toHaveLength(1);
    expect(
      await prisma.billingWebhookEvent.findUnique({
        where: {
          providerCode_providerEventId: {
            providerCode: "iyzico",
            providerEventId: payload.iyziReferenceCode,
          },
        },
      }),
    ).toMatchObject({
      previousState: "PENDING",
      newState: "ACTIVE",
      status: "PROCESSED",
    });
    expect(
      (
        await prisma.billingWebhookEvent.findUnique({
          where: {
            providerCode_providerEventId: {
              providerCode: "iyzico",
              providerEventId: payload.iyziReferenceCode,
            },
          },
          select: { processedAt: true, occurredAt: true },
        })
      )?.processedAt,
    ).not.toBeNull();
    const second = await processIyzicoWebhook(rawBody, signedHeaders(payload), env, new Date());
    expect(second).toMatchObject({ accepted: true, duplicate: true, conflict: false });
    expect(
      await prisma.billingPayment.count({
        where: { providerOrderReference: payload.orderReferenceCode },
      }),
    ).toBe(1);
    expect(
      await prisma.billingSubscription.count({
        where: { providerCode: "iyzico", providerSubscriptionId: SUBSCRIPTION_REF },
      }),
    ).toBe(1);
    const history = await getPaymentHistory({
      userId: USER_ID,
      tenantId: TENANT_ID,
      platformRole: null,
    });
    expect(history.payments[0]).toMatchObject({
      status: "SUCCEEDED",
      currency: null,
    });
    expect(history.payments[0]).not.toHaveProperty("providerPaymentId");
    expect(history.payments[0]).not.toHaveProperty("cardNumber");
    await expect(
      getPaymentHistory({ userId: USER_ID, tenantId: ORG_TENANT_ID, platformRole: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      getCheckout(
        { userId: USER_ID, tenantId: ORG_TENANT_ID, platformRole: null },
        CHECKOUT_ID,
        env,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("aynı event farklı payload conflict olur; client premium tampering ve organization checkout engellenir", async () => {
    const original = subscriptionPayload("8h5-event-conflict");
    await processIyzicoWebhook(
      new TextEncoder().encode(JSON.stringify(original)),
      signedHeaders(original),
      env,
      new Date(),
    );
    const modified = { ...original, orderReferenceCode: "modified-order" };
    const modifiedResult = await processIyzicoWebhook(
      new TextEncoder().encode(JSON.stringify(modified)),
      signedHeaders(modified),
      env,
      new Date(),
    );
    expect(modifiedResult).toMatchObject({ accepted: false, conflict: true });
    expect(() =>
      createCheckoutSchema.parse({
        billingPeriod: "MONTHLY",
        idempotencyKey: "8h5-client-key",
        premium: true,
      }),
    ).toThrow();
    await expect(
      createCheckout(
        { userId: USER_ID, tenantId: ORG_TENANT_ID, platformRole: null },
        { billingPeriod: "MONTHLY", idempotencyKey: "8h5-org-key" },
        env,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("canceled subscription sonrası eski ACTIVE event Premium'u yeniden açmaz", async () => {
    await prisma.entitlement.updateMany({
      where: {
        userId: USER_ID,
        tenantId: TENANT_ID,
        source: `IYZICO_SUBSCRIPTION:${SUBSCRIPTION_ID}`,
      },
      data: { active: false, expiresAt: new Date() },
    });
    await prisma.billingSubscription.update({
      where: { id: SUBSCRIPTION_ID },
      data: { status: "CANCELED", lastEventAt: new Date(), canceledAt: new Date() },
    });
    const old = subscriptionPayload(
      "8h5-event-stale",
      "subscription.order.success",
      Date.now() - 60_000,
    );
    const result = await processIyzicoWebhook(
      new TextEncoder().encode(JSON.stringify(old)),
      signedHeaders(old),
      env,
      new Date(),
    );
    expect(result.status).toBe("ACTIVE");
    expect(
      (
        await prisma.entitlement.findFirst({
          where: {
            userId: USER_ID,
            tenantId: TENANT_ID,
            source: `IYZICO_SUBSCRIPTION:${SUBSCRIPTION_ID}`,
          },
        })
      )?.active,
    ).toBe(false);
  });

  it("geçersiz imza audit kaydı oluşturur ve Premium açmaz", async () => {
    const payload = subscriptionPayload("8h5-event-forged");
    await expect(
      processIyzicoWebhook(
        new TextEncoder().encode(JSON.stringify(payload)),
        { "x-iyz-signature-v3": "forged" },
        env,
        new Date(),
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(
      await prisma.billingWebhookEvent.findUnique({
        where: {
          providerCode_providerEventId: {
            providerCode: "iyzico",
            providerEventId: payload.iyziReferenceCode,
          },
        },
      }),
    ).toMatchObject({ status: "REJECTED", signatureVerified: false });
  });

  it("cancellation ve refund aynı idempotency anahtarında ikinci çağrıyı NOOP yapar", async () => {
    const cancellationKey = "8h5-cancel-idempotency";
    await prisma.billingSubscription.update({
      where: { id: SUBSCRIPTION_ID },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        lastEventId: `local-cancel:${cancellationKey}`,
      },
    });
    const repeatedCancellation = await cancelCurrentSubscription(
      { userId: USER_ID, tenantId: TENANT_ID, platformRole: null },
      { idempotencyKey: cancellationKey },
      env,
    );
    expect(repeatedCancellation).toMatchObject({
      canceled: false,
      status: "CANCELED",
    });

    await prisma.billingPayment.create({
      data: {
        id: PAYMENT_ID,
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        userId: USER_ID,
        tenantId: TENANT_ID,
        providerCode: "iyzico",
        providerPaymentId: "8h5-provider-payment",
        providerOrderReference: "8h5-refunded-order",
        providerRefundId: "8h5-provider-refund",
        refundIdempotencyKey: "8h5-refund-idempotency",
        status: "REFUNDED",
        amountMinor: 1000,
        currency: "TRY",
        refundedAt: new Date(),
      },
    });
    const repeatedRefund = await refundPayment(
      { userId: USER_ID, tenantId: TENANT_ID, platformRole: null },
      PAYMENT_ID,
      1000,
      "TRY",
      "8h5-refund-idempotency",
      env,
    );
    expect(repeatedRefund).toMatchObject({
      status: "REFUNDED",
      providerRefundId: "8h5-provider-refund",
    });
    await expect(
      refundPayment(
        { userId: "8h5-other-user", tenantId: TENANT_ID, platformRole: null },
        PAYMENT_ID,
        1000,
        "TRY",
        "8h5-other-refund-idempotency",
        env,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
