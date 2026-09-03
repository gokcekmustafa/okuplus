import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function addConnectionTimeouts(databaseUrl: string): string {
  const params = ["connect_timeout=10", "pool_timeout=10", "socket_timeout=30"];
  const missing = params.filter((param) => {
    const key = param.split("=", 1)[0];
    return !new RegExp(`(?:^|[?&])${key}=`, "u").test(databaseUrl);
  });
  if (missing.length === 0) return databaseUrl;
  return `${databaseUrl}${databaseUrl.includes("?") ? "&" : "?"}${missing.join("&")}`;
}

const configuredDatabaseUrl = process.env.DATABASE_URL;
const prismaOptions: Prisma.PrismaClientOptions = {
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  ...(configuredDatabaseUrl
    ? { datasources: { db: { url: addConnectionTimeouts(configuredDatabaseUrl) } } }
    : {}),
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
