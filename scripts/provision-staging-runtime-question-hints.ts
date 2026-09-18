/*
 * Staging-only repair for the published runtime question pack.
 *
 * The runtime graph is intentionally immutable: published QuestionVersions are
 * never edited. When a legacy staging question is missing its hint, this
 * script creates one official next version, sends it through the normal
 * review/approve/publish lifecycle, and leaves the old version untouched.
 */
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertApprovedTargetFingerprint,
  assertCatalogEnvironmentSafety,
  assertLiveCatalogTargetIdentity,
  parseCatalogTargetUrl,
  type CatalogTarget,
} from "../src/curriculum/catalog-target-verification.js";

const EXPECTED_ENVIRONMENT = "STAGING" as const;
const EXPECTED_DATABASE = "neondb";
const EXPECTED_STAGING_HOST = "ep-bold-darkness-b13mukqz-pooler.c-5.eu-central-1.aws.neon.tech";
const EXPECTED_STAGING_FINGERPRINT =
  "18b7c0ef4791f6596fe2e61879df641fb14e5a7f88e3d06c88f634c17af13b38";
const STAGING_ORIGIN = "https://okuplus-git-staging-gokcekmustafas-projects.vercel.app";
const PACK_IDENTIFIER = "OKU-TRAINING-CONTENT-PACK-V1";
const OPERATOR_SESSION_PATH = "/internal/staging/super-admin/session";
const SYNTHETIC_REVIEWER_EMAIL = "okuplus.release06.staging.reviewer@synthetic.invalid";
const OPERATOR_ID = "01a08604-8779-7791-b409-3c2b1def2623";
const EXPECTED_QUESTION_COUNT = 36;

type JsonRecord = Record<string, unknown>;

export type RuntimeQuestionRow = {
  questionId: string;
  questionVersionId: string;
  contentVersionId: string | null;
  version: number;
  status: string;
  skillCode: string | null;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  explanation: string | null;
  hint: string | null;
  difficulty: number | null;
};

export type HintRepairAction = "NOOP" | "RESUME" | "CREATE";

export type HintRepairPlan = {
  questionId: string;
  questionVersionId: string;
  skillCode: string;
  hint: string;
  action: HintRepairAction;
};

type Session = { headers: Record<string, string> };

function fail(message: string): never {
  throw new Error(message);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function safeErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[redacted-postgresql-url]");
  for (const name of [
    "DATABASE_URL",
    "DB_FINGERPRINT_DATABASE_URL",
    "STAGING_OPERATOR_AUTH_SECRET",
    "STAGING_SYNTHETIC_REVIEWER_PASSWORD",
  ]) {
    const value = process.env[name];
    if (value) message = message.split(value).join("[redacted-secret]");
  }
  return message;
}

function baseUrl(): string {
  const raw = required("BASE_URL").replace(/\/$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail("BASE_URL geçerli değil");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== STAGING_ORIGIN) {
    fail("BASE_URL yalnızca canonical staging alias olabilir");
  }
  return parsed.origin;
}

function parseStagingTarget(rawUrl: string): CatalogTarget {
  const target = parseCatalogTargetUrl(rawUrl, EXPECTED_ENVIRONMENT);
  assertCatalogEnvironmentSafety(target, { rejectTestDatabase: true });
  if (target.provider !== "NEON" || target.host !== EXPECTED_STAGING_HOST) {
    fail("staging Neon hedefi beklenen endpoint değil");
  }
  if (target.database !== EXPECTED_DATABASE) {
    fail("staging database adı beklenen neondb değil");
  }
  return target;
}

