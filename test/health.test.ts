import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { healthRoutes } from "../src/modules/health/routes.js";
import type { AuthProvider } from "../src/modules/auth/index.js";

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

  it("production identity diagnostic varsayılan olarak kapalıdır", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/diagnostics/production-db-identity",
    });
    expect(res.statusCode).toBe(404);
  });

  it("production identity diagnostic yalnızca SUPER_ADMIN için salt-okunur kimlik döndürür", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        database: "neondb",
        current_user: "neondb_owner",
        server_address: "10.0.0.1",
        server_port: 5432,
      },
    ]);
    const authProvider = {
      verifyAccessToken: vi.fn().mockResolvedValue({
        user: {
          id: "platform-user",
          email: "platform@example.invalid",
          displayName: "Platform",
          platformRole: "SUPER_ADMIN",
        },
        tenantContext: null,
      }),
    } as unknown as AuthProvider;
    const probeApp = Fastify();
    await healthRoutes(probeApp, {
      db: { $queryRaw: queryRaw } as unknown as HealthDatabase,
      authProvider,
      databaseUrl:
        "postgresql://neondb_owner:placeholder@ep-misty-smoke-b1qzb1a8.c-5.eu-central-1.aws.neon.tech/neondb",
      identityDiagnosticEnabled: true,
    });
    await probeApp.ready();

    try {
      const res = await probeApp.inject({
        method: "GET",
        url: "/admin/diagnostics/production-db-identity",
        headers: { authorization: "Bearer test-access-token" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "ok",
        environment: "PRODUCTION",
        provider: "NEON",
        endpointId: "ep-misty-smoke-b1qzb1a8",
        endpointKind: "DIRECT",
        database: "neondb",
        currentUser: "neondb_owner",
        serverPort: 5432,
        serverAddressPresent: true,
      });
      expect(res.json()).not.toHaveProperty("host");
      expect(JSON.stringify(res.json())).not.toContain("placeholder");
      expect(queryRaw).toHaveBeenCalledTimes(1);
    } finally {
      await probeApp.close();
    }
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
