import { Prisma, type AssessmentStatus, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import {
  findCanonicalPlacementAssessment,
  selectCanonicalPlacementAssessment,
} from "./canonical-selector.js";
import type {
  CreateAssessmentInput,
  ListAssessmentsQuery,
  UpdateAssessmentInput,
  UpdateAssessmentStatusInput,
} from "./schemas.js";

/**
 * Ölçme & Değerlendirme servisi.
 *
 * Oluşturma kuralları:
 *  - title gerekli.
 *  - config.templateId gerekli, ilgili template PUBLISHED olmalı.
 *  - config.templateVersionId opsiyonel; belirtilmezse template'in PUBLISHED version'u kullanılır.
 *
 * Status machine: DRAFT → PUBLISHED → ARCHIVED
 *  - Geçersiz geçiş → 400
 *  - DRAFT: düzenlenebilir, silinebilir
 *  - PUBLISHED: başlık/düzenlenebilir, archive yapılabilir
 *  - ARCHIVED: hiçbir düzenleme yapılamaz
 *
 * Soft-delete: deletedAt set edilir. Fiziksel silme yoktur.
 */

const VALID_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

const ASSESSMENT_LIST_SELECT = {
  id: true,
  tenantId: true,
  title: true,
  type: true,
  levelId: true,
  config: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  level: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  _count: { select: { sessions: true, results: true } },
} satisfies Prisma.AssessmentSelect;

export interface AssessmentListItem {
  id: string;
  tenantId: string | null;
  title: string;
  type: string;
  levelId: string | null;
  levelName: string | null;
  config: Prisma.JsonValue | null;
  status: AssessmentStatus;
  createdByName: string | null;
  sessionCount: number;
  resultCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentListResult {
  items: AssessmentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type AssessmentDetail = AssessmentListItem;

export async function listAssessments(query: ListAssessmentsQuery): Promise<AssessmentListResult> {
  const { search, type, status, page, pageSize } = query;

  const where: Prisma.AssessmentWhereInput = {
    deletedAt: null,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.assessment.findMany({
      where,
      select: ASSESSMENT_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assessment.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      title: r.title,
      type: r.type,
      levelId: r.levelId,
      levelName: r.level?.name ?? null,
      config: r.config,
      status: r.status,
      createdByName: r.createdBy?.displayName ?? null,
      sessionCount: r._count.sessions,
      resultCount: r._count.results,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getAssessment(id: string): Promise<AssessmentDetail> {
  const row = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    select: ASSESSMENT_LIST_SELECT,
  });
  if (!row) throw notFoundError("Değerlendirme bulunamadı");

  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    type: row.type,
    levelId: row.levelId,
    levelName: row.level?.name ?? null,
    config: row.config,
    status: row.status,
    createdByName: row.createdBy?.displayName ?? null,
    sessionCount: row._count.sessions,
    resultCount: row._count.results,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createAssessment(
  input: CreateAssessmentInput,
  actorId?: string,
): Promise<AssessmentDetail> {
  // Config templateId doğrula
  const config = input.config as { templateId: string; templateVersionId?: string } | undefined;
  if (!config?.templateId) {
    throw validationError("config.templateId gerekli");
  }

  const template = await prisma.exerciseTemplate.findFirst({
    where: { id: config.templateId, deletedAt: null },
    select: { id: true, tenantId: true, status: true },
  });
  if (!template) throw notFoundError("Şablon bulunamadı");
  if (template.status !== "PUBLISHED") throw validationError("Şablon yayınlanmış olmalı");

  // TemplateVersion doğrula
  let templateVersionId = config.templateVersionId;
  if (!templateVersionId) {
    const tv = await prisma.exerciseTemplateVersion.findFirst({
      where: { templateId: config.templateId, status: "PUBLISHED" },
      select: { id: true },
      orderBy: { version: "desc" },
    });
    if (!tv) throw validationError("Şablonun yayınlanmış sürümü bulunamadı");
    templateVersionId = tv.id;
  } else {
    const tv = await prisma.exerciseTemplateVersion.findUnique({
      where: { id: templateVersionId },
      select: { id: true, status: true, templateId: true },
    });
    if (!tv || tv.templateId !== config.templateId) {
      throw validationError("Geçersiz şablon sürümü");
    }
    if (tv.status !== "PUBLISHED") throw validationError("Şablon sürümü yayınlanmış olmalı");
  }

  // Tenant belirleme: template global ise null, değilse template.tenantId
  const tenantId = template.tenantId;

  const created = await prisma.assessment.create({
    data: {
      tenantId,
      title: input.title,
      type: input.type ?? "PLACEMENT",
      levelId: input.levelId ?? null,
      config: { ...config, templateVersionId } as Prisma.InputJsonValue,
      createdById: actorId ?? null,
    },
    select: { id: true },
  });

  return getAssessment(created.id);
}

export async function updateAssessment(
  id: string,
  input: UpdateAssessmentInput,
): Promise<AssessmentDetail> {
  const existing = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) throw notFoundError("Değerlendirme bulunamadı");

  if (existing.status !== "DRAFT" && existing.status !== "PUBLISHED") {
    throw validationError("Bu değerlendirme düzenlenemez");
  }

  await prisma.assessment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.levelId !== undefined ? { levelId: input.levelId } : {}),
    },
  });

  return getAssessment(id);
}

export async function updateAssessmentStatus(
  id: string,
  input: UpdateAssessmentStatusInput,
): Promise<AssessmentDetail> {
  const existing = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) throw notFoundError("Değerlendirme bulunamadı");

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(input.status)) {
    throw validationError(`"${existing.status}" durumundan "${input.status}" durumuna geçilemez`);
  }

  await prisma.assessment.update({ where: { id }, data: { status: input.status } });
  return getAssessment(id);
}

