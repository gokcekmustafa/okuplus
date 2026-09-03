-- AŞAMA 8B: provider identity + kalıcı refresh session.
-- E-posta identity anahtarı değildir; provider + subject benzersizdir.

CREATE TYPE "AuthIdentityProvider" AS ENUM ('GOOGLE', 'APPLE');

CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "userId" TEXT NOT NULL,
    "provider" "AuthIdentityProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "providerEmail" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPrivateEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentity_provider_subject_key"
    ON "AuthIdentity"("provider", "subject");
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key"
    ON "AuthIdentity"("userId", "provider");
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_tokenFamilyId_idx" ON "AuthSession"("tokenFamilyId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

ALTER TABLE "AuthIdentity"
    ADD CONSTRAINT "AuthIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession"
    ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Kimlik/session tabloları tenant verisi değildir; yalnız kayıt sahibi veya
-- platform auth servisi okuyabilir. Auth bootstrap bağlantısı production'da
-- ayrı, en az yetkili rol ile sınırlandırılmalıdır.
ALTER TABLE "AuthIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auth_identity_owner" ON "AuthIdentity"
    USING (
      "userId" = current_setting('app.user_id', true)
      OR current_setting('app.platform_role', true) <> ''
    )
    WITH CHECK (
      "userId" = current_setting('app.user_id', true)
      OR current_setting('app.platform_role', true) <> ''
    );

ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auth_session_owner" ON "AuthSession"
    USING (
      "userId" = current_setting('app.user_id', true)
      OR current_setting('app.platform_role', true) <> ''
    )
    WITH CHECK (
      "userId" = current_setting('app.user_id', true)
      OR current_setting('app.platform_role', true) <> ''
    );
