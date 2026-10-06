import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { forbiddenError, validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformOrOrganizationManagement } from "../../middleware/require-management-scope.js";
import type { OrganizationActorInput } from "../organization-admin/policy.js";
import {
  createOrganizationEnrollment,
  createOrganizationAcademicYear,
  createOrganizationStudent,
  deleteOrganizationStudent,
  getOrganizationStudent,
  listOrganizationAcademicYears,
  listOrganizationClassesOption,
  listOrganizationStudentEnrollments,
  listOrganizationStudents,
  updateOrganizationEnrollment,
  updateOrganizationAcademicYear,
  updateOrganizationStudent,
} from "../organization-admin/service.js";
import {
  createStudent,
  getStudent,
  listAcademicYears,
  listClasses,
  listLevels,
  listStudents,
  softDeleteStudent,
  updateStudent,
} from "./service.js";
import {
  createEnrollment,
  listStudentEnrollments,
  updateEnrollment,
} from "./enrollment-service.js";
import {
  createEnrollmentSchema,
  createAcademicYearSchema,
  createStudentSchema,
  listAdminAcademicYearsQuerySchema,
  listAcademicYearsQuerySchema,
  listClassesQuerySchema,
  listStudentsQuerySchema,
  updateEnrollmentSchema,
  updateAcademicYearSchema,
  updateStudentSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Öğrenci kimliği gerekli");
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
 * Admin / Öğrenci yönetimi uçları (yalnızca SUPER_ADMIN).
 *
 *  GET    /admin/students                            — öğrenci listesi (search/tenantId/status)
 *  POST   /admin/students                            — öğrenci oluştur (User + Membership + StudentProfile + Enrollment tek tx)
 *  GET    /admin/students/:id                        — öğrenci detayı (profil bazlı)
 *  PATCH  /admin/students/:id                        — kişisel/hesap/profil düzenle
 *  DELETE /admin/students/:id                        — kullanıcı soft-delete (tarihçe korunur)
 *  GET    /admin/students/:id/enrollments            — öğrencinin sınıf kayıtları
 *  POST   /admin/students/:id/enrollments            — yeni sınıf kaydı
 *  PATCH  /admin/enrollments/:id                     — sınıf kaydı durumu
 *  GET    /admin/student-options/levels              — seviye kataloğu (okuma amaçlı)
 *  GET    /admin/student-options/academic-years      — tenant akademik yılları (lookup)
 *  GET    /admin/academic-years                     — akademik yıl listesi
 *  POST   /admin/academic-years                     — kurum akademik yılı oluştur
 *  PATCH  /admin/academic-years/:id                 — kurum akademik yılı güncelle
 *  GET    /admin/student-options/classes             — tenant sınıfları (okuma amaçlı)
 */
export async function studentAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOrOrganization = [
    requireAuth(authProvider),
    requirePlatformOrOrganizationManagement(["SUPER_ADMIN"]),
  ];

  app.get("/admin/students", { preHandler: platformOrOrganization }, async (request) => {
    const query = listStudentsQuerySchema.parse(request.query);
    if (isOrganizationRequest(request)) {
      return ok(await listOrganizationStudents(organizationActor(request), query));
    }
    return ok(await listStudents(query));
  });

  app.post("/admin/students", { preHandler: platformOrOrganization }, async (request) => {
    const input = createStudentSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(await createOrganizationStudent(organizationActor(request), input));
    }
    return ok(await createStudent(input));
  });

  app.get("/admin/students/:id", { preHandler: platformOrOrganization }, async (request) => {
    if (isOrganizationRequest(request)) {
      return ok(await getOrganizationStudent(organizationActor(request), readParamId(request)));
    }
    return ok(await getStudent(readParamId(request)));
  });

  app.patch("/admin/students/:id", { preHandler: platformOrOrganization }, async (request) => {
    const input = updateStudentSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(
        await updateOrganizationStudent(organizationActor(request), readParamId(request), input),
      );
    }
    return ok(await updateStudent(readParamId(request), input));
  });

  app.delete("/admin/students/:id", { preHandler: platformOrOrganization }, async (request) => {
    if (isOrganizationRequest(request)) {
      return ok(await deleteOrganizationStudent(organizationActor(request), readParamId(request)));
    }
    return ok(await softDeleteStudent(readParamId(request)));
  });

  app.get(
    "/admin/students/:id/enrollments",
    { preHandler: platformOrOrganization },
    async (request) => {
      if (isOrganizationRequest(request)) {
        return ok(
          await listOrganizationStudentEnrollments(
            organizationActor(request),
            readParamId(request),
          ),
        );
      }
      return ok(await listStudentEnrollments(readParamId(request)));
    },
  );

  app.post(
    "/admin/students/:id/enrollments",
    { preHandler: platformOrOrganization },
    async (request) => {
      const input = createEnrollmentSchema.parse(request.body);
      if (isOrganizationRequest(request)) {
        return ok(
          await createOrganizationEnrollment(
            organizationActor(request),
            readParamId(request),
            input,
          ),
        );
      }
      return ok(await createEnrollment(readParamId(request), input));
    },
  );

  app.patch("/admin/enrollments/:id", { preHandler: platformOrOrganization }, async (request) => {
    const input = updateEnrollmentSchema.parse(request.body);
    if (isOrganizationRequest(request)) {
      return ok(
        await updateOrganizationEnrollment(organizationActor(request), readParamId(request), input),
      );
    }
    return ok(await updateEnrollment(readParamId(request), input));
  });

  app.get("/admin/academic-years", { preHandler: platformOrOrganization }, async (request) => {
    const query = listAdminAcademicYearsQuerySchema.parse(request.query);
    if (isOrganizationRequest(request)) {
      return ok(await listOrganizationAcademicYears(organizationActor(request)));
    }
    if (!query.tenantId) throw validationError("Kurum gerekli");
    return ok(await listAcademicYears(query.tenantId));
  });

  app.post("/admin/academic-years", { preHandler: platformOrOrganization }, async (request) => {
    if (!isOrganizationRequest(request)) {
      throw forbiddenError("Akademik yıl yalnızca kurum yönetiminden oluşturulabilir");
    }
    const input = createAcademicYearSchema.parse(request.body);
    return ok(await createOrganizationAcademicYear(organizationActor(request), input));
  });

  app.patch(
    "/admin/academic-years/:id",
    { preHandler: platformOrOrganization },
    async (request) => {
      if (!isOrganizationRequest(request)) {
        throw forbiddenError("Akademik yıl yalnızca kurum yönetiminden güncellenebilir");
      }
      const input = updateAcademicYearSchema.parse(request.body);
      return ok(
        await updateOrganizationAcademicYear(
          organizationActor(request),
          readParamId(request),
          input,
        ),
      );
    },
  );

  // ---- Lookup ----

  app.get("/admin/student-options/levels", { preHandler: platformOrOrganization }, async () => {
    return ok(await listLevels());
  });

  app.get(
    "/admin/student-options/academic-years",
    { preHandler: platformOrOrganization },
    async (request) => {
      const query = listAcademicYearsQuerySchema.parse(request.query);
      if (isOrganizationRequest(request)) {
        return ok(await listOrganizationAcademicYears(organizationActor(request)));
      }
      return ok(await listAcademicYears(query.tenantId));
    },
  );

  app.get(
    "/admin/student-options/classes",
    { preHandler: platformOrOrganization },
    async (request) => {
      const query = listClassesQuerySchema.parse(request.query);
      if (isOrganizationRequest(request)) {
        return ok(
          await listOrganizationClassesOption(organizationActor(request), query.academicYearId),
        );
      }
      return ok(await listClasses(query.tenantId, query.academicYearId));
    },
  );
}
