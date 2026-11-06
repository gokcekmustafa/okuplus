import { Prisma, type Membership, type TenantType, type User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError, validationError } from "../../lib/errors.js";
import { ScryptPasswordHasher } from "../auth/index.js";
import { entitlementPlanFeatureLabels } from "../entitlements/service.js";
import {
  provisionPersonalContextInTransaction,
  restoreDeletedPersonalContextInTransaction,
} from "../tenant/personal-service.js";
import {
  adminEntitlementStatus,
  entitlementForAccountContext,
  type AdminEntitlementRecord,
} from "./account-context.js";
import { withTenantContext } from "../tenant/context.js";
import type {
  CreateUserInput,
  ListDeletedUsersQuery,
  ListUsersQuery,
  ResetUserPasswordInput,
  UpdateUserInput,
} from "./schemas.js";

/**
 * User + Membership yönetimi servisi (yalnızca SUPER_ADMIN için).
 *
 * RLS: Tenant tablosunda RLS yoktur; User/Membership tablolarında RLS vardır
 * ancak prisma singleton süper kullanıcı olarak bağlandığından BYPASSRLS ile
 * çalışır (mevcut mimari — RLS'i bypass eden yeni bir yöntem yoktur). Erişim
 * route katmanındaki requirePlatformRole guard'ıyla sınırlanır.
 */

const hasher = new ScryptPasswordHasher();

const USER_LIST_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  birthYear: true,
  status: true,
  platformRole: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    select: {
      role: true,
      status: true,
      deletedAt: true,
      tenant: { select: { id: true, name: true, type: true, status: true, deletedAt: true } },
    },
  },
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  nationalId: true,
  birthYear: true,
  status: true,
  platformRole: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

export interface UserListItem {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  birthYear: number | null;
  status: User["status"];
  platformRole: User["platformRole"];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  membershipCount: number;
  accountContexts: UserAccountContext[];
  unlinkedPackageRights: Array<{
    id: string;
    plan: string;
    source: string;
    status: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE" | "INVALID";
    tenantName: string;
    tenantType: TenantType;
  }>;
  roleConnections: Array<{
    role: Membership["role"];
    status: Membership["status"];
    tenantName: string;
    tenantType: string;
    tenantStatus: string;
  }>;
}

export interface UserDetail {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  birthYear: number | null;
  status: User["status"];
  platformRole: User["platformRole"];
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  memberships: MembershipSummary[];
  personalContexts: Array<{
    tenantId: string;
    tenantName: string;
    tenantStatus: string;
    tenantDeleted: boolean;
    membershipRole: Membership["role"];
    membershipStatus: Membership["status"];
    membershipDeleted: boolean;
    createdAt: Date;
  }>;
  accountContexts: UserAccountContext[];
  branches: UserBranchSummary[];
  classAssignments: UserClassAssignmentSummary[];
  enrollments: UserEnrollmentSummary[];
  entitlements: UserEntitlementSummary[];
  billingSubscriptions: UserBillingSubscriptionSummary[];
  billingPayments: UserBillingPaymentSummary[];
  activity: UserActivitySummary[];
}

export interface UserAdminReadActor {
  userId: string;
  platformRole: "SUPER_ADMIN";
}

export interface UserAccountContext {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantStatus: string;
  tenantDeleted: boolean;
  memberships: Array<{ role: Membership["role"]; status: Membership["status"]; deleted: boolean }>;
  packageRight: {
    id: string | null;
    plan: string;
    source: string;
    status: "DEFAULT" | "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE" | "INVALID";
    effectiveAt: Date | null;
    expiresAt: Date | null;
    features: string[];
  };
}

export interface UserBranchSummary {
  id: string;
  name: string;
  tenantId: string;
  tenantName: string;
  status: string;
}

export interface UserClassAssignmentSummary {
  id: string;
  classId: string;
  className: string;
  tenantId: string;
  tenantName: string;
  branchName: string;
  academicYearName: string;
  status: string;
  subject: string | null;
}