async function assertStagingDatabase(rawUrl: string): Promise<void> {
  const target = parseStagingTarget(rawUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  try {
    const rows = await prisma.$queryRaw<
      Array<{ database: string; schema: string; db_user: string }>
    >`
      SELECT current_database() AS database,
             current_schema() AS schema,
             current_user AS db_user
    `;
    const identity = rows[0];
    if (!identity || identity.database !== EXPECTED_DATABASE || identity.schema !== "public") {
      fail("staging database identity doğrulanamadı");
    }
    assertLiveCatalogTargetIdentity(target, {
      database: identity.database,
      db_user: identity.db_user,
    });
    assertApprovedTargetFingerprint(
      target,
      { database: identity.database, db_user: identity.db_user },
      process.env.DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT,
    );
    if (
      process.env.DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT?.toLowerCase() !==
      EXPECTED_STAGING_FINGERPRINT
    ) {
      fail("approved staging fingerprint beklenen değer değil");
    }
  } finally {
    await prisma.$disconnect();
  }
}

function getSetCookieValues(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") return withGetter.getSetCookie();
  const raw = headers.get("set-cookie") ?? "";
  return raw.split(/,(?=\s*__(?:Host|Secure)-oku_[^=;]+=)/u).filter(Boolean);
}

function cookieHeader(headers: Headers): string {
  return getSetCookieValues(headers)
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

function cookieValue(cookies: string, name: string): string | undefined {
  const item = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

function requestHeaders(
  session: Session | undefined,
  initHeaders: HeadersInit | undefined,
  hasBody: boolean,
): Headers {
  const headers = new Headers(session?.headers ?? {});
  new Headers(initHeaders ?? {}).forEach((value, key) => headers.set(key, value));
  headers.set("accept", "application/json");
  if (hasBody) headers.set("content-type", "application/json");
  else headers.delete("content-type");
  return headers;
}

async function request(
  origin: string,
  path: string,
  session: Session | undefined,
  init: RequestInit = {},
): Promise<{ response: Response; body: JsonRecord }> {
  const hasBody = init.body !== undefined && init.body !== null;
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: (() => {
      const headers = requestHeaders(session, init.headers, hasBody);
      headers.set("origin", origin);
      return headers;
    })(),
  });
  const parsed = (await response.json().catch(() => ({}))) as unknown;
  return { response, body: record(parsed) ?? {} };
}

function apiData(body: JsonRecord): JsonRecord {
  const data = record(body.data);
  return data ?? body;
}

async function requireApi(
  origin: string,
  path: string,
  session: Session | undefined,
  init: RequestInit = {},
): Promise<JsonRecord> {
  const { response, body } = await request(origin, path, session, init);
  if (!response.ok) {
    const error = record(body.error);
    throw new Error(
      `${init.method ?? "GET"} ${path} HTTP ${response.status}: ${String(error?.message ?? "İstek başarısız")}`,
    );
  }
  return apiData(body);
}

async function startOperatorSession(origin: string): Promise<Session> {
  const { response } = await request(origin, OPERATOR_SESSION_PATH, undefined, {
    method: "POST",
    headers: {
      "x-auth-transport": "cookie",
      "x-staging-operator-secret": required("STAGING_OPERATOR_AUTH_SECRET"),
    },
    body: "{}",
  });
  const cookies = cookieHeader(response.headers);
  if (!response.ok || !cookies) fail(`staging operator authentication HTTP ${response.status}`);
  const csrf = cookieValue(cookies, "__Host-oku_csrf");
  if (!csrf) fail("staging operator CSRF cookie alınamadı");
  const me = await requireApi(origin, "/auth/me", undefined, {
    headers: { cookie: cookies, "x-auth-transport": "cookie" },
  });
  const user = record(me.user);
  if (user?.id !== OPERATOR_ID || user.platformRole !== "SUPER_ADMIN") {
    fail("staging operator SUPER_ADMIN olarak doğrulanamadı");
  }
  return {
    headers: {
      cookie: cookies,
      "x-auth-transport": "cookie",
      "x-csrf-token": csrf,
    },
  };
}

async function startReviewerSession(origin: string): Promise<Session> {
  const { response } = await request(origin, "/auth/login", undefined, {
    method: "POST",
    headers: { "x-auth-transport": "cookie" },
    body: JSON.stringify({
      email: SYNTHETIC_REVIEWER_EMAIL,
      password: required("STAGING_SYNTHETIC_REVIEWER_PASSWORD"),
    }),
  });
  const cookies = cookieHeader(response.headers);
  if (!response.ok || !cookies) fail(`synthetic reviewer authentication HTTP ${response.status}`);
  const csrf = cookieValue(cookies, "__Host-oku_csrf");
  if (!csrf) fail("synthetic reviewer CSRF cookie alınamadı");
  const me = await requireApi(origin, "/auth/me", undefined, {
    headers: { cookie: cookies, "x-auth-transport": "cookie" },
  });
  const user = record(me.user);
  if (user?.email !== SYNTHETIC_REVIEWER_EMAIL || user.platformRole !== "CONTENT_REVIEWER") {
    fail("synthetic reviewer CONTENT_REVIEWER olarak doğrulanamadı");
  }
  return {
    headers: {
      cookie: cookies,
      "x-auth-transport": "cookie",
      "x-csrf-token": csrf,
    },
  };
}

async function loadHints(): Promise<Map<string, string>> {
  const path = fileURLToPath(new URL("../content/release-0-6/lessons.json", import.meta.url));
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw) || raw.length !== 6)
    fail("Release 0.6 lesson manifesti 6 kayıt içermeli");
  const hints = new Map<string, string>();
  for (const item of raw) {
    const row = record(item);
    const skillCode = typeof row?.skillCode === "string" ? row.skillCode.trim() : "";
    const guidedPractice = typeof row?.guidedPractice === "string" ? row.guidedPractice.trim() : "";
    if (!skillCode || !guidedPractice) fail("Release 0.6 hint kaynağı eksik");
    if (hints.has(skillCode)) fail(`duplicate hint skill code: ${skillCode}`);
    hints.set(skillCode, guidedPractice);
  }
  return hints;
}

