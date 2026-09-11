import {
  EXPECTED_PRODUCTION_ORIGIN,
  validateProvisionConfig,
  type ProvisionConfig,
} from "./provision-production-smoke-student.js";

const READ_ONLY_PATHS = [
  "/",
  "/student/today",
  "/student/progress",
  "/student/learning-path",
  "/student/history?page=1&pageSize=5",
  "/student/gamification",
  "/account/entitlements",
] as const;

type SafeIdentity = {
  email: string;
  platformRole: string | null;
  tenantType: string | null;
};

function getSetCookies(response: Response): string[] {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookieHeader(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(";", 1)[0]?.trim() ?? "")
    .filter(Boolean)
    .join("; ");
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readIdentity(payload: unknown, expectedEmail: string): SafeIdentity {
  if (!payload || typeof payload !== "object")
    throw new Error("/auth/me response formatı geçersiz");
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") throw new Error("/auth/me data alanı geçersiz");

  const value = data as {
    user?: { email?: unknown; platformRole?: unknown };
    tenantContext?: { tenantType?: unknown };
  };
  const email = typeof value.user?.email === "string" ? value.user.email : null;
  const platformRole =
    typeof value.user?.platformRole === "string" ? value.user.platformRole : null;
  const tenantType =
    typeof value.tenantContext?.tenantType === "string" ? value.tenantContext.tenantType : null;

  if (email?.toLowerCase() !== expectedEmail || platformRole !== null) {
    throw new Error("student identity doğrulanamadı");
  }
  if (tenantType !== "INDIVIDUAL") throw new Error("individual tenant context doğrulanamadı");

  return { email, platformRole, tenantType };
}

function configFromEnv(): ReturnType<typeof validateProvisionConfig> {
  const config: ProvisionConfig = {
    appEnv: process.env.APP_ENV,
    nodeEnv: process.env.NODE_ENV,
    baseUrl: process.env.PRODUCTION_SMOKE_BASE_URL,
    email: process.env.PRODUCTION_SMOKE_EMAIL,
    password: process.env.PRODUCTION_SMOKE_PASSWORD,
    displayName: process.env.PRODUCTION_SMOKE_DISPLAY_NAME,
    confirmation: process.env.PRODUCTION_SMOKE_CONFIRM,
  };
  return validateProvisionConfig(config);
}

async function main(): Promise<void> {
  const config = configFromEnv();
  if (config.origin !== EXPECTED_PRODUCTION_ORIGIN) {
    throw new Error("production smoke origin guard başarısız");
  }

  const login = await fetch(`${config.origin}/auth/login`, {
    method: "POST",
    headers: {
      Origin: config.origin,
      "Content-Type": "application/json",
      "x-auth-transport": "cookie",
    },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      platform: "WEB",
      deviceName: "production-smoke",
    }),
  });
  if (login.status !== 200) throw new Error(`production login HTTP ${login.status}`);

  const cookies = cookieHeader(getSetCookies(login));
  if (!cookies) throw new Error("production login cookie alınamadı");

  const authMe = await fetch(`${config.origin}/auth/me`, {
    method: "GET",
    headers: { Origin: config.origin, Cookie: cookies, "x-auth-transport": "cookie" },
  });
  if (authMe.status !== 200) throw new Error(`/auth/me HTTP ${authMe.status}`);
  const identity = readIdentity(await parseJson(authMe), config.email);

  const checks: Array<{ path: string; status: number }> = [];
  for (const path of READ_ONLY_PATHS) {
    const response = await fetch(`${config.origin}${path}`, {
      method: "GET",
      headers: { Origin: config.origin, Cookie: cookies, "x-auth-transport": "cookie" },
    });
    if (response.status !== 200) throw new Error(`${path} HTTP ${response.status}`);
    checks.push({ path, status: response.status });
  }

  console.log(
    JSON.stringify({
      status: "PASS",
      auth: "PASS",
      authMe: "PASS",
      dashboard: "PASS",
      readOnlyChecks: checks.length,
      identity: {
        email: identity.email,
        platformRole: identity.platformRole,
        tenantType: identity.tenantType,
      },
      writes: "NO_PRODUCT_WRITE",
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "production smoke başarısız";
  console.error(JSON.stringify({ status: "FAIL", message }));
  process.exitCode = 1;
});