export async function deleteAssessment(id: string): Promise<{ id: string; deletedAt: Date }> {
  const existing = await prisma.assessment.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFoundError("Değerlendirme bulunamadı");

  if (existing.status !== "DRAFT") {
    throw validationError("Sadece taslak değerlendirmeler silinebilir");
  }

  const updated = await prisma.assessment.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  return { id: updated.id, deletedAt: updated.deletedAt! };
}

// ---------- Öğrenci servisleri ----------

const VISIBLE_ASSESSMENT_STATUSES = ["PUBLISHED"] as const;

export interface StudentAssessmentListItem {
  id: string;
  title: string;
  type: string;
  levelName: string | null;
  questionCount: number;
  hasInProgressSession: boolean;
  inProgressSessionId: string | null;
  hasResult: boolean;
  status: string;
  sessionStatus: string | null;
  attemptedCount: number;
  score: number | null;
  completedAt: Date | null;
  resultLevelName: string | null;
  organizationName: string | null;
}

export interface StudentAssessmentListResult {
  items: StudentAssessmentListItem[];
  total: number;
}

export async function listStudentAssessments(actor: {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}): Promise<StudentAssessmentListResult> {
  const where: Prisma.AssessmentWhereInput = {
    deletedAt: null,
    status: { in: [...VISIBLE_ASSESSMENT_STATUSES] },
    OR: actor.tenantId ? [{ tenantId: null }, { tenantId: actor.tenantId }] : [{ tenantId: null }],
  };

  const rows = await prisma.assessment.findMany({
    where,
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      config: true,
      deletedAt: true,
      level: { select: { name: true } },
      tenantId: true,
      _count: { select: { sessions: true, results: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const canonicalPlacementSelection = selectCanonicalPlacementAssessment(
    rows.filter((row) => row.type === "PLACEMENT"),
    actor.tenantId,
  );
  if (canonicalPlacementSelection.status === "CONFLICT") {
    throw conflictError("Birden fazla aktif canonical placement assessment bulundu");
  }
  const visibleRows = rows.filter(
    (row) =>
      row.type !== "PLACEMENT" ||
      (canonicalPlacementSelection.status === "FOUND" &&
        canonicalPlacementSelection.assessment.id === row.id),
  );

  // ÖğrencininInProgress session'larını bul
  const assessmentIds = visibleRows.map((r) => r.id);
  let studentSessions: Array<{
    assessmentId: string | null;
    id: string;
    status: string;
    _count: { attempts: number };
  }> = [];
  let studentResults: Array<{
    assessmentId: string;
    score: number | null;
    completedAt: Date;
    resultLevel: { name: string } | null;
  }> = [];
  if (assessmentIds.length > 0) {
    [studentSessions, studentResults] = await Promise.all([
      prisma.exerciseSession.findMany({
        where: {
          assessmentId: { in: assessmentIds },
          studentId: actor.userId,
        },
        select: {
          assessmentId: true,
          id: true,
          status: true,
          _count: { select: { attempts: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.assessmentResult.findMany({
        where: { assessmentId: { in: assessmentIds }, studentId: actor.userId },
        select: {
          assessmentId: true,
          score: true,
          completedAt: true,
          resultLevel: { select: { name: true } },
        },
        orderBy: { completedAt: "desc" },
      }),
    ]);
  }
  const sessionByAssessment = new Map<string, (typeof studentSessions)[number]>();
  for (const session of studentSessions)
    if (session.assessmentId && !sessionByAssessment.has(session.assessmentId))
      sessionByAssessment.set(session.assessmentId, session);
  const resultByAssessment = new Map<string, (typeof studentResults)[number]>();
  for (const result of studentResults)
    if (!resultByAssessment.has(result.assessmentId))
      resultByAssessment.set(result.assessmentId, result);

  return {
    items: visibleRows.map((r) => {
      const config = r.config as { questionCount?: number } | null;
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        levelName: r.level?.name ?? null,
        questionCount: config?.questionCount ?? 0,
        hasInProgressSession: sessionByAssessment.get(r.id)?.status === "IN_PROGRESS",
        inProgressSessionId:
          sessionByAssessment.get(r.id)?.status === "IN_PROGRESS"
            ? sessionByAssessment.get(r.id)!.id
            : null,
        hasResult: resultByAssessment.has(r.id),
        status: "PUBLISHED",
        sessionStatus: sessionByAssessment.get(r.id)?.status ?? null,
        attemptedCount: sessionByAssessment.get(r.id)?._count.attempts ?? 0,
        score: resultByAssessment.get(r.id)?.score ?? null,
        completedAt: resultByAssessment.get(r.id)?.completedAt ?? null,
        resultLevelName: resultByAssessment.get(r.id)?.resultLevel?.name ?? null,
        organizationName: r.tenantId,
      };
    }),
    total: visibleRows.length,
  };
}

export async function getStudentAssessment(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<StudentAssessmentListItem> {
  const row = await prisma.assessment.findFirst({
    where: {
      id,
      deletedAt: null,
      status: { in: [...VISIBLE_ASSESSMENT_STATUSES] },
      OR: actor.tenantId
        ? [{ tenantId: null }, { tenantId: actor.tenantId }]
        : [{ tenantId: null }],
    },
    select: {
      id: true,
      title: true,
      type: true,
      config: true,
      level: { select: { name: true } },
      tenantId: true,
    },
  });
  if (!row) throw notFoundError("Değerlendirme bulunamadı");

  if (row.type === "PLACEMENT") {
    const canonical = await findCanonicalPlacementAssessment(prisma, actor.tenantId);
    if (!canonical || canonical.id !== row.id) {
      throw notFoundError("Değerlendirme bulunamadı");
    }
  }

  const inProgressSession = await prisma.exerciseSession.findFirst({
    where: {
      assessmentId: id,
      studentId: actor.userId,
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });

  const result = await prisma.assessmentResult.findFirst({
    where: {
      assessmentId: id,
      studentId: actor.userId,
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    },
    select: { score: true, completedAt: true, resultLevel: { select: { name: true } } },
    orderBy: { completedAt: "desc" },
  });

  const config = row.config as { questionCount?: number } | null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    levelName: row.level?.name ?? null,
    questionCount: config?.questionCount ?? 0,
    hasInProgressSession: !!inProgressSession,
    inProgressSessionId: inProgressSession?.id ?? null,
    hasResult: !!result,
    status: "PUBLISHED",
    sessionStatus: inProgressSession ? "IN_PROGRESS" : result ? "COMPLETED" : null,
    attemptedCount: 0,
    score: result?.score ?? null,
    completedAt: result?.completedAt ?? null,
    resultLevelName: result?.resultLevel?.name ?? null,
    organizationName: row.tenantId,
  };
}

export async function startAssessmentSession(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<{ sessionId: string; isNew: boolean }> {
  // Assessment getir
  const assessment = await prisma.assessment.findFirst({
    where: {
      id,
      deletedAt: null,
      status: "PUBLISHED",
      ...(actor.tenantId ? { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      type: true,
      config: true,
    },
  });
  if (!assessment) throw notFoundError("Değerlendirme bulunamadı");

  if (assessment.type === "PLACEMENT") {
    const canonical = await findCanonicalPlacementAssessment(prisma, actor.tenantId);
    if (!canonical || canonical.id !== assessment.id) {
      throw notFoundError("Değerlendirme bulunamadı");
    }
  }

  // Config'den templateVersionId al
  const config = assessment.config as { templateId?: string; templateVersionId?: string } | null;
  if (!config?.templateVersionId) {
    throw validationError("Değerlendirmenin şablon sürümü tanımlı değil");
  }

  // TemplateVersion doğrula
  const templateVersion = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: config.templateVersionId },
    select: { id: true, status: true },
  });
  if (!templateVersion || templateVersion.status !== "PUBLISHED") {
    throw validationError("Şablon sürümü yayınlanmış değil");
  }

  // Mevcut IN_PROGRESS session var mı?
  const existingSession = await prisma.exerciseSession.findFirst({
    where: {
      assessmentId: id,
      studentId: actor.userId,
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });
  if (existingSession) {
    return { sessionId: existingSession.id, isNew: false };
  }

  // Tenant belirleme
  let sessionTenantId = assessment.tenantId;
  if (!sessionTenantId && actor.tenantId) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: actor.userId,
        tenantId: actor.tenantId,
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { tenantId: true },
    });
    if (membership) sessionTenantId = membership.tenantId;
  }
  if (!sessionTenantId) {
    throw forbiddenError("Aktif öğrenci tenant context'i gerekli");
  }

  const created = await prisma.exerciseSession.create({
    data: {
      tenantId: sessionTenantId,
      studentId: actor.userId,
      templateVersionId: config.templateVersionId,
      assessmentId: id,
      context: "ASSESSMENT",
      sessionType: "ASSESSMENT",
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });

  return { sessionId: created.id, isNew: true };
}

export async function getAssessmentResult(
  assessmentId: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
) {
  const result = await prisma.assessmentResult.findFirst({
    where: {
      assessmentId,
      studentId: actor.userId,
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
    },
    select: {
      id: true,
      score: true,
      metrics: true,
      resultLevelId: true,
      completedAt: true,
      resultLevel: { select: { code: true, name: true } },
    },
    orderBy: { completedAt: "desc" },
  });
  return result ?? null;
}
