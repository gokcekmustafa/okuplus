import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ScryptPasswordHasher } from "../src/modules/auth/index.js";

/**
 * Geliştirme aracı: login için test kullanıcısı + tenant + membership oluşturur.
 * Kullanım: npx tsx scripts/create-test-user.ts
 *
 * Not: Bu bir CRUD modülü DEĞİLDİR; yalnızca UI'ı tarayıcıda denemek için
 * veri kurar. Prisma singleton postgres süper kullanıcısıyla bağlandığından
 * RLS'i bypass eder (test DB izole).
 */

const args = process.argv.slice(2);
const email = args[0] ?? "demo@okuplus.dev";
const password = args[1] ?? "demo-pass-123";
const tenantName = args[2] ?? "Demo Okulu";
const role = "STUDENT";

// Opsiyonel 4. argüman: platform rolü (SUPER_ADMIN vb.). Verilirse kullanıcı
// platform yetkilisi olur ve tenant/membership oluşturulmaz.
const platformRoleArg = args[3] ?? "";

const prisma = new PrismaClient();
const hasher = new ScryptPasswordHasher();

async function main(): Promise<void> {
  await prisma.$connect();

  const passwordHash = await hasher.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      ...(platformRoleArg
        ? { platformRole: platformRoleArg as "SUPER_ADMIN" }
        : { platformRole: null }),
    },
    create: {
      email,
      displayName: email.split("@")[0] ?? "Demo Kullanıcı",
      passwordHash,
      ...(platformRoleArg ? { platformRole: platformRoleArg as "SUPER_ADMIN" } : {}),
    },
  });

  if (platformRoleArg) {
    console.log("Platform kullanıcısı hazır:");
    console.log(`  e-posta      : ${user.email}`);
    console.log(`  şifre        : ${password}`);
    console.log(`  platform rol : ${user.platformRole}`);
    return;
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: `demo-tenant-${email.split("@")[0]?.toLowerCase() ?? "x"}` },
    update: {},
    create: {
      id: `demo-tenant-${email.split("@")[0]?.toLowerCase() ?? "x"}`,
      type: "ORGANIZATION",
      name: tenantName,
    },
  });

  const membership = await prisma.membership.upsert({
    where: { id: `demo-membership-${user.id}` },
    update: { role, status: "ACTIVE" },
    create: {
      id: `demo-membership-${user.id}`,
      tenantId: tenant.id,
      userId: user.id,
      role,
      status: "ACTIVE",
    },
  });

  console.log("Kullanıcı hazır:");
  console.log(`  e-posta : ${user.email}`);
  console.log(`  şifre   : ${password}`);
  console.log(`  tenant  : ${tenant.name} (${tenant.id})`);
  console.log(`  rol     : ${membership.role}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
