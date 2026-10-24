import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_13_16 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES = [13, 14, 15, 16] as const;
export type EducationV2P1ACycle13To16Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES)[number];

export type EducationV2P1ACycle13To16ReleaseDecision = {
  sequence: EducationV2P1ACycle13To16Sequence;
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

/** Release identity covers only the four newly prepared 93–112 A-route cycles. */
export const EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_13_16) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-13-16@v1:${EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT}`;

export const EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_DECISIONS: readonly EducationV2P1ACycle13To16ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_13_16_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle13To16ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved,
  );
}

export function educationV2P1ACycle13To16ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_13_TO_16_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_13_16_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}
