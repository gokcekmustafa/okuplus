import { buildContentImportPlan } from "./planner.js";
import type { ContentImportManifest } from "./manifest-schema.js";
import {
  contentImportIdentity,
  contentImportVersionIdentity,
  questionImportIdentity,
} from "./identity.js";
import { validateContentImportManifest } from "./validator.js";
import type {
  ContentImportActor,
  ContentImportErrorCode,
  ContentImportPlan,
  ContentImportRunResult,
  ImportOperation,
} from "./types.js";
import type { ContentImportRepository, ContentImportTransaction } from "./repository.js";

export type ContentImportRunnerOptions = {
  dryRun?: boolean;
  repository: ContentImportRepository;
};

export class ContentImportRunnerError extends Error {
  constructor(
    readonly code: ContentImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ContentImportRunnerError";
  }
}

const SAFE_ERROR_MESSAGES: Record<ContentImportErrorCode, string> = {
  IMPORT_PLAN_INVALID: "Import planı geçersiz",
  TENANT_SCOPE_INVALID: "Import tenant kapsamı geçersiz",
  GLOBAL_IMPORT_FORBIDDEN: "Global import için platform yetkisi gerekli",
  CONTENT_CONFLICT: "İçerik import çakışması",
  QUESTION_CONFLICT: "Soru import çakışması",
  PUBLISHED_VERSION_CONFLICT: "Yayınlanmış sürüm değiştirilemez",
  IDEMPOTENCY_CONFLICT: "Aynı import kimliği farklı içerikle kullanılıyor",
  IMPORT_TRANSACTION_FAILED: "Import transaction başarısız oldu",
};

function emptyResult(
  status: ContentImportRunResult["status"],
  dryRun: boolean,
  planFingerprint: string | null,
  error?: ContentImportErrorCode,
): ContentImportRunResult {
  return {
    status,
    dryRun,
    createdCount: 0,
    reusedCount: 0,
    newVersionCount: 0,
    rejectedCount: error ? 1 : 0,
    auditCount: 0,
    planFingerprint,
    errors: error ? [{ code: error, message: SAFE_ERROR_MESSAGES[error] }] : [],
  };
}

function assertImportAuthorization(
  manifest: ContentImportManifest,
  actor: ContentImportActor,
): void {
  if (manifest.target.scope === "GLOBAL") {
    if (actor.platformRole !== "SUPER_ADMIN" || !actor.allowGlobal) {
      throw new ContentImportRunnerError(
        "GLOBAL_IMPORT_FORBIDDEN",
        SAFE_ERROR_MESSAGES.GLOBAL_IMPORT_FORBIDDEN,
      );
    }
    return;
  }

  if (!manifest.target.tenantId) {
    throw new ContentImportRunnerError(
      "TENANT_SCOPE_INVALID",
      SAFE_ERROR_MESSAGES.TENANT_SCOPE_INVALID,
    );
  }
  if (
    actor.platformRole !== "SUPER_ADMIN" &&
    (actor.platformRole !== "CONTENT_EDITOR" || actor.tenantId !== manifest.target.tenantId)
  ) {
    throw new ContentImportRunnerError(
      "TENANT_SCOPE_INVALID",
      SAFE_ERROR_MESSAGES.TENANT_SCOPE_INVALID,
    );
  }
}

function operationFor(
  plan: ContentImportPlan,
  entityType: ImportOperation["entityType"],
  externalKey: string,
  targetVersion?: number,
): ImportOperation {
  const operation = plan.operations.find(
    (entry) =>
      entry.entityType === entityType &&
      entry.externalKey === externalKey &&
      (targetVersion === undefined || entry.targetVersion === targetVersion),
  );
  if (!operation) {
    throw new ContentImportRunnerError(
      "IMPORT_PLAN_INVALID",
      SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
    );
  }
  return operation;
}

function findExistingByIdentity<T extends { stableIdentity?: string; externalKey: string }>(
  entries: readonly T[] | undefined,
  stableIdentity: string,
  externalKey: string,
): T | undefined {
  return entries?.find(
    (entry) =>
      entry.externalKey === externalKey &&
      (entry.stableIdentity === undefined || entry.stableIdentity === stableIdentity),
  );
}

function assertNoRejectedOperations(plan: ContentImportPlan): void {
  const rejected = plan.operations.find((entry) => entry.operation === "REJECT");
  if (rejected) {
    const code: ContentImportErrorCode =
      rejected.entityType === "QUESTION" || rejected.entityType === "QUESTION_VERSION"
        ? "QUESTION_CONFLICT"
        : "CONTENT_CONFLICT";
    throw new ContentImportRunnerError(code, SAFE_ERROR_MESSAGES[code]);
  }
}

