import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_49_52 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_49_52_SEQUENCES = [49, 50, 51, 52] as const;
export type EducationV2P1ACycle49To52Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_49_52_SEQUENCES)[number];

export type EducationV2P1ACycle49To52ReleaseDecision = {
  sequence: EducationV2P1ACycle49To52Sequence;
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

/** Content-addressed identity for stations 273–292 (Cycles 49–52) only. */
export const EDUCATION_V2_P1_A_CYCLE_49_52_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_49_52))
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_49_52_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-49-52@v1:${EDUCATION_V2_P1_A_CYCLE_49_52_RELEASE_FINGERPRINT}`;

/** Explicit product-owner release decision is scoped to the four requested cycles. */
export const EDUCATION_V2_P1_A_CYCLE_49_52_RELEASE_DECISIONS: readonly EducationV2P1ACycle49To52ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_49_52_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle49To52ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_49_52_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved === true,
  );
}

export function educationV2P1ACycle49To52ProductionApproval(commit: string): string {
  return (
    "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_49_TO_52_PRODUCTION_RELEASE_" +
    EDUCATION_V2_P1_A_CYCLE_49_52_RELEASE_FINGERPRINT.toUpperCase() +
    "_AT_" +
    commit.toUpperCase()
  );
}
