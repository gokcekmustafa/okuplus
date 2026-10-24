import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_5_8 } from "./education-v2-p1-a-cycle-5-8-program.js";

export type EducationV2P1ACycle5To8ReleaseDecision = {
  sequence: 5 | 6 | 7 | 8;
  status: "OWNER_RELEASE_REQUIRED" | "OWNER_RELEASE_APPROVED";
  explicitPublicationApproved: boolean;
};

export type EducationV2P1ACycle5To8GraphScope = "CYCLE_5_ONLY" | "CYCLES_5_TO_8";

export function educationV2P1ACycle5To8ScopeSequences(
  scope: EducationV2P1ACycle5To8GraphScope,
): readonly (5 | 6 | 7 | 8)[] {
  return scope === "CYCLE_5_ONLY" ? [5] : [5, 6, 7, 8];
}

export function educationV2P1ACycle5To8ProductionApproval(
  scope: EducationV2P1ACycle5To8GraphScope,
  commit: string,
): string {
  const approvalScope = scope === "CYCLE_5_ONLY" ? "CYCLE_5" : "CYCLE_5_8";
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_${approvalScope}_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}

/**
 * Product-owner release approval for the prepared Cycle 5–8 package. Source
 * provenance remains independent: Cycle 5 is ORIGINAL_AUTHORING / REVIEW_REQUIRED,
 * while Cycles 6–8 retain their separately verified source evidence.
 */
export const EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_DECISIONS: readonly EducationV2P1ACycle5To8ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_5_8.map(({ sequence }) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle5To8ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved === true,
  );
}

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

/** Content-addressed immutable release identity; changes whenever a source or manifest changes. */
export const EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_5_8) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-5-8@v1:${EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_FINGERPRINT}`;
