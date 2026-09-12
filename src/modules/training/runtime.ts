import { type Prisma, type PlatformRole } from "@prisma/client";
import { conflictError, forbiddenError, notFoundError, validationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
  FAST_READING_RENDERERS,
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
const DETAIL_EVIDENCE_FAMILY = "DETAIL_EVIDENCE" as const;
const INFERENCE_FAMILY = "INFERENCE" as const;
const MAIN_IDEA_INTERACTION = "MULTIPLE_CHOICE" as const;
const MAIN_IDEA_RENDERER = "QUESTION_MULTIPLE_CHOICE" as const;

const ATTENTION_BURST_FAMILY = "ATTENTION_BURST" as const;
const RAPID_RECOGNITION_FAMILY = "RAPID_RECOGNITION" as const;
const PHRASE_CHUNKING_FAMILY = "PHRASE_CHUNKING" as const;

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
          contentVersionId: true,
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

export type TrainingRuntimeConfig = MainIdeaRuntimeConfig;

export type MainIdeaRuntimeGraph = {
  versionId: string;
  templateId: string;
  templateTitle: string;
  version: number;
  config: MainIdeaRuntimeConfig;
  questions: MainIdeaStudentQuestion[];
};

export type DetailEvidenceVersionRow = MainIdeaVersionRow;
export type DetailEvidenceStudentQuestion = MainIdeaStudentQuestion;
export type DetailEvidenceRuntimeConfig = MainIdeaRuntimeConfig;
export type DetailEvidenceRuntimeGraph = MainIdeaRuntimeGraph;
export type InferenceVersionRow = MainIdeaVersionRow;
export type InferenceStudentQuestion = MainIdeaStudentQuestion;
export type InferenceRuntimeConfig = MainIdeaRuntimeConfig;
export type InferenceRuntimeGraph = MainIdeaRuntimeGraph;
export type AttentionBurstRuntimeConfig = MainIdeaRuntimeConfig;
export type AttentionBurstRuntimeGraph = MainIdeaRuntimeGraph;
export type RapidRecognitionRuntimeConfig = MainIdeaRuntimeConfig;
export type RapidRecognitionRuntimeGraph = MainIdeaRuntimeGraph;
export type PhraseChunkingRuntimeConfig = MainIdeaRuntimeConfig;
export type PhraseChunkingRuntimeGraph = MainIdeaRuntimeGraph;

/**
 * Loads the published runtime graph for the family declared by the version
 * snapshot.  All student-facing training entry points should use this
 * dispatcher so that publication, tenant visibility and content/question
 * validation cannot drift between routes.
 */
export async function loadTrainingRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<MainIdeaRuntimeGraph> {
  const version = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: { config: true },
  });
  if (!version) throw notFoundError("Egzersiz sürümü bulunamadı");

  const resolved = resolveTrainingRuntimeConfig("TRAINING", version.config);
  if (resolved.status !== "READY") {
    throw validationError("Egzersiz sürümü yapılandırması geçersiz veya eksik");
  }

  switch (resolved.config.family) {
    case ATTENTION_BURST_FAMILY:
      return loadAttentionBurstRuntimeGraph(templateVersionId, actor);
    case RAPID_RECOGNITION_FAMILY:
      return loadRapidRecognitionRuntimeGraph(templateVersionId, actor);
    case PHRASE_CHUNKING_FAMILY:
      return loadPhraseChunkingRuntimeGraph(templateVersionId, actor);
    case DETAIL_EVIDENCE_FAMILY:
      return loadDetailEvidenceRuntimeGraph(templateVersionId, actor);
    case INFERENCE_FAMILY:
      return loadInferenceRuntimeGraph(templateVersionId, actor);
    case MAIN_IDEA_FAMILY:
      return loadMainIdeaRuntimeGraph(templateVersionId, actor);
  }

  throw validationError("Egzersiz ailesi desteklenmiyor");
}

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

export function toTrainingRuntimeConfig(
  config: TrainingExerciseVersionConfig,
): TrainingRuntimeConfig {
  return toMainIdeaRuntimeConfig(config);
}

export function toDetailEvidenceRuntimeConfig(
  config: TrainingExerciseVersionConfig,
): DetailEvidenceRuntimeConfig {
  return toTrainingRuntimeConfig(config);
}

