import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError } from "../../lib/errors.js";

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

  const user = await tx.user.findFirst({
    where: { id: userId, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (!user) throw notFoundError("Aktif kullanıcı bulunamadı");

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
