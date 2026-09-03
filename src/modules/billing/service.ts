import { Prisma, type BillingSubscriptionStatus } from "@prisma/client";
import type { Env } from "../../config/env.js";
import {
  conflictError,
  forbiddenError,
  notFoundError,
  serviceUnavailableError,
  validationError,
} from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { applyTenantContext } from "../tenant/index.js";
import { recordPilotEvent } from "../pilot/service.js";
import type { EntitlementActor } from "../entitlements/index.js";
import {
  createIyzicoProvider,
  iyzicoCheckoutConfigured,
  iyzicoCredentialsAvailable,
  premiumPlanReference,
} from "./config.js";
import {
  canonicalPayloadHash,
  IyzicoProviderError,
  parseIyzicoWebhook,
} from "./providers/iyzico/index.js";
import type { BillingState, PaymentProvider } from "./providers/types.js";
import type { CancelSubscriptionInput, CreateCheckoutInput } from "./schemas.js";
import { isTerminalLifecycleState, resolveBillingEntitlement } from "./lifecycle.js";

const PROVIDER_CODE = "iyzico";
const BILLING_SOURCE_PREFIX = "IYZICO_SUBSCRIPTION:";

type BillingActor = EntitlementActor;
type Db = Prisma.TransactionClient | typeof prisma;

function requireTenantId(actor: BillingActor): string {
  if (!actor.tenantId) throw forbiddenError("Kişisel tenant context gerekli");
  if (actor.platformRole !== null) throw forbiddenError("Platform hesabı ödeme sahibi olamaz");
  return actor.tenantId;
}

