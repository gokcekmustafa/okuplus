import { fileURLToPath } from "node:url";

export const EXPECTED_PRODUCTION_ORIGIN = "https://okuplus.vercel.app";
export const SYNTHETIC_EMAIL_PATTERN =
  /^okuplus\.production\.smoke(?:\+[a-z0-9-]+)?@synthetic\.invalid$/iu;

const SIGNUP_PATH = "/auth/signup";
const AUTH_ME_PATH = "/auth/me";
const COOKIE_TRANSPORT = "cookie";

export type ProvisionConfig = {
  appEnv: string | undefined;
  nodeEnv: string | undefined;
  baseUrl: string | undefined;
  email: string | undefined;
  password: string | undefined;
  displayName: string | undefined;
  confirmation: string | undefined;
};

export type ValidatedProvisionConfig = {
  appEnv: "production";
  nodeEnv: "production";
  origin: typeof EXPECTED_PRODUCTION_ORIGIN;
  email: string;
  password: string;
  displayName: string;
  confirmation: "CREATE";
};

export type SignupRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
};

export type SignupOutcome = "CREATED" | "ALREADY_EXISTS" | "FAILED";

export function validateProvisionConfig(config: ProvisionConfig): ValidatedProvisionConfig {
  if (config.appEnv !== "production") {
    throw new Error("APP_ENV production olmalı");
  }
  if (config.nodeEnv !== "production") {
    throw new Error("NODE_ENV production olmalı");
  }

  const rawBaseUrl = config.baseUrl?.trim();
  if (!rawBaseUrl) throw new Error("PRODUCTION_SMOKE_BASE_URL gerekli");

  let origin: string;
  try {
    const parsed = new URL(rawBaseUrl);
    origin = parsed.origin;
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== new URL(EXPECTED_PRODUCTION_ORIGIN).hostname ||
      parsed.port !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      throw new Error("production origin eşleşmiyor");
    }
  } catch {
    throw new Error("PRODUCTION_SMOKE_BASE_URL yalnızca beklenen production origin olabilir");
  }

  const email = config.email?.trim().toLowerCase();
  if (!email || !SYNTHETIC_EMAIL_PATTERN.test(email)) {
    throw new Error("synthetic email .invalid production smoke formatında olmalı");
  }

  const password = config.password;
  if (!password || password.length < 16 || password.length > 128) {
    throw new Error("PRODUCTION_SMOKE_PASSWORD 16-128 karakter olmalı");
  }

  if (config.confirmation !== "CREATE") {
    throw new Error("PRODUCTION_SMOKE_CONFIRM=CREATE gerekli");
  }

  const displayName = config.displayName?.trim() || "Oku+ Production Smoke Student";
  if (displayName.length > 120) throw new Error("display name çok uzun");

  return {
    appEnv: "production",
    nodeEnv: "production",
    origin: origin as typeof EXPECTED_PRODUCTION_ORIGIN,
    email,
    password,
    displayName,
    confirmation: "CREATE",
  };
}

export function buildSignupRequest(config: ValidatedProvisionConfig): SignupRequest {
  return {
    url: `${config.origin}${SIGNUP_PATH}`,
    method: "POST",
    headers: {
      Origin: config.origin,
      "Content-Type": "application/json",
      "x-auth-transport": COOKIE_TRANSPORT,
    },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      displayName: config.displayName,
      platform: "WEB",
      deviceName: "production-smoke",
    }),
  };
}

export function classifySignupStatus(status: number): SignupOutcome {
  if (status === 201) return "CREATED";
  if (status === 409) return "ALREADY_EXISTS";
  return "FAILED";
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}

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

type SafeIdentity = {
  userId: string;
  email: string | null;
  platformRole: string | null;
  tenantId: string | null;
  tenantType: string | null;
  authenticated: true;
};

