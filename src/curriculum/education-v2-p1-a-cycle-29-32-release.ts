import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_29_32 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES = [29, 30, 31, 32] as const;
export type EducationV2P1ACycle29To32Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES)[number];

export type EducationV2P1ACycle29To32ReleaseDecision = {
  sequence: EducationV2P1ACycle29To32Sequence;
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

/** Content-addressed identity for only the 173–192 Cycle 29–32 release. */
export const EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_29_32) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-29-32@v1:${EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT}`;

/** Explicit product-owner decision supplied for this release. */
export const EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_DECISIONS: readonly EducationV2P1ACycle29To32ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_29_32_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle29To32ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved,
  );
}

export function educationV2P1ACycle29To32ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_29_TO_32_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_29_32_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}
