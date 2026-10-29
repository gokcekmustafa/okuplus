import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_53_56 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_53_56_SEQUENCES = [53, 54, 55, 56] as const;
export type EducationV2P1ACycle53To56Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_53_56_SEQUENCES)[number];

export type EducationV2P1ACycle53To56ReleaseDecision = {
  sequence: EducationV2P1ACycle53To56Sequence;
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

/** Content-addressed immutable release identity for stations 293–312 only. */
export const EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_53_56))
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-53-56@v1:${EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT}`;

/** Product-owner approval is limited to the four cycles requested for stations 293–312. */
export const EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS: readonly EducationV2P1ACycle53To56ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_53_56_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle53To56ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved === true,
  );
}

export function educationV2P1ACycle53To56ProductionApproval(commit: string): string {
  return (
    "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_53_TO_56_PRODUCTION_RELEASE_" +
    EDUCATION_V2_P1_A_CYCLE_53_56_RELEASE_FINGERPRINT.toUpperCase() +
    "_AT_" +
    commit.toUpperCase()
  );
}
