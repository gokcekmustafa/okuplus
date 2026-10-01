import type { PlatformRole, Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { validationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
  ACADEMIC_P0_COMMON_FLOW,
  ACADEMIC_P0_LESSONS,
  type AcademicAreaCode,
  type AcademicSkillCode,
} from "../../curriculum/academic-reading-p0.js";
import { withTenantContext } from "../tenant/index.js";
import type { AcademicProgramResponse } from "./academic-program.js";

export type PersistentLearningActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

type StepRow = {
  id: string;
  stableKey: string;
  title: string;
  type:
    | "TEACHING"
    | "SMALL_STUDY"
    | "PRACTICE"
    | "REINFORCEMENT"
    | "ASSESSMENT"
    | "MEASUREMENT"
    | "NEXT_LEARNING";
  position: number;
  skill: { code: string } | null;
  contentVersion: {
    status: string;
    content: { status: string; deletedAt: Date | null };
  } | null;
  exerciseTemplateVersion: {
    status: string;
    template: { status: string; deletedAt: Date | null };
  } | null;
  assessment: { status: string; deletedAt: Date | null } | null;
  completionRule: Prisma.JsonValue;
};

type PathRow = {
  id: string;
  area: "FAST_READING" | "READING_COMPREHENSION" | "COMMON";
  units: Array<{ steps: StepRow[] }>;
};

function isMissingLearningPathTable(error: unknown): boolean {
  return error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2021";
}

function prerequisiteIds(value: Prisma.JsonValue): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).prerequisiteStepIds
      : null;
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export function areLearningStepPrerequisitesComplete(
  value: Prisma.JsonValue,
  completed: ReadonlySet<string>,
): boolean {
  return prerequisiteIds(value).every((id) => completed.has(id));
}

function isPublishedStep(step: StepRow): boolean {
  if (step.type === "TEACHING" || step.type === "SMALL_STUDY") {
    return Boolean(
      step.contentVersion?.status === "PUBLISHED" &&
      step.contentVersion.content.status === "PUBLISHED" &&
      step.contentVersion.content.deletedAt === null,
    );
  }
  if (step.type === "PRACTICE" || step.type === "REINFORCEMENT") {
    return Boolean(
      step.exerciseTemplateVersion?.status === "PUBLISHED" &&
      step.exerciseTemplateVersion.template.status === "PUBLISHED" &&
      step.exerciseTemplateVersion.template.deletedAt === null,
    );
  }
  if (step.type === "ASSESSMENT") {
    return Boolean(step.assessment?.status === "PUBLISHED" && step.assessment.deletedAt === null);
  }
  return true;
}

function statusForStep(
  step: StepRow | undefined,
  completed: Set<string>,
): "COMPLETED" | "ACTIVE" | "LOCKED" | "UNAVAILABLE" {
  if (!step || !isPublishedStep(step)) return "UNAVAILABLE";
  if (completed.has(step.id)) return "COMPLETED";
  return areLearningStepPrerequisitesComplete(step.completionRule, completed) ? "ACTIVE" : "LOCKED";
}

function allSteps(path: PathRow): StepRow[] {
  return path.units.flatMap((unit) => unit.steps);
}

function stepByType(steps: StepRow[], type: StepRow["type"]): StepRow | undefined {
  return steps.find((step) => step.type === type);
}

function stepBySkill(
  steps: StepRow[],
  skillCode: string,
  type: StepRow["type"],
): StepRow | undefined {
  return steps.find((step) => step.skill?.code === skillCode && step.type === type);
}

function nextStepForProgram(
  areas: AcademicProgramResponse["areas"],
  common: AcademicProgramResponse["common"],
): AcademicProgramResponse["nextStep"] {
  for (const area of areas) {
    for (const skill of area.skills) {
      const stage = skill.stages.find((candidate) => candidate.status === "ACTIVE");
      if (stage) {
        return {
          area: area.code,
          skillCode: skill.skillCode,
          stage: stage.code,
          title: `${area.title}: ${skill.title} — ${stage.title}`,
        };
      }
    }
  }
  const stage = common.stages.find((candidate) => candidate.status === "ACTIVE");
  return stage ? { area: "COMMON", skillCode: null, stage: stage.code, title: stage.title } : null;
}

