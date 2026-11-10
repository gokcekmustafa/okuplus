import { Prisma } from "@prisma/client";
import { conflictError, notFoundError, serviceUnavailableError } from "../../lib/errors.js";
import type { RequestContext } from "../tenant/context.js";
import { withTenantContext } from "../tenant/context.js";

export const ACCOUNT_DELETION_REQUEST_STATUS = "IDENTITY_REQUIRED" as const;

// Future states are included in the lookup contract so a later lifecycle
// phase can expand the DB constraint and partial index without changing the
// owner-scoped API. This phase only creates IDENTITY_REQUIRED rows.
const OPEN_STATUSES = [
  "RECEIVED",
  "IDENTITY_REQUIRED",
  "AUTHORITY_REVIEW",
  "SCOPE_REVIEW",
  "PROCESSING",
  "RETRYABLE_FAILURE",
] as const;

const requestSelect = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
} as const;

export type AccountDeletionRequestSnapshot = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
};

export type CreatedAccountDeletionRequest = {
  request: AccountDeletionRequestSnapshot;
  created: boolean;
};

function ownerContext(userId: string): RequestContext {
  return { userId, tenantId: null, platformRole: null };
}

export type CancelledAccountDeletionRequest = {
  request: AccountDeletionRequestSnapshot;
  cancelled: boolean;
};

export type AdminAccountDeletionRequestFilter = "pending" | "cancelled" | "all";

export type AdminAccountDeletionRequestPage = {
  items: Array<
    AccountDeletionRequestSnapshot & {
      userDisplayName: string;
    }
  >;
  page: number;
  pageSize: number;
  total: number;
};

export async function getCurrentAccountDeletionRequest(
  userId: string,
): Promise<AccountDeletionRequestSnapshot | null> {
  try {
    return await withTenantContext(ownerContext(userId), (tx) =>
      tx.accountDeletionRequest.findFirst({
        where: { userId, status: { in: [...OPEN_STATUSES] } },
        orderBy: { createdAt: "desc" },
        select: requestSelect,
      }),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      throw serviceUnavailableError("Hesap silme talebi geçici olarak kullanılamıyor");
    }
    throw error;
  }
}

/**
 * Records a self-request only. The database's partial unique index is the
 * concurrency boundary: repeated/racing submissions return the same open
 * record. No account, membership, session, identity or learning data changes.
 */
export async function createAccountDeletionRequest(
  userId: string,
): Promise<CreatedAccountDeletionRequest> {
  const existing = await getCurrentAccountDeletionRequest(userId);
  if (existing) return { request: existing, created: false };

  try {
    const request = await withTenantContext(ownerContext(userId), (tx) =>
      tx.accountDeletionRequest.create({
        data: { userId, status: ACCOUNT_DELETION_REQUEST_STATUS },
        select: requestSelect,
      }),
    );
    return { request, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const racedRequest = await getCurrentAccountDeletionRequest(userId);
      if (racedRequest) return { request: racedRequest, created: false };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      throw serviceUnavailableError("Hesap silme talebi geçici olarak kullanılamıyor");
    }
    throw error;
  }
}

/**
 * Atomically withdraws only the exact, owner-scoped request while it is still
 * awaiting identity verification. Keeping the row preserves the audit trail;
 * the partial unique index permits a later request after cancellation.
 */
export async function cancelAccountDeletionRequest(
  userId: string,
  requestId: string,
): Promise<CancelledAccountDeletionRequest> {
  try {
    return await withTenantContext(ownerContext(userId), async (tx) => {
      const updated = await tx.accountDeletionRequest.updateMany({
        where: { id: requestId, userId, status: ACCOUNT_DELETION_REQUEST_STATUS },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      const request = await tx.accountDeletionRequest.findFirst({
        where: { id: requestId, userId },
        select: requestSelect,
      });
      if (!request) throw notFoundError("Hesap silme talebi bulunamadı");
      if (updated.count === 1) return { request, cancelled: true };
      if (request.status === "CANCELLED") return { request, cancelled: false };
      throw conflictError("Bu talep artık geri çekilemez");
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      throw serviceUnavailableError("Hesap silme talebi geçici olarak kullanılamıyor");
    }
    throw error;
  }
}

/** Lists the limited request fields for a caller already guarded as SUPER_ADMIN. */
export async function listAdminAccountDeletionRequests(input: {
  actorUserId: string;
  filter: AdminAccountDeletionRequestFilter;
  page: number;
  pageSize: number;
}): Promise<AdminAccountDeletionRequestPage> {
  const where =
    input.filter === "pending"
      ? { status: ACCOUNT_DELETION_REQUEST_STATUS }
      : input.filter === "cancelled"
        ? { status: "CANCELLED" }
        : {};

  try {
    return await withTenantContext(
      { userId: input.actorUserId, tenantId: null, platformRole: "SUPER_ADMIN" },
      async (tx) => {
        const total = await tx.accountDeletionRequest.count({ where });
        const rows = await tx.accountDeletionRequest.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: {
            ...requestSelect,
            user: { select: { displayName: true } },
          },
        });
        return {
          items: rows.map(({ user, ...request }) => ({
            ...request,
            userDisplayName: user.displayName,
          })),
          page: input.page,
          pageSize: input.pageSize,
          total,
        };
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      throw serviceUnavailableError("Hesap silme talebi geçici olarak kullanılamıyor");
    }
    throw error;
  }
}
