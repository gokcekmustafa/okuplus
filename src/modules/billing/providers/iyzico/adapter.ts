import { createHash } from "node:crypto";
import type {
  BillingPeriod,
  BillingState,
  PaymentProvider,
  ProviderCustomerInput,
} from "../types.js";
import {
  createIyzicoAuthorization,
  createSubscriptionWebhookSignature,
  getIyzicoHeader,
  IYZICO_SANDBOX_BASE_URL,
  signaturesEqual,
} from "./signature.js";

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  baseUrl?: string;
  merchantId: string;
  webhookMaxAgeSeconds?: number;
}

export interface IyzicoFetchResponse {
  status: number;
  json(): Promise<unknown>;
}

export type IyzicoFetch = (
  input: string | URL,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<IyzicoFetchResponse>;

export class IyzicoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IyzicoConfigurationError";
  }
}

export class IyzicoProviderError extends Error {
  readonly providerStatus: number | null;
  readonly providerCode: string | null;

  constructor(
    message: string,
    providerStatus: number | null = null,
    providerCode: string | null = null,
  ) {
    super(message);
    this.name = "IyzicoProviderError";
    this.providerStatus = providerStatus;
    this.providerCode = providerCode;
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function dateFromProvider(value: unknown): string | null {
  const numeric = numberValue(value);
  if (numeric !== null) {
    const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const string = stringValue(value);
  if (!string) return null;
  const date = new Date(string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapIyzicoSubscriptionStatus(status: unknown): BillingState {
  switch (
    String(status ?? "")
      .trim()
      .toUpperCase()
  ) {
    case "PENDING":
      return "PENDING";
    case "ACTIVE":
    case "UPGRADED":
      return "ACTIVE";
    case "TRIAL":
      return "TRIAL";
    case "UNPAID":
      return "PAST_DUE";
    case "CANCELED":
    case "CANCELLED":
      return "CANCELED";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "UNKNOWN";
  }
}

function requireWebhookString(payload: JsonRecord, key: string): string {
  const value =
    stringValue(payload[key]) ?? (typeof payload[key] === "number" ? String(payload[key]) : null);
  if (!value) throw new IyzicoProviderError(`iyzico webhook alanı eksik: ${key}`);
  return value;
}

export function parseIyzicoWebhook(payload: unknown, occurredAt: string) {
  if (!isRecord(payload)) throw new IyzicoProviderError("iyzico webhook gövdesi nesne olmalı");
  const eventType = requireWebhookString(payload, "iyziEventType");
  const providerEventId = requireWebhookString(payload, "iyziReferenceCode");
  const providerSubscriptionId = stringValue(payload.subscriptionReferenceCode);
  const providerCustomerId = stringValue(payload.customerReferenceCode);
  const providerOrderReference = stringValue(payload.orderReferenceCode);
  if (!providerSubscriptionId || !providerCustomerId || !providerOrderReference) {
    throw new IyzicoProviderError("iyzico subscription webhook referansları eksik");
  }
  const status: BillingState =
    eventType === "subscription.order.success"
      ? "ACTIVE"
      : eventType === "subscription.order.failure"
        ? "PAST_DUE"
        : "UNKNOWN";
  return {
    providerEventId,
    occurredAt,
    eventType,
    providerCustomerId,
    providerSubscriptionId,
    providerPaymentId: null,
    providerOrderReference,
    merchantId: stringValue(payload.merchantId),
    status,
    effectiveAt: occurredAt,
    payloadVersion: "iyzico-subscription-v3",
  };
}

export class IyzicoSubscriptionProvider implements PaymentProvider {
  readonly providerCode = "iyzico";
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly merchantId: string;
  private readonly baseUrl: string;
  private readonly webhookMaxAgeSeconds: number;
  private readonly fetchImpl: IyzicoFetch;
  private readonly now: () => Date;

  constructor(config: IyzicoConfig, options: { fetchImpl?: IyzicoFetch; now?: () => Date } = {}) {
    if (!config.apiKey || !config.secretKey) {
      throw new IyzicoConfigurationError("iyzico sandbox API/secret credential eksik");
    }
    if (!config.merchantId) {
      throw new IyzicoConfigurationError("iyzico sandbox merchant ID eksik");
    }
    const baseUrl = (config.baseUrl?.trim() || IYZICO_SANDBOX_BASE_URL).replace(/\/$/, "");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "sandbox-api.iyzipay.com") {
      throw new IyzicoConfigurationError("8H-5 yalnız https://sandbox-api.iyzipay.com kabul eder");
    }
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.merchantId = config.merchantId;
    this.baseUrl = baseUrl;
    this.webhookMaxAgeSeconds = config.webhookMaxAgeSeconds ?? 86_400;
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as IyzicoFetch);
    this.now = options.now ?? (() => new Date());
  }

  async createCustomer(_input: {
    customer: ProviderCustomerInput;
    idempotencyKey: string;
  }): Promise<{ providerCustomerId: string | null }> {
    // Official iyzico subscription docs expose customer GET/UPDATE, not a
    // standalone create endpoint. The reference is returned by subscription
    // initialize and persisted then.
    return { providerCustomerId: null };
  }

  async createCheckout(input: {
    providerCustomerId: string | null;
    pricingPlanReferenceCode: string;
    customer: ProviderCustomerInput;
    callbackUrl: string;
    idempotencyKey: string;
  }) {
    void input.providerCustomerId;
    const response = await this.request<JsonRecord>(
      "POST",
      "/v2/subscription/checkoutform/initialize",
      {
        locale: "tr",
        callbackUrl: input.callbackUrl,
        pricingPlanReferenceCode: input.pricingPlanReferenceCode,
        subscriptionInitialStatus: "ACTIVE",
        conversationId: input.idempotencyKey,
        customer: input.customer,
      },
    );
    const token = stringValue(response.token);
    if (!token) throw new IyzicoProviderError("iyzico checkout token döndürmedi");
    return {
      providerCheckoutId: token,
      checkoutFormContent: stringValue(response.checkoutFormContent),
      redirectUrl: stringValue(response.paymentPageUrl),
      expiresAt: numberValue(response.tokenExpireTime)
        ? new Date(this.now().getTime() + Number(response.tokenExpireTime) * 1000).toISOString()
        : null,
    };
  }

  async getCheckout(input: { providerCheckoutId: string; idempotencyKey?: string }) {
    const query = input.idempotencyKey
      ? `?conversationId=${encodeURIComponent(input.idempotencyKey)}`
      : "";
    const response = await this.request<JsonRecord>(
      "GET",
      `/v2/subscription/checkoutform/${encodeURIComponent(input.providerCheckoutId)}${query}`,
    );
    const data = isRecord(response.data) ? response.data : null;
    const success = String(response.status ?? "").toLowerCase() === "success";
    return {
      providerCheckoutId: input.providerCheckoutId,
      status: success && data ? "COMPLETED" : success ? "OPEN" : "FAILED",
      providerCustomerId: data ? stringValue(data.customerReferenceCode) : null,
      providerSubscriptionId: data ? stringValue(data.referenceCode) : null,
      providerParentReference: data ? stringValue(data.parentReferenceCode) : null,
      subscriptionStatus: data ? mapIyzicoSubscriptionStatus(data.subscriptionStatus) : "PENDING",
      currentPeriodStart: data ? dateFromProvider(data.startDate) : null,
      currentPeriodEnd: data ? dateFromProvider(data.endDate) : null,
      trialEnd: data ? dateFromProvider(data.trialEndDate) : null,
    } as const;
  }

  async getSubscription(input: { providerSubscriptionId: string }) {
    const response = await this.request<JsonRecord>(
      "GET",
      `/v2/subscription/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`,
    );
    const data = isRecord(response.data) ? response.data : response;
    return {
      providerSubscriptionId: input.providerSubscriptionId,
      providerCustomerId: stringValue(data.customerReferenceCode),
      providerParentReference: stringValue(data.parentReferenceCode),
      status: mapIyzicoSubscriptionStatus(data.subscriptionStatus ?? data.status),
      currentPeriodStart: dateFromProvider(data.startDate),
      currentPeriodEnd: dateFromProvider(data.endDate),
      trialEnd: dateFromProvider(data.trialEndDate),
    };
  }

  async cancelSubscription(input: {
    providerSubscriptionId: string;
    cancelAtPeriodEnd: boolean;
    idempotencyKey: string;
  }) {
    if (input.cancelAtPeriodEnd) {
      throw new IyzicoProviderError("iyzico subscription cancel API dönem sonu seçeneği sunmuyor");
    }
    await this.request<JsonRecord>(
      "POST",
      `/v2/subscription/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}/cancel`,
      {
        subscriptionReferenceCode: input.providerSubscriptionId,
        conversationId: input.idempotencyKey,
      },
    );
    return {
      providerSubscriptionId: input.providerSubscriptionId,
      status: "CANCELED" as const,
      effectiveAt: this.now().toISOString(),
    };
  }

  async refund(input: {
    providerPaymentId: string;
    amountMinor: number | null;
    currency: string;
    idempotencyKey: string;
  }) {
    if (input.amountMinor === null || input.amountMinor <= 0) {
      throw new IyzicoProviderError("Refund için doğrulanmış ödeme tutarı gerekli");
    }
    const response = await this.request<JsonRecord>("POST", "/v2/payment/refund", {
      paymentId: input.providerPaymentId,
      price: (input.amountMinor / 100).toFixed(2),
      currency: input.currency,
      locale: "tr",
      conversationId: input.idempotencyKey,
    });
    const status =
      String(response.status ?? "").toLowerCase() === "success" ? "SUCCEEDED" : "FAILED";
    return {
      providerRefundId:
        stringValue(response.refundHostReference) ??
        `${input.providerPaymentId}:${input.idempotencyKey}`,
      providerPaymentId: input.providerPaymentId,
      status: status as "SUCCEEDED" | "FAILED",
      amountMinor: Math.round(Number(response.price ?? input.amountMinor / 100) * 100),
      currency: stringValue(response.currency) ?? input.currency,
    };
  }

  async verifyWebhook(input: {
    rawBody: Uint8Array;
    headers: Record<string, string | undefined>;
    receivedAt: string;
  }) {
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(input.rawBody));
    } catch {
      throw new IyzicoProviderError("iyzico webhook JSON gövdesi geçersiz");
    }
    if (!isRecord(payload)) throw new IyzicoProviderError("iyzico webhook gövdesi geçersiz");
    const signature = getIyzicoHeader(input.headers, "x-iyz-signature-v3");
    if (!signature) throw new IyzicoProviderError("iyzico webhook imzası eksik");
    const parsed = parseIyzicoWebhook(payload, input.receivedAt);
    const expected = createSubscriptionWebhookSignature({
      merchantId: this.merchantId,
      secretKey: this.secretKey,
      eventType: parsed.eventType,
      subscriptionReferenceCode: parsed.providerSubscriptionId,
      orderReferenceCode: parsed.providerOrderReference,
      customerReferenceCode: parsed.providerCustomerId,
    });
    if (!signaturesEqual(expected, signature))
      throw new IyzicoProviderError("iyzico webhook imzası geçersiz");
    const eventTime = numberValue(payload.iyziEventTime);
    if (eventTime === null) throw new IyzicoProviderError("iyzico webhook zamanı eksik");
    const occurredAt = dateFromProvider(eventTime);
    if (!occurredAt) throw new IyzicoProviderError("iyzico webhook zamanı geçersiz");
    const ageSeconds = (this.now().getTime() - new Date(occurredAt).getTime()) / 1000;
    if (ageSeconds > this.webhookMaxAgeSeconds || ageSeconds < -300) {
      throw new IyzicoProviderError("iyzico webhook replay/zaman penceresi dışında");
    }
    return {
      providerEventId: parsed.providerEventId,
      signatureVerified: true as const,
      occurredAt,
      rawPayload: payload,
    };
  }

  parseWebhook(input: {
    verified: { providerEventId: string; occurredAt: string; rawPayload: unknown };
  }) {
    return parseIyzicoWebhook(input.verified.rawPayload, input.verified.occurredAt);
  }

  async getPaymentStatus(input: { providerPaymentId: string }) {
    const response = await this.request<JsonRecord>("POST", "/payment/detail", {
      paymentId: input.providerPaymentId,
      locale: "tr",
    });
    const paymentStatus = String(response.paymentStatus ?? response.status ?? "").toUpperCase();
    const status =
      paymentStatus === "SUCCESS" || String(response.status ?? "").toLowerCase() === "success"
        ? "SUCCEEDED"
        : paymentStatus === "FAILURE" || String(response.status ?? "").toLowerCase() === "failure"
          ? "FAILED"
          : "UNKNOWN";
    const price = numberValue(response.paidPrice ?? response.price);
    return {
      providerPaymentId: input.providerPaymentId,
      status: status as "SUCCEEDED" | "FAILED" | "UNKNOWN",
      amountMinor: price === null ? null : Math.round(price * 100),
      currency: stringValue(response.currency),
    };
  }

  private async request<T extends JsonRecord>(
    method: string,
    pathWithQuery: string,
    body?: JsonRecord,
  ): Promise<T> {
    const [path = "", query = ""] = pathWithQuery.split("?", 2);
    const requestBody = body ? JSON.stringify(body) : "";
    const { authorization, randomKey } = createIyzicoAuthorization({
      apiKey: this.apiKey,
      secretKey: this.secretKey,
      uriPath: path,
      requestBody,
    });
    const response = await this.fetchImpl(`${this.baseUrl}${path}${query ? `?${query}` : ""}`, {
      method,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "x-iyzi-rnd": randomKey,
      },
      ...(body ? { body: requestBody } : {}),
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      throw new IyzicoProviderError("iyzico geçersiz yanıt döndürdü", response.status);
    }
    const result = isRecord(json) ? json : {};
    if (
      response.status < 200 ||
      response.status >= 300 ||
      String(result.status ?? "").toLowerCase() === "failure"
    ) {
      const code = stringValue(result.errorCode);
      throw new IyzicoProviderError("iyzico işlemi başarısız", response.status, code);
    }
    return result as T;
  }
}

export function billingPeriodLabel(period: BillingPeriod): string {
  return period === "MONTHLY" ? "Aylık" : "Yıllık";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
  return `{${entries.join(",")}}`;
}

export function canonicalPayloadHash(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload), "utf8").digest("hex");
}
