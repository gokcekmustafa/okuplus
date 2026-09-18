import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { parseLessonMetadata, type LessonMetadata } from "../src/modules/lessons/contract.js";

const EXPECTED_ENVIRONMENT = "STAGING" as const;
const EXPECTED_DATABASE = "neondb";
const EXPECTED_FINGERPRINT = "18b7c0ef4791f6596fe2e61879df641fb14e5a7f88e3d06c88f634c17af13b38";
const SYNTHETIC_REVIEWER_EMAIL = "okuplus.release06.staging.reviewer@synthetic.invalid";
const OPERATOR_PATH = "/internal/staging/super-admin/session";
const OPERATOR_ID = "01a08604-8779-7791-b409-3c2b1def2623";

type LessonSpec = {
  key: string;
  family: string;
  skillCode: string;
  title: string;
  body: string;
  objective: string;
  explanation: string;
  workedExample: string;
  guidedPractice: string;
  completionLabel: string;
};

type ApiBody = { data?: unknown; error?: { message?: string } } & Record<string, unknown>;

export const LESSON_CONTENT_PATH = "../content/release-0-6/lessons.json";

function fail(message: string): never {
  throw new Error(message);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} gerekli`);
  return value;
}

function safeErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[redacted-postgresql-url]");
  for (const name of [
    "STAGING_OPERATOR_AUTH_SECRET",
    "STAGING_SYNTHETIC_REVIEWER_PASSWORD",
    "STAGING_REVIEWER_PASSWORD",
  ]) {
    const value = process.env[name];
    if (value) message = message.split(value).join("[redacted-secret]");
  }
  return message;
}

function baseUrl(): string {
  const value = required("BASE_URL").replace(/\/$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("BASE_URL geçerli bir URL değil");
  }
  if (
    parsed.protocol !== "https:" ||
    !/^okuplus-[a-z0-9-]+-gokcekmustafas-projects\.vercel\.app$/u.test(parsed.hostname)
  ) {
    fail("BASE_URL onaylı staging deployment URL'si değil");
  }
  return value;
}

function parseTarget(rawUrl: string): {
  host: string;
  port: string;
  database: string;
  user: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("DB_FINGERPRINT_DATABASE_URL geçerli bir PostgreSQL URL değil");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail("yalnız PostgreSQL URL kabul edilir");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  const user = decodeURIComponent(parsed.username);
  if (!/\.neon\.tech$/iu.test(host) || /prod(?:uction)?/iu.test(`${host}/${database}`)) {
    fail("staging Neon hedefi doğrulanamadı");
  }
  if (database !== EXPECTED_DATABASE || !user) fail("staging database identity hedefi geçersiz");
  return { host, port: parsed.port || "5432", database, user };
}

function fingerprint(
  target: { host: string; port: string },
  identity: { database: string; current_user: string },
): string {
  return createHash("sha256")
    .update(
      [
        "oku-catalog-target-v1",
        EXPECTED_ENVIRONMENT,
        "NEON",
        target.host,
        target.port,
        identity.database,
        identity.current_user,
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

async function assertStagingTarget(): Promise<void> {
  if (required("DB_FINGERPRINT_ENVIRONMENT") !== EXPECTED_ENVIRONMENT) {
    fail("DB_FINGERPRINT_ENVIRONMENT tam olarak STAGING olmalı");
  }
  if (
    required("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT").toLowerCase() !== EXPECTED_FINGERPRINT
  ) {
    fail("approved staging fingerprint beklenen hedefle eşleşmiyor");
  }
  const rawUrl = required("DB_FINGERPRINT_DATABASE_URL");
  const target = parseTarget(rawUrl);
  const client = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  try {
    const rows = await client.$queryRaw<
      Array<{ database: string; schema: string; current_user: string }>
    >`
      SELECT current_database() AS database, current_schema() AS schema, current_user AS current_user
    `;
    const identity = rows[0];
    if (!identity || identity.database !== EXPECTED_DATABASE || identity.schema !== "public") {
      fail("staging database identity doğrulanamadı");
    }
    if (identity.current_user !== target.user) fail("staging database user identity eşleşmedi");
    if (fingerprint(target, identity) !== EXPECTED_FINGERPRINT) {
      fail("approved staging target fingerprint eşleşmedi");
    }
  } finally {
    await client.$disconnect();
  }
}

function getSetCookieValues(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
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

type Session = { headers: Record<string, string>; user: Record<string, unknown> };

async function request(origin: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = buildRequestHeaders(init.headers, init.body !== undefined && init.body !== null);
  headers.set("origin", origin);
  return fetch(`${origin}${path}`, { ...init, headers });
}

export function buildRequestHeaders(init: HeadersInit | undefined, hasBody: boolean): Headers {
  const headers = new Headers(init ?? {});
  headers.set("accept", "application/json");
  if (hasBody) headers.set("content-type", "application/json");
  else headers.delete("content-type");
  return headers;
}

async function api<T = unknown>(origin: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(origin, path, init);
  const body = (await response.json().catch(() => ({}))) as ApiBody;
  if (!response.ok) {
    fail(
      `${init.method ?? "GET"} ${path} HTTP ${response.status}: ${body.error?.message ?? "İstek başarısız"}`,
    );
  }
  return (body.data ?? body) as T;
}

async function startOperatorSession(origin: string): Promise<Session> {
  const response = await request(origin, OPERATOR_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-auth-transport": "cookie",
      "x-staging-operator-secret": required("STAGING_OPERATOR_AUTH_SECRET"),
    },
    body: "{}",
  });
  await response.json().catch(() => ({}));
  if (!response.ok) fail(`staging operator authentication HTTP ${response.status}`);
  const cookies = cookieHeader(response.headers);
  const csrf = cookieValue(cookies, "__Host-oku_csrf");
  if (!cookies || !csrf) fail("staging operator auth cookie/CSRF cookie alınamadı");
  const me = await api<{ user: Record<string, unknown> }>(origin, "/auth/me", {
    headers: { cookie: cookies, "x-auth-transport": "cookie" },
  });
  if (me.user?.id !== OPERATOR_ID || me.user.platformRole !== "SUPER_ADMIN") {
    fail("staging operator SUPER_ADMIN olarak doğrulanamadı");
  }
  return {
    headers: {
      cookie: cookies,
      "x-auth-transport": "cookie",
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    user: me.user,
  };
}

async function loginReviewer(origin: string): Promise<Session> {
  const email = process.env.STAGING_SYNTHETIC_REVIEWER_EMAIL?.trim() || SYNTHETIC_REVIEWER_EMAIL;
  if (email !== SYNTHETIC_REVIEWER_EMAIL) fail("synthetic reviewer e-posta kimliği sabit olmalı");
  const response = await request(origin, "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-auth-transport": "cookie" },
    body: JSON.stringify({ email, password: required("STAGING_SYNTHETIC_REVIEWER_PASSWORD") }),
  });
  await response.json().catch(() => ({}));
  if (!response.ok) fail(`synthetic reviewer authentication HTTP ${response.status}`);
  const cookies = cookieHeader(response.headers);
  const csrf = cookieValue(cookies, "__Host-oku_csrf");
  if (!cookies || !csrf) fail("synthetic reviewer auth cookie/CSRF cookie alınamadı");
  const me = await api<{ user: Record<string, unknown> }>(origin, "/auth/me", {
    headers: { cookie: cookies, "x-auth-transport": "cookie" },
  });
  if (me.user?.email !== email || me.user.platformRole !== "CONTENT_REVIEWER") {
    fail("synthetic reviewer CONTENT_REVIEWER olarak doğrulanamadı");
  }
  return {
    headers: {
      cookie: cookies,
      "x-auth-transport": "cookie",
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    user: me.user,
  };
}

function body<T>(value: T): RequestInit["body"] {
  return JSON.stringify(value);
}

async function loadSpecs(): Promise<LessonSpec[]> {
  const path = fileURLToPath(new URL(LESSON_CONTENT_PATH, import.meta.url));
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 6)
    fail("Release 0.6 lesson manifesti tam 6 kayıt içermeli");
  const specs = parsed as LessonSpec[];
  const families = new Set(specs.map((spec) => spec.family));
  if (families.size !== 6) fail("Release 0.6 lesson family'leri benzersiz olmalı");
  for (const spec of specs) {
    if (!spec.key || !spec.title || !spec.body || !spec.objective || !spec.explanation) {
      fail(`lesson manifesti eksik: ${spec.key || "unknown"}`);
    }
  }
  return specs;
}

type TemplateVersion = { id: string; version: number; status: string; config: unknown };
type Template = {
  id: string;
  title: string;
  versions: Array<{ id: string; version: number; status: string }>;
};

type ResumableVersion = { id: string; status: string };

export function selectResumableVersion(
  current: ResumableVersion | null,
  versions: ResumableVersion[],
  lessonKey: string,
): ResumableVersion {
  if (current) return current;
  if (versions.length !== 1 || versions[0]?.status === "PUBLISHED") {
    fail(`${lessonKey} mevcut content'in current version'ı yok ve sürüm durumu belirsiz`);
  }
  return versions[0];
}

async function findPublishedTemplateVersions(
  origin: string,
  operator: Session,
  specs: LessonSpec[],
): Promise<Map<string, TemplateVersion>> {
  const listed = await api<{ items: Array<{ id: string }>; total: number }>(
    origin,
    "/admin/templates?scope=GLOBAL&page=1&pageSize=100",
    { headers: operator.headers },
  );
  if (listed.total > listed.items.length) fail("staging template inventory 100 kaydı aşıyor");
  const result = new Map<string, TemplateVersion>();
  for (const item of listed.items) {
    const template = await api<Template & { config: unknown }>(
      origin,
      `/admin/templates/${encodeURIComponent(item.id)}`,
      { headers: operator.headers },
    );
    for (const version of template.versions) {
      if (version.status !== "PUBLISHED") continue;
      const detail = await api<TemplateVersion>(
        origin,
        `/admin/templates/versions/${encodeURIComponent(version.id)}`,
        { headers: operator.headers },
      );
      const config = detail.config as { family?: string; competency?: string } | null;
      const spec = specs.find(
        (candidate) =>
          candidate.family === config?.family && candidate.skillCode === config?.competency,
      );
      if (spec && !result.has(spec.key)) result.set(spec.key, detail);
    }
  }
  for (const spec of specs) {
    if (!result.has(spec.key)) {
      fail(`${spec.family} için mevcut published exercise template version bulunamadı`);
    }
  }
  return result;
}

async function findSkillId(origin: string, operator: Session, skillCode: string): Promise<string> {
  const result = await api<{ items: Array<{ id: string; code: string }>; total: number }>(
    origin,
    `/admin/skills?search=${encodeURIComponent(skillCode)}&page=1&pageSize=20`,
    { headers: operator.headers },
  );
  const skill = result.items.find((item) => item.code === skillCode);
  if (!skill) fail(`${skillCode} skill kaydı bulunamadı`);
  return skill.id;
}

function expectedMetadata(spec: LessonSpec, templateVersionId: string): LessonMetadata {
  const metadata = parseLessonMetadata({
    lessonType: "LEARNING_LESSON",
    contractVersion: 1,
    skillCode: spec.skillCode,
    objective: spec.objective,
    explanation: spec.explanation,
    workedExample: spec.workedExample,
    guidedPractice: spec.guidedPractice,
    exerciseTemplateVersionId: templateVersionId,
    completionLabel: spec.completionLabel,
  });
  if (!metadata) fail(`${spec.key} lesson metadata contract geçersiz`);
  return metadata;
}

async function findExactContent(origin: string, operator: Session, title: string) {
  const result = await api<{ items: Array<{ id: string; title: string }>; total: number }>(
    origin,
    `/admin/contents?scope=GLOBAL&search=${encodeURIComponent(title)}&page=1&pageSize=20`,
    { headers: operator.headers },
  );
  const exact = result.items.filter((item) => item.title === title);
  if (exact.length > 1) fail(`${title} için duplicate global content bulundu`);
  return exact[0] ?? null;
}

async function ensurePublishedLesson(
  origin: string,
  operator: Session,
  reviewer: Session,
  spec: LessonSpec,
  templateVersionId: string,
): Promise<"CREATED" | "NOOP" | "RESUMED"> {
  const title = `Release 0.6 · ${spec.title}`;
  const existing = await findExactContent(origin, operator, title);
  let contentId: string;
  let versionId: string;
  let action: "CREATED" | "NOOP" | "RESUMED" = "CREATED";

  if (!existing) {
    const content = await api<{ id: string }>(origin, "/admin/contents", {
      method: "POST",
      headers: operator.headers,
      body: body({
        tenantId: null,
        type: "PASSAGE",
        title,
        difficulty: 0.25,
        status: "DRAFT",
        metadata: { release: "0.6", lessonKey: spec.key, lessonType: "LEARNING_LESSON" },
      }),
    });
    contentId = content.id;
    const version = await api<{ id: string }>(origin, `/admin/contents/${contentId}/versions`, {
      method: "POST",
      headers: operator.headers,
      body: body({
        title,
        body: spec.body,
        license: "OKU+ INTERNAL PILOT",
        changelog: "Release 0.6 pilot lesson",
        metadata: expectedMetadata(spec, templateVersionId),
      }),
    });
    versionId = version.id;
    await api(origin, `/admin/contents/${contentId}/skills`, {
      method: "PUT",
      headers: operator.headers,
      body: body({ skillIds: [await findSkillId(origin, operator, spec.skillCode)] }),
    });
  } else {
    contentId = existing.id;
    const detail = await api<{
      id: string;
      status: string;
      currentVersionId: string | null;
      currentVersion: { id: string; status: string } | null;
    }>(origin, `/admin/contents/${contentId}`, { headers: operator.headers });
    const current = detail.currentVersion;
    const versions = current
      ? []
      : await api<Array<{ id: string; status: string }>>(
          origin,
          `/admin/contents/${contentId}/versions`,
          { headers: operator.headers },
        );
    versionId = selectResumableVersion(current, versions, spec.key).id;
    if (current?.status === "PUBLISHED" && detail.status === "PUBLISHED") {
      const version = await api<{ metadata: unknown }>(
        origin,
        `/admin/content-versions/${versionId}`,
        { headers: operator.headers },
      );
      const metadata = parseLessonMetadata(version.metadata);
      if (metadata?.exerciseTemplateVersionId !== templateVersionId) {
        fail(`${spec.key} mevcut published lesson yanlış template version kullanıyor`);
      }
      return "NOOP";
    }
    action = "RESUMED";
    const version = await api<{ metadata: unknown }>(
      origin,
      `/admin/content-versions/${versionId}`,
      { headers: operator.headers },
    );
    const metadata = parseLessonMetadata(version.metadata);
    if (!metadata || metadata.exerciseTemplateVersionId !== templateVersionId) {
      fail(`${spec.key} mevcut partial lesson metadata contract ile eşleşmiyor`);
    }
  }

  const version = await api<{ status: string }>(origin, `/admin/content-versions/${versionId}`, {
    headers: operator.headers,
  });
  if (version.status === "DRAFT") {
    await api(origin, `/admin/content-versions/${versionId}/review`, {
      method: "POST",
      headers: operator.headers,
    });
  }
  const reviewed = await api<{ status: string }>(origin, `/admin/content-versions/${versionId}`, {
    headers: operator.headers,
  });
  if (reviewed.status === "REVIEW") {
    await api(origin, `/admin/content-versions/${versionId}/approve`, {
      method: "POST",
      headers: reviewer.headers,
    });
  }

  const content = await api<{ status: string }>(origin, `/admin/contents/${contentId}`, {
    headers: operator.headers,
  });
  if (content.status === "DRAFT") {
    await api(origin, `/admin/contents/${contentId}/status`, {
      method: "PATCH",
      headers: operator.headers,
      body: body({ status: "REVIEW" }),
    });
  }
  const reviewedContent = await api<{ status: string }>(origin, `/admin/contents/${contentId}`, {
    headers: operator.headers,
  });
  if (reviewedContent.status === "REVIEW") {
    await api(origin, `/admin/contents/${contentId}/status`, {
      method: "PATCH",
      headers: reviewer.headers,
      body: body({ status: "APPROVED" }),
    });
  }

  const approved = await api<{ status: string }>(origin, `/admin/content-versions/${versionId}`, {
    headers: operator.headers,
  });
  if (approved.status === "APPROVED") {
    await api(origin, `/admin/content-versions/${versionId}/publish`, {
      method: "POST",
      headers: reviewer.headers,
    });
  }

  const finalContent = await api<{ status: string; currentVersionId: string | null }>(
    origin,
    `/admin/contents/${contentId}`,
    { headers: operator.headers },
  );
  const finalVersion = await api<{ status: string; publishedAt: string | null; metadata: unknown }>(
    origin,
    `/admin/content-versions/${versionId}`,
    { headers: operator.headers },
  );
  const finalMetadata = parseLessonMetadata(finalVersion.metadata);
  if (
    finalContent.status !== "PUBLISHED" ||
    finalContent.currentVersionId !== versionId ||
    finalVersion.status !== "PUBLISHED" ||
    !finalVersion.publishedAt ||
    finalMetadata?.exerciseTemplateVersionId !== templateVersionId
  ) {
    fail(`${spec.key} lifecycle sonrası PUBLISHED doğrulaması başarısız`);
  }
  return action;
}

async function main(): Promise<void> {
  if (process.env.RELEASE_0_6_CONTENT_CONFIRM !== "PUBLISH") {
    fail("RELEASE_0_6_CONTENT_CONFIRM=PUBLISH gerekli");
  }
  if (!process.argv.includes("--apply")) {
    process.stdout.write(JSON.stringify({ status: "DRY_RUN", stagingOnly: true }) + "\n");
    return;
  }
  const origin = baseUrl();
  await assertStagingTarget();
  const specs = await loadSpecs();
  const operator = await startOperatorSession(origin);
  const reviewer = await loginReviewer(origin);
  const templates = await findPublishedTemplateVersions(origin, operator, specs);
  const results: Array<{ key: string; family: string; action: string }> = [];
  for (const spec of specs) {
    const template = templates.get(spec.key);
    if (!template) fail(`${spec.key} için template version bulunamadı`);
    const action = await ensurePublishedLesson(origin, operator, reviewer, spec, template.id);
    results.push({ key: spec.key, family: spec.family, action });
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "PASS",
        environment: EXPECTED_ENVIRONMENT,
        publishedLessons: results.length,
        lessonResults: results,
        lifecycle: "DRAFT>REVIEW>APPROVED>PUBLISHED",
        idempotency: results.every((result) => result.action !== "CREATED") ? "NOOP" : "PASS",
        databaseWrites: "OFFICIAL_CONTENT_LIFECYCLE_ENDPOINTS_ONLY",
        productionTouched: "NO",
      },
      null,
      2,
    )}\n`,
  );
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  void main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ status: "FAIL", reason: safeErrorMessage(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
