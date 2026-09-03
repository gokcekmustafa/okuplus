import { prisma } from "../../lib/prisma.js";
import { notFoundError, validationError } from "../../lib/errors.js";
import { provisionPersonalContext } from "../tenant/personal-service.js";

const CURRENT_CONSENT_VERSION = "v1";
const REQUIRED_CONSENTS: Array<{ type: string }> = [
  { type: "TERMS_OF_SERVICE" },
  { type: "DATA_PROCESSING" },
];

export interface OnboardingState {
  completed: boolean;
  completedAt: Date | null;
  profile: {
    displayName: string;
    birthYear: number | null;
    currentLevelId: string | null;
    learningGoal: string | null;
  };
  consents: Array<{ type: string; version: string; status: string; grantedAt: Date }>;
  requiredConsents: string[];
}

function isMinor(birthYear: number | null): boolean {
  if (!birthYear) return false;
  const age = new Date().getFullYear() - birthYear;
  return age < 18;
}

export async function getOnboardingState(actor: {
  userId: string;
  tenantId: string | null;
}): Promise<OnboardingState> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, displayName: true, birthYear: true },
  });
  if (!user) throw notFoundError("Kullanıcı bulunamadı");
  // ensure personal profile exists
  const personal = await provisionPersonalContext(actor.userId);
  const profile = await prisma.studentProfile.findUnique({
    where: { tenantId_studentId: { tenantId: personal.tenantId, studentId: actor.userId } },
  });
  const consents = await prisma.consent.findMany({
    where: { userId: actor.userId, status: "GRANTED" },
    select: { type: true, version: true, status: true, grantedAt: true },
    orderBy: { grantedAt: "desc" },
  });
  const completed = !!profile?.onboardingCompletedAt;
  const required = [...REQUIRED_CONSENTS.map((c) => c.type)];
  if (isMinor(user.birthYear ?? null)) required.push("PARENTAL_CONSENT");
  return {
    completed,
    completedAt: profile?.onboardingCompletedAt ?? null,
    profile: {
      displayName: user.displayName,
      birthYear: user.birthYear ?? null,
      currentLevelId: profile?.currentLevelId ?? null,
      learningGoal: profile?.learningGoal ?? null,
    },
    consents: consents.map((c) => ({
      type: c.type as string,
      version: c.version,
      status: c.status as string,
      grantedAt: c.grantedAt,
    })),
    requiredConsents: required,
  };
}

export async function updateProfile(
  actor: { userId: string; tenantId?: string | null },
  input: {
    displayName?: string;
    birthYear?: number | null;
    currentLevelId?: string | null;
    learningGoal?: string | null;
  },
) {
  if (input.displayName !== undefined) {
    const name = input.displayName.trim();
    if (!name || name.length > 120) throw validationError("Geçersiz ad");
    await prisma.user.update({ where: { id: actor.userId }, data: { displayName: name } });
  }
  if (input.birthYear !== undefined) {
    if (input.birthYear !== null) {
      const y = input.birthYear;
      if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear())
        throw validationError("Geçersiz doğum yılı");
      await prisma.user.update({ where: { id: actor.userId }, data: { birthYear: y } });
    } else {
      await prisma.user.update({ where: { id: actor.userId }, data: { birthYear: null } });
    }
  }
  const personal = await provisionPersonalContext(actor.userId);
  const data: Record<string, unknown> = {};
  if (input.currentLevelId !== undefined) {
    if (input.currentLevelId) {
      const level = await prisma.level.findUnique({ where: { id: input.currentLevelId } });
      if (!level) throw notFoundError("Seviye bulunamadı");
      data.currentLevelId = input.currentLevelId;
    } else {
      data.currentLevelId = null;
    }
  }
  if (input.learningGoal !== undefined) {
    const allowed = ["SPEED", "COMPREHENSION", "EXAM", "SELF_IMPROVEMENT"];
    if (input.learningGoal !== null && !allowed.includes(input.learningGoal))
      throw validationError("Geçersiz öğrenme amacı");
    data.learningGoal = input.learningGoal;
  }
  if (Object.keys(data).length > 0) {
    await prisma.studentProfile.update({
      where: { tenantId_studentId: { tenantId: personal.tenantId, studentId: actor.userId } },
      data,
    });
  }
  return getOnboardingState({ userId: actor.userId, tenantId: actor.tenantId ?? null });
}

export async function grantConsent(
  actor: { userId: string; tenantId: string | null },
  input: { type: string; version?: string },
) {
  const allowed = ["TERMS_OF_SERVICE", "DATA_PROCESSING", "PARENTAL_CONSENT", "DATA_TRANSFER"];
  if (!allowed.includes(input.type)) throw validationError("Geçersiz consent tipi");
  const version = input.version?.trim() || CURRENT_CONSENT_VERSION;
  const existing = await prisma.consent.findFirst({
    where: { userId: actor.userId, type: input.type as never, version, status: "GRANTED" },
  });
  if (existing) return existing;
  const personal = await provisionPersonalContext(actor.userId);
  return prisma.consent.create({
    data: {
      userId: actor.userId,
      tenantId: personal.tenantId,
      type: input.type as never,
      version,
      status: "GRANTED",
      source: "onboarding",
    },
  });
}

export async function completeOnboarding(actor: { userId: string; tenantId?: string | null }) {
  const state = await getOnboardingState({
    userId: actor.userId,
    tenantId: actor.tenantId ?? null,
  });
  if (state.completed) return state;
  if (!state.profile.displayName) throw validationError("Ad gerekli");
  if (!state.profile.currentLevelId) throw validationError("Sınıf seviyesi gerekli");
  if (!state.profile.learningGoal) throw validationError("Öğrenme amacı gerekli");
  for (const req of state.requiredConsents) {
    if (!state.consents.some((c) => c.type === req && c.status === "GRANTED"))
      throw validationError(`Gerekli onay eksik: ${req}`);
  }
  const personal = await provisionPersonalContext(actor.userId);
  await prisma.studentProfile.update({
    where: { tenantId_studentId: { tenantId: personal.tenantId, studentId: actor.userId } },
    data: { onboardingCompletedAt: new Date() },
  });
  return getOnboardingState({ userId: actor.userId, tenantId: actor.tenantId ?? null });
}
