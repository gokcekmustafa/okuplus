import { type Prisma, type PlatformRole } from "@prisma/client";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
  resolveTrainingRuntimeConfig,
  type TrainingExerciseVersionConfig,
} from "./exercise-contract.js";

export { resolveTrainingRuntimeConfig };

export type TrainingActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

const MAIN_IDEA_FAMILY = "MAIN_IDEA" as const;
const MAIN_IDEA_INTERACTION = "MULTIPLE_CHOICE" as const;
const MAIN_IDEA_RENDERER = "QUESTION_MULTIPLE_CHOICE" as const;

const mainIdeaVersionSelect = {
  id: true,
  templateId: true,
  version: true,
  config: true,
  status: true,
  publishedAt: true,
  template: {
    select: {
      id: true,
      title: true,
      type: true,
      tenantId: true,
      status: true,
      deletedAt: true,
    },
  },
  contents: {
    orderBy: { position: "asc" },
    select: {
      position: true,
      contentVersionId: true,
      contentVersion: {
        select: {
          id: true,
          contentId: true,
          title: true,
          body: true,
          status: true,
          content: {
            select: { id: true, tenantId: true, status: true, deletedAt: true },
          },
        },
      },
    },
  },
  questions: {
    orderBy: { position: "asc" },
    select: {
      position: true,
      questionVersionId: true,
      questionVersion: {
        select: {
          id: true,
          questionId: true,
          prompt: true,
          options: true,
          correctAnswer: true,
          explanation: true,
          hint: true,
          difficulty: true,
          status: true,
          question: {
            select: {
              id: true,
              contentId: true,
              type: true,
              status: true,
              deletedAt: true,
              skill: { select: { code: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ExerciseTemplateVersionSelect;

export type MainIdeaVersionRow = Prisma.ExerciseTemplateVersionGetPayload<{
  select: typeof mainIdeaVersionSelect;
}>;

export type MainIdeaStudentQuestion = {
  questionVersionId: string;
  position: number;
  contentId: string;
  contentVersionId: string;
  prompt: string;
  type: typeof MAIN_IDEA_INTERACTION;
  options: Prisma.JsonValue;
  explanation: string | null;
  hint: string | null;
  difficulty: number | null;
};

export type MainIdeaRuntimeConfig = Pick<
  TrainingExerciseVersionConfig,
  | "schemaVersion"
  | "family"
  | "competency"
  | "difficulty"
  | "estimatedDurationSeconds"
  | "instructions"
  | "interactionType"
  | "scoring"
  | "feedback"
  | "rendererKey"
>;

export type MainIdeaRuntimeGraph = {
  versionId: string;
  templateId: string;
  templateTitle: string;
  version: number;
  config: MainIdeaRuntimeConfig;
  questions: MainIdeaStudentQuestion[];
};

export function toMainIdeaRuntimeConfig(
  config: TrainingExerciseVersionConfig,
): MainIdeaRuntimeConfig {
  return {
    schemaVersion: config.schemaVersion,
    family: config.family,
    competency: config.competency,
    difficulty: config.difficulty,
    estimatedDurationSeconds: config.estimatedDurationSeconds,
    instructions: config.instructions,
    interactionType: config.interactionType,
    scoring: config.scoring,
    feedback: config.feedback,
    rendererKey: config.rendererKey,
  };
}

function tenantVisible(templateTenantId: string | null, actor: TrainingActor): boolean {
  return (
    actor.platformRole === "SUPER_ADMIN" ||
    templateTenantId === null ||
    templateTenantId === actor.tenantId
  );
}

function isOptionList(value: unknown): value is Array<{ id: string; text: string }> {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        (item as { id: string }).id.trim().length > 0 &&
        typeof (item as { text?: unknown }).text === "string" &&
        (item as { text: string }).text.trim().length > 0,
    ) &&
    new Set(value.map((item) => item.id)).size === 4
  );
}

function hasValidMultipleChoiceAnswer(correctAnswer: unknown, optionIds: Set<string>): boolean {
  if (!correctAnswer || typeof correctAnswer !== "object") return false;
  const answer = correctAnswer as {
    type?: unknown;
    correctOptionIds?: unknown;
    allowMultiple?: unknown;
  };
  if (answer.type !== MAIN_IDEA_INTERACTION || answer.allowMultiple !== false) return false;
  return (
    Array.isArray(answer.correctOptionIds) &&
    answer.correctOptionIds.length === 1 &&
    typeof answer.correctOptionIds[0] === "string" &&
    optionIds.has(answer.correctOptionIds[0])
  );
}

function isMainIdeaConfig(config: unknown): config is TrainingExerciseVersionConfig {
  const parsed = resolveTrainingRuntimeConfig("TRAINING", config);
  return parsed.status === "READY" && parsed.config.family === MAIN_IDEA_FAMILY;
}

function declaresMainIdea(config: unknown): boolean {
  return (
    isTrainingConfigCandidate(config) &&
    (config as { family?: unknown }).family === MAIN_IDEA_FAMILY
  );
}

function validateMainIdeaRow(row: MainIdeaVersionRow, actor: TrainingActor): MainIdeaRuntimeGraph {
  if (row.status !== "PUBLISHED") throw validationError("Egzersiz sürümü yayınlanmış olmalı");
  if (row.template.status !== "PUBLISHED" || row.template.deletedAt !== null) {
    throw validationError("Eğzersiz şablonu yayınlanmış olmalı");
  }
  if (!tenantVisible(row.template.tenantId, actor)) {
    throw forbiddenError("Eğzersiz bu tenant kapsamına ait değil");
  }

  const resolved = resolveTrainingRuntimeConfig("TRAINING", row.config);
  if (resolved.status !== "READY") {
    throw validationError("Eğzersiz sürümü yapılandırması geçersiz veya eksik");
  }
  const config = resolved.config;
  if (
    config.family !== MAIN_IDEA_FAMILY ||
    config.interactionType !== MAIN_IDEA_INTERACTION ||
    config.contentRequirement !== "REQUIRED" ||
    config.questionRequirement !== "REQUIRED" ||
    config.rendererKey !== MAIN_IDEA_RENDERER ||
    !["FOUNDATION", "DEVELOPING"].includes(config.difficulty)
  ) {
    throw validationError("MAIN_IDEA exercise contract desteklenmiyor");
  }
  if (row.contents.length === 0 || row.questions.length === 0) {
    throw validationError("MAIN_IDEA için yayınlanmış içerik ve soru gerekli");
  }

  const contentByContentId = new Map<string, MainIdeaVersionRow["contents"][number]>();
  for (const entry of row.contents) {
    const contentVersion = entry.contentVersion;
    const content = contentVersion.content;
    if (
      contentVersion.status !== "PUBLISHED" ||
      content.status !== "PUBLISHED" ||
      content.deletedAt !== null ||
      contentVersion.body.trim().length === 0
    ) {
      throw validationError("MAIN_IDEA içerik grafiği yayınlanmış değil");
    }
    if (!tenantVisible(content.tenantId, actor)) {
      throw forbiddenError("İçerik bu tenant kapsamına ait değil");
    }
    if (contentByContentId.has(contentVersion.contentId)) {
      throw validationError("MAIN_IDEA içerik grafiğinde tekrar var");
    }
    contentByContentId.set(contentVersion.contentId, entry);
  }

  const questions = row.questions.map((entry): MainIdeaStudentQuestion => {
    const questionVersion = entry.questionVersion;
    const question = questionVersion.question;
    const content = contentByContentId.get(question.contentId);
    if (!content) throw validationError("Soru güncel içerik sürümüne bağlı değil");
    if (
      questionVersion.status !== "PUBLISHED" ||
      question.status !== "PUBLISHED" ||
      question.deletedAt !== null ||
      question.type !== MAIN_IDEA_INTERACTION ||
      question.skill?.code !== "RC_MAIN_IDEA"
    ) {
      throw validationError("MAIN_IDEA soru grafiği yayınlanmış veya uyumlu değil");
    }
    if (!isOptionList(questionVersion.options)) {
      throw validationError("MAIN_IDEA sorusu dört geçerli seçenek içermeli");
    }
    const optionIds = new Set(questionVersion.options.map((option) => option.id));
    if (!hasValidMultipleChoiceAnswer(questionVersion.correctAnswer, optionIds)) {
      throw validationError("MAIN_IDEA doğru cevap yapılandırması geçersiz");
    }
    return {
      questionVersionId: questionVersion.id,
      position: entry.position,
      contentId: question.contentId,
      contentVersionId: content.contentVersionId,
      prompt: questionVersion.prompt,
      type: MAIN_IDEA_INTERACTION,
      options: questionVersion.options,
      explanation: questionVersion.explanation,
      hint: questionVersion.hint,
      difficulty: questionVersion.difficulty,
    };
  });

  return {
    versionId: row.id,
    templateId: row.templateId,
    templateTitle: row.template.title,
    version: row.version,
    config: toMainIdeaRuntimeConfig(config),
    questions,
  };
}

export async function loadMainIdeaRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<MainIdeaRuntimeGraph> {
  const row = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: mainIdeaVersionSelect,
  });
  if (!row) throw notFoundError("MAIN_IDEA exercise sürümü bulunamadı");
  return validateMainIdeaRow(row, actor);
}

export async function resolveMainIdeaTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
): Promise<MainIdeaRuntimeGraph> {
  if (requestedTemplateVersionId?.trim()) {
    return loadMainIdeaRuntimeGraph(requestedTemplateVersionId.trim(), actor);
  }

  const candidates = await prisma.exerciseTemplateVersion.findMany({
    where: {
      status: "PUBLISHED",
      template: {
        deletedAt: null,
        status: "PUBLISHED",
        ...(actor.platformRole === "SUPER_ADMIN"
          ? {}
          : { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] }),
      },
    },
    select: { id: true, config: true },
    orderBy: [{ publishedAt: "desc" }, { version: "desc" }, { id: "asc" }],
  });
  const mainIdeaCandidates = candidates.filter((item) => declaresMainIdea(item.config));
  if (mainIdeaCandidates.length === 0) {
    throw notFoundError("Yayınlanmış MAIN_IDEA exercise bulunamadı");
  }
  if (mainIdeaCandidates.length > 1) {
    throw conflictError("Birden fazla yayınlanmış MAIN_IDEA exercise bulundu");
  }
  return loadMainIdeaRuntimeGraph(mainIdeaCandidates[0]!.id, actor);
}

export function buildTrainingFeedback(config: unknown, isCorrect: boolean | null): string | null {
  const resolved = resolveTrainingRuntimeConfig("TRAINING", config);
  if (resolved.status !== "READY" || resolved.config.family !== MAIN_IDEA_FAMILY) return null;
  if (isCorrect === true && resolved.config.feedback.types.includes("POSITIVE")) {
    return "Metnin genel mesajını yakaladın.";
  }
  if (isCorrect === false && resolved.config.feedback.types.includes("CORRECTIVE")) {
    return "Bu seçenek metnin yalnızca bir ayrıntısını anlatıyor. Önce metnin tamamının ortak mesajını düşün.";
  }
  if (isCorrect === false && resolved.config.feedback.types.includes("HINT")) {
    return "İpucu: Tek bir ayrıntı yerine, paragrafların tamamında tekrar eden düşünceyi ara.";
  }
  return null;
}

export function isTrainingVersionConfig(config: unknown): boolean {
  return resolveTrainingRuntimeConfig("TRAINING", config).status === "READY";
}

/** Legacy parent snapshots may be JSON objects without a training contract. */
export function isTrainingConfigCandidate(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const value = config as Record<string, unknown>;
  return "schemaVersion" in value || "family" in value || "rendererKey" in value;
}

export function isMainIdeaVersionConfig(config: unknown): boolean {
  return isMainIdeaConfig(config);
}
