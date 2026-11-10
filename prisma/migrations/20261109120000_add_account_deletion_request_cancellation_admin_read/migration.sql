-- Preserve request history while allowing an owner to withdraw an unprocessed
-- request and permitting explicitly authorized platform admins to review it.
ALTER TABLE "AccountDeletionRequest"
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "AccountDeletionRequest"
  DROP CONSTRAINT "AccountDeletionRequest_status_check";
ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_status_check"
  CHECK ("status" IN ('IDENTITY_REQUIRED', 'CANCELLED'));

-- The owner can transition only their own identity-pending request to
-- CANCELLED. The cancelled row remains selectable by that same owner.
CREATE POLICY "account_deletion_request_owner_cancel"
  ON "AccountDeletionRequest"
  FOR UPDATE
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "status" = 'IDENTITY_REQUIRED'
  )
  WITH CHECK (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "status" = 'CANCELLED'
    AND "cancelledAt" IS NOT NULL
  );

-- Defense in depth for the separately guarded SUPER_ADMIN list endpoint.
-- This grants read access only and does not add any administrative write path.
CREATE POLICY "account_deletion_request_super_admin_select"
  ON "AccountDeletionRequest"
  FOR SELECT
  USING (NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN');
