import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError } from "../../lib/errors.js";
import {
  provisionPersonalContextInTransaction,
  type PersonalContext,
} from "../tenant/personal-service.js";
import { ScryptPasswordHasher } from "./password.js";
import type { SignupInput } from "./schemas.js";

const hasher = new ScryptPasswordHasher();

export interface SignupResult {
  userId: string;
  personalContext: PersonalContext;
}

/**
 * User + INDIVIDUAL Tenant + ACTIVE STUDENT Membership + StudentProfile
 * kayıtlarını tek transaction içinde oluşturur.
 */
export async function signupPersonalAccount(input: SignupInput): Promise<SignupResult> {
  const passwordHash = await hasher.hash(input.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      const personalContext = await provisionPersonalContextInTransaction(tx, user.id);
      return { userId: user.id, personalContext };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflictError("Bu e-posta adresi zaten kullanımda");
    }
    throw error;
  }
}
