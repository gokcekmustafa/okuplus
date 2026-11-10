import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  cancelAccountDeletionRequest,
  createAccountDeletionRequest,
  getCurrentAccountDeletionRequest,
  listAdminAccountDeletionRequests,
} from "../src/modules/auth/account-deletion-requests.js";

const { withTenantContext } = vi.hoisted(() => ({ withTenantContext: vi.fn() }));
vi.mock("../src/modules/tenant/context.js", () => ({ withTenantContext }));

describe("account deletion schema availability", () => {
  it("reports unavailable for both entry points when the request table is missing", async () => {
    withTenantContext.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing table", {
        code: "P2021",
        clientVersion: "test",
      }),
    );
    for (const operation of [getCurrentAccountDeletionRequest, createAccountDeletionRequest]) {
      await expect(operation("fixture-owner")).rejects.toMatchObject({ statusCode: 503 });
    }
    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(withTenantContext).toHaveBeenCalledWith(
      { userId: "fixture-owner", tenantId: null, platformRole: null },
      expect.any(Function),
    );
  });
});

describe("account deletion request cancellation and admin read", () => {
  const createdAt = new Date("2026-11-01T10:00:00.000Z");
  const cancelledAt = new Date("2026-11-02T10:00:00.000Z");

  it("atomically cancels only the exact owner's identity-pending request", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findFirst = vi.fn(async () => ({
      id: "request-1",
      status: "CANCELLED",
      createdAt,
      updatedAt: cancelledAt,
      cancelledAt,
    }));
    withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ accountDeletionRequest: { updateMany, findFirst } } as never),
    );

    const result = await cancelAccountDeletionRequest("owner-1", "request-1");

    expect(withTenantContext).toHaveBeenCalledWith(
      { userId: "owner-1", tenantId: null, platformRole: null },
      expect.any(Function),
    );
    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "request-1", userId: "owner-1", status: "IDENTITY_REQUIRED" },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    });
    expect(result).toMatchObject({
      cancelled: true,
      request: { id: "request-1", status: "CANCELLED" },
    });
  });

  it("treats duplicate cancellation idempotently and refuses non-cancellable states", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const findFirst = vi.fn(async () => ({
      id: "request-1",
      status: "CANCELLED",
      createdAt,
      updatedAt: cancelledAt,
      cancelledAt,
    }));
    withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ accountDeletionRequest: { updateMany, findFirst } } as never),
    );
    await expect(cancelAccountDeletionRequest("owner-1", "request-1")).resolves.toMatchObject({
      cancelled: false,
      request: { status: "CANCELLED" },
    });

    findFirst.mockResolvedValueOnce({
      id: "request-1",
      status: "PROCESSING",
      createdAt,
      updatedAt: cancelledAt,
      cancelledAt: null,
    });
    await expect(cancelAccountDeletionRequest("owner-1", "request-1")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("lists only limited fields under an explicit Super Admin RLS context", async () => {
    const count = vi.fn(async () => 1);
    const findMany = vi.fn(async () => [
      {
        id: "request-1",
        status: "IDENTITY_REQUIRED",
        createdAt,
        updatedAt: createdAt,
        cancelledAt: null,
        user: { displayName: "Student" },
      },
    ]);
    withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ accountDeletionRequest: { count, findMany } } as never),
    );

    const page = await listAdminAccountDeletionRequests({
      actorUserId: "admin-1",
      filter: "pending",
      page: 2,
      pageSize: 10,
    });

    expect(withTenantContext).toHaveBeenCalledWith(
      { userId: "admin-1", tenantId: null, platformRole: "SUPER_ADMIN" },
      expect.any(Function),
    );
    expect(count).toHaveBeenCalledWith({ where: { status: "IDENTITY_REQUIRED" } });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        select: expect.objectContaining({
          id: true,
          cancelledAt: true,
          user: { select: { displayName: true } },
        }),
      }),
    );
    expect(page.items[0]).toMatchObject({
      userDisplayName: "Student",
      status: "IDENTITY_REQUIRED",
    });
    expect(page.items[0]).not.toHaveProperty("email");
    expect(page.items[0]).not.toHaveProperty("userId");
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 1 });
  });
});
