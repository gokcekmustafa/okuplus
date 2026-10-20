export type EducationV2P1ACycle5To8GraphState = "MISSING" | "EXISTING" | "CONFLICT";
export type EducationV2P1ACycle5To8SeedAction =
  "PLAN_ONLY" | "REUSE_EXISTING" | "CREATE_MISSING" | "STOP_CONFLICT";

/** Decide the only permitted graph action after the full source comparison. */
export function educationV2P1ACycle5To8SeedAction(
  state: EducationV2P1ACycle5To8GraphState,
  dryRun: boolean,
): EducationV2P1ACycle5To8SeedAction {
  if (state === "CONFLICT") return "STOP_CONFLICT";
  if (dryRun) return "PLAN_ONLY";
  return state === "EXISTING" ? "REUSE_EXISTING" : "CREATE_MISSING";
}
