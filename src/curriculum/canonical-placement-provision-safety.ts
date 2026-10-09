export type CanonicalPlacementProvisionStage =
  | "GATE"
  | "TARGET_IDENTITY"
  | "SKILL_RESOLUTION"
  | "GRAPH_BUILD"
  | "SNAPSHOT_READ_BEFORE"
  | "PLAN_BEFORE"
  | "APPLY"
  | "SNAPSHOT_READ_AFTER"
  | "PLAN_AFTER"
  | "POSTCONDITION";

export type CanonicalPlacementProvisionErrorClass = "VALIDATION" | "PRISMA" | "UNKNOWN";

export type CanonicalPlacementProvisionWriteState = "NO" | "YES" | "UNKNOWN";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function classifyCanonicalPlacementProvisionError(
  error: unknown,
  stage: CanonicalPlacementProvisionStage,
): {
  errorClass: CanonicalPlacementProvisionErrorClass;
  errorCode: string | null;
  constraintField: string | null;
} {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
  const safeCode = isRecord(error) && typeof error.safeCode === "string" ? error.safeCode : null;
  const meta = isRecord(error) && isRecord(error.meta) ? error.meta : null;
  const constraintField =
    meta &&
    typeof meta.field_name === "string" &&
    /^[A-Za-z0-9_.()[\] -]{1,200}$/u.test(meta.field_name)
      ? meta.field_name
      : null;
  if (code && /^P\d{4}$/u.test(code)) {
    return { errorClass: "PRISMA", errorCode: code, constraintField };
  }
  if (safeCode && /^CANONICAL_[A-Z_]+$/u.test(safeCode)) {
    return { errorClass: "VALIDATION", errorCode: safeCode, constraintField: null };
  }

  if (
    stage === "GATE" ||
    stage === "TARGET_IDENTITY" ||
    stage === "SKILL_RESOLUTION" ||
    stage === "GRAPH_BUILD" ||
    stage === "POSTCONDITION"
  ) {
    return { errorClass: "VALIDATION", errorCode: null, constraintField: null };
  }

  return { errorClass: "UNKNOWN", errorCode: null, constraintField };
}

export function canonicalPlacementProvisionWriteState(
  stage: CanonicalPlacementProvisionStage,
  applyReturned: boolean,
): CanonicalPlacementProvisionWriteState {
  if (applyReturned) return "YES";
  if (stage === "APPLY") return "UNKNOWN";
  return "NO";
}
