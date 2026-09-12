/*
 * Staging-only synthetic student fixture for the Release 0.5 full E2E.
 *
 * This script uses only the public signup, login, profile, consent and
 * onboarding APIs. It never imports Prisma, writes SQL, changes entitlement
 * rows, resets quota, or deletes an account. Premium behavior is supplied by
 * the explicit staging-only entitlement provider in the application and is
 * accepted only for the configured .invalid synthetic email.
 */

const STAGING_ORIGIN = "https://okuplus-git-staging-gokcekmustafas-projects.vercel.app";
const BASE_URL = (process.env.BASE_URL?.trim() || STAGING_ORIGIN).replace(/\/$/u, "");

type JsonObject = Record<string, unknown>;
type ApiResult = { status: number; data: unknown };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStagingTarget(): void {
  let parsed: URL;
  try {
    parsed = new URL(BASE_URL);
  } catch {
    throw new Error("BASE_URL geçerli bir URL olmalı");
  }
  if (
    parsed.origin !== STAGING_ORIGIN ||
    /production|okuplus\.online|localhost/iu.test(parsed.hostname)
  ) {
    throw new Error("BASE_URL yalnızca onaylı staging origin olabilir");
  }
}

function credentials(): { email: string; password: string } {
  const email = (process.env.STAGING_STUDENT_EMAIL ?? process.env.STAGING_E2E_STUDENT_EMAIL)
    ?.trim()
    .toLowerCase();
  const password = process.env.STAGING_STUDENT_PASSWORD ?? process.env.STAGING_E2E_STUDENT_PASSWORD;
  if (!email || !password) {
    throw new Error("STAGING_E2E_STUDENT_EMAIL ve STAGING_E2E_STUDENT_PASSWORD gerekli");
  }
  if (!/^[^@\s]+@[^@\s]+\.invalid$/u.test(email)) {
    throw new Error("Synthetic staging student e-postası .invalid ile bitmeli");
  }
  const configuredPremiumEmail = process.env.STAGING_E2E_PREMIUM_EMAIL?.trim().toLowerCase();
  if (configuredPremiumEmail !== email) {
    throw new Error("STAGING_E2E_PREMIUM_EMAIL synthetic öğrenci e-postasıyla eşleşmeli");
  }
  return { email, password };
}

function responseData(body: unknown): unknown {
  return isObject(body) && "data" in body ? body.data : body;
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string; tenantId?: string } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    accept: "application/json",
    origin: BASE_URL,
  };
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  if (options.tenantId) headers["x-tenant-id"] = options.tenantId;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, data: responseData(body) };
}

function requireStatus(result: ApiResult, expected: number, label: string): unknown {
  if (result.status !== expected) throw new Error(`${label} başarısız (HTTP ${result.status})`);
  return result.data;
}

function stringField(value: unknown, key: string, label: string): string {
  const result = isObject(value) ? value[key] : undefined;
  if (typeof result !== "string" || !result.trim()) throw new Error(`${label}.${key} eksik`);
  return result;
}

async function loginExisting(
  email: string,
  password: string,
): Promise<{ accessToken: string; tenantId: string; account: "EXISTING" }> {
  const result = await api("/auth/login", { method: "POST", body: { email, password } });
  const data = requireStatus(result, 200, "student login");
  const tokens = isObject(data) ? data.tokens : undefined;
  const context = isObject(data) ? data.tenantContext : undefined;
  return {
    accessToken: stringField(tokens, "accessToken", "student auth.tokens"),
    tenantId: stringField(context, "tenantId", "student auth.tenantContext"),
    account: "EXISTING",
  };
}

async function ensureOnboarding(session: { accessToken: string; tenantId: string }): Promise<void> {
  const auth = { accessToken: session.accessToken, tenantId: session.tenantId };
  const currentResult = await api("/student/onboarding", auth);
  const current = requireStatus(currentResult, 200, "onboarding state");
  if (isObject(current) && current.completed === true) return;

  const levelsResult = await api("/student/onboarding/levels", auth);
  const levelsData = requireStatus(levelsResult, 200, "onboarding levels");
  const levels = isObject(levelsData) && Array.isArray(levelsData.levels) ? levelsData.levels : [];
  const firstLevel = levels.find(isObject);
  const levelId = stringField(firstLevel, "id", "onboarding level");
  requireStatus(
    await api("/student/profile", {
      ...auth,
      method: "PATCH",
      body: { currentLevelId: levelId, learningGoal: "SELF_IMPROVEMENT" },
    }),
    200,
    "onboarding profile",
  );

  const requiredConsents =
    isObject(current) && Array.isArray(current.requiredConsents) ? current.requiredConsents : [];
  for (const type of requiredConsents) {
    if (typeof type !== "string") continue;
    requireStatus(
      await api("/student/consents", { ...auth, method: "POST", body: { type, version: "v1" } }),
      200,
      `onboarding consent ${type}`,
    );
  }
  requireStatus(
    await api("/student/onboarding/complete", { ...auth, method: "POST", body: {} }),
    200,
    "onboarding complete",
  );
}

async function verifyFixture(session: { accessToken: string; tenantId: string }): Promise<void> {
  const result = await api("/auth/me", session);
  const me = requireStatus(result, 200, "auth/me");
  const user = isObject(me) ? me.user : undefined;
  if (isObject(user) && user.platformRole !== null && user.platformRole !== undefined) {
    throw new Error("Synthetic fixture platform user olmamalı");
  }
  const entitlementsResult = await api("/account/entitlements", session);
  const entitlements = requireStatus(entitlementsResult, 200, "account entitlements");
  const plan = isObject(entitlements) ? entitlements.plan : undefined;
  if (!isObject(plan) || plan.code !== "PLAN_PREMIUM") {
    throw new Error("Staging synthetic entitlement PREMIUM olarak doğrulanamadı");
  }
  const features = isObject(entitlements) ? entitlements.features : undefined;
  const practiceQuestion = isObject(features) ? features.PRACTICE_QUESTION : undefined;
  if (!isObject(practiceQuestion) || practiceQuestion.dailyLimit !== null) {
    throw new Error("Synthetic premium practice question kotası sınırsız olarak doğrulanamadı");
  }
}

async function main(): Promise<void> {
  assertStagingTarget();
  const { email, password } = credentials();
  let session: { accessToken: string; tenantId: string; account: "CREATED" | "EXISTING" };
  const initial = await api("/auth/signup", {
    method: "POST",
    body: { email, password, displayName: "Oku+ Release 0.5 E2E" },
  });
  if (initial.status === 201) {
    const data = requireStatus(initial, 201, "student signup");
    const tokens = isObject(data) ? data.tokens : undefined;
    const context = isObject(data) ? data.tenantContext : undefined;
    session = {
      accessToken: stringField(tokens, "accessToken", "student signup.tokens"),
      tenantId: stringField(context, "tenantId", "student signup.tenantContext"),
      account: "CREATED",
    };
  } else if (initial.status === 409) {
    session = await loginExisting(email, password);
  } else {
    throw new Error(`student signup başarısız (HTTP ${initial.status})`);
  }
  await ensureOnboarding(session);
  await verifyFixture(session);
  console.log(
    JSON.stringify({
      status: "PASS",
      account: session.account,
      auth: "PASS",
      onboarding: "PASS",
      entitlement: "PLAN_PREMIUM_STAGING_FIXTURE",
      productionTouched: "NO",
    }),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAIL",
      message: error instanceof Error ? error.message : "Bilinmeyen hata",
      productionTouched: "NO",
    }),
  );
  process.exitCode = 1;
}