function groupByQuestion(rows: RuntimeQuestionRow[]): Map<string, RuntimeQuestionRow[]> {
  const groups = new Map<string, RuntimeQuestionRow[]>();
  for (const row of rows) groups.set(row.questionId, [...(groups.get(row.questionId) ?? []), row]);
  return groups;
}

export function buildHintRepairPlan(
  rows: RuntimeQuestionRow[],
  hintsBySkill: Map<string, string>,
): HintRepairPlan[] {
  const groups = groupByQuestion(rows);
  const plans: HintRepairPlan[] = [];
  for (const [questionId, versions] of groups) {
    const ordered = [...versions].sort((left, right) => right.version - left.version);
    const published = ordered.filter((row) => row.status === "PUBLISHED");
    const current = published[0];
    if (!current) fail(`${questionId} için published QuestionVersion yok`);
    const skillCode = current.skillCode?.trim();
    const hint = skillCode ? hintsBySkill.get(skillCode) : undefined;
    if (!skillCode || !hint) fail(`${questionId} için canonical hint kaynağı yok`);
    if (current.hint?.trim()) {
      plans.push({
        questionId,
        questionVersionId: current.questionVersionId,
        skillCode,
        hint,
        action: "NOOP",
      });
      continue;
    }
    const activeDrafts = ordered.filter((row) =>
      ["DRAFT", "REVIEW", "APPROVED"].includes(row.status),
    );
    if (activeDrafts.length > 1) fail(`${questionId} için birden fazla aktif taslak sürüm var`);
    const resumable = activeDrafts[0];
    if (resumable && resumable.hint?.trim() !== hint) {
      fail(`${questionId} için mevcut taslak canonical hint ile eşleşmiyor`);
    }
    plans.push({
      questionId,
      questionVersionId: resumable?.questionVersionId ?? current.questionVersionId,
      skillCode,
      hint,
      action: resumable ? "RESUME" : "CREATE",
    });
  }
  return plans;
}

async function readRuntimeQuestionRows(prisma: PrismaClient): Promise<RuntimeQuestionRow[]> {
  return prisma.$queryRaw<RuntimeQuestionRow[]>`
    SELECT q.id AS "questionId",
           qv.id AS "questionVersionId",
           qv."contentVersionId",
           qv.version,
           qv.status,
           s.code AS "skillCode",
           qv.prompt,
           qv.options,
           qv."correctAnswer",
           qv.explanation,
           qv.hint,
           qv.difficulty
    FROM "Question" q
    JOIN "Content" c ON c.id = q."contentId"
    LEFT JOIN "Skill" s ON s.id = q."skillId"
    JOIN "QuestionVersion" qv ON qv."questionId" = q.id
    WHERE c."tenantId" IS NULL
      AND c."deletedAt" IS NULL
      AND c.metadata->>'contentPack' = ${PACK_IDENTIFIER}
      AND q."deletedAt" IS NULL
    ORDER BY q.id, qv.version
  `;
}

function jsonBody(value: unknown): RequestInit["body"] {
  return JSON.stringify(value);
}

