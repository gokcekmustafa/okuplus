/**
 * Cycle 4 has an explicit product-owner release decision. This only opens the
 * curriculum approval gate; students still require a complete, published
 * database graph before the route can assign or serve any station.
 */
export const EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE =
  "EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12";
export const EDUCATION_V2_P1_A_CYCLE_4_STATUS = "PUBLISHED" as const;
export const EDUCATION_V2_P1_A_CYCLE_4_EXPLICIT_PUBLICATION_APPROVED = true as const;

export function isEducationV2P1ACycle4ProductionAssignmentEnabled(): boolean {
  return (
    EDUCATION_V2_P1_A_CYCLE_4_STATUS === "PUBLISHED" &&
    EDUCATION_V2_P1_A_CYCLE_4_EXPLICIT_PUBLICATION_APPROVED
  );
}
