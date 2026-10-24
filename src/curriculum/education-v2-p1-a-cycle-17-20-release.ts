import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_17_20 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES = [17, 18, 19, 20] as const;
export type EducationV2P1ACycle17To20Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES)[number];

export type EducationV2P1ACycle17To20ReleaseDecision = {
  sequence: EducationV2P1ACycle17To20Sequence;
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

/** Release identity covers only the four prepared, source-verified A-route cycles. */
export const EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_17_20) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-17-20@v1:${EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT}`;

/** Product-owner review is still pending; source verification is a separate fact. */
export const EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_DECISIONS: readonly EducationV2P1ACycle17To20ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_17_20_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_REQUIRED",
    explicitPublicationApproved: false,
  }));

export function isEducationV2P1ACycle17To20ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved,
  );
}

export function educationV2P1ACycle17To20ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_17_TO_20_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_17_20_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}
