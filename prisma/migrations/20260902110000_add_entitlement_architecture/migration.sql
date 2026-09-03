-- 8H-1 entitlement foundation: additive, TEST-only during this stage.
-- This is an entitlement/usage model, not a billing or payment transaction model.

CREATE TYPE "EntitlementPlan" AS ENUM ('PLAN_FREE', 'PLAN_PREMIUM');
CREATE TYPE "EntitlementScope" AS ENUM ('PERSONAL', 'ORGANIZATION');

CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "userId" TEXT,
    "tenantId" TEXT NOT NULL,
    "scope" "EntitlementScope" NOT NULL,
    "plan" "EntitlementPlan" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Entitlement_scope_owner_check" CHECK (
      ("scope" = 'PERSONAL' AND "userId" IS NOT NULL)
      OR ("scope" = 'ORGANIZATION' AND "userId" IS NULL)
    ),
    CONSTRAINT "Entitlement_source_nonempty_check" CHECK (length(btrim("source")) > 0),
    CONSTRAINT "Entitlement_expiry_after_effective_check" CHECK (
      "expiresAt" IS NULL OR "expiresAt" > "effectiveAt"
    )
);

CREATE TABLE "EntitlementUsage" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "usageDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitlementUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EntitlementUsage_feature_nonempty_check" CHECK (length(btrim("feature")) > 0),
    CONSTRAINT "EntitlementUsage_date_format_check" CHECK ("usageDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    CONSTRAINT "EntitlementUsage_timezone_nonempty_check" CHECK (length(btrim("timezone")) > 0),
    CONSTRAINT "EntitlementUsage_idempotency_nonempty_check" CHECK (length(btrim("idempotencyKey")) > 0)
);

CREATE INDEX "Entitlement_userId_tenantId_scope_active_idx"
  ON "Entitlement"("userId", "tenantId", "scope", "active");
CREATE INDEX "Entitlement_tenantId_scope_active_effectiveAt_idx"
  ON "Entitlement"("tenantId", "scope", "active", "effectiveAt");
CREATE UNIQUE INDEX "EntitlementUsage_tenantId_userId_feature_usageDate_idempotencyKey_key"
  ON "EntitlementUsage"("tenantId", "userId", "feature", "usageDate", "idempotencyKey");
CREATE INDEX "EntitlementUsage_tenantId_userId_feature_usageDate_idx"
  ON "EntitlementUsage"("tenantId", "userId", "feature", "usageDate");

ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitlementUsage"
  ADD CONSTRAINT "EntitlementUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitlementUsage"
  ADD CONSTRAINT "EntitlementUsage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation is defense in depth. App service also verifies user
-- membership and the PERSONAL/ORGANIZATION scope before returning data.
ALTER TABLE "Entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entitlement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "entitlement_tenant_read" ON "Entitlement"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "entitlement_tenant_insert" ON "Entitlement"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "EntitlementUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EntitlementUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "entitlement_usage_tenant_read" ON "EntitlementUsage"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "entitlement_usage_tenant_insert" ON "EntitlementUsage"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