export interface UserEnrollmentSummary {
  id: string;
  classId: string;
  className: string;
  tenantId: string;
  tenantName: string;
  branchName: string;
  academicYearName: string;
  status: string;
  enrolledAt: Date;
  leftAt: Date | null;
}

export interface UserEntitlementSummary {
  id: string;
  userId: string | null;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  scope: string;
  plan: string;
  active: boolean;
  source: string;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  adminStatus: ReturnType<typeof adminEntitlementStatus>;
  features: string[];
}

export interface UserBillingSubscriptionSummary {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  status: string;
  billingPeriod: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelRequestedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
}

export interface UserBillingPaymentSummary {
  tenantId: string;
  tenantName: string;
  status: string;
  amountMinor: number | null;
  currency: string | null;
  occurredAt: Date | null;
  createdAt: Date;
}

export interface UserActivitySummary {
  action: string;
  entityType: string;
  createdAt: Date;
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  tenantStatus: string;
  role: Membership["role"];
  status: Membership["status"];
  deleted: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface UserListResult {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listUsers(query: ListUsersQuery): Promise<UserListResult> {
  return listUsersByDeletionState(query, false);
}

export async function listDeletedUsers(query: ListDeletedUsersQuery): Promise<UserListResult> {
  return listUsersByDeletionState({ ...query, segment: undefined }, true);
}

async function listUsersByDeletionState(
  query: ListUsersQuery,
  deleted: boolean,
): Promise<UserListResult> {
  const { search, status, tenantType, membershipStatus, segment, page, pageSize } = query;

  const filters: Prisma.UserWhereInput[] = [{ deletedAt: deleted ? { not: null } : null }];
  // The default customer view must never mix platform operators with users.
  // Platform users remain available through the explicit Platform segment.
  if (!deleted && segment !== "PLATFORM") filters.push({ platformRole: null });
  if (status) filters.push({ status });
  if (search) {
    filters.push({
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { memberships: { some: { tenant: { name: { contains: search, mode: "insensitive" } } } } },
      ],
    });
  }
  if (tenantType || membershipStatus) {
    filters.push({
      memberships: {
        some: {
          ...(membershipStatus ? { status: membershipStatus } : {}),
          ...(tenantType ? { tenant: { type: tenantType } } : {}),
        },
      },
    });
  }
  if (segment === "PLATFORM") filters.push({ platformRole: { not: null } });
  const activeOrganizationMembership: Prisma.MembershipWhereInput = {
    status: "ACTIVE",
    deletedAt: null,
    tenant: { type: "ORGANIZATION", status: "ACTIVE", deletedAt: null },
  };
  const activeAccountMembership: Prisma.MembershipWhereInput = {
    status: "ACTIVE",
    deletedAt: null,
    tenant: { status: "ACTIVE", deletedAt: null },
  };
  if (segment === "INDIVIDUAL") {
    filters.push({
      platformRole: null,
      memberships: { some: { tenant: { type: "INDIVIDUAL" } } },
      NOT: { memberships: { some: activeOrganizationMembership } },
    });
  }
  if (segment === "ORGANIZATION") {
    filters.push({
      platformRole: null,
      memberships: { some: activeOrganizationMembership },
    });
  }
  if (segment === "UNLINKED") {
    filters.push({
      platformRole: null,
      memberships: {
        none: activeAccountMembership,
      },
    });
  }
  const where: Prisma.UserWhereInput = { AND: filters };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const userIds = rows.map((row) => row.id);
  const tenantIds = [
    ...new Set(rows.flatMap((row) => row.memberships.map((item) => item.tenant.id))),
  ];
  const entitlementRows = await findAccountEntitlements(userIds, tenantIds);
  const now = new Date();
  return {
    items: rows.map(({ memberships, ...u }) => {
      const organizationMemberships = memberships.filter(
        (membership) =>
          membership.tenant.type === "ORGANIZATION" &&
          membership.deletedAt === null &&
          membership.status !== "REMOVED" &&
          membership.tenant.deletedAt === null,
      );
      const accountContexts = toAccountContexts(u.id, memberships, entitlementRows, now);
      const linkedEntitlementIds = new Set(
        accountContexts.map((context) => context.packageRight.id).filter(Boolean),
      );
      const unlinkedPackageRights = entitlementRows
        .filter((item) => item.userId === u.id && !linkedEntitlementIds.has(item.id))
        .map((item) => ({
          id: item.id,
          plan: item.plan,
          source: item.source,
          status: adminEntitlementStatus(item, now),
          tenantName: item.tenant.name,
          tenantType: item.tenant.type,
        }));
      return {
        ...u,
        membershipCount: organizationMemberships.length,
        accountContexts,
        unlinkedPackageRights,
        roleConnections: organizationMemberships.map((membership) => ({
          role: membership.role,
          status: membership.status,
          tenantName: membership.tenant.name,
          tenantType: membership.tenant.type,
          tenantStatus: membership.tenant.status,
        })),
      };
    }),
    total,
    page,
    pageSize,
  };
}

async function findAccountEntitlements(userIds: string[], tenantIds: string[]) {
  if (userIds.length === 0 && tenantIds.length === 0) return [];
  return prisma.entitlement.findMany({
    where: {
      OR: [
        ...(userIds.length ? [{ userId: { in: userIds }, scope: "PERSONAL" as const }] : []),
        ...(tenantIds.length
          ? [{ tenantId: { in: tenantIds }, scope: "ORGANIZATION" as const, userId: null }]
          : []),
      ],
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      scope: true,
      plan: true,
      active: true,
      source: true,
      effectiveAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      tenant: { select: { name: true, type: true } },
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
}

function toAccountContext(
  context: Parameters<typeof entitlementForAccountContext>[1] & {
    tenantName: string;
    tenantStatus: string;
    tenantDeleted: boolean;
    memberships: Array<{
      role: Membership["role"];
      status: Membership["status"];
      deleted: boolean;
    }>;
  },
  entitlementRows: AdminEntitlementRecord[],
  now: Date,
): UserAccountContext {
  const entitlement = entitlementForAccountContext(entitlementRows, context, now);
  const contextIsAccessible =
    !context.tenantDeleted &&
    context.tenantStatus === "ACTIVE" &&
    context.memberships.some((membership) => membership.status === "ACTIVE" && !membership.deleted);
  return {
    tenantId: context.tenantId,
    tenantName: context.tenantDeleted ? `${context.tenantName} (silindi)` : context.tenantName,
    tenantType: context.tenantType,
    tenantStatus: context.tenantStatus,
    tenantDeleted: context.tenantDeleted,
    memberships: context.memberships,
    packageRight: entitlement
      ? {
          id: entitlement.id,
          plan: entitlement.plan,
          source: entitlement.source,
          status: contextIsAccessible ? entitlement.adminStatus : "INACTIVE",
          effectiveAt: entitlement.effectiveAt,
          expiresAt: entitlement.expiresAt,
          features: entitlementPlanFeatureLabels(entitlement.plan),
        }
      : {
          id: null,
          plan: "PLAN_FREE",
          source: "DEFAULT",
          status: contextIsAccessible ? "DEFAULT" : "INACTIVE",
          effectiveAt: null,
          expiresAt: null,
          features: entitlementPlanFeatureLabels("PLAN_FREE"),
        },
  };
}

function toAccountContexts(
  userId: string,
  rows: Array<{
    role: Membership["role"];
    status: Membership["status"];
    deletedAt: Date | null;
    tenant: {
      id: string;
      name: string;
      type: TenantType;
      status: string;
      deletedAt: Date | null;
    };
  }>,
  entitlementRows: AdminEntitlementRecord[],
  now: Date,
): UserAccountContext[] {
  const contexts = new Map<string, Parameters<typeof toAccountContext>[0]>();
  for (const row of rows) {
    const current = contexts.get(row.tenant.id);
    if (current) {
      current.memberships.push({
        role: row.role,
        status: row.status,
        deleted: row.deletedAt !== null,
      });
      continue;
    }
    contexts.set(row.tenant.id, {
      userId,
      tenantId: row.tenant.id,
      tenantName: row.tenant.name,
      tenantType: row.tenant.type,
      tenantStatus: row.tenant.status,
      tenantDeleted: row.tenant.deletedAt !== null,
      memberships: [{ role: row.role, status: row.status, deleted: row.deletedAt !== null }],
    });
  }
  return [...contexts.values()]
    .sort((left, right) => left.tenantName.localeCompare(right.tenantName, "tr"))
    .map((context) => {
      context.memberships.sort(
        (left, right) =>
          left.role.localeCompare(right.role) || left.status.localeCompare(right.status),
      );
      return toAccountContext(context, entitlementRows, now);
    });
}

export async function getUser(id: string, actor: UserAdminReadActor): Promise<UserDetail> {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: USER_DETAIL_SELECT,
  });

  if (!user) {
    throw notFoundError("Kullanıcı bulunamadı");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: id },
    select: {
      id: true,
      role: true,
      status: true,
      deletedAt: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          deletedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const tenantIds = memberships.map((membership) => membership.tenant.id);
  const [branches, classAssignments, enrollments, entitlements] = await Promise.all([
    prisma.teacherBranchMembership.findMany({
      where: { teacherId: id },
      select: {
        id: true,
        status: true,
        branch: { select: { id: true, name: true, tenant: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teacherClassAssignment.findMany({
      where: { teacherId: id },
      select: {
        id: true,
        status: true,
        subject: true,
        class: {
          select: {
            id: true,
            name: true,
            branch: { select: { name: true } },
            academicYear: { select: { name: true } },
            tenant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.enrollment.findMany({
      where: { studentId: id },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        leftAt: true,
        class: {
          select: {
            id: true,
            name: true,
            branch: { select: { name: true } },
            academicYear: { select: { name: true } },
            tenant: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.entitlement.findMany({
      where: {
        OR: [
          { userId: id },
          ...(tenantIds.length
            ? [{ tenantId: { in: tenantIds }, scope: "ORGANIZATION" as const, userId: null }]
            : []),
        ],
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        scope: true,
        plan: true,
        active: true,
        source: true,
        effectiveAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        tenant: { select: { name: true, type: true } },
      },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const [billingSubscriptions, billingPayments] = tenantIds.length
    ? await withTenantContext(
        { userId: actor.userId, tenantId: null, platformRole: actor.platformRole },
        async (tx) =>
          Promise.all([
            tx.billingSubscription.findMany({
              where: { userId: id, tenantId: { in: tenantIds } },
              select: {
                tenantId: true,
                status: true,
                billingPeriod: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                cancelRequestedAt: true,
                canceledAt: true,
                createdAt: true,
                tenant: { select: { name: true, type: true } },
              },
              orderBy: { createdAt: "desc" },
            }),
            tx.billingPayment.findMany({
              where: { userId: id, tenantId: { in: tenantIds } },
              select: {
                tenantId: true,
                status: true,
                amountMinor: true,
                currency: true,
                occurredAt: true,
                createdAt: true,
                tenant: { select: { name: true } },
              },
              orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
              take: 10,
            }),
          ]),
      )
    : [[], []];

  const activityEntityIds = [
    id,
    ...memberships.map((membership) => membership.id),
    ...entitlements.map((item) => item.id),
  ];
  const personalContextTenantIds = memberships
    .filter((membership) => membership.tenant.type === "INDIVIDUAL")
    .map((membership) => membership.tenant.id);
  const activity = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityId: { in: activityEntityIds } },
        ...(personalContextTenantIds.length
          ? [
              {
                entityType: "PERSONAL_CONTEXT_RECOVERY",
                entityId: { in: personalContextTenantIds },
              },
            ]
          : []),
      ],
    },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const now = new Date();
  return {
    ...user,
    accountContexts: toAccountContexts(id, memberships, entitlements, now),
    memberships: memberships
      .filter((membership) => membership.tenant.type === "ORGANIZATION")
      .map(({ tenant, ...m }) => ({
        id: m.id,
        tenantId: tenant.id,
        tenantName: tenant.deletedAt ? `${tenant.name} (silindi)` : tenant.name,
        tenantType: tenant.type,
        tenantStatus: tenant.status,
        tenantDeleted: tenant.deletedAt !== null,
        role: m.role,
        status: m.status,
        deleted: m.deletedAt !== null,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        createdAt: m.createdAt,
      })),
    personalContexts: memberships
      .filter((membership) => membership.tenant.type === "INDIVIDUAL")
      .map((membership) => ({
        tenantId: membership.tenant.id,
        tenantName: membership.tenant.name,
        tenantStatus: membership.tenant.status,
        tenantDeleted: membership.tenant.deletedAt !== null,
        membershipRole: membership.role,
        membershipStatus: membership.status,
        membershipDeleted: membership.deletedAt !== null,
        createdAt: membership.tenant.createdAt,
      })),
    branches: branches.map((item) => ({
      id: item.id,
      name: item.branch.name,
      tenantId: item.branch.tenant.id,
      tenantName: item.branch.tenant.name,
      status: item.status,
    })),
    classAssignments: classAssignments.map((item) => ({
      id: item.id,
      classId: item.class.id,
      className: item.class.name,
      tenantId: item.class.tenant.id,
      tenantName: item.class.tenant.name,
      branchName: item.class.branch.name,
      academicYearName: item.class.academicYear.name,
      status: item.status,
      subject: item.subject,
    })),
    enrollments: enrollments.map((item) => ({
      id: item.id,
      classId: item.class.id,
      className: item.class.name,
      tenantId: item.class.tenant.id,
      tenantName: item.class.tenant.name,
      branchName: item.class.branch.name,
      academicYearName: item.class.academicYear.name,
      status: item.status,
      enrolledAt: item.enrolledAt,
      leftAt: item.leftAt,
    })),
    entitlements: entitlements.map((item) => ({
      id: item.id,
      userId: item.userId,
      tenantId: item.tenantId,
      tenantName: item.tenant.name,
      tenantType: item.tenant.type,
      scope: item.scope,
      plan: item.plan,
      active: item.active,
      source: item.source,
      effectiveAt: item.effectiveAt,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      adminStatus: adminEntitlementStatus(item, now),
      features: entitlementPlanFeatureLabels(item.plan),
    })),
    billingSubscriptions: billingSubscriptions.map((item) => ({
      tenantId: item.tenantId,
      tenantName: item.tenant.name,
      tenantType: item.tenant.type,
      status: item.status,
      billingPeriod: item.billingPeriod,
      currentPeriodStart: item.currentPeriodStart,
      currentPeriodEnd: item.currentPeriodEnd,
      cancelRequestedAt: item.cancelRequestedAt,
      canceledAt: item.canceledAt,
      createdAt: item.createdAt,
    })),
    billingPayments: billingPayments.map((item) => ({
      tenantId: item.tenantId,
      tenantName: item.tenant.name,
      status: item.status,
      amountMinor: item.amountMinor,
      currency: item.currency,
      occurredAt: item.occurredAt,
      createdAt: item.createdAt,
    })),
    activity,
  };
}

/**
 * Restore only the same soft-deleted personal tenant when its original active
 * student membership and profile prove exclusive ownership. No membership,
 * profile, entitlement, or learning record is recreated or moved.
 */
export async function restoreUserPersonalContext(
  userId: string,
  tenantId: string,
  actor: UserAdminReadActor,
) {
  const result = await prisma.$transaction((tx) =>
    restoreDeletedPersonalContextInTransaction(tx, userId, tenantId, actor.userId),
  );
  if (result.status === "RESTORED") return result;
  if (result.status === "DELETION_REQUEST_OPEN") {
    throw conflictError("Açık hesap silme talebi var; kişisel alan geri yüklenmedi");
  }
  if (result.status === "DELETION_CHECK_UNAVAILABLE") {
    throw conflictError("Silme talebi durumu doğrulanamadı; kişisel alan geri yüklenmedi");
  }
  if (result.status === "AMBIGUOUS") {
    throw conflictError(
      "Kişisel alan bağlantıları tekil olarak doğrulanamadı; kayıtlar değiştirilmedi",
    );
  }
  throw conflictError("Geri yüklenebilir kişisel alan bulunamadı; kayıtlar değiştirilmedi");
}

export async function createUser(
  input: CreateUserInput,
  actor: UserAdminReadActor,
): Promise<UserDetail> {
  const passwordHash = await hasher.hash(input.password);

  try {
    const userId = await prisma.$transaction(async (tx) => {
      const status = input.status ?? "ACTIVE";
      if (input.accountType === "INDIVIDUAL" && status !== "ACTIVE") {
        throw validationError("Bireysel hesap için etkin hesap durumu seçilmelidir");
      }

      let organizationTenant: { id: string; type: TenantType } | null = null;
      if (input.accountType === "ORGANIZATION") {
        organizationTenant = await tx.tenant.findFirst({
          where: { id: input.tenantId, type: "ORGANIZATION", status: "ACTIVE", deletedAt: null },
          select: { id: true, type: true },
        });
        if (!organizationTenant || !input.membershipRole) {
          throw validationError("Etkin bir kurum ve kullanıcı rolü seçilmelidir");
        }
      }

      const created = await tx.user.create({
        data: {
          displayName: input.displayName,
          email: input.email,
          ...(input.phone !== undefined && input.phone !== null ? { phone: input.phone } : {}),
          ...(input.birthYear !== undefined && input.birthYear !== null
            ? { birthYear: input.birthYear }
            : {}),
          status,
          passwordHash,
        },
        select: { id: true },
      });

      if (input.accountType === "INDIVIDUAL") {
        await provisionPersonalContextInTransaction(tx, created.id);
      } else {
        const tenantId = organizationTenant!.id;
        await tx.membership.create({
          data: {
            tenantId,
            userId: created.id,
            role: input.membershipRole!,
            status: status === "ACTIVE" ? "ACTIVE" : status === "INVITED" ? "PENDING" : "INACTIVE",
            startedAt: status === "ACTIVE" ? new Date() : null,
          },
        });
      }

      return created.id;
    });
    return await getUser(userId, actor);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflictError(uniqueViolationMessage());
    }
    throw err;
  }
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: UserAdminReadActor,
): Promise<UserDetail> {
  const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw notFoundError("Kullanıcı bulunamadı");
  }

  const data: Prisma.UserUpdateInput = {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.birthYear !== undefined ? { birthYear: input.birthYear } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };

  try {
    await prisma.user.update({
      where: { id },
      data,
      select: USER_DETAIL_SELECT,
    });
    return await getUser(id, actor);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflictError(uniqueViolationMessage());
    }
    throw err;
  }
}

export async function softDeleteUser(
  id: string,
  actorUserId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, platformRole: true },
  });
  if (!existing) {
    throw notFoundError("Kullanıcı bulunamadı");
  }
  if (existing.platformRole !== null) {
    throw conflictError("Platform yöneticisi hesapları kullanıcı listesinden silinemez");
  }
  if (actorUserId === id) {
    throw conflictError("Kendi hesabınızı yönetim panelinden silemezsiniz");
  }

  return prisma.$transaction(async (tx) => {
    const deletedAt = new Date();
    const updated = await tx.user.update({
      where: { id },
      data: { deletedAt },
      select: { id: true, deletedAt: true },
    });
    if (updated.deletedAt === null) {
      throw new Error("softDeleteUser: deletedAt set edilemedi");
    }
    await tx.authSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: deletedAt },
    });
    await tx.auditLog.create({
      data: {
        tenantId: null,
        actorUserId,
        action: "DELETE",
        entityType: "USER_SOFT_DELETE",
        entityId: id,
        before: { deletedAt: null },
        after: { deletedAt: deletedAt.toISOString(), recoverable: true },
      },
    });
    return { id: updated.id, deletedAt };
  });
}

export async function restoreDeletedUser(
  id: string,
  actorUserId: string,
): Promise<{ id: string; deletedAt: null }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { id: true, deletedAt: true },
    });
    if (!existing) throw notFoundError("Silinen kullanıcı bulunamadı");

    const restored = await tx.user.update({
      where: { id },
      data: { deletedAt: null },
      select: { id: true, deletedAt: true },
    });
    if (restored.deletedAt !== null) {
      throw new Error("restoreDeletedUser: deletedAt temizlenemedi");
    }
    // Oturumlar geri açılmaz; kullanıcı yeniden giriş yapmalıdır.
    await tx.authSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        tenantId: null,
        actorUserId,
        action: "UPDATE",
        entityType: "USER_RESTORED",
        entityId: id,
        before: { deletedAt: existing.deletedAt?.toISOString() ?? null },
        after: { deletedAt: null },
      },
    });
    return { id: restored.id, deletedAt: null };
  });
}

export async function permanentlyDeleteUser(
  id: string,
  actorUserId: string,
): Promise<{ id: string; permanentlyDeleted: true }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, deletedAt: { not: null } },
        select: { id: true, deletedAt: true, platformRole: true },
      });
      if (!existing) throw notFoundError("Silinen kullanıcı bulunamadı");
      if (existing.platformRole !== null) {
        throw conflictError("Platform yöneticisi hesapları kalıcı olarak silinemez");
      }
      if (actorUserId === id) {
        throw conflictError("Kendi hesabınızı kalıcı olarak silemezsiniz");
      }

      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: null,
          actorUserId,
          action: "DELETE",
          entityType: "USER_PERMANENT_DELETE",
          entityId: id,
          before: { deletedAt: existing.deletedAt?.toISOString() ?? null },
          after: { permanentlyDeleted: true },
        },
      });
      return { id, permanentlyDeleted: true };
    });
  } catch (error) {
    const prismaCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    const message = error instanceof Error ? error.message : "";
    const restrictedByRelatedData =
      prismaCode === "P2003" ||
      prismaCode === "P2014" ||
      (message.includes('PostgresError { code: "23001"') &&
        message.includes("violates RESTRICT setting of foreign key constraint"));
    if (restrictedByRelatedData) {
      throw conflictError(
        "Kullanıcıya bağlı öğrenci, kurum, ödeme veya saklanması gereken kayıtlar var. Veriler korunarak kalıcı silme tamamlanamadı.",
      );
    }
    throw error;
  }
}

export async function resetUserPassword(
  id: string,
  input: ResetUserPasswordInput,
  actorUserId: string,
): Promise<{ id: string; updated: true }> {
  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFoundError("Kullanıcı bulunamadı");
  const passwordHash = await hasher.hash(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await tx.auditLog.create({
      data: {
        tenantId: null,
        actorUserId,
        action: "UPDATE",
        entityType: "USER_PASSWORD",
        entityId: id,
        before: { changed: true },
        after: { changed: true },
      },
    });
  });
  return { id, updated: true };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function uniqueViolationMessage(): string {
  return "Bu e-posta adresi zaten kullanımda";
}
