-- 8G-10 pilot readiness: enforce tenant isolation for the additive pilot tables.
-- Student ownership remains an application-level rule; platform roles may audit.

ALTER TABLE "PilotEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pilot_event_tenant_read" ON "PilotEvent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "pilot_event_tenant_insert" ON "PilotEvent"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "PilotFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotFeedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pilot_feedback_tenant_read" ON "PilotFeedback"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "pilot_feedback_tenant_insert" ON "PilotFeedback"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "PilotBugReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotBugReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pilot_bug_tenant_read" ON "PilotBugReport"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "pilot_bug_tenant_insert" ON "PilotBugReport"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
