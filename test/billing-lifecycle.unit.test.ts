import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSubscriptionWebhookSignature,
  mapIyzicoSubscriptionStatus,
  parseIyzicoWebhook,
  resolveBillingEntitlement,
  transitionLifecycleState,
} from "../src/modules/billing/index.js";
import { cancelSubscriptionSchema, createCheckoutSchema } from "../src/modules/billing/schemas.js";

describe("8H-6 subscription lifecycle contract", () => {
  it("subscription create/active/renewal/cancel/expire/reactivate matrisini tanımlar", () => {
    expect(transitionLifecycleState("FREE", "CHECKOUT_CREATED")).toBe("PENDING");
    expect(transitionLifecycleState("PENDING", "PAYMENT_SUCCEEDED")).toBe("ACTIVE");
    expect(transitionLifecycleState("ACTIVE", "PAYMENT_SUCCEEDED")).toBe("ACTIVE");
    expect(transitionLifecycleState("ACTIVE", "CANCEL_IMMEDIATE_CONFIRMED")).toBe("CANCELED");
    expect(transitionLifecycleState("ACTIVE", "SUBSCRIPTION_EXPIRED")).toBe("EXPIRED");
    expect(transitionLifecycleState("CANCELED", "CHECKOUT_CREATED")).toBe("PENDING");
  });

  it("payment success/failure/retry ve terminal eski abonelik guard'ını tanımlar", () => {
    expect(transitionLifecycleState("ACTIVE", "RETRY_FAILED")).toBe("PAST_DUE");
    expect(transitionLifecycleState("PAST_DUE", "RETRY_SUCCEEDED")).toBe("ACTIVE");
    expect(transitionLifecycleState("PAST_DUE", "RETRY_FAILED")).toBe("PAST_DUE");
    expect(transitionLifecycleState("CANCELED", "PAYMENT_SUCCEEDED")).toBe("CANCELED");
    expect(transitionLifecycleState("EXPIRED", "PAYMENT_SUCCEEDED")).toBe("EXPIRED");
    expect(transitionLifecycleState("CANCELED", "PAYMENT_FAILED")).toBe("CANCELED");
  });

  it("ACTIVE dışında Premium açmaz; grace/cancellation kararı PENDING kalır", () => {
    expect(resolveBillingEntitlement("ACTIVE")).toMatchObject({
      decision: "PREMIUM",
      enforcement: "GRANT",
    });
    for (const state of ["PENDING", "TRIAL", "PAST_DUE", "CANCELED", "UNKNOWN"] as const) {
      expect(resolveBillingEntitlement(state)).toMatchObject({
        decision: "PENDING",
        enforcement: "NO_GRANT",
      });
    }
    expect(resolveBillingEntitlement("EXPIRED")).toMatchObject({
      decision: "FREE",
      enforcement: "NO_GRANT",
    });
  });

  it("iyzico provider status mapping'i mevcut state kümesinde fail-safe kalır", () => {
    expect(mapIyzicoSubscriptionStatus("ACTIVE")).toBe("ACTIVE");
    expect(mapIyzicoSubscriptionStatus("UNPAID")).toBe("PAST_DUE");
    expect(mapIyzicoSubscriptionStatus("CANCELLED")).toBe("CANCELED");
    expect(mapIyzicoSubscriptionStatus("EXPIRED")).toBe("EXPIRED");
    expect(mapIyzicoSubscriptionStatus("provider-added-state")).toBe("UNKNOWN");
  });

  it("resmi Subscription V3 HMAC sırasını bağımsız vektörle doğrular", () => {
    const input = {
      merchantId: "merchant-8h6",
      secretKey: "secret-8h6",
      eventType: "subscription.order.success",
      subscriptionReferenceCode: "subscription-8h6",
      orderReferenceCode: "order-8h6",
      customerReferenceCode: "customer-8h6",
    };
    const expected = createHmac("sha256", input.secretKey)
      .update(
        input.secretKey +
          input.merchantId +
          input.eventType +
          input.subscriptionReferenceCode +
          input.orderReferenceCode +
          input.customerReferenceCode,
        "utf8",
      )
      .digest("hex");
    const legacyOrder = createHmac("sha256", input.secretKey)
      .update(
        input.merchantId +
          input.secretKey +
          input.eventType +
          input.subscriptionReferenceCode +
          input.orderReferenceCode +
          input.customerReferenceCode,
        "utf8",
      )
      .digest("hex");

    expect(createSubscriptionWebhookSignature(input)).toBe(expected);
    expect(expected).not.toBe(legacyOrder);
  });

  it("resmi subscription webhook parser renewal success/failure'ı payment reference'la ayırır", () => {
    const payload = {
      orderReferenceCode: "order-renewal",
      customerReferenceCode: "customer-8h6",
      subscriptionReferenceCode: "subscription-8h6",
      iyziReferenceCode: "event-renewal",
      iyziEventType: "subscription.order.success",
      iyziEventTime: 1_756_900_000_000,
    };
    expect(
      parseIyzicoWebhook(payload, new Date(payload.iyziEventTime).toISOString()),
    ).toMatchObject({
      status: "ACTIVE",
      providerOrderReference: "order-renewal",
      providerPaymentId: null,
    });
    expect(
      parseIyzicoWebhook(
        { ...payload, iyziEventType: "subscription.order.failure" },
        new Date(payload.iyziEventTime).toISOString(),
      ).status,
    ).toBe("PAST_DUE");
  });

  it("webhook out-of-order ve unknown state entitlement effect üretmez", () => {
    expect(transitionLifecycleState("CANCELED", "PAYMENT_SUCCEEDED")).toBe("CANCELED");
    expect(transitionLifecycleState("EXPIRED", "PAYMENT_SUCCEEDED")).toBe("EXPIRED");
    expect(transitionLifecycleState("ACTIVE", "UNKNOWN_PROVIDER_STATE")).toBe("UNKNOWN");
    expect(resolveBillingEntitlement("UNKNOWN").enforcement).toBe("NO_GRANT");
  });

  it("client premium/plan/payment/subscription tampering alanlarını schema seviyesinde reddeder", () => {
    expect(() =>
      createCheckoutSchema.parse({
        billingPeriod: "MONTHLY",
        premium: true,
        amount: 1,
        currency: "TRY",
        subscriptionId: "attacker-id",
      }),
    ).toThrow();
    expect(createCheckoutSchema.parse({ billingPeriod: "MONTHLY" })).toEqual({
      billingPeriod: "MONTHLY",
    });
  });

  it("personal scope dışı ve cancellation ID tampering'ini input contract'ta kabul etmez", () => {
    expect(() =>
      createCheckoutSchema.parse({ billingPeriod: "MONTHLY", tenantId: "other" }),
    ).toThrow();
    expect(() =>
      createCheckoutSchema.parse({ billingPeriod: "MONTHLY", userId: "other" }),
    ).toThrow();
    expect(() => cancelSubscriptionSchema.parse({ subscriptionId: "other" })).toThrow();
  });
});
