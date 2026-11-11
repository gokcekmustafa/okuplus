import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261110120000_add_support_and_notifications/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("support and notification migration security contract", () => {
  it("preserves open deletion requests and backfills admin notifications idempotently", () => {
    expect(migration).toContain("'IDENTITY_REQUIRED', 'UNDER_REVIEW', 'AWAITING_USER'");
    expect(migration).toContain('ON CONFLICT ("dedupeKey") DO NOTHING');
    expect(migration).toContain(
      "request.\"status\" IN ('IDENTITY_REQUIRED', 'UNDER_REVIEW', 'AWAITING_USER')",
    );
    expect(migration).not.toContain('DROP TABLE "AccountDeletionRequest"');
  });

  it("forces RLS on every new user-content table and limits ownership policies", () => {
    for (const table of [
      "AccountDeletionRequestMessage",
      "AccountDeletionRequestActivity",
      "SupportTicket",
      "SupportTicketMessage",
      "SupportTicketActivity",
      "Notification",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain(
      "\"ownerUserId\" = NULLIF(current_setting('app.user_id', true), '')",
    );
    expect(migration).toContain(
      "\"recipientUserId\" = NULLIF(current_setting('app.user_id', true), '')",
    );
  });

  it("restricts the notification definer function and validates the actor-owned target", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.notify_super_admins");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.notify_super_admins");
    expect(migration).toContain("notification target is outside actor scope");
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.notify_super_admins(TEXT, TEXT, TEXT, TEXT, TEXT) TO PUBLIC",
    );
  });

  it("keeps deletion requests in a non-destructive review lifecycle", () => {
    expect(migration).toContain("'AWAITING_USER'");
    expect(migration).toContain("'DECLINED'");
    expect(migration).not.toContain("'COMPLETED'");
    expect(migration).toContain('CREATE POLICY "account_deletion_request_owner_reply"');
    expect(migration).toContain(
      "OLD.\"status\" = 'AWAITING_USER'\n        AND NEW.\"status\" = 'UNDER_REVIEW'",
    );
    expect(migration).toContain('CREATE TRIGGER "AccountDeletionRequest_status_audit"');
    expect(migration).toContain("CREATE FUNCTION public.guard_notification_read_update()");
    expect(migration).toContain('CREATE TRIGGER "SupportTicket_workflow_fields_only_update"');
  });
});
