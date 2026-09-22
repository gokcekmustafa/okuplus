import { createHash, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";

const adminUrl = requiredEnv("GUEST_RLS_FIXTURE_ADMIN_DATABASE_URL");
const guestUrl = requiredEnv("GUEST_DATABASE_URL");
const guestTestUrl = requiredEnv("GUEST_RLS_TEST_DATABASE_URL");

assertDisposableTestDatabase(adminUrl, "GUEST_RLS_FIXTURE_ADMIN_DATABASE_URL");
assertDisposableTestDatabase(guestUrl, "GUEST_DATABASE_URL");
assertDisposableTestDatabase(guestTestUrl, "GUEST_RLS_TEST_DATABASE_URL");

const adminIdentity = connectionIdentity(adminUrl);
const guestIdentity = connectionIdentity(guestUrl);
const guestTestIdentity = connectionIdentity(guestTestUrl);

if (
  adminIdentity.database !== guestIdentity.database ||
  adminIdentity.host !== guestIdentity.host
) {
  throw new Error(
    "Guest RLS fixture admin and guest connections must target the same disposable CI database",
  );
}

if (guestIdentity.user === adminIdentity.user || guestTestIdentity.user === adminIdentity.user) {
  throw new Error("Guest RLS fixture connections must use a separate database role");
}

if (
  guestIdentity.database !== guestTestIdentity.database ||
  guestIdentity.host !== guestTestIdentity.host
) {
  throw new Error(
    "GUEST_DATABASE_URL and GUEST_RLS_TEST_DATABASE_URL must target the same disposable CI database",
  );
}

const envFile = process.env.GITHUB_ENV ?? process.env.GUEST_RLS_FIXTURE_ENV_FILE;
if (!envFile) {
  throw new Error(
    "GITHUB_ENV or GUEST_RLS_FIXTURE_ENV_FILE is required; fixture tokens must not be printed",
  );
}

const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

const now = new Date();
const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
const suffix = randomUUID().replaceAll("-", "");
const templateId = randomUUID();
const templateVersionId = randomUUID();
const configId = randomUUID();
const configKey = `ci-guest-rls-${suffix}`;
const contentAId = randomUUID();
const contentAVersionId = randomUUID();
const contentBId = randomUUID();
const contentBVersionId = randomUUID();
const questionAId = randomUUID();
const questionAVersionId = randomUUID();
const questionBId = randomUUID();
const questionBVersionId = randomUUID();
const sessionAId = randomUUID();
const sessionBId = randomUUID();
const sessionAToken = `ci-guest-a-${randomUUID()}`;
const sessionBToken = `ci-guest-b-${randomUUID()}`;
const sessionACsrfHash = hash(`ci-csrf-a-${randomUUID()}`);
const sessionBCsrfHash = hash(`ci-csrf-b-${randomUUID()}`);

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseTemplate" ("id", "tenantId", "title", "type", "config", "status", "createdAt", "updatedAt")
       VALUES ($1, NULL, $2, 'COMPREHENSION', $3::jsonb, 'PUBLISHED', $4, $4)`,
      templateId,
      "CI Guest Diagnostic RLS Template",
      JSON.stringify({ source: "ci-guest-rls-fixture" }),
      now,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseTemplateVersion" ("id", "templateId", "version", "config", "status", "publishedAt", "createdAt")
       VALUES ($1, $2, 1, $3::jsonb, 'PUBLISHED', $4, $4)`,
      templateVersionId,
      templateId,
      JSON.stringify({ source: "ci-guest-rls-fixture" }),
      now,
    );

    await insertContent(tx, contentAId, contentAVersionId, "CI Guest Content A", now);
    await insertContent(tx, contentBId, contentBVersionId, "CI Guest Content B", now);

    await insertQuestion(
      tx,
      questionAId,
      questionAVersionId,
      contentAId,
      contentAVersionId,
      1,
      0.2,
      "MAIN_IDEA",
      now,
    );
    await insertQuestion(
      tx,
      questionBId,
      questionBVersionId,
      contentBId,
      contentBVersionId,
      1,
      0.6,
      "DETAIL",
      now,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseTemplateVersionQuestion" ("templateVersionId", "questionVersionId", "position", "questionId")
       VALUES ($1, $2, 1, $3), ($1, $4, 2, $5)`,
      templateVersionId,
      questionAVersionId,
      questionAId,
      questionBVersionId,
      questionBId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO "GuestDiagnosticRecommendationConfig"
        ("id", "configKey", "version", "scoringContractVersion", "minimumAnsweredCount", "minimumScorableCount",
         "recommendationThresholds", "skillSignalThresholds", "boundaryHandling", "status", "enabled", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 1, 1, 1, 1, '{}'::jsonb, '{}'::jsonb, 'NOT_CALIBRATED', 'PUBLISHED', true, $3, $3, $3)`,
      configId,
      configKey,
      now,
    );

    await insertSession(
      tx,
      sessionAId,
      hash(sessionAToken),
      sessionACsrfHash,
      configId,
      templateVersionId,
      now,
      expiresAt,
    );
    await insertSession(
      tx,
      sessionBId,
      hash(sessionBToken),
      sessionBCsrfHash,
      configId,
      templateVersionId,
      now,
      expiresAt,
    );

    await insertItem(
      tx,
      randomUUID(),
      sessionAId,
      1,
      questionAVersionId,
      "MULTIPLE_CHOICE",
      "MAIN_IDEA",
      0.2,
    );
    await insertItem(
      tx,
      randomUUID(),
      sessionAId,
      2,
      questionBVersionId,
      "MULTIPLE_CHOICE",
      "DETAIL",
      0.6,
    );
    await insertItem(
      tx,
      randomUUID(),
      sessionBId,
      1,
      questionAVersionId,
      "MULTIPLE_CHOICE",
      "MAIN_IDEA",
      0.2,
    );
    await insertItem(
      tx,
      randomUUID(),
      sessionBId,
      2,
      questionBVersionId,
      "MULTIPLE_CHOICE",
      "DETAIL",
      0.6,
    );
  });

  writeEnv(envFile, "GUEST_RLS_SESSION_A_TOKEN", sessionAToken);
  writeEnv(envFile, "GUEST_RLS_SESSION_B_TOKEN", sessionBToken);
  writeEnv(envFile, "GUEST_RLS_SESSION_A_ID", sessionAId);
  writeEnv(envFile, "GUEST_RLS_SESSION_B_ID", sessionBId);
} finally {
  await prisma.$disconnect();
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertDisposableTestDatabase(rawUrl: string, envName: string): void {
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const host = url.hostname.toLowerCase();
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(host) ||
    database !== "oku_plus_test"
  ) {
    throw new Error(
      `${envName} must target localhost/oku_plus_test; refusing non-disposable database`,
    );
  }
}

