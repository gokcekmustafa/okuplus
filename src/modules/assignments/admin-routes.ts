import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformOrOrganizationManagement } from "../../middleware/require-management-scope.js";
import type { OrganizationActorInput } from "../organization-admin/policy.js";
import {
  createOrganizationAssignment,
  deleteOrganizationAssignment,
  getOrganizationAssignment,
  listOrganizationAssignments,
  listOrganizationClassAssignments,
  updateOrganizationAssignment,
  updateOrganizationAssignmentStatus,
} from "../organization-admin/service.js";
import {
  createAssignment,
  deleteAssignment,
  getAssignment,
  listAssignments,
  listClassAssignments,
  updateAssignment,
  updateAssignmentStatus,
} from "./service.js";
import {
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest, label: string, key = "id"): string {
  const id = (request.params as Record<string, string | undefined>)[key];
  if (!id || id.trim().length === 0) throw validationError(`${label} kimliği gerekli`);
  return id;
}

function isOrganizationRequest(request: FastifyRequest): boolean {
  return request.authUser?.platformRole === null;
}

function organizationActor(request: FastifyRequest): OrganizationActorInput {
  return {
    userId: request.authUser!.id,
    tenantId: request.tenantContext?.tenantId ?? null,
    role: request.tenantContext?.role ?? null,
    platformRole: null,
  };
}

/**
 * Ödev yönetimi uçları (SUPER_ADMIN).
 *
 *  GET    /admin/assignments                    — ödev listesi
 *  POST   /admin/assignments                    — ödev oluştur
 *  GET    /admin/assignments/:id                — ödev detayı
 *  PATCH  /admin/assignments/:id                — ödev düzenle (sadece DRAFT)
 *  PATCH  /admin/assignments/:id/status         — durum değiştir
 *  DELETE /admin/assignments/:id                — soft-delete (sadece DRAFT)
 *  GET    /admin/classes/:classId/assignments   — sınıfa ait ödevler
 */
export async function assignmentAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOrOrganization = [
    requireAuth(authProvider),
    requirePlatformOrOrganizationManagement(["SUPER_ADMIN"]),
  ];

  app.get("/admin/assignments", { preHandler: platformOrOrganization }, async (request) => {
    const query = listAssignmentsQuerySchema.parse(request.query);
    if (isOrganizationRequest(request)) {
      return ok(await listOrganizationAssignments(organizationActor(request), query));
    }
    return ok(await listAssignments(query));
  });

  app.post("/admin/assignments", { preHandler: platformOrOrganization }, async (request) => {
    const input = createAssignmentSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(await createOrganizationAssignment(organizationActor(request), input));
    }
    return ok(await createAssignment(input, request.authUser?.id));
  });

  app.get("/admin/assignments/:id", { preHandler: platformOrOrganization }, async (request) => {
    if (isOrganizationRequest(request)) {
      return ok(
        await getOrganizationAssignment(organizationActor(request), readParamId(request, "Ödev")),
      );
    }
    return ok(await getAssignment(readParamId(request, "Ödev")));
  });

  app.patch("/admin/assignments/:id", { preHandler: platformOrOrganization }, async (request) => {
    const input = updateAssignmentSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(
        await updateOrganizationAssignment(
          organizationActor(request),
          readParamId(request, "Ödev"),
          input,
        ),
      );
    }
    return ok(await updateAssignment(readParamId(request, "Ödev"), input));
  });

  app.patch(
    "/admin/assignments/:id/status",
    { preHandler: platformOrOrganization },
    async (request) => {
      const input = updateAssignmentStatusSchema.parse(request.body);
      if (isOrganizationRequest(request)) {
        return ok(
          await updateOrganizationAssignmentStatus(
            organizationActor(request),
            readParamId(request, "Ödev"),
            input,
          ),
        );
      }
      return ok(await updateAssignmentStatus(readParamId(request, "Ödev"), input));
    },
  );

  app.delete("/admin/assignments/:id", { preHandler: platformOrOrganization }, async (request) => {
    if (isOrganizationRequest(request)) {
      return ok(
        await deleteOrganizationAssignment(
          organizationActor(request),
          readParamId(request, "Ödev"),
        ),
      );
    }
    return ok(await deleteAssignment(readParamId(request, "Ödev")));
  });

  app.get(
    "/admin/classes/:classId/assignments",
    { preHandler: platformOrOrganization },
    async (request) => {
      if (isOrganizationRequest(request)) {
        return ok(
          await listOrganizationClassAssignments(
            organizationActor(request),
            readParamId(request, "Sınıf", "classId"),
          ),
        );
      }
      return ok(await listClassAssignments(readParamId(request, "Sınıf", "classId")));
    },
  );
}
