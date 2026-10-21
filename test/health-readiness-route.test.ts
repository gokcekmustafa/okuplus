import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { healthRoutes } from "../src/modules/health/routes.js";

describe("GET /ready migration state contract", () => {
  async function requestReadiness(queryRaw: ReturnType<typeof vi.fn>) {
    const app = Fastify();
    await healthRoutes(app, { db: { $queryRaw: queryRaw } as never });
    await app.ready();
    try {
      return await app.inject({ method: "GET", url: "/ready" });
    } finally {
      await app.close();
    }
  }

  it("returns ready only when the status function explicitly reports no incomplete migration", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ has_incomplete_migrations: false }]);

    const response = await requestReadiness(queryRaw);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", ready: true });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when a failed or incomplete migration exists", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ has_incomplete_migrations: true }]);

    const response = await requestReadiness(queryRaw);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready", ready: false });
  });

  it("uses the legacy check only when the versioned function is not installed yet", async () => {
    const missingFunction = Object.assign(new Error("function absent"), {
      code: "P2010",
      meta: { code: "42883" },
    });
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(missingFunction)
      .mockResolvedValueOnce([{ count: 0n }]);

    const response = await requestReadiness(queryRaw);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", ready: true });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      "permission denied",
      vi
        .fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(
          Object.assign(new Error("permission denied: private"), {
            code: "P2010",
            meta: { code: "42501" },
          }),
        ),
    ],
    ["missing status row", vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])],
    [
      "invalid status value",
      vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ has_incomplete_migrations: null }]),
    ],
    [
      "missing legacy status row",
      vi
        .fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(
          Object.assign(new Error("function absent"), {
            code: "P2010",
            meta: { code: "42883" },
          }),
        )
        .mockResolvedValueOnce([]),
    ],
  ])("fails closed for %s", async (_caseName, queryRaw) => {
    const response = await requestReadiness(queryRaw as ReturnType<typeof vi.fn>);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready", ready: false });
    if (_caseName === "permission denied") {
      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(response.body).not.toContain("private");
    }
  });
});
