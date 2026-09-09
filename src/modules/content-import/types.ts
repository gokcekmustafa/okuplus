export type ImportLifecycleStatus =
  "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED" | "ARCHIVED";

export type ContentImportIssue = {
  code: string;
  path: string;
  message: string;
};

export type ExistingContentImportState = {
  id?: string;
  externalKey: string;
  stableIdentity?: string;
  normalizedPassage: string;
  tenantId?: string | null;
  deleted?: boolean;
  questionPositions?: readonly number[];
  currentVersion: {
    id?: string;
    version: number;
    status: ImportLifecycleStatus;
    fingerprint: string;
  } | null;
};

export type ExistingQuestionImportState = {
  id?: string;
  externalKey: string;
  stableIdentity?: string;
  normalizedStem: string;
  tenantId?: string | null;
  deleted?: boolean;
  currentVersion: {
    id?: string;
    version: number;
    status: ImportLifecycleStatus;
    fingerprint: string;
    contentExternalKey: string;
    contentVersion: number;
  } | null;
};

export type ExistingContentImportIndex = {
  contents?: readonly ExistingContentImportState[];
  questions?: readonly ExistingQuestionImportState[];
};

export type ImportOperationType =
  | "CREATE_CONTENT"
  | "CREATE_CONTENT_VERSION"
  | "CREATE_QUESTION"
  | "CREATE_QUESTION_VERSION"
  | "LINK_QUESTION_TO_CONTENT_VERSION"
  | "REUSE_EXISTING"
  | "CREATE_NEW_VERSION"
  | "REJECT";

export type ImportOperation = {
  operationId: string;
  operation: ImportOperationType;
  entityType:
    "CONTENT" | "CONTENT_VERSION" | "QUESTION" | "QUESTION_VERSION" | "RELATION" | "MANIFEST";
  externalKey: string;
  stableIdentity: string;
  targetVersion: number | null;
  dependencies: string[];
  payloadFingerprint: string | null;
  reason: string | null;
};

export type ContentImportPlan = {
  manifestId: string;
  manifestVersion: 1;
  operations: ImportOperation[];
  fingerprint: string;
};

export type ContentImportActor = {
  userId: string;
  tenantId: string | null;
  platformRole:
    "SUPER_ADMIN" | "CONTENT_EDITOR" | "CONTENT_REVIEWER" | "SUPPORT" | "ANALYST" | null;
  allowGlobal: boolean;
};

export type ContentImportErrorCode =
  | "IMPORT_PLAN_INVALID"
  | "TENANT_SCOPE_INVALID"
  | "GLOBAL_IMPORT_FORBIDDEN"
  | "CONTENT_CONFLICT"
  | "QUESTION_CONFLICT"
  | "PUBLISHED_VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "IMPORT_TRANSACTION_FAILED";

export type ContentImportRunStatus =
  "IMPORTED" | "PARTIAL_NO_PARTIAL" | "NOOP" | "REJECTED" | "FAILED" | "DRY_RUN";

export type ContentImportRunResult = {
  status: ContentImportRunStatus;
  dryRun: boolean;
  createdCount: number;
  reusedCount: number;
  newVersionCount: number;
  rejectedCount: number;
  auditCount: number;
  planFingerprint: string | null;
  errors: ReadonlyArray<{ code: ContentImportErrorCode; message: string }>;
};

export type ContentImportValidationResult =
  | {
      ok: true;
      manifest: import("./manifest-schema.js").ContentImportManifest;
      issues: [];
    }
  | {
      ok: false;
      manifest: null;
      issues: ContentImportIssue[];
    };
