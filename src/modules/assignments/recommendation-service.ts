import { Prisma, type PlatformRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import { readSkillResults } from "../measurements/service.js";
import { assertTeacherClassAccess, type TeacherAssignmentActor } from "./teacher-service.js";
import { getRecentAssignmentSkillSignals } from "./results-service.js";
import {
  ASSIGNMENT_RECOMMENDATION_RULES,
  buildRecommendationDecisions,
  type AssignmentRecommendationSignal,
} from "./recommendation-rules.js";

export type RecommendationStudentActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

type RecommendationItemRow = Prisma.AssignmentRecommendationGetPayload<{
  include: {
    student: { select: { displayName: true } };
    skill: { select: { code: true; name: true } };
    template: { select: { title: true; type: true } };
  };
}>;

export interface AssignmentRecommendationItem {
  id: string;
  studentId: string;
  studentName: string | null;
  skill: { id: string; code: string; name: string };
  template: { id: string; title: string; type: string };
  templateVersionId: string;
  learningStepId: string | null;
  status: string;
  reasonCode: string;
  reason: string;
  evidence: Prisma.JsonValue;
  assignmentId: string | null;
  generatedAt: Date;
  evaluatedAt: Date;
  expiresAt: Date | null;
}

export interface AssignmentRecommendationEvaluation {
  decisions: ReturnType<typeof buildRecommendationDecisions>;
  unavailable: Array<{ skillCode: string; skillName: string; reason: string }>;
}

export interface AssignmentRecommendationListResponse {
  items: AssignmentRecommendationItem[];
  unavailable: Array<{ skillCode: string; skillName: string; reason: string }>;
}

export interface AssignmentAutomationSettingItem {
  id: string;
  studentId: string | null;
  classId: string | null;
  enabled: boolean;
  maxActiveAssignments: number;
  cooldownHours: number;
}

function requireTenant(actor: RecommendationStudentActor | TeacherAssignmentActor): string {
  if (!actor.tenantId) throw forbiddenError("Öneri işlemi için kurum seçimi gerekli");
  return actor.tenantId;
}

function mapRecommendation(row: RecommendationItemRow): AssignmentRecommendationItem {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.displayName,
    skill: { id: row.skillId, code: row.skill.code, name: row.skill.name },
    template: { id: row.templateId, title: row.template.title, type: row.template.type },
    templateVersionId: row.templateVersionId,
    learningStepId: row.learningStepId,
    status: row.status,
    reasonCode: row.reasonCode,
    reason: row.reason,
    evidence: row.evidence,
    assignmentId: row.assignmentId,
    generatedAt: row.generatedAt,
    evaluatedAt: row.evaluatedAt,
    expiresAt: row.expiresAt,
  };
}

async function loadMeasurementScores(studentId: string, tenantId: string) {
  const rows = await prisma.assessmentResult.findMany({
    where: {
      studentId,
      tenantId,
      assessment: {
        deletedAt: null,
        learningSteps: { none: {} },
      },
    },
    select: { metrics: true, completedAt: true },
    orderBy: { completedAt: "desc" },
    take: 20,
  });
  const latest = new Map<string, number>();
  for (const row of rows) {
    for (const result of readSkillResults(row.metrics)) {
      if (result.score !== null && !latest.has(result.skillCode)) {
        latest.set(result.skillCode, result.score);
      }
    }
  }
  return latest;
}

async function loadCurrentLearningStep(studentId: string, tenantId: string) {
  const enrollment = await prisma.studentLearningPath.findFirst({
    where: {
      studentId,
      tenantId,
      completedAt: null,
      currentStep: {
        is: {
          status: "PUBLISHED",
          isActive: true,
          unit: { path: { status: "PUBLISHED", deletedAt: null } },
        },
      },
    },
    select: {
      currentStep: {
        select: { id: true, title: true, skillId: true, exerciseTemplateVersionId: true },
      },
    },
    orderBy: { startedAt: "desc" },
  });
  return enrollment?.currentStep ?? null;
}