function tenantVisible(templateTenantId: string | null, actor: TrainingActor): boolean {
  return (
    actor.platformRole === "SUPER_ADMIN" ||
    templateTenantId === null ||
    templateTenantId === actor.tenantId
  );
}

function isOptionList(
  value: unknown,
  expectedCount = 4,
): value is Array<{ id: string; text: string }> {
  return (
    Array.isArray(value) &&
    value.length === expectedCount &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        (item as { id: string }).id.trim().length > 0 &&
        typeof (item as { text?: unknown }).text === "string" &&
        (item as { text: string }).text.trim().length > 0,
    ) &&
    new Set(value.map((item) => item.id)).size === expectedCount
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

type ComprehensionSpec = {
  family: TrainingExerciseVersionConfig["family"];
  label: string;
  skillCode: TrainingExerciseVersionConfig["competency"];
  rendererKey: string;
  optionCount: number;
  allowedDifficulties: ReadonlyArray<TrainingExerciseVersionConfig["difficulty"]>;
};

const MAIN_IDEA_SPEC: ComprehensionSpec = {
  family: MAIN_IDEA_FAMILY,
  label: MAIN_IDEA_FAMILY,
  skillCode: "RC_MAIN_IDEA",
  rendererKey: MAIN_IDEA_RENDERER,
  optionCount: 4,
  allowedDifficulties: ["FOUNDATION", "DEVELOPING"],
};

const DETAIL_EVIDENCE_SPEC: ComprehensionSpec = {
  family: DETAIL_EVIDENCE_FAMILY,
  label: DETAIL_EVIDENCE_FAMILY,
  skillCode: "RC_DETAIL",
  rendererKey: MAIN_IDEA_RENDERER,
  optionCount: 4,
  allowedDifficulties: ["FOUNDATION", "DEVELOPING", "CHALLENGING"],
};

const INFERENCE_SPEC: ComprehensionSpec = {
  family: INFERENCE_FAMILY,
  label: INFERENCE_FAMILY,
  skillCode: "RC_INFERENCE",
  rendererKey: MAIN_IDEA_RENDERER,
  optionCount: 4,
  allowedDifficulties: ["FOUNDATION", "DEVELOPING", "CHALLENGING"],
};

const ATTENTION_BURST_SPEC: ComprehensionSpec = {
  family: ATTENTION_BURST_FAMILY,
  label: ATTENTION_BURST_FAMILY,
  skillCode: "FAST_ATTENTION",
  rendererKey: FAST_READING_RENDERERS.ATTENTION_BURST,
  optionCount: 4,
  allowedDifficulties: ["FOUNDATION", "DEVELOPING", "CHALLENGING"],
};

const RAPID_RECOGNITION_SPEC: ComprehensionSpec = {
  family: RAPID_RECOGNITION_FAMILY,
  label: RAPID_RECOGNITION_FAMILY,
  skillCode: "FAST_RECOGNITION",
  rendererKey: FAST_READING_RENDERERS.RAPID_RECOGNITION,
  optionCount: 4,
  allowedDifficulties: ["FOUNDATION", "DEVELOPING", "CHALLENGING"],
};

const PHRASE_CHUNKING_SPEC: ComprehensionSpec = {
  family: PHRASE_CHUNKING_FAMILY,
  label: PHRASE_CHUNKING_FAMILY,
  skillCode: "FAST_CHUNKING",
  rendererKey: FAST_READING_RENDERERS.PHRASE_CHUNKING,
  optionCount: 4,
  allowedDifficulties: ["FOUNDATION", "DEVELOPING", "CHALLENGING"],
};

function isComprehensionConfig(
  config: unknown,
  family: ComprehensionSpec["family"],
): config is TrainingExerciseVersionConfig {
  const parsed = resolveTrainingRuntimeConfig("TRAINING", config);
  return parsed.status === "READY" && parsed.config.family === family;
}

function declaresComprehension(config: unknown, family: ComprehensionSpec["family"]): boolean {
  return isTrainingConfigCandidate(config) && (config as { family?: unknown }).family === family;
}

function validateComprehensionRow(
  row: MainIdeaVersionRow,
  actor: TrainingActor,
  spec: ComprehensionSpec,
): MainIdeaRuntimeGraph {
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
    config.family !== spec.family ||
    config.competency !== spec.skillCode ||
    config.interactionType !== MAIN_IDEA_INTERACTION ||
    config.contentRequirement !== "REQUIRED" ||
    config.questionRequirement !== "REQUIRED" ||
    config.rendererKey !== spec.rendererKey ||
    !spec.allowedDifficulties.includes(config.difficulty)
  ) {
    throw validationError(`${spec.label} exercise contract desteklenmiyor`);
  }
  if (row.contents.length === 0 || row.questions.length === 0) {
    throw validationError(`${spec.label} için yayınlanmış içerik ve soru gerekli`);
  }

  const contentByContentId = new Map<string, MainIdeaVersionRow["contents"][number]>();
  const contentPositions = new Set<number>();
  for (const entry of row.contents) {
    const contentVersion = entry.contentVersion;
    const content = contentVersion.content;
    if (
      contentVersion.status !== "PUBLISHED" ||
      content.status !== "PUBLISHED" ||
      content.deletedAt !== null ||
      contentVersion.body.trim().length === 0
    ) {
      throw validationError(`${spec.label} içerik grafiği yayınlanmış değil`);
    }
    if (contentPositions.has(entry.position)) {
      throw validationError(`${spec.label} içerik pozisyonları benzersiz olmalı`);
    }
    contentPositions.add(entry.position);
    if (!tenantVisible(content.tenantId, actor)) {
      throw forbiddenError("İçerik bu tenant kapsamına ait değil");
    }
    if (contentByContentId.has(contentVersion.contentId)) {
      throw validationError(`${spec.label} içerik grafiğinde tekrar var`);
    }
    contentByContentId.set(contentVersion.contentId, entry);
  }

  const questionPositions = new Set<number>();
  const questionVersionIds = new Set<string>();
  const questions = row.questions.map((entry): MainIdeaStudentQuestion => {
    const questionVersion = entry.questionVersion;
    const question = questionVersion.question;
    const content = contentByContentId.get(question.contentId);
    if (!content) throw validationError("Soru güncel içerik sürümüne bağlı değil");
    if (questionPositions.has(entry.position)) {
      throw validationError(`${spec.label} soru pozisyonları benzersiz olmalı`);
    }
    questionPositions.add(entry.position);
    if (questionVersionIds.has(questionVersion.id)) {
      throw validationError(`${spec.label} soru grafiğinde tekrar var`);
    }
    questionVersionIds.add(questionVersion.id);
    if (
      questionVersion.status !== "PUBLISHED" ||
      question.status !== "PUBLISHED" ||
      question.deletedAt !== null ||
      question.type !== MAIN_IDEA_INTERACTION ||
      question.skill?.code !== spec.skillCode
    ) {
      throw validationError(`${spec.label} soru grafiği yayınlanmış veya uyumlu değil`);
    }
    if (
      questionVersion.contentVersionId !== null &&
      questionVersion.contentVersionId !== content.contentVersionId
    ) {
      throw validationError(`${spec.label} soru sürümü içerik sürümüyle uyumlu değil`);
    }
    if (!isOptionList(questionVersion.options, spec.optionCount)) {
      throw validationError(`${spec.label} sorusu ${spec.optionCount} geçerli seçenek içermeli`);
    }
    const optionIds = new Set(questionVersion.options.map((option) => option.id));
    if (!hasValidMultipleChoiceAnswer(questionVersion.correctAnswer, optionIds)) {
      throw validationError(`${spec.label} doğru cevap yapılandırması geçersiz`);
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
    config: toTrainingRuntimeConfig(config),
    questions,
  };
}

function isMainIdeaConfig(config: unknown): config is TrainingExerciseVersionConfig {
  return isComprehensionConfig(config, MAIN_IDEA_FAMILY);
}

function isDetailEvidenceConfig(config: unknown): config is TrainingExerciseVersionConfig {
  return isComprehensionConfig(config, DETAIL_EVIDENCE_FAMILY);
}

function isInferenceConfig(config: unknown): config is TrainingExerciseVersionConfig {
  return isComprehensionConfig(config, INFERENCE_FAMILY);
}

function declaresMainIdea(config: unknown): boolean {
  return declaresComprehension(config, MAIN_IDEA_FAMILY);
}

function declaresDetailEvidence(config: unknown): boolean {
  return declaresComprehension(config, DETAIL_EVIDENCE_FAMILY);
}

function declaresInference(config: unknown): boolean {
  return declaresComprehension(config, INFERENCE_FAMILY);
}

function validateMainIdeaRow(row: MainIdeaVersionRow, actor: TrainingActor): MainIdeaRuntimeGraph {
  return validateComprehensionRow(row, actor, MAIN_IDEA_SPEC);
}

function validateDetailEvidenceRow(
  row: DetailEvidenceVersionRow,
  actor: TrainingActor,
): DetailEvidenceRuntimeGraph {
  return validateComprehensionRow(row, actor, DETAIL_EVIDENCE_SPEC);
}

function validateInferenceRow(
  row: InferenceVersionRow,
  actor: TrainingActor,
): InferenceRuntimeGraph {
  return validateComprehensionRow(row, actor, INFERENCE_SPEC);
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

export async function loadDetailEvidenceRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<DetailEvidenceRuntimeGraph> {
  const row = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: mainIdeaVersionSelect,
  });
  if (!row) throw notFoundError("DETAIL_EVIDENCE exercise sürümü bulunamadı");
  return validateDetailEvidenceRow(row, actor);
}

export async function resolveDetailEvidenceTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
): Promise<DetailEvidenceRuntimeGraph> {
  if (requestedTemplateVersionId?.trim()) {
    return loadDetailEvidenceRuntimeGraph(requestedTemplateVersionId.trim(), actor);
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
  const detailEvidenceCandidates = candidates.filter((item) => declaresDetailEvidence(item.config));
  if (detailEvidenceCandidates.length === 0) {
    throw notFoundError("Yayınlanmış DETAIL_EVIDENCE exercise bulunamadı");
  }
  if (detailEvidenceCandidates.length > 1) {
    throw conflictError("Birden fazla yayınlanmış DETAIL_EVIDENCE exercise bulundu");
  }
  return loadDetailEvidenceRuntimeGraph(detailEvidenceCandidates[0]!.id, actor);
}

export async function loadInferenceRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<InferenceRuntimeGraph> {
  const row = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: mainIdeaVersionSelect,
  });
  if (!row) throw notFoundError("INFERENCE exercise sürümü bulunamadı");
  return validateInferenceRow(row, actor);
}

