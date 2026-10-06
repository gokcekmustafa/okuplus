import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, notFoundError } from "../../lib/errors.js";
import type { AccountProfileInput } from "./schemas.js";

const ACCOUNT_PROFILE_SELECT = {
  id: true,
  displayName: true,
  email: true,
  phone: true,
  nationalId: true,
  birthYear: true,
} satisfies Prisma.UserSelect;

export type AccountProfile = Prisma.UserGetPayload<{ select: typeof ACCOUNT_PROFILE_SELECT }>;

export async function getAccountProfile(userId: string): Promise<AccountProfile> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: ACCOUNT_PROFILE_SELECT,
  });
  if (!user) throw notFoundError("Kullanıcı bulunamadı");
  return user;
}

export async function updateAccountProfile(
  userId: string,
  input: AccountProfileInput,
): Promise<AccountProfile> {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName,
        email: input.email,
        phone: input.phone ?? null,
        nationalId: input.nationalId ?? null,
        birthYear: input.birthYear ?? null,
      },
      select: ACCOUNT_PROFILE_SELECT,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "").toLowerCase();
      throw conflictError(
        target.includes("nationalid")
          ? "Bu TC Kimlik No zaten kullanımda"
          : "Bu e-posta adresi zaten kullanımda",
      );
    }
    throw error;
  }
}
