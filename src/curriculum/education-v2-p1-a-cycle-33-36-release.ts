import { createHash } from "node:crypto";
import { EDUCATION_V2_P1_A_CYCLE_33_36 } from "./education-v2-p1-a-cycle-5-8-program.js";

export const EDUCATION_V2_P1_A_CYCLE_33_36_SEQUENCES = [33, 34, 35, 36] as const;
export type EducationV2P1ACycle33To36Sequence =
  (typeof EDUCATION_V2_P1_A_CYCLE_33_36_SEQUENCES)[number];

export type EducationV2P1ACycle33To36ReleaseDecision = {
  sequence: EducationV2P1ACycle33To36Sequence;
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

/** Content-addressed identity for only the 193–212 Cycle 33–36 release. */
export const EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_FINGERPRINT = createHash("sha256")
  .update(canonicalJson(EDUCATION_V2_P1_A_CYCLE_33_36) ?? "")
  .digest("hex");
export const EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_ID = `OKU-EDUCATION-V2-P1-A-CYCLE-33-36@v1:${EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_FINGERPRINT}`;

/** Only the explicitly approved Cycle 33–36 decisions enable student assignment. */
export const EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_DECISIONS: readonly EducationV2P1ACycle33To36ReleaseDecision[] =
  EDUCATION_V2_P1_A_CYCLE_33_36_SEQUENCES.map((sequence) => ({
    sequence,
    status: "OWNER_RELEASE_APPROVED",
    explicitPublicationApproved: true,
  }));

export function isEducationV2P1ACycle33To36ProductionAssignmentEnabled(sequence: number): boolean {
  return EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_DECISIONS.some(
    (decision) =>
      decision.sequence === sequence &&
      decision.status === "OWNER_RELEASE_APPROVED" &&
      decision.explicitPublicationApproved,
  );
}

export function educationV2P1ACycle33To36ProductionApproval(commit: string): string {
  return `I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLES_33_TO_36_PRODUCTION_RELEASE_${EDUCATION_V2_P1_A_CYCLE_33_36_RELEASE_FINGERPRINT.toUpperCase()}_AT_${commit.toUpperCase()}`;
}

export function educationV2P1ACycle33To36OrFallbackProductionApproval(
  isCycle33To36: boolean,
  commit: string,
  fallback: () => string,
): string {
  return isCycle33To36 ? educationV2P1ACycle33To36ProductionApproval(commit) : fallback();
}
