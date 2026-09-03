import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { registerGracefulShutdown } from "../src/lib/graceful-shutdown.js";

describe("graceful shutdown", () => {
  it.each(["SIGTERM", "SIGINT"] as const)("%s closes app then DB", async (signal) => {
    const close = vi.fn().mockResolvedValue(undefined);
    const app = {
      close,
      log: { info: vi.fn(), error: vi.fn() },
    } as unknown as FastifyInstance;
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const cleanup = registerGracefulShutdown(app, disconnect);

    try {
      process.emit(signal);
      await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
      expect(close).toHaveBeenCalledOnce();
      expect(close.mock.invocationCallOrder[0]).toBeLessThan(
        disconnect.mock.invocationCallOrder[0]!,
      );
      expect(app.log.info).toHaveBeenCalledWith({ signal }, "Sunucu graceful shutdown tamamlandı");
    } finally {
      cleanup();
    }
  });
});
