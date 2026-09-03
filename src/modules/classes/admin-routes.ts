import type { FastifyInstance, FastifyRequest } from "fastify";
import { ok } from "../../lib/response.js";
import { validationError } from "../../lib/errors.js";
import type { AuthProvider } from "../auth/index.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import {
  assignTeacherToClass,
  createClass,
  getClass,
  listClassStudents,
  listClassTeachers,
  listClasses,
  softDeleteClass,
  updateClass,
  updateClassStatus,
} from "./service.js";
import {
  createClassSchema,
  createTeacherAssignmentSchema,
  listClassesQuerySchema,
  updateClassSchema,
  updateClassStatusSchema,
} from "./schemas.js";

function readParamId(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  if (!id || id.trim().length === 0) {
    throw validationError("Sınıf kimliği gerekli");
  }
  return id;
}

/**
 * Admin / Sınıf yönetimi uçları (yalnızca SUPER_ADMIN).
 *
 *  GET    /admin/classes                          — sınıf listesi (search/tenantId/branchId/academicYearId/status/page)
 *  POST   /admin/classes                          — sınıf oluştur (tenant + şube + akademik yıl + benzersizlik)
 *  GET    /admin/classes/:id                      — sınıf detayı (tenant + şube + yıl + sayaçlar)
 *  PATCH  /admin/classes/:id                      — sınıf düzenle (name/gradeLevel; tenant/şube/yıl değişmez)
 *  DELETE /admin/classes/:id                      — sınıf soft-delete (tarihçe korunur)
 *  PATCH  /admin/classes/:id/status               — durum değiştir (ACTIVE/ARCHIVED)
 *  GET    /admin/classes/:id/students             — sınıfın öğrenci kayıtları (read-only)
 *  GET    /admin/classes/:id/teachers             — sınıfın öğretmen atamaları (read-only)
 *  POST   /admin/classes/:id/teachers             — öğretmen ata (şube üyeliği doğrulanır)
 *
 * NOT: Öğretmen atamasının durum değişikliği / kaldırılması için mevcut
 * öğretmen uçları kullanılır (PATCH/DELETE /admin/teacher-class-assignments/:id);
 * duplicate uç oluşturulmaz. Enrollment da mevcut öğrenci akışı üzerinden
 * yönetilir (POST /admin/students/:id/enrollments, PATCH /admin/enrollments/:id).
 */
export async function classAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const { authProvider } = opts;
  const platformOnly = [requireAuth(authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/classes", { preHandler: platformOnly }, async (request) => {
    const query = listClassesQuerySchema.parse(request.query);
    return ok(await listClasses(query));
  });

  app.post("/admin/classes", { preHandler: platformOnly }, async (request) => {
    const input = createClassSchema.parse(request.body);
    return ok(await createClass(input));
  });

  app.get("/admin/classes/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await getClass(readParamId(request)));
  });

  app.patch("/admin/classes/:id", { preHandler: platformOnly }, async (request) => {
    const input = updateClassSchema.parse(request.body);
    return ok(await updateClass(readParamId(request), input));
  });

  app.patch("/admin/classes/:id/status", { preHandler: platformOnly }, async (request) => {
    const input = updateClassStatusSchema.parse(request.body);
    return ok(await updateClassStatus(readParamId(request), input));
  });

  app.delete("/admin/classes/:id", { preHandler: platformOnly }, async (request) => {
    return ok(await softDeleteClass(readParamId(request)));
  });

  // ---- Sınıf kapsamlı (read-only + class-scoped atama) ----

  app.get("/admin/classes/:id/students", { preHandler: platformOnly }, async (request) => {
    return ok(await listClassStudents(readParamId(request)));
  });

  app.get("/admin/classes/:id/teachers", { preHandler: platformOnly }, async (request) => {
    return ok(await listClassTeachers(readParamId(request)));
  });

  app.post("/admin/classes/:id/teachers", { preHandler: platformOnly }, async (request) => {
    const input = createTeacherAssignmentSchema.parse(request.body);
    return ok(await assignTeacherToClass(readParamId(request), input));
  });
}