function readSafeIdentity(payload: unknown, expectedEmail: string): SafeIdentity {
  if (!payload || typeof payload !== "object") throw new Error("auth response formatı geçersiz");
  const envelope = payload as { data?: unknown };
  if (!envelope.data || typeof envelope.data !== "object") {
    throw new Error("auth response data alanı geçersiz");
  }

  const data = envelope.data as {
    user?: { id?: unknown; email?: unknown; platformRole?: unknown };
    tenantContext?: { tenantId?: unknown; tenantType?: unknown };
  };
  const userId = typeof data.user?.id === "string" ? data.user.id : null;
  const email = typeof data.user?.email === "string" ? data.user.email : null;
  const platformRole = typeof data.user?.platformRole === "string" ? data.user.platformRole : null;
  const tenantId =
    typeof data.tenantContext?.tenantId === "string" ? data.tenantContext.tenantId : null;
  const tenantType =
    typeof data.tenantContext?.tenantType === "string" ? data.tenantContext.tenantType : null;

  if (!userId || email?.toLowerCase() !== expectedEmail || platformRole !== null) {
    throw new Error("synthetic student identity doğrulanamadı");
  }
  if (!tenantId || tenantType !== "INDIVIDUAL") {
    throw new Error("individual tenant context doğrulanamadı");
  }

  return { userId, email, platformRole, tenantId, tenantType, authenticated: true };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function verifySession(
  config: ValidatedProvisionConfig,
  cookies: string[],
): Promise<SafeIdentity> {
  const cookie = cookieHeader(cookies);
  if (!cookie) throw new Error("production auth cookie alınamadı");

  const response = await fetch(`${config.origin}${AUTH_ME_PATH}`, {
    method: "GET",
    headers: { Origin: config.origin, Cookie: cookie, "x-auth-transport": COOKIE_TRANSPORT },
  });
  if (response.status !== 200) throw new Error(`/auth/me HTTP ${response.status}`);
  return readSafeIdentity(await parseJson(response), config.email);
}

async function provision(config: ValidatedProvisionConfig): Promise<{
  outcome: SignupOutcome;
  identity: SafeIdentity;
}> {
  const signup = await fetch(buildSignupRequest(config).url, {
    method: "POST",
    headers: buildSignupRequest(config).headers,
    body: buildSignupRequest(config).body,
  });
  const outcome = classifySignupStatus(signup.status);

  if (outcome === "FAILED") {
    throw new Error(`production signup HTTP ${signup.status}`);
  }

  let cookies = getSetCookies(signup);
  if (outcome === "ALREADY_EXISTS") {
    const login = await fetch(`${config.origin}/auth/login`, {
      method: "POST",
      headers: {
        Origin: config.origin,
        "Content-Type": "application/json",
        "x-auth-transport": COOKIE_TRANSPORT,
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
        platform: "WEB",
        deviceName: "production-smoke",
      }),
    });
    if (login.status !== 200) throw new Error(`existing account login HTTP ${login.status}`);
    cookies = getSetCookies(login);
  }

  return { outcome, identity: await verifySession(config, cookies) };
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== "--apply" && arg !== "--dry-run")) {
    throw new Error("yalnız --dry-run veya --apply kullanılabilir");
  }
  if (args.has("--apply") && args.has("--dry-run")) {
    throw new Error("--apply ve --dry-run birlikte kullanılamaz");
  }

  const config = validateProvisionConfig({
    appEnv: process.env.APP_ENV,
    nodeEnv: process.env.NODE_ENV,
    baseUrl: process.env.PRODUCTION_SMOKE_BASE_URL,
    email: process.env.PRODUCTION_SMOKE_EMAIL,
    password: process.env.PRODUCTION_SMOKE_PASSWORD,
    displayName: process.env.PRODUCTION_SMOKE_DISPLAY_NAME,
    confirmation: process.env.PRODUCTION_SMOKE_CONFIRM,
  });

  if (!args.has("--apply")) {
    console.log(
      JSON.stringify({
        status: "READY",
        mode: "DRY_RUN",
        target: "PRODUCTION",
        apiOnly: true,
        environmentGuards: "PASS",
        syntheticIdentityGuard: "PASS",
        productionAccountCreated: false,
        productionDbChanged: false,
      }),
    );
    return;
  }

  const result = await provision(config);
  console.log(
    JSON.stringify({
      status: "PASS",
      mode: "APPLY",
      target: "PRODUCTION",
      outcome: result.outcome,
      authenticated: result.identity.authenticated,
      platformRole: result.identity.platformRole,
      tenantType: result.identity.tenantType,
      productionDbChanged: result.outcome === "CREATED",
    }),
  );
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "production smoke provisioning başarısız";
    console.error(JSON.stringify({ status: "FAIL", message }));
    process.exitCode = 1;
  });
}
