-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MediaRole" AS ENUM ('MAIN', 'OPTION', 'EXPLANATION', 'HINT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "aiEvaluatedAt" TIMESTAMP(3),
ADD COLUMN     "aiFeedback" TEXT,
ADD COLUMN     "aiModelVersion" TEXT,
ADD COLUMN     "aiScore" DOUBLE PRECISION,
ADD COLUMN     "calibratedAt" TIMESTAMP(3),
ADD COLUMN     "calibrationVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedById" TEXT,
ADD COLUMN     "itemDifficulty" DOUBLE PRECISION,
ADD COLUMN     "itemDiscrimination" DOUBLE PRECISION,
ADD COLUMN     "itemGuessing" DOUBLE PRECISION,
ADD COLUMN     "manualScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "QuestionVersion" ADD COLUMN     "generationMetadata" JSONB,
ADD COLUMN     "partialCreditEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "QuestionMedia" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "altText" TEXT,
    "caption" TEXT,
    "hash" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVersionMedia" (
    "questionVersionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" "MediaRole" NOT NULL DEFAULT 'MAIN',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionVersionMedia_pkey" PRIMARY KEY ("questionVersionId","mediaId")
);

-- CreateTable
CREATE TABLE "QuestionGenerationJob" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT,
    "templateId" TEXT,
    "contentVersionId" TEXT,
    "prompt" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionMedia_tenantId_type_idx" ON "QuestionMedia"("tenantId", "type");

-- CreateIndex
CREATE INDEX "QuestionMedia_hash_idx" ON "QuestionMedia"("hash");

-- CreateIndex
CREATE INDEX "QuestionGenerationJob_tenantId_status_idx" ON "QuestionGenerationJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Attempt_gradedById_idx" ON "Attempt"("gradedById");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionMedia" ADD CONSTRAINT "QuestionMedia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionMedia" ADD CONSTRAINT "QuestionMedia_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersionMedia" ADD CONSTRAINT "QuestionVersionMedia_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersionMedia" ADD CONSTRAINT "QuestionVersionMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "QuestionMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionGenerationJob" ADD CONSTRAINT "QuestionGenerationJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
