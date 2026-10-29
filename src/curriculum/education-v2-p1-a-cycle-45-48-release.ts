import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_45_48 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_45_48_SEQUENCES = [45, 46, 47, 48] as const;
export type EducationV2P1ACycle45To48Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_45_48_SEQUENCES)[number];

export type EducationV2P1ACycle45To48ReleaseDecision = {
  sequence: EducationV2P1ACycle45To48Sequence;
  status: "OWNER_RELEASE_REQUIRED" | "OWNER_RELEASE_APPROVED";
  explicitPublicationApproved: boolean;
};

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

/** Content-addressed identity for only the 253–272 Cycle 45–48 release. */
export const EDUCATION_V2_P1_A_CYCLE_45_48_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_45_48) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_45_48_RELEASE_ID =
  "OKU-EDUCATION-V2-P1-A-CYCLE-45-48@v1:" + EDUCATION_V2_P1_A_CYCLE_45_48_RELEASE_FINGERPRINT;

/** Product-owner authorization is limited to Cycles 45–48. */
export const EDUCATION_V2_P1_A_CYCLE_45_48_RELEASE_DECISIONS: readonly EducationV2P1ACycle45To48ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_45_48_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle45To48ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_45_48_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved === true,
  );
}

export function educationV2P1ACycle45To48ProductionApproval(commit: string): string {
  return (
    "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_45_TO_48_PRODUCTION_RELEASE_" +
    EDUCATION_V2_P1_A_CYCLE_45_48_RELEASE_FINGERPRINT.toUpperCase() +
    "_AT_" +
    commit.toUpperCase()
  );
}
