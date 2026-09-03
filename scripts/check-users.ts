import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@okuplus.dev" } });
  console.log("Admin user:", admin);

  const demo = await prisma.user.findUnique({ where: { email: "demo@okuplus.dev" } });
  console.log("Demo user:", demo);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
