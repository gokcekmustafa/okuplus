import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import {
  getHistory,
  getLearningPath,
  getStudentSession,
  getToday,
  startPersonalExercise,
} from "./service.js";
import { startStudentReview, getStudentReview } from "./review-service.js";

function optionalBodyString(body: Record<string, unknown>, key: string, maxLength: number) {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw validationError(`${key} geçerli bir metin olmalı`);
  }
  return value.trim();
}

export async function studentLearningRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  app.get("/student/today", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    return ok(
      await getToday({
        userId: req.authUser!.id,
        tenantId: req.tenantContext?.tenantId ?? null,
        platformRole: req.authUser!.platformRole ?? null,
      }),
    );
  });
  app.get("/student/review", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    return ok(
      await getStudentReview({
        userId: req.authUser!.id,
        tenantId: req.tenantContext?.tenantId ?? null,
        platformRole: req.authUser!.platformRole ?? null,
      }),
    );
  });
  app.post("/student/review/start", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    const body = (req.body as Record<string, unknown> | null) ?? {};
    return ok(
      await startStudentReview(
        {
          userId: req.authUser!.id,
          tenantId: req.tenantContext?.tenantId ?? null,
          platformRole: req.authUser!.platformRole ?? null,
        },
        {
          skillId: optionalBodyString(body, "skillId", 100),
          templateVersionId: optionalBodyString(body, "templateVersionId", 100),
          clientSessionId: optionalBodyString(body, "clientSessionId", 100),
        },
      ),
    );
  });
  app.get("/student/history", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    const q = req.query as { page?: string; pageSize?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize) || 20));
    return ok(
      await getHistory(
        {
          userId: req.authUser!.id,
          tenantId: req.tenantContext?.tenantId ?? null,
          platformRole: req.authUser!.platformRole ?? null,
        },
        { page, pageSize },
      ),
    );
  });
  app.post("/student/exercises/start", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    const body = (req.body as { templateVersionId?: string; clientSessionId?: string }) || {};
    return ok(
      await startPersonalExercise(
        {
          userId: req.authUser!.id,
          tenantId: req.tenantContext?.tenantId ?? null,
          platformRole: req.authUser!.platformRole ?? null,
        },
        body,
      ),
    );
  });
  app.get("/student/sessions/:id", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    const { id } = req.params as { id: string };
    return ok(
      await getStudentSession(id, {
        userId: req.authUser!.id,
        tenantId: req.tenantContext?.tenantId ?? null,
        platformRole: req.authUser!.platformRole ?? null,
      }),
    );
  });
  app.get("/student/learning-path", { preHandler: [requireAuth(authProvider)] }, async (req) => {
    return ok(
      await getLearningPath({
        userId: req.authUser!.id,
        tenantId: req.tenantContext?.tenantId ?? null,
        platformRole: req.authUser!.platformRole ?? null,
      }),
    );
  });
}
