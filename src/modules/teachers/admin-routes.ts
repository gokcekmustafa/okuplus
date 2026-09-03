import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
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
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/teachers", { preHandler: platformOnly }, async (request) => {
    const query = listTeachersQuerySchema.parse(request.query);
    return ok(await listTeachers(query));
  });

  app.post("/admin/teachers", { preHandler: platformOnly }, async (request) => {
    const input = createTeacherSchema.parse(request.body);
    return ok(await createTeacher(input));
  });

  app.get("/admin/teachers/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getTeacher(readParamId(request)));
  });

  app.patch("/admin/teachers/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateTeacherSchema.parse(request.body);
    return ok(await updateTeacher(readParamId(request), input));
  });

  app.delete("/admin/teachers/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteTeacher(readParamId(request)));
  });

  app.post("/admin/teachers/:id/branches", { preHandler: platformOnly }, async (request) => {
    const input = createTeacherBranchSchema.parse(request.body);
    return ok(await addTeacherBranch(readParamId(request), input));
  });

  app.patch("/admin/teacher-branches/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateTeacherBranchSchema.parse(request.body);
    return ok(await updateTeacherBranch(readParamId(request), input));
  });

  app.delete("/admin/teacher-branches/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await removeTeacherBranch(readParamId(request)));
  });

  app.post("/admin/teachers/:id/classes", { preHandler: platformOnly }, async (request) => {
    const input = createTeacherClassSchema.parse(request.body);
    return ok(await addTeacherClass(readParamId(request), input));
  });

  app.patch(
    "/admin/teacher-class-assignments/:id",
    { preHandler: platformOnly },
    async (request) => {
      const input = updateTeacherClassSchema.parse(request.body);
      return ok(await updateTeacherClass(readParamId(request), input));
    },
  );

  app.delete(
    "/admin/teacher-class-assignments/:id",
    { preHandler: platformOnly },
    async (request) => {
      return ok(await removeTeacherClass(readParamId(request)));
    },
  );

  // ---- Lookup (yalnızca okuma; Branch/Class/AcademicYear CRUD değil) ----

  app.get("/admin/teacher-options/branches", { preHandler: platformOnly }, async (request) => {
    const query = listBranchesQuerySchema.parse(request.query);
    return ok(await listBranches(query.tenantId));
  });

  app.get("/admin/teacher-options/classes", { preHandler: platformOnly }, async (request) => {
    const query = listClassesQuerySchema.parse(request.query);
    return ok(await listClasses(query.tenantId, query.academicYearId));
  });
}
