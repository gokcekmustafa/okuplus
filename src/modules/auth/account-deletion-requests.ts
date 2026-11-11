import { Prisma } from "@prisma/client";
import { conflictError, notFoundError, serviceUnavailableError } from "../../lib/errors.js";
import type { RequestContext } from "../tenant/context.js";
import { withTenantContext } from "../tenant/context.js";
import { notifySuperAdmins, notifyUser } from "../notifications/service.js";

export const ACCOUNT_DELETION_REQUEST_STATUS = "IDENTITY_REQUIRED" as const;

const OPEN_STATUSES = ["IDENTITY_REQUIRED", "UNDER_REVIEW", "AWAITING_USER"] as const;

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

export type AdminAccountDeletionRequestFilter =
  "pending" | "open" | "cancelled" | "declined" | "all";

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
    const request = await withTenantContext(ownerContext(userId), async (tx) => {
      const created = await tx.accountDeletionRequest.create({
        data: { userId, status: ACCOUNT_DELETION_REQUEST_STATUS },
        select: requestSelect,
      });
      await tx.accountDeletionRequestActivity.create({
        data: {
          requestId: created.id,
          actorUserId: userId,
          eventType: "CREATED",
          toStatus: created.status,
          note: "Talep kaydedildi.",
          visibleToUser: true,
        },
      });
      await notifySuperAdmins(tx, {
        actorUserId: userId,
        eventKey: `account-deletion:${created.id}:created`,
        kind: "ACCOUNT_DELETION_REQUEST_CREATED",
        targetType: "ACCOUNT_DELETION_REQUEST",
        targetId: created.id,
      });
      return created;
    });
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
      if (updated.count === 1) {
        return { request, cancelled: true };
      }
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
    input.filter === "pending" || input.filter === "open"
      ? { status: { in: [...OPEN_STATUSES] } }
      : input.filter === "cancelled" || input.filter === "declined"
        ? { status: input.filter === "cancelled" ? "CANCELLED" : "DECLINED" }
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

export async function getAccountDeletionRequestHistory(input: {
  userId: string;
  page?: number;
  pageSize?: number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  return withTenantContext(ownerContext(input.userId), async (tx) => {
    const [items, total] = await Promise.all([
      tx.accountDeletionRequest.findMany({
        where: { userId: input.userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: requestSelect,
      }),
      tx.accountDeletionRequest.count({ where: { userId: input.userId } }),
    ]);
    return { items, page, pageSize, total };
  });
}

function mapAccountDeletionDetail(
  row: {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    cancelledAt: Date | null;
    user?: { displayName: string };
    messages: Array<{
      id: string;
      body: string;
      visibleToUser: boolean;
      createdAt: Date;
      author: { displayName: string; platformRole: string | null };
    }>;
    activities: Array<{
      id: string;
      eventType: string;
      fromStatus: string | null;
      toStatus: string | null;
      note: string | null;
      visibleToUser: boolean;
      createdAt: Date;
      actor: { displayName: string; platformRole: string | null } | null;
    }>;
  },
  isSuperAdmin: boolean,
) {
  return {
    request: {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      cancelledAt: row.cancelledAt,
      ...(row.user ? { userDisplayName: row.user.displayName } : {}),
    },
    messages: row.messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorLabel:
        message.author.platformRole === "SUPER_ADMIN" && !isSuperAdmin
          ? "OkuPratik Destek"
          : message.author.displayName,
      visibleToUser: message.visibleToUser,
    })),
    activities: row.activities.map((activity) => ({
      id: activity.id,
      eventType: activity.eventType,
      fromStatus: activity.fromStatus,
      toStatus: activity.toStatus,
      note: activity.note,
      createdAt: activity.createdAt,
      actorLabel:
        activity.actor?.platformRole === "SUPER_ADMIN" && !isSuperAdmin
          ? "OkuPratik Destek"
          : (activity.actor?.displayName ?? "OkuPratik"),
      visibleToUser: activity.visibleToUser,
    })),
  };
}

export async function getAccountDeletionRequestDetail(input: {
  actorUserId: string;
  requestId: string;
  isSuperAdmin: boolean;
}) {
  const context: RequestContext = input.isSuperAdmin
    ? { userId: input.actorUserId, tenantId: null, platformRole: "SUPER_ADMIN" }
    : ownerContext(input.actorUserId);
  const row = await withTenantContext(context, (tx) =>
    tx.accountDeletionRequest.findFirst({
      where: { id: input.requestId, ...(input.isSuperAdmin ? {} : { userId: input.actorUserId }) },
      select: {
        ...requestSelect,
        ...(input.isSuperAdmin ? { user: { select: { displayName: true } } } : {}),
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            body: true,
            visibleToUser: true,
            createdAt: true,
            author: { select: { displayName: true, platformRole: true } },
          },
        },
        activities: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            eventType: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            visibleToUser: true,
            createdAt: true,
            actor: { select: { displayName: true, platformRole: true } },
          },
        },
      },
    }),
  );
  if (!row) throw notFoundError("Hesap silme talebi bulunamadı");
  return mapAccountDeletionDetail(row, input.isSuperAdmin);
}

