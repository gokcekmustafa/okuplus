-- ============================================================
-- Oku+ — INITIAL MIGRATION (base schema + manual SQL)
-- Otomatik olarak birleştirildi: prisma migrate diff + prisma/manual/*.sql
-- ============================================================

-- ============ BÖLÜM 1: EXTENSIONS (001) ============

-- ============================================================
-- 001 — UUID v7 DESTEĞİ
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Tüm PK'lar `@default(dbgenerated("uuidv7()"))` kullanır.
--       Bu migration, şema tabloları OLUŞTURULMADAN ÖNCE çalışmalıdır,
--       aksi halde `DEFAULT uuidv7()` çözümlenemez.
--
-- Gereksinimler:
--   * PostgreSQL 18+   : uuidv7() YERLEŞİK olarak mevcuttur, extension GEREKMEZ.
--   * PostgreSQL < 18  : pg_uuidv7 extension'ı gerekir.
--       - Neon / Supabase : `CREATE EXTENSION pg_uuidv7;` desteklenir.
--       - Azure Flexible  : extension allowlist'e eklenmelidir.
--       - Kendi sunucu    : pg_uuidv7 paketi kurulmalı (PGXN veya GitHub).
-- ============================================================

-- idempotent; extension mevcut değilse hata vermez,
-- ancak fonksiyon eksikse CREATE TABLE aşamasında hata oluşur.
-- PostgreSQL 18+: uuidv7() yerleşiktir; extension gerekmez.
-- PostgreSQL < 18 : pg_uuidv7 extension'ı kurulmalıdır (PGXN veya GitHub).
-- NOT: pg_uuidv7 çekirdek dağıtımda YOKTUR; koşulsuz CREATE EXTENSION,
--      PG18+ üzerinde "extension has no installation script" hatası verir.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
  END IF;
END
$$;

-- ============ BÖLÜM 2: BASE SCHEMA (prisma migrate diff) ============

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'CONTENT_EDITOR', 'SUPPORT', 'ANALYST');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ORG_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'LEFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "GuardianStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('MAIN_IDEA', 'DETAIL', 'INFERENCE', 'VOCABULARY', 'FACTUAL', 'COMPREHENSION');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('PASSAGE', 'STORY', 'POEM', 'ARTICLE', 'DIALOGUE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'OPEN_ENDED', 'MATCHING', 'FILL_BLANK');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExerciseTemplateType" AS ENUM ('COMPREHENSION', 'FLUENCY', 'INFERENCE', 'VOCABULARY', 'MIXED');

-- CreateEnum
CREATE TYPE "ExerciseTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionContext" AS ENUM ('INDIVIDUAL', 'ASSIGNMENT', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('PRACTICE', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('PLACEMENT', 'DIAGNOSTIC', 'BENCHMARK');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BadgeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PointEventType" AS ENUM ('EXERCISE_COMPLETED', 'CORRECT_ANSWER', 'STREAK_MILESTONE', 'BADGE_EARNED', 'DAILY_LOGIN');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS_OF_SERVICE', 'PARENTAL_CONSENT', 'DATA_PROCESSING', 'DATA_TRANSFER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'ROLE_CHANGED', 'ENROLLMENT_CHANGED', 'CONSENT_GRANTED', 'CONSENT_REVOKED', 'EXPORT_REQUESTED', 'ERASURE_REQUESTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "birthYear" INTEGER,
    "platformRole" "PlatformRole",
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "type" "TenantType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "logoUrl" TEXT,
    "settings" JSONB,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherBranchMembership" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TeacherBranchMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherClassAssignment" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subject" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TeacherClassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardianship" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relation" "GuardianRelation" NOT NULL,
    "canViewProgress" BOOLEAN NOT NULL DEFAULT true,
    "canManageSubscription" BOOLEAN NOT NULL DEFAULT false,
    "status" "GuardianStatus" NOT NULL DEFAULT 'ACTIVE',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Guardianship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "gradeBand" TEXT,
    "difficultyMin" DOUBLE PRECISION NOT NULL,
    "difficultyMax" DOUBLE PRECISION NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "readabilityScore" DOUBLE PRECISION,
    "license" TEXT,
    "changelog" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSkill" (
    "contentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "ContentSkill_pkey" PRIMARY KEY ("contentId","skillId")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "contentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "skillId" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVersion" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "questionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswer" JSONB,
    "explanation" TEXT,
    "hint" TEXT,
    "difficulty" DOUBLE PRECISION,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseTemplate" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "type" "ExerciseTemplateType" NOT NULL,
    "skillId" TEXT,
    "config" JSONB,
    "status" "ExerciseTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "contentId" TEXT,

    CONSTRAINT "ExerciseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseTemplateVersion" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseTemplateVersionContent" (
    "templateVersionId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ExerciseTemplateVersionContent_pkey" PRIMARY KEY ("templateVersionId","contentVersionId")
);

-- CreateTable
CREATE TABLE "ExerciseTemplateVersionQuestion" (
    "templateVersionId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "questionId" TEXT,

    CONSTRAINT "ExerciseTemplateVersionQuestion_pkey" PRIMARY KEY ("templateVersionId","questionVersionId")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSession" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "assessmentId" TEXT,
    "context" "SessionContext" NOT NULL DEFAULT 'INDIVIDUAL',
    "sessionType" "SessionType" NOT NULL DEFAULT 'PRACTICE',
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "clientSessionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "timeSpentMs" INTEGER,
    "scoreSummary" JSONB,
    "deviceInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionContentVersion" (
    "sessionId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SessionContentVersion_pkey" PRIMARY KEY ("sessionId","contentVersionId")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "answer" JSONB,
    "isCorrect" BOOLEAN,
    "timeSpentMs" INTEGER,
    "responseOrder" INTEGER NOT NULL,
    "feedback" JSONB,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questionId" TEXT,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentLevelId" TEXT,
    "targetLevelId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProgress" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "algorithmVersion" INTEGER NOT NULL DEFAULT 1,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION,
    "avgTimeMs" INTEGER,
    "fluencyWcpm" DOUBLE PRECISION,
    "consistency" DOUBLE PRECISION,
    "masteryScore" DOUBLE PRECISION,
    "lastAttemptAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL DEFAULT 'PLACEMENT',
    "levelId" TEXT,
    "config" JSONB,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "resultLevelId" TEXT,
    "score" DOUBLE PRECISION,
    "metrics" JSONB,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "criteria" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "BadgeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBadge" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointEvent" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" "PointEventType" NOT NULL,
    "points" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentStreak" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentDays" INTEGER NOT NULL DEFAULT 0,
    "longestDays" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "source" TEXT,
    "ip" TEXT,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "Tenant_type_status_idx" ON "Tenant"("type", "status");

-- CreateIndex
CREATE INDEX "Branch_tenantId_status_idx" ON "Branch"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "Branch"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AcademicYear_tenantId_status_idx" ON "AcademicYear"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_tenantId_name_key" ON "AcademicYear"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Class_tenantId_branchId_academicYearId_idx" ON "Class"("tenantId", "branchId", "academicYearId");

-- CreateIndex
CREATE INDEX "Class_tenantId_status_idx" ON "Class"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Class_branchId_academicYearId_name_key" ON "Class"("branchId", "academicYearId", "name");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_tenantId_role_status_idx" ON "Membership"("tenantId", "role", "status");

-- CreateIndex
CREATE INDEX "Membership_tenantId_status_idx" ON "Membership"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TeacherBranchMembership_teacherId_status_idx" ON "TeacherBranchMembership"("teacherId", "status");

-- CreateIndex
CREATE INDEX "TeacherBranchMembership_tenantId_branchId_status_idx" ON "TeacherBranchMembership"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "TeacherClassAssignment_teacherId_status_idx" ON "TeacherClassAssignment"("teacherId", "status");

-- CreateIndex
CREATE INDEX "TeacherClassAssignment_tenantId_classId_status_idx" ON "TeacherClassAssignment"("tenantId", "classId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_classId_academicYearId_status_idx" ON "Enrollment"("classId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_academicYearId_idx" ON "Enrollment"("studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_academicYearId_classId_key" ON "Enrollment"("studentId", "academicYearId", "classId");

-- CreateIndex
CREATE INDEX "Guardianship_tenantId_studentId_guardianId_status_idx" ON "Guardianship"("tenantId", "studentId", "guardianId", "status");

-- CreateIndex
CREATE INDEX "Guardianship_guardianId_status_idx" ON "Guardianship"("guardianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_code_key" ON "Skill"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Level_code_key" ON "Level"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Content_currentVersionId_key" ON "Content"("currentVersionId");

-- CreateIndex
CREATE INDEX "Content_tenantId_status_idx" ON "Content"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Content_status_idx" ON "Content"("status");

-- CreateIndex
CREATE INDEX "ContentVersion_contentId_status_idx" ON "ContentVersion"("contentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_contentId_version_key" ON "ContentVersion"("contentId", "version");

-- CreateIndex
CREATE INDEX "ContentSkill_skillId_idx" ON "ContentSkill"("skillId");

-- CreateIndex
CREATE INDEX "Question_contentId_position_idx" ON "Question"("contentId", "position");

-- CreateIndex
CREATE INDEX "Question_skillId_idx" ON "Question"("skillId");

-- CreateIndex
CREATE INDEX "Question_status_idx" ON "Question"("status");

-- CreateIndex
CREATE INDEX "QuestionVersion_questionId_status_idx" ON "QuestionVersion"("questionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVersion_questionId_version_key" ON "QuestionVersion"("questionId", "version");

-- CreateIndex
CREATE INDEX "ExerciseTemplate_tenantId_status_idx" ON "ExerciseTemplate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExerciseTemplate_status_idx" ON "ExerciseTemplate"("status");

-- CreateIndex
CREATE INDEX "ExerciseTemplateVersion_templateId_status_idx" ON "ExerciseTemplateVersion"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseTemplateVersion_templateId_version_key" ON "ExerciseTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "ExerciseTemplateVersionContent_contentVersionId_idx" ON "ExerciseTemplateVersionContent"("contentVersionId");

-- CreateIndex
CREATE INDEX "ExerciseTemplateVersionQuestion_questionVersionId_idx" ON "ExerciseTemplateVersionQuestion"("questionVersionId");

-- CreateIndex
CREATE INDEX "Assignment_classId_status_idx" ON "Assignment"("classId", "status");

-- CreateIndex
CREATE INDEX "Assignment_teacherId_status_idx" ON "Assignment"("teacherId", "status");

-- CreateIndex
CREATE INDEX "Assignment_templateId_idx" ON "Assignment"("templateId");

-- CreateIndex
CREATE INDEX "ExerciseSession_studentId_tenantId_startedAt_idx" ON "ExerciseSession"("studentId", "tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "ExerciseSession_assignmentId_idx" ON "ExerciseSession"("assignmentId");

-- CreateIndex
CREATE INDEX "ExerciseSession_templateVersionId_idx" ON "ExerciseSession"("templateVersionId");

-- CreateIndex
CREATE INDEX "ExerciseSession_tenantId_status_idx" ON "ExerciseSession"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseSession_studentId_clientSessionId_key" ON "ExerciseSession"("studentId", "clientSessionId");

-- CreateIndex
CREATE INDEX "SessionContentVersion_contentVersionId_idx" ON "SessionContentVersion"("contentVersionId");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_idx" ON "Attempt"("sessionId");

-- CreateIndex
CREATE INDEX "Attempt_questionVersionId_idx" ON "Attempt"("questionVersionId");

-- CreateIndex
CREATE INDEX "Attempt_tenantId_answeredAt_idx" ON "Attempt"("tenantId", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_sessionId_clientAttemptId_key" ON "Attempt"("sessionId", "clientAttemptId");

-- CreateIndex
CREATE INDEX "StudentProfile_tenantId_currentLevelId_idx" ON "StudentProfile"("tenantId", "currentLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_tenantId_studentId_key" ON "StudentProfile"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "StudentProgress_studentId_skillId_periodStart_idx" ON "StudentProgress"("studentId", "skillId", "periodStart");

-- CreateIndex
CREATE INDEX "StudentProgress_tenantId_periodStart_idx" ON "StudentProgress"("tenantId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProgress_tenantId_studentId_skillId_periodStart_peri_key" ON "StudentProgress"("tenantId", "studentId", "skillId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_status_idx" ON "Assessment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AssessmentResult_studentId_tenantId_completedAt_idx" ON "AssessmentResult"("studentId", "tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "AssessmentResult_assessmentId_idx" ON "AssessmentResult"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE INDEX "StudentBadge_studentId_tenantId_idx" ON "StudentBadge"("studentId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBadge_tenantId_studentId_badgeId_key" ON "StudentBadge"("tenantId", "studentId", "badgeId");

-- CreateIndex
CREATE INDEX "PointEvent_studentId_tenantId_createdAt_idx" ON "PointEvent"("studentId", "tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointEvent_tenantId_dedupeKey_key" ON "PointEvent"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "StudentStreak_tenantId_lastActivityDate_idx" ON "StudentStreak"("tenantId", "lastActivityDate");

-- CreateIndex
CREATE UNIQUE INDEX "StudentStreak_tenantId_studentId_key" ON "StudentStreak"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "Consent_userId_type_status_idx" ON "Consent"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "Consent_tenantId_idx" ON "Consent"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherBranchMembership" ADD CONSTRAINT "TeacherBranchMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherBranchMembership" ADD CONSTRAINT "TeacherBranchMembership_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherBranchMembership" ADD CONSTRAINT "TeacherBranchMembership_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassAssignment" ADD CONSTRAINT "TeacherClassAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassAssignment" ADD CONSTRAINT "TeacherClassAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassAssignment" ADD CONSTRAINT "TeacherClassAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardianship" ADD CONSTRAINT "Guardianship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardianship" ADD CONSTRAINT "Guardianship_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardianship" ADD CONSTRAINT "Guardianship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSkill" ADD CONSTRAINT "ContentSkill_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSkill" ADD CONSTRAINT "ContentSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersion" ADD CONSTRAINT "ExerciseTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExerciseTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersion" ADD CONSTRAINT "ExerciseTemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersionContent" ADD CONSTRAINT "ExerciseTemplateVersionContent_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ExerciseTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersionContent" ADD CONSTRAINT "ExerciseTemplateVersionContent_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersionQuestion" ADD CONSTRAINT "ExerciseTemplateVersionQuestion_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ExerciseTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersionQuestion" ADD CONSTRAINT "ExerciseTemplateVersionQuestion_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplateVersionQuestion" ADD CONSTRAINT "ExerciseTemplateVersionQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExerciseTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSession" ADD CONSTRAINT "ExerciseSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSession" ADD CONSTRAINT "ExerciseSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSession" ADD CONSTRAINT "ExerciseSession_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ExerciseTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSession" ADD CONSTRAINT "ExerciseSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSession" ADD CONSTRAINT "ExerciseSession_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionContentVersion" ADD CONSTRAINT "SessionContentVersion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExerciseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionContentVersion" ADD CONSTRAINT "SessionContentVersion_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExerciseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "QuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_currentLevelId_fkey" FOREIGN KEY ("currentLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_targetLevelId_fkey" FOREIGN KEY ("targetLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgress" ADD CONSTRAINT "StudentProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgress" ADD CONSTRAINT "StudentProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgress" ADD CONSTRAINT "StudentProgress_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_resultLevelId_fkey" FOREIGN KEY ("resultLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStreak" ADD CONSTRAINT "StudentStreak_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStreak" ADD CONSTRAINT "StudentStreak_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============ BÖLÜM 3: MANUAL SQL (002-008) ============

-- ============================================================
-- 002 — PARTIAL UNIQUE INDEX'LER
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Prisma `WHERE <koşul>` içeren kısmi unique index ifade edemez.
--       Tüm "aktif kayıt tek olmalı" kuralları burada DB seviyesinde garanti edilir.
-- ============================================================

-- Membership: aynı tenant + user + role için yalnızca bir ACTIVE/PENDING kayıt.
-- (INACTIVE/REMOVED geçmiş kayıtlar saklanabilir.)
CREATE UNIQUE INDEX "uq_membership_active"
  ON "Membership" ("tenantId", "userId", "role")
  WHERE "status" IN ('ACTIVE', 'PENDING');

-- TeacherBranchMembership: aynı teacher + branch için tek aktif kayıt.
CREATE UNIQUE INDEX "uq_teacher_branch_active"
  ON "TeacherBranchMembership" ("branchId", "teacherId")
  WHERE "status" = 'ACTIVE';

-- TeacherClassAssignment: aynı teacher + class için tek aktif kayıt.
CREATE UNIQUE INDEX "uq_teacher_class_active"
  ON "TeacherClassAssignment" ("classId", "teacherId")
  WHERE "status" = 'ACTIVE';

-- Enrollment: aynı öğrenci + akademik yılda tek AKTİF kayıt.
-- (Aynı yıl içinde sınıf değiştirme = eski kayıt ACTIVE değilken yeni kayıt.)
CREATE UNIQUE INDEX "uq_enrollment_student_year_active"
  ON "Enrollment" ("studentId", "academicYearId")
  WHERE "status" = 'ACTIVE';

-- Guardianship: tenant + student + guardian bağlamında tek aktif kayıt.
CREATE UNIQUE INDEX "uq_guardianship_active"
  ON "Guardianship" ("tenantId", "studentId", "guardianId")
  WHERE "status" = 'ACTIVE';

-- Tenant: slug yalnızca ORGANIZATION tipinde unique.
CREATE UNIQUE INDEX "uq_tenant_slug_org"
  ON "Tenant" ("slug")
  WHERE "type" = 'ORGANIZATION';
-- ============================================================
-- 003 — RLS: DOĞRUDAN tenant_id TAŞIYAN TABLOLAR
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Kapsam: "tenantId" NOT NULL olan ve doğrudan tenant context ile
--         izole edilen tablolar.
--
-- ÖN KOŞUL (uygulama katmanı):
--   Her istekte aynı transaction içinde (SET LOCAL) ayarlanır:
--     SET LOCAL app.tenant_id = '<uuid>';
--     SET LOCAL app.platform_role = 'SUPER_ADMIN';  -- platform personeli (opsiyonel)
--   platform_role ayarlıysa tüm tenant verilerine erişim (support/denetim).
-- ============================================================

-- -------- Branch --------
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Branch"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- AcademicYear --------
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicYear" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AcademicYear"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Class --------
ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Class" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Class"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Membership --------
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Membership"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- TeacherBranchMembership --------
ALTER TABLE "TeacherBranchMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherBranchMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "TeacherBranchMembership"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- TeacherClassAssignment --------
ALTER TABLE "TeacherClassAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherClassAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "TeacherClassAssignment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Enrollment --------
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Enrollment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Guardianship --------
ALTER TABLE "Guardianship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guardianship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Guardianship"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- ExerciseSession (SELECT/INSERT/UPDATE izinli; DELETE YOK -> geçmiş korunur) --------
ALTER TABLE "ExerciseSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "ExerciseSession"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "ExerciseSession"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_update" ON "ExerciseSession"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- DELETE policy TANIMLANMADI -> RLS ile silme DB seviyesinde engellenir.

-- -------- Attempt (SELECT/INSERT izinli; UPDATE/DELETE YOK -> immutable) --------
ALTER TABLE "Attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "Attempt"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "Attempt"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- UPDATE/DELETE policy TANIMLANMADI -> immutable.

-- -------- Assignment --------
ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Assignment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- StudentProfile --------
ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentProfile"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- StudentProgress --------
ALTER TABLE "StudentProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProgress" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentProgress"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- AssessmentResult --------
ALTER TABLE "AssessmentResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AssessmentResult"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- StudentBadge --------
ALTER TABLE "StudentBadge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentBadge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentBadge"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- PointEvent (append-only: INSERT izinli; UPDATE/DELETE YOK) --------
ALTER TABLE "PointEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PointEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "PointEvent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "PointEvent"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- UPDATE/DELETE policy TANIMLANMADI -> append-only.

-- -------- StudentStreak --------
ALTER TABLE "StudentStreak" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentStreak" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentStreak"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- ============================================================
-- 004 — RLS: GLOBAL KATALOG TABLOLARI
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Content / ExerciseTemplate / Assessment: "tenantId" NULL ise GLOBAL katalog.
--   * SELECT: global kayıtlar tüm tenant'lar tarafından okunabilir.
--   * INSERT/UPDATE/DELETE (global kayıt): yalnızca platform rolleri
--     ('SUPER_ADMIN', 'CONTENT_EDITOR') tarafından yapılabilir.
--   * tenant'lı kayıtlar yalnızca ilgili tenant tarafından erişilebilir.
--
-- Skill / Level / Badge: salt global katalog; okuma tüm uygulama, yazma platform.
-- ============================================================

-- -------- Content --------
ALTER TABLE "Content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Content" FORCE ROW LEVEL SECURITY;

CREATE POLICY "content_read" ON "Content"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "content_insert" ON "Content"
  FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "content_update" ON "Content"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "content_delete" ON "Content"
  FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- ExerciseTemplate --------
ALTER TABLE "ExerciseTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplate" FORCE ROW LEVEL SECURITY;

CREATE POLICY "template_read" ON "ExerciseTemplate"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "template_insert" ON "ExerciseTemplate"
  FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "template_update" ON "ExerciseTemplate"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "template_delete" ON "ExerciseTemplate"
  FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Assessment --------
ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assessment" FORCE ROW LEVEL SECURITY;

CREATE POLICY "assessment_read" ON "Assessment"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "assessment_insert" ON "Assessment"
  FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "assessment_update" ON "Assessment"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "assessment_delete" ON "Assessment"
  FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Skill (salt global katalog) --------
ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skill" FORCE ROW LEVEL SECURITY;
CREATE POLICY "skill_read" ON "Skill" FOR SELECT USING (true);
CREATE POLICY "skill_write" ON "Skill"
  FOR ALL
  USING (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
  WITH CHECK (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'));

-- -------- Level (salt global katalog) --------
ALTER TABLE "Level" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Level" FORCE ROW LEVEL SECURITY;
CREATE POLICY "level_read" ON "Level" FOR SELECT USING (true);
CREATE POLICY "level_write" ON "Level"
  FOR ALL
  USING (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
  WITH CHECK (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'));

-- -------- Badge (salt global katalog) --------
ALTER TABLE "Badge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Badge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "badge_read" ON "Badge" FOR SELECT USING (true);
CREATE POLICY "badge_write" ON "Badge"
  FOR ALL
  USING (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
  WITH CHECK (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'));
-- ============================================================
-- 005 — RLS: PARENT İZOLASYONU (tenant_id TAŞIMAYAN TABLOLAR)
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Bu tablolar doğrudan tenant_id taşımaz; tenant kapsamı parent entity
-- üzerinden türetilir. Policy'ler parent'ın global veya aynı tenant olmasını
-- doğrular. Yazma (INSERT/UPDATE/DELETE) için parent'ın "yazılabilir" olması
-- gerekir: global parent => platform rolü; tenant'lı parent => aynı tenant.
-- ============================================================

-- -------- ContentVersion (parent: Content) --------
ALTER TABLE "ContentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "cv_read" ON "ContentVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "cv_insert" ON "ContentVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "cv_update" ON "ContentVersion"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- DELETE: geçmiş versiyonların silinmesi engellendi (CASCADE yok, RESTRICT).
-- Ayrıca published immutable trigger'ı (007) delete'i de bloklar.

-- -------- Question (parent: Content) --------
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Question" FORCE ROW LEVEL SECURITY;

CREATE POLICY "q_read" ON "Question"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "q_insert" ON "Question"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "q_update" ON "Question"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "q_delete" ON "Question"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- QuestionVersion (parent: Question -> Content) --------
ALTER TABLE "QuestionVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "qv_read" ON "QuestionVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "qv_insert" ON "QuestionVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "qv_update" ON "QuestionVersion"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- DELETE: published immutable trigger'ı (007) ile korunur.

-- -------- ContentSkill (parent: Content) --------
ALTER TABLE "ContentSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentSkill" FORCE ROW LEVEL SECURITY;

CREATE POLICY "cs_read" ON "ContentSkill"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "cs_insert" ON "ContentSkill"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "cs_delete" ON "ContentSkill"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- ExerciseTemplateVersion (parent: ExerciseTemplate) --------
ALTER TABLE "ExerciseTemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplateVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "etv_read" ON "ExerciseTemplateVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "etv_insert" ON "ExerciseTemplateVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "etv_update" ON "ExerciseTemplateVersion"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- DELETE: published immutable trigger'ı (007) ile korunur.

-- -------- ExerciseTemplateVersionContent (parents: template + content) --------
ALTER TABLE "ExerciseTemplateVersionContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplateVersionContent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "etvc_read" ON "ExerciseTemplateVersionContent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR (
      EXISTS (
        SELECT 1 FROM "ExerciseTemplateVersion" etv
        JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
        WHERE etv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
          AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
      )
      AND EXISTS (
        SELECT 1 FROM "ContentVersion" cv
        JOIN "Content" c ON c."id" = cv."contentId"
        WHERE cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
          AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
      )
    )
  );

CREATE POLICY "etvc_insert" ON "ExerciseTemplateVersionContent"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
    AND EXISTS (
      SELECT 1 FROM "ContentVersion" cv
      JOIN "Content" c ON c."id" = cv."contentId"
      WHERE cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "etvc_delete" ON "ExerciseTemplateVersionContent"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- ExerciseTemplateVersionQuestion (parents: template + question) --------
ALTER TABLE "ExerciseTemplateVersionQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplateVersionQuestion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "etvq_read" ON "ExerciseTemplateVersionQuestion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR (
      EXISTS (
        SELECT 1 FROM "ExerciseTemplateVersion" etv
        JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
        WHERE etv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
          AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
      )
      AND EXISTS (
        SELECT 1 FROM "QuestionVersion" qv
        JOIN "Question" q ON q."id" = qv."questionId"
        JOIN "Content" c ON c."id" = q."contentId"
        WHERE qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
          AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
      )
    )
  );

CREATE POLICY "etvq_insert" ON "ExerciseTemplateVersionQuestion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
    AND EXISTS (
      SELECT 1 FROM "QuestionVersion" qv
      JOIN "Question" q ON q."id" = qv."questionId"
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "etvq_delete" ON "ExerciseTemplateVersionQuestion"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- SessionContentVersion (parent: ExerciseSession - tenant_id taşır) --------
ALTER TABLE "SessionContentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SessionContentVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "scv_read" ON "SessionContentVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseSession" s
      WHERE s."id" = "SessionContentVersion"."sessionId"
        AND s."tenantId" = current_setting('app.tenant_id', true)
    )
  );

CREATE POLICY "scv_insert" ON "SessionContentVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseSession" s
      WHERE s."id" = "SessionContentVersion"."sessionId"
        AND s."tenantId" = current_setting('app.tenant_id', true)
    )
  );
-- ============================================================
-- 006 — RLS: USER (global kimlik) / CONSENT / AUDITLOG
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- User global kimliktir (tenant'sız). Tenant izolasyonu "aynı tenant
-- üyeliği" üzerinden sağlanır; kişi kendini görür. Öğretmen-sınıf kapsamı
-- (senaryo 7) app katmanında RBAC ile uygulanır; RLS burada genel eşik çeker.
--
-- EK GUC (User tablosu için): SET LOCAL app.user_id = '<uuid>';
--   Not: INSERT sırasında app, UUID v7'yi istemcide üretip app.user_id olarak
--   verir; böylece kayıt oluşturma akışı RLS'i geçer.
-- ============================================================

-- -------- User --------
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

-- Görme: platform rolü VEYA kendisi VEYA aynı tenant'ta aktif/pending üye.
CREATE POLICY "user_read" ON "User"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "User"."id"
        AND m."tenantId" = current_setting('app.tenant_id', true)
        AND m."status" IN ('ACTIVE', 'PENDING')
    )
  );

-- Oluşturma: platform rolü VEYA id'si app.user_id ile eşleşen (kayıt akışı).
CREATE POLICY "user_insert" ON "User"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
  );

-- Güncelleme: platform rolü VEYA kendisi.
CREATE POLICY "user_update" ON "User"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
  );

-- Silme: yalnızca platform (soft-delete app'te yapılır).
CREATE POLICY "user_delete" ON "User"
  FOR DELETE
  USING (current_setting('app.platform_role', true) <> '');

-- -------- Consent (tenant_id NULL = platform seviyesi) --------
ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;

-- Görme: platform rolü VEYA kendisi VEYA aynı tenant üyesi.
CREATE POLICY "consent_read" ON "Consent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "Consent"."userId"
        AND m."tenantId" = current_setting('app.tenant_id', true)
        AND m."status" IN ('ACTIVE', 'PENDING')
    )
  );

-- Yazma: platform rolü VEYA kendi rızası VEYA aynı tenant bağlamında.
CREATE POLICY "consent_insert" ON "Consent"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "consent_update" ON "Consent"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- Silme: platform rolü VEYA kendisi (rıza geri çekme akışı).
CREATE POLICY "consent_delete" ON "Consent"
  FOR DELETE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
  );

-- -------- AuditLog (tenant_id NULL = platform seviyesi; append-only) --------
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

-- Görme: platform rolü VEYA ilgili tenant bağlamı.
CREATE POLICY "audit_read" ON "AuditLog"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- Yazma: yalnızca INSERT (append-only); UPDATE/DELETE policy YOK.
CREATE POLICY "audit_insert" ON "AuditLog"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- ============================================================
-- 007 — PUBLISHED VERSION İMMUTABLE TRIGGER'LARI
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: ContentVersion / QuestionVersion / ExerciseTemplateVersion için
--       status = 'PUBLISHED' olan kayıtların UPDATE/DELETE edilmesini
--       DB seviyesinde engellemek (application kuralına defense-in-depth).
--       Değişiklik yeni bir version üretilerek yapılır.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_published_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'PUBLISHED version değiştirilemez veya silinemez. Yeni bir version oluşturulmalı.';
  END IF;
  RETURN NEW;
END;
$$;

-- ContentVersion
CREATE TRIGGER trg_content_version_immutable
  BEFORE UPDATE OR DELETE ON "ContentVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_mutation();

-- QuestionVersion
CREATE TRIGGER trg_question_version_immutable
  BEFORE UPDATE OR DELETE ON "QuestionVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_mutation();

-- ExerciseTemplateVersion
CREATE TRIGGER trg_template_version_immutable
  BEFORE UPDATE OR DELETE ON "ExerciseTemplateVersion"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_published_mutation();
-- ============================================================
-- 008 — TENANT COMPATIBILITY TRIGGER'LARI
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Bir ORGANIZATION'a ait ExerciseTemplateVersion'ın başka bir tenant'a
--       ait ContentVersion / QuestionVersion referanslamasını DB seviyesinde
--       engellemek.
--
-- Kural: İçerik/soru global ise (tenant_id NULL) herkes kullanabilir.
--        İçerik/soru tenant'lı ise, şablon ya global (NULL) ya da AYNI tenant
--        olmalıdır. Farklı tenant -> hata.
--
-- NOT: RLS, çapraz tenant görünürlüğünü zaten engeller; bu trigger ek
--      bütünlük garantisidir (data integrity, güvenlik değil).
-- ============================================================

CREATE OR REPLACE FUNCTION check_template_tenant_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_tenant TEXT;
  v_item_tenant     TEXT;
BEGIN
  -- Şablonun tenant'ı
  SELECT t."tenantId" INTO v_template_tenant
  FROM "ExerciseTemplateVersion" etv
  JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
  WHERE etv."id" = NEW."templateVersionId";

  -- Bu trigger içerik (ContentVersion) bağlantısı için çağrılır;
  -- bağlanan içeriğin tenant'ı Content üzerinden bulunur.
  SELECT c."tenantId" INTO v_item_tenant
  FROM "ContentVersion" cv
  JOIN "Content" c ON c."id" = cv."contentId"
  WHERE cv."id" = NEW."contentVersionId";

  IF v_template_tenant IS NOT NULL AND v_item_tenant IS NOT NULL
     AND v_template_tenant <> v_item_tenant THEN
    RAISE EXCEPTION 'Başka tenant''a ait içerik bu şablona eklenemez';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_content_tenant
  BEFORE INSERT OR UPDATE ON "ExerciseTemplateVersionContent"
  FOR EACH ROW
  EXECUTE FUNCTION check_template_tenant_compatibility();

-- ------------------------------------------------------------------
-- Question bağlantısı için ayrı fonksiyon (Question -> Content zinciri)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_template_question_tenant_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_tenant TEXT;
  v_item_tenant     TEXT;
BEGIN
  SELECT t."tenantId" INTO v_template_tenant
  FROM "ExerciseTemplateVersion" etv
  JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
  WHERE etv."id" = NEW."templateVersionId";

  SELECT c."tenantId" INTO v_item_tenant
  FROM "QuestionVersion" qv
  JOIN "Question" q ON q."id" = qv."questionId"
  JOIN "Content" c ON c."id" = q."contentId"
  WHERE qv."id" = NEW."questionVersionId";

  IF v_template_tenant IS NOT NULL AND v_item_tenant IS NOT NULL
     AND v_template_tenant <> v_item_tenant THEN
    RAISE EXCEPTION 'Başka tenant''a ait soru bu şablona eklenemez';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_question_tenant
  BEFORE INSERT OR UPDATE ON "ExerciseTemplateVersionQuestion"
  FOR EACH ROW
  EXECUTE FUNCTION check_template_question_tenant_compatibility();