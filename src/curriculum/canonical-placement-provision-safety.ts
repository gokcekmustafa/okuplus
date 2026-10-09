export type CanonicalPlacementProvisionStage =
  | "GATE"
  | "TARGET_IDENTITY"
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
} {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
  if (code && /^P\d{4}$/u.test(code)) {
    return { errorClass: "PRISMA", errorCode: code };
  }

  if (
    stage === "GATE" ||
    stage === "TARGET_IDENTITY" ||
    stage === "GRAPH_BUILD" ||
    stage === "POSTCONDITION"
  ) {
    return { errorClass: "VALIDATION", errorCode: null };
  }

  return { errorClass: "UNKNOWN", errorCode: null };
}

export function canonicalPlacementProvisionWriteState(
  stage: CanonicalPlacementProvisionStage,
  applyReturned: boolean,
): CanonicalPlacementProvisionWriteState {
  if (applyReturned) return "YES";
  if (stage === "APPLY") return "UNKNOWN";
  return "NO";
}
