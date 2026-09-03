-- ============================================================
-- 002 — PARTIAL UNIQUE INDEX'LER
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Prisma `WHERE <koşul>` içeren kısmi unique index ifade edemez.
--       Tüm "aktif kayıt tek olmalı" kuralları burada DB seviyesinde garanti edilir.
-- ============================================================

-- Membership: aynı tenant + user + role için yalnızca bir ACTIVE/PENDING kayıt.
-- (INACTIVE/REMOVED geçmiş kayıtlar saklanabilir.)
CREATE UNIQUE INDEX "uq_membership_active"
  ON "Membership" ("tenantId", "userId", "role")
  WHERE "status" IN ('ACTIVE', 'PENDING');

-- TeacherBranchMembership: aynı teacher + branch için tek aktif kayıt.
CREATE UNIQUE INDEX "uq_teacher_branch_active"
  ON "TeacherBranchMembership" ("branchId", "teacherId")
  WHERE "status" = 'ACTIVE';

-- TeacherClassAssignment: aynı teacher + class için tek aktif kayıt.
CREATE UNIQUE INDEX "uq_teacher_class_active"
  ON "TeacherClassAssignment" ("classId", "teacherId")
  WHERE "status" = 'ACTIVE';

-- Enrollment: aynı öğrenci + akademik yılda tek AKTİF kayıt.
-- (Aynı yıl içinde sınıf değiştirme = eski kayıt ACTIVE değilken yeni kayıt.)
CREATE UNIQUE INDEX "uq_enrollment_student_year_active"
  ON "Enrollment" ("studentId", "academicYearId")
  WHERE "status" = 'ACTIVE';

-- Guardianship: tenant + student + guardian bağlamında tek aktif kayıt.
CREATE UNIQUE INDEX "uq_guardianship_active"
  ON "Guardianship" ("tenantId", "studentId", "guardianId")
  WHERE "status" = 'ACTIVE';

-- Tenant: slug yalnızca ORGANIZATION tipinde unique.
CREATE UNIQUE INDEX "uq_tenant_slug_org"
  ON "Tenant" ("slug")
  WHERE "type" = 'ORGANIZATION';