import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { healthRoutes } from "../src/modules/health/routes.js";

const env = parseEnv({
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
});

describe("health endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(env);
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health → 200 { status: ok }", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /health/db → 200 { status: ok, database: up }", async () => {
    const res = await app.inject({ method: "GET", url: "/health/db" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", database: "up" });
  });

  it("GET /ready → 200 yalnızca uygulama ve migration state hazırsa", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", ready: true });
  });

  it("bilinmeyen rota → 404 standart format", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });

  it("DB unavailable iken /health/db ve /ready 503 döner", async () => {
    const failingDb = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("test db down")),
    } as unknown as Pick<typeof prisma, "$queryRaw">;
    const probeApp = Fastify();
    await healthRoutes(probeApp, { db: failingDb });
    await probeApp.ready();

    try {
      const dbHealth = await probeApp.inject({ method: "GET", url: "/health/db" });
      const readiness = await probeApp.inject({ method: "GET", url: "/ready" });
      expect(dbHealth.statusCode).toBe(503);
      expect(dbHealth.json()).toEqual({ status: "error", database: "down" });
      expect(readiness.statusCode).toBe(503);
      expect(readiness.json()).toEqual({ status: "not_ready", ready: false });
    } finally {
      await probeApp.close();
    }
  });
});