async function assertPersonalOwner(actor: BillingActor, client: Db = prisma): Promise<string> {
  const tenantId = requireTenantId(actor);
  const tenant = await client.tenant.findFirst({
    where: { id: tenantId, type: "INDIVIDUAL", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!tenant) throw forbiddenError("Billing yalnızca aktif kişisel alanda kullanılabilir");
  const membership = await client.membership.findFirst({
    where: {
      tenantId,
      userId: actor.userId,
      role: "STUDENT",
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!membership) throw forbiddenError("Kişisel ödeme sahibi üyeliği gerekli");
  return tenantId;
}

function splitDisplayName(displayName: string): { name: string; surname: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    name: parts[0] ?? "Oku+",
    surname: parts.slice(1).join(" ") || "Kullanıcısı",
  };
}

async function customerInput(actor: BillingActor, client: Db = prisma) {
  const user = await client.user.findFirst({
    where: { id: actor.userId, status: "ACTIVE", deletedAt: null },
    select: { email: true, displayName: true, phone: true },
  });
  if (!user?.email) throw validationError("Premium checkout için doğrulanmış e-posta gerekli");
  const name = splitDisplayName(user.displayName);
  return { ...name, email: user.email, ...(user.phone ? { gsmNumber: user.phone } : {}) };
}

function actorForTelemetry(actor: BillingActor) {
  return { userId: actor.userId, tenantId: actor.tenantId };
}

function recordBillingTelemetry(
  actor: BillingActor,
  eventType:
    | "PREMIUM_CHECKOUT_STARTED"
    | "PREMIUM_CHECKOUT_COMPLETED"
    | "PREMIUM_CHECKOUT_FAILED"
    | "SUBSCRIPTION_CANCELED",
) {
  void recordPilotEvent(actorForTelemetry(actor), {
    eventType,
    clientEventId: `billing-${eventType}-${crypto.randomUUID()}`,
  }).catch(() => undefined);
}

export function billingActor(actor: {
  userId: string;
  tenantId: string | null;
  platformRole?: EntitlementActor["platformRole"];
}): BillingActor {
  return {
    userId: actor.userId,
    tenantId: actor.tenantId,
    platformRole: actor.platformRole ?? null,
  };
}

export function billingCatalog(env: Env) {
  const credentialsAvailable = iyzicoCredentialsAvailable(env);
  return {
    provider: PROVIDER_CODE,
    environment: "SANDBOX" as const,
    checkoutEnabled: iyzicoCheckoutConfigured(env),
    credentialsAvailable,
    plans: [
      {
        billingPeriod: "MONTHLY" as const,
        currency: "TRY",
        price: null,
        priceStatus: "PENDING_BUSINESS_DECISION" as const,
        configured: Boolean(env.IYZICO_SUBSCRIPTION_PLAN_MONTHLY),
      },
      {
        billingPeriod: "YEARLY" as const,
        currency: "TRY",
        price: null,
        priceStatus: "PENDING_BUSINESS_DECISION" as const,
        configured: Boolean(env.IYZICO_SUBSCRIPTION_PLAN_YEARLY),
      },
    ],
    note: "Sandbox entegrasyonu; tutar ve vergi gösterimi iş kararı tamamlanana kadar UI tarafından gösterilmez.",
  };
}

async function ensureCustomer(
  actor: BillingActor,
  tenantId: string,
  _input: ReturnType<typeof splitDisplayName> & { email: string; gsmNumber?: string },
  client: Db,
) {
  return client.billingCustomer.upsert({
    where: {
      providerCode_userId_tenantId: { providerCode: PROVIDER_CODE, userId: actor.userId, tenantId },
    },
    create: {
      userId: actor.userId,
      tenantId,
      scope: "PERSONAL",
      providerCode: PROVIDER_CODE,
      status: "PENDING",
    },
    update: {},
  });
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toPrismaStatus(status: BillingState): BillingSubscriptionStatus {
  return status as BillingSubscriptionStatus;
}

function providerErrorCode(error: unknown): string {
  if (error instanceof IyzicoProviderError && error.providerCode) return error.providerCode;
  return "PROVIDER_ERROR";
}

export async function createCheckout(actor: BillingActor, input: CreateCheckoutInput, env: Env) {
  const tenantId = await assertPersonalOwner(actor);
  if (!iyzicoCheckoutConfigured(env)) {
    throw serviceUnavailableError(
      "iyzico sandbox checkout yapılandırılmamış; gerçek credential veya fiyat uydurulmadı",
    );
  }
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const planReference = premiumPlanReference(env, input.billingPeriod);
  const customer = await customerInput(actor);
  const provider = createIyzicoProvider(env);

  const existing = await prisma.billingCheckout.findUnique({
    where: {
      providerCode_userId_tenantId_idempotencyKey: {
        providerCode: PROVIDER_CODE,
        userId: actor.userId,
        tenantId,
        idempotencyKey,
      },
    },
    include: { subscription: true },
  });
  if (existing) {
    if (
      existing.pricingPlanReference !== planReference ||
      existing.billingPeriod !== input.billingPeriod
    ) {
      throw conflictError("Idempotency anahtarı başka bir plan için kullanılmış");
    }
    return checkoutResponse(existing, false);
  }
  const activeSubscription = await prisma.billingSubscription.findFirst({
    where: {
      userId: actor.userId,
      tenantId,
      providerCode: PROVIDER_CODE,
      status: { in: ["PENDING", "TRIAL", "ACTIVE", "PAST_DUE"] },
    },
    select: { id: true },
  });
  if (activeSubscription)
    throw conflictError("Bu kişisel alanda zaten açık bir Premium abonelik işlemi var");

  const created = await prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, { userId: actor.userId, tenantId, platformRole: null });
    const billingCustomer = await ensureCustomer(actor, tenantId, customer, tx);
    const checkout = await tx.billingCheckout.create({
      data: {
        customerId: billingCustomer.id,
        userId: actor.userId,
        tenantId,
        providerCode: PROVIDER_CODE,
        idempotencyKey,
        billingPeriod: input.billingPeriod,
        pricingPlanReference: planReference,
        status: "OPEN",
      },
    });
    const subscription = await tx.billingSubscription.create({
      data: {
        customerId: billingCustomer.id,
        checkoutId: checkout.id,
        userId: actor.userId,
        tenantId,
        providerCode: PROVIDER_CODE,
        pricingPlanReference: planReference,
        billingPeriod: input.billingPeriod,
        status: "PENDING",
      },
    });
    return { checkout, subscription };
  });

  recordBillingTelemetry(actor, "PREMIUM_CHECKOUT_STARTED");
  try {
    const remote = await provider.createCheckout({
      providerCustomerId: null,
      pricingPlanReferenceCode: planReference,
      customer,
      callbackUrl: env.IYZICO_CHECKOUT_CALLBACK_URL,
      idempotencyKey,
    });
    const updated = await prisma.billingCheckout.update({
      where: { id: created.checkout.id },
      data: { providerCheckoutId: remote.providerCheckoutId, expiresAt: toDate(remote.expiresAt) },
      include: { subscription: true },
    });
    return checkoutResponse({ ...updated, subscription: updated.subscription }, true, remote);
  } catch (error) {
    await prisma.billingCheckout.update({
      where: { id: created.checkout.id },
      data: { status: "FAILED", failureCode: providerErrorCode(error) },
    });
    await prisma.billingSubscription.update({
      where: { id: created.subscription.id },
      data: { status: "UNKNOWN" },
    });
    recordBillingTelemetry(actor, "PREMIUM_CHECKOUT_FAILED");
    throw serviceUnavailableError("iyzico sandbox checkout başlatılamadı");
  }
}

function checkoutResponse(
  checkout: {
    id: string;
    status: string;
    providerCheckoutId: string | null;
    expiresAt: Date | null;
    billingPeriod: string;
    subscription?: { id: string; providerSubscriptionId: string | null } | null;
  },
  created: boolean,
  remote?: { checkoutFormContent: string | null; redirectUrl: string | null },
) {
  return {
    checkoutId: checkout.id,
    provider: PROVIDER_CODE,
    environment: "SANDBOX" as const,
    created,
    status: checkout.status,
    billingPeriod: checkout.billingPeriod,
    providerCheckoutId: checkout.providerCheckoutId,
    subscriptionId: checkout.subscription?.id ?? null,
    redirectUrl: remote?.redirectUrl ?? null,
    checkoutFormContent: remote?.checkoutFormContent ?? null,
    expiresAt: checkout.expiresAt?.toISOString() ?? null,
    entitlement: "Webhook ile doğrulanana kadar PREMIUM verilmez",
  };
}

async function updateFromProviderCheckout(
  actor: BillingActor,
  checkout: {
    id: string;
    userId: string;
    tenantId: string;
    providerCheckoutId: string | null;
    subscription: { id: string; customerId: string } | null;
  },
  provider: PaymentProvider,
) {
  if (!checkout.providerCheckoutId || !checkout.subscription)
    throw notFoundError("Checkout provider tokenı bulunamadı");
  const subscription = checkout.subscription;
  const remote = await provider.getCheckout({ providerCheckoutId: checkout.providerCheckoutId });
  await prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, {
      userId: actor.userId,
      tenantId: actor.tenantId,
      platformRole: null,
    });
    await tx.billingCheckout.update({
      where: { id: checkout.id },
      data: {
        status: remote.status === "COMPLETED" ? "COMPLETED" : remote.status,
        completedAt: remote.status === "COMPLETED" ? new Date() : null,
      },
    });
    await tx.billingCustomer.update({
      where: { id: subscription.customerId },
      data: remote.providerCustomerId
        ? { providerCustomerId: remote.providerCustomerId, status: "ACTIVE" }
        : {},
    });
    await tx.billingSubscription.update({
      where: { id: subscription.id },
      data: {
        providerSubscriptionId: remote.providerSubscriptionId,
        providerParentReference: remote.providerParentReference,
        status: toPrismaStatus(remote.subscriptionStatus),
        currentPeriodStart: toDate(remote.currentPeriodStart),
        currentPeriodEnd: toDate(remote.currentPeriodEnd),
        trialEndsAt: toDate(remote.trialEnd),
      },
    });
    if (["PAST_DUE", "CANCELED", "EXPIRED"].includes(remote.subscriptionStatus)) {
      await deactivateSubscriptionEntitlement(tx, subscription.id);
    }
  });
  if (remote.status === "COMPLETED") recordBillingTelemetry(actor, "PREMIUM_CHECKOUT_COMPLETED");
  return remote;
}

export async function getCheckout(actor: BillingActor, checkoutId: string, env: Env) {
  const tenantId = await assertPersonalOwner(actor);
  const checkout = await prisma.billingCheckout.findFirst({
    where: { id: checkoutId, userId: actor.userId, tenantId, providerCode: PROVIDER_CODE },
    include: {
      subscription: { select: { id: true, customerId: true, providerSubscriptionId: true } },
    },
  });
  if (!checkout) throw notFoundError("Checkout bulunamadı");
  if (!checkout.providerCheckoutId) return checkoutResponse(checkout, false);
  try {
    const remote = await updateFromProviderCheckout(actor, checkout, createIyzicoProvider(env));
    const latest = await prisma.billingCheckout.findUnique({
      where: { id: checkout.id },
      include: { subscription: true },
    });
    return {
      ...checkoutResponse(latest ?? checkout, false),
      providerSubscriptionStatus: remote.subscriptionStatus,
    };
  } catch {
    throw serviceUnavailableError("iyzico sandbox checkout durumu alınamadı");
  }
}

export async function handleCheckoutCallback(token: string, env: Env) {
  if (!token || !iyzicoCredentialsAvailable(env))
    return { accepted: false, status: "IGNORED" as const };
  const checkout = await prisma.billingCheckout.findFirst({
    where: { providerCode: PROVIDER_CODE, providerCheckoutId: token },
    include: { subscription: { select: { id: true, customerId: true } } },
  });
  if (!checkout || !checkout.subscription)
    return { accepted: false, status: "UNKNOWN_CHECKOUT" as const };
  const actor = billingActor({ userId: checkout.userId, tenantId: checkout.tenantId });
  const remote = await updateFromProviderCheckout(actor, checkout, createIyzicoProvider(env));
  return { accepted: true, status: remote.status, checkoutId: checkout.id };
}

