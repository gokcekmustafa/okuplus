import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createAccountDeletionRequest,
  getCurrentAccountDeletionRequest,
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
