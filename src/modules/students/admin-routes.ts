import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
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
  createStudentSchema,
  listAcademicYearsQuerySchema,
  listClassesQuerySchema,
  listStudentsQuerySchema,
  updateEnrollmentSchema,
  updateStudentSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Öğrenci kimliği gerekli");
  }
  return id;
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
 *  GET    /admin/student-options/academic-years      — tenant akademik yılları (okuma amaçlı)
 *  GET    /admin/student-options/classes             — tenant sınıfları (okuma amaçlı)
 */
export async function studentAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/students", { preHandler: platformOnly }, async (request) => {
    const query = listStudentsQuerySchema.parse(request.query);
    return ok(await listStudents(query));
  });

  app.post("/admin/students", { preHandler: platformOnly }, async (request) => {
    const input = createStudentSchema.parse(request.body);
    return ok(await createStudent(input));
  });

  app.get("/admin/students/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getStudent(readParamId(request)));
  });

  app.patch("/admin/students/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateStudentSchema.parse(request.body);
    return ok(await updateStudent(readParamId(request), input));
  });

  app.delete("/admin/students/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteStudent(readParamId(request)));
  });

  app.get("/admin/students/:id/enrollments", { preHandler: platformOnly }, async (request) => {
    return ok(await listStudentEnrollments(readParamId(request)));
  });

  app.post("/admin/students/:id/enrollments", { preHandler: platformOnly }, async (request) => {
    const input = createEnrollmentSchema.parse(request.body);
    return ok(await createEnrollment(readParamId(request), input));
  });

  app.patch("/admin/enrollments/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateEnrollmentSchema.parse(request.body);
    return ok(await updateEnrollment(readParamId(request), input));
  });

  // ---- Lookup (yalnızca okuma; Class/AcademicYear CRUD değil) ----

  app.get("/admin/student-options/levels", { preHandler: platformOnly }, async () => {
    return ok(await listLevels());
  });

  app.get(
    "/admin/student-options/academic-years",
    { preHandler: platformOnly },
    async (request) => {
      const query = listAcademicYearsQuerySchema.parse(request.query);
      return ok(await listAcademicYears(query.tenantId));
    },
  );

  app.get("/admin/student-options/classes", { preHandler: platformOnly }, async (request) => {
    const query = listClassesQuerySchema.parse(request.query);
    return ok(await listClasses(query.tenantId, query.academicYearId));
  });
}
