import { createHash, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";

import { FIRST_REAL_CURRICULUM_PACK } from "../src/curriculum/first-real-pack.js";
import {
  GUEST_DIAGNOSTIC_CANDIDATES,
  GUEST_DIAGNOSTIC_CONFIG_KEY,
  GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT,
  GUEST_DIAGNOSTIC_QUESTION_COUNT,
  GUEST_DIAGNOSTIC_SCORING_VERSION,
} from "../src/modules/guest-diagnostic/definition.js";

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

    await insertGuestDiagnosticApiFixtures(tx, now);
  });

  maskGitHubActionsValue(sessionAToken);
  maskGitHubActionsValue(sessionBToken);
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

function maskGitHubActionsValue(value: string): void {
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stdout.write(`::add-mask::${value}\n`);
  }
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

async function insertGuestDiagnosticApiFixtures(
  tx: Prisma.TransactionClient,
  timestamp: Date,
): Promise<void> {
  const skillIds = new Map<string, string>();
  const skillDefinitions = [
    { code: "RC_MAIN_IDEA", category: "MAIN_IDEA", name: "Ana fikir" },
    { code: "RC_DETAIL", category: "DETAIL", name: "Detay" },
    { code: "RC_INFERENCE", category: "INFERENCE", name: "Çıkarım" },
  ] as const;

  for (const skill of skillDefinitions) {
    const id = `ci-guest-diagnostic-skill-${skill.code.toLowerCase()}`;
    await tx.$executeRawUnsafe(
      `INSERT INTO "Skill" ("id", "code", "name", "category", "displayOrder", "createdAt")
       VALUES ($1, $2, $3, $4::"SkillCategory", $5, $6)
       ON CONFLICT ("code") DO NOTHING`,
      id,
      skill.code,
      skill.name,
      skill.category,
      skillDefinitions.findIndex((entry) => entry.code === skill.code) + 1,
      timestamp,
    );
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Skill" WHERE "code" = ${skill.code}
    `;
    if (!rows[0])
      throw new Error(`Guest Diagnostic CI skill fixture oluşturulamadı: ${skill.code}`);
    skillIds.set(skill.code, rows[0].id);
  }

  const candidatesByTemplate = new Map<string, (typeof GUEST_DIAGNOSTIC_CANDIDATES)[number][]>();
  for (const candidate of GUEST_DIAGNOSTIC_CANDIDATES) {
    const existing = candidatesByTemplate.get(candidate.sourceTemplateVersionId) ?? [];
    existing.push(candidate);
    candidatesByTemplate.set(candidate.sourceTemplateVersionId, existing);
  }

  const contentItems = new Map(
    FIRST_REAL_CURRICULUM_PACK.contents.map((item) => [item.slug, item]),
  );

  for (const [templateVersionId, candidates] of candidatesByTemplate) {
    const templateSlug = templateVersionId
      .replace(/^8g8-template-version-/u, "")
      .replace(/-v1$/u, "");
    const content = contentItems.get(templateSlug);
    if (!content)
      throw new Error(`Guest Diagnostic CI content fixture bulunamadı: ${templateSlug}`);

    const contentId = `ci-guest-diagnostic-content-${templateSlug}`;
    const contentVersionId = `ci-guest-diagnostic-content-version-${templateSlug}-v1`;
    const templateId = `ci-guest-diagnostic-template-${templateSlug}`;
    const skillId = skillIds.get(candidates[0]!.skillCode);
    if (!skillId)
      throw new Error(`Guest Diagnostic CI skill fixture bulunamadı: ${candidates[0]!.skillCode}`);

    await tx.$executeRawUnsafe(
      `INSERT INTO "Content" ("id", "tenantId", "type", "title", "difficulty", "status", "createdAt", "updatedAt")
       VALUES ($1, NULL, 'PASSAGE', $2, $3, 'PUBLISHED', $4, $4)`,
      contentId,
      content.title,
      content.difficulty,
      timestamp,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ContentVersion" ("id", "contentId", "version", "title", "body", "wordCount", "status", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 1, $3, $4, $5, 'PUBLISHED', $6, $6, $6)`,
      contentVersionId,
      contentId,
      content.title,
      content.body,
      content.body.trim().split(/\s+/u).filter(Boolean).length,
      timestamp,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "Content" SET "currentVersionId" = $1 WHERE "id" = $2`,
      contentVersionId,
      contentId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ContentSkill" ("contentId", "skillId") VALUES ($1, $2)`,
      contentId,
      skillId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseTemplate" ("id", "tenantId", "title", "type", "config", "status", "contentId", "createdAt", "updatedAt")
       VALUES ($1, NULL, $2, 'COMPREHENSION', $3::jsonb, 'PUBLISHED', $4, $5, $5)`,
      templateId,
      `CI Guest Diagnostic · ${content.title}`,
      JSON.stringify({ source: "ci-guest-diagnostic-api", slug: templateSlug }),
      contentId,
      timestamp,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseTemplateVersion" ("id", "templateId", "version", "config", "status", "publishedAt", "createdAt")
       VALUES ($1, $2, 1, $3::jsonb, 'PUBLISHED', $4, $4)`,
      templateVersionId,
      templateId,
      JSON.stringify({ source: "ci-guest-diagnostic-api", slug: templateSlug }),
      timestamp,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ExerciseTemplateVersionContent" ("templateVersionId", "contentVersionId", "position")
       VALUES ($1, $2, 0)`,
      templateVersionId,
      contentVersionId,
    );

    for (const candidate of candidates) {
      const questionPosition = Number(candidate.questionId.split("-").at(-1)) - 1;
      const question = content.questions[questionPosition];
      const candidateSkillId = skillIds.get(candidate.skillCode);
      if (!question || !candidateSkillId) {
        throw new Error(
          `Guest Diagnostic CI question fixture bulunamadı: ${candidate.questionVersionId}`,
        );
      }
      if (question.difficulty !== candidate.difficulty) {
        throw new Error(
          `Guest Diagnostic CI difficulty eşleşmiyor: ${candidate.questionVersionId}`,
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "Question" ("id", "contentId", "position", "type", "skillId", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::"QuestionType", $5, 'PUBLISHED', $6, $6)`,
        candidate.questionId,
        contentId,
        questionPosition,
        question.type,
        candidateSkillId,
        timestamp,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "QuestionVersion" ("id", "questionId", "contentVersionId", "version", "prompt", "options", "correctAnswer", "explanation", "hint", "difficulty", "status", "publishedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6::jsonb, $7, $8, $9, 'PUBLISHED', $10, $10, $10)`,
        candidate.questionVersionId,
        candidate.questionId,
        contentVersionId,
        question.prompt,
        JSON.stringify(question.options),
        JSON.stringify(question.correctAnswer),
        question.explanation,
        question.hint,
        question.difficulty,
        timestamp,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "ExerciseTemplateVersionQuestion" ("templateVersionId", "questionVersionId", "questionId", "position")
         VALUES ($1, $2, $3, $4)`,
        templateVersionId,
        candidate.questionVersionId,
        candidate.questionId,
        questionPosition,
      );
    }
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO "GuestDiagnosticRecommendationConfig"
      ("id", "configKey", "version", "scoringContractVersion", "minimumAnsweredCount", "minimumScorableCount",
       "recommendationThresholds", "skillSignalThresholds", "boundaryHandling", "status", "enabled", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 1, $3, $4, $5, $6::jsonb, $7::jsonb, 'BOUNDARY_SENSITIVE', 'PUBLISHED', true, $8, $8, $8)`,
    "ci-guest-diagnostic-recommendation-v1",
    GUEST_DIAGNOSTIC_CONFIG_KEY,
    GUEST_DIAGNOSTIC_SCORING_VERSION,
    GUEST_DIAGNOSTIC_QUESTION_COUNT,
    GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT,
    JSON.stringify({
      bands: [
        { levelCode: "R1_FOUNDATION", minInclusive: 0, maxExclusive: 0.35 },
        { levelCode: "R2_DEVELOPING", minInclusive: 0.35, maxExclusive: 0.55 },
        { levelCode: "R3_INDEPENDENT", minInclusive: 0.55, maxExclusive: 0.75 },
        { levelCode: "R4_ADVANCED", minInclusive: 0.75, maxInclusive: 1 },
      ],
    }),
    JSON.stringify({ minimumSkillAnsweredCount: 1, distinctSkillDelta: 0.5 }),
    timestamp,
  );
}
