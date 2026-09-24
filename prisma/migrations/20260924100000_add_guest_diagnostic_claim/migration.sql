-- Guest Diagnostic result handoff.
--
-- The claim is deliberately an opaque user identifier rather than a foreign
-- key. The restricted guest role must not gain access to User, Tenant or
-- Membership, and the claim endpoint is the only server-controlled writer.

ALTER TABLE "GuestDiagnosticSession"
    ADD COLUMN "claimedUserId" TEXT,
    ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE INDEX "GuestDiagnosticSession_claimedUserId_status_claimedAt_idx"
    ON "GuestDiagnosticSession" ("claimedUserId", "status", "claimedAt");

DROP POLICY IF EXISTS "guest_diagnostic_session_select" ON "GuestDiagnosticSession";
CREATE POLICY "guest_diagnostic_session_select"
    ON "GuestDiagnosticSession"
    FOR SELECT
    USING (
        "id" = NULLIF(current_setting('app.guest_session_id', true), '')
        OR (
            "claimedUserId" = NULLIF(current_setting('app.guest_user_id', true), '')
            AND current_setting('app.guest_operation', true) = 'USER_READ'
        )
    );

DROP POLICY IF EXISTS "guest_diagnostic_session_update" ON "GuestDiagnosticSession";
CREATE POLICY "guest_diagnostic_session_update"
    ON "GuestDiagnosticSession"
    FOR UPDATE
    USING (
        "id" = NULLIF(current_setting('app.guest_session_id', true), '')
        AND current_setting('app.guest_operation', true) IN ('ANSWER', 'COMPLETE', 'EXPIRE', 'CLAIM')
    )
    WITH CHECK ("id" = NULLIF(current_setting('app.guest_session_id', true), ''));

DROP POLICY IF EXISTS "guest_diagnostic_result_select" ON "GuestDiagnosticResult";
CREATE POLICY "guest_diagnostic_result_select"
    ON "GuestDiagnosticResult"
    FOR SELECT
    USING (
        "sessionId" = NULLIF(current_setting('app.guest_session_id', true), '')
        OR (
            current_setting('app.guest_operation', true) = 'USER_READ'
            AND EXISTS (
                SELECT 1
                FROM "GuestDiagnosticSession" AS session
                WHERE session."id" = "GuestDiagnosticResult"."sessionId"
                  AND session."claimedUserId" = NULLIF(current_setting('app.guest_user_id', true), '')
            )
        )
    );
