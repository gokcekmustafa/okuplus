-- 8H-6: make billing state transitions auditable without storing provider payloads.
ALTER TABLE "BillingWebhookEvent"
  ADD COLUMN "previousState" "BillingSubscriptionStatus",
  ADD COLUMN "newState" "BillingSubscriptionStatus";

CREATE INDEX "BillingWebhookEvent_subscriptionId_occurredAt_idx"
  ON "BillingWebhookEvent"("subscriptionId", "occurredAt");

-- Local cancellation audit events are written from an authenticated tenant
-- transaction, while provider ingress continues to require the webhook GUC.
DROP POLICY "billing_webhook_ingress_or_platform" ON "BillingWebhookEvent";
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
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
