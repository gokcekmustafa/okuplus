import { safeParseTrainingExerciseVersionConfig } from "../modules/training/exercise-contract.js";

export const CANONICAL_PLACEMENT_MANIFEST_ID = "OKU-READING-PLACEMENT-V1" as const;
export const LEGACY_CURRICULUM_PACK_ID = "OKU-8G8-FIRST-REAL-CURRICULUM" as const;

export type ExerciseTemplateVersionConfigRow = {
  versionConfig: unknown;
  parentConfig: unknown;
  parentExists: boolean;
  templateType: string | null;
  versionStatus: string;
};

export type ExerciseTemplateVersionConfigClassification =
  | { kind: "CONFIGURED"; valid: boolean }
  | { kind: "CANONICAL_PLACEMENT_EXEMPT" }
  | { kind: "LEGACY_COMPATIBILITY"; packId: typeof LEGACY_CURRICULUM_PACK_ID }
  | { kind: "BACKFILL_REQUIRED"; parent: "VALID" | "INVALID" | "MISSING" | "ABSENT" };

export type SanitizedTrainingConfigIssue = {
  code: string;
  path: string[];
  reason: string;
};

const SAFE_ZOD_ISSUE_CODES = new Set([
  "invalid_type",
  "invalid_value",
  "invalid_enum_value",
  "invalid_string",
  "invalid_date",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_intersection_types",
  "invalid_union_discriminator",
  "unrecognized_keys",
  "invalid_union",
  "invalid_literal",
  "too_small",
  "too_big",
  "invalid_format",
  "not_multiple_of",
  "custom",
]);

function sanitizeIssuePath(path: PropertyKey[]): string[] {
  return path.slice(0, 8).map((segment) => {
    if (typeof segment === "number" && Number.isSafeInteger(segment)) return `[${segment}]`;
    if (typeof segment !== "string") return "[redacted]";
    return /^[A-Za-z0-9_.-]{1,64}$/u.test(segment) ? segment : "[redacted]";
  });
}

function sanitizeIssueReason(code: string): string {
  switch (code) {
    case "invalid_type":
      return "invalid_type";
    case "invalid_value":
      return "invalid_value";
    case "invalid_enum_value":
      return "invalid_enum_value";
    case "invalid_string":
      return "invalid_string";
    case "invalid_date":
      return "invalid_date";
    case "invalid_arguments":
      return "invalid_arguments";
    case "invalid_return_type":
      return "invalid_return_type";
    case "invalid_intersection_types":
      return "invalid_intersection_types";
    case "invalid_union_discriminator":
      return "invalid_union_discriminator";
    case "unrecognized_keys":
      return "unrecognized_keys";
    case "invalid_union":
      return "invalid_union";
    case "invalid_literal":
      return "invalid_literal";
    case "too_small":
      return "too_small";
    case "too_big":
      return "too_big";
    case "invalid_format":
      return "invalid_format";
    case "not_multiple_of":
      return "not_multiple_of";
    case "custom":
      return "custom_validation";
    default:
      return "schema_validation_failed";
  }
}

export function sanitizedTrainingConfigIssues(input: unknown): SanitizedTrainingConfigIssue[] {
  const parsed = safeParseTrainingExerciseVersionConfig(input);
  if (parsed.success) return [];

  return parsed.error.issues.slice(0, 20).map((issue) => {
    const code = SAFE_ZOD_ISSUE_CODES.has(issue.code) ? issue.code : "unknown";
    return {
      code,
      path: sanitizeIssuePath(issue.path),
      reason: sanitizeIssueReason(code),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== "string") return null;
  return value[key] as string;
}

/**
 * The first-real 8G8 pack predates the TRAINING version contract. Its
 * published versions intentionally contain the immutable parent/catalog
 * snapshot and are consumed by the explicit legacy path. This narrow marker
 * must not become a generic exemption for arbitrary invalid configurations.
 */
export function isKnownLegacyCurriculumPackVersion(row: ExerciseTemplateVersionConfigRow): boolean {
  if (row.versionStatus !== "PUBLISHED" || row.templateType !== "COMPREHENSION") return false;

  const parent = row.parentConfig;
  const version = row.versionConfig;
  if (
    stringField(parent, "packId") !== LEGACY_CURRICULUM_PACK_ID ||
    stringField(version, "packId") !== LEGACY_CURRICULUM_PACK_ID
  ) {
    return false;
  }

  const parentIdentity = isRecord(parent) ? parent.stableIdentity : null;
  const versionIdentity = isRecord(version) ? version.stableIdentity : null;
  const parentTemplateVersionId = stringField(parentIdentity, "templateVersionId");
  const versionTemplateVersionId = stringField(versionIdentity, "templateVersionId");
  const templateId = stringField(parentIdentity, "templateId");
  const contentId = stringField(parentIdentity, "contentId");
  const contentVersionId = stringField(parentIdentity, "contentVersionId");

  return (
    parentTemplateVersionId !== null &&
    parentTemplateVersionId === versionTemplateVersionId &&
    /^8g8-template-version-[a-z0-9-]+-v1$/u.test(parentTemplateVersionId) &&
    templateId !== null &&
    /^8g8-template-[a-z0-9-]+$/u.test(templateId) &&
    contentId !== null &&
    /^8g8-content-[a-z0-9-]+$/u.test(contentId) &&
    contentVersionId !== null &&
    /^8g8-content-version-[a-z0-9-]+-v1$/u.test(contentVersionId)
  );
}

export function isCanonicalPlacementVersion(row: ExerciseTemplateVersionConfigRow): boolean {
  return (
    row.versionStatus === "PUBLISHED" &&
    row.templateType === "MIXED" &&
    isRecord(row.parentConfig) &&
    row.parentConfig.canonicalManifestId === CANONICAL_PLACEMENT_MANIFEST_ID
  );
}

export function classifyExerciseTemplateVersionConfig(
  row: ExerciseTemplateVersionConfigRow,
): ExerciseTemplateVersionConfigClassification {
  // Canonical placement versions intentionally use the parent template
  // metadata contract, not the student-training runtime config contract.
  // Classify this narrow, published placement shape before inspecting the
  // version config so it cannot be mistaken for invalid training data.
  if (isCanonicalPlacementVersion(row)) {
    return { kind: "CANONICAL_PLACEMENT_EXEMPT" };
  }

  if (isKnownLegacyCurriculumPackVersion(row)) {
    return { kind: "LEGACY_COMPATIBILITY", packId: LEGACY_CURRICULUM_PACK_ID };
  }

  if (row.versionConfig !== null && row.versionConfig !== undefined) {
    return {
      kind: "CONFIGURED",
      valid: safeParseTrainingExerciseVersionConfig(row.versionConfig).success,
    };
  }

  if (!row.parentExists) return { kind: "BACKFILL_REQUIRED", parent: "ABSENT" };
  if (row.parentConfig === null || row.parentConfig === undefined) {
    return { kind: "BACKFILL_REQUIRED", parent: "MISSING" };
  }
  return {
    kind: "BACKFILL_REQUIRED",
    parent: safeParseTrainingExerciseVersionConfig(row.parentConfig).success ? "VALID" : "INVALID",
  };
}
