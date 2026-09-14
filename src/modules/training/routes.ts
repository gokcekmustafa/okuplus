import type { FastifyInstance } from "fastify";
import { validationError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import type { FastifyRequest } from "fastify";
import { startPersonalExercise } from "../student-learning/service.js";
import { getDailyTrainingSession, startDailyTraining } from "./daily-session.js";
import {
  resolveAttentionBurstTemplateVersion,
  resolveDetailEvidenceTemplateVersion,
  resolveInferenceTemplateVersion,
  resolveMainIdeaTemplateVersion,
  resolvePhraseChunkingTemplateVersion,
  resolveRapidRecognitionTemplateVersion,
  type TrainingActor,
} from "./runtime.js";
import { assertStudentActor } from "../student-learning/policy.js";

type TrainingStartResolver = (
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
) => Promise<{ versionId: string }>;

function registerTrainingStartRoute(
  app: FastifyInstance,
  path: string,
  opts: { authProvider: AuthProvider },
  resolveTemplateVersion: TrainingStartResolver,
): void {
  app.post(path, { preHandler: [requireAuth(opts.authProvider)] }, async (request) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as { templateVersionId?: string; clientSessionId?: string })
        : {};
    if (
      body.templateVersionId !== undefined &&
      (typeof body.templateVersionId !== "string" || body.templateVersionId.trim().length === 0)
    ) {
      throw validationError("templateVersionId geçerli bir metin olmalı");
    }
    if (
      body.clientSessionId !== undefined &&
      (typeof body.clientSessionId !== "string" || body.clientSessionId.trim().length === 0)
    ) {
      throw validationError("clientSessionId geçerli bir metin olmalı");
    }
    const actor: TrainingActor = {
      userId: request.authUser!.id,
      tenantId: request.tenantContext?.tenantId ?? null,
      platformRole: request.authUser!.platformRole ?? null,
    };
    assertStudentActor(actor);
    const graph = await resolveTemplateVersion(actor, body.templateVersionId);
    return ok(
      await startPersonalExercise(actor, {
        templateVersionId: graph.versionId,
        clientSessionId: body.clientSessionId,
      }),
    );
  });
}

export async function trainingStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const dailyActor = (request: FastifyRequest) => ({
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: (request.authUser!.platformRole ?? null) as TrainingActor["platformRole"],
  });

  app.post(
    "/student/training/daily/start",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const actor = dailyActor(request);
      assertStudentActor(actor);
      return ok(await startDailyTraining(actor));
    },
  );
  app.get(
    "/student/training/daily/:id",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request) => {
      const id = (request.params as { id?: string }).id?.trim();
      if (!id) throw validationError("Günlük antrenman kimliği gerekli");
      const actor = dailyActor(request);
      assertStudentActor(actor);
      return ok(await getDailyTrainingSession(id, actor));
    },
  );

  registerTrainingStartRoute(
    app,
    "/student/training/main-idea/start",
    opts,
    resolveMainIdeaTemplateVersion,
  );
  registerTrainingStartRoute(
    app,
    "/student/training/detail/start",
    opts,
    resolveDetailEvidenceTemplateVersion,
  );
  registerTrainingStartRoute(
    app,
    "/student/training/inference/start",
    opts,
    resolveInferenceTemplateVersion,
  );
  registerTrainingStartRoute(
    app,
    "/student/training/attention-burst/start",
    opts,
    resolveAttentionBurstTemplateVersion,
  );
  registerTrainingStartRoute(
    app,
    "/student/training/rapid-recognition/start",
    opts,
    resolveRapidRecognitionTemplateVersion,
  );
  registerTrainingStartRoute(
    app,
    "/student/training/phrase-chunking/start",
    opts,
    resolvePhraseChunkingTemplateVersion,
  );
}