function connectionIdentity(rawUrl: string): { host: string; database: string; user: string } {
  const url = new URL(rawUrl);
  return {
    host: url.hostname.toLowerCase(),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    user: decodeURIComponent(url.username),
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeEnv(file: string, name: string, value: string): void {
  appendFileSync(file, `${name}=${value}\n`, { encoding: "utf8" });
}

async function insertContent(
  tx: Prisma.TransactionClient,
  contentId: string,
  versionId: string,
  title: string,
  timestamp: Date,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "Content" ("id", "tenantId", "type", "title", "difficulty", "status", "createdAt", "updatedAt")
     VALUES ($1, NULL, 'PASSAGE', $2, 0.5, 'PUBLISHED', $3, $3)`,
    contentId,
    title,
    timestamp,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "ContentVersion" ("id", "contentId", "version", "title", "body", "wordCount", "status", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 1, $3, $4, 10, 'PUBLISHED', $5, $5, $5)`,
    versionId,
    contentId,
    title,
    "CI fixture content",
    timestamp,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "Content" SET "currentVersionId" = $1 WHERE "id" = $2`,
    versionId,
    contentId,
  );
}

async function insertQuestion(
  tx: Prisma.TransactionClient,
  questionId: string,
  questionVersionId: string,
  contentId: string,
  contentVersionId: string,
  position: number,
  difficulty: number,
  skillCode: string,
  timestamp: Date,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "Question" ("id", "contentId", "position", "type", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'MULTIPLE_CHOICE', 'PUBLISHED', $4, $4)`,
    questionId,
    contentId,
    position,
    timestamp,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "QuestionVersion" ("id", "questionId", "contentVersionId", "version", "prompt", "options", "correctAnswer", "difficulty", "status", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 1, $4, '["a", "b"]'::jsonb, '"a"'::jsonb, $5, 'PUBLISHED', $6, $6, $6)`,
    questionVersionId,
    questionId,
    contentVersionId,
    `CI fixture ${skillCode} question`,
    difficulty,
    timestamp,
  );
}

async function insertSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  tokenHash: string,
  csrfTokenHash: string,
  configId: string,
  templateVersionId: string,
  startedAt: Date,
  expiresAt: Date,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "GuestDiagnosticSession"
      ("id", "tokenHash", "csrfTokenHash", "status", "definitionVersion", "scoringContractVersion",
       "recommendationConfigId", "sourceTemplateVersionId", "questionCount", "minimumScorableCount",
       "minimumAnsweredCount", "startedAt", "lastActivityAt", "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'IN_PROGRESS', 1, 1, $4, $5, 2, 1, 1, $6, $6, $7, $6, $6)`,
    sessionId,
    tokenHash,
    csrfTokenHash,
    configId,
    templateVersionId,
    startedAt,
    expiresAt,
  );
}

async function insertItem(
  tx: Prisma.TransactionClient,
  itemId: string,
  sessionId: string,
  position: number,
  questionVersionId: string,
  questionType: string,
  skillCode: string,
  difficulty: number,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "GuestDiagnosticItem"
      ("id", "sessionId", "position", "questionVersionId", "questionType", "skillCode", "difficulty")
     VALUES ($1, $2, $3, $4, $5::"QuestionType", $6, $7)`,
    itemId,
    sessionId,
    position,
    questionVersionId,
    questionType,
    skillCode,
    difficulty,
  );
}