export async function getCurrentSubscription(actor: BillingActor) {
  const tenantId = await assertPersonalOwner(actor);
  const row = await prisma.billingSubscription.findFirst({
    where: { userId: actor.userId, tenantId, providerCode: PROVIDER_CODE },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      billingPeriod: true,
      currentPeriodEnd: true,
      cancelRequestedAt: true,
      canceledAt: true,
      providerSubscriptionId: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
  };
}

/**
 * Returns the minimal payment history that a personal billing owner may see.
 * Provider identifiers and every card-related value stay server-side; the
 * account page only needs date, amount, currency and normalized status.
 */
export async function getPaymentHistory(actor: BillingActor) {
  const tenantId = await assertPersonalOwner(actor);
  const rows = await prisma.billingPayment.findMany({
    where: { userId: actor.userId, tenantId, providerCode: PROVIDER_CODE },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      status: true,
      amountMinor: true,
      currency: true,
      occurredAt: true,
      createdAt: true,
    },
  });
  return {
    payments: rows.map((row) => ({
      status: row.status,
      amountMinor: row.amountMinor,
      currency: row.currency,
      paymentDate: (row.occurredAt ?? row.createdAt).toISOString(),
    })),
  };
}

export async function cancelCurrentSubscription(
  actor: BillingActor,
  input: CancelSubscriptionInput,
  env: Env,
) {
  const tenantId = await assertPersonalOwner(actor);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const localCancellationEventId = `local-cancel:${idempotencyKey}`;
  const repeatedCancellation = await prisma.billingSubscription.findFirst({
    where: {
      userId: actor.userId,
      tenantId,
      providerCode: PROVIDER_CODE,
      status: "CANCELED",
      lastEventId: localCancellationEventId,
    },
    select: { canceledAt: true },
  });
  if (repeatedCancellation) {
    return {
      canceled: false,
      status: "CANCELED" as const,
      effectiveAt: repeatedCancellation.canceledAt?.toISOString() ?? null,
    };
  }
  const subscription = await prisma.billingSubscription.findFirst({
    where: {
      userId: actor.userId,
      tenantId,
      providerCode: PROVIDER_CODE,
      status: { in: ["PENDING", "TRIAL", "ACTIVE", "PAST_DUE"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) throw notFoundError("Aktif Premium aboneliği bulunamadı");
  if (!subscription.providerSubscriptionId)
    throw conflictError("Provider abonelik doğrulaması henüz tamamlanmadı");
  const result = await createIyzicoProvider(env).cancelSubscription({
    providerSubscriptionId: subscription.providerSubscriptionId,
    cancelAtPeriodEnd: false,
    idempotencyKey,
  });
  await prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, { userId: actor.userId, tenantId, platformRole: null });
    const processedAt = new Date();
    await tx.billingSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "CANCELED",
        cancelRequestedAt: processedAt,
        canceledAt: processedAt,
        lastEventAt: processedAt,
        lastEventId: localCancellationEventId,
      },
    });
    await tx.billingWebhookEvent.create({
      data: {
        providerCode: PROVIDER_CODE,
        providerEventId: localCancellationEventId,
        eventType: "subscription.cancel.confirmed",
        status: "PROCESSED",
        signatureVerified: false,
        payloadHash: canonicalPayloadHash({
          eventType: "subscription.cancel.confirmed",
          idempotencyKey,
        }),
        previousState: subscription.status,
        newState: "CANCELED",
        occurredAt: processedAt,
        receivedAt: processedAt,
        processedAt,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        userId: subscription.userId,
        tenantId: subscription.tenantId,
      },
    });
    await deactivateSubscriptionEntitlement(tx, subscription.id);
  });
  recordBillingTelemetry(actor, "SUBSCRIPTION_CANCELED");
  return { canceled: true, status: result.status, effectiveAt: result.effectiveAt };
}

