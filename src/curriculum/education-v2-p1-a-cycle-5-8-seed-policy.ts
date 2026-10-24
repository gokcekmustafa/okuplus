export type EducationV2P1ACycle5To8GraphState = "MISSING" | "EXISTING" | "CONFLICT";
export type EducationV2P1ACycle5To8SeedAction =
  "PLAN_ONLY" | "REUSE_EXISTING" | "CREATE_MISSING" | "STOP_CONFLICT";

export type EducationV2P1ACycle5To8SeedRequest = {
  dryRun: boolean;
  operation: string | undefined;
  confirmation: string | undefined;
  graphScope: "CYCLE_5_ONLY" | "CYCLES_5_TO_8" | "CYCLES_9_TO_12" | "CYCLES_13_TO_16";
  productionApproval: string | undefined;
  expectedProductionApproval: string;
  protectedProductionWorkflow: boolean;
};

/**
 * The protected workflow runs a read-only plan before both PLAN_ONLY and APPLY.
 * An APPLY preflight must still carry the exact APPLY approval and protected
 * workflow context; dryRun only prevents writes and does not downgrade the request.
 */
export function isEducationV2P1ACycle5To8SeedRequestAuthorized(
  request: EducationV2P1ACycle5To8SeedRequest,
): boolean {
  const scope =
    request.graphScope === "CYCLE_5_ONLY"
      ? "CYCLE_5"
      : request.graphScope === "CYCLES_5_TO_8"
        ? "CYCLE_5_8"
        : request.graphScope === "CYCLES_9_TO_12"
          ? "CYCLES_9_TO_12"
          : "CYCLES_13_TO_16";
  if (request.operation === "PLAN_ONLY") {
    return request.dryRun && request.confirmation === `PLAN_EDUCATION_V2_P1_A_${scope}`;
  }
  if (request.operation !== "APPLY") return false;
  return (
    request.confirmation === `APPLY_EDUCATION_V2_P1_A_${scope}` &&
    request.productionApproval === request.expectedProductionApproval &&
    request.protectedProductionWorkflow
  );
}

/** Decide the only permitted graph action after the full source comparison. */
export function educationV2P1ACycle5To8SeedAction(
  state: EducationV2P1ACycle5To8GraphState,
  dryRun: boolean,
): EducationV2P1ACycle5To8SeedAction {
  if (state === "CONFLICT") return "STOP_CONFLICT";
  if (dryRun) return "PLAN_ONLY";
  return state === "EXISTING" ? "REUSE_EXISTING" : "CREATE_MISSING";
}
