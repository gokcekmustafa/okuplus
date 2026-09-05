import { z } from "zod";

export const APP_ENV_VALUES = ["development", "test", "staging", "production"] as const;
const DEFAULT_DEV_JWT_SECRET = "oku-plus-dev-only-jwt-secret-change-me-0123456789abcdef";

const PLACEHOLDER_SECRET_PATTERNS = [
  /change[-_ ]?me/iu,
  /default/iu,
  /dev[-_ ]?only/iu,
  /example/iu,
  /password/iu,
  /placeholder/iu,
  /secret/iu,
  /test/iu,
];

function isExplicitOriginAllowlist(value: string): boolean {
  return value.split(",").every((candidate) => {
    const origin = candidate.trim();
    if (!origin) return true;
    if (origin === "*") return false;
    try {
      const parsed = new URL(origin);
      return (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !parsed.hostname.includes("*") &&
        parsed.username === "" &&
        parsed.password === "" &&
        parsed.pathname === "/" &&
        parsed.search === "" &&
        parsed.hash === ""
      );
    } catch {
      return false;
    }
  });
}

const envSchema = z.object({
  APP_ENV: z.enum(APP_ENV_VALUES).default("development"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(16 * 1024)
    .max(10_000_000)
    .default(1_000_000),
  CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(5_000),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL gerekli")
    .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
      message: "DATABASE_URL geçerli bir postgresql bağlantı dizesi olmalı",
    }),
  CORS_ORIGIN: z
    .string()
    .default("")
    .refine(
      isExplicitOriginAllowlist,
      "CORS_ORIGIN yalnızca açık http(s) origin allowlist içermeli; wildcard kullanılamaz",
    ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10_000).default(120),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(5).max(1000).default(60),
  RATE_LIMIT_AUTH_IDENTIFIER_MAX: z.coerce.number().int().min(5).max(1000).default(20),
  RATE_LIMIT_BILLING_MAX: z.coerce.number().int().min(5).max(1000).default(60),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().min(10).max(5000).default(120),
  RATE_LIMIT_PILOT_MAX: z.coerce.number().int().min(5).max(1000).default(60),
  RATE_LIMIT_MAX_KEYS: z.coerce.number().int().min(100).max(100_000).default(10_000),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET en az 32 karakter olmalı")
    .default("oku-plus-dev-only-jwt-secret-change-me-0123456789abcdef"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).default(604800),
  AUTH_COOKIE_TRANSPORT: z.enum(["off", "on"]).default("off"),
  AUTH_ORIGIN_ENFORCEMENT: z.enum(["off", "on"]).default("off"),
  GOOGLE_OIDC_CLIENT_IDS: z.string().default(""),
  APPLE_OIDC_CLIENT_IDS: z.string().default(""),
  PILOT_MODE: z.enum(["off", "on"]).default("off"),
  PILOT_STUDENT_ACCESS: z.string().default(""),
  ENTITLEMENT_TIMEZONE: z.string().default("UTC"),
  // 8H-5 iyzico is deliberately sandbox-only. Empty values keep the app
  // bootable while making billing unavailable until TEST credentials/config
  // are injected through the environment.
  IYZICO_API_KEY: z.string().trim().default(""),
  IYZICO_SECRET_KEY: z.string().trim().default(""),
  IYZICO_BASE_URL: z.string().trim().default(""),
  IYZICO_MERCHANT_ID: z.string().trim().default(""),
  IYZICO_SUBSCRIPTION_PLAN_MONTHLY: z.string().trim().default(""),
  IYZICO_SUBSCRIPTION_PLAN_YEARLY: z.string().trim().default(""),
  IYZICO_CHECKOUT_CALLBACK_URL: z.string().trim().default(""),
  IYZICO_WEBHOOK_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(604800).default(86400),
});

export type Env = z.infer<typeof envSchema>;
export { envSchema };

export type RawEnv = Record<string, string | undefined>;

function hasStrongJwtSecret(value: string): boolean {
  if (
    value === DEFAULT_DEV_JWT_SECRET ||
    PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    return false;
  }

  const characterClasses = [/[a-z]/u, /[A-Z]/u, /[0-9]/u, /[^A-Za-z0-9]/u].filter((pattern) =>
    pattern.test(value),
  ).length;
  return characterClasses >= 3 && !/(.)\1{7,}/u.test(value);
}

function hasExplicitHttpsOrigins(value: string): boolean {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return (
    origins.length > 0 &&
    origins.every((origin) => {
      if (!isExplicitOriginAllowlist(origin)) return false;
      try {
        return new URL(origin).protocol === "https:";
      } catch {
        return false;
      }
    })
  );
}