export async function getPersistentAcademicProgram(
  actor: PersistentLearningActor,
): Promise<AcademicProgramResponse | null> {
  if (!actor.tenantId || actor.platformRole !== null || !("learningPath" in prisma)) return null;

  try {
    const { paths, state } = await withTenantContext(actor, async (tx) => {
      const profile = await tx.studentProfile.findFirst({
        where: { studentId: actor.userId, tenantId: actor.tenantId! },
        select: { currentLevelId: true },
      });
      const paths = (await tx.learningPath.findMany({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
          code: { startsWith: "EDUCATION_V2_P0_" },
          ...(profile?.currentLevelId
            ? { OR: [{ levelId: null }, { levelId: profile.currentLevelId }] }
            : { levelId: null }),
        },
        orderBy: [{ area: "asc" }, { version: "desc" }],
        select: {
          id: true,
          area: true,
          units: {
            orderBy: { position: "asc" },
            select: {
              steps: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  stableKey: true,
                  title: true,
                  type: true,
                  position: true,
                  skill: { select: { code: true } },
                  contentVersion: {
                    select: {
                      status: true,
                      content: { select: { status: true, deletedAt: true } },
                    },
                  },
                  exerciseTemplateVersion: {
                    select: {
                      status: true,
                      template: { select: { status: true, deletedAt: true } },
                    },
                  },
                  assessment: { select: { status: true, deletedAt: true } },
                  completionRule: true,
                },
              },
            },
          },
        },
      })) as PathRow[];

      const stepIds = paths.flatMap((path) => allSteps(path).map((step) => step.id));
      const progress = await tx.studentLearningStepProgress.findMany({
        where: {
          tenantId: actor.tenantId!,
          studentId: actor.userId,
          learningStepId: { in: stepIds },
        },
        select: { learningStepId: true, status: true },
      });
      return {
        paths,
        state: new Set(
          progress.filter((item) => item.status === "COMPLETED").map((item) => item.learningStepId),
        ),
      };
    });

    if (!paths.length) return null;

    const areas = (["FAST_READING", "READING_COMPREHENSION"] as const).map((areaCode) => {
      const path = paths.find((candidate) => candidate.area === areaCode);
      const steps = path ? allSteps(path) : [];
      const skills = ACADEMIC_P0_LESSONS.filter((lesson) => lesson.area === areaCode).map(
        (lesson) => {
          const teachingStatus = statusForStep(
            stepBySkill(steps, lesson.skillCode, "TEACHING"),
            state,
          );
          const smallStudyStatus = statusForStep(
            stepBySkill(steps, lesson.skillCode, "SMALL_STUDY"),
            state,
          );
          const practiceStatus = statusForStep(
            stepBySkill(steps, lesson.skillCode, "PRACTICE"),
            state,
          );
          return {
            skillCode: lesson.skillCode,
            title: lesson.title,
            objective: lesson.objective,
            stages: [
              { code: "TEACHING" as const, title: "Öğretim", status: teachingStatus },
              { code: "SMALL_STUDY" as const, title: "Küçük çalışma", status: smallStudyStatus },
              { code: "PRACTICE" as const, title: "Uygulama", status: practiceStatus },
            ],
            accuracy: null,
          };
        },
      );
      return {
        code: areaCode,
        title: areaCode === "FAST_READING" ? "Hızlı Okuma" : "Okuduğunu Anlama",
        skills,
      };
    });

    const commonPath = paths.find((path) => path.area === "COMMON");
    const commonSteps = commonPath ? allSteps(commonPath) : [];
    const practiceSteps = paths
      .filter((path) => path.area !== "COMMON")
      .flatMap((path) =>
        allSteps(path).filter(
          (step) =>
            step.type === "PRACTICE" &&
            step.skill !== null &&
            ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes.includes(
              step.skill.code as (typeof ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes)[number],
            ),
        ),
      );
    const practicesComplete =
      practiceSteps.length === 6 && practiceSteps.every((step) => state.has(step.id));
    const reinforcementStep = stepByType(commonSteps, "REINFORCEMENT");
    const assessmentStep = stepByType(commonSteps, "ASSESSMENT");
    const measurementStep = stepByType(commonSteps, "MEASUREMENT");
    const nextLearningStep = stepByType(commonSteps, "NEXT_LEARNING");
    const reinforcementCompleted = Boolean(reinforcementStep && state.has(reinforcementStep.id));
    const assessmentCompleted = Boolean(assessmentStep && state.has(assessmentStep.id));
    const measurementCompleted = Boolean(measurementStep && state.has(measurementStep.id));
    const common = {
      stages: [
        {
          code: "REINFORCEMENT" as const,
          title: "Ortak pekiştirme",
          status: practicesComplete ? statusForStep(reinforcementStep, state) : ("LOCKED" as const),
        },
        {
          code: "ASSESSMENT" as const,
          title: "Ortak değerlendirme",
          status:
            practicesComplete && reinforcementCompleted
              ? statusForStep(assessmentStep, state)
              : ("LOCKED" as const),
        },
        {
          code: "MEASUREMENT" as const,
          title: "Başarı ölçümü",
          status: assessmentCompleted ? statusForStep(measurementStep, state) : ("LOCKED" as const),
        },
        {
          code: "NEXT_LEARNING" as const,
          title: "Sonraki öğrenme",
          status: measurementCompleted
            ? statusForStep(nextLearningStep, state)
            : ("LOCKED" as const),
        },
      ],
      prerequisiteSkillCodes: ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes,
    } satisfies AcademicProgramResponse["common"];

    const response: AcademicProgramResponse = {
      version: "P0",
      publicationStatus: areas.some((area) =>
        area.skills.some((skill) => skill.stages[0]?.status !== "UNAVAILABLE"),
      )
        ? "PARTIALLY_AVAILABLE"
        : "AUTHORING_ONLY",
      areas,
      common,
      nextStep: null,
    };
    response.nextStep = nextStepForProgram(response.areas, response.common);

    return response;
  } catch (error) {
    if (isMissingLearningPathTable(error)) return null;
    throw error;
  }
}

