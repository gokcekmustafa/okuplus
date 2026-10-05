import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import {
  acceptAssignmentRecommendationSchema,
  assignmentAutomationSettingSchema,
  createTeacherAssignmentSchema,
  listAssignmentRecommendationsQuerySchema,
  listAssignmentsQuerySchema,
  refreshTeacherAssignmentRecommendationsSchema,
  runAssignmentAutomationSchema,
} from "./schemas.js";
import {
  createTeacherAssignment,
  listTeacherAssignments,
  listTeacherClasses,
  listTeacherTemplates,
  type TeacherAssignmentActor,
} from "./teacher-service.js";
import { getTeacherAssignmentResults } from "./results-service.js";
import {
  acceptTeacherRecommendation,
  dismissTeacherRecommendation,
  listTeacherAutomationSettings,
  listTeacherRecommendations,
  refreshTeacherRecommendations,
  runTeacherAutomation,
  upsertTeacherAutomationSetting,
} from "./recommendation-service.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

function actorFrom(request: FastifyRequest): TeacherAssignmentActor {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    platformRole: request.authUser?.platformRole ?? null,
  };
}

/** Öğretmenin kendi sınıf ve atama kapsamındaki uçlar. */
export async function assignmentTeacherRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const requireTeacherAuth = [requireAuth(opts.authProvider)];

  app.get(
    "/teacher/assignment-recommendations",
    { preHandler: requireTeacherAuth },
    async (request) => {
      const query = listAssignmentRecommendationsQuerySchema.parse(request.query);
      return ok(await listTeacherRecommendations(actorFrom(request), query));
    },
  );

  app.post(
    "/teacher/assignment-recommendations/refresh",
    { preHandler: requireTeacherAuth },
    async (request) => {
      const input = refreshTeacherAssignmentRecommendationsSchema.parse(request.body);
      return ok(await refreshTeacherRecommendations(actorFrom(request), input));
    },
  );

  app.post(
    "/teacher/assignment-recommendations/:id/accept",
    { preHandler: requireTeacherAuth },
    async (request) => {
      const input = acceptAssignmentRecommendationSchema.parse(request.body ?? {});
      return ok(
        await acceptTeacherRecommendation(
          actorFrom(request),
          readParamId(request, "Öneri"),
          input.classId,
        ),
      );
    },
  );

  app.post(
    "/teacher/assignment-recommendations/:id/dismiss",
    { preHandler: requireTeacherAuth },
    async (request) => {
      return ok(
        await dismissTeacherRecommendation(actorFrom(request), readParamId(request, "Öneri")),
      );
    },
  );

  app.get("/teacher/assignment-automation", { preHandler: requireTeacherAuth }, async (request) =>
    ok(await listTeacherAutomationSettings(actorFrom(request))),
  );

  app.put("/teacher/assignment-automation", { preHandler: requireTeacherAuth }, async (request) => {
    const input = assignmentAutomationSettingSchema.parse(request.body);
    return ok(await upsertTeacherAutomationSetting(actorFrom(request), input));
  });

  app.post(
    "/teacher/assignment-automation/run",
    { preHandler: requireTeacherAuth },
    async (request) => {
      const input = runAssignmentAutomationSchema.parse(request.body);
      return ok(await runTeacherAutomation(actorFrom(request), input));
    },
  );

  app.get("/teacher/classes", { preHandler: requireTeacherAuth }, async (request) => {
    return ok(await listTeacherClasses(actorFrom(request)));
  });

  app.get("/teacher/templates", { preHandler: requireTeacherAuth }, async (request) => {
    return ok(await listTeacherTemplates(actorFrom(request)));
  });

  app.get("/teacher/assignments", { preHandler: requireTeacherAuth }, async (request) => {
    const query = listAssignmentsQuerySchema.parse(request.query);
    return ok(await listTeacherAssignments(actorFrom(request), query));
  });

  app.post("/teacher/assignments", { preHandler: requireTeacherAuth }, async (request) => {
    const input = createTeacherAssignmentSchema.parse(request.body);
    return ok(await createTeacherAssignment(input, actorFrom(request)));
  });

  app.get(
    "/teacher/assignments/:id/results",
    { preHandler: requireTeacherAuth },
    async (request) => {
      return ok(
        await getTeacherAssignmentResults(readParamId(request, "Ödev"), actorFrom(request)),
      );
    },
  );
}
