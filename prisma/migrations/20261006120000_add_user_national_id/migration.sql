-- Additive, nullable field for existing users. The unique index allows multiple
-- legacy NULL values while preventing a real person's national ID from being
-- registered twice.
ALTER TABLE "User" ADD COLUMN "nationalId" TEXT;

CREATE UNIQUE INDEX "User_nationalId_key" ON "User"("nationalId");
