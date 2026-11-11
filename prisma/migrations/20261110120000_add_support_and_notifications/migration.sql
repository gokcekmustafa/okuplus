-- Add request review, support conversations, and persistent in-app notifications.
-- Existing requests and pilot feedback remain intact; no account or learning data is changed.

ALTER TABLE "AccountDeletionRequest"
  DROP CONSTRAINT "AccountDeletionRequest_status_check";
ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_status_check"
  CHECK ("status" IN (
    'IDENTITY_REQUIRED',
    'UNDER_REVIEW',
    'AWAITING_USER',
    'DECLINED',
    'CANCELLED'
  ));

DROP INDEX "AccountDeletionRequest_one_open_per_user_key";
CREATE UNIQUE INDEX "AccountDeletionRequest_one_open_per_user_key"
  ON "AccountDeletionRequest"("userId")
  WHERE "status" IN ('IDENTITY_REQUIRED', 'UNDER_REVIEW', 'AWAITING_USER');

CREATE TABLE "AccountDeletionRequestMessage" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "requestId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "visibleToUser" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountDeletionRequestMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletionRequestMessage_body_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 5000)
);

CREATE TABLE "AccountDeletionRequestActivity" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "requestId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" VARCHAR(32) NOT NULL,
  "fromStatus" VARCHAR(32),
  "toStatus" VARCHAR(32),
  "note" TEXT,
  "visibleToUser" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountDeletionRequestActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletionRequestActivity_eventType_check"
    CHECK ("eventType" IN ('CREATED', 'STATUS_CHANGED', 'INTERNAL_NOTE')),
  CONSTRAINT "AccountDeletionRequestActivity_note_check"
    CHECK ("note" IS NULL OR char_length("note") <= 5000)
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "ownerUserId" TEXT NOT NULL,
  "subject" VARCHAR(160) NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicket_subject_check"
    CHECK (char_length(btrim("subject")) BETWEEN 1 AND 160),
  CONSTRAINT "SupportTicket_category_check"
    CHECK ("category" IN ('ACCOUNT', 'TECHNICAL', 'LEARNING_PATH', 'PAYMENT', 'OTHER')),
  CONSTRAINT "SupportTicket_status_check"
    CHECK ("status" IN ('NEW', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'))
);

CREATE TABLE "SupportTicketMessage" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "ticketId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicketMessage_body_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 5000)
);

CREATE TABLE "SupportTicketActivity" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "ticketId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" VARCHAR(32) NOT NULL,
  "fromStatus" VARCHAR(32),
  "toStatus" VARCHAR(32),
  "note" TEXT,
  "visibleToUser" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicketActivity_eventType_check"
    CHECK ("eventType" IN ('CREATED', 'STATUS_CHANGED', 'INTERNAL_NOTE')),
  CONSTRAINT "SupportTicketActivity_note_check"
    CHECK ("note" IS NULL OR char_length("note") <= 5000)
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "recipientUserId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "recipientAudience" VARCHAR(24) NOT NULL,
  "kind" VARCHAR(48) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "body" VARCHAR(280) NOT NULL,
  "targetType" VARCHAR(40) NOT NULL,
  "targetId" VARCHAR(128) NOT NULL,
  "dedupeKey" VARCHAR(240) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_dedupeKey_key" UNIQUE ("dedupeKey"),
  CONSTRAINT "Notification_audience_check"
    CHECK ("recipientAudience" IN ('USER', 'SUPER_ADMIN')),
  CONSTRAINT "Notification_kind_check"
    CHECK ("kind" IN (
      'ACCOUNT_DELETION_REQUEST_CREATED',
      'ACCOUNT_DELETION_REQUEST_UPDATED',
      'SUPPORT_TICKET_CREATED',
      'SUPPORT_TICKET_UPDATED'
    )),
  CONSTRAINT "Notification_targetType_check"
    CHECK ("targetType" IN ('ACCOUNT_DELETION_REQUEST', 'SUPPORT_TICKET')),
  CONSTRAINT "Notification_title_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "Notification_body_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 280)
);

ALTER TABLE "AccountDeletionRequestMessage"
  ADD CONSTRAINT "AccountDeletionRequestMessage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "AccountDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountDeletionRequestMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountDeletionRequestActivity"
  ADD CONSTRAINT "AccountDeletionRequestActivity_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "AccountDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountDeletionRequestActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage"
  ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SupportTicketMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketActivity"
  ADD CONSTRAINT "SupportTicketActivity_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SupportTicketActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccountDeletionRequestMessage_requestId_createdAt_idx"
  ON "AccountDeletionRequestMessage"("requestId", "createdAt");
