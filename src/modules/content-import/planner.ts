import type { ContentImportManifest, ContentImportQuestion } from "./manifest-schema.js";
import { importFingerprint, stableJson } from "./duplicate-detector.js";
import {
  contentImportIdentity,
  contentImportVersionIdentity,
  questionImportIdentity,
  questionImportVersionIdentity,
} from "./identity.js";
import type {
  ContentImportPlan,
  ExistingContentImportIndex,
  ExistingContentImportState,
  ExistingQuestionImportState,
  ImportOperation,
  ImportOperationType,
} from "./types.js";
import { validateContentImportManifest } from "./validator.js";

function operationId(
  operation: ImportOperationType,
  identity: string,
  version: number | null,
): string {
  return `${operation}:${identity}${version === null ? "" : `:v${version}`}`;
}

function contentIdentity(manifest: ContentImportManifest): string {
  return contentImportIdentity(manifest.manifestId, manifest.content.externalKey);
}

function contentVersionIdentity(manifest: ContentImportManifest, version: number): string {
  return contentImportVersionIdentity(manifest.manifestId, manifest.content.externalKey, version);
}

function questionIdentity(
  manifest: ContentImportManifest,
  question: ContentImportQuestion,
): string {
  return questionImportIdentity(manifest.manifestId, question.externalKey);
}

function questionVersionIdentity(
  manifest: ContentImportManifest,
  question: ContentImportQuestion,
): string {
  return questionImportVersionIdentity(manifest.manifestId, question.externalKey);
}

function operation(input: Omit<ImportOperation, "operationId">): ImportOperation {
  return {
    ...input,
    operationId: operationId(input.operation, input.stableIdentity, input.targetVersion),
  };
}

function currentContent(
  manifest: ContentImportManifest,
  existing: ExistingContentImportIndex,
): ExistingContentImportState | undefined {
  const identity = contentIdentity(manifest);
  return existing.contents?.find(
    (entry) =>
      entry.externalKey === manifest.content.externalKey &&
      (entry.stableIdentity === undefined || entry.stableIdentity === identity),
  );
}

function currentQuestion(
  manifest: ContentImportManifest,
  question: ContentImportQuestion,
  existing: ExistingContentImportIndex,
): ExistingQuestionImportState | undefined {
  const identity = questionIdentity(manifest, question);
  return existing.questions?.find(
    (entry) =>
      entry.externalKey === question.externalKey &&
      (entry.stableIdentity === undefined || entry.stableIdentity === identity),
  );
}

function contentVersionDecision(
  manifest: ContentImportManifest,
  existing: ExistingContentImportIndex,
  contentFingerprint: string,
): { operation: ImportOperationType; version: number; reason: string | null } {
  const current = currentContent(manifest, existing);
  if (current?.deleted) {
    return {
      operation: "REJECT",
      version: current.currentVersion?.version ?? 1,
      reason: "Silinmiş import kimliği yeniden kullanılamaz",
    };
  }
  if (!current || !current.currentVersion)
    return { operation: "CREATE_CONTENT_VERSION", version: 1, reason: null };
  if (current.currentVersion.fingerprint === contentFingerprint) {
    return {
      operation: "REUSE_EXISTING",
      version: current.currentVersion.version,
      reason: "Aynı içerik fingerprint'i mevcut",
    };
  }
  if (current.currentVersion.status === "PUBLISHED") {
    return {
      operation: "CREATE_NEW_VERSION",
      version: current.currentVersion.version + 1,
      reason: "Published sürüm overwrite edilmez",
    };
  }
  return {
    operation: "REJECT",
    version: current.currentVersion.version,
    reason: "Mevcut draft/review sürümü sessizce overwrite edilemez",
  };
}

function questionVersionDecision(
  question: ContentImportQuestion,
  manifest: ContentImportManifest,
  existing: ExistingContentImportIndex,
  questionFingerprint: string,
  contentVersion: number,
): { operation: ImportOperationType; version: number; reason: string | null } {
  const current = currentQuestion(manifest, question, existing);
  if (current?.deleted) {
    return {
      operation: "REJECT",
      version: current.currentVersion?.version ?? 1,
      reason: "Silinmiş import kimliği yeniden kullanılamaz",
    };
  }
  if (!current || !current.currentVersion)
    return { operation: "CREATE_QUESTION_VERSION", version: 1, reason: null };
  if (
    current.currentVersion.fingerprint === questionFingerprint &&
    current.currentVersion.contentExternalKey === manifest.content.externalKey &&
    current.currentVersion.contentVersion === contentVersion
  ) {
    return {
      operation: "REUSE_EXISTING",
      version: current.currentVersion.version,
      reason: "Aynı soru fingerprint'i ve ContentVersion bağlantısı mevcut",
    };
  }
  if (current.currentVersion.status === "PUBLISHED") {
    return {
      operation: "CREATE_NEW_VERSION",
      version: current.currentVersion.version + 1,
      reason: "Published soru sürümü overwrite edilmez",
    };
  }
  return {
    operation: "REJECT",
    version: current.currentVersion.version,
    reason: "Mevcut draft/review soru sürümü sessizce overwrite edilemez",
  };
}

