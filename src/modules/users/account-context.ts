import type { EntitlementPlan, EntitlementScope, TenantType } from "@prisma/client";

export type AdminEntitlementStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE" | "INVALID";

export interface AdminEntitlementRecord {
  id: string;
  userId: string | null;
  tenantId: string;
  scope: EntitlementScope;
  plan: EntitlementPlan;
  active: boolean;
  source: string;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

export function adminEntitlementStatus(
  entitlement: AdminEntitlementRecord,
  now = new Date(),
): AdminEntitlementStatus {
  if (entitlement.expiresAt && entitlement.expiresAt <= entitlement.effectiveAt) return "INVALID";
  if (!entitlement.active) return "INACTIVE";
  if (entitlement.effectiveAt > now) return "SCHEDULED";
  if (entitlement.expiresAt && entitlement.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

export function entitlementForAccountContext(
  records: AdminEntitlementRecord[],
  context: { userId: string; tenantId: string; tenantType: TenantType },
  now = new Date(),
): (AdminEntitlementRecord & { adminStatus: AdminEntitlementStatus }) | null {
  const scope: EntitlementScope = context.tenantType === "INDIVIDUAL" ? "PERSONAL" : "ORGANIZATION";
  const matching = records
    .filter(
      (record) =>
        record.tenantId === context.tenantId &&
        record.scope === scope &&
        (scope === "PERSONAL" ? record.userId === context.userId : record.userId === null),
    )
    .sort(
      (left, right) =>
        right.effectiveAt.getTime() - left.effectiveAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    );

  const current = matching.find((record) => adminEntitlementStatus(record, now) === "ACTIVE");
  if (current) return { ...current, adminStatus: "ACTIVE" };

  const scheduled = matching
    .filter((record) => adminEntitlementStatus(record, now) === "SCHEDULED")
    .sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime())[0];
  if (scheduled) return { ...scheduled, adminStatus: "SCHEDULED" };

  const latest = matching[0];
  return latest ? { ...latest, adminStatus: adminEntitlementStatus(latest, now) } : null;
}