export async function resolveInferenceTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
): Promise<InferenceRuntimeGraph> {
  if (requestedTemplateVersionId?.trim()) {
    return loadInferenceRuntimeGraph(requestedTemplateVersionId.trim(), actor);
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
  const inferenceCandidates = candidates.filter((item) => declaresInference(item.config));
  if (inferenceCandidates.length === 0) {
    throw notFoundError("Yayınlanmış INFERENCE exercise bulunamadı");
  }
  if (inferenceCandidates.length > 1) {
    throw conflictError("Birden fazla yayınlanmış INFERENCE exercise bulundu");
  }
  return loadInferenceRuntimeGraph(inferenceCandidates[0]!.id, actor);
}

async function loadFastReadingRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
  spec: ComprehensionSpec,
): Promise<MainIdeaRuntimeGraph> {
  const row = await prisma.exerciseTemplateVersion.findUnique({
    where: { id: templateVersionId },
    select: mainIdeaVersionSelect,
  });
  if (!row) throw notFoundError(`${spec.label} exercise sürümü bulunamadı`);
  return validateComprehensionRow(row, actor, spec);
}

async function resolveFastReadingTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId: string | undefined,
  spec: ComprehensionSpec,
): Promise<MainIdeaRuntimeGraph> {
  if (requestedTemplateVersionId?.trim()) {
    return loadFastReadingRuntimeGraph(requestedTemplateVersionId.trim(), actor, spec);
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
  const matches = candidates.filter((item) => declaresComprehension(item.config, spec.family));
  if (matches.length === 0) {
    throw notFoundError(`Yayınlanmış ${spec.label} exercise bulunamadı`);
  }
  if (matches.length > 1) {
    throw conflictError(`Birden fazla yayınlanmış ${spec.label} exercise bulundu`);
  }
  return loadFastReadingRuntimeGraph(matches[0]!.id, actor, spec);
}

export async function loadAttentionBurstRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<AttentionBurstRuntimeGraph> {
  return loadFastReadingRuntimeGraph(templateVersionId, actor, ATTENTION_BURST_SPEC);
}

export async function resolveAttentionBurstTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
): Promise<AttentionBurstRuntimeGraph> {
  return resolveFastReadingTemplateVersion(actor, requestedTemplateVersionId, ATTENTION_BURST_SPEC);
}