async function executePlan(
  tx: ContentImportTransaction,
  manifest: ContentImportManifest,
  plan: ContentImportPlan,
  existing: NonNullable<Awaited<ReturnType<ContentImportTransaction["loadExistingImportIndex"]>>>,
  actor: ContentImportActor,
): Promise<ContentImportRunResult> {
  const operationIds = new Map<string, string>();
  const contentIds = new Map<string, string>();
  const contentVersionIds = new Map<string, string>();
  const questionIds = new Map<string, string>();
  const questionVersionIds = new Map<string, string>();
  let createdCount = 0;
  let reusedCount = 0;
  let newVersionCount = 0;
  let auditCount = 0;

  for (const operation of plan.operations) {
    if (operation.operation === "REJECT") {
      throw new ContentImportRunnerError(
        "IMPORT_PLAN_INVALID",
        SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
      );
    }

    if (operation.entityType === "CONTENT") {
      const stableIdentity = contentImportIdentity(
        manifest.manifestId,
        manifest.content.externalKey,
      );
      if (operation.operation === "CREATE_CONTENT") {
        const created = await tx.createContent({
          content: manifest.content,
          tenantId: manifest.target.scope === "GLOBAL" ? null : manifest.target.tenantId!,
          stableIdentity,
          payloadFingerprint: operation.payloadFingerprint!,
          manifestId: manifest.manifestId,
          actor,
        });
        contentIds.set(stableIdentity, created.id);
        createdCount += 1;
        await tx.writeAudit({
          tenantId: manifest.target.scope === "GLOBAL" ? null : manifest.target.tenantId!,
          actorUserId: actor.userId,
          action: "CREATE",
          entityType: "CONTENT",
          entityId: created.id,
          manifestId: manifest.manifestId,
          manifestVersion: 1,
          planFingerprint: plan.fingerprint,
          externalKey: manifest.content.externalKey,
        });
        auditCount += 1;
      } else if (operation.operation === "REUSE_EXISTING") {
        const state = findExistingByIdentity(
          existing.contents,
          stableIdentity,
          manifest.content.externalKey,
        );
        if (!state?.id)
          throw new ContentImportRunnerError(
            "IDEMPOTENCY_CONFLICT",
            SAFE_ERROR_MESSAGES.IDEMPOTENCY_CONFLICT,
          );
        contentIds.set(stableIdentity, state.id);
        reusedCount += 1;
      }
      operationIds.set(operation.operationId, contentIds.get(stableIdentity)!);
      continue;
    }

    if (operation.entityType === "CONTENT_VERSION") {
      const contentStableIdentity = contentImportIdentity(
        manifest.manifestId,
        manifest.content.externalKey,
      );
      const contentId = contentIds.get(contentStableIdentity);
      if (!contentId || operation.targetVersion === null) {
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      }
      const versionIdentity = contentImportVersionIdentity(
        manifest.manifestId,
        manifest.content.externalKey,
        operation.targetVersion,
      );
      if (
        operation.operation === "CREATE_CONTENT_VERSION" ||
        operation.operation === "CREATE_NEW_VERSION"
      ) {
        const created = await tx.createContentVersion({
          contentId,
          content: manifest.content,
          version: operation.targetVersion,
          stableIdentity: versionIdentity,
          payloadFingerprint: operation.payloadFingerprint!,
          manifestId: manifest.manifestId,
          actorUserId: actor.userId,
        });
        contentVersionIds.set(versionIdentity, created.id);
        createdCount += 1;
        if (operation.operation === "CREATE_NEW_VERSION") newVersionCount += 1;
        await tx.writeAudit({
          tenantId: manifest.target.scope === "GLOBAL" ? null : manifest.target.tenantId!,
          actorUserId: actor.userId,
          action: "VERSION_CREATED",
          entityType: "CONTENT_VERSION",
          entityId: created.id,
          version: operation.targetVersion,
          manifestId: manifest.manifestId,
          manifestVersion: 1,
          planFingerprint: plan.fingerprint,
          externalKey: manifest.content.externalKey,
        });
        auditCount += 1;
      } else if (operation.operation === "REUSE_EXISTING") {
        const state = findExistingByIdentity(
          existing.contents,
          contentStableIdentity,
          manifest.content.externalKey,
        );
        if (!state?.currentVersion?.id)
          throw new ContentImportRunnerError(
            "IDEMPOTENCY_CONFLICT",
            SAFE_ERROR_MESSAGES.IDEMPOTENCY_CONFLICT,
          );
        contentVersionIds.set(versionIdentity, state.currentVersion.id);
        reusedCount += 1;
      }
      operationIds.set(operation.operationId, contentVersionIds.get(versionIdentity)!);
      continue;
    }

    if (operation.entityType === "QUESTION") {
      const question = manifest.questions.find(
        (entry) => entry.externalKey === operation.externalKey,
      );
      if (!question)
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      const stableIdentity = questionImportIdentity(manifest.manifestId, question.externalKey);
      const contentId = contentIds.get(
        contentImportIdentity(manifest.manifestId, manifest.content.externalKey),
      );
      if (!contentId)
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      const questionIndex = manifest.questions.indexOf(question);
      if (operation.operation === "CREATE_QUESTION") {
        const created = await tx.createQuestion({
          question,
          questionIndex,
          contentId,
          stableIdentity,
          payloadFingerprint: operation.payloadFingerprint!,
          manifestId: manifest.manifestId,
          actor,
        });
        questionIds.set(stableIdentity, created.id);
        createdCount += 1;
        await tx.writeAudit({
          tenantId: manifest.target.scope === "GLOBAL" ? null : manifest.target.tenantId!,
          actorUserId: actor.userId,
          action: "CREATE",
          entityType: "QUESTION",
          entityId: created.id,
          manifestId: manifest.manifestId,
          manifestVersion: 1,
          planFingerprint: plan.fingerprint,
          externalKey: question.externalKey,
        });
        auditCount += 1;
      } else if (operation.operation === "REUSE_EXISTING") {
        const state = findExistingByIdentity(
          existing.questions,
          stableIdentity,
          question.externalKey,
        );
        if (!state?.id)
          throw new ContentImportRunnerError(
            "IDEMPOTENCY_CONFLICT",
            SAFE_ERROR_MESSAGES.IDEMPOTENCY_CONFLICT,
          );
        questionIds.set(stableIdentity, state.id);
        reusedCount += 1;
      }
      operationIds.set(operation.operationId, questionIds.get(stableIdentity)!);
      continue;
    }

    if (operation.entityType === "QUESTION_VERSION") {
      const question = manifest.questions.find(
        (entry) => entry.externalKey === operation.externalKey,
      );
      if (!question || operation.targetVersion === null) {
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      }
      const questionIdentity = questionImportIdentity(manifest.manifestId, question.externalKey);
      const questionId = questionIds.get(questionIdentity);
      const contentVersionNumber = operationFor(
        plan,
        "CONTENT_VERSION",
        manifest.content.externalKey,
      ).targetVersion;
      if (!questionId || contentVersionNumber === null || contentVersionNumber === undefined) {
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      }
      const contentVersionId = contentVersionIds.get(
        contentImportVersionIdentity(
          manifest.manifestId,
          manifest.content.externalKey,
          contentVersionNumber,
        ),
      );
      if (!contentVersionId)
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      const versionKey = `${questionIdentity}:v${operation.targetVersion}`;
      if (
        operation.operation === "CREATE_QUESTION_VERSION" ||
        operation.operation === "CREATE_NEW_VERSION"
      ) {
        const created = await tx.createQuestionVersion({
          question,
          questionId,
          contentId: contentIds.get(
            contentImportIdentity(manifest.manifestId, manifest.content.externalKey),
          )!,
          contentVersionId,
          version: operation.targetVersion,
          stableIdentity: questionIdentity,
          payloadFingerprint: operation.payloadFingerprint!,
          manifestId: manifest.manifestId,
          contentExternalKey: manifest.content.externalKey,
          contentVersion: contentVersionNumber,
          actorUserId: actor.userId,
        });
        questionVersionIds.set(versionKey, created.id);
        createdCount += 1;
        if (operation.operation === "CREATE_NEW_VERSION") newVersionCount += 1;
        await tx.writeAudit({
          tenantId: manifest.target.scope === "GLOBAL" ? null : manifest.target.tenantId!,
          actorUserId: actor.userId,
          action: "VERSION_CREATED",
          entityType: "QUESTION_VERSION",
          entityId: created.id,
          version: operation.targetVersion,
          manifestId: manifest.manifestId,
          manifestVersion: 1,
          planFingerprint: plan.fingerprint,
          externalKey: question.externalKey,
        });
        auditCount += 1;
      } else if (operation.operation === "REUSE_EXISTING") {
        const state = findExistingByIdentity(
          existing.questions,
          questionIdentity,
          question.externalKey,
        );
        if (!state?.currentVersion?.id)
          throw new ContentImportRunnerError(
            "IDEMPOTENCY_CONFLICT",
            SAFE_ERROR_MESSAGES.IDEMPOTENCY_CONFLICT,
          );
        questionVersionIds.set(versionKey, state.currentVersion.id);
        reusedCount += 1;
      }
      operationIds.set(operation.operationId, questionVersionIds.get(versionKey)!);
      continue;
    }

    if (operation.entityType === "RELATION") {
      const contentVersionOperationId = operation.dependencies[0];
      const questionVersionOperationId = operation.dependencies[1];
      const contentVersionId = operationIds.get(contentVersionOperationId!);
      const questionVersionId = operationIds.get(questionVersionOperationId!);
      const questionIdentity = questionImportIdentity(manifest.manifestId, operation.externalKey);
      const question = manifest.questions.find(
        (entry) => entry.externalKey === operation.externalKey,
      );
      const questionId = question ? questionIds.get(questionIdentity) : undefined;
      if (!contentVersionId || !questionVersionId || !questionId) {
        throw new ContentImportRunnerError(
          "IMPORT_PLAN_INVALID",
          SAFE_ERROR_MESSAGES.IMPORT_PLAN_INVALID,
        );
      }
      await tx.ensureQuestionVersionContentLink({
        questionVersionId,
        questionId,
        contentId: contentIds.get(
          contentImportIdentity(manifest.manifestId, manifest.content.externalKey),
        )!,
        contentVersionId,
      });
      operationIds.set(operation.operationId, questionVersionId);
    }
  }

  return {
    status: createdCount > 0 ? "IMPORTED" : "NOOP",
    dryRun: false,
    createdCount,
    reusedCount,
    newVersionCount,
    rejectedCount: 0,
    auditCount,
    planFingerprint: plan.fingerprint,
    errors: [],
  };
}

