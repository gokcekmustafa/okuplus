import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError, conflictError } from "../../lib/errors.js";

export type PersonalContextLookupDiagnosticCode =
  | "PERSONAL_CONTEXT_USER_MISSING_OR_NOT_VISIBLE"
  | "PERSONAL_CONTEXT_ACCOUNT_INACTIVE"
  | "PERSONAL_CONTEXT_ACCOUNT_DELETED"
  | "PERSONAL_CONTEXT_ACCOUNT_STATE_CHANGED"
  | "PERSONAL_CONTEXT_USER_LOOKUP_FAILED";

/** Fixed-label failure for the initial user lookup; never retains DB error text. */
export class PersonalContextLookupError extends ApiError {
  constructor(readonly diagnosticCode: PersonalContextLookupDiagnosticCode) {
    const lookupFailed = diagnosticCode === "PERSONAL_CONTEXT_USER_LOOKUP_FAILED";
    super(
      lookupFailed ? "SERVICE_UNAVAILABLE" : "NOT_FOUND",
      lookupFailed ? "Kişisel kullanıcı alanı şu anda hazırlanamadı" : "Aktif kullanıcı bulunamadı",
      lookupFailed ? 503 : 404,
    );
    this.name = "PersonalContextLookupError";
  }
}

export interface PersonalContext {
  userId: string;
  tenantId: string;
  tenantType: "INDIVIDUAL";
  tenantName: string;
  membershipId: string;
  membershipRole: "STUDENT";
  membershipStatus: "ACTIVE";
  studentProfileId: string;
}

export type PersonalContextRecoveryResult =
  | { status: "RESTORED"; tenantId: string }
  | { status: "NOT_APPLICABLE" }
  | { status: "AMBIGUOUS" }
  | { status: "DELETION_REQUEST_OPEN" };

const OPEN_ACCOUNT_DELETION_STATUSES = [
  "RECEIVED",
  "IDENTITY_REQUIRED",
  "AUTHORITY_REVIEW",
  "SCOPE_REVIEW",
  "PROCESSING",
  "RETRYABLE_FAILURE",
] as const;

/**
 * Login sonrasında yalnızca kullanıcıya ait olduğu kanıtlanan, soft-delete
 * edilmiş bireysel alanı aynı kimlikle geri açar. Üyelik/profil/ilerleme
 * taşınmaz veya yeniden oluşturulmaz. Paylaşılan ya da belirsiz alanlar kapalı
 * kalır.
 */
export async function restoreDeletedPersonalContextInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  requestedTenantId?: string | null,
): Promise<PersonalContextRecoveryResult> {
  await tx.$queryRaw`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtextextended(${`personal-context:${userId}`}, 0))
  `;

  const user = await tx.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletedAt: null, platformRole: null },
    select: { id: true },
  });
  if (!user) return { status: "NOT_APPLICABLE" };

  const candidates = await tx.tenant.findMany({
    where: {
      type: "INDIVIDUAL",
      status: "ACTIVE",
      deletedAt: { not: null },
      ...(requestedTenantId ? { id: requestedTenantId } : {}),
      memberships: { some: { userId, role: "STUDENT" } },
    },
    select: { id: true, deletedAt: true },
  });
  if (candidates.length === 0) return { status: "NOT_APPLICABLE" };
  if (candidates.length !== 1) return { status: "AMBIGUOUS" };

  const tenant = candidates[0]!;
  const [memberships, profiles, deletionTable] = await Promise.all([
    tx.membership.findMany({
      where: { tenantId: tenant.id },
      select: { userId: true, role: true, status: true, deletedAt: true },
    }),
    tx.studentProfile.findMany({
      where: { tenantId: tenant.id },
      select: { studentId: true },
    }),
    tx.$queryRaw<Array<{ relationName: string | null }>>`
      SELECT to_regclass('public."AccountDeletionRequest"')::text AS "relationName"
    `,
  ]);

  if (
    memberships.length !== 1 ||
    memberships[0]?.userId !== userId ||
    memberships[0]?.role !== "STUDENT" ||
    memberships[0]?.status !== "ACTIVE" ||
    memberships[0]?.deletedAt !== null ||
    profiles.length !== 1 ||
    profiles[0]?.studentId !== userId
  ) {
    return { status: "AMBIGUOUS" };
  }

  if (deletionTable[0]?.relationName) {
    const openRequest = await tx.accountDeletionRequest.findFirst({
      where: { userId, status: { in: [...OPEN_ACCOUNT_DELETION_STATUSES] } },
      select: { id: true },
    });
    if (openRequest) return { status: "DELETION_REQUEST_OPEN" };
  }

  const restoredAt = new Date();
  await tx.tenant.update({ where: { id: tenant.id }, data: { deletedAt: null } });
  await tx.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: userId,
      action: "UPDATE",
      entityType: "PERSONAL_CONTEXT_RECOVERY",
      entityId: tenant.id,
      before: {
        deletedAt: tenant.deletedAt?.toISOString() ?? null,
        evidence: "SINGLE_ACTIVE_STUDENT_MEMBERSHIP_AND_PROFILE",
      },
      after: { deletedAt: null, restoredAt: restoredAt.toISOString() },
    },
  });

  return { status: "RESTORED", tenantId: tenant.id };
}

