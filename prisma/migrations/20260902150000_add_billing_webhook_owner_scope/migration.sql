-- Aligns the already-applied 8H-5 migration with Prisma's explicit owner
-- relations. The 8H-5 migration already contains these owner fields, so this
-- migration is intentionally idempotent for fresh databases and older local
-- databases. Nullable owner scope is intentional for rejected/unknown events.
ALTER TABLE "BillingWebhookEvent"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BillingWebhookEvent_userId_fkey'
  ) THEN
    ALTER TABLE "BillingWebhookEvent"
      ADD CONSTRAINT "BillingWebhookEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BillingWebhookEvent_tenantId_fkey'
  ) THEN
    ALTER TABLE "BillingWebhookEvent"
      ADD CONSTRAINT "BillingWebhookEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX "BillingWebhookEvent_tenantId_receivedAt_idx"
  ON "BillingWebhookEvent"("tenantId", "receivedAt");