export async function refundPayment(
  actor: BillingActor,
  paymentId: string,
  amountMinor: number | null,
  currency: string,
  idempotencyKey: string,
  env: Env,
) {
  const tenantId = await assertPersonalOwner(actor);
  if (!idempotencyKey.trim() || idempotencyKey.length > 128)
    throw validationError("Refund idempotency anahtarı geçersiz");
  const payment = await prisma.billingPayment.findFirst({
    where: { id: paymentId, userId: actor.userId, tenantId, providerCode: PROVIDER_CODE },
  });
  if (!payment) throw notFoundError("Ödeme bulunamadı");
  if (payment.refundIdempotencyKey === idempotencyKey)
    return { status: payment.status, providerRefundId: payment.providerRefundId };
  if (!payment.providerPaymentId || payment.status !== "SUCCEEDED")
    throw conflictError("Refund için doğrulanmış provider ödeme kimliği gerekli");
  const requestedAmount = amountMinor ?? payment.amountMinor;
  if (requestedAmount === null || requestedAmount <= 0)
    throw conflictError("Refund için doğrulanmış ödeme tutarı gerekli");
  if (payment.amountMinor !== null && requestedAmount !== payment.amountMinor)
    throw conflictError("Kısmi refund mevcut billing modeliyle temsil edilemiyor");
  if (payment.currency && payment.currency !== currency)
    throw conflictError("Refund para birimi ödeme kaydıyla eşleşmiyor");
  const refund = await createIyzicoProvider(env).refund({
    providerPaymentId: payment.providerPaymentId,
    amountMinor: requestedAmount,
    currency: payment.currency ?? currency,
    idempotencyKey,
  });
  if (refund.status !== "SUCCEEDED")
    throw conflictError("iyzico refund sonucu başarılı olarak doğrulanmadı");
  await prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, { userId: actor.userId, tenantId, platformRole: null });
    await tx.billingPayment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        providerRefundId: refund.providerRefundId,
        refundIdempotencyKey: idempotencyKey,
        refundedAt: new Date(),
      },
    });
  });
  return refund;
}

async function deactivateSubscriptionEntitlement(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
) {
  const subscription = await tx.billingSubscription.findUnique({
    select: { userId: true, tenantId: true },
    where: { id: subscriptionId },
  });
  if (!subscription) return;
  await tx.entitlement.updateMany({
    where: {
      userId: subscription.userId,
      tenantId: subscription.tenantId,
      scope: "PERSONAL",
      source: `${BILLING_SOURCE_PREFIX}${subscriptionId}`,
      active: true,
    },
    data: { active: false, expiresAt: new Date() },
  });
}

function eventDetails(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return {};
  const body = payload as Record<string, unknown>;
  const value = (key: string) =>
    typeof body[key] === "string" || typeof body[key] === "number" ? String(body[key]) : null;
  return {
    providerEventId: value("iyziReferenceCode"),
    eventType: value("iyziEventType") ?? "UNKNOWN",
    merchantId: value("merchantId"),
    providerCustomerId: value("customerReferenceCode"),
    providerSubscriptionId: value("subscriptionReferenceCode"),
    providerOrderReference: value("orderReferenceCode"),
  };
}

