/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import { recordExerciseCompleted } from "../gamification/service.js";
import { aggregateSessionProgress } from "../progress/aggregation.js";
import {
  PROFICIENCY_LEVEL_CODES,
  type ProficiencyLevelCode,
} from "../../curriculum/proficiency-levels.js";
import {
  PLACEMENT_SCORING_CONTRACT_V1,
  scorePlacementSession,
  type PlacementSessionQuestion,
} from "../assessments/placement-scoring.js";

export interface ExerciseSessionDetail {
  id: string;
  tenantId: string;
  studentId: string;
  templateVersionId: string;
  assignmentId: string | null;
  assessmentId: string | null;
  context: string;
  sessionType: string;
  status: string;
  clientSessionId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  timeSpentMs: number | null;
  scoreSummary: Prisma.JsonValue | null;
  deviceInfo: Prisma.JsonValue | null;
  createdAt: Date;
  templateVersion: {
    id: string;
    version: number;
    status: string;
    templateId: string;
    template: { id: string; title: string; tenantId: string | null; type: string };
  };
  student: { id: string; displayName: string; email: string | null };
  questionCount: number;
  attemptCount: number;
}

export interface ExerciseOptionData {
  students: Array<{ id: string; displayName: string; email: string | null }>;
  templateVersions: Array<{ id: string; version: number; title: string }>;
}

const SESSION_SELECT = {
  id: true,
  tenantId: true,
  studentId: true,
  templateVersionId: true,
  assignmentId: true,
  assessmentId: true,
  context: true,
  sessionType: true,
  status: true,
  clientSessionId: true,
  startedAt: true,
  completedAt: true,
  timeSpentMs: true,
  scoreSummary: true,
  deviceInfo: true,
  createdAt: true,
  templateVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      templateId: true,
      template: { select: { id: true, title: true, tenantId: true, type: true } },
    },
  },
  student: { select: { id: true, displayName: true, email: true } },
  _count: { select: { attempts: true } },
} satisfies Prisma.ExerciseSessionSelect;

