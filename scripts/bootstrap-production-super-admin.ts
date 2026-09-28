import { PrismaClient } from "@prisma/client";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";
import { providerForHost } from "../src/lib/db-fingerprint-contract.js";
import {
  PRODUCTION_SUPER_ADMIN_BOOTSTRAP_CONFIRMATION,
  assertBootstrapEmail,
  assertProductionTargetIdentity,
} from "./production-super-admin-bootstrap-contract.js";

type IdentityRow = {
  database: string;
  db_user: string;
  server_port: number | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} gerekli`);
  return value;
}

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "production" || process.env.NODE_ENV !== "production") {
    throw new Error("production ortamı zorunlu");
  }
  if (
    required("PRODUCTION_BOOTSTRAP_CONFIRMATION") !== PRODUCTION_SUPER_ADMIN_BOOTSTRAP_CONFIRMATION
  ) {
    throw new Error("bootstrap onayı geçersiz");
  }

  const databaseUrl = required("PRODUCTION_BOOTSTRAP_DATABASE_URL");
  const email = assertBootstrapEmail(required("PRODUCTION_BOOTSTRAP_EMAIL"));
  const password = required("PRODUCTION_BOOTSTRAP_PASSWORD");
  if (password.length < 20 || password.length > 128) {
    throw new Error("bootstrap parolası 20-128 karakter olmalı");
  }

  const parsedUrl = new URL(databaseUrl);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const hasher = new ScryptPasswordHasher();

  try {
    const identity = await prisma.$queryRaw<IdentityRow[]>`
      SELECT
        current_database() AS database,
        current_user AS db_user,
        inet_server_port() AS server_port
    `;
    const row = identity[0];
    if (!row) throw new Error("production database identity okunamadı");

    const actual = {
      provider: providerForHost(parsedUrl.hostname),
      host: parsedUrl.hostname,
      port: parsedUrl.port || String(row.server_port ?? 5432),
      database: row.database,
      user: row.db_user,
    } as const;
    const approvedFingerprint = required("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    assertProductionTargetIdentity(actual, {
      provider: required("PRODUCTION_DB_APPROVED_PROVIDER"),
      host: required("PRODUCTION_DB_APPROVED_HOST"),
      port: required("PRODUCTION_DB_APPROVED_PORT"),
      database: required("PRODUCTION_DB_APPROVED_DATABASE"),
      user: required("PRODUCTION_DB_APPROVED_USER"),
      fingerprint: approvedFingerprint,
    });

    const [existingSuperAdmins, existingTarget] = await Promise.all([
      prisma.user.count({ where: { platformRole: "SUPER_ADMIN", deletedAt: null } }),
      prisma.user.findUnique({ where: { email }, select: { id: true, platformRole: true } }),
    ]);
    if (existingSuperAdmins !== 0) {
      throw new Error("active Super Admin mevcut; bootstrap yeni hesap oluşturmuyor");
    }
    if (existingTarget) {
      throw new Error("hedef e-posta mevcut; mevcut kullanıcı üzerine yazılmıyor");
    }

    const passwordHash = await hasher.hash(password);
    await prisma.$transaction(async (tx) => {
      const raceCheck = await tx.user.count({
        where: { platformRole: "SUPER_ADMIN", deletedAt: null },
      });
      if (raceCheck !== 0) throw new Error("bootstrap sırasında Super Admin oluştu");

      const user = await tx.user.create({
        data: {
          email,
          displayName: "Platform Administrator",
          passwordHash,
          platformRole: "SUPER_ADMIN",
          status: "ACTIVE",
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entityType: "User",
          entityId: user.id,
          after: {
            bootstrap: "controlled-production-super-admin",
            platformRole: "SUPER_ADMIN",
            status: "ACTIVE",
          },
        },
      });
    });

    console.log("PRODUCTION_SUPER_ADMIN_BOOTSTRAP=PASS");
    console.log("PRODUCTION_SUPER_ADMIN_CREATED=true");
    console.log("PRODUCTION_SUPER_ADMIN_AUDIT=PASS");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "production bootstrap başarısız");
  process.exitCode = 1;
});