CREATE INDEX "AccountDeletionRequestActivity_requestId_createdAt_idx"
  ON "AccountDeletionRequestActivity"("requestId", "createdAt");
CREATE INDEX "AccountDeletionRequestActivity_actorUserId_createdAt_idx"
  ON "AccountDeletionRequestActivity"("actorUserId", "createdAt");
CREATE INDEX "SupportTicket_ownerUserId_createdAt_idx"
  ON "SupportTicket"("ownerUserId", "createdAt");
CREATE INDEX "SupportTicket_status_updatedAt_idx"
  ON "SupportTicket"("status", "updatedAt");
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx"
  ON "SupportTicketMessage"("ticketId", "createdAt");
CREATE INDEX "SupportTicketMessage_authorUserId_createdAt_idx"
  ON "SupportTicketMessage"("authorUserId", "createdAt");
CREATE INDEX "SupportTicketActivity_ticketId_createdAt_idx"
  ON "SupportTicketActivity"("ticketId", "createdAt");
CREATE INDEX "SupportTicketActivity_actorUserId_createdAt_idx"
  ON "SupportTicketActivity"("actorUserId", "createdAt");
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx"
  ON "Notification"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "Notification_targetType_targetId_readAt_idx"
  ON "Notification"("targetType", "targetId", "readAt");

-- Keep old account-deletion records and give each one a visible creation entry.
INSERT INTO "AccountDeletionRequestActivity" (
  "requestId", "actorUserId", "eventType", "toStatus", "note", "visibleToUser", "createdAt"
)
SELECT "id", "userId", 'CREATED', "status", 'Talep kaydedildi.', TRUE, "createdAt"
FROM "AccountDeletionRequest";

-- Notify each active Super Admin about existing open requests once. The unique
-- dedupe key makes this backfill safe to retry without changing request data.
INSERT INTO "Notification" (
  "recipientUserId", "actorUserId", "recipientAudience", "kind", "title", "body",
  "targetType", "targetId", "dedupeKey", "createdAt"
)
SELECT
  admin."id",
  request."userId",
  'SUPER_ADMIN',
  'ACCOUNT_DELETION_REQUEST_CREATED',
  'Yeni hesap silme talebi',
  'Bekleyen bir hesap silme talebi inceleme bekliyor.',
  'ACCOUNT_DELETION_REQUEST',
  request."id",
  'account-deletion:' || request."id" || ':created:' || admin."id",
  request."createdAt"
FROM "AccountDeletionRequest" AS request
CROSS JOIN "User" AS admin
WHERE request."status" IN ('IDENTITY_REQUIRED', 'UNDER_REVIEW', 'AWAITING_USER')
  AND admin."platformRole" = 'SUPER_ADMIN'
  AND admin."status" = 'ACTIVE'
  AND admin."deletedAt" IS NULL
ON CONFLICT ("dedupeKey") DO NOTHING;

ALTER TABLE "AccountDeletionRequestMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountDeletionRequestMessage" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AccountDeletionRequestActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountDeletionRequestActivity" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketMessage" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketActivity" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

CREATE POLICY "account_deletion_request_admin_update"
  ON "AccountDeletionRequest" FOR UPDATE
  USING (NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN')
  WITH CHECK (NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN');

-- A request owner may only return an information-requested record to review.
CREATE POLICY "account_deletion_request_owner_reply"
  ON "AccountDeletionRequest" FOR UPDATE
  USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "status" = 'AWAITING_USER'
    AND NULLIF(current_setting('app.platform_role', true), '') IS NULL
  )
  WITH CHECK (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "status" = 'UNDER_REVIEW'
    AND NULLIF(current_setting('app.platform_role', true), '') IS NULL
  );

CREATE POLICY "account_deletion_message_owner_or_admin_select"
  ON "AccountDeletionRequestMessage" FOR SELECT
  USING (
    NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
    OR (
      "visibleToUser"
      AND EXISTS (
        SELECT 1 FROM "AccountDeletionRequest" AS request
        WHERE request."id" = "AccountDeletionRequestMessage"."requestId"
          AND request."userId" = NULLIF(current_setting('app.user_id', true), '')
      )
    )
  );
CREATE POLICY "account_deletion_message_owner_or_admin_insert"
  ON "AccountDeletionRequestMessage" FOR INSERT
  WITH CHECK (
    "authorUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "AccountDeletionRequest" AS request
      WHERE request."id" = "AccountDeletionRequestMessage"."requestId"
        AND (
          request."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND "visibleToUser"
          OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
        )
    )
  );
