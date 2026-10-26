import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_21_24 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES = [21, 22, 23, 24] as const;
export type EducationV2P1ACycle21To24Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES)[number];

export type EducationV2P1ACycle21To24ReleaseDecision = {
  sequence: EducationV2P1ACycle21To24Sequence;
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

/** Immutable source fingerprint for the four-cycle 133–152 release only. */
export const EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_21_24) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-21-24@v1:${EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT}`;

/** Product-owner publication decision explicitly supplied for this task. */
export const EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_DECISIONS: readonly EducationV2P1ACycle21To24ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_21_24_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle21To24ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved,
  );
}

export function educationV2P1ACycle21To24ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_21_TO_24_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_21_24_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}
