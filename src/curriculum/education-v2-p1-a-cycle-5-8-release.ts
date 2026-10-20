import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_5_8 } from "./education-v2-p1-a-cycle-5-8-program.js";

export type EducationV2P1ACycle5To8ReleaseDecision = {
  sequence: 5 | 6 | 7 | 8;
  status: "OWNER_RELEASE_REQUIRED" | "OWNER_RELEASE_APPROVED";
  explicitPublicationApproved: boolean;
};

/**
 * These cycles are prepared, not released. A protected workflow's APPLY input
 * is a separate one-run write approval and must not silently mutate this
 * source-controlled student-assignment gate.
 */
export const EDUCATION_V2_P1_A_CYCLE_5_8_RELEASE_DECISIONS: readonly EducationV2P1ACycle5To8ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_5_8.map(({ sequence }) => ({
    sequence,
    status: "OWNER_RELEASE_REQUIRED",
    explicitPublicationApproved: false,
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
