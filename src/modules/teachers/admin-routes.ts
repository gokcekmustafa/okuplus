import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformOrOrganizationManagement } from "../../middleware/require-management-scope.js";
import type { OrganizationActorInput } from "../organization-admin/policy.js";
import {
  addOrganizationTeacherBranch,
  addOrganizationTeacherClass,
  createOrganizationTeacher,
  deleteOrganizationTeacher,
  getOrganizationTeacher,
  listOrganizationBranchesOption,
  listOrganizationClassesOption,
  listOrganizationTeacherCandidates,
  listOrganizationTeachers,
  removeOrganizationTeacherBranch,
  removeOrganizationTeacherClass,
  updateOrganizationTeacher,
  updateOrganizationTeacherBranch,
  updateOrganizationTeacherClass,
} from "../organization-admin/service.js";
import {
  addTeacherBranch,
  addTeacherClass,
  createTeacher,
  getTeacher,
  listBranches,
  listClasses,
  listTeachers,
  removeTeacherBranch,
  removeTeacherClass,
  softDeleteTeacher,
  updateTeacher,
  updateTeacherBranch,
  updateTeacherClass,
} from "./service.js";
import {
  createTeacherBranchSchema,
  createTeacherClassSchema,
  createTeacherSchema,
  listBranchesQuerySchema,
  listClassesQuerySchema,
  listTeachersQuerySchema,
  updateTeacherBranchSchema,
  updateTeacherClassSchema,
  updateTeacherSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Kayıt kimliği gerekli");
  }
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
 * Admin / Öğretmen yönetimi uçları (yalnızca SUPER_ADMIN).
 *
 *  GET    /admin/teachers                          — öğretmen listesi (search/tenantId/status)
 *  POST   /admin/teachers                          — öğretmen oluştur (User + TEACHER Membership tek tx)
 *  GET    /admin/teachers/:id                      — öğretmen detayı (user bazlı; üyelik + şube + sınıf)
 *  PATCH  /admin/teachers/:id                      — kişisel/hesap düzenle
 *  DELETE /admin/teachers/:id                      — kullanıcı soft-delete (tarihçe korunur)
 *  POST   /admin/teachers/:id/branches             — şube üyeliği ekle
 *  PATCH  /admin/teacher-branches/:id              — şube üyeliği durumu
 *  DELETE /admin/teacher-branches/:id              — şube üyeliği kaldır
 *  POST   /admin/teachers/:id/classes              — sınıf ataması ekle
 *  PATCH  /admin/teacher-class-assignments/:id     — sınıf ataması durumu
 *  DELETE /admin/teacher-class-assignments/:id     — sınıf ataması kaldır
 *  GET    /admin/teacher-options/branches          — tenant şubeleri (okuma amaçlı)
 *  GET    /admin/teacher-options/classes           — tenant sınıfları (okuma amaçlı)
 */
