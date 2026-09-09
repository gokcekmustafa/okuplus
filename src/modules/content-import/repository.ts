import { Prisma, PrismaClient, type ContentType, type QuestionType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { applyTenantContext } from "../tenant/context.js";
import { validateQuestionVersionPayload } from "../questions/schemas.js";
import { normalizeImportText } from "./duplicate-detector.js";
import {
  buildImportMarker,
  buildImportMetadata,
  importMetadataMarker,
  type ContentImportMetadataMarker,
} from "./identity.js";
import type {
  ContentImportContent,
  ContentImportManifest,
  ContentImportQuestion,
} from "./manifest-schema.js";
import type {
  ContentImportActor,
  ContentImportErrorCode,
  ExistingContentImportIndex,
} from "./types.js";

export type ContentImportTarget = ContentImportManifest["target"];

export type ContentImportAuditInput = {
  tenantId: string | null;
  actorUserId: string;
  action: "CREATE" | "VERSION_CREATED";
  entityType: "CONTENT" | "CONTENT_VERSION" | "QUESTION" | "QUESTION_VERSION";
  entityId: string;
  version?: number;
  manifestId: string;
  manifestVersion: 1;
  planFingerprint: string;
  externalKey: string;
};

export type ContentImportCreateContentInput = {
  content: ContentImportContent;
  tenantId: string | null;
  stableIdentity: string;
  payloadFingerprint: string;
  manifestId: string;
  actor: ContentImportActor;
};

export type ContentImportCreateContentVersionInput = {
  contentId: string;
  content: ContentImportContent;
  version: number;
  stableIdentity: string;
  payloadFingerprint: string;
  manifestId: string;
  actorUserId: string;
};

export type ContentImportCreateQuestionInput = {
  question: ContentImportQuestion;
  questionIndex: number;
  contentId: string;
  stableIdentity: string;
  payloadFingerprint: string;
  manifestId: string;
  actor: ContentImportActor;
};

export type ContentImportCreateQuestionVersionInput = {
  question: ContentImportQuestion;
  questionId: string;
  contentId: string;
  contentVersionId: string;
  version: number;
  stableIdentity: string;
  payloadFingerprint: string;
  manifestId: string;
  contentExternalKey: string;
  contentVersion: number;
  actorUserId: string;
};

export type ContentImportTransaction = {
  lockImportScope(stableKey: string): Promise<void>;
  loadExistingImportIndex(target: ContentImportTarget): Promise<ExistingContentImportIndex>;
  assertDependencies(manifest: ContentImportManifest): Promise<void>;
  createContent(input: ContentImportCreateContentInput): Promise<{ id: string }>;
  createContentVersion(input: ContentImportCreateContentVersionInput): Promise<{ id: string }>;
  createQuestion(input: ContentImportCreateQuestionInput): Promise<{ id: string }>;
  createQuestionVersion(input: ContentImportCreateQuestionVersionInput): Promise<{ id: string }>;
  ensureQuestionVersionContentLink(input: {
    questionVersionId: string;
    questionId: string;
    contentId: string;
    contentVersionId: string;
  }): Promise<void>;
  writeAudit(input: ContentImportAuditInput): Promise<void>;
};

export interface ContentImportRepository {
  runInTransaction<T>(
    actor: ContentImportActor,
    callback: (tx: ContentImportTransaction) => Promise<T>,
  ): Promise<T>;
}

export class ContentImportRepositoryError extends Error {
  constructor(
    readonly code: ContentImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContentImportRepositoryError";
  }
}

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function storedOptions(
  question: ContentImportQuestion,
): Array<{ id: string; text: string; position: number }> {
  return question.options.map((option, position) => ({
    id: option.key,
    text: option.text,
    position,
  }));
}

function storedCorrectAnswer(question: ContentImportQuestion): Record<string, unknown> {
  switch (question.type) {
    case "MULTIPLE_CHOICE": {
      const ids = Array.isArray(question.correctAnswer)
        ? question.correctAnswer
        : [question.correctAnswer];
      return {
        type: "MULTIPLE_CHOICE",
        correctOptionIds: ids,
        allowMultiple: Array.isArray(question.correctAnswer),
        partialCredit: false,
      };
    }
    case "TRUE_FALSE":
      return { type: "TRUE_FALSE", answer: question.correctAnswer };
    case "OPEN_ENDED":
      return { type: "OPEN_ENDED", expectedAnswer: question.correctAnswer };
    case "MATCHING": {
      const answer = question.correctAnswer as {
        pairs: Array<{ leftKey: string; rightKey: string }>;
      };
      return {
        type: "MATCHING",
        pairs: answer.pairs.map((pair) => ({
          leftId: pair.leftKey,
          rightId: pair.rightKey,
        })),
        partialCredit: false,
      };
    }
    case "FILL_BLANK": {
      const answer = question.correctAnswer as {
        blanks: Array<{ blankKey: string; acceptedAnswers: string[] }>;
      };
      return {
        type: "FILL_BLANK",
        blanks: answer.blanks.map((blank) => ({
          blankId: blank.blankKey,
          acceptedAnswers: blank.acceptedAnswers,
        })),
        partialCredit: false,
      };
    }
  }
}

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function contentScopeWhere(target: ContentImportTarget): { tenantId: string | null } {
  return { tenantId: target.scope === "GLOBAL" ? null : (target.tenantId ?? null) };
}

function markerWithBase(
  marker: Omit<ContentImportMetadataMarker, "manifestVersion">,
): Prisma.InputJsonValue {
  return inputJson(buildImportMarker(marker));
}

class PrismaContentImportTransaction implements ContentImportTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async lockImportScope(stableKey: string): Promise<void> {
    await this.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${stableKey}, 0))`;
  }

  async loadExistingImportIndex(target: ContentImportTarget): Promise<ExistingContentImportIndex> {
    const scope = contentScopeWhere(target);
    const contents = await this.tx.content.findMany({
      where: scope,
      select: {
        id: true,
        tenantId: true,
        deletedAt: true,
        metadata: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { id: true, version: true, status: true, body: true, metadata: true },
        },
        questions: { select: { position: true, deletedAt: true } },
      },
    });

    const importedContents = contents.flatMap((content) => {
      const marker = importMetadataMarker(content.metadata);
      const currentVersion = content.versions[0];
      const versionMarker = importMetadataMarker(currentVersion?.metadata);
      return [
        {
          id: content.id,
          tenantId: content.tenantId,
          deleted: content.deletedAt !== null,
          externalKey: marker?.externalKey ?? `legacy:${content.id}`,
          ...(marker?.stableIdentity ? { stableIdentity: marker.stableIdentity } : {}),
          normalizedPassage: normalizeImportText(currentVersion?.body ?? ""),
          questionPositions: content.questions
            .filter((question) => question.deletedAt === null)
            .map((question) => question.position),
          currentVersion: currentVersion
            ? {
                id: currentVersion.id,
                version: currentVersion.version,
                status: currentVersion.status,
                fingerprint: versionMarker?.fingerprint ?? "UNTRACKED_VERSION",
              }
            : null,
        },
      ];
    });

    const questions = await this.tx.question.findMany({
      where: { content: scope },
      select: {
        id: true,
        deletedAt: true,
        metadata: true,
        content: { select: { tenantId: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            status: true,
            prompt: true,
            metadata: true,
            contentVersionId: true,
          },
        },
      },
    });

    const importedQuestions = questions.flatMap((question) => {
      const marker = importMetadataMarker(question.metadata);
      const currentVersion = question.versions[0];
      const versionMarker = importMetadataMarker(currentVersion?.metadata);
      return [
        {
          id: question.id,
          tenantId: question.content.tenantId,
          deleted: question.deletedAt !== null,
          externalKey: marker?.externalKey ?? `legacy:${question.id}`,
          ...(marker?.stableIdentity ? { stableIdentity: marker.stableIdentity } : {}),
          normalizedStem: normalizeImportText(currentVersion?.prompt ?? ""),
          currentVersion: currentVersion
            ? {
                id: currentVersion.id,
                version: currentVersion.version,
                status: currentVersion.status,
                fingerprint: versionMarker?.fingerprint ?? "UNTRACKED_VERSION",
                contentExternalKey: versionMarker?.contentExternalKey ?? "",
                contentVersion: versionMarker?.contentVersion ?? 0,
              }
            : null,
        },
      ];
    });

    return { contents: importedContents, questions: importedQuestions };
  }

  async assertDependencies(manifest: ContentImportManifest): Promise<void> {
    const skillCodes = [
      manifest.content.competency,
      ...manifest.questions.map((question) => question.competency),
    ];
    const skills = await this.tx.skill.findMany({
      where: { code: { in: [...new Set(skillCodes)] } },
      select: { code: true },
    });
    const available = new Set(skills.map((skill) => skill.code));
    if (available.size !== new Set(skillCodes).size) {
      throw new ContentImportRepositoryError(
        "IMPORT_PLAN_INVALID",
        "Manifest beceri kataloğundaki eksik bağımlılıklar nedeniyle uygulanamaz",
      );
    }
    if (manifest.target.scope === "TENANT") {
      const tenant = await this.tx.tenant.findFirst({
        where: { id: manifest.target.tenantId ?? "", deletedAt: null },
        select: { id: true },
      });
      if (!tenant) {
        throw new ContentImportRepositoryError("IMPORT_PLAN_INVALID", "Hedef tenant bulunamadı");
      }
    }
  }

  async createContent(input: ContentImportCreateContentInput): Promise<{ id: string }> {
    const skill = await this.tx.skill.findUnique({
      where: { code: input.content.competency },
      select: { id: true },
    });
    if (!skill)
      throw new ContentImportRepositoryError("IMPORT_PLAN_INVALID", "İçerik becerisi bulunamadı");
    const row = await this.tx.content.create({
      data: {
        tenantId: input.tenantId,
        type: input.content.contentType as ContentType,
        title: input.content.title,
        difficulty: input.content.difficulty,
        status: "DRAFT",
        createdById: input.actor.userId,
        metadata: inputJson(
          buildImportMetadata(
            jsonRecord(input.content.metadata),
            buildImportMarker({
              manifestId: input.manifestId,
              externalKey: input.content.externalKey,
              stableIdentity: input.stableIdentity,
              fingerprint: input.payloadFingerprint,
            }),
          ),
        ),
      },
      select: { id: true },
    });
    await this.tx.contentSkill.create({ data: { contentId: row.id, skillId: skill.id } });
    return row;
  }

  async createContentVersion(
    input: ContentImportCreateContentVersionInput,
  ): Promise<{ id: string }> {
    const row = await this.tx.contentVersion.create({
      data: {
        contentId: input.contentId,
        version: input.version,
        title: input.content.title,
        body: input.content.passage,
        wordCount: countWords(input.content.passage),
        license: input.content.license ?? null,
        changelog: input.content.changelog ?? null,
        status: "DRAFT",
        createdById: input.actorUserId,
        metadata: markerWithBase({
          manifestId: input.manifestId,
          externalKey: input.content.externalKey,
          stableIdentity: input.stableIdentity,
          fingerprint: input.payloadFingerprint,
          targetVersion: input.version,
        }),
      },
      select: { id: true },
    });
    return row;
  }

  async createQuestion(input: ContentImportCreateQuestionInput): Promise<{ id: string }> {
    const conflict = await this.tx.question.findFirst({
      where: {
        contentId: input.contentId,
        position: input.question.position ?? input.questionIndex,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ContentImportRepositoryError(
        "QUESTION_CONFLICT",
        "Soru pozisyonu zaten kullanılıyor",
      );
    }
    const skill = await this.tx.skill.findUnique({
      where: { code: input.question.competency },
      select: { id: true },
    });
    if (!skill)
      throw new ContentImportRepositoryError("IMPORT_PLAN_INVALID", "Soru becerisi bulunamadı");
    const row = await this.tx.question.create({
      data: {
        contentId: input.contentId,
        position: input.question.position ?? input.questionIndex,
        type: input.question.type as QuestionType,
        skillId: skill.id,
        status: "DRAFT",
        createdById: input.actor.userId,
        metadata: inputJson(
          buildImportMetadata(
            jsonRecord(input.question.metadata),
            buildImportMarker({
              manifestId: input.manifestId,
              externalKey: input.question.externalKey,
              stableIdentity: input.stableIdentity,
              fingerprint: input.payloadFingerprint,
            }),
          ),
        ),
      },
      select: { id: true },
    });
    return row;
  }

  async createQuestionVersion(
    input: ContentImportCreateQuestionVersionInput,
  ): Promise<{ id: string }> {
    const question = await this.tx.question.findFirst({
      where: { id: input.questionId, contentId: input.contentId, deletedAt: null },
      select: { id: true },
    });
    if (!question)
      throw new ContentImportRepositoryError("QUESTION_CONFLICT", "Soru kimliği geçersiz");
    const contentVersion = await this.tx.contentVersion.findFirst({
      where: { id: input.contentVersionId, contentId: input.contentId },
      select: { id: true },
    });
    if (!contentVersion)
      throw new ContentImportRepositoryError(
        "QUESTION_CONFLICT",
        "Soru sürümünün içerik sürümü geçersiz",
      );
    const options = storedOptions(input.question);
    const correctAnswer = storedCorrectAnswer(input.question);
    try {
      validateQuestionVersionPayload(input.question.type as QuestionType, {
        prompt: input.question.stem,
        options,
        correctAnswer,
        explanation: input.question.explanation ?? null,
        hint: input.question.hint ?? null,
        difficulty: input.question.difficulty,
      });
    } catch {
      throw new ContentImportRepositoryError(
        "IMPORT_PLAN_INVALID",
        "Soru sürümü payload'ı geçersiz",
      );
    }
    const row = await this.tx.questionVersion.create({
      data: {
        questionId: input.questionId,
        contentVersionId: input.contentVersionId,
        version: input.version,
        prompt: input.question.stem,
        options: inputJson(options),
        correctAnswer: inputJson(correctAnswer),
        explanation: input.question.explanation ?? null,
        hint: input.question.hint ?? null,
        difficulty: input.question.difficulty,
        status: "DRAFT",
        createdById: input.actorUserId,
        metadata: markerWithBase({
          manifestId: input.manifestId,
          externalKey: input.question.externalKey,
          stableIdentity: input.stableIdentity,
          fingerprint: input.payloadFingerprint,
          targetVersion: input.version,
          contentExternalKey: input.contentExternalKey,
          contentVersion: input.contentVersion,
        }),
      },
      select: { id: true },
    });
    return row;
  }

  async ensureQuestionVersionContentLink(input: {
    questionVersionId: string;
    questionId: string;
    contentId: string;
    contentVersionId: string;
  }): Promise<void> {
    const row = await this.tx.questionVersion.findUnique({
      where: { id: input.questionVersionId },
      select: {
        questionId: true,
        contentVersionId: true,
        status: true,
        question: { select: { contentId: true } },
      },
    });
    if (
      !row ||
      row.questionId !== input.questionId ||
      row.question.contentId !== input.contentId ||
      row.contentVersionId !== input.contentVersionId
    ) {
      throw new ContentImportRepositoryError(
        row?.status === "PUBLISHED" ? "PUBLISHED_VERSION_CONFLICT" : "QUESTION_CONFLICT",
        "Soru sürümü hedef içerik sürümüne bağlı değil",
      );
    }
  }

  async writeAudit(input: ContentImportAuditInput): Promise<void> {
    await this.tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        after: inputJson(
          input.action === "CREATE"
            ? {
                status: "DRAFT",
                import: {
                  manifestId: input.manifestId,
                  manifestVersion: input.manifestVersion,
                  planFingerprint: input.planFingerprint,
                  externalKey: input.externalKey,
                },
              }
            : {
                version: input.version,
                import: {
                  manifestId: input.manifestId,
                  manifestVersion: input.manifestVersion,
                  planFingerprint: input.planFingerprint,
                  externalKey: input.externalKey,
                },
              },
        ),
      },
    });
  }
}

export class PrismaContentImportRepository implements ContentImportRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async runInTransaction<T>(
    actor: ContentImportActor,
    callback: (tx: ContentImportTransaction) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await applyTenantContext(tx, actor);
      return callback(new PrismaContentImportTransaction(tx));
    });
  }
}
