import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAdminAccountDeletionAction,
  getAccountDeletionRequestDetail,
  sendAccountDeletionRequestMessage,
} from "../src/modules/auth/account-deletion-requests.js";

const { withTenantContext, notifySuperAdmins, notifyUser } = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  notifySuperAdmins: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("../src/modules/tenant/context.js", () => ({ withTenantContext }));
vi.mock("../src/modules/notifications/service.js", () => ({ notifySuperAdmins, notifyUser }));

describe("account deletion review service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes request details to the owner and hides private activities through the owner query", async () => {
    const findFirst = vi.fn(async () => ({
      id: "request-1",
      status: "AWAITING_USER",
      createdAt: new Date("2026-11-10T10:00:00.000Z"),
      updatedAt: new Date("2026-11-10T10:00:00.000Z"),
      cancelledAt: null,
      messages: [],
      activities: [],
    }));
    withTenantContext.mockImplementationOnce(async (context, callback) => {
      expect(context).toEqual({ userId: "owner-1", tenantId: null, platformRole: null });
      return callback({ accountDeletionRequest: { findFirst } } as never);
    });

    const result = await getAccountDeletionRequestDetail({
      actorUserId: "owner-1",
      requestId: "request-1",
      isSuperAdmin: false,
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "request-1", userId: "owner-1" } }),
    );
    expect(result.request.id).toBe("request-1");
  });

  it("accepts an owner response only while awaiting information and starts a new review", async () => {
    const updatedAt = new Date("2026-11-10T10:00:00.000Z");
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const messageCreate = vi.fn(async () => ({ id: "reply-1", createdAt: updatedAt }));
    const activityCreate = vi.fn(async () => ({ id: "activity-1" }));
    withTenantContext.mockImplementationOnce(async (_context, callback) =>
      callback({
        accountDeletionRequest: {
          findFirst: vi.fn(async () => ({ id: "request-1", status: "AWAITING_USER" })),
          updateMany,
        },
        accountDeletionRequestMessage: { create: messageCreate },
        accountDeletionRequestActivity: { create: activityCreate },
      } as never),
    );

    const result = await sendAccountDeletionRequestMessage({
      userId: "owner-1",
      requestId: "request-1",
      body: "İstenen açıklama.",
    });

    expect(result.status).toBe("UNDER_REVIEW");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", userId: "owner-1", status: "AWAITING_USER" },
      data: { status: "UNDER_REVIEW" },
    });
    expect(notifySuperAdmins).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: "owner-1",
      eventKey: "account-deletion:request-1:user-message:reply-1",
      kind: "ACCOUNT_DELETION_REQUEST_USER_MESSAGE",
      targetType: "ACCOUNT_DELETION_REQUEST",
      targetId: "request-1",
    });
  });

  it("records an allowed admin status change and notifies the request owner without completing deletion", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const activityCreate = vi.fn(async () => ({ id: "activity-1" }));
    const notificationClient = { notification: { createMany: vi.fn() } };
    withTenantContext.mockImplementationOnce(async (context, callback) => {
      expect(context).toEqual({ userId: "admin-1", tenantId: null, platformRole: "SUPER_ADMIN" });
      return callback({
        accountDeletionRequest: {
          findUnique: vi.fn(async () => ({
            id: "request-1",
            userId: "owner-1",
            status: "IDENTITY_REQUIRED",
          })),
          updateMany,
        },
        accountDeletionRequestActivity: { create: activityCreate },
        accountDeletionRequestMessage: { create: vi.fn(async () => ({ id: "admin-message-1" })) },
        ...notificationClient,
      } as never);
    });

    const result = await applyAdminAccountDeletionAction({
      actorUserId: "admin-1",
      requestId: "request-1",
      status: "UNDER_REVIEW",
      body: "Talep inceleniyor.",
      visibility: "USER",
    });

    expect(result).toEqual({ requestId: "request-1", status: "UNDER_REVIEW" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "request-1", status: "IDENTITY_REQUIRED" },
      data: { status: "UNDER_REVIEW" },
    });
    expect(notifyUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUserId: "admin-1",
        recipientUserId: "owner-1",
        kind: "ACCOUNT_DELETION_REQUEST_UPDATED",
        targetId: "request-1",
      }),
    );
    expect(result.status).not.toBe("COMPLETED");
  });
});
