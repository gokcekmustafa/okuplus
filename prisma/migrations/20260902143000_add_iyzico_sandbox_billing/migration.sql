-- 8H-5: additive, TEST-only billing foundation for the iyzico sandbox adapter.
-- No production connection, account, webhook or payment is referenced here.

ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'PREMIUM_CHECKOUT_STARTED';
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'PREMIUM_CHECKOUT_COMPLETED';
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'PREMIUM_CHECKOUT_FAILED';
ALTER TYPE "PilotEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CANCELED';

CREATE TYPE "BillingSubscriptionStatus" AS ENUM (
  'PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'UNKNOWN'
);
CREATE TYPE "BillingPaymentStatus" AS ENUM (
  'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'UNKNOWN'
);
CREATE TYPE "BillingCheckoutStatus" AS ENUM (
  'OPEN', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELED'
);
CREATE TYPE "BillingWebhookStatus" AS ENUM (
  'RECEIVED', 'PROCESSED', 'IGNORED', 'CONFLICT', 'REJECTED', 'FAILED'
);

CREATE TABLE "BillingCustomer" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scope" "EntitlementScope" NOT NULL,
  "providerCode" TEXT NOT NULL,
  "providerCustomerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingCustomer_scope_check" CHECK ("scope" = 'PERSONAL'),
  CONSTRAINT "BillingCustomer_provider_check" CHECK (length(btrim("providerCode")) > 0)
);

CREATE TABLE "BillingCheckout" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "customerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerCode" TEXT NOT NULL,
  "providerCheckoutId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "billingPeriod" TEXT NOT NULL,
  "pricingPlanReference" TEXT NOT NULL,
  "status" "BillingCheckoutStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingCheckout_idempotency_check" CHECK (length(btrim("idempotencyKey")) > 0),
  CONSTRAINT "BillingCheckout_plan_check" CHECK (length(btrim("pricingPlanReference")) > 0)
);

CREATE TABLE "BillingSubscription" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "customerId" TEXT NOT NULL,
  "checkoutId" TEXT,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerCode" TEXT NOT NULL,
  "providerSubscriptionId" TEXT,
  "providerParentReference" TEXT,
  "pricingPlanReference" TEXT NOT NULL,
  "billingPeriod" TEXT NOT NULL,
  "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "lastEventId" TEXT,
  "lastProviderVersion" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingPayment" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "customerId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerCode" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerOrderReference" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "providerRefundId" TEXT,
  "refundIdempotencyKey" TEXT,
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" INTEGER,
  "currency" TEXT,
  "occurredAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingPayment_order_check" CHECK (length(btrim("providerOrderReference")) > 0)
);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "providerCode" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "BillingWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "payloadHash" TEXT NOT NULL,
  "merchantId" TEXT,
  "customerReferenceCode" TEXT,
  "subscriptionReferenceCode" TEXT,
  "orderReferenceCode" TEXT,
  "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "customerId" TEXT,
  "subscriptionId" TEXT,
  "userId" TEXT,
  "tenantId" TEXT,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingWebhookEvent_provider_id_check" CHECK (length(btrim("providerEventId")) > 0),
  CONSTRAINT "BillingWebhookEvent_hash_check" CHECK (length(btrim("payloadHash")) > 0)
);

CREATE UNIQUE INDEX "BillingCustomer_providerCode_userId_tenantId_key"
  ON "BillingCustomer"("providerCode", "userId", "tenantId");
CREATE UNIQUE INDEX "BillingCustomer_providerCode_providerCustomerId_key"
  ON "BillingCustomer"("providerCode", "providerCustomerId");
CREATE INDEX "BillingCustomer_userId_tenantId_scope_idx"
  ON "BillingCustomer"("userId", "tenantId", "scope");

CREATE UNIQUE INDEX "BillingCheckout_providerCode_userId_tenantId_idempotencyKey_key"
  ON "BillingCheckout"("providerCode", "userId", "tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "BillingCheckout_providerCode_providerCheckoutId_key"
  ON "BillingCheckout"("providerCode", "providerCheckoutId");
CREATE INDEX "BillingCheckout_userId_tenantId_status_createdAt_idx"
  ON "BillingCheckout"("userId", "tenantId", "status", "createdAt");

CREATE UNIQUE INDEX "BillingSubscription_providerCode_providerSubscriptionId_key"
  ON "BillingSubscription"("providerCode", "providerSubscriptionId");
CREATE UNIQUE INDEX "BillingSubscription_checkoutId_key"
  ON "BillingSubscription"("checkoutId");
CREATE INDEX "BillingSubscription_userId_tenantId_status_createdAt_idx"
  ON "BillingSubscription"("userId", "tenantId", "status", "createdAt");

CREATE UNIQUE INDEX "BillingPayment_providerCode_providerOrderReference_key"
  ON "BillingPayment"("providerCode", "providerOrderReference");
CREATE INDEX "BillingPayment_userId_tenantId_status_createdAt_idx"
  ON "BillingPayment"("userId", "tenantId", "status", "createdAt");

CREATE UNIQUE INDEX "BillingWebhookEvent_providerCode_providerEventId_key"
  ON "BillingWebhookEvent"("providerCode", "providerEventId");
CREATE INDEX "BillingWebhookEvent_providerCode_eventType_receivedAt_idx"
  ON "BillingWebhookEvent"("providerCode", "eventType", "receivedAt");
CREATE INDEX "BillingWebhookEvent_subscriptionReferenceCode_occurredAt_idx"
  ON "BillingWebhookEvent"("subscriptionReferenceCode", "occurredAt");

ALTER TABLE "BillingCustomer"
  ADD CONSTRAINT "BillingCustomer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCustomer"
  ADD CONSTRAINT "BillingCustomer_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCheckout"
  ADD CONSTRAINT "BillingCheckout_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCheckout"
  ADD CONSTRAINT "BillingCheckout_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCheckout"
  ADD CONSTRAINT "BillingCheckout_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_checkoutId_fkey"
  FOREIGN KEY ("checkoutId") REFERENCES "BillingCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense-in-depth tenant isolation. The webhook ingress policy is limited to
-- an explicit transaction-local GUC set by the verified provider processor.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['BillingCustomer','BillingCheckout','BillingSubscription','BillingPayment'] LOOP
    EXECUTE format('ALTER TABLE "%s" ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE "%s" FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY "billing_customer_tenant_read" ON "BillingCustomer"
  FOR SELECT USING (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY "billing_customer_tenant_write" ON "BillingCustomer"
  FOR ALL USING (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY "billing_checkout_tenant_access" ON "BillingCheckout"
  FOR ALL USING (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY "billing_subscription_tenant_access" ON "BillingSubscription"
  FOR ALL USING (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY "billing_payment_tenant_access" ON "BillingPayment"
  FOR ALL USING (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.platform_role', true) <> '' OR "tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "BillingWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingWebhookEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_webhook_ingress_or_platform" ON "BillingWebhookEvent"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR current_setting('app.webhook_ingest', true) = 'iyzico'
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR current_setting('app.webhook_ingest', true) = 'iyzico'
  );

-- Billing webhook processing is allowed to deactivate an existing entitlement
-- only from the verified tenant-scoped transaction.
CREATE POLICY "entitlement_billing_update" ON "Entitlement"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR current_setting('app.webhook_ingest', true) = 'iyzico'
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR current_setting('app.webhook_ingest', true) = 'iyzico'
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