export async function runContentImport(
  input: unknown,
  actor: ContentImportActor,
  options: ContentImportRunnerOptions,
): Promise<ContentImportRunResult> {
  const dryRun = options.dryRun ?? false;
  let activePlanFingerprint: string | null = null;
  const initial = validateContentImportManifest(input);
  if (!initial.ok) return emptyResult("REJECTED", dryRun, null, "IMPORT_PLAN_INVALID");

  try {
    assertImportAuthorization(initial.manifest, actor);
  } catch (error) {
    if (error instanceof ContentImportRunnerError)
      return emptyResult("REJECTED", dryRun, null, error.code);
    return emptyResult("REJECTED", dryRun, null, "TENANT_SCOPE_INVALID");
  }

  const repository = options.repository;
  try {
    return await repository.runInTransaction(actor, async (tx) => {
      await tx.lockImportScope(
        `content-import:${initial.manifest.target.scope}:${initial.manifest.target.tenantId ?? "global"}`,
      );
      const existing = await tx.loadExistingImportIndex(initial.manifest.target);
      const validation = validateContentImportManifest(initial.manifest, existing);
      if (!validation.ok) return emptyResult("REJECTED", dryRun, null, "IMPORT_PLAN_INVALID");
      const plan = buildContentImportPlan(validation.manifest, existing);
      activePlanFingerprint = plan.fingerprint;
      assertNoRejectedOperations(plan);
      await tx.assertDependencies(validation.manifest);

      if (dryRun) {
        const reusedCount = plan.operations.filter(
          (entry) => entry.operation === "REUSE_EXISTING",
        ).length;
        return {
          ...emptyResult("DRY_RUN", true, plan.fingerprint),
          reusedCount,
        };
      }
      return executePlan(tx, validation.manifest, plan, existing, actor);
    });
  } catch (error) {
    if (error instanceof ContentImportRunnerError) {
      return emptyResult("REJECTED", dryRun, activePlanFingerprint, error.code);
    }
    if (isKnownErrorCode(error)) {
      return emptyResult("REJECTED", dryRun, activePlanFingerprint, error.code);
    }
    if (isPrismaUniqueError(error)) {
      return emptyResult("FAILED", dryRun, activePlanFingerprint, "IDEMPOTENCY_CONFLICT");
    }
    return emptyResult("FAILED", dryRun, activePlanFingerprint, "IMPORT_TRANSACTION_FAILED");
  }
}

function isKnownErrorCode(error: unknown): error is { code: ContentImportErrorCode } {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    typeof code === "string" && Object.prototype.hasOwnProperty.call(SAFE_ERROR_MESSAGES, code)
  );
}

function isPrismaUniqueError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return (error as { code?: unknown }).code === "P2002";
}
