import type { Prisma, AuditAction } from "@prisma/client";
import type { LifecycleAuditEntry } from "./lifecycle.js";

/**
 * Writes only lifecycle metadata to the existing append-only AuditLog.
 * Content bodies, stems, options and answers are intentionally excluded.
 */
export async function writeLifecycleAudit(
  tx: Prisma.TransactionClient,
  entry: LifecycleAuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action as AuditAction,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? undefined,
      after: entry.after,
    },
  });
}