async function loadCandidates(
  tenantId: string,
  skillIds: string[],
  currentStep: { id: string; exerciseTemplateVersionId: string | null } | null,
) {
  if (skillIds.length === 0) return [];
  const rows = await prisma.exerciseTemplate.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      versions: { some: { status: "PUBLISHED" } },
      AND: [
        { OR: [{ tenantId: null }, { tenantId }] },
        {
          OR: [
            { skillId: { in: skillIds } },
            { content: { contentSkills: { some: { skillId: { in: skillIds } } } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      type: true,
      skillId: true,
      content: { select: { contentSkills: { select: { skillId: true } } } },
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true },
      },
    },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  });
  return rows.flatMap((row) => {
    const skillId =
      row.skillId ??
      row.content?.contentSkills
        .filter((item) => skillIds.includes(item.skillId))
        .sort((a, b) => a.skillId.localeCompare(b.skillId))[0]?.skillId;
    const versionId = row.versions[0]?.id ?? null;
    if (!skillId || !versionId) return [];
    return [
      {
        templateId: row.id,
        templateVersionId: versionId,
        templateTitle: row.title,
        templateType: row.type,
        skillId,
        learningStepId:
          currentStep && currentStep.exerciseTemplateVersionId === versionId
            ? currentStep.id
            : null,
      },
    ];
  });
}

async function evaluateForStudent(
  studentId: string,
  tenantId: string,
): Promise<AssignmentRecommendationEvaluation> {
  const [measurementScores, assignmentSignals, currentStep] = await Promise.all([
    loadMeasurementScores(studentId, tenantId),
    getRecentAssignmentSkillSignals(studentId, tenantId),
    loadCurrentLearningStep(studentId, tenantId),
  ]);
  const assignmentBySkill = new Map(assignmentSignals.map((signal) => [signal.skillId, signal]));
  const skillIds = new Set<string>(assignmentSignals.map((signal) => signal.skillId));
  if (currentStep?.skillId) skillIds.add(currentStep.skillId);

  const skills = await prisma.skill.findMany({
    where: {
      OR: [{ id: { in: [...skillIds] } }, { code: { in: [...measurementScores.keys()] } }],
    },
    select: { id: true, code: true, name: true },
  });
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill]));
  for (const code of measurementScores.keys()) {
    const skill = skillByCode.get(code);
    if (skill) skillIds.add(skill.id);
  }
  const candidates = await loadCandidates(tenantId, [...skillIds], currentStep);
  const signals: AssignmentRecommendationSignal[] = skills.map((skill) => {
    const assignmentSignal = assignmentBySkill.get(skill.id);
    return {
      skillId: skill.id,
      skillCode: skill.code,
      skillName: skill.name,
      measurementScore: measurementScores.get(skill.code) ?? null,
      recentAssignmentScores: assignmentSignal?.scores ?? [],
      learningStepId: currentStep?.skillId === skill.id ? currentStep.id : null,
      learningStepTitle: currentStep?.skillId === skill.id ? currentStep.title : null,
    };
  });
  const decisions = buildRecommendationDecisions(signals, candidates);
  const candidateSkillIds = new Set(candidates.map((candidate) => candidate.skillId));
  const unavailable = signals
    .filter((signal) => {
      const measurementNeed =
        signal.measurementScore !== null &&
        signal.measurementScore < ASSIGNMENT_RECOMMENDATION_RULES.measurementWeakScore;
      const repeatedNeed =
        signal.recentAssignmentScores.length >=
          ASSIGNMENT_RECOMMENDATION_RULES.repeatedAssignmentCount &&
        signal.recentAssignmentScores
          .slice(-ASSIGNMENT_RECOMMENDATION_RULES.repeatedAssignmentCount)
          .every((score) => score < ASSIGNMENT_RECOMMENDATION_RULES.assignmentWeakScore);
      return (measurementNeed || repeatedNeed) && !candidateSkillIds.has(signal.skillId);
    })
    .map((signal) => ({
      skillCode: signal.skillCode,
      skillName: signal.skillName,
      reason: "Bu beceri için uygun ek çalışma bulunamadı.",
    }));
  return { decisions, unavailable };
}

export async function evaluateStudentRecommendations(
  actor: RecommendationStudentActor,
): Promise<AssignmentRecommendationEvaluation> {
  const tenantId = requireTenant(actor);
  return evaluateForStudent(actor.userId, tenantId);
}

