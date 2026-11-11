import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAdminSupportAction,
  createSupportTicket,
  replyToSupportTicket,
} from "../src/modules/support/service.js";

const { withTenantContext, notifySuperAdmins, notifyUser } = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  notifySuperAdmins: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("../src/modules/tenant/context.js", () => ({ withTenantContext }));
vi.mock("../src/modules/notifications/service.js", () => ({ notifySuperAdmins, notifyUser }));

describe("support ticket workflow service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an owner-scoped ticket, first message, audit event and Super Admin notification atomically", async () => {
    const createdAt = new Date("2026-11-10T10:00:00.000Z");
    const ticketCreate = vi.fn(async () => ({
      id: "ticket-1",
      status: "NEW",
      subject: "Giriş sorunu",
      category: "ACCOUNT",
      createdAt,
    }));
    const messageCreate = vi.fn(async () => ({
      id: "message-1",
      body: "Giriş yapamıyorum.",
      createdAt,
    }));
    const activityCreate = vi.fn(async () => ({ id: "activity-1" }));
    withTenantContext.mockImplementationOnce(async (context, callback) => {
      expect(context).toEqual({ userId: "owner-1", tenantId: null, platformRole: null });
      return callback({
        supportTicket: { create: ticketCreate },
        supportTicketMessage: { create: messageCreate },
        supportTicketActivity: { create: activityCreate },
      } as never);
    });

    const result = await createSupportTicket("owner-1", {
      subject: "Giriş sorunu",
      category: "ACCOUNT",
      body: "Giriş yapamıyorum.",
    });

    expect(result.ticket.id).toBe("ticket-1");
    expect(ticketCreate).toHaveBeenCalledWith({
      data: { ownerUserId: "owner-1", subject: "Giriş sorunu", category: "ACCOUNT", status: "NEW" },
      select: { id: true, status: true, subject: true, category: true, createdAt: true },
    });
    expect(messageCreate).toHaveBeenCalledWith({
      data: { ticketId: "ticket-1", authorUserId: "owner-1", body: "Giriş yapamıyorum." },
      select: { id: true, body: true, createdAt: true },
    });
    expect(activityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: "ticket-1",
        actorUserId: "owner-1",
        eventType: "CREATED",
      }),
    });
    expect(notifySuperAdmins).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: "owner-1",
      eventKey: "support-ticket:ticket-1:created",
      kind: "SUPPORT_TICKET_CREATED",
      targetType: "SUPPORT_TICKET",
      targetId: "ticket-1",
    });
  });

  it("reopens a closed ticket on owner reply and rejects a raced update before adding a message", async () => {
    const updatedAt = new Date("2026-11-10T10:00:00.000Z");
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const messageCreate = vi.fn();
    withTenantContext.mockImplementationOnce(async (_context, callback) =>
      callback({
        supportTicket: {
          findFirst: vi.fn(async () => ({ id: "ticket-1", status: "CLOSED", updatedAt })),
          updateMany,
        },
        supportTicketMessage: { create: messageCreate },
        supportTicketActivity: { create: vi.fn() },
      } as never),
    );

    await expect(
      replyToSupportTicket({ userId: "owner-1", ticketId: "ticket-1", body: "Ek bilgi" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "ticket-1", status: "CLOSED", updatedAt },
      data: { status: "IN_PROGRESS", closedAt: null, updatedAt: expect.any(Date) },
    });
    expect(messageCreate).not.toHaveBeenCalled();
    expect(notifySuperAdmins).not.toHaveBeenCalled();
  });

  it("applies an allowed Super Admin response/status transition and notifies only the owner", async () => {
    const updatedAt = new Date("2026-11-10T10:00:00.000Z");
    const ticketUpdate = vi.fn(async () => ({ count: 1 }));
    const messageCreate = vi.fn(async () => ({ id: "admin-message-1" }));
    const activityCreate = vi.fn(async () => ({ id: "activity-1" }));
    const notificationClient = { notification: { createMany: vi.fn() } };
    withTenantContext.mockImplementationOnce(async (context, callback) => {
      expect(context).toEqual({ userId: "admin-1", tenantId: null, platformRole: "SUPER_ADMIN" });
      return callback({
        supportTicket: {
          findUnique: vi.fn(async () => ({
            id: "ticket-1",
            ownerUserId: "owner-1",
            status: "IN_PROGRESS",
            updatedAt,
          })),
          updateMany: ticketUpdate,
        },
        supportTicketMessage: { create: messageCreate },
        supportTicketActivity: { create: activityCreate },
        ...notificationClient,
      } as never);
    });

    const result = await applyAdminSupportAction({
      actorUserId: "admin-1",
      ticketId: "ticket-1",
      action: { status: "WAITING_FOR_USER", message: "Lütfen adımı tarif et." },
    });

    expect(result).toEqual({ ticketId: "ticket-1", status: "WAITING_FOR_USER" });
    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: "ticket-1", status: "IN_PROGRESS", updatedAt },
      data: { status: "WAITING_FOR_USER", closedAt: null, updatedAt: expect.any(Date) },
    });
    expect(activityCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        actorUserId: "admin-1",
        eventType: "STATUS_CHANGED",
        fromStatus: "IN_PROGRESS",
        toStatus: "WAITING_FOR_USER",
        note: "Destek talebinin durumu güncellendi.",
      },
    });
    expect(messageCreate).toHaveBeenCalledWith({
      data: { ticketId: "ticket-1", authorUserId: "admin-1", body: "Lütfen adımı tarif et." },
      select: { id: true },
    });
    expect(notifyUser).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: "admin-1",
      recipientUserId: "owner-1",
      eventKey: "support-ticket:ticket-1:admin-message:admin-message-1",
      kind: "SUPPORT_TICKET_UPDATED",
      title: "Destek talebinde güncelleme",
      body: "Destek talebinin durumu güncellendi veya sana yeni bir yanıt gönderildi.",
      targetType: "SUPPORT_TICKET",
      targetId: "ticket-1",
    });
  });

  it("records an internal note without inventing a status change", async () => {
    const updatedAt = new Date("2026-11-10T10:00:00.000Z");
    const ticketUpdate = vi.fn(async () => ({ count: 1 }));
    const activityCreate = vi.fn(async () => ({ id: "activity-1" }));
    withTenantContext.mockImplementationOnce(async (_context, callback) =>
      callback({
        supportTicket: {
          findUnique: vi.fn(async () => ({
            id: "ticket-1",
            ownerUserId: "owner-1",
            status: "IN_PROGRESS",
            updatedAt,
          })),
          updateMany: ticketUpdate,
        },
        supportTicketActivity: { create: activityCreate },
        supportTicketMessage: { create: vi.fn() },
      } as never),
    );

    const result = await applyAdminSupportAction({
      actorUserId: "admin-1",
      ticketId: "ticket-1",
      action: { internalNote: "İç değerlendirme." },
    });

    expect(result).toEqual({ ticketId: "ticket-1", status: "IN_PROGRESS" });
    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: "ticket-1", status: "IN_PROGRESS", updatedAt },
      data: { updatedAt: expect.any(Date) },
    });
    expect(activityCreate).toHaveBeenCalledTimes(1);
    expect(activityCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        actorUserId: "admin-1",
        eventType: "INTERNAL_NOTE",
        note: "İç değerlendirme.",
        visibleToUser: false,
      },
    });
  });
});
