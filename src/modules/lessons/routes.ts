import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { isApiError, validationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { completeStudentLearningStepLesson, getStudentLearningStepLesson } from "./service.js";

function actor(request: FastifyRequest) {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser!.platformRole ?? null,
  };
}

function stepId(request: FastifyRequest): string {
  const value = (request.params as { stepId?: string }).stepId;
  if (typeof value !== "string" || !value.trim()) {
    throw validationError("Öğrenme adımı kimliği gerekli");
  }
  return value.trim();
}

export async function lessonStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const preHandler = [requireAuth(opts.authProvider)];
  app.get("/student/learning-path/steps/:stepId/lesson", { preHandler }, async (request) => {
    const query = request.query as { fromStepId?: string };
    const requestedStepId = stepId(request);
    try {
      return ok(
        await getStudentLearningStepLesson(requestedStepId, actor(request), query.fromStepId),
      );
    } catch (error) {
      if (isApiError(error) && error.code === "NOT_FOUND") {
        request.log.warn(
          {
            event: "student.learning_step_lesson.not_found",
            stepId: requestedStepId,
            reason:
              error.message === "Bu öğrenme adımının yayınlanmış dersi yok"
                ? "MISSING_CONTENT_VERSION"
                : error.message === "Yayınlanmış ders içeriği bulunamadı"
                  ? "CONTENT_NOT_VISIBLE_OR_MISSING"
                  : error.message === "İstenen ders sürümü yayınlanmış değil"
                    ? "CONTENT_VERSION_NOT_PUBLISHED"
                    : error.message === "Yayınlanmış ders sözleşmesi geçersiz"
                      ? "LESSON_METADATA_INVALID"
                      : "CONTENT_OR_LESSON_UNAVAILABLE",
          },
          "Learning step lesson unavailable",
        );
      }
      throw error;
    }
  });
  app.post(
    "/student/learning-path/steps/:stepId/lesson/complete",
    { preHandler },
    async (request) => ok(await completeStudentLearningStepLesson(stepId(request), actor(request))),
  );
}
