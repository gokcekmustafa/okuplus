import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { findCanonicalPlacementAssessment } from "../assessments/canonical-selector.js";
import { getLearningPath } from "../student-learning/service.js";
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
    async (req) => {
      const { prisma } = await import("../../lib/prisma.js");

      // The first action after onboarding must follow the published learning
      // path. Selecting the newest published template is unsafe: it can be a
      // later/locked station or an unrelated tenant-visible template.
      const actor = {
        userId: req.authUser!.id,
        tenantId: req.tenantContext?.tenantId ?? null,
        platformRole: req.authUser!.platformRole ?? null,
      };
      const path = await getLearningPath(actor);
      const pathGroups = path && "paths" in path ? path.paths : path ? [path] : [];
      const next = pathGroups
        .flatMap((group) => group.nodes ?? [])
        .find((node) => node.status === "active");
      if (next) {
        const contentVersionId = "contentVersionId" in next ? next.contentVersionId : null;
        const assessmentId = "assessmentId" in next ? next.assessmentId : null;
        return ok({
          stepId: next.id,
          type: next.type,
          contentVersionId,
          templateVersionId: next.templateVersionId,
          assessmentId,
        });
      }

      // Keep the legacy response contract for environments that predate the
      // persistent learning-path migration.
      const tv = await prisma.exerciseTemplateVersion.findFirst({
        where: {
          status: "PUBLISHED",
          template: {
            status: "PUBLISHED",
            deletedAt: null,
            OR: [{ tenantId: null }, { tenantId: actor.tenantId ?? undefined }],
          },
        },
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
    async (req) => {
      const { prisma } = await import("../../lib/prisma.js");
      const a = await findCanonicalPlacementAssessment(prisma, req.tenantContext?.tenantId ?? null);
      return ok({ assessmentId: a?.id ?? null });
    },
  );
}
