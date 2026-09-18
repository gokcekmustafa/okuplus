import { PrismaClient, type PlatformRole, type UserStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";

const EXPECTED_ENVIRONMENT = "STAGING" as const;
const EXPECTED_DATABASE = "neondb";
const EXPECTED_FINGERPRINT = "18b7c0ef4791f6596fe2e61879df641fb14e5a7f88e3d06c88f634c17af13b38";
export const SYNTHETIC_REVIEWER_EMAIL = "okuplus.release06.staging.reviewer@synthetic.invalid";
export const SYNTHETIC_REVIEWER_ROLE: PlatformRole = "CONTENT_REVIEWER";
const SYNTHETIC_REVIEWER_DISPLAY_NAME = "Oku+ Release 0.6 Synthetic Reviewer";

type Target = { host: string; port: string; database: string; user: string };
type Identity = { database: string; schema: string; current_user: string };

export type ReviewerState = {
  passwordHash: string | null;
  platformRole: PlatformRole | null;
  status: UserStatus;
  deletedAt: Date | null;
  memberships: Array<{ tenantId: string }>;
};

export type ReviewerAction = "CREATE" | "UPDATE" | "NOOP";

export function validateTargetConfig(environment: string, approvedFingerprint: string): void {
  if (environment !== EXPECTED_ENVIRONMENT) {
    throw new Error("DB_FINGERPRINT_ENVIRONMENT tam olarak STAGING olmalı");
  }
  if (approvedFingerprint.trim().toLowerCase() !== EXPECTED_FINGERPRINT) {
    throw new Error("approved staging fingerprint beklenen hedefle eşleşmiyor");
  }
}

export function classifyReviewerState(
  state: ReviewerState | null,
  passwordMatches: boolean,
): ReviewerAction {
  if (!state) return "CREATE";
  if (state.memberships.length > 0) {
    throw new Error("synthetic reviewer global scope ile çakışan membership içeriyor");
  }
  if (
    passwordMatches &&
    state.platformRole === SYNTHETIC_REVIEWER_ROLE &&
    state.status === "ACTIVE" &&
    state.deletedAt === null
  ) {
    return "NOOP";
  }
  return "UPDATE";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} gerekli`);
  return value;
}

function safeErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, "[redacted-postgresql-url]");
  for (const name of [
    "DATABASE_URL",
    "DB_FINGERPRINT_DATABASE_URL",
    "STAGING_SYNTHETIC_REVIEWER_PASSWORD",
  ]) {
    const value = process.env[name];
    if (value) message = message.split(value).join("[redacted-secret]");
  }
  return message;
}

function parseTarget(rawUrl: string): Target {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("PostgreSQL hedef URL'si geçerli değil");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("yalnız PostgreSQL URL kabul edilir");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
  const user = decodeURIComponent(parsed.username);
  if (!/\.neon\.tech$/iu.test(host) || /prod(?:uction)?/iu.test(`${host}/${database}`)) {
    throw new Error("staging Neon hedefi doğrulanamadı");
  }
  if (database !== EXPECTED_DATABASE || !user) {
    throw new Error("staging database identity hedefi geçersiz");
  }
  return { host, port: parsed.port || "5432", database, user };
}

function targetFingerprint(target: Target, identity: Identity): string {
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

async function assertTarget(rawUrl: string, label: string): Promise<void> {
  const target = parseTarget(rawUrl);
  const client = new PrismaClient({ datasources: { db: { url: rawUrl } } });
  try {
    const rows = await client.$queryRaw<Identity[]>`
      SELECT current_database() AS database, current_schema() AS schema, current_user AS current_user
    `;
    const identity = rows[0];
    if (!identity || identity.database !== EXPECTED_DATABASE || identity.schema !== "public") {
      throw new Error(`${label} staging database identity doğrulanamadı`);
    }
    if (identity.current_user !== target.user) {
      throw new Error(`${label} staging database user identity eşleşmedi`);
    }
    if (targetFingerprint(target, identity) !== EXPECTED_FINGERPRINT) {
      throw new Error(`${label} approved staging target fingerprint eşleşmedi`);
    }
  } finally {
    await client.$disconnect();
  }
}

export async function provisionReviewer(options: {
  prisma: PrismaClient;
  password: string;
  apply: boolean;
}): Promise<{ action: ReviewerAction; email: string; role: PlatformRole; globalScope: "YES" }> {
  const existing = await options.prisma.user.findUnique({
    where: { email: SYNTHETIC_REVIEWER_EMAIL },
    select: {
      id: true,
      passwordHash: true,
      platformRole: true,
      status: true,
      deletedAt: true,
      memberships: { select: { tenantId: true } },
    },
  });
  const passwordMatches = existing?.passwordHash
    ? await new ScryptPasswordHasher().verify(options.password, existing.passwordHash)
    : false;
  const action = classifyReviewerState(existing, passwordMatches);

  if (options.apply && action !== "NOOP") {
    const passwordHash = await new ScryptPasswordHasher().hash(options.password);
    if (action === "CREATE") {
      await options.prisma.user.create({
        data: {
          email: SYNTHETIC_REVIEWER_EMAIL,
          displayName: SYNTHETIC_REVIEWER_DISPLAY_NAME,
          passwordHash,
          platformRole: SYNTHETIC_REVIEWER_ROLE,
          status: "ACTIVE",
        },
      });
    } else if (existing) {
      await options.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          platformRole: SYNTHETIC_REVIEWER_ROLE,
          status: "ACTIVE",
          deletedAt: null,
        },
      });
    }
  }

  return {
    action,
    email: SYNTHETIC_REVIEWER_EMAIL,
    role: SYNTHETIC_REVIEWER_ROLE,
    globalScope: "YES",
  };
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");
  validateTargetConfig(
    required("DB_FINGERPRINT_ENVIRONMENT"),
    required("DB_FINGERPRINT_APPROVED_TARGET_FINGERPRINT"),
  );
  const fingerprintUrl = required("DB_FINGERPRINT_DATABASE_URL");
  const databaseUrl = required("DATABASE_URL");
  const password = required("STAGING_SYNTHETIC_REVIEWER_PASSWORD");
  if (password.length < 8 || password.length > 128) {
    throw new Error("STAGING_SYNTHETIC_REVIEWER_PASSWORD uzunluğu desteklenen aralıkta değil");
  }
  await assertTarget(fingerprintUrl, "DB_FINGERPRINT_DATABASE_URL");
  await assertTarget(databaseUrl, "DATABASE_URL");

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$connect();
    const result = await provisionReviewer({ prisma, password, apply });
    console.log(
      JSON.stringify({
        status: apply ? "APPLIED" : "DRY_RUN",
        action: result.action,
        email: result.email,
        role: result.role,
        globalScope: result.globalScope,
        passwordHashStored: apply ? "YES" : "NO",
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ status: "FAIL", reason: safeErrorMessage(error) }));
    process.exitCode = 1;
  });
}
