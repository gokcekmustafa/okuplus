import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProvider } from "../src/modules/auth/index.js";
import { notificationRoutes } from "../src/modules/notifications/routes.js";
import { supportRoutes } from "../src/modules/support/routes.js";

const supportServices = vi.hoisted(() => ({
  applyAdminSupportAction: vi.fn(),
  createSupportTicket: vi.fn(),
  getSupportTicketDetail: vi.fn(),
  listAdminSupportTickets: vi.fn(),
  listUserSupportTickets: vi.fn(),
  replyToSupportTicket: vi.fn(),
}));
const notificationServices = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("../src/modules/support/service.js", () => supportServices);
vi.mock("../src/modules/notifications/service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/modules/notifications/service.js")>();
  return { ...original, ...notificationServices };
});

const users = {
  owner: { id: "owner-1", email: "owner@example.test", displayName: "Öğrenci", platformRole: null },
  other: { id: "other-1", email: "other@example.test", displayName: "Diğer", platformRole: null },
  admin: {
    id: "admin-1",
    email: "admin@example.test",
    displayName: "Yönetici",
    platformRole: "SUPER_ADMIN",
  },
} as const;

async function makeApp() {
  const app = Fastify();
  const authProvider = {
    verifyAccessToken: vi.fn(async (token: string) => {
      const user = users[token as keyof typeof users];
      if (!user) throw new Error("invalid test token");
      return {
        user,
        tenantContext: { userId: user.id, tenantId: null, platformRole: user.platformRole },
      };
    }),
  } as unknown as AuthProvider;
  await supportRoutes(app, { authProvider });
  await notificationRoutes(app, { authProvider });
  await app.ready();
  return app;
}

describe("support and notification routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an authenticated owner's support ticket with bounded Turkish fields", async () => {
    supportServices.createSupportTicket.mockResolvedValue({
      ticket: { id: "ticket-1", status: "NEW" },
      message: { id: "message-1" },
    });
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/support/tickets",
      headers: { authorization: "Bearer owner" },
      payload: { subject: "Giriş sorunu", category: "ACCOUNT", body: "Giriş yapamıyorum." },
    });
    expect(response.statusCode).toBe(201);
    expect(supportServices.createSupportTicket).toHaveBeenCalledWith("owner-1", {
      subject: "Giriş sorunu",
      category: "ACCOUNT",
      body: "Giriş yapamıyorum.",
    });
    await app.close();
  });

  it("requires Super Admin for the cross-user support queue", async () => {
    supportServices.listAdminSupportTickets.mockResolvedValue({ items: [], total: 0 });
    const app = await makeApp();
    const denied = await app.inject({
      method: "GET",
      url: "/admin/support/tickets",
      headers: { authorization: "Bearer owner" },
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/admin/support/tickets?status=NEW",
      headers: { authorization: "Bearer admin" },
    });
    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(supportServices.listAdminSupportTickets).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      status: "NEW",
      page: 1,
      pageSize: 25,
    });
    await app.close();
  });

  it("binds notification list and read operations to the signed-in user", async () => {
    notificationServices.listNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    notificationServices.markNotificationRead.mockResolvedValue({
      id: "notification-1",
      readAt: new Date(),
    });
    const app = await makeApp();
    const unauthenticated = await app.inject({ method: "GET", url: "/notifications" });
    const list = await app.inject({
      method: "GET",
      url: "/notifications?limit=10",
      headers: { authorization: "Bearer owner" },
    });
    const read = await app.inject({
      method: "POST",
      url: "/notifications/notification-1/read",
      headers: { authorization: "Bearer owner" },
      payload: {},
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(list.statusCode).toBe(200);
    expect(read.statusCode).toBe(200);
    expect(notificationServices.listNotifications).toHaveBeenCalledWith("owner-1", 10);
    expect(notificationServices.markNotificationRead).toHaveBeenCalledWith(
      "owner-1",
      "notification-1",
    );
    await app.close();
  });
});
