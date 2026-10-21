import { Prisma } from "@prisma/client";
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
} as const;

export type AccountDeletionRequestSnapshot = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatedAccountDeletionRequest = {
  request: AccountDeletionRequestSnapshot;
  created: boolean;
};

function ownerContext(userId: string): RequestContext {
  return { userId, tenantId: null, platformRole: null };
}

export async function getCurrentAccountDeletionRequest(
  userId: string,
): Promise<AccountDeletionRequestSnapshot | null> {
  return withTenantContext(ownerContext(userId), (tx) =>
    tx.accountDeletionRequest.findFirst({
      where: { userId, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: requestSelect,
    }),
  );
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
    throw error;
  }
}
