import { Prisma, PrismaClient } from "@prisma/client";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  targetFingerprint,
} from "../src/curriculum/catalog-target-verification.js";
import {
  parseTrainingExerciseVersionConfig,
  type TrainingExerciseFamily,
  type TrainingExerciseVersionConfig,
} from "../src/modules/training/exercise-contract.js";

const STAGING_ORIGIN = "https://okuplus-git-staging-gokcekmustafas-projects.vercel.app";
const STAGING_OPERATOR_SESSION_PATH = "/internal/staging/super-admin/session";
const STAGING_OPERATOR_AUTH_SECRET_ENV = "STAGING_OPERATOR_AUTH_SECRET";
const PACK_IDENTIFIER = "OKU-TRAINING-CONTENT-PACK-V1";
const EXPECTED_DATABASE = "neondb";
const EXPECTED_STAGING_HOST = "ep-bold-darkness-b13mukqz-pooler.c-5.eu-central-1.aws.neon.tech";
const EXPECTED_STAGING_FINGERPRINT =
  "18b7c0ef4791f6596fe2e61879df641fb14e5a7f88e3d06c88f634c17af13b38";
const SUPER_ADMIN_ID = "01a08604-8779-7791-b409-3c2b1def2623";
const CSRF_COOKIE_NAME = "__Host-oku_csrf";
const EXPECTED_COUNTS = {
  content: 12,
  contentVersion: 12,
  question: 36,
  questionVersion: 36,
  mapping: 36,
} as const;

type FamilySpec = {
  family: TrainingExerciseFamily;
  competency: TrainingExerciseVersionConfig["competency"];
  rendererKey: string;
};

const FAMILY_SPECS: readonly FamilySpec[] = [
  {
    family: "ATTENTION_BURST",
    competency: "FAST_ATTENTION",
    rendererKey: "QUESTION_ATTENTION_BURST",
  },
  {
    family: "RAPID_RECOGNITION",
    competency: "FAST_RECOGNITION",
    rendererKey: "QUESTION_RAPID_RECOGNITION",
  },
  {
    family: "PHRASE_CHUNKING",
    competency: "FAST_CHUNKING",
    rendererKey: "QUESTION_PHRASE_CHUNKING",
  },
  {
    family: "DETAIL_EVIDENCE",
    competency: "RC_DETAIL",
    rendererKey: "QUESTION_MULTIPLE_CHOICE",
  },
  {
    family: "INFERENCE",
    competency: "RC_INFERENCE",
    rendererKey: "QUESTION_MULTIPLE_CHOICE",
  },
];

type DbIdentity = {
  database: string;
  schema: string;
  current_user: string;
};

type RawContent = {
  id: string;
  tenantId: string | null;
  status: string;
  metadata: unknown;
};

type RawContentVersion = {
  id: string;
  contentId: string;
  version: number;
  status: string;
};

type RawQuestionVersion = {
  questionId: string;
  questionVersionId: string;
  contentId: string;
  contentVersionId: string | null;
  questionStatus: string;
  questionDeletedAt: Date | null;
  questionType: string;
  skillCode: string | null;
  questionVersionNumber: number;
  questionVersionStatus: string;
  options: unknown;
  correctAnswer: unknown;
};

type PackState = {
  contents: RawContent[];
  contentVersions: RawContentVersion[];
  questions: RawQuestionVersion[];
};

type ApiRecord = Record<string, unknown>;

type TemplateVersionSummary = {
  id: string;
  version: number;
  status: string;
};

type TemplateDetail = {
  id: string;
  tenantId: string | null;
  title: string;
  type: string;
  skillId: string | null;
  config: unknown;
  status: string;
  versions: TemplateVersionSummary[];
};

type TemplateVersionDetail = {
  id: string;
  templateId: string;
  version: number;
  config: unknown;
  status: string;
  contents: Array<{ position: number; contentVersionId: string }>;
  questions: Array<{ position: number; questionVersionId: string }>;
};

type SkillItem = { id: string; code: string };

class ProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningError";
  }
}

function fail(message: string): never {
  throw new ProvisioningError(message);
}

function record(value: unknown): ApiRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : null;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function isApplyMode(): boolean {
  return process.argv.slice(2).includes("--apply");
}