CREATE POLICY "account_deletion_activity_owner_or_admin_select"
  ON "AccountDeletionRequestActivity" FOR SELECT
  USING (
    NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
    OR (
      "visibleToUser"
      AND EXISTS (
        SELECT 1 FROM "AccountDeletionRequest" AS request
        WHERE request."id" = "AccountDeletionRequestActivity"."requestId"
          AND request."userId" = NULLIF(current_setting('app.user_id', true), '')
      )
    )
  );
CREATE POLICY "account_deletion_activity_owner_or_admin_insert"
  ON "AccountDeletionRequestActivity" FOR INSERT
  WITH CHECK (
    "actorUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "AccountDeletionRequest" AS request
      WHERE request."id" = "AccountDeletionRequestActivity"."requestId"
        AND (
          request."userId" = NULLIF(current_setting('app.user_id', true), '')
          OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
        )
    )
    AND ("visibleToUser" OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN')
  );

CREATE POLICY "support_ticket_owner_or_admin_select"
  ON "SupportTicket" FOR SELECT
  USING (
    "ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
    OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
  );
CREATE POLICY "support_ticket_owner_insert"
  ON "SupportTicket" FOR INSERT
  WITH CHECK (
    "ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND NULLIF(current_setting('app.platform_role', true), '') IS NULL
  );
