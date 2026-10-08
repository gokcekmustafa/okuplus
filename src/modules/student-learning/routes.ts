import { createHash } from "node:crypto";
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
import { completeTerminalLearningStep } from "../learning-path/index.js";
import { reconcileP0ToP1 } from "./p1-transition.js";
import { p1TransitionSchema } from "./p1-schemas.js";

function hashForDiagnostics(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function elapsedMilliseconds(startedAt: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 100_000) / 10;
}

function redactDiagnosticText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(
      /((?:authorization|cookie|password|token|secret|database_url)\s*[:=]\s*)\S+/gi,
      "$1[REDACTED]",
    )
    .slice(0, maxLength);
}

function safeLearningPathError(error: unknown) {
  const record =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: redactDiagnosticText(record?.code, 80),
    message: redactDiagnosticText(error instanceof Error ? error.message : error, 240),
    stack: redactDiagnosticText(error instanceof Error ? error.stack : null, 4000),
  };
}

function learningPathSummary(data: unknown) {
  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const paths = Array.isArray(record.paths) ? record.paths : [];
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  const groupedNodeCount = paths.reduce((total, path) => {
    if (!path || typeof path !== "object") return total;
    const pathNodes = (path as { nodes?: unknown }).nodes;
    return total + (Array.isArray(pathNodes) ? pathNodes.length : 0);
  }, 0);
  return {
    source: redactDiagnosticText(record.source, 80),
    pathCount: paths.length,
    nodeCount: nodes.length,
    groupedNodeCount,
    hasCurrentLevel: Boolean(record.currentLevel),
    hasAcademicProgram: Boolean(record.academicProgram),
    hasToday: Boolean(record.today),
  };
}

function optionalBodyString(body: Record<string, unknown>, key: string, maxLength: number) {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw validationError(`${key} geçerli bir metin olmalı`);
  }
  return value.trim();
}

function diagnosticBodyString(body: Record<string, unknown>, key: string, maxLength: number) {
  const value = body[key];
  return typeof value === "string" ? redactDiagnosticText(value, maxLength) : null;
}

function diagnosticBodyStatus(body: Record<string, unknown>) {
  const value = body.status;
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

export async function studentLearningRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  app.addHook("onResponse", async (req, reply) => {
    if (req.url.split("?", 1)[0] !== "/student/learning-path" || reply.statusCode < 400) return;
    req.log.warn(
      {
        event: "student.learning_path.response",
        requestId: req.id,
        responseStatus: reply.statusCode,
        authenticated: Boolean(req.authUser),
        hasTenantContext: Boolean(req.tenantContext?.tenantId),
        userIdHash: hashForDiagnostics(req.authUser?.id),
        tenantIdHash: hashForDiagnostics(req.tenantContext?.tenantId),
      },
      "Learning path response completed with an error status",
    );
  });
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
    const body =
      (req.body as {
        templateVersionId?: string;
        clientSessionId?: string;
        navigationFromStepId?: string;
        navigationTargetStepId?: string;
        replay?: boolean;
      }) || {};
    return ok(
      await startPersonalExercise(
        {
          userId: req.authUser!.id,
          tenantId: req.tenantContext?.tenantId ?? null,
          platformRole: req.authUser!.platformRole ?? null,
        },
        { ...body, enforceLearningPathOrder: true },
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
    const startedAt = process.hrtime.bigint();
    const userId = req.authUser!.id;
    const tenantId = req.tenantContext?.tenantId ?? null;
    try {
      const data = await getLearningPath({
        userId,
        tenantId,
        platformRole: req.authUser!.platformRole ?? null,
      });
      req.log.info(
        {
          event: "student.learning_path.completed",
          requestId: req.id,
          userIdHash: hashForDiagnostics(userId),
          tenantIdHash: hashForDiagnostics(tenantId),
          durationMs: elapsedMilliseconds(startedAt),
          responseStatus: 200,
          ...learningPathSummary(data),
        },
        "Learning path request completed",
      );
      return ok(data);
    } catch (error) {
      req.log.error(
        {
          event: "student.learning_path.failed",
          requestId: req.id,
          userIdHash: hashForDiagnostics(userId),
          tenantIdHash: hashForDiagnostics(tenantId),
          durationMs: elapsedMilliseconds(startedAt),
          responseStatus: 500,
          error: safeLearningPathError(error),
        },
        "Learning path request failed",
      );
      throw error;
    }
  });
  app.post(
    "/student/learning-path/steps/:stepId/complete",
    { preHandler: [requireAuth(authProvider)] },
    async (req) => {
      const { stepId } = req.params as { stepId: string };
      return ok(
        await completeTerminalLearningStep(
          {
            userId: req.authUser!.id,
            tenantId: req.tenantContext?.tenantId ?? null,
            platformRole: req.authUser!.platformRole ?? null,
          },
          stepId,
        ),
      );
    },
  );
  app.post(
    "/student/learning-path/p1/reconcile",
    { preHandler: [requireAuth(authProvider)] },
    async (req) => {
      const input = p1TransitionSchema.parse(req.body);
      return ok(
        await reconcileP0ToP1(
          {
            userId: req.authUser!.id,
            tenantId: req.tenantContext?.tenantId ?? null,
            platformRole: req.authUser!.platformRole ?? null,
          },
          input,
        ),
      );
    },
  );
  app.post(
    "/student/learning-path/client-diagnostic",
    { preHandler: [requireAuth(authProvider)] },
    async (req) => {
      const body = (req.body as Record<string, unknown> | null) ?? {};
      const allowedPhases = new Set([
        "request",
        "home-insights",
        "academic-model",
        "progress-summary",
        "learning-path-map",
      ]);
      const phase = diagnosticBodyString(body, "phase", 40);
      req.log.warn(
        {
          event: "student.learning_path.client_error",
          requestId: req.id,
          clientRequestId: diagnosticBodyString(body, "requestId", 120),
          userIdHash: hashForDiagnostics(req.authUser?.id),
          tenantIdHash: hashForDiagnostics(req.tenantContext?.tenantId),
          phase: phase && allowedPhases.has(phase) ? phase : "unknown",
          name: diagnosticBodyString(body, "name", 80),
          code: diagnosticBodyString(body, "code", 80),
          message: diagnosticBodyString(body, "message", 240),
          status: diagnosticBodyStatus(body),
        },
        "Learning path client error reported",
      );
      return ok({ received: true });
    },
  );
}
