import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { completeOnboarding, getOnboardingState, grantConsent, updateProfile } from "./service.js";

export async function onboardingRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  app.get("/student/onboarding", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    return ok(
      await getOnboardingState({
        userId: req.authUser!.id,
        tenantId: req.tenantContext?.tenantId ?? null,
      }),
    );
  });
  app.get("/student/onboarding/levels", { preHandler: [requireAuth(authProvider)] }, async () => {
    const { prisma } = await import("../../lib/prisma.js");
    const levels = await prisma.level.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true, code: true, name: true },
    });
    return ok({ levels });
  });
  app.patch("/student/profile", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    const body = req.body as {
      displayName?: string;
      birthYear?: number | null;
      currentLevelId?: string | null;
      learningGoal?: string | null;
    };
    return ok(await updateProfile({ userId: req.authUser!.id }, body));
  });
  app.post("/student/consents", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    const body = req.body as { type: string; version?: string };
    return ok(
      await grantConsent(
        { userId: req.authUser!.id, tenantId: req.tenantContext?.tenantId ?? null },
        body,
      ),
    );
  });
  app.post(
    "/student/onboarding/complete",
    { preHandler: [requireAuth(authProvider)] },
    async (req) => {
      return ok(await completeOnboarding({ userId: req.authUser!.id }));
    },
  );
  // quick-start helper: returns a published templateVersionId for personal context
  app.get(
    "/student/onboarding/quick-start",
    { preHandler: [requireAuth(authProvider)] },
    async (_req) => {
      const { prisma } = await import("../../lib/prisma.js");
      const tv = await prisma.exerciseTemplateVersion.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        select: { id: true, templateId: true },
      });
      if (!tv) return ok({ templateVersionId: null });
      return ok({ templateVersionId: tv.id, templateId: tv.templateId });
    },
  );
  // placement helper: returns a published assessment id
  app.get(
    "/student/onboarding/placement",
    { preHandler: [requireAuth(authProvider)] },
    async () => {
      const { prisma } = await import("../../lib/prisma.js");
      const a = await prisma.assessment.findFirst({
        where: { status: "PUBLISHED", type: "PLACEMENT" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (a) return ok({ assessmentId: a.id });
      const anyP = await prisma.assessment.findFirst({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      return ok({ assessmentId: anyP?.id ?? null });
    },
  );
}