CREATE POLICY "support_ticket_admin_update"
  ON "SupportTicket" FOR UPDATE
  USING (NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN')
  WITH CHECK (NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN');
CREATE POLICY "support_ticket_owner_reopen"
  ON "SupportTicket" FOR UPDATE
  USING ("ownerUserId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (
    "ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND "status" IN ('NEW', 'IN_PROGRESS')
    AND "closedAt" IS NULL
  );

CREATE POLICY "support_message_owner_or_admin_select"
  ON "SupportTicketMessage" FOR SELECT
  USING (
    NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
    OR EXISTS (
      SELECT 1 FROM "SupportTicket" AS ticket
      WHERE ticket."id" = "SupportTicketMessage"."ticketId"
        AND ticket."ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
    )
  );
CREATE POLICY "support_message_owner_or_admin_insert"
  ON "SupportTicketMessage" FOR INSERT
  WITH CHECK (
    "authorUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "SupportTicket" AS ticket
      WHERE ticket."id" = "SupportTicketMessage"."ticketId"
        AND (
          ticket."ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
          OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
        )
    )
  );

CREATE POLICY "support_activity_owner_or_admin_select"
  ON "SupportTicketActivity" FOR SELECT
  USING (
    NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
    OR (
      "visibleToUser"
      AND EXISTS (
        SELECT 1 FROM "SupportTicket" AS ticket
        WHERE ticket."id" = "SupportTicketActivity"."ticketId"
          AND ticket."ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
      )
    )
  );
CREATE POLICY "support_activity_owner_or_admin_insert"
  ON "SupportTicketActivity" FOR INSERT
  WITH CHECK (
    "actorUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM "SupportTicket" AS ticket
      WHERE ticket."id" = "SupportTicketActivity"."ticketId"
        AND (
          ticket."ownerUserId" = NULLIF(current_setting('app.user_id', true), '')
          OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
        )
    )
    AND ("visibleToUser" OR NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN')
  );

CREATE POLICY "notification_recipient_select"
  ON "Notification" FOR SELECT
  USING ("recipientUserId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY "notification_recipient_read_update"
  ON "Notification" FOR UPDATE
  USING ("recipientUserId" = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK ("recipientUserId" = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY "notification_authenticated_insert"
  ON "Notification" FOR INSERT
  WITH CHECK (
    "actorUserId" = NULLIF(current_setting('app.user_id', true), '')
    AND (
      (
        "recipientAudience" = 'SUPER_ADMIN'
        AND NULLIF(current_setting('app.notification_writer', true), '') = 'true'
      )
      OR (
        "recipientAudience" = 'USER'
        AND NULLIF(current_setting('app.platform_role', true), '') = 'SUPER_ADMIN'
      )
    )
  );

-- Keep status transitions within the declared workflow and guarantee an audit
-- row even if an allowed status update is issued outside the HTTP service.
CREATE FUNCTION public.guard_account_deletion_request_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_platform_role TEXT := NULLIF(current_setting('app.platform_role', true), '');
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'account deletion request identity is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt"
     AND NOT (
       actor_platform_role IS NULL
       AND OLD."status" = 'IDENTITY_REQUIRED'
       AND NEW."status" = 'CANCELLED'
       AND NEW."cancelledAt" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'account deletion cancellation timestamp is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF actor_platform_role = 'SUPER_ADMIN' THEN
      IF NOT (
        (OLD."status" = 'IDENTITY_REQUIRED' AND NEW."status" IN ('UNDER_REVIEW', 'AWAITING_USER', 'DECLINED'))
        OR (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('IDENTITY_REQUIRED', 'AWAITING_USER', 'DECLINED'))
        OR (OLD."status" = 'AWAITING_USER' AND NEW."status" IN ('UNDER_REVIEW', 'DECLINED'))
      ) THEN
        RAISE EXCEPTION 'account deletion transition is not allowed' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (
      (OLD."status" = 'IDENTITY_REQUIRED'
        AND NEW."status" = 'CANCELLED'
        AND NEW."cancelledAt" IS NOT NULL)
      OR (OLD."status" = 'AWAITING_USER'
        AND NEW."status" = 'UNDER_REVIEW'
        AND NEW."cancelledAt" IS NULL)
    ) THEN
      RAISE EXCEPTION 'account deletion transition is not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "AccountDeletionRequest_workflow_guard"
  BEFORE UPDATE ON "AccountDeletionRequest"
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_request_update();

CREATE FUNCTION public.audit_account_deletion_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_user_id TEXT := NULLIF(current_setting('app.user_id', true), '');
  actor_platform_role TEXT := NULLIF(current_setting('app.platform_role', true), '');
  activity_note TEXT;
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'account deletion status change requires an actor' USING ERRCODE = '42501';
  END IF;
  activity_note := CASE
    WHEN NEW."status" = 'CANCELLED' THEN 'Talep kullanıcı tarafından geri çekildi.'
    WHEN actor_platform_role IS NULL THEN 'Ek bilgi alındı; talep yeniden incelemeye alındı.'
    ELSE 'Talep durumu güncellendi.'
  END;
  INSERT INTO public."AccountDeletionRequestActivity" (
    "requestId", "actorUserId", "eventType", "fromStatus", "toStatus", "note", "visibleToUser"
  ) VALUES (
    NEW."id", actor_user_id, 'STATUS_CHANGED', OLD."status", NEW."status", activity_note, TRUE
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "AccountDeletionRequest_status_audit"
  AFTER UPDATE OF "status" ON "AccountDeletionRequest"
  FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status")
  EXECUTE FUNCTION public.audit_account_deletion_request_status_change();

-- The narrowly scoped SECURITY DEFINER routine can notify active Super Admins
-- without exposing their account list under ordinary user RLS contexts.
CREATE FUNCTION public.notify_super_admins(
  p_actor_user_id TEXT,
  p_event_key TEXT,
  p_kind TEXT,
  p_target_type TEXT,
  p_target_id TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  previous_platform_role TEXT := current_setting('app.platform_role', true);
  previous_notification_writer TEXT := current_setting('app.notification_writer', true);
  notification_title TEXT;
  notification_body TEXT;
  expected_target_type TEXT;
  target_owner_matches BOOLEAN;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')
     OR NULLIF(previous_platform_role, '') IS NOT NULL THEN
    RAISE EXCEPTION 'notification actor context mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_event_key IS NULL OR length(p_event_key) < 1 OR length(p_event_key) > 180
     OR p_target_id IS NULL OR length(p_target_id) < 1 OR length(p_target_id) > 128 THEN
    RAISE EXCEPTION 'notification target is invalid' USING ERRCODE = '22023';
  END IF;

  CASE p_kind
    WHEN 'ACCOUNT_DELETION_REQUEST_CREATED' THEN
      expected_target_type := 'ACCOUNT_DELETION_REQUEST';
      notification_title := 'Yeni hesap silme talebi';
      notification_body := 'Bekleyen bir hesap silme talebi inceleme bekliyor.';
    WHEN 'ACCOUNT_DELETION_REQUEST_USER_MESSAGE' THEN
      expected_target_type := 'ACCOUNT_DELETION_REQUEST';
      notification_title := 'Hesap silme talebine yanıt';
      notification_body := 'Bir kullanıcı hesap silme talebine yanıt verdi.';
    WHEN 'SUPPORT_TICKET_CREATED' THEN
      expected_target_type := 'SUPPORT_TICKET';
      notification_title := 'Yeni destek talebi';
      notification_body := 'Yeni bir destek talebi inceleme bekliyor.';
    WHEN 'SUPPORT_TICKET_USER_MESSAGE' THEN
      expected_target_type := 'SUPPORT_TICKET';
      notification_title := 'Yeni destek yanıtı';
      notification_body := 'Bir kullanıcı destek talebine yanıt verdi.';
    ELSE
      RAISE EXCEPTION 'notification kind is not allowed' USING ERRCODE = '22023';
  END CASE;
  IF p_target_type IS DISTINCT FROM expected_target_type THEN
    RAISE EXCEPTION 'notification target type does not match' USING ERRCODE = '22023';
  END IF;

  IF expected_target_type = 'ACCOUNT_DELETION_REQUEST' THEN
    SELECT EXISTS (
      SELECT 1 FROM public."AccountDeletionRequest" AS request
      WHERE request."id" = p_target_id AND request."userId" = p_actor_user_id
    ) INTO target_owner_matches;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public."SupportTicket" AS ticket
      WHERE ticket."id" = p_target_id AND ticket."ownerUserId" = p_actor_user_id
    ) INTO target_owner_matches;
  END IF;
  IF NOT COALESCE(target_owner_matches, FALSE) THEN
    RAISE EXCEPTION 'notification target is outside actor scope' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.platform_role', 'SUPER_ADMIN', true);
  PERFORM set_config('app.notification_writer', 'true', true);
  INSERT INTO public."Notification" (
    "recipientUserId", "actorUserId", "recipientAudience", "kind", "title", "body",
    "targetType", "targetId", "dedupeKey", "createdAt"
  )
  SELECT
    admin."id", p_actor_user_id, 'SUPER_ADMIN', p_kind, notification_title, notification_body,
    expected_target_type, p_target_id, p_event_key || ':' || admin."id", CURRENT_TIMESTAMP
  FROM public."User" AS admin
  WHERE admin."platformRole" = 'SUPER_ADMIN'
    AND admin."status" = 'ACTIVE'
    AND admin."deletedAt" IS NULL
  ON CONFLICT ("dedupeKey") DO NOTHING;
  PERFORM set_config('app.notification_writer', COALESCE(previous_notification_writer, ''), true);
  PERFORM set_config('app.platform_role', COALESCE(previous_platform_role, ''), true);
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_super_admins(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $grant_runtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.notify_super_admins(TEXT, TEXT, TEXT, TEXT, TEXT) TO neondb_owner';
  END IF;
END;
$grant_runtime$;

-- Allow recipients to set readAt once, without editing or re-targeting a notification.
CREATE FUNCTION public.guard_notification_read_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."recipientUserId" IS DISTINCT FROM OLD."recipientUserId"
     OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId"
     OR NEW."recipientAudience" IS DISTINCT FROM OLD."recipientAudience"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."body" IS DISTINCT FROM OLD."body"
     OR NEW."targetType" IS DISTINCT FROM OLD."targetType"
     OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
     OR NEW."dedupeKey" IS DISTINCT FROM OLD."dedupeKey"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt") THEN
    RAISE EXCEPTION 'notification content is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER "Notification_readAt_only_update"
  BEFORE UPDATE ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_read_update();

-- Freeze ticket identity and content after creation; only workflow fields change.
CREATE FUNCTION public.guard_support_ticket_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
     OR NEW."subject" IS DISTINCT FROM OLD."subject"
     OR NEW."category" IS DISTINCT FROM OLD."category"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'support ticket identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(current_setting('app.platform_role', true), '') IS DISTINCT FROM 'SUPER_ADMIN'
     AND NEW."status" IS DISTINCT FROM OLD."status"
     AND NOT (
       OLD."status" IN ('WAITING_FOR_USER', 'RESOLVED', 'CLOSED')
       AND NEW."status" IN ('NEW', 'IN_PROGRESS')
     ) THEN
    RAISE EXCEPTION 'support ticket transition is not allowed for owner' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(current_setting('app.platform_role', true), '') IS DISTINCT FROM 'SUPER_ADMIN'
     AND NEW."status" NOT IN ('NEW', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'support ticket is not editable by owner in this state' USING ERRCODE = '42501';
  END IF;
  IF NEW."status" IN ('NEW', 'IN_PROGRESS') AND NEW."closedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'open support tickets cannot have closedAt' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER "SupportTicket_workflow_fields_only_update"
  BEFORE UPDATE ON "SupportTicket"
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_ticket_update();
