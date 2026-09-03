import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";

type HealthDatabase = Pick<typeof prisma, "$queryRaw">;

/**
 * GET /health — proses sağlığı
 * GET /health/db — veritabanı bağlantı kontrolü
 * GET /ready — trafik almaya hazır olma kontrolü (DB + migration state)
 */
export async function healthRoutes(
  app: FastifyInstance,
  opts: { db?: HealthDatabase } = {},
): Promise<void> {
  const db = opts.db ?? prisma;

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.get("/health/db", async (request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up" };
    } catch (err) {
      request.log.error({ err }, "Veritabanı sağlık kontrolü başarısız");
      return reply.status(503).send({ status: "error", database: "down" });
    }
  });

  app.get("/ready", async (request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      const migrationRows = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM "_prisma_migrations"
        WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
      `;
      if (Number(migrationRows[0]?.count ?? 0) > 0) {
        request.log.warn("Başarısız veya tamamlanmamış migration nedeniyle readiness reddedildi");
        return reply.status(503).send({ status: "not_ready", ready: false });
      }

      return { status: "ok", ready: true };
    } catch (err) {
      request.log.error({ err }, "Readiness kontrolü başarısız");
      return reply.status(503).send({ status: "not_ready", ready: false });
    }
  });
}
