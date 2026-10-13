import { safeParseTrainingExerciseVersionConfig } from "../modules/training/exercise-contract.js";

export const CANONICAL_PLACEMENT_MANIFEST_ID = "OKU-READING-PLACEMENT-V1" as const;

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
  | { kind: "BACKFILL_REQUIRED"; parent: "VALID" | "INVALID" | "MISSING" | "ABSENT" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (row.versionConfig !== null && row.versionConfig !== undefined) {
    return {
      kind: "CONFIGURED",
      valid: safeParseTrainingExerciseVersionConfig(row.versionConfig).success,
    };
  }

  if (isCanonicalPlacementVersion(row)) {
    return { kind: "CANONICAL_PLACEMENT_EXEMPT" };
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