async function advanceVersion(
  origin: string,
  versionId: string,
  status: string,
  operator: Session,
  reviewer: Session,
): Promise<void> {
  if (status === "DRAFT") {
    await requireApi(
      origin,
      `/admin/questions/versions/${encodeURIComponent(versionId)}/review`,
      operator,
      { method: "POST", body: jsonBody({}) },
    );
    status = "REVIEW";
  }
  if (status === "REVIEW") {
    await requireApi(
      origin,
      `/admin/questions/versions/${encodeURIComponent(versionId)}/approve`,
      reviewer,
      { method: "POST", body: jsonBody({}) },
    );
    status = "APPROVED";
  }
  if (status === "APPROVED") {
    await requireApi(
      origin,
      `/admin/questions/versions/${encodeURIComponent(versionId)}/publish`,
      reviewer,
      { method: "POST", body: jsonBody({}) },
    );
    return;
  }
  if (status !== "PUBLISHED") fail(`beklenmeyen QuestionVersion lifecycle durumu: ${status}`);
}

async function applyPlan(
  origin: string,
  prisma: PrismaClient,
  rows: RuntimeQuestionRow[],
  plans: HintRepairPlan[],
  operator: Session,
  reviewer: Session,
): Promise<{ noop: number; resumed: number; created: number }> {
  const byVersion = new Map(rows.map((row) => [row.questionVersionId, row]));
  const result = { noop: 0, resumed: 0, created: 0 };
  for (const plan of plans) {
    if (plan.action === "NOOP") {
      result.noop += 1;
      continue;
    }
    let version = byVersion.get(plan.questionVersionId);
    if (plan.action === "CREATE") {
      if (!version) fail(`canonical published sürüm bulunamadı: ${plan.questionId}`);
      const created = await requireApi(
        origin,
        `/admin/questions/${encodeURIComponent(plan.questionId)}/versions`,
        operator,
        {
          method: "POST",
          body: jsonBody({
            contentVersionId: version.contentVersionId,
            prompt: version.prompt,
            options: version.options,
            correctAnswer: version.correctAnswer,
            explanation: version.explanation,
            hint: plan.hint,
            difficulty: version.difficulty,
          }),
        },
      );
      const id = typeof created.id === "string" ? created.id : null;
      if (!id) fail(`${plan.questionId} için yeni QuestionVersion id dönmedi`);
      version = { ...version, questionVersionId: id, status: "DRAFT", hint: plan.hint };
      result.created += 1;
    } else {
      result.resumed += 1;
    }
    await advanceVersion(origin, version.questionVersionId, version.status, operator, reviewer);
    const final = await requireApi(
      origin,
      `/admin/question-versions/${encodeURIComponent(version.questionVersionId)}`,
      operator,
    );
    if (final.status !== "PUBLISHED" || typeof final.hint !== "string" || !final.hint.trim()) {
      fail(`${plan.questionId} için hint QuestionVersion publish doğrulaması başarısız`);
    }
  }
  return result;
}

async function main(): Promise<void> {
  if (!process.argv.slice(2).includes("--apply"))
    fail("staging runtime hint repair yalnız --apply ile çalışır");
  if (required("STAGING_RUNTIME_HINT_REPAIR_CONFIRM") !== "APPLY") {
    fail("STAGING_RUNTIME_HINT_REPAIR_CONFIRM=APPLY gerekli");
  }
  if (required("DB_FINGERPRINT_ENVIRONMENT") !== EXPECTED_ENVIRONMENT) {
    fail("DB_FINGERPRINT_ENVIRONMENT=STAGING gerekli");
  }
  const origin = baseUrl();
  const databaseUrl = required("DB_FINGERPRINT_DATABASE_URL");
  await assertStagingDatabase(databaseUrl);
  const hintsBySkill = await loadHints();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await readRuntimeQuestionRows(prisma);
    if (new Set(rows.map((row) => row.questionId)).size !== EXPECTED_QUESTION_COUNT) {
      fail(`runtime soru pack kapsamı ${EXPECTED_QUESTION_COUNT} unique question içermeli`);
    }
    const plans = buildHintRepairPlan(rows, hintsBySkill);
    const operator = await startOperatorSession(origin);
    const reviewer = await startReviewerSession(origin);
    const applied = await applyPlan(origin, prisma, rows, plans, operator, reviewer);
    console.log(
      JSON.stringify({
        status: "PASS",
        environment: EXPECTED_ENVIRONMENT,
        pack: PACK_IDENTIFIER,
        questionCount: plans.length,
        noop: applied.noop,
        resumed: applied.resumed,
        created: applied.created,
        lifecycle: "DRAFT>REVIEW>APPROVED>PUBLISHED",
        productionTouched: "NO",
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(
      JSON.stringify({ status: "FAIL", reason: safeErrorMessage(error), productionTouched: "NO" }),
    );
    process.exitCode = 1;
  });
}