export function personalContextRecoveryError(
  reason: "AMBIGUOUS" | "DELETION_REQUEST_OPEN" | "CHECK_FAILED" | "RECOVERY_DISABLED",
) {
  const message =
    reason === "DELETION_REQUEST_OPEN"
      ? "Açık hesap silme talebiniz nedeniyle kişisel alanınız otomatik açılamadı. Destek ekibiyle iletişime geçin."
      : reason === "RECOVERY_DISABLED"
        ? "Hesabınıza bağlı etkin bir çalışma alanı bulunamadı. Kişisel alan kurtarma işlemi henüz etkin değil; destek ekibiyle iletişime geçin."
        : "Hesabınıza bağlı kişisel alan güvenle doğrulanamadı. Öğrenme kayıtlarınız korunuyor; destek ekibiyle iletişime geçin.";
  return new ApiError("ACCOUNT_CONTEXT_REPAIR_REQUIRED", message, 409, {
    reasonCode: `PERSONAL_CONTEXT_${reason}`,
  });
}

/**
 * Mevcut kullanıcı için personal context'i atomik ve idempotent kurar.
 */
export async function provisionPersonalContext(
  userId: string,
  client: PrismaClient = prisma,
): Promise<PersonalContext> {
  return client.$transaction((tx) => provisionPersonalContextInTransaction(tx, userId));
}

/**
 * Signup gibi daha geniş bir transaction'ın içinden kullanılabilen çekirdek
 * provision işlemi. Advisory lock aynı user için processler arası yarışı da
 * serileştirir.
 */
export async function provisionPersonalContextInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<PersonalContext> {
  await tx.$queryRaw`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtextextended(${`personal-context:${userId}`}, 0))
  `;

  let user: { id: string } | null;
  try {
    user = await tx.user.findFirst({
      where: { id: userId, deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    });
  } catch {
    // DB error text may contain SQL or connection details; keep only a fixed
    // diagnostic class for the caller and fail closed.
    throw new PersonalContextLookupError("PERSONAL_CONTEXT_USER_LOOKUP_FAILED");
  }
  if (!user) {
    let accountState: { status: string; deletedAt: Date | null } | null;
    try {
      // Read only state flags to distinguish a visible inactive/deleted account
      // from a row absent or hidden by the database role's RLS policy.
      accountState = await tx.user.findFirst({
        where: { id: userId },
        select: { status: true, deletedAt: true },
      });
    } catch {
      throw new PersonalContextLookupError("PERSONAL_CONTEXT_USER_LOOKUP_FAILED");
    }

    if (!accountState) {
      throw new PersonalContextLookupError("PERSONAL_CONTEXT_USER_MISSING_OR_NOT_VISIBLE");
    }
    if (accountState.deletedAt !== null) {
      throw new PersonalContextLookupError("PERSONAL_CONTEXT_ACCOUNT_DELETED");
    }
    if (accountState.status !== "ACTIVE") {
      throw new PersonalContextLookupError("PERSONAL_CONTEXT_ACCOUNT_INACTIVE");
    }
    throw new PersonalContextLookupError("PERSONAL_CONTEXT_ACCOUNT_STATE_CHANGED");
  }

  // Admin akışında daha önce farklı bir id ile kurulmuş personal tenant varsa
  // onu koru; ikinci tenant oluşturma.
  const existingIndividual = await tx.membership.findFirst({
    where: {
      userId,
      status: { in: ["ACTIVE", "PENDING"] },
      deletedAt: null,
      tenant: { type: "INDIVIDUAL", deletedAt: null },
    },
    select: {
      tenantId: true,
      tenant: { select: { type: true, name: true, status: true, deletedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let tenantId = existingIndividual?.tenantId ?? null;
  let tenant = existingIndividual?.tenant ?? null;

  if (tenant && tenant.status !== "ACTIVE") {
    throw conflictError("Mevcut kişisel alan aktif değil");
  }

  if (!tenant) {
    const created = await tx.tenant.create({
      data: {
        type: "INDIVIDUAL",
        name: "Kişisel",
        status: "ACTIVE",
      },
      select: { id: true, type: true, name: true, status: true, deletedAt: true },
    });
    tenantId = created.id;
    tenant = created;
  }

  if (tenant.type !== "INDIVIDUAL") {
    throw conflictError("Kişisel alan tenant tipi geçersiz");
  }
  if (!tenantId) throw new Error("Personal tenant kimliği üretilemedi");

  const existingStudentMembership = await tx.membership.findFirst({
    where: {
      tenantId,
      userId,
      role: "STUDENT",
      status: { in: ["ACTIVE", "PENDING"] },
      deletedAt: null,
    },
    select: { id: true, status: true },
  });

  const membership = existingStudentMembership
    ? existingStudentMembership.status === "ACTIVE"
      ? existingStudentMembership
      : await tx.membership.update({
          where: { id: existingStudentMembership.id },
          data: { status: "ACTIVE", startedAt: new Date(), endedAt: null },
          select: { id: true, status: true },
        })
    : await tx.membership.create({
        data: {
          tenantId,
          userId,
          role: "STUDENT",
          status: "ACTIVE",
          startedAt: new Date(),
        },
        select: { id: true, status: true },
      });

  const studentProfile = await tx.studentProfile.upsert({
    where: { tenantId_studentId: { tenantId, studentId: userId } },
    create: { tenantId, studentId: userId },
    update: {},
    select: { id: true },
  });

  return {
    userId,
    tenantId,
    tenantType: "INDIVIDUAL",
    tenantName: tenant.name,
    membershipId: membership.id,
    membershipRole: "STUDENT",
    membershipStatus: "ACTIVE",
    studentProfileId: studentProfile.id,
  };
}
