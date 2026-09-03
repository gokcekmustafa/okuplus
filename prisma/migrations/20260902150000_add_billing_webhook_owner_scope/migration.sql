-- Aligns the already-applied 8H-5 migration with Prisma's explicit owner
-- relations. Nullable owner scope is intentional for rejected/unknown events.
ALTER TABLE "BillingWebhookEvent"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "tenantId" TEXT;

ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BillingWebhookEvent_tenantId_receivedAt_idx"
  ON "BillingWebhookEvent"("tenantId", "receivedAt");
