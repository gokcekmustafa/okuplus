import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Env } from "../../config/env.js";
import { validationError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import type { AuthProvider } from "../auth/index.js";
import { requirePilotAccess } from "./access.js";
import {
  createPilotBugReport,
  createPilotFeedback,
  getPilotMetrics,
  listPilotReports,
  recordPilotEvent,
} from "./service.js";
import { pilotBugReportSchema, pilotEventSchema, pilotFeedbackSchema } from "./schemas.js";

function studentActor(request: FastifyRequest) {
  return { userId: request.authUser!.id, tenantId: request.tenantContext?.tenantId ?? null };
}

export async function pilotRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider; env: Env },
): Promise<void> {
  const studentPilot = [requireAuth(opts.authProvider), requirePilotAccess(opts.env)];
  const pilotAdmin = [
    requireAuth(opts.authProvider),
    requirePlatformRole(["SUPER_ADMIN", "ANALYST"]),
  ];

  app.post("/student/pilot/events", { preHandler: studentPilot }, async (request) => {
    return ok(await recordPilotEvent(studentActor(request), pilotEventSchema.parse(request.body)));
  });
  app.post("/student/pilot/feedback", { preHandler: studentPilot }, async (request) => {
    return ok(
      await createPilotFeedback(studentActor(request), pilotFeedbackSchema.parse(request.body)),
    );
  });
  app.post("/student/pilot/bug-reports", { preHandler: studentPilot }, async (request) => {
    return ok(
      await createPilotBugReport(studentActor(request), pilotBugReportSchema.parse(request.body)),
    );
  });
  app.get("/admin/pilot/metrics", { preHandler: pilotAdmin }, async (request) => {
    return ok(await getPilotMetrics({ tenantId: request.tenantContext?.tenantId ?? null }));
  });
  app.get("/admin/pilot/reports", { preHandler: pilotAdmin }, async (request) => {
    const query = (request.query as { kind?: string; limit?: string }) ?? {};
    const kind = query.kind === "bug" ? "bug" : query.kind === "feedback" ? "feedback" : null;
    if (!kind) throw validationError("kind=feedback veya kind=bug gerekli");
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    return ok(
      await listPilotReports({ tenantId: request.tenantContext?.tenantId ?? null, kind, limit }),
    );
  });
}