export async function createExerciseSession(
  input: import("./schemas.js").CreateExerciseSessionInput,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<ExerciseSessionDetail> {
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";

  // Öğrenci mevcut ve aktif mi?
  const student = await prisma.user.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, status: true, displayName: true },
  });
  if (!student) throw notFoundError("Öğrenci bulunamadı");
  if ((student as any).status !== "ACTIVE") throw validationError("Öğrenci aktif değil");

  // Öğrenci tenant uyumu: STUDENT membership üzerinden tenant doğrula
  // En basit: session tenant'ı öğrencinin tenant'ından türetilecek
  // Eğer input'ta tenant belirtilmiyorsa, öğrencinin ilk ACTIVE membership tenant'ı alınır
  // Ancak API tenantId almıyor, biz actor tenant ve student membership üzerinden doğrulayacağız

  // TemplateVersion kontrolü
  const templateVersion = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: input.templateVersionId },
    select: {
      id: true,
      status: true,
      templateId: true,
      template: { select: { id: true, tenantId: true, status: true, title: true } },
      contents: { select: { contentVersionId: true } },
      questions: { select: { questionVersionId: true } },
    },
  });
  if (!templateVersion) throw notFoundError("Şablon sürümü bulunamadı");

  if (templateVersion.status !== "PUBLISHED") {
    throw validationError("Yalnızca yayınlanmış şablon sürümü ile oturum oluşturulabilir");
  }
  if (
    templateVersion.template.status !== "PUBLISHED" &&
    (templateVersion.template as any).status !== undefined
  ) {
    // ExerciseTemplate status kontrolü — eğer template DRAFT ise de engelle
    // Şchema'da ExerciseTemplateStatus DRAFT/PUBLISHED/ARCHIVED, PUBLISHED olmalı
    const tmpl = templateVersion.template as any;
    if (tmpl.status && tmpl.status !== "PUBLISHED") {
      throw validationError("Şablon yayınlanmamış");
    }
  }

  // Template tenant/global uyumu
  // Eğer template tenantId dolu ise, session tenant'ı aynı olmalı
  // Session tenant'ı = öğrencinin tenant'ı (membership) veya actor tenant
  let sessionTenantId: string;
  if (!isSuperAdmin) {
    if (!actor.tenantId) throw forbiddenError("Aktif tenant context gerekli");
    // Birden fazla üyelikte "ilk üyelik" seçilmez. Auth tarafından doğrulanmış
    // request context ve o context'teki STUDENT üyeliği source of truth'tur.
    const membership = await prisma.membership.findFirst({
      where: {
        userId: input.studentId,
        tenantId: actor.tenantId,
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { tenantId: true },
    });
    if (!membership) throw validationError("Öğrencinin aktif üyeliği bulunamadı");
    sessionTenantId = membership.tenantId;
    if (actor.userId !== input.studentId) {
      // Normal öğrenci başkasının session'ını oluşturamaz
      throw forbiddenError("Başka bir öğrenci adına oturum oluşturamazsınız");
    }
  } else if (actor.tenantId) {
    sessionTenantId = actor.tenantId;
  } else {
    // Mevcut platform-admin davranışı: tenant belirtilmemişse öğrencinin ilk
    // aktif STUDENT üyeliğini kullanır.
    const membership = await prisma.membership.findFirst({
      where: {
        userId: input.studentId,
        role: "STUDENT",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { tenantId: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw validationError("Öğrencinin aktif üyeliği bulunamadı");
    sessionTenantId = membership.tenantId;
  }

  if (
    templateVersion.template.tenantId !== null &&
    templateVersion.template.tenantId !== sessionTenantId
  ) {
    throw validationError("Şablon bu tenant'a ait değil");
  }

  // İçerik ve soru versiyonlarının PUBLISHED kontrolü
  if (templateVersion.contents.length > 0) {
    const contentVersionIds = templateVersion.contents.map((c) => c.contentVersionId);
    const unpublishedContents = await prisma.contentVersion.findMany({
      where: { id: { in: contentVersionIds }, status: { not: "PUBLISHED" } },
      select: { id: true },
    });
    if (unpublishedContents.length > 0) {
      throw validationError("Şablondaki içerik sürümlerinden biri yayınlanmamış");
    }
  }
  if (templateVersion.questions.length > 0) {
    const questionVersionIds = templateVersion.questions.map((q) => q.questionVersionId);
    const unpublishedQuestions = await prisma.questionVersion.findMany({
      where: { id: { in: questionVersionIds }, status: { not: "PUBLISHED" } },
      select: { id: true },
    });
    if (unpublishedQuestions.length > 0) {
      throw validationError("Şablondaki soru sürümlerinden biri yayınlanmamış");
    }
  }

  // Idempotency: clientSessionId unique per student
  if (input.clientSessionId) {
    const existing = await prisma.exerciseSession.findUnique({
      where: {
        studentId_clientSessionId: {
          studentId: input.studentId,
          clientSessionId: input.clientSessionId,
        },
      },
      select: SESSION_SELECT,
    });
    if (existing) return toSessionDetail(existing as any);
  }

  try {
    const created = await prisma.exerciseSession.create({
      data: {
        tenantId: sessionTenantId,
        studentId: input.studentId,
        templateVersionId: input.templateVersionId,
        assignmentId: input.assignmentId ?? null,
        context: (input.context as any) ?? "INDIVIDUAL",
        sessionType: (input.sessionType as any) ?? "PRACTICE",
        clientSessionId: input.clientSessionId ?? null,
        status: "IN_PROGRESS",
      },
      select: SESSION_SELECT,
    });
    return toSessionDetail(created as any);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // clientSessionId duplicate
      throw conflictError("Bu oturum kimliği zaten kullanılmış");
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw validationError("İlişkili kayıt bulunamadı");
    }
    throw err;
  }
}

export async function getExerciseSession(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<ExerciseSessionDetail> {
  const session = await prisma.exerciseSession.findUnique({
    where: { id },
    select: SESSION_SELECT,
  });
  if (!session) throw notFoundError("Oturum bulunamadı");

  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  if (!isSuperAdmin) {
    if (actor.tenantId !== null && session.tenantId !== actor.tenantId) {
      throw forbiddenError("Bu oturuma erişim yetkiniz yok");
    }
    if (session.studentId !== actor.userId) {
      throw forbiddenError("Bu oturum size ait değil");
    }
  }
  return toSessionDetail(session as any);
}

/**
 * Oturum başlatma ekranının dar kapsamlı seçim verisi. Yönetim listeleri
 * kullanılmaz: öğrenci yalnızca kendisini ve kendi tenant'ındaki (ve global)
 * yayınlanmış şablonları görür.
 */
export async function getExerciseOptions(actor: {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
}): Promise<ExerciseOptionData> {
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  const studentWhere: Prisma.UserWhereInput = isSuperAdmin
    ? {
        deletedAt: null,
        status: "ACTIVE",
        memberships: { some: { role: "STUDENT", status: "ACTIVE", deletedAt: null } },
      }
    : { id: actor.userId, deletedAt: null, status: "ACTIVE" };
  const templateWhere: Prisma.ExerciseTemplateVersionWhereInput = {
    status: "PUBLISHED",
    template: {
      deletedAt: null,
      status: "PUBLISHED",
      ...(isSuperAdmin || actor.tenantId === null
        ? {}
        : { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] }),
    },
  };
  const [students, templateVersions] = await Promise.all([
    prisma.user.findMany({
      where: studentWhere,
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.exerciseTemplateVersion.findMany({
      where: templateWhere,
      select: { id: true, version: true, template: { select: { title: true } } },
      orderBy: [{ template: { title: "asc" } }, { version: "desc" }],
    }),
  ]);
  return {
    students,
    templateVersions: templateVersions.map((item) => ({
      id: item.id,
      version: item.version,
      title: item.template.title,
    })),
  };
}

export async function listQuestionsForSession(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<{
  questions: Array<{
    questionVersionId: string;
    position: number;
    contentId: string;
    contentVersionId: string | null;
    prompt: string;
    type: string;
    options: Prisma.JsonValue;
    explanation: string | null;
    hint: string | null;
    blankIds: string[];
  }>;
}> {
  const session = await prisma.exerciseSession.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      templateVersionId: true,
      templateVersion: {
        select: {
          contents: {
            select: {
              contentVersionId: true,
              contentVersion: { select: { contentId: true } },
            },
          },
          questions: {
            select: {
              position: true,
              questionVersion: {
                select: {
                  id: true,
                  prompt: true,
                  options: true,
                  explanation: true,
                  hint: true,
                  correctAnswer: true,
                  question: { select: { type: true, contentId: true } },
                },
              },
            },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });
  if (!session) throw notFoundError("Oturum bulunamadı");
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  if (!isSuperAdmin) {
    if (actor.tenantId !== null && session.tenantId !== actor.tenantId) {
      throw forbiddenError("Bu oturuma erişim yetkiniz yok");
    }
    if (session.studentId !== actor.userId) {
      throw forbiddenError("Bu oturum size ait değil");
    }
  }
  const contentVersionByContentId = new Map(
    session.templateVersion.contents.map((content) => [
      content.contentVersion.contentId,
      content.contentVersionId,
    ]),
  );
  const questions = session.templateVersion.questions.map((q) => {
    const correctAnswer = q.questionVersion.correctAnswer as {
      blanks?: Array<{ blankId?: string }>;
    };
    return {
      questionVersionId: q.questionVersion.id,
      position: q.position,
      contentId: q.questionVersion.question.contentId,
      contentVersionId: contentVersionByContentId.get(q.questionVersion.question.contentId) ?? null,
      prompt: q.questionVersion.prompt,
      type: q.questionVersion.question.type,
      options: q.questionVersion.options,
      explanation: q.questionVersion.explanation,
      hint: q.questionVersion.hint,
      // FILL_BLANK için yalnızca alan kimlikleri gerekir; kabul edilen cevaplar
      // asla öğrenci istemcisine gönderilmez.
      blankIds: Array.isArray(correctAnswer?.blanks)
        ? correctAnswer.blanks
            .map((blank) => blank.blankId)
            .filter((blankId): blankId is string => typeof blankId === "string")
        : [],
    };
  });
  return { questions };
}

export async function completeExerciseSession(
  id: string,
  actor: { userId: string; tenantId: string | null; platformRole: PlatformRole | null },
): Promise<ExerciseSessionDetail> {
  const session = await prisma.exerciseSession.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      assessmentId: true,
      status: true,
      templateVersionId: true,
      templateVersion: {
        select: {
          questions: {
            select: {
              questionVersionId: true,
              questionVersion: {
                select: {
                  question: { select: { type: true, skill: { select: { code: true } } } },
                },
              },
            },
          },
        },
      },
      attempts: { select: { id: true, rawScore: true, questionVersionId: true } },
      assessment: { select: { type: true } },
    },
  });
  if (!session) throw notFoundError("Oturum bulunamadı");
  const isSuperAdmin = actor.platformRole === "SUPER_ADMIN";
  if (!isSuperAdmin) {
    if (actor.tenantId !== null && session.tenantId !== actor.tenantId) {
      throw forbiddenError("Bu oturuma erişim yetkiniz yok");
    }
    if (session.studentId !== actor.userId) {
      throw forbiddenError("Bu oturum size ait değil");
    }
  }
  if (session.status === "COMPLETED") throw validationError("Oturum zaten tamamlanmış");
  if (session.status !== "IN_PROGRESS")
    throw validationError("Yalnızca devam eden oturum tamamlanabilir");

  const totalQuestions = session.templateVersion.questions.length;
  const attempts = session.attempts;
  const scoredAttempts = attempts.filter((a) => a.rawScore !== null);
  const totalRawScore = scoredAttempts.reduce((sum, a) => sum + (a.rawScore ?? 0), 0);
  const averageScore = scoredAttempts.length > 0 ? totalRawScore / scoredAttempts.length : null;
  const openEndedPending = session.templateVersion.questions.filter(
    (q) => q.questionVersion.question.type === "OPEN_ENDED",
  ).length;
  const openEndedAnswered = attempts.filter((a) => {
    const q = session.templateVersion.questions.find(
      (qq) => qq.questionVersionId === a.questionVersionId,
    );
    return q?.questionVersion.question.type === "OPEN_ENDED";
  }).length;

  const placementScoring =
    session.assessment?.type === "PLACEMENT"
      ? scorePlacementSession(
          session.templateVersion.questions.map((question): PlacementSessionQuestion => ({
            questionVersionId: question.questionVersionId,
            questionType: question.questionVersion.question.type,
            skillCode: question.questionVersion.question.skill?.code ?? null,
          })),
          attempts,
          await prisma.level
            .findMany({
              where: { code: { in: [...PROFICIENCY_LEVEL_CODES] } },
              select: { id: true, code: true },
            })
            .then((levels) =>
              levels.map((level) => ({
                id: level.id,
                code: level.code as ProficiencyLevelCode,
              })),
            ),
          PLACEMENT_SCORING_CONTRACT_V1,
        )
      : null;

  const scoreSummary = {
    totalQuestions,
    attempted: attempts.length,
    scoredCount: scoredAttempts.length,
    totalRawScore,
    averageScore,
    openEndedTotal: openEndedPending,
    openEndedAnswered,
    pendingEvaluation: openEndedPending > openEndedAnswered,
    ...(placementScoring
      ? {
          placementScoring: {
            contractVersion: PLACEMENT_SCORING_CONTRACT_V1.version,
            calibrationStatus: PLACEMENT_SCORING_CONTRACT_V1.calibrationStatus,
            score: placementScoring.aggregate.score,
            scoredCount: placementScoring.aggregate.scoredCount,
            eligibleQuestionCount: placementScoring.aggregate.eligibleQuestionCount,
            pendingEvaluationCount: placementScoring.aggregate.pendingEvaluationCount,
            skillSubscores: placementScoring.aggregate.skillSubscores,
            recommendedLevelCode: placementScoring.resolution.recommendedLevelCode,
            resultLevelId: placementScoring.resolution.resultLevelId,
            reviewRequired: placementScoring.resolution.reviewRequired,
            resolutionReason: placementScoring.resolution.reason,
            invalidSkillQuestionCount: placementScoring.invalidSkillQuestionCount,
          },
        }
      : {}),
  };

  const updated = await prisma.exerciseSession.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      scoreSummary: scoreSummary as Prisma.InputJsonValue,
    },
    select: SESSION_SELECT,
  });

  if (session.assessmentId) {
    await prisma.assessmentResult.create({
      data: {
        tenantId: session.tenantId,
        studentId: session.studentId,
        assessmentId: session.assessmentId,
        resultLevelId: placementScoring?.resolution.resultLevelId ?? null,
        score: averageScore,
        metrics: scoreSummary as Prisma.InputJsonValue,
      },
    });
  }

  await recordExerciseCompleted({
    tenantId: session.tenantId,
    studentId: session.studentId,
    sessionId: session.id,
    completedAt: updated.completedAt ?? undefined,
  }).catch(() => null);

  // Progress aggregation — transaction dışında, session completion'ı bozmaz
  void aggregateSessionProgress(id).catch(() => {});

  return toSessionDetail(updated as any);
}

function toSessionDetail(row: any): ExerciseSessionDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    studentId: row.studentId,
    templateVersionId: row.templateVersionId,
    assignmentId: row.assignmentId,
    assessmentId: row.assessmentId ?? null,
    context: row.context,
    sessionType: row.sessionType,
    status: row.status,
    clientSessionId: row.clientSessionId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    timeSpentMs: row.timeSpentMs,
    scoreSummary: row.scoreSummary,
    deviceInfo: row.deviceInfo,
    createdAt: row.createdAt,
    templateVersion: row.templateVersion,
    student: row.student,
    questionCount:
      row.templateVersion?.questions?.length ??
      row._count?.attempts ??
      row.templateVersion?.questions?.length ??
      0,
    attemptCount: row._count?.attempts ?? row.attempts?.length ?? 0,
  };
}