export async function persistStudentRecommendations(
  actor: RecommendationStudentActor,
): Promise<AssignmentRecommendationListResponse> {
  const tenantId = requireTenant(actor);
  const evaluation = await evaluateForStudent(actor.userId, tenantId);
  const now = new Date();
  for (const decision of evaluation.decisions) {
    const existing = await prisma.assignmentRecommendation.findUnique({
      where: {
        tenantId_studentId_skillId_templateVersionId: {
          tenantId,
          studentId: actor.userId,
          skillId: decision.skillId,
          templateVersionId: decision.templateVersionId,
        },
      },
      select: { id: true, status: true, expiresAt: true },
    });
    if (existing?.status === "ACCEPTED" || existing?.status === "DISMISSED") continue;
    if (existing?.status === "PENDING" && existing.expiresAt && existing.expiresAt > now) continue;
    await prisma.assignmentRecommendation.upsert({
      where: {
        tenantId_studentId_skillId_templateVersionId: {
          tenantId,
          studentId: actor.userId,
          skillId: decision.skillId,
          templateVersionId: decision.templateVersionId,
        },
      },
      create: {
        tenantId,
        studentId: actor.userId,
        skillId: decision.skillId,
        templateId: decision.templateId,
        templateVersionId: decision.templateVersionId,
        learningStepId: decision.learningStepId,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        evidence: decision.evidence,
        expiresAt: new Date(
          now.getTime() + ASSIGNMENT_RECOMMENDATION_RULES.cooldownHours * 3600000,
        ),
      },
      update: {
        status: "PENDING",
        learningStepId: decision.learningStepId,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
        evidence: decision.evidence,
        evaluatedAt: now,
        expiresAt: new Date(
          now.getTime() + ASSIGNMENT_RECOMMENDATION_RULES.cooldownHours * 3600000,
        ),
        dismissedAt: null,
      },
    });
  }
  const items = await listStudentRecommendationRows(actor.userId, tenantId);
  return { items: items.map(mapRecommendation), unavailable: evaluation.unavailable };
}

async function listStudentRecommendationRows(studentId: string, tenantId: string) {
  return prisma.assignmentRecommendation.findMany({
    where: {
      tenantId,
      studentId,
      OR: [
        { status: "ACCEPTED" },
        { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    },
    include: {
      student: { select: { displayName: true } },
      skill: { select: { code: true, name: true } },
      template: { select: { title: true, type: true } },
    },
    orderBy: [{ status: "asc" }, { generatedAt: "desc" }],
  });
}

export async function listStudentRecommendations(
  actor: RecommendationStudentActor,
): Promise<AssignmentRecommendationListResponse> {
  const tenantId = requireTenant(actor);
  const rows = await listStudentRecommendationRows(actor.userId, tenantId);
  return { items: rows.map(mapRecommendation), unavailable: [] };
}

async function authorizedClassForStudent(
  actor: TeacherAssignmentActor,
  studentId: string,
  classId?: string | null,
): Promise<string> {
  const tenantId = requireTenant(actor);
  if (classId) {
    await assertTeacherClassAccess(actor, classId, studentId);
    return classId;
  }
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      studentId,
      status: "ACTIVE",
      deletedAt: null,
      class: {
        status: "ACTIVE",
        deletedAt: null,
        teacherAssignments: {
          some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
        },
      },
    },
    select: { classId: true },
    orderBy: { enrolledAt: "asc" },
  });
  if (!enrollment) throw forbiddenError("Bu öğrenci için öğretmen yetkiniz yok");
  return enrollment.classId;
}

