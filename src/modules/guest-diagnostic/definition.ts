import type { ProficiencySkillCode } from "../../curriculum/proficiency-levels.js";

export const GUEST_DIAGNOSTIC_CONFIG_KEY = "OKU-GUEST-DIAGNOSTIC-V1";
export const GUEST_DIAGNOSTIC_DEFINITION_VERSION = 1;
export const GUEST_DIAGNOSTIC_SCORING_VERSION = 1;
export const GUEST_DIAGNOSTIC_QUESTION_COUNT = 8;
export const GUEST_DIAGNOSTIC_MINIMUM_SCORABLE_COUNT = 5;
export const GUEST_DIAGNOSTIC_SESSION_TTL_SECONDS = 30 * 60;

export type GuestDiagnosticCandidate = {
  questionVersionId: string;
  questionId: string;
  sourceTemplateVersionId: string;
  skillCode: ProficiencySkillCode;
  difficulty: number;
  position: number;
};

/**
 * The candidate pack is the repository's real 8G8 curriculum pack. These are
 * stable IDs produced by scripts/seed-curriculum-pack.ts; no question text or
 * answer key is duplicated in the API layer.
 */
export const GUEST_DIAGNOSTIC_CANDIDATES: readonly GuestDiagnosticCandidate[] = [
  {
    questionVersionId: "8g8-question-version-aksam-isigi-ve-beden-saati-1-v1",
    questionId: "8g8-question-aksam-isigi-ve-beden-saati-1",
    sourceTemplateVersionId: "8g8-template-version-aksam-isigi-ve-beden-saati-v1",
    skillCode: "RC_DETAIL",
    difficulty: 0.35,
    position: 1,
  },
  {
    questionVersionId: "8g8-question-version-golgeyi-olcmek-1-v1",
    questionId: "8g8-question-golgeyi-olcmek-1",
    sourceTemplateVersionId: "8g8-template-version-golgeyi-olcmek-v1",
    skillCode: "RC_MAIN_IDEA",
    difficulty: 0.45,
    position: 2,
  },
  {
    questionVersionId: "8g8-question-version-yukaridan-bakinca-2-v1",
    questionId: "8g8-question-yukaridan-bakinca-2",
    sourceTemplateVersionId: "8g8-template-version-yukaridan-bakinca-v1",
    skillCode: "RC_MAIN_IDEA",
    difficulty: 0.45,
    position: 3,
  },
  {
    questionVersionId: "8g8-question-version-mesajdaki-bosluk-1-v1",
    questionId: "8g8-question-mesajdaki-bosluk-1",
    sourceTemplateVersionId: "8g8-template-version-mesajdaki-bosluk-v1",
    skillCode: "RC_INFERENCE",
    difficulty: 0.55,
    position: 4,
  },
  {
    questionVersionId: "8g8-question-version-topragin-sunger-gibi-davranmasi-3-v1",
    questionId: "8g8-question-topragin-sunger-gibi-davranmasi-3",
    sourceTemplateVersionId: "8g8-template-version-topragin-sunger-gibi-davranmasi-v1",
    skillCode: "RC_DETAIL",
    difficulty: 0.55,
    position: 5,
  },
  {
    questionVersionId: "8g8-question-version-golgeyi-olcmek-3-v1",
    questionId: "8g8-question-golgeyi-olcmek-3",
    sourceTemplateVersionId: "8g8-template-version-golgeyi-olcmek-v1",
    skillCode: "RC_MAIN_IDEA",
    difficulty: 0.6,
    position: 6,
  },
  {
    questionVersionId: "8g8-question-version-cicegin-ziyaretcileri-3-v1",
    questionId: "8g8-question-cicegin-ziyaretcileri-3",
    sourceTemplateVersionId: "8g8-template-version-cicegin-ziyaretcileri-v1",
    skillCode: "RC_DETAIL",
    difficulty: 0.6,
    position: 7,
  },
  {
    questionVersionId: "8g8-question-version-haritanin-sessiz-secimi-3-v1",
    questionId: "8g8-question-haritanin-sessiz-secimi-3",
    sourceTemplateVersionId: "8g8-template-version-haritanin-sessiz-secimi-v1",
    skillCode: "RC_INFERENCE",
    difficulty: 0.65,
    position: 8,
  },
];

if (GUEST_DIAGNOSTIC_CANDIDATES.length !== GUEST_DIAGNOSTIC_QUESTION_COUNT) {
  throw new Error("Guest Diagnostic aday soru sayısı contract ile eşleşmiyor");
}
