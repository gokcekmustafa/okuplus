-- Security-context support only. This does not change guest tables.
-- The token hash is set only by the server-side restricted guest helper;
-- clients never receive a database context or raw token lookup capability.

CREATE POLICY "guest_diagnostic_session_token_lookup"
    ON "GuestDiagnosticSession"
    FOR SELECT
    USING (
        "tokenHash" = NULLIF(current_setting('app.guest_token_hash', true), '')
        AND current_setting('app.guest_operation', true) = 'LOOKUP'
    );