function baseUrl(): string {
  const value = (process.env.BASE_URL?.trim() || STAGING_ORIGIN).replace(/\/$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("BASE_URL geçerli bir HTTPS URL olmalı");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== STAGING_ORIGIN) {
    fail("BASE_URL yalnızca sabit staging origin olabilir");
  }
  if (/prod(?:uction)?/iu.test(parsed.origin)) fail("production origin reddedildi");
  return parsed.origin;
}

function databaseTarget(rawUrl: string) {
  let target;
  try {
    target = parseCatalogTargetUrl(rawUrl, "STAGING");
    assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (target.host !== EXPECTED_STAGING_HOST || target.database !== EXPECTED_DATABASE) {
    fail("DB hedefi beklenen staging Neon neondb değil");
  }
  if (/prod(?:uction)?/iu.test(`${target.host}/${target.database}`)) {
    fail("production DB hedefi reddedildi");
  }
  return target;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const secret = process.env[STAGING_OPERATOR_AUTH_SECRET_ENV];
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[redacted-postgresql-url]")
    .replace(secret ?? "\u0000", "[redacted-secret]");
}

function jsonObject(value: unknown, label: string): ApiRecord {
  const result = record(value);
  if (!result) fail(`${label} nesne bekleniyor`);
  return result;
}

function getSetCookieValues(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") return withGetter.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? raw.split(/,(?=\s*__)/u).filter(Boolean) : [];
}

function updateCookieJar(jar: Map<string, string>, headers: Headers): void {
  for (const setCookie of getSetCookieValues(headers)) {
    const pair = setCookie.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function csrfToken(jar: Map<string, string>): string {
  const encoded = jar.get(CSRF_COOKIE_NAME);
  if (!encoded) fail("CSRF cookie alınamadı");
  try {
    return decodeURIComponent(encoded);
  } catch {
    fail("CSRF cookie çözümlenemedi");
  }
}

function messageFromBody(body: unknown): string {
  const root = record(body);
  const error = record(root?.error);
  return typeof error?.message === "string" ? error.message : "İstek başarısız";
}

function dataFromBody<T>(body: unknown): T {
  const root = jsonObject(body, "API yanıtı");
  if (root.success !== true || !("data" in root)) fail("API başarılı veri döndürmedi");
  return root.data as T;
}

function methodIsMutating(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

async function api<T>(
  origin: string,
  jar: Map<string, string>,
  path: string,
  options: { method?: string; body?: unknown; operatorSecret?: string } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers({ accept: "application/json", origin });
  headers.set("x-auth-transport", "cookie");
  const cookies = cookieHeader(jar);
  if (cookies) headers.set("cookie", cookies);

  if (options.operatorSecret !== undefined) {
    headers.set("x-staging-operator-secret", options.operatorSecret);
  } else if (methodIsMutating(method)) {
    headers.set("x-csrf-token", csrfToken(jar));
  }

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${origin}${path}`, init);
  } catch {
    fail(`${method} ${path} staging isteği başarısız`);
  }
  updateCookieJar(jar, response.headers);
  const body = await response.json().catch(() => null);
  if (!response.ok) fail(`${method} ${path} HTTP ${response.status}: ${messageFromBody(body)}`);
  return dataFromBody<T>(body);
}

async function assertDatabaseSafety(prisma: PrismaClient, rawUrl: string): Promise<string> {
  const target = databaseTarget(rawUrl);
  const rows = await prisma.$queryRaw<DbIdentity[]>(Prisma.sql`
    SELECT current_database() AS database,
           current_schema() AS schema,
           current_user AS current_user
  `);
  const identity = rows[0];
  if (!identity) fail("DB identity okunamadı");
  assertLiveCatalogTargetIdentity(target, {
    database: identity.database,
    db_user: identity.current_user,
  });
  if (identity.schema !== "public") fail("DB schema public değil");
  const actual = targetFingerprint(target, {
    database: identity.database,
    db_user: identity.current_user,
  });
  const approved = requiredEnv("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT").toLowerCase();
  if (actual !== EXPECTED_STAGING_FINGERPRINT || actual !== approved) {
    fail("staging DB identity fingerprint beklenen hedefle eşleşmedi");
  }
  return actual;
}

async function assertCurrentMigrations(prisma: PrismaClient): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationRoot = resolve(repoRoot, "prisma", "migrations");
  const repositoryNames = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const rows = await prisma.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
  >(Prisma.sql`
    SELECT migration_name, finished_at, rolled_back_at
    FROM public."_prisma_migrations"
    ORDER BY started_at
  `);
  const applied = new Set(
    rows
      .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
      .map((row) => row.migration_name),
  );
  const failed = rows.filter((row) => row.rolled_back_at !== null || row.finished_at === null);
  const pending = repositoryNames.filter((name) => !applied.has(name));
  if (failed.length > 0 || pending.length > 0) {
    fail("staging migration durumu CURRENT değil");
  }
}

function metadataHasFamily(metadata: unknown, family: TrainingExerciseFamily): boolean {
  const object = record(metadata);
  return Array.isArray(object?.exerciseFamilies) && object.exerciseFamilies.includes(family);
}

async function readPackState(prisma: PrismaClient): Promise<PackState> {
  const contents = await prisma.$queryRaw<RawContent[]>(Prisma.sql`
    SELECT id, "tenantId", status, metadata
    FROM "Content"
    WHERE "tenantId" IS NULL
      AND "deletedAt" IS NULL
      AND metadata->>'contentPack' = ${PACK_IDENTIFIER}
    ORDER BY id
  `);
  if (contents.length !== EXPECTED_COUNTS.content) {
    fail(`Content Pack kapsamı beklenen ${EXPECTED_COUNTS.content} Content değil`);
  }

  const contentIds = contents.map((content) => content.id);
  const contentVersions = contentIds.length
    ? await prisma.$queryRaw<RawContentVersion[]>(Prisma.sql`
        SELECT cv.id, cv."contentId", cv.version, cv.status
        FROM "ContentVersion" cv
        JOIN "Content" c ON c.id = cv."contentId"
        WHERE c."tenantId" IS NULL
          AND c."deletedAt" IS NULL
          AND c.metadata->>'contentPack' = ${PACK_IDENTIFIER}
        ORDER BY cv."contentId", cv.version
      `)
    : [];
  const questions = contentIds.length
    ? await prisma.$queryRaw<RawQuestionVersion[]>(Prisma.sql`
        SELECT q.id AS "questionId",
               qv.id AS "questionVersionId",
               q."contentId",
               qv."contentVersionId",
               q.status AS "questionStatus",
               q."deletedAt" AS "questionDeletedAt",
               q.type AS "questionType",
               s.code AS "skillCode",
               qv.version AS "questionVersionNumber",
               qv.status AS "questionVersionStatus",
               qv.options,
               qv."correctAnswer"
        FROM "Question" q
        JOIN "Content" c ON c.id = q."contentId"
        LEFT JOIN "Skill" s ON s.id = q."skillId"
        JOIN "QuestionVersion" qv ON qv."questionId" = q.id
        WHERE c."tenantId" IS NULL
          AND c."deletedAt" IS NULL
          AND c.metadata->>'contentPack' = ${PACK_IDENTIFIER}
          AND q."deletedAt" IS NULL
        ORDER BY q."contentId", q.position, qv.version
      `)
    : [];

  const questionIds = new Set(questions.map((question) => question.questionId));
  if (
    contentVersions.length < EXPECTED_COUNTS.contentVersion ||
    questionIds.size !== EXPECTED_COUNTS.question
  ) {
    fail("Content Pack ContentVersion/Question kapsamı beklenen değil");
  }
  return { contents, contentVersions, questions };
}

function optionsAreValid(options: unknown, correctAnswer: unknown): boolean {
  if (!Array.isArray(options) || options.length !== 4) return false;
  const keys = options.map((option) => {
    const object = record(option);
    return typeof object?.id === "string"
      ? object.id
      : typeof object?.key === "string"
        ? object.key
        : null;
  });
  if (keys.some((key) => key === null) || new Set(keys).size !== 4) return false;
  const answer = record(correctAnswer);
  const answerIds = answer?.correctOptionIds;
  return (
    answer !== null &&
    Array.isArray(answerIds) &&
    answerIds.length === 1 &&
    typeof answerIds[0] === "string" &&
    keys.includes(answerIds[0]) &&
    answer.allowMultiple === false
  );
}

function selectFamilyPack(state: PackState, spec: FamilySpec) {
  const contentIds = new Set(
    state.contents
      .filter((content) => metadataHasFamily(content.metadata, spec.family))
      .map((content) => content.id),
  );
  if (contentIds.size !== 2) fail(`${spec.family} için tam 2 Content bulunamadı`);

  const contentVersions = state.contentVersions.filter(
    (contentVersion) =>
      contentIds.has(contentVersion.contentId) && contentVersion.status === "PUBLISHED",
  );
  const selectedContentVersions = [...contentIds].map((contentId) => {
    const candidates = contentVersions
      .filter((contentVersion) => contentVersion.contentId === contentId)
      .sort((left, right) => right.version - left.version);
    const selected = candidates[0];
    if (!selected) fail(`${spec.family} için yayınlanmış ContentVersion bulunamadı`);
    return selected;
  });
  const selectedContentVersionIds = new Set(selectedContentVersions.map((row) => row.id));

  const questionRows = state.questions.filter((question) => contentIds.has(question.contentId));
  const questionIds = [...new Set(questionRows.map((question) => question.questionId))];
  if (questionIds.length !== 6) fail(`${spec.family} için tam 6 Question bulunamadı`);

  const selectedQuestionVersions = questionIds.map((questionId) => {
    const candidates = questionRows
      .filter(
        (question) =>
          question.questionId === questionId &&
          question.questionVersionStatus === "PUBLISHED" &&
          question.contentVersionId !== null &&
          selectedContentVersionIds.has(question.contentVersionId),
      )
      .sort((left, right) => right.questionVersionNumber - left.questionVersionNumber);
    const selected = candidates[0];
    if (!selected) fail(`${spec.family} için yayınlanmış QuestionVersion bulunamadı`);
    return selected;
  });

  for (const content of state.contents.filter((row) => contentIds.has(row.id))) {
    if (content.status !== "PUBLISHED" || content.tenantId !== null) {
      fail(`${spec.family} parent Content yayınlanmış/global değil`);
    }
  }
  for (const question of selectedQuestionVersions) {
    if (
      question.questionStatus !== "PUBLISHED" ||
      question.questionDeletedAt !== null ||
      question.questionType !== "MULTIPLE_CHOICE" ||
      question.skillCode !== spec.competency ||
      !optionsAreValid(question.options, question.correctAnswer)
    ) {
      fail(`${spec.family} QuestionVersion graph sözleşmesi geçersiz`);
    }
    if (!question.contentVersionId || !selectedContentVersionIds.has(question.contentVersionId)) {
      fail(`${spec.family} QuestionVersion ContentVersion eşleşmesi geçersiz`);
    }
  }

  return {
    contentVersionIds: selectedContentVersions.map((row) => row.id),
    questionVersionIds: selectedQuestionVersions.map((row) => row.questionVersionId),
  };
}

function versionConfig(spec: FamilySpec): TrainingExerciseVersionConfig {
  return parseTrainingExerciseVersionConfig({
    schemaVersion: 1,
    family: spec.family,
    competency: spec.competency,
    difficulty: "FOUNDATION",
    estimatedDurationSeconds: 90,
    instructions:
      spec.family === "INFERENCE"
        ? "Pasajı oku ve metinden çıkarılabilecek en güçlü sonucu seç."
        : "Pasajı oku ve soruya en uygun seçeneği seç.",
    interactionType: "MULTIPLE_CHOICE",
    contentRequirement: "REQUIRED",
    questionRequirement: "REQUIRED",
    scoring: {
      mode: "DETERMINISTIC",
      primarySignal: "ACCURACY",
      timeRole: "SECONDARY",
      maxScore: 1,
      openEnded: false,
    },
    feedback: {
      types: ["POSITIVE", "CORRECTIVE", "HINT"],
      showExplanation: true,
      retryEnabled: false,
      maxMessageLength: 240,
    },
    xp: { completionPoints: 12, correctAnswerBonus: 4, dailyCap: 100 },
    eligibility: {
      usage: "TRAINING_ONLY",
      requiresPublishedContent: true,
      requiresPublishedQuestions: true,
      minimumDifficulty: "FOUNDATION",
      maximumDifficulty: "CHALLENGING",
    },
    rendererKey: spec.rendererKey,
    settings: { optionCount: 4, showExplanation: true },
  });
}

function stableIdentity(spec: FamilySpec): string {
  return `STAGING-RUNTIME-GRAPH-V1-${spec.family}-${PACK_IDENTIFIER}`;
}

function templateTitle(spec: FamilySpec): string {
  return `STAGING · ${spec.family} · ${PACK_IDENTIFIER}`;
}

function runtimeSpecForTemplate(template: TemplateDetail): FamilySpec | null {
  const marker = record(template.config)?.stableFixtureIdentity;
  if (typeof marker !== "string") return null;
  return FAMILY_SPECS.find((spec) => marker === stableIdentity(spec)) ?? null;
}

function parentMarker(spec: FamilySpec): ApiRecord {
  return {
    stableFixtureIdentity: stableIdentity(spec),
    catalogMetadata: "STAGING_ONLY",
    contentPack: PACK_IDENTIFIER,
    exerciseFamily: spec.family,
  };
}

function exactIds(
  values: Array<{ position: number; contentVersionId?: string; questionVersionId?: string }>,
): string[] {
  return values
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((row) => row.contentVersionId ?? row.questionVersionId ?? "");
}

function graphIsExact(
  template: TemplateDetail,
  detail: TemplateVersionDetail,
  spec: FamilySpec,
  contentVersionIds: string[],
  questionVersionIds: string[],
): boolean {
  const config = record(detail.config);
  let configValid = false;
  try {
    const parsed = parseTrainingExerciseVersionConfig(detail.config);
    configValid =
      parsed.family === spec.family &&
      parsed.competency === spec.competency &&
      parsed.rendererKey === spec.rendererKey;
  } catch {
    configValid = false;
  }
  return (
    template.status === "PUBLISHED" &&
    detail.status === "PUBLISHED" &&
    config !== null &&
    configValid &&
    [...new Set(exactIds(detail.contents))].length === contentVersionIds.length &&
    exactIds(detail.contents).every((id, index) => id === contentVersionIds[index]) &&
    [...new Set(exactIds(detail.questions))].length === questionVersionIds.length &&
    exactIds(detail.questions).every((id, index) => id === questionVersionIds[index])
  );
}

async function loadSkills(origin: string, jar: Map<string, string>): Promise<Map<string, string>> {
  const data = await api<{ items: SkillItem[] }>(origin, jar, "/admin/skills?page=1&pageSize=100");
  const result = new Map<string, string>();
  for (const item of data.items) {
    if (typeof item.id === "string" && typeof item.code === "string")
      result.set(item.code, item.id);
  }
  return result;
}

async function loadTemplateInventory(
  origin: string,
  jar: Map<string, string>,
): Promise<{
  runtimeByIdentity: Map<string, TemplateDetail>;
  publishedFamilies: Map<string, string[]>;
}> {
  const list = await api<{ items: Array<{ id: string; title: string }>; total: number }>(
    origin,
    jar,
    "/admin/templates?scope=GLOBAL&page=1&pageSize=100",
  );
  if (list.total > list.items.length)
    fail("Template duplicate taraması için ilk 100 kayıt yeterli değil");

  const runtimeByIdentity = new Map<string, TemplateDetail>();
  const publishedFamilies = new Map<string, string[]>();
  for (const item of list.items) {
    const detail = await api<TemplateDetail>(
      origin,
      jar,
      `/admin/templates/${encodeURIComponent(item.id)}`,
    );
    const runtimeSpec = runtimeSpecForTemplate(detail);
    if (!runtimeSpec) continue;
    const identity = stableIdentity(runtimeSpec);
    if (runtimeByIdentity.has(identity))
      fail(`aynı runtime template identity birden fazla bulundu: ${identity}`);
    runtimeByIdentity.set(identity, detail);
    for (const version of detail.versions) {
      if (version.status !== "PUBLISHED") continue;
      const versionDetail = await api<TemplateVersionDetail>(
        origin,
        jar,
        `/admin/templates/versions/${encodeURIComponent(version.id)}`,
      );
      let config: TrainingExerciseVersionConfig;
      try {
        config = parseTrainingExerciseVersionConfig(versionDetail.config);
      } catch {
        continue;
      }
      if (
        config.family !== runtimeSpec.family ||
        config.competency !== runtimeSpec.competency ||
        config.rendererKey !== runtimeSpec.rendererKey
      ) {
        continue;
      }
      const key = `${config.family}:${config.competency}`;
      const matches = publishedFamilies.get(key) ?? [];
      matches.push(detail.id);
      publishedFamilies.set(key, matches);
    }
  }
  return { runtimeByIdentity, publishedFamilies };
}

async function provisionFamily(
  origin: string,
  jar: Map<string, string>,
  spec: FamilySpec,
  skillId: string,
  source: { contentVersionIds: string[]; questionVersionIds: string[] },
  inventory: {
    runtimeByIdentity: Map<string, TemplateDetail>;
    publishedFamilies: Map<string, string[]>;
  },
  apply: boolean,
): Promise<"NOOP" | "CREATED" | "UPDATED"> {
  const title = templateTitle(spec);
  const identity = stableIdentity(spec);
  const existing = inventory.runtimeByIdentity.get(identity);
  const publishedMatches =
    inventory.publishedFamilies.get(`${spec.family}:${spec.competency}`) ?? [];
  if (publishedMatches.length > 1)
    fail(`${spec.family} için birden fazla published template bulundu`);
  if (publishedMatches.length === 1 && (!existing || publishedMatches[0] !== existing.id)) {
    fail(`${spec.family} için mevcut published template conflict oluşturuyor`);
  }

  let template: TemplateDetail;
  let version: TemplateVersionDetail;
  let action: "CREATED" | "UPDATED" = "CREATED";
  if (!existing) {
    if (!apply) return "CREATED";
    template = await api<TemplateDetail>(origin, jar, "/admin/templates", {
      method: "POST",
      body: {
        tenantId: null,
        title,
        type: "COMPREHENSION",
        skillId,
        config: parentMarker(spec),
      },
    });
    const firstVersion = template.versions.find((candidate) => candidate.version === 1);
    if (!firstVersion) fail(`${spec.family} için oluşturulan v1 bulunamadı`);
    version = await api<TemplateVersionDetail>(
      origin,
      jar,
      `/admin/templates/versions/${encodeURIComponent(firstVersion.id)}`,
    );
  } else {
    const marker = record(existing.config)?.stableFixtureIdentity;
    if (marker !== identity) fail(`${spec.family} template identity marker uyuşmuyor`);
    if (
      existing.tenantId !== null ||
      existing.skillId !== skillId ||
      existing.type !== "COMPREHENSION"
    ) {
      fail(`${spec.family} mevcut template kapsamı beklenen değil`);
    }
    if (existing.versions.length !== 1 || existing.versions[0]?.version !== 1) {
      fail(`${spec.family} template version yapısı beklenen değil`);
    }
    template = existing;
    version = await api<TemplateVersionDetail>(
      origin,
      jar,
      `/admin/templates/versions/${encodeURIComponent(existing.versions[0].id)}`,
    );
    action = "UPDATED";
    if (
      graphIsExact(template, version, spec, source.contentVersionIds, source.questionVersionIds)
    ) {
      return "NOOP";
    }
    if (version.status !== "DRAFT") {
      fail(`${spec.family} partial graph DRAFT değil; güvenli devam edilemiyor`);
    }
  }

  if (!apply) return action;
  if (version.status !== "DRAFT") fail(`${spec.family} version DRAFT değil`);

  const config = versionConfig(spec);
  await api(origin, jar, `/admin/templates/versions/${encodeURIComponent(version.id)}`, {
    method: "PATCH",
    body: { config },
  });
  await api(origin, jar, `/admin/templates/versions/${encodeURIComponent(version.id)}/contents`, {
    method: "PUT",
    body: {
      contents: source.contentVersionIds.map((contentVersionId, position) => ({
        contentVersionId,
        position,
      })),
    },
  });
  await api(origin, jar, `/admin/templates/versions/${encodeURIComponent(version.id)}/questions`, {
    method: "PUT",
    body: {
      questions: source.questionVersionIds.map((questionVersionId, position) => ({
        questionVersionId,
        position,
      })),
    },
  });
  await api(origin, jar, `/admin/templates/versions/${encodeURIComponent(version.id)}/review`, {
    method: "POST",
  });
  await api(origin, jar, `/admin/templates/versions/${encodeURIComponent(version.id)}/publish`, {
    method: "POST",
  });

  const finalVersion = await api<TemplateVersionDetail>(
    origin,
    jar,
    `/admin/templates/versions/${encodeURIComponent(version.id)}`,
  );
  const finalTemplate = await api<TemplateDetail>(
    origin,
    jar,
    `/admin/templates/${encodeURIComponent(template.id)}`,
  );
  if (
    !graphIsExact(
      finalTemplate,
      finalVersion,
      spec,
      source.contentVersionIds,
      source.questionVersionIds,
    )
  ) {
    fail(`${spec.family} publish sonrası graph doğrulanamadı`);
  }
  return action;
}

async function main(): Promise<void> {
  const apply = isApplyMode();
  const origin = baseUrl();
  const operatorSecret = requiredEnv(STAGING_OPERATOR_AUTH_SECRET_ENV);
  if (process.env.DB_FINGERPRINT_ENVIRONMENT?.trim() !== "STAGING") {
    fail("DB_FINGERPRINT_ENVIRONMENT=STAGING gerekli");
  }
  const databaseUrl = requiredEnv("DB_FINGERPRINT_DATABASE_URL");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const jar = new Map<string, string>();
  const actions: Record<string, string> = {};
  try {
    const fingerprint = await assertDatabaseSafety(prisma, databaseUrl);
    await assertCurrentMigrations(prisma);
    const before = await readPackState(prisma);
    const sources = new Map(
      FAMILY_SPECS.map((spec) => [spec.family, selectFamilyPack(before, spec)] as const),
    );

    await api(origin, jar, STAGING_OPERATOR_SESSION_PATH, {
      method: "POST",
      body: {},
      operatorSecret,
    });
    const me = await api<{
      user: { id: string; platformRole: string | null };
      tenantContext: ApiRecord | null;
    }>(origin, jar, "/auth/me");
    if (me.user.id !== SUPER_ADMIN_ID || me.user.platformRole !== "SUPER_ADMIN") {
      fail("staging operator session SUPER_ADMIN actor olarak doğrulanamadı");
    }
    if (
      !me.tenantContext ||
      me.tenantContext.userId !== SUPER_ADMIN_ID ||
      me.tenantContext.platformRole !== "SUPER_ADMIN" ||
      me.tenantContext.tenantId !== null
    ) {
      fail("staging operator tenant context global değil");
    }

    const skills = await loadSkills(origin, jar);
    const inventory = await loadTemplateInventory(origin, jar);
    for (const spec of FAMILY_SPECS) {
      const skillId = skills.get(spec.competency);
      if (!skillId) fail(`${spec.competency} Skill bulunamadı`);
      actions[spec.family] = await provisionFamily(
        origin,
        jar,
        spec,
        skillId,
        sources.get(spec.family)!,
        inventory,
        apply,
      );
    }

    if (apply) {
      const after = await readPackState(prisma);
      if (
        after.contents.length !== before.contents.length ||
        after.contentVersions.length !== before.contentVersions.length ||
        new Set(after.questions.map((question) => question.questionId)).size !==
          new Set(before.questions.map((question) => question.questionId)).size
      ) {
        fail("Content Pack kayıt sayıları provisioning sonrası değişti");
      }
    }
    console.log(
      JSON.stringify(
        {
          status: apply ? "PASS" : "PLAN_READY",
          mode: apply ? "APPLY" : "READ_ONLY_PLAN",
          operator: "SUPER_ADMIN_SESSION_VERIFIED",
          dbFingerprint: fingerprint,
          migrationStatus: "CURRENT",
          pack: PACK_IDENTIFIER,
          expectedPackCounts: EXPECTED_COUNTS,
          actions,
          writes: apply ? "TEMPLATE_AUTHORING_API_ONLY" : "NO",
          productionTouched: "NO",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        message: safeErrorMessage(error),
        productionTouched: "NO",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