async function authorizedStudentIds(actor: TeacherAssignmentActor, classId?: string | null) {
  const tenantId = requireTenant(actor);
  const classes = await prisma.class.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      deletedAt: null,
      ...(classId ? { id: classId } : {}),
      teacherAssignments: {
        some: { tenantId, teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
      },
    },
    select: { id: true },
  });
  if (classId && classes.length === 0) throw forbiddenError("Bu sınıf için öğretmen yetkiniz yok");
  const rows = await prisma.enrollment.findMany({
    where: {
      tenantId,
      classId: { in: classes.map((item) => item.id) },
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.map((row) => row.studentId);
}

export async function listTeacherRecommendations(
  actor: TeacherAssignmentActor,
  query: { studentId?: string; classId?: string; status?: "PENDING" | "ACCEPTED" | "DISMISSED" },
): Promise<AssignmentRecommendationListResponse> {
  const tenantId = requireTenant(actor);
  const studentIds = await authorizedStudentIds(actor, query.classId);
  if (query.studentId && !studentIds.includes(query.studentId)) {
    throw forbiddenError("Bu öğrenci için öğretmen yetkiniz yok");
  }
  const rows = await prisma.assignmentRecommendation.findMany({
    where: {
      tenantId,
      studentId: query.studentId ? query.studentId : { in: studentIds },
      ...(query.status
        ? { status: query.status }
        : {
            OR: [
              { status: "ACCEPTED" },
              { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          }),
    },
    include: {
      student: { select: { displayName: true } },
      skill: { select: { code: true, name: true } },
      template: { select: { title: true, type: true } },
    },
    orderBy: [{ status: "asc" }, { generatedAt: "desc" }],
  });
  return { items: rows.map(mapRecommendation), unavailable: [] };
}

export async function refreshTeacherRecommendations(
  actor: TeacherAssignmentActor,
  input: { studentId?: string; classId?: string },
): Promise<AssignmentRecommendationListResponse> {
  const tenantId = requireTenant(actor);
  let studentIds: string[];
  if (input.studentId) {
    await authorizedClassForStudent(actor, input.studentId, input.classId);
    studentIds = [input.studentId];
  } else {
    studentIds = await authorizedStudentIds(actor, input.classId);
  }
  const results = await Promise.all(
    studentIds.map((studentId) =>
      persistStudentRecommendations({ userId: studentId, tenantId, platformRole: null }),
    ),
  );
  return {
    items: results.flatMap((result) => result.items),
    unavailable: results.flatMap((result) => result.unavailable),
  };
}

async function effectiveSetting(tenantId: string, studentId: string) {
  const studentSetting = await prisma.assignmentAutomationSetting.findUnique({
    where: { tenantId_studentId: { tenantId, studentId } },
  });
  if (studentSetting) return studentSetting;
  return prisma.assignmentAutomationSetting.findFirst({
    where: {
      tenantId,
      enabled: true,
      class: {
        enrollments: { some: { studentId, status: "ACTIVE", deletedAt: null } },
        status: "ACTIVE",
        deletedAt: null,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function createRecommendationAssignment(input: {
  recommendationId: string;
  tenantId: string;
  studentId: string;
  classId: string | null;
  source: "SYSTEM" | "MANUAL";
  acceptedById: string | null;
  maxActiveAssignments: number;
}): Promise<{ assignmentId: string; studentAssignmentId: string } | null> {
  return prisma.$transaction(
    async (tx) => {
      const recommendation = await tx.assignmentRecommendation.findFirst({
        where: {
          id: input.recommendationId,
          tenantId: input.tenantId,
          studentId: input.studentId,
          status: "PENDING",
        },
        select: {
          id: true,
          skillId: true,
          templateId: true,
          templateVersionId: true,
          learningStepId: true,
          expiresAt: true,
          template: { select: { title: true, tenantId: true, status: true, deletedAt: true } },
        },
      });
      if (!recommendation) return null;
      if (recommendation.expiresAt && recommendation.expiresAt <= new Date()) return null;
      if (recommendation.template.status !== "PUBLISHED" || recommendation.template.deletedAt) {
        throw validationError("Önerilen çalışma artık yayınlanmış değil");
      }
      if (
        recommendation.template.tenantId !== null &&
        recommendation.template.tenantId !== input.tenantId
      ) {
        throw forbiddenError("Önerilen şablona erişilemiyor");
      }

      const recentSkillWork = await tx.studentAssignment.findFirst({
        where: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          OR: [
            { status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
            {
              assignedAt: {
                gte: new Date(Date.now() - ASSIGNMENT_RECOMMENDATION_RULES.cooldownHours * 3600000),
              },
            },
          ],
          assignment: {
            deletedAt: null,
            template: {
              OR: [
                { skillId: recommendation.skillId },
                { content: { contentSkills: { some: { skillId: recommendation.skillId } } } },
              ],
            },
          },
        },
        select: { assignmentId: true, id: true },
      });
      if (recentSkillWork) return null;

      const activeCount = await tx.studentAssignment.count({
        where: {
          tenantId: input.tenantId,
          studentId: input.studentId,
          source: "SYSTEM",
          status: { in: ["ASSIGNED", "IN_PROGRESS"] },
          assignment: { status: { in: ["SCHEDULED", "ACTIVE"] }, deletedAt: null },
        },
      });
      if (activeCount >= Math.max(1, input.maxActiveAssignments)) return null;

      const tenant = await tx.tenant.findUnique({
        where: { id: input.tenantId },
        select: { type: true, status: true, deletedAt: true },
      });
      if (!tenant || tenant.status !== "ACTIVE" || tenant.deletedAt) {
        throw forbiddenError("Kurum aktif değil");
      }
      if (tenant.type === "ORGANIZATION" && !input.classId) {
        throw validationError("Kurumsal otomatik ödev için sınıf gerekli");
      }
      if (input.classId) {
        const enrollment = await tx.enrollment.findFirst({
          where: {
            tenantId: input.tenantId,
            classId: input.classId,
            studentId: input.studentId,
            status: "ACTIVE",
            deletedAt: null,
            class: { status: "ACTIVE", deletedAt: null },
          },
          select: { id: true },
        });
        if (!enrollment) throw forbiddenError("Öğrenci bu sınıfta aktif değil");
      }

      const version = await tx.exerciseTemplateVersion.findFirst({
        where: {
          id: recommendation.templateVersionId,
          templateId: recommendation.templateId,
          status: "PUBLISHED",
        },
        select: { id: true },
      });
      if (!version) throw validationError("Önerilen çalışmanın yayınlanmış sürümü bulunamadı");

      if (recommendation.learningStepId) {
        const step = await tx.learningStep.findFirst({
          where: {
            id: recommendation.learningStepId,
            OR: [{ tenantId: null }, { tenantId: input.tenantId }],
            status: "PUBLISHED",
            isActive: true,
            unit: { path: { status: "PUBLISHED", deletedAt: null } },
          },
          select: { exerciseTemplateVersionId: true },
        });
        if (!step) throw validationError("Önerinin öğrenme adımı artık kullanılamıyor");
        if (step.exerciseTemplateVersionId && step.exerciseTemplateVersionId !== version.id) {
          throw validationError("Önerinin şablon sürümü artık eşleşmiyor");
        }
      }

      const assignment = await tx.assignment.create({
        data: {
          tenantId: input.tenantId,
          classId: input.classId,
          templateId: recommendation.templateId,
          templateVersionId: recommendation.templateVersionId,
          learningStepId: recommendation.learningStepId,
          teacherId: input.acceptedById,
          title: `Önerilen çalışma: ${recommendation.template.title}`,
          status: "ACTIVE",
          assignedAt: new Date(),
        },
        select: { id: true },
      });
      const studentAssignment = await tx.studentAssignment.create({
        data: {
          tenantId: input.tenantId,
          assignmentId: assignment.id,
          studentId: input.studentId,
          source: input.source,
          assignedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.assignmentRecommendation.update({
        where: { id: recommendation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedById: input.acceptedById,
          assignmentId: assignment.id,
        },
      });
      return { assignmentId: assignment.id, studentAssignmentId: studentAssignment.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function applyPendingForStudent(
  tenantId: string,
  studentId: string,
  classId: string | null,
  source: "SYSTEM" | "MANUAL",
  acceptedById: string | null,
  maxActiveAssignments: number,
) {
  const rows = await prisma.assignmentRecommendation.findMany({
    where: {
      tenantId,
      studentId,
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { generatedAt: "asc" },
    take: ASSIGNMENT_RECOMMENDATION_RULES.maxRecommendationsPerStudent,
  });
  const created: Array<{ assignmentId: string; studentAssignmentId: string }> = [];
  for (const row of rows) {
    const item = await createRecommendationAssignment({
      recommendationId: row.id,
      tenantId,
      studentId,
      classId,
      source,
      acceptedById,
      maxActiveAssignments,
    });
    if (item) created.push(item);
  }
  return created;
}

export async function autoAssignStudentRecommendations(actor: RecommendationStudentActor) {
  const tenantId = requireTenant(actor);
  await persistStudentRecommendations(actor);
  const setting = await effectiveSetting(tenantId, actor.userId);
  if (setting && !setting.enabled) return [];
  const maxActiveAssignments =
    setting?.maxActiveAssignments ?? ASSIGNMENT_RECOMMENDATION_RULES.defaultMaxActiveAssignments;
  const classId = setting?.classId ?? null;
  return applyPendingForStudent(
    tenantId,
    actor.userId,
    classId,
    "SYSTEM",
    null,
    maxActiveAssignments,
  );
}

export async function acceptStudentRecommendation(
  actor: RecommendationStudentActor,
  recommendationId: string,
) {
  const tenantId = requireTenant(actor);
  const recommendation = await prisma.assignmentRecommendation.findFirst({
    where: { id: recommendationId, tenantId, studentId: actor.userId, status: "PENDING" },
    select: { studentId: true },
  });
  if (!recommendation) throw notFoundError("Öneri bulunamadı");

  const [setting, tenant] = await Promise.all([
    effectiveSetting(tenantId, actor.userId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } }),
  ]);
  let classId = setting?.classId ?? null;
  if (!classId && tenant?.type === "ORGANIZATION") {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        tenantId,
        studentId: actor.userId,
        status: "ACTIVE",
        deletedAt: null,
        class: { status: "ACTIVE", deletedAt: null },
      },
      select: { classId: true },
      orderBy: { enrolledAt: "asc" },
    });
    classId = enrollment?.classId ?? null;
  }
  const result = await createRecommendationAssignment({
    recommendationId,
    tenantId,
    studentId: actor.userId,
    classId,
    source: "SYSTEM",
    acceptedById: null,
    maxActiveAssignments:
      setting?.maxActiveAssignments ?? ASSIGNMENT_RECOMMENDATION_RULES.defaultMaxActiveAssignments,
  });
  if (!result) throw validationError("Bu öneri zaten atanmış veya aktif çalışma sınırına ulaşıldı");
  return result;
}

export async function acceptTeacherRecommendation(
  actor: TeacherAssignmentActor,
  recommendationId: string,
  classId?: string,
) {
  const tenantId = requireTenant(actor);
  const recommendation = await prisma.assignmentRecommendation.findFirst({
    where: { id: recommendationId, tenantId, status: "PENDING" },
    select: { studentId: true },
  });
  if (!recommendation) throw notFoundError("Öneri bulunamadı");
  const authorizedClassId = await authorizedClassForStudent(
    actor,
    recommendation.studentId,
    classId,
  );
  const setting = await effectiveSetting(tenantId, recommendation.studentId);
  const result = await createRecommendationAssignment({
    recommendationId,
    tenantId,
    studentId: recommendation.studentId,
    classId: authorizedClassId,
    source: "MANUAL",
    acceptedById: actor.userId,
    maxActiveAssignments: setting?.maxActiveAssignments ?? 1,
  });
  if (!result) throw validationError("Bu öneri zaten atanmış veya aktif çalışma sınırına ulaşıldı");
  return result;
}

export async function acceptTeacherRecommendationsBatch(
  actor: TeacherAssignmentActor,
  input: { classId: string; recommendationIds: string[] },
) {
  const tenantId = requireTenant(actor);
  await assertTeacherClassAccess(actor, input.classId);
  const recommendationIds = [...new Set(input.recommendationIds)];
  const activeStudents = await prisma.enrollment.findMany({
    where: {
      tenantId,
      classId: input.classId,
      status: "ACTIVE",
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  const studentIds = activeStudents.map((student) => student.studentId);
  const recommendations =
    studentIds.length === 0
      ? []
      : await prisma.assignmentRecommendation.findMany({
          where: {
            id: { in: recommendationIds },
            tenantId,
            studentId: { in: studentIds },
            status: "PENDING",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { id: true, studentId: true },
          orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
        });
  const settings = await prisma.assignmentAutomationSetting.findMany({
    where: {
      tenantId,
      OR: [{ classId: input.classId }, { studentId: { in: studentIds } }],
    },
    select: { classId: true, studentId: true, maxActiveAssignments: true },
  });
  const classSetting = settings.find((setting) => setting.classId === input.classId);
  const studentSettings = new Map(
    settings
      .filter((setting) => setting.studentId)
      .map((setting) => [setting.studentId!, setting.maxActiveAssignments]),
  );
  const created: Array<{ recommendationId: string; assignmentId: string; studentId: string }> = [];
  for (const recommendation of recommendations) {
    const result = await createRecommendationAssignment({
      recommendationId: recommendation.id,
      tenantId,
      studentId: recommendation.studentId,
      classId: input.classId,
      source: "MANUAL",
      acceptedById: actor.userId,
      maxActiveAssignments:
        studentSettings.get(recommendation.studentId) ??
        classSetting?.maxActiveAssignments ??
        ASSIGNMENT_RECOMMENDATION_RULES.defaultMaxActiveAssignments,
    });
    if (result) {
      created.push({
        recommendationId: recommendation.id,
        assignmentId: result.assignmentId,
        studentId: recommendation.studentId,
      });
    }
  }
  const createdIds = new Set(created.map((item) => item.recommendationId));
  return {
    created,
    skippedRecommendationIds: recommendationIds.filter((id) => !createdIds.has(id)),
  };
}

export async function dismissTeacherRecommendation(
  actor: TeacherAssignmentActor,
  recommendationId: string,
) {
  const tenantId = requireTenant(actor);
  const recommendation = await prisma.assignmentRecommendation.findFirst({
    where: { id: recommendationId, tenantId, status: "PENDING" },
    select: { studentId: true },
  });
  if (!recommendation) throw notFoundError("Öneri bulunamadı");
  await authorizedClassForStudent(actor, recommendation.studentId);
  return prisma.assignmentRecommendation.update({
    where: { id: recommendationId },
    data: { status: "DISMISSED", dismissedAt: new Date() },
    select: { id: true, status: true },
  });
}

export async function upsertTeacherAutomationSetting(
  actor: TeacherAssignmentActor,
  input: {
    studentId?: string;
    classId?: string;
    enabled: boolean;
    maxActiveAssignments?: number;
    cooldownHours?: number;
  },
): Promise<AssignmentAutomationSettingItem> {
  if (Boolean(input.studentId) === Boolean(input.classId)) {
    throw validationError("Öğrenci veya sınıf hedeflerinden yalnızca biri seçilebilir");
  }
  const tenantId = requireTenant(actor);
  if (input.classId) await assertTeacherClassAccess(actor, input.classId);
  if (input.studentId) await authorizedClassForStudent(actor, input.studentId);
  const existing = await prisma.assignmentAutomationSetting.findFirst({
    where: {
      tenantId,
      ...(input.studentId ? { studentId: input.studentId } : { classId: input.classId }),
    },
  });
  const data = {
    enabled: input.enabled,
    maxActiveAssignments: input.maxActiveAssignments ?? 1,
    cooldownHours: input.cooldownHours ?? ASSIGNMENT_RECOMMENDATION_RULES.cooldownHours,
  };
  if (data.maxActiveAssignments < 1 || data.maxActiveAssignments > 3) {
    throw validationError("Aktif otomatik ödev sınırı 1 ile 3 arasında olmalı");
  }
  if (data.cooldownHours < 1 || data.cooldownHours > 720) {
    throw validationError("Tekrar süresi 1 ile 720 saat arasında olmalı");
  }
  const row = existing
    ? await prisma.assignmentAutomationSetting.update({ where: { id: existing.id }, data })
    : await prisma.assignmentAutomationSetting.create({
        data: {
          tenantId,
          studentId: input.studentId ?? null,
          classId: input.classId ?? null,
          ...data,
        },
      });
  return row;
}

export async function listTeacherAutomationSettings(actor: TeacherAssignmentActor) {
  const tenantId = requireTenant(actor);
  const studentIds = await authorizedStudentIds(actor);
  const rows = await prisma.assignmentAutomationSetting.findMany({
    where: {
      tenantId,
      OR: [
        { studentId: { in: studentIds } },
        {
          class: {
            teacherAssignments: {
              some: { teacherId: actor.userId, status: "ACTIVE", deletedAt: null },
            },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows as AssignmentAutomationSettingItem[];
}

export async function runTeacherAutomation(
  actor: TeacherAssignmentActor,
  input: { studentId?: string; classId?: string },
) {
  if (Boolean(input.studentId) === Boolean(input.classId)) {
    throw validationError("Öğrenci veya sınıf hedeflerinden yalnızca biri seçilebilir");
  }
  const tenantId = requireTenant(actor);
  let studentIds: string[];
  if (input.studentId) {
    await authorizedClassForStudent(actor, input.studentId, input.classId);
    studentIds = [input.studentId];
  } else {
    studentIds = await authorizedStudentIds(actor, input.classId);
  }
  const created: Array<{ assignmentId: string; studentAssignmentId: string }> = [];
  for (const studentId of studentIds) {
    const settings = await effectiveSetting(tenantId, studentId);
    if (!settings?.enabled) continue;
    await persistStudentRecommendations({ userId: studentId, tenantId, platformRole: null });
    const classId = settings.classId ?? input.classId ?? null;
    created.push(
      ...(await applyPendingForStudent(
        tenantId,
        studentId,
        classId,
        "SYSTEM",
        null,
        settings.maxActiveAssignments,
      )),
    );
  }
  return { created };
}