export async function teacherAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOrOrganization = [
    requireAuth(authProvider),
    requirePlatformOrOrganizationManagement(["SUPER_ADMIN"]),
  ];

  app.get("/admin/teachers", { preHandler: platformOrOrganization }, async (request) => {
    const query = listTeachersQuerySchema.parse(request.query);
    if (isOrganizationRequest(request)) {
      return ok(await listOrganizationTeachers(organizationActor(request), query));
    }
    return ok(await listTeachers(query));
  });

  app.post("/admin/teachers", { preHandler: platformOrOrganization }, async (request) => {
    const input = createTeacherSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(await createOrganizationTeacher(organizationActor(request), input));
    }
    return ok(await createTeacher(input));
  });

  app.get("/admin/teachers/:id", { preHandler: platformOrOrganization }, async (request) => {
    if (isOrganizationRequest(request)) {
      return ok(await getOrganizationTeacher(organizationActor(request), readParamId(request)));
    }
    return ok(await getTeacher(readParamId(request)));
  });

  app.patch("/admin/teachers/:id", { preHandler: platformOrOrganization }, async (request) => {
    const input = updateTeacherSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(
        await updateOrganizationTeacher(organizationActor(request), readParamId(request), input),
      );
    }
    return ok(await updateTeacher(readParamId(request), input));
  });

  app.delete("/admin/teachers/:id", { preHandler: platformOrOrganization }, async (request) => {
    if (isOrganizationRequest(request)) {
      return ok(await deleteOrganizationTeacher(organizationActor(request), readParamId(request)));
    }
    return ok(await softDeleteTeacher(readParamId(request)));
  });

  app.post(
    "/admin/teachers/:id/branches",
    { preHandler: platformOrOrganization },
    async (request) => {
      const input = createTeacherBranchSchema.parse(request.body);
      if (isOrganizationRequest(request)) {
        return ok(
          await addOrganizationTeacherBranch(
            organizationActor(request),
            readParamId(request),
            input,
          ),
        );
      }
      return ok(await addTeacherBranch(readParamId(request), input));
    },
  );

  app.patch(
    "/admin/teacher-branches/:id",
    { preHandler: platformOrOrganization },
    async (request) => {
      const input = updateTeacherBranchSchema.parse(request.body);
      if (isOrganizationRequest(request)) {
        return ok(
          await updateOrganizationTeacherBranch(
            organizationActor(request),
            readParamId(request),
            input,
          ),
        );
      }
      return ok(await updateTeacherBranch(readParamId(request), input));
    },
  );

  app.delete(
    "/admin/teacher-branches/:id",
    { preHandler: platformOrOrganization },
    async (request) => {
      if (isOrganizationRequest(request)) {
        return ok(
          await removeOrganizationTeacherBranch(organizationActor(request), readParamId(request)),
        );
      }
      return ok(await removeTeacherBranch(readParamId(request)));
    },
  );

  app.post(
    "/admin/teachers/:id/classes",
    { preHandler: platformOrOrganization },
    async (request) => {
      const input = createTeacherClassSchema.parse(request.body);
      if (isOrganizationRequest(request)) {
        return ok(
          await addOrganizationTeacherClass(
            organizationActor(request),
            readParamId(request),
            input,
          ),
        );
      }
      return ok(await addTeacherClass(readParamId(request), input));
    },
  );

  app.patch(
    "/admin/teacher-class-assignments/:id",
    { preHandler: platformOrOrganization },
    async (request) => {
      const input = updateTeacherClassSchema.parse(request.body);
      if (isOrganizationRequest(request)) {
        return ok(
          await updateOrganizationTeacherClass(
            organizationActor(request),
            readParamId(request),
            input,
          ),
        );
      }
      return ok(await updateTeacherClass(readParamId(request), input));
    },
  );

  app.delete(
    "/admin/teacher-class-assignments/:id",
    { preHandler: platformOrOrganization },
    async (request) => {
      if (isOrganizationRequest(request)) {
        return ok(
          await removeOrganizationTeacherClass(organizationActor(request), readParamId(request)),
        );
      }
      return ok(await removeTeacherClass(readParamId(request)));
    },
  );

  // ---- Lookup (yalnızca okuma; Branch/Class/AcademicYear CRUD değil) ----

  app.get(
    "/admin/teacher-options/branches",
    { preHandler: platformOrOrganization },
    async (request) => {
      const query = listBranchesQuerySchema.parse(request.query);
      if (isOrganizationRequest(request)) {
        return ok(await listOrganizationBranchesOption(organizationActor(request)));
      }
      return ok(await listBranches(query.tenantId));
    },
  );

  app.get(
    "/admin/teacher-options/classes",
    { preHandler: platformOrOrganization },
    async (request) => {
      const query = listClassesQuerySchema.parse(request.query);
      if (isOrganizationRequest(request)) {
        return ok(
          await listOrganizationClassesOption(
            organizationActor(request),
            query.academicYearId,
            query.branchId,
          ),
        );
      }
      return ok(await listClasses(query.tenantId, query.academicYearId, query.branchId));
    },
  );

  app.get(
    "/admin/teacher-options/candidates",
    { preHandler: platformOrOrganization },
    async (request) => {
      if (isOrganizationRequest(request)) {
        return ok(await listOrganizationTeacherCandidates(organizationActor(request)));
      }
      return ok([]);
    },
  );
}