async function recordRejectedWebhook(
  payload: unknown,
  payloadHash: string,
  errorCode: string,
  receivedAt: Date,
) {
  const details = eventDetails(payload);
  const providerEventId = details.providerEventId ?? `invalid:${payloadHash}`;
  const eventType = details.eventType || "UNKNOWN";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.webhook_ingest', 'iyzico', true)`;
      await tx.billingWebhookEvent.upsert({
        where: { providerCode_providerEventId: { providerCode: PROVIDER_CODE, providerEventId } },
        create: {
          providerCode: PROVIDER_CODE,
          providerEventId,
          eventType,
          status: "REJECTED",
          signatureVerified: false,
          payloadHash,
          receivedAt,
          processedAt: receivedAt,
          merchantId: details.merchantId,
          customerReferenceCode: details.providerCustomerId,
          subscriptionReferenceCode: details.providerSubscriptionId,
          orderReferenceCode: details.providerOrderReference,
          errorCode,
        },
        update: { status: "REJECTED", errorCode, payloadHash, processedAt: receivedAt },
      });
    });
  } catch {
    // A rejected webhook must never become a 500 or disclose storage details.
  }
}

export async function processIyzicoWebhook(
  rawBody: Uint8Array,
  headers: Record<string, string | undefined>,
  env: Env,
  receivedAt = new Date(),
) {
  let payload: unknown = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    /* provider error below */
  }
  const payloadHash = canonicalPayloadHash(payload ?? new TextDecoder().decode(rawBody));
  let provider;
  try {
    provider = createIyzicoProvider(env);
    const verified = await provider.verifyWebhook({
      rawBody,
      headers,
      receivedAt: receivedAt.toISOString(),
    });
    const parsed = provider.parseWebhook({ verified });
    return await applyVerifiedWebhook(parsed, verified.rawPayload, payloadHash, receivedAt);
  } catch (error) {
    await recordRejectedWebhook(
      payload,
      payloadHash,
      error instanceof IyzicoProviderError ? "INVALID_WEBHOOK" : "WEBHOOK_PROCESSING_ERROR",
      receivedAt,
    );
    if (error instanceof IyzicoProviderError) throw validationError("Webhook doğrulanamadı");
    throw error;
  }
}