async function progressForActor(actor: PersistentLearningActor) {
  return withTenantContext(actor, (tx) =>
    tx.studentLearningStepProgress.findMany({
      where: { tenantId: actor.tenantId!, studentId: actor.userId },
      select: { learningStepId: true, status: true },
    }),
  );
}

export async function resolveLearningStepForTemplate(
  templateVersionId: string,
  actor: PersistentLearningActor,
): Promise<{ matched: boolean; stepId: string | null; unlocked: boolean }> {
  if (!actor.tenantId || actor.platformRole !== null || !("learningPath" in prisma)) {
    return { matched: false, stepId: null, unlocked: false };
  }
  try {
    const steps = await prisma.learningStep.findMany({
      where: {
        exerciseTemplateVersionId: templateVersionId,
        type: { in: ["PRACTICE", "REINFORCEMENT"] },
        unit: { path: { status: "PUBLISHED" } },
      },
      select: { id: true, completionRule: true },
    });
    if (!steps.length) return { matched: false, stepId: null, unlocked: false };
    const progress = await progressForActor(actor);
    const completed = new Set(
      progress.filter((item) => item.status === "COMPLETED").map((item) => item.learningStepId),
    );
    const candidate = steps.find((step) =>
      areLearningStepPrerequisitesComplete(step.completionRule, completed),
    );
    return { matched: true, stepId: candidate?.id ?? steps[0]!.id, unlocked: Boolean(candidate) };
  } catch (error) {
    if (isMissingLearningPathTable(error)) return { matched: false, stepId: null, unlocked: false };
    throw error;
  }
}

