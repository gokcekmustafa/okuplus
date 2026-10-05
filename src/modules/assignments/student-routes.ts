import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import {
  listStudentAssignments,
  getStudentAssignment,
  startAssignmentSession,
} from "./student-service.js";
import { getStudentAssignmentResult } from "./results-service.js";
import {
  acceptStudentRecommendation,
  autoAssignStudentRecommendations,
  listStudentRecommendations,
  persistStudentRecommendations,
} from "./recommendation-service.js";
import { refreshAssignmentRecommendationsSchema } from "./schemas.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

/**
 * Öğrenci ödevleri uçları (authenticated student).
 *
 *  GET    /student/assignments              — öğrencinin ödev listesi
 *  GET    /student/assignments/:id          — ödev detayı
 *  POST   /student/assignments/:id/start    — ödevden oturum başlat
 */
export async function assignmentStudentRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const requireStudentAuth = [requireAuth(authProvider)];

  app.get(
    "/student/assignment-recommendations",
    { preHandler: requireStudentAuth },
    async (request) => {
      return ok(
        await listStudentRecommendations({
          userId: request.authUser!.id,
          tenantId: request.tenantContext?.tenantId ?? null,
          platformRole: request.authUser!.platformRole ?? null,
        }),
      );
    },
  );

  app.post(
    "/student/assignment-recommendations/refresh",
    { preHandler: requireStudentAuth },
    async (request) => {
      const input = refreshAssignmentRecommendationsSchema.parse(request.body);
      if (input.studentId !== request.authUser!.id) {
        throw validationError("Yalnızca kendi önerilerinizi yenileyebilirsiniz");
      }
      return ok(
        await persistStudentRecommendations({
          userId: request.authUser!.id,
          tenantId: request.tenantContext?.tenantId ?? null,
          platformRole: request.authUser!.platformRole ?? null,
        }),
      );
    },
  );

  app.post(
    "/student/assignment-recommendations/auto-assign",
    { preHandler: requireStudentAuth },
    async (request) => {
      return ok(
        await autoAssignStudentRecommendations({
          userId: request.authUser!.id,
          tenantId: request.tenantContext?.tenantId ?? null,
          platformRole: request.authUser!.platformRole ?? null,
        }),
      );
    },
  );

  app.post(
    "/student/assignment-recommendations/:id/accept",
    { preHandler: requireStudentAuth },
    async (request) => {
      return ok(
        await acceptStudentRecommendation(
          {
            userId: request.authUser!.id,
            tenantId: request.tenantContext?.tenantId ?? null,
            platformRole: request.authUser!.platformRole ?? null,
          },
          readParamId(request, "Öneri"),
        ),
      );
    },
  );

  app.get("/student/assignments", { preHandler: requireStudentAuth }, async (request) => {
    const actor = {
      userId: request.authUser!.id,
      tenantId: request.tenantContext?.tenantId ?? null,
      platformRole: request.authUser!.platformRole ?? null,
    };
    const query = (request.query as Record<string, string>) ?? {};
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const search = query.search ?? undefined;
    const status = query.status ?? undefined;
    return ok(await listStudentAssignments(actor, { page, pageSize, search, status }));
  });

  app.get("/student/assignments/:id", { preHandler: requireStudentAuth }, async (request) => {
    const actor = {
      userId: request.authUser!.id,
      tenantId: request.tenantContext?.tenantId ?? null,
      platformRole: request.authUser!.platformRole ?? null,
    };
    return ok(await getStudentAssignment(readParamId(request, "Ödev"), actor));
  });

  app.get(
    "/student/assignments/:id/result",
    { preHandler: requireStudentAuth },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser?.platformRole ?? null,
      };
      return ok(await getStudentAssignmentResult(readParamId(request, "Ödev"), actor));
    },
  );

  app.post(
    "/student/assignments/:id/start",
    { preHandler: requireStudentAuth },
    async (request) => {
      const actor = {
        userId: request.authUser!.id,
        tenantId: request.tenantContext?.tenantId ?? null,
        platformRole: request.authUser!.platformRole ?? null,
      };
      return ok(await startAssignmentSession(readParamId(request, "Ödev"), actor));
    },
  );
}
