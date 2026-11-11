import { conflictError, notFoundError } from "../../lib/errors.js";
import { notifySuperAdmins, notifyUser } from "../notifications/service.js";
import { withTenantContext } from "../tenant/context.js";
import type { CreateSupportTicketInput, SupportAdminActionInput } from "./schemas.js";

function ownerContext(userId: string) {
  return { userId, tenantId: null, platformRole: null } as const;
}

function adminContext(userId: string) {
  return { userId, tenantId: null, platformRole: "SUPER_ADMIN" as const };
}

export async function createSupportTicket(userId: string, input: CreateSupportTicketInput) {
  return withTenantContext(ownerContext(userId), async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        ownerUserId: userId,
        subject: input.subject,
        category: input.category,
        status: "NEW",
      },
      select: { id: true, status: true, subject: true, category: true, createdAt: true },
    });
    const message = await tx.supportTicketMessage.create({
      data: { ticketId: ticket.id, authorUserId: userId, body: input.body },
      select: { id: true, body: true, createdAt: true },
    });
    await tx.supportTicketActivity.create({
      data: {
        ticketId: ticket.id,
        actorUserId: userId,
        eventType: "CREATED",
        toStatus: "NEW",
        note: "Destek talebi oluşturuldu.",
      },
    });
    await notifySuperAdmins(tx, {
      actorUserId: userId,
      eventKey: `support-ticket:${ticket.id}:created`,
      kind: "SUPPORT_TICKET_CREATED",
      targetType: "SUPPORT_TICKET",
      targetId: ticket.id,
    });
    return { ticket, message };
  });
}

export async function listUserSupportTickets(input: {
  userId: string;
  page: number;
  pageSize: number;
}) {
  return withTenantContext(ownerContext(input.userId), async (tx) => {
    const where = { ownerUserId: input.userId };
    const [items, total] = await Promise.all([
      tx.supportTicket.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          subject: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { body: true, createdAt: true },
          },
        },
      }),
      tx.supportTicket.count({ where }),
    ]);
    return {
      items: items.map(({ _count, messages, ...ticket }) => ({
        ...ticket,
        messageCount: _count.messages,
        lastMessage: messages[0] ?? null,
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  });
}

export async function listAdminSupportTickets(input: {
  actorUserId: string;
  status: string;
  page: number;
  pageSize: number;
}) {
  return withTenantContext(adminContext(input.actorUserId), async (tx) => {
    const where = input.status === "ALL" ? {} : { status: input.status };
    const [rows, total] = await Promise.all([
      tx.supportTicket.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          subject: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          owner: { select: { displayName: true } },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { body: true, createdAt: true },
          },
        },
      }),
      tx.supportTicket.count({ where }),
    ]);
    const unreadTargets = await tx.notification.findMany({
      where: {
        recipientUserId: input.actorUserId,
        recipientAudience: "SUPER_ADMIN",
        targetType: "SUPPORT_TICKET",
        targetId: { in: rows.map((row) => row.id) },
        readAt: null,
      },
      select: { targetId: true },
    });
    const unread = new Set(unreadTargets.map((item) => item.targetId));
    return {
      items: rows.map(({ owner, messages, ...ticket }) => ({
        ...ticket,
        userDisplayName: owner.displayName,
        lastMessage: messages[0] ?? null,
        unread: unread.has(ticket.id),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  });
}

export async function getSupportTicketDetail(input: {
  actorUserId: string;
  ticketId: string;
  isSuperAdmin: boolean;
}) {
  const context = input.isSuperAdmin
    ? adminContext(input.actorUserId)
    : ownerContext(input.actorUserId);
  const ticket = await withTenantContext(context, (tx) =>
    tx.supportTicket.findFirst({
      where: {
        id: input.ticketId,
        ...(input.isSuperAdmin ? {} : { ownerUserId: input.actorUserId }),
      },
      select: {
        id: true,
        subject: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        ...(input.isSuperAdmin ? { owner: { select: { displayName: true } } } : {}),
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            body: true,
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
  if (!ticket) throw notFoundError("Destek talebi bulunamadı");
  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      ...(ticket.owner ? { userDisplayName: ticket.owner.displayName } : {}),
    },
    messages: ticket.messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorLabel:
        message.author.platformRole === "SUPER_ADMIN" && !input.isSuperAdmin
          ? "OkuPratik Destek"
          : message.author.displayName,
    })),
    activities: ticket.activities.map((activity) => ({
      id: activity.id,
      eventType: activity.eventType,
      fromStatus: activity.fromStatus,
      toStatus: activity.toStatus,
      note: activity.note,
      createdAt: activity.createdAt,
      actorLabel:
        activity.actor?.platformRole === "SUPER_ADMIN" && !input.isSuperAdmin
          ? "OkuPratik Destek"
          : (activity.actor?.displayName ?? "OkuPratik"),
    })),
  };
}