export async function resolveLearningStepForContent(
  contentVersionId: string,
  actor: PersistentLearningActor,
): Promise<{ matched: boolean; stepId: string | null; unlocked: boolean }> {
  if (!actor.tenantId || actor.platformRole !== null || !("learningPath" in prisma)) {
    return { matched: false, stepId: null, unlocked: false };
  }
  try {
    const steps = await prisma.learningStep.findMany({
      where: {
        contentVersionId,
        type: { in: ["TEACHING", "SMALL_STUDY"] },
        unit: { path: { status: "PUBLISHED" } },
      },
      select: { id: true, completionRule: true },
    });
    if (!steps.length) return { matched: false, stepId: null, unlocked: false };
    const progress = await progressForActor(actor);
    const completed = new Set(
      progress.filter((item) => item.status === "COMPLETED").map((item) => item.learningStepId),
    );
    const candidate = steps.find((step) =>
      prerequisiteIds(step.completionRule).every((id) => completed.has(id)),
    );
    return { matched: true, stepId: candidate?.id ?? steps[0]!.id, unlocked: Boolean(candidate) };
  } catch (error) {
    if (isMissingLearningPathTable(error)) return { matched: false, stepId: null, unlocked: false };
    throw error;
  }
}

export async function resolveLearningStepForAssessment(
  assessmentId: string,
  actor: PersistentLearningActor,
): Promise<{ matched: boolean; stepId: string | null; unlocked: boolean }> {
  if (!actor.tenantId || actor.platformRole !== null || !("learningPath" in prisma)) {
    return { matched: false, stepId: null, unlocked: false };
  }
  try {
    const step = await prisma.learningStep.findFirst({
      where: { assessmentId, type: "ASSESSMENT", unit: { path: { status: "PUBLISHED" } } },
      select: { id: true, completionRule: true },
    });
    if (!step) return { matched: false, stepId: null, unlocked: false };
    const progress = await progressForActor(actor);
    const completed = new Set(
      progress.filter((item) => item.status === "COMPLETED").map((item) => item.learningStepId),
    );
    return {
      matched: true,
      stepId: step.id,
      unlocked: areLearningStepPrerequisitesComplete(step.completionRule, completed),
    };
  } catch (error) {
    if (isMissingLearningPathTable(error)) return { matched: false, stepId: null, unlocked: false };
    throw error;
  }
}

