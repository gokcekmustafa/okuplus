import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProvider } from "../src/modules/auth/index.js";
import { authRoutes } from "../src/modules/auth/routes.js";

const requestServices = vi.hoisted(() => ({
  cancelAccountDeletionRequest: vi.fn(),
  createAccountDeletionRequest: vi.fn(),
  getCurrentAccountDeletionRequest: vi.fn(),
  listAdminAccountDeletionRequests: vi.fn(),
}));

vi.mock("../src/modules/auth/account-deletion-requests.js", () => requestServices);

const testUsers = {
  owner: { id: "owner-id", email: "owner@example.test", displayName: "Owner", platformRole: null },
  editor: {
    id: "editor-id",
    email: "editor@example.test",
    displayName: "Editor",
    platformRole: "CONTENT_EDITOR",
  },
  superAdmin: {
    id: "super-admin-id",
    email: "admin@example.test",
    displayName: "Super Admin",
    platformRole: "SUPER_ADMIN",
  },
} as const;

async function makeApp() {
  const app = Fastify();
  const authProvider = {
    verifyAccessToken: vi.fn(async (token: string) => {
      const user = testUsers[token as keyof typeof testUsers];
      if (!user) throw new Error("invalid test token");
      return {
        user,
        tenantContext: { userId: user.id, tenantId: null, platformRole: user.platformRole },
      };
    }),
  } as unknown as AuthProvider;

  await authRoutes(app, {
    authProvider,
    pilotAccessEnv: { APP_ENV: "test", PILOT_MODE: "off", PILOT_STUDENT_ACCESS: "off" },
    socialAuthService: {} as never,
    googleOAuthClient: {} as never,
    csrfSecret: "test-secret",
    allowedOrigins: [],
    enforceAuthOrigin: false,
    cookieAuthEnabled: false,
  });
  await app.ready();
  return app;
}

describe("account deletion request routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a signed-in SUPER_ADMIN to read the limited paginated list", async () => {
    requestServices.listAdminAccountDeletionRequests.mockResolvedValue({
      items: [],
      page: 2,
      pageSize: 5,
      total: 0,
    });
    const app = await makeApp();
    const unauthenticated = await app.inject({
      method: "GET",
      url: "/admin/account-deletion-requests",
    });
    const editor = await app.inject({
      method: "GET",
      url: "/admin/account-deletion-requests",
      headers: { authorization: "Bearer editor" },
    });
    const authorized = await app.inject({
      method: "GET",
      url: "/admin/account-deletion-requests?status=cancelled&page=2&pageSize=5",
      headers: { authorization: "Bearer superAdmin" },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(editor.statusCode).toBe(403);
    expect(authorized.statusCode).toBe(200);
    expect(authorized.headers["cache-control"]).toContain("no-store");
    expect(requestServices.listAdminAccountDeletionRequests).toHaveBeenCalledExactlyOnceWith({
      actorUserId: "super-admin-id",
      filter: "cancelled",
      page: 2,
      pageSize: 5,
    });
    await app.close();
  });

  it("accepts only authenticated owner cancellation requests and passes the exact request ID", async () => {
    requestServices.cancelAccountDeletionRequest.mockResolvedValue({
      request: {
        id: "request-id",
        status: "CANCELLED",
        createdAt: new Date("2026-11-01T10:00:00.000Z"),
        updatedAt: new Date("2026-11-02T10:00:00.000Z"),
        cancelledAt: new Date("2026-11-02T10:00:00.000Z"),
      },
      cancelled: true,
    });
    const app = await makeApp();
    const unauthorized = await app.inject({
      method: "POST",
      url: "/auth/account-deletion-requests/request-id/cancel",
      payload: {},
    });
    const cancel = await app.inject({
      method: "POST",
      url: "/auth/account-deletion-requests/request-id/cancel",
      headers: { authorization: "Bearer owner" },
      payload: {},
    });
    const forgedBody = await app.inject({
      method: "POST",
      url: "/auth/account-deletion-requests/request-id/cancel",
      headers: { authorization: "Bearer owner" },
      payload: { userId: "other-user" },
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.cancelled).toBe(true);
    expect(requestServices.cancelAccountDeletionRequest).toHaveBeenCalledExactlyOnceWith(
      "owner-id",
      "request-id",
    );
    expect(forgedBody.statusCode).toBe(400);
    await app.close();
  });
});
