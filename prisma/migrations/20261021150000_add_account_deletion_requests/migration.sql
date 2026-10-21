-- P0-4C-1: store self-service deletion requests without executing deletion.
-- Additive only; no existing user, session, identity or learning rows are changed.
CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IDENTITY_REQUIRED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletionRequest_status_check"
    CHECK ("status" = 'IDENTITY_REQUIRED')
);

CREATE INDEX "AccountDeletionRequest_userId_createdAt_idx"
  ON "AccountDeletionRequest"("userId", "createdAt");
CREATE INDEX "AccountDeletionRequest_status_updatedAt_idx"
  ON "AccountDeletionRequest"("status", "updatedAt");
CREATE UNIQUE INDEX "AccountDeletionRequest_one_open_per_user_key"
  ON "AccountDeletionRequest"("userId")
  WHERE "status" = 'IDENTITY_REQUIRED';

ALTER TABLE "AccountDeletionRequest"
  ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS allows owner-scoped reads/inserts only. No UPDATE/DELETE policy exists
-- in this phase, so a client cannot advance or erase a request.
ALTER TABLE "AccountDeletionRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountDeletionRequest" FORCE ROW LEVEL SECURITY;

CREATE POLICY "account_deletion_request_owner_select"
  ON "AccountDeletionRequest"
  FOR SELECT
  USING ("userId" = NULLIF(current_setting('app.user_id', true), ''));

CREATE POLICY "account_deletion_request_owner_insert"
  ON "AccountDeletionRequest"
  FOR INSERT
  WITH CHECK ("userId" = NULLIF(current_setting('app.user_id', true), ''));
