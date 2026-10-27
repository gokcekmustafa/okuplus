import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_25_28 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES = [25, 26, 27, 28] as const;
export type EducationV2P1ACycle25To28Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES)[number];

export type EducationV2P1ACycle25To28ReleaseDecision = {
  sequence: EducationV2P1ACycle25To28Sequence;
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

/** Immutable source fingerprint for the four-cycle 153–172 release only. */
export const EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_25_28) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-25-28@v1:${EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT}`;

/** Product-owner publication decision explicitly supplied for this task. */
export const EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_DECISIONS: readonly EducationV2P1ACycle25To28ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_25_28_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle25To28ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved,
  );
}

export function educationV2P1ACycle25To28ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_25_TO_28_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_25_28_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}