async function applyVerifiedWebhook(
  parsed: ReturnType<typeof parseIyzicoWebhook>,
  payload: unknown,
  payloadHash: string,
  receivedAt: Date,
) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.webhook_ingest', 'iyzico', true)`;
    const existing = await tx.billingWebhookEvent.findUnique({
      where: {
        providerCode_providerEventId: {
          providerCode: PROVIDER_CODE,
          providerEventId: parsed.providerEventId,
        },
      },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        await tx.billingWebhookEvent.update({
          where: { id: existing.id },
          data: { status: "CONFLICT", errorCode: "EVENT_PAYLOAD_CONFLICT" },
        });
        return { duplicate: false, conflict: true, userId: null, tenantId: null };
      }
      return { duplicate: true, conflict: false, userId: null, tenantId: null };
    }
    const customer = await tx.billingCustomer.findFirst({
      where: { providerCode: PROVIDER_CODE, providerCustomerId: parsed.providerCustomerId },
    });
    const subscription = customer
      ? await tx.billingSubscription.findFirst({
          where: {
            providerCode: PROVIDER_CODE,
            providerSubscriptionId: parsed.providerSubscriptionId,
            customerId: customer.id,
          },
        })
      : null;
    const baseData = {
      providerCode: PROVIDER_CODE,
      providerEventId: parsed.providerEventId,
      eventType: parsed.eventType,
      signatureVerified: true,
      payloadHash,
      merchantId: parsed.merchantId,
      customerReferenceCode: parsed.providerCustomerId,
      subscriptionReferenceCode: parsed.providerSubscriptionId,
      orderReferenceCode: parsed.providerOrderReference,
      occurredAt: new Date(parsed.occurredAt),
      receivedAt,
      previousState: subscription?.status ?? null,
      newState:
        subscription && parsed.status !== "UNKNOWN"
          ? toPrismaStatus(parsed.status)
          : (subscription?.status ?? null),
      customerId: customer?.id ?? null,
      subscriptionId: subscription?.id ?? null,
      userId: subscription?.userId ?? null,
      tenantId: subscription?.tenantId ?? null,
    };
    if (!customer || !subscription) {
      await tx.billingWebhookEvent.create({
        data: {
          ...baseData,
          status: "REJECTED",
          processedAt: receivedAt,
          errorCode: "UNKNOWN_PROVIDER_REFERENCE",
        },
      });
      return { duplicate: false, conflict: false, userId: null, tenantId: null };
    }
    await tx.$executeRaw`SELECT set_config('app.user_id', ${subscription.userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${subscription.tenantId}, true)`;
    const terminal = isTerminalLifecycleState(subscription.status);
    const stale =
      terminal ||
      (subscription.lastEventAt !== null &&
        new Date(parsed.occurredAt).getTime() <= subscription.lastEventAt.getTime());
    if (stale) {
      await tx.billingWebhookEvent.create({
        data: {
          ...baseData,
          newState: subscription.status,
          status: "IGNORED",
          processedAt: receivedAt,
          errorCode: terminal ? "TERMINAL_SUBSCRIPTION_EVENT" : "STALE_PROVIDER_EVENT",
        },
      });
      return {
        duplicate: false,
        conflict: false,
        userId: subscription.userId,
        tenantId: subscription.tenantId,
      };
    }
    await tx.billingWebhookEvent.create({
      data: {
        ...baseData,
        status: parsed.status === "UNKNOWN" ? "IGNORED" : "PROCESSED",
        processedAt: new Date(),
        errorCode: parsed.status === "UNKNOWN" ? "UNKNOWN_EVENT" : null,
      },
    });
    if (parsed.status === "UNKNOWN")
      return {
        duplicate: false,
        conflict: false,
        userId: subscription.userId,
        tenantId: subscription.tenantId,
      };
    const newStatus = toPrismaStatus(parsed.status);
    await tx.billingCustomer.update({
      where: { id: customer.id },
      data: { providerCustomerId: parsed.providerCustomerId, status: "ACTIVE" },
    });
    await tx.billingSubscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus,
        lastEventAt: new Date(parsed.occurredAt),
        lastEventId: parsed.providerEventId,
      },
    });
    await tx.billingPayment.upsert({
      where: {
        providerCode_providerOrderReference: {
          providerCode: PROVIDER_CODE,
          providerOrderReference: parsed.providerOrderReference,
        },
      },
      create: {
        customerId: customer.id,
        subscriptionId: subscription.id,
        userId: subscription.userId,
        tenantId: subscription.tenantId,
        providerCode: PROVIDER_CODE,
        providerOrderReference: parsed.providerOrderReference,
        status: parsed.status === "ACTIVE" ? "SUCCEEDED" : "FAILED",
        occurredAt: new Date(parsed.occurredAt),
      },
      update: {
        subscriptionId: subscription.id,
        status: parsed.status === "ACTIVE" ? "SUCCEEDED" : "FAILED",
        occurredAt: new Date(parsed.occurredAt),
      },
    });
    if (resolveBillingEntitlement(parsed.status).enforcement === "GRANT") {
      await tx.entitlement.updateMany({
        where: {
          userId: subscription.userId,
          tenantId: subscription.tenantId,
          scope: "PERSONAL",
          source: `${BILLING_SOURCE_PREFIX}${subscription.id}`,
        },
        data: {
          active: true,
          plan: "PLAN_PREMIUM",
          effectiveAt: new Date(parsed.occurredAt),
          expiresAt: null,
        },
      });
      const grant = await tx.entitlement.findFirst({
        where: {
          userId: subscription.userId,
          tenantId: subscription.tenantId,
          scope: "PERSONAL",
          source: `${BILLING_SOURCE_PREFIX}${subscription.id}`,
        },
        select: { id: true },
      });
      if (!grant)
        await tx.entitlement.create({
          data: {
            userId: subscription.userId,
            tenantId: subscription.tenantId,
            scope: "PERSONAL",
            plan: "PLAN_PREMIUM",
            active: true,
            source: `${BILLING_SOURCE_PREFIX}${subscription.id}`,
            effectiveAt: new Date(parsed.occurredAt),
          },
        });
    } else {
      await deactivateSubscriptionEntitlement(tx, subscription.id);
    }
    return {
      duplicate: false,
      conflict: false,
      userId: subscription.userId,
      tenantId: subscription.tenantId,
    };
  });
  if (result.userId && result.tenantId && parsed.status === "ACTIVE")
    recordBillingTelemetry(
      { userId: result.userId, tenantId: result.tenantId, platformRole: null },
      "PREMIUM_CHECKOUT_COMPLETED",
    );
  return {
    accepted: !result.conflict,
    duplicate: result.duplicate,
    conflict: result.conflict,
    eventId: parsed.providerEventId,
    status: parsed.status,
    receivedAt: receivedAt.toISOString(),
  };
}