export async function replyToSupportTicket(input: {
  userId: string;
  ticketId: string;
  body: string;
}) {
  return withTenantContext(ownerContext(input.userId), async (tx) => {
    const current = await tx.supportTicket.findFirst({
      where: { id: input.ticketId, ownerUserId: input.userId },
      select: { id: true, status: true, updatedAt: true },
    });
    if (!current) throw notFoundError("Destek talebi bulunamadı");
    const nextStatus = ["WAITING_FOR_USER", "RESOLVED", "CLOSED"].includes(current.status)
      ? "IN_PROGRESS"
      : current.status;
    const updated = await tx.supportTicket.updateMany({
      where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
      data: { status: nextStatus, closedAt: null, updatedAt: new Date() },
    });
    if (updated.count !== 1)
      throw conflictError("Talep aynı anda güncellendi; yeniden yükleyip dene");
    if (nextStatus !== current.status) {
      await tx.supportTicketActivity.create({
        data: {
          ticketId: current.id,
          actorUserId: input.userId,
          eventType: "STATUS_CHANGED",
          fromStatus: current.status,
          toStatus: nextStatus,
          note: "Kullanıcı yanıtı ile talep yeniden açıldı.",
        },
      });
    }
    const message = await tx.supportTicketMessage.create({
      data: { ticketId: current.id, authorUserId: input.userId, body: input.body },
      select: { id: true, createdAt: true },
    });
    await notifySuperAdmins(tx, {
      actorUserId: input.userId,
      eventKey: `support-ticket:${current.id}:user-message:${message.id}`,
      kind: "SUPPORT_TICKET_USER_MESSAGE",
      targetType: "SUPPORT_TICKET",
      targetId: current.id,
    });
    return { ticketId: current.id, status: nextStatus, message };
  });
}

const SUPPORT_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ["IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "CLOSED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: ["IN_PROGRESS"],
};

export async function applyAdminSupportAction(input: {
  actorUserId: string;
  ticketId: string;
  action: SupportAdminActionInput;
}) {
  return withTenantContext(adminContext(input.actorUserId), async (tx) => {
    const current = await tx.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, ownerUserId: true, status: true, updatedAt: true },
    });
    if (!current) throw notFoundError("Destek talebi bulunamadı");
    const nextStatus =
      input.action.status ?? (input.action.message ? "WAITING_FOR_USER" : current.status);
    if (
      nextStatus !== current.status &&
      !SUPPORT_TRANSITIONS[current.status]?.includes(nextStatus)
    ) {
      throw conflictError("Bu destek talebinde bu durum geçişine izin verilmiyor");
    }
    const statusChanged = nextStatus !== current.status;
    const actionUpdatedAt = new Date();
    if (nextStatus !== current.status) {
      const updated = await tx.supportTicket.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: {
          status: nextStatus,
          closedAt: nextStatus === "CLOSED" ? new Date() : null,
          updatedAt: actionUpdatedAt,
        },
      });
      if (updated.count !== 1)
        throw conflictError("Talep aynı anda güncellendi; yeniden yükleyip tekrar deneyin");
      await tx.supportTicketActivity.create({
        data: {
          ticketId: current.id,
          actorUserId: input.actorUserId,
          eventType: "STATUS_CHANGED",
          fromStatus: current.status,
          toStatus: nextStatus,
          note: "Destek talebinin durumu güncellendi.",
        },
      });
    } else if (input.action.message || input.action.internalNote) {
      const updated = await tx.supportTicket.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: { updatedAt: actionUpdatedAt },
      });
      if (updated.count !== 1)
        throw conflictError("Talep aynı anda güncellendi; yeniden yükleyip tekrar deneyin");
    }
    if (input.action.internalNote) {
      await tx.supportTicketActivity.create({
        data: {
          ticketId: current.id,
          actorUserId: input.actorUserId,
          eventType: "INTERNAL_NOTE",
          note: input.action.internalNote,
          visibleToUser: false,
        },
      });
    }
    let messageId: string | null = null;
    if (input.action.message) {
      const message = await tx.supportTicketMessage.create({
        data: { ticketId: current.id, authorUserId: input.actorUserId, body: input.action.message },
        select: { id: true },
      });
      messageId = message.id;
    }
    if (statusChanged || messageId) {
      await notifyUser(tx, {
        actorUserId: input.actorUserId,
        recipientUserId: current.ownerUserId,
        eventKey:
          messageId !== null
            ? `support-ticket:${current.id}:admin-message:${messageId}`
            : `support-ticket:${current.id}:admin-status:${actionUpdatedAt.toISOString()}:${nextStatus}`,
        kind: "SUPPORT_TICKET_UPDATED",
        title: "Destek talebinde güncelleme",
        body: "Destek talebinin durumu güncellendi veya sana yeni bir yanıt gönderildi.",
        targetType: "SUPPORT_TICKET",
        targetId: current.id,
      });
    }
    return { ticketId: current.id, status: nextStatus };
  });
}
