export type BillingPeriod = "MONTHLY" | "YEARLY";
export type BillingState =
  "PENDING" | "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "UNKNOWN";
export type CheckoutState = "OPEN" | "COMPLETED" | "FAILED" | "EXPIRED" | "CANCELED";
export type PaymentState = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "UNKNOWN";

export interface ProviderCustomerInput {
  name: string;
  surname: string;
  email: string;
  gsmNumber?: string;
}

export interface PaymentProvider {
  readonly providerCode: string;

  /** iyzico materializes a customer while initializing a subscription. */
  createCustomer(input: {
    customer: ProviderCustomerInput;
    idempotencyKey: string;
  }): Promise<{ providerCustomerId: string | null }>;

  createCheckout(input: {
    providerCustomerId: string | null;
    pricingPlanReferenceCode: string;
    customer: ProviderCustomerInput;
    callbackUrl: string;
    idempotencyKey: string;
  }): Promise<{
    providerCheckoutId: string;
    checkoutFormContent: string | null;
    redirectUrl: string | null;
    expiresAt: string | null;
  }>;

  getCheckout(input: { providerCheckoutId: string; idempotencyKey?: string }): Promise<{
    providerCheckoutId: string;
    status: CheckoutState;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerParentReference: string | null;
    subscriptionStatus: BillingState;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
  }>;

  getSubscription(input: { providerSubscriptionId: string }): Promise<{
    providerSubscriptionId: string;
    providerCustomerId: string | null;
    providerParentReference: string | null;
    status: BillingState;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
  }>;

  cancelSubscription(input: {
    providerSubscriptionId: string;
    cancelAtPeriodEnd: boolean;
    idempotencyKey: string;
  }): Promise<{ providerSubscriptionId: string; status: "CANCELED"; effectiveAt: string }>;

  refund(input: {
    providerPaymentId: string;
    amountMinor: number | null;
    currency: string;
    idempotencyKey: string;
  }): Promise<{
    providerRefundId: string;
    providerPaymentId: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    amountMinor: number;
    currency: string;
  }>;

  verifyWebhook(input: {
    rawBody: Uint8Array;
    headers: Record<string, string | undefined>;
    receivedAt: string;
  }): Promise<{
    providerEventId: string;
    signatureVerified: true;
    occurredAt: string;
    rawPayload: unknown;
  }>;

  parseWebhook(input: {
    verified: {
      providerEventId: string;
      occurredAt: string;
      rawPayload: unknown;
    };
  }): {
    eventType: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerPaymentId: string | null;
    providerOrderReference: string | null;
    merchantId: string | null;
    status: BillingState;
    effectiveAt: string | null;
    payloadVersion: string | null;
  };

  getPaymentStatus(input: { providerPaymentId: string }): Promise<{
    providerPaymentId: string;
    status: PaymentState;
    amountMinor: number | null;
    currency: string | null;
  }>;
}