export async function loadRapidRecognitionRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<RapidRecognitionRuntimeGraph> {
  return loadFastReadingRuntimeGraph(templateVersionId, actor, RAPID_RECOGNITION_SPEC);
}

export async function resolveRapidRecognitionTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
): Promise<RapidRecognitionRuntimeGraph> {
  return resolveFastReadingTemplateVersion(
    actor,
    requestedTemplateVersionId,
    RAPID_RECOGNITION_SPEC,
  );
}

export async function loadPhraseChunkingRuntimeGraph(
  templateVersionId: string,
  actor: TrainingActor,
): Promise<PhraseChunkingRuntimeGraph> {
  return loadFastReadingRuntimeGraph(templateVersionId, actor, PHRASE_CHUNKING_SPEC);
}

export async function resolvePhraseChunkingTemplateVersion(
  actor: TrainingActor,
  requestedTemplateVersionId?: string,
): Promise<PhraseChunkingRuntimeGraph> {
  return resolveFastReadingTemplateVersion(actor, requestedTemplateVersionId, PHRASE_CHUNKING_SPEC);
}

export function buildTrainingFeedback(config: unknown, isCorrect: boolean | null): string | null {
  const resolved = resolveTrainingRuntimeConfig("TRAINING", config);
  if (resolved.status !== "READY") return null;
  if (resolved.config.family === ATTENTION_BURST_FAMILY) {
    if (isCorrect === true && resolved.config.feedback.types.includes("POSITIVE")) {
      return "Güzel yakaladın.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("CORRECTIVE")) {
      return "Tekrar düşün. Hedef ayrıntıya yeniden odaklan.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("HINT")) {
      return "İpucu: Seçenekleri dikkatle karşılaştır.";
    }
    return null;
  }
  if (resolved.config.family === RAPID_RECOGNITION_FAMILY) {
    if (isCorrect === true && resolved.config.feedback.types.includes("POSITIVE")) {
      return "Hızlı ve doğru yakaladın.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("CORRECTIVE")) {
      return "Tekrar düşün. Kelime veya ifadeyi dikkatle karşılaştır.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("HINT")) {
      return "İpucu: Hedef ifadeyi seçeneklerle eşleştir.";
    }
    return null;
  }
  if (resolved.config.family === PHRASE_CHUNKING_FAMILY) {
    if (isCorrect === true && resolved.config.feedback.types.includes("POSITIVE")) {
      return "İfadeyi anlamlı bir parça olarak yakaladın.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("CORRECTIVE")) {
      return "Tekrar düşün. Kelimeleri birlikte değerlendir.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("HINT")) {
      return "İpucu: En doğal anlam grubunu seç.";
    }
    return null;
  }
  if (resolved.config.family === INFERENCE_FAMILY) {
    if (isCorrect === true && resolved.config.feedback.types.includes("POSITIVE")) {
      return "Metinden güçlü bir çıkarım yaptın.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("CORRECTIVE")) {
      return "Bu seçenek metnin desteklediği çıkarım değil.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("HINT")) {
      return "İpucu: Metindeki iki bilgiyi birlikte düşünerek en güçlü sonucu seç.";
    }
    return null;
  }
  if (resolved.config.family === DETAIL_EVIDENCE_FAMILY) {
    if (isCorrect === true && resolved.config.feedback.types.includes("POSITIVE")) {
      return "Metindeki ayrıntıyı doğru yakaladın.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("CORRECTIVE")) {
      return "Bu seçenek, pasajdaki bilgiyi doğru yansıtmıyor.";
    }
    if (isCorrect === false && resolved.config.feedback.types.includes("HINT")) {
      return "İpucu: Soruda istenen bilgiyi pasajda açıkça destekleyen cümleyi bul.";
    }
    return null;
  }
  if (resolved.config.family !== MAIN_IDEA_FAMILY) return null;
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

export function isDetailEvidenceVersionConfig(config: unknown): boolean {
  return isDetailEvidenceConfig(config);
}

export function isInferenceVersionConfig(config: unknown): boolean {
  return isInferenceConfig(config);
}

export function isAttentionBurstVersionConfig(config: unknown): boolean {
  return isComprehensionConfig(config, ATTENTION_BURST_FAMILY);
}

export function isRapidRecognitionVersionConfig(config: unknown): boolean {
  return isComprehensionConfig(config, RAPID_RECOGNITION_FAMILY);
}

export function isPhraseChunkingVersionConfig(config: unknown): boolean {
  return isComprehensionConfig(config, PHRASE_CHUNKING_FAMILY);
}