export async function sendAccountDeletionRequestMessage(input: {
  userId: string;
  requestId: string;
  body: string;
}) {
  return withTenantContext(ownerContext(input.userId), async (tx) => {
    const request = await tx.accountDeletionRequest.findFirst({
      where: { id: input.requestId, userId: input.userId },
      select: { id: true, status: true },
    });
    if (!request) throw notFoundError("Hesap silme talebi bulunamadı");
    if (request.status !== "AWAITING_USER") {
      throw conflictError("Şu anda bu talebe yanıt gönderilemiyor");
    }
    const message = await tx.accountDeletionRequestMessage.create({
      data: {
        requestId: request.id,
        authorUserId: input.userId,
        body: input.body,
        visibleToUser: true,
      },
      select: { id: true, createdAt: true },
    });
    const changed = await tx.accountDeletionRequest.updateMany({
      where: { id: request.id, userId: input.userId, status: "AWAITING_USER" },
      data: { status: "UNDER_REVIEW" },
    });
    if (changed.count !== 1)
      throw conflictError("Talep aynı anda güncellendi; yeniden yükleyip dene");
    await notifySuperAdmins(tx, {
      actorUserId: input.userId,
      eventKey: `account-deletion:${request.id}:user-message:${message.id}`,
      kind: "ACCOUNT_DELETION_REQUEST_USER_MESSAGE",
      targetType: "ACCOUNT_DELETION_REQUEST",
      targetId: request.id,
    });
    return { message, status: "UNDER_REVIEW" };
  });
}

const ACCOUNT_DELETION_TRANSITIONS: Record<string, readonly string[]> = {
  IDENTITY_REQUIRED: ["UNDER_REVIEW", "AWAITING_USER", "DECLINED"],
  UNDER_REVIEW: ["IDENTITY_REQUIRED", "AWAITING_USER", "DECLINED"],
  AWAITING_USER: ["UNDER_REVIEW", "DECLINED"],
};

export async function applyAdminAccountDeletionAction(input: {
  actorUserId: string;
  requestId: string;
  status?: "IDENTITY_REQUIRED" | "UNDER_REVIEW" | "AWAITING_USER" | "DECLINED";
  body?: string;
  visibility?: "USER" | "INTERNAL";
}) {
  return withTenantContext(
    { userId: input.actorUserId, tenantId: null, platformRole: "SUPER_ADMIN" },
    async (tx) => {
      const current = await tx.accountDeletionRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, userId: true, status: true, updatedAt: true },
      });
      if (!current) throw notFoundError("Hesap silme talebi bulunamadı");
      const body = input.body?.trim();
      if (!input.status && !body) throw conflictError("Durum veya not girilmeli");
      if (input.status && input.status !== current.status) {
        const allowed = ACCOUNT_DELETION_TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(input.status)) {
          throw conflictError("Bu başvuruda bu durum geçişine izin verilmiyor");
        }
      }
      const nextStatus = input.status ?? current.status;
      if (nextStatus !== current.status) {
        const changed = await tx.accountDeletionRequest.updateMany({
          where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
          data: { status: nextStatus },
        });
        if (changed.count !== 1)
          throw conflictError("Talep aynı anda güncellendi; yeniden yükleyip tekrar deneyin");
      }

      let notificationEventKey: string | null = null;
      if (body && input.visibility === "INTERNAL") {
        await tx.accountDeletionRequestActivity.create({
          data: {
            requestId: current.id,
            actorUserId: input.actorUserId,
            eventType: "INTERNAL_NOTE",
            fromStatus: nextStatus === current.status ? null : current.status,
            toStatus: nextStatus === current.status ? null : nextStatus,
            note: body,
            visibleToUser: false,
          },
        });
      } else if (body) {
        const message = await tx.accountDeletionRequestMessage.create({
          data: {
            requestId: current.id,
            authorUserId: input.actorUserId,
            body,
            visibleToUser: true,
          },
          select: { id: true },
        });
        notificationEventKey = `account-deletion:${current.id}:admin-message:${message.id}`;
      }

      if (nextStatus !== current.status || (body && input.visibility !== "INTERNAL")) {
        await notifyUser(tx, {
          actorUserId: input.actorUserId,
          recipientUserId: current.userId,
          eventKey:
            notificationEventKey ??
            `account-deletion:${current.id}:admin-status:${current.updatedAt.toISOString()}:${nextStatus}`,
          kind: "ACCOUNT_DELETION_REQUEST_UPDATED",
          title: "Hesap silme talebinde güncelleme",
          body: "Talebinin durumu güncellendi veya sana yeni bir yanıt gönderildi.",
          targetType: "ACCOUNT_DELETION_REQUEST",
          targetId: current.id,
        });
      }
      return { requestId: current.id, status: nextStatus };
    },
  );
}
