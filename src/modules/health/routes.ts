import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { providerForHost, targetIdentityFingerprint } from "../../lib/db-fingerprint-contract.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import type { AuthProvider } from "../auth/index.js";

type HealthDatabase = Pick<typeof prisma, "$queryRaw">;

type DatabaseIdentityRow = {
  database: string;
  current_user: string;
  server_address: string | null;
  server_port: number | null;
};

type HealthRouteOptions = {
  db?: HealthDatabase;
  authProvider?: AuthProvider;
  databaseUrl?: string;
  identityDiagnosticEnabled?: boolean;
};

function endpointIdFromHost(host: string): string | null {
  const label = host
    .split(".", 1)[0]
    ?.toLowerCase()
    .replace(/-pooler$/u, "");
  return label && /^ep-[a-z0-9-]+$/u.test(label) ? label : null;
}

/**
 * GET /health — proses sağlığı
 * GET /health/db — veritabanı bağlantı kontrolü
 * GET /ready — trafik almaya hazır olma kontrolü (DB + migration state)
 */
export async function healthRoutes(
  app: FastifyInstance,
  opts: HealthRouteOptions = {},
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

  if (opts.identityDiagnosticEnabled && opts.authProvider) {
    app.get(
      "/admin/diagnostics/production-db-identity",
      {
        preHandler: [requireAuth(opts.authProvider), requirePlatformRole(["SUPER_ADMIN"])],
      },
      async (request, reply) => {
        const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
        if (!databaseUrl) {
          return reply.status(503).send({ status: "unavailable", reason: "configuration" });
        }

        try {
          const parsedUrl = new URL(databaseUrl);
          const provider = providerForHost(parsedUrl.hostname);
          const endpointId = endpointIdFromHost(parsedUrl.hostname);
          if (!endpointId) {
            return reply.status(503).send({ status: "unavailable", reason: "endpoint" });
          }

          const rows = await db.$queryRaw<DatabaseIdentityRow[]>`
            SELECT
              current_database() AS database,
              current_user AS current_user,
              inet_server_addr()::text AS server_address,
              inet_server_port() AS server_port
          `;
          const identity = rows[0];
          if (!identity) {
            return reply.status(503).send({ status: "unavailable", reason: "identity" });
          }

          const port = parsedUrl.port || String(identity.server_port ?? 5432);
          const targetFingerprint = targetIdentityFingerprint({
            environment: "PRODUCTION",
            provider,
            host: parsedUrl.hostname,
            port,
            database: identity.database,
            dbUser: identity.current_user,
          });

          return {
            status: "ok",
            environment: "PRODUCTION",
            provider,
            endpointId,
            endpointKind: parsedUrl.hostname.includes("-pooler.") ? "POOLER" : "DIRECT",
            database: identity.database,
            currentUser: identity.current_user,
            serverPort: identity.server_port,
            serverAddressPresent: identity.server_address !== null,
            targetFingerprint,
          };
        } catch {
          request.log.error("Üretim veritabanı kimlik tanısı başarısız");
          return reply.status(503).send({ status: "unavailable", reason: "database" });
        }
      },
    );
  }

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