function hasConfiguredIyzico(raw: Env): boolean {
  return [
    raw.IYZICO_API_KEY,
    raw.IYZICO_SECRET_KEY,
    raw.IYZICO_BASE_URL,
    raw.IYZICO_MERCHANT_ID,
    raw.IYZICO_SUBSCRIPTION_PLAN_MONTHLY,
    raw.IYZICO_SUBSCRIPTION_PLAN_YEARLY,
    raw.IYZICO_CHECKOUT_CALLBACK_URL,
  ].some((value) => value.trim() !== "");
}

function hasUnsafeProductionClientIds(value: string): boolean {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .some(
      (item) =>
        item.length < 3 ||
        /\s/u.test(item) ||
        !/^[A-Za-z0-9._:-]+$/u.test(item) ||
        /(?:development|example|localhost|placeholder|staging|test)/iu.test(item),
    );
}

function validateSecurityEnvironment(env: Env): void {
  const issues: string[] = [];

  if (env.APP_ENV === "production" && env.NODE_ENV !== "production") {
    issues.push("APP_ENV=production için NODE_ENV=production olmalı");
  }
  if (env.APP_ENV === "staging" && env.NODE_ENV !== "production") {
    issues.push("APP_ENV=staging için NODE_ENV=production olmalı");
  }
  if (env.APP_ENV === "test" && env.NODE_ENV !== "test") {
    issues.push("APP_ENV=test için NODE_ENV=test olmalı");
  }
  if (env.APP_ENV === "development" && env.NODE_ENV === "production") {
    issues.push("NODE_ENV=production ile APP_ENV=development birlikte kullanılamaz");
  }

  const productionLike = env.APP_ENV === "staging" || env.APP_ENV === "production";
  if (productionLike && !hasStrongJwtSecret(env.JWT_SECRET)) {
    issues.push("JWT_SECRET staging/production için güçlü ve placeholder olmayan bir değer olmalı");
  }
  if (
    productionLike &&
    env.AUTH_COOKIE_TRANSPORT === "on" &&
    env.AUTH_ORIGIN_ENFORCEMENT !== "on"
  ) {
    issues.push("cookie transport staging/production için AUTH_ORIGIN_ENFORCEMENT=on gerektirir");
  }

  if (env.APP_ENV === "production") {
    if (!hasExplicitHttpsOrigins(env.CORS_ORIGIN)) {
      issues.push("production CORS_ORIGIN en az bir explicit HTTPS origin içermeli");
    }
    if (env.AUTH_COOKIE_TRANSPORT !== "on") {
      issues.push(
        "production AUTH_COOKIE_TRANSPORT=on olmalı; insecure/legacy fallback reddedildi",
      );
    }
    if (env.AUTH_ORIGIN_ENFORCEMENT !== "on") {
      issues.push("production AUTH_ORIGIN_ENFORCEMENT=on olmalı");
    }
    if (env.PILOT_MODE !== "off" || env.PILOT_STUDENT_ACCESS.trim() !== "") {
      issues.push("production pilot/bypass ayarları kapalı olmalı");
    }
    if (hasConfiguredIyzico(env)) {
      issues.push("production için mevcut sandbox-only iyzico adapter ayarlanamaz");
    }
    if (hasUnsafeProductionClientIds(env.GOOGLE_OIDC_CLIENT_IDS)) {
      issues.push("GOOGLE_OIDC_CLIENT_IDS production client ID içermeli");
    }
    if (hasUnsafeProductionClientIds(env.APPLE_OIDC_CLIENT_IDS)) {
      issues.push("APPLE_OIDC_CLIENT_IDS production client ID içermeli");
    }
  }

  if (issues.length > 0) {
    throw new Error(`Güvenlik açısından geçersiz ortam değişkenleri: ${issues.join("; ")}`);
  }
}

export function parseEnv(raw: RawEnv): Env {
  // Existing local/CI callers set NODE_ENV=test without APP_ENV. Infer only
  // that safe test value; production and staging must remain explicit.
  const input =
    raw.APP_ENV === undefined && raw.NODE_ENV === "test" ? { ...raw, APP_ENV: "test" } : raw;
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Geçersiz ortam değişkenleri: ${issues}`);
  }
  validateSecurityEnvironment(result.data);

  // Vitest intentionally reuses one injected loopback IP across many suites.
  // Keep test fixtures from tripping the production baseline while allowing
  // security tests to opt into a deliberately small explicit limit.
  if (result.data.NODE_ENV === "test") {
    return {
      ...result.data,
      ...(raw.RATE_LIMIT_AUTH_MAX === undefined ? { RATE_LIMIT_AUTH_MAX: 1000 } : {}),
      ...(raw.RATE_LIMIT_AUTH_IDENTIFIER_MAX === undefined
        ? { RATE_LIMIT_AUTH_IDENTIFIER_MAX: 1000 }
        : {}),
    };
  }

  return result.data;
}

export function loadEnv(overrides: RawEnv = {}): Env {
  return parseEnv({ ...process.env, ...overrides });
}
