import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_41_44 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_41_44_SEQUENCES = [41, 42, 43, 44] as const;
export type EducationV2P1ACycle41To44Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_41_44_SEQUENCES)[number];

export type EducationV2P1ACycle41To44ReleaseDecision = {
  sequence: EducationV2P1ACycle41To44Sequence;
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

/** Content-addressed release identity for stations 233–252 only. */
export const EDUCATION_V2_P1_A_CYCLE_41_44_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_41_44) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_41_44_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-41-44@v1:${EDUCATION_V2_P1_A_CYCLE_41_44_RELEASE_FINGERPRINT}`;

/** Explicit product-owner release decision is limited to Cycles 41–44. */
export const EDUCATION_V2_P1_A_CYCLE_41_44_RELEASE_DECISIONS: readonly EducationV2P1ACycle41To44ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_41_44_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle41To44ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_41_44_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved === true,
  );
}

export function educationV2P1ACycle41To44ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_41_TO_44_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_41_44_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}