export function buildContentImportPlan(
  manifest: ContentImportManifest,
  existing: ExistingContentImportIndex = {},
): ContentImportPlan {
  const validation = validateContentImportManifest(manifest, existing);
  if (!validation.ok) {
    throw new Error(
      validation.issues.map((entry) => `${entry.code} ${entry.path}: ${entry.message}`).join("\n"),
    );
  }

  const operations: ImportOperation[] = [];
  const contentStableIdentity = contentIdentity(manifest);
  const contentFingerprint = importFingerprint({
    title: manifest.content.title,
    contentType: manifest.content.contentType,
    competency: manifest.content.competency,
    difficulty: manifest.content.difficulty,
    passage: manifest.content.passage,
    metadata: manifest.content.metadata ?? null,
  });
  const existingContent = currentContent(manifest, existing);
  const contentOperation: ImportOperationType = existingContent?.deleted
    ? "REJECT"
    : existingContent
      ? "REUSE_EXISTING"
      : "CREATE_CONTENT";
  operations.push(
    operation({
      operation: contentOperation,
      entityType: "CONTENT",
      externalKey: manifest.content.externalKey,
      stableIdentity: contentStableIdentity,
      targetVersion: null,
      dependencies: [],
      payloadFingerprint: contentFingerprint,
      reason: existingContent?.deleted
        ? "Silinmiş import kimliği yeniden kullanılamaz"
        : existingContent
          ? "Stable externalKey mevcut"
          : null,
    }),
  );

  const contentVersion = contentVersionDecision(manifest, existing, contentFingerprint);
  const contentVersionIdentityValue = contentVersionIdentity(manifest, contentVersion.version);
  operations.push(
    operation({
      operation: contentVersion.operation,
      entityType: "CONTENT_VERSION",
      externalKey: manifest.content.externalKey,
      stableIdentity: contentVersionIdentityValue,
      targetVersion: contentVersion.version,
      dependencies: [operations[0]!.operationId],
      payloadFingerprint: contentFingerprint,
      reason: contentVersion.reason,
    }),
  );

  for (const question of manifest.questions) {
    const qIdentity = questionIdentity(manifest, question);
    const qFingerprint = importFingerprint(question);
    const existingQuestion = currentQuestion(manifest, question, existing);
    const questionOperation: ImportOperationType = existingQuestion?.deleted
      ? "REJECT"
      : existingQuestion
        ? "REUSE_EXISTING"
        : "CREATE_QUESTION";
    operations.push(
      operation({
        operation: questionOperation,
        entityType: "QUESTION",
        externalKey: question.externalKey,
        stableIdentity: qIdentity,
        targetVersion: null,
        dependencies: [operations[1]!.operationId],
        payloadFingerprint: qFingerprint,
        reason: existingQuestion?.deleted
          ? "Silinmiş import kimliği yeniden kullanılamaz"
          : existingQuestion
            ? "Stable externalKey mevcut"
            : null,
      }),
    );
    const qVersion = questionVersionDecision(
      question,
      manifest,
      existing,
      qFingerprint,
      contentVersion.version,
    );
    const qVersionIdentity = questionVersionIdentity(manifest, question);
    operations.push(
      operation({
        operation: qVersion.operation,
        entityType: "QUESTION_VERSION",
        externalKey: question.externalKey,
        stableIdentity: qVersionIdentity,
        targetVersion: qVersion.version,
        dependencies: [operations[operations.length - 1]!.operationId],
        payloadFingerprint: qFingerprint,
        reason: qVersion.reason,
      }),
    );
    operations.push(
      operation({
        operation: "LINK_QUESTION_TO_CONTENT_VERSION",
        entityType: "RELATION",
        externalKey: question.externalKey,
        stableIdentity: `${qVersionIdentity}:CONTENT_LINK`,
        targetVersion: contentVersion.version,
        dependencies: [operations[1]!.operationId, operations[operations.length - 1]!.operationId],
        payloadFingerprint: null,
        reason: "QuestionVersion ContentVersion v1'e bağlanır",
      }),
    );
  }

  const normalizedOperations = operations.map((entry, index) => ({ position: index, ...entry }));
  return {
    manifestId: manifest.manifestId,
    manifestVersion: 1,
    operations,
    fingerprint: importFingerprint({
      manifestId: manifest.manifestId,
      manifestVersion: 1,
      target: manifest.target,
      operations: normalizedOperations,
    }),
  };
}

export function importPlanJson(plan: ContentImportPlan): string {
  return stableJson(plan);
}
