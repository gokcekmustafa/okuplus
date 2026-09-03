import type { FastifyInstance } from "fastify";

type ShutdownApp = Pick<FastifyInstance, "close" | "log">;

/**
 * Registers one-shot process handlers. The returned cleanup function is useful
 * for isolated tests and for hosts that rebuild an application in-process.
 */
export function registerGracefulShutdown(
  app: ShutdownApp,
  disconnect: () => Promise<void>,
): () => void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Sunucu graceful shutdown başlatıyor");
    try {
      // Fastify close stops accepting new connections and waits for active
      // requests before the shared Prisma pool is released.
      await app.close();
      await disconnect();
      app.log.info({ signal }, "Sunucu graceful shutdown tamamlandı");
    } catch (err) {
      app.log.error({ err, signal }, "Graceful shutdown başarısız");
      process.exitCode = 1;
    }
  };

  const onSigterm = () => void shutdown("SIGTERM");
  const onSigint = () => void shutdown("SIGINT");
  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);

  return () => {
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("SIGINT", onSigint);
  };
}
