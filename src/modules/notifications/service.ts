import type { Prisma } from "@prisma/client";
import { notFoundError } from "../../lib/errors.js";
import { withTenantContext } from "../tenant/context.js";

export type NotificationTargetType = "ACCOUNT_DELETION_REQUEST" | "SUPPORT_TICKET";

export async function notifySuperAdmins(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    eventKey: string;
    kind:
      | "ACCOUNT_DELETION_REQUEST_CREATED"
      | "ACCOUNT_DELETION_REQUEST_USER_MESSAGE"
      | "SUPPORT_TICKET_CREATED"
      | "SUPPORT_TICKET_USER_MESSAGE";
    targetType: NotificationTargetType;
    targetId: string;
  },
): Promise<void> {
  await tx.$queryRaw`
    SELECT public.notify_super_admins(
      ${input.actorUserId},
      ${input.eventKey},
      ${input.kind},
      ${input.targetType},
      ${input.targetId}
    )
  `;
}

export async function notifyUser(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    recipientUserId: string;
    eventKey: string;
    kind: "ACCOUNT_DELETION_REQUEST_UPDATED" | "SUPPORT_TICKET_UPDATED";
    title: string;
    body: string;
    targetType: NotificationTargetType;
    targetId: string;
  },
): Promise<void> {
  await tx.notification.createMany({
    data: [
      {
        actorUserId: input.actorUserId,
        recipientUserId: input.recipientUserId,
        recipientAudience: "USER",
        kind: input.kind,
        title: input.title,
        body: input.body,
        targetType: input.targetType,
        targetId: input.targetId,
        dedupeKey: input.eventKey,
      },
    ],
    skipDuplicates: true,
  });
}

const notificationSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  targetType: true,
  targetId: true,
  createdAt: true,
  readAt: true,
} as const;

export async function listNotifications(userId: string, limit: number) {
  return withTenantContext({ userId, tenantId: null, platformRole: null }, async (tx) => {
    const [items, unreadCount] = await Promise.all([
      tx.notification.findMany({
        where: { recipientUserId: userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: notificationSelect,
      }),
      tx.notification.count({ where: { recipientUserId: userId, readAt: null } }),
    ]);
    return { items, unreadCount };
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return withTenantContext({ userId, tenantId: null, platformRole: null }, async (tx) => {
    await tx.notification.updateMany({
      where: { id: notificationId, recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await tx.notification.findFirst({
      where: { id: notificationId, recipientUserId: userId },
      select: notificationSelect,
    });
    if (!notification) throw notFoundError("Bildirim bulunamadı");
    return notification;
  });
}