export async function completeLearningStep(
  stepId: string,
  actor: PersistentLearningActor,
  evidence: Prisma.InputJsonValue,
): Promise<void> {
  if (!actor.tenantId || actor.platformRole !== null || !("learningPath" in prisma)) return;
  try {
    await withTenantContext(actor, async (tx) => {
      const step = await tx.learningStep.findUnique({
        where: { id: stepId },
        select: { id: true, type: true, completionRule: true },
      });
      if (!step) return;
      const progress = await tx.studentLearningStepProgress.findUnique({
        where: {
          tenantId_studentId_learningStepId: {
            tenantId: actor.tenantId!,
            studentId: actor.userId,
            learningStepId: stepId,
          },
        },
        select: { status: true },
      });
      if (progress?.status === "COMPLETED") return;
      const prerequisites = prerequisiteIds(step.completionRule);
      const prerequisiteProgress = await tx.studentLearningStepProgress.findMany({
        where: {
          tenantId: actor.tenantId!,
          studentId: actor.userId,
          learningStepId: { in: prerequisites },
        },
        select: { learningStepId: true, status: true },
      });
      const completed = new Set(
        prerequisiteProgress
          .filter((item) => item.status === "COMPLETED")
          .map((item) => item.learningStepId),
      );
      if (!prerequisites.every((id) => completed.has(id))) {
        throw validationError("Bu öğrenme adımı için ön koşullar tamamlanmamış");
      }
      const rule = step.completionRule;
      if (step.type === "ASSESSMENT" && rule && typeof rule === "object" && !Array.isArray(rule)) {
        const minimumScore = (rule as { minimumScore?: unknown }).minimumScore;
        const score =
          evidence && typeof evidence === "object" && !Array.isArray(evidence)
            ? (evidence as { averageScore?: unknown }).averageScore
            : null;
        if (
          typeof minimumScore === "number" &&
          (typeof score !== "number" || score < minimumScore)
        ) {
          return;
        }
      }
      await tx.studentLearningStepProgress.upsert({
        where: {
          tenantId_studentId_learningStepId: {
            tenantId: actor.tenantId!,
            studentId: actor.userId,
            learningStepId: stepId,
          },
        },
        update: {
          status: "COMPLETED",
          completedAt: new Date(),
          lastActivityAt: new Date(),
          evidence,
        },
        create: {
          tenantId: actor.tenantId!,
          studentId: actor.userId,
          learningStepId: stepId,
          status: "COMPLETED",
          attemptCount: 1,
          completedAt: new Date(),
          evidence,
        },
      });
      if (step.type === "ASSESSMENT") {
        const measurementSteps = await tx.learningStep.findMany({
          where: { type: "MEASUREMENT", unit: { path: { status: "PUBLISHED" } } },
          select: { id: true, completionRule: true },
        });
        for (const measurement of measurementSteps) {
          if (!prerequisiteIds(measurement.completionRule).includes(step.id)) continue;
          await tx.studentLearningStepProgress.upsert({
            where: {
              tenantId_studentId_learningStepId: {
                tenantId: actor.tenantId!,
                studentId: actor.userId,
                learningStepId: measurement.id,
              },
            },
            update: {
              status: "COMPLETED",
              completedAt: new Date(),
              lastActivityAt: new Date(),
              evidence,
            },
            create: {
              tenantId: actor.tenantId!,
              studentId: actor.userId,
              learningStepId: measurement.id,
              status: "COMPLETED",
              attemptCount: 1,
              completedAt: new Date(),
              evidence,
            },
          });
        }
      }
    });
  } catch (error) {
    if (!isMissingLearningPathTable(error)) throw error;
  }
}

async function completeBoundStep(
  where: Prisma.LearningStepWhereInput,
  actor: PersistentLearningActor,
  evidence: Prisma.InputJsonValue,
): Promise<void> {
  if (!("learningStep" in prisma)) return;
  try {
    const step = await prisma.learningStep.findFirst({ where, select: { id: true } });
    if (step) await completeLearningStep(step.id, actor, evidence);
  } catch (error) {
    if (!isMissingLearningPathTable(error)) throw error;
  }
}

export function completeLearningStepForTemplate(
  templateVersionId: string,
  actor: PersistentLearningActor,
  evidence: Prisma.InputJsonValue,
): Promise<void> {
  return completeBoundStep(
    {
      exerciseTemplateVersionId: templateVersionId,
      type: { in: ["PRACTICE", "REINFORCEMENT"] },
      unit: { path: { status: "PUBLISHED" } },
    },
    actor,
    evidence,
  );
}

export function completeLearningStepForContent(
  contentVersionId: string,
  actor: PersistentLearningActor,
  evidence: Prisma.InputJsonValue,
): Promise<void> {
  return completeBoundStep(
    {
      contentVersionId,
      type: { in: ["TEACHING", "SMALL_STUDY"] },
      unit: { path: { status: "PUBLISHED" } },
    },
    actor,
    evidence,
  );
}

export function completeLearningStepForAssessment(
  assessmentId: string,
  actor: PersistentLearningActor,
  evidence: Prisma.InputJsonValue,
): Promise<void> {
  return completeBoundStep(
    { assessmentId, type: "ASSESSMENT", unit: { path: { status: "PUBLISHED" } } },
    actor,
    evidence,
  );
}

export function isAcademicSkillCode(value: string): value is AcademicSkillCode {
  return ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes.includes(value as AcademicSkillCode);
}

export function isAcademicAreaCode(value: string): value is AcademicAreaCode {
  return value === "FAST_READING" || value === "READING_COMPREHENSION";
}
