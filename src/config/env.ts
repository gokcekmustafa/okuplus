import { z } from "zod";

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
  RATE_LIMIT_BILLING_MAX: z.coerce.number().int().min(5).max(1000).default(60),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().min(10).max(5000).default(120),
  RATE_LIMIT_PILOT_MAX: z.coerce.number().int().min(5).max(1000).default(60),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET en az 32 karakter olmalı")
    .default("oku-plus-dev-only-jwt-secret-change-me-0123456789abcdef"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).default(604800),
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

export function parseEnv(raw: RawEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Geçersiz ortam değişkenleri: ${issues}`);
  }
  if (
    result.data.NODE_ENV === "production" &&
    result.data.JWT_SECRET === "oku-plus-dev-only-jwt-secret-change-me-0123456789abcdef"
  ) {
    throw new Error("Geçersiz ortam değişkenleri: production JWT_SECRET varsayılan değer olamaz");
  }

  // Vitest intentionally reuses one injected loopback IP across many suites.
  // Keep test fixtures from tripping the production baseline while allowing
  // security tests to opt into a deliberately small explicit limit.
  if (result.data.NODE_ENV === "test" && raw.RATE_LIMIT_AUTH_MAX === undefined) {
    return { ...result.data, RATE_LIMIT_AUTH_MAX: 1000 };
  }

  return result.data;
}

export function loadEnv(overrides: RawEnv = {}): Env {
  return parseEnv({ ...process.env, ...overrides });
}
