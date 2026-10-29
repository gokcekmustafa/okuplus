import {
  buildEducationV2P1ALearningCycleManifest,
  buildEducationV2P1BCDLearningCycleManifests,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "./learning-cycle-manifest.js";
import { EDUCATION_V2_P1_A_PROGRAM } from "./education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
  isEducationV2P1ACycleV2ProductionAssignmentEnabled,
} from "./education-v2-p1-a-cycle-v2-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
  isEducationV2P1ACycle3ProductionAssignmentEnabled,
} from "./education-v2-p1-a-cycle-3-program.js";
import { EDUCATION_V2_P1_A_CYCLE_4_PROGRAM } from "./education-v2-p1-a-cycle-4-program.js";
import { EDUCATION_V2_P1_A_CYCLE_4_MANIFEST } from "./education-v2-p1-a-cycle-4-manifest.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE,
  isEducationV2P1ACycle4ProductionAssignmentEnabled,
} from "./education-v2-p1-a-cycle-4-release.js";
import {
  EDUCATION_V2_P1_A_CYCLE_5_8,
  EDUCATION_V2_P1_A_CYCLE_9_12,
  EDUCATION_V2_P1_A_CYCLE_13_16,
  EDUCATION_V2_P1_A_CYCLE_17_20,
  EDUCATION_V2_P1_A_CYCLE_21_24,
  EDUCATION_V2_P1_A_CYCLE_25_28,
  EDUCATION_V2_P1_A_CYCLE_29_32,
  EDUCATION_V2_P1_A_CYCLE_33_36,
  EDUCATION_V2_P1_A_CYCLE_37_40,
  EDUCATION_V2_P1_A_CYCLE_41_44,
  EDUCATION_V2_P1_A_CYCLE_45_48,
  EDUCATION_V2_P1_A_CYCLE_49_52,
  EDUCATION_V2_P1_A_CYCLE_53_56,
} from "./education-v2-p1-a-cycle-5-8-program.js";
import { isEducationV2P1ACycle5To8ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-5-8-release.js";
import { isEducationV2P1ACycle9To12ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-9-12-release.js";
import { isEducationV2P1ACycle13To16ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-13-16-release.js";
import { isEducationV2P1ACycle17To20ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-17-20-release.js";
import { isEducationV2P1ACycle21To24ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-21-24-release.js";
import { isEducationV2P1ACycle25To28ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-25-28-release.js";
import { isEducationV2P1ACycle29To32ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-29-32-release.js";
import { isEducationV2P1ACycle33To36ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-33-36-release.js";
import { isEducationV2P1ACycle37To40ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-37-40-release.js";
import { isEducationV2P1ACycle41To44ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-41-44-release.js";
import { isEducationV2P1ACycle45To48ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-45-48-release.js";
import { isEducationV2P1ACycle49To52ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-49-52-release.js";
import { isEducationV2P1ACycle53To56ProductionAssignmentEnabled } from "./education-v2-p1-a-cycle-53-56-release.js";
import { EDUCATION_V2_P1_BCD_PROGRAMS } from "./education-v2-p1-bcd-program.js";
import {
  EDUCATION_V2_P1_800_CATEGORY_TARGETS,
  EDUCATION_V2_P1_800_DRAFT_CYCLES,
  type EducationV2P1ExpansionCategory,
} from "./education-v2-p1-800-draft-cycles.js";
import { mapCurriculumSkillCodesToStoredSkillCodes } from "./learning-step-skill-link.js";

/** A route is an explicit chain of immutable content releases, not a level reassessment. */
export type LearningRouteCycle = {
  pathCode: string;
  programId: string;
  version: number;
  sequence: number;
  routeFamily: "A" | "B" | "C" | "D";
  scopeCode: string;
  title: string;
  units: readonly { code: string; steps: readonly { key: string }[] }[];
  manifest: LearningCycleManifest;
  nextPathCode: string | null;
  authoredStationCategories?: readonly EducationV2P1ExpansionCategory[];
  /** Number of authored stations with a checked, content-linked source citation. */
  sourceVerifiedStationCount?: number;
  authoringStatus?: "DRAFT_NOT_RELEASED" | "OWNER_RELEASE_APPROVED";
  /** Source permission; a PUBLISHED database graph is a separate requirement. */
  publicationApproved: () => boolean;
};

const initialManifest = buildEducationV2P1ALearningCycleManifest();
const bcdManifests = buildEducationV2P1BCDLearningCycleManifests();

const BASE_LEARNING_ROUTE_CYCLES: readonly LearningRouteCycle[] = [
  {
    pathCode: EDUCATION_V2_P1_A_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_PROGRAM.programId,
    version: initialManifest.cycleVersion,
    sequence: 1,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: "Anlam ve metin yapısı",
    units: EDUCATION_V2_P1_A_PROGRAM.path.units,
    manifest: initialManifest,
    nextPathCode: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.code,
    publicationApproved: () => true,
  },
  {
    pathCode: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.programId,
    version: EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST.cycleVersion,
    sequence: 2,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: "Metin yapısı ve anlam ilişkileri",
    units: EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM.path.units,
    manifest: EDUCATION_V2_P1_A_CYCLE_V2_MANIFEST,
    nextPathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
    publicationApproved: () => isEducationV2P1ACycleV2ProductionAssignmentEnabled(),
  },
  {
    pathCode: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code,
    programId: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.programId,
    version: EDUCATION_V2_P1_A_CYCLE_3_MANIFEST.cycleVersion,
    sequence: 3,
    routeFamily: "A",
    scopeCode: "G8_12",
    title: "Kanıt ve aktarım",
    units: EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units,
    manifest: EDUCATION_V2_P1_A_CYCLE_3_MANIFEST,
    nextPathCode: null,
    publicationApproved: () => isEducationV2P1ACycle3ProductionAssignmentEnabled(),
  },
  ...EDUCATION_V2_P1_BCD_PROGRAMS.map((program, index): LearningRouteCycle => {
    const next = EDUCATION_V2_P1_BCD_PROGRAMS.find(
      (candidate) =>
        candidate.routeFamily === program.routeFamily &&
        candidate.sequence === program.sequence + 1,
    );
    return {
      pathCode: program.path.code,
      programId: program.programId,
      version: bcdManifests[index]!.cycleVersion,
      sequence: program.sequence,
      routeFamily: program.routeFamily,
      scopeCode: "G8_12",
      title: program.path.title,
      units: program.path.units,
      manifest: bcdManifests[index]!,
      nextPathCode: next?.path.code ?? null,
      publicationApproved: () => program.publicationApproved,
    };
  }),
];

const linkedBaseCycles = BASE_LEARNING_ROUTE_CYCLES.map((cycle) => {
  if (cycle.nextPathCode) return cycle;
  const draftNext = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
    (candidate) =>
      candidate.routeFamily === cycle.routeFamily && candidate.sequence === cycle.sequence + 1,
  );
  return draftNext ? { ...cycle, nextPathCode: draftNext.pathCode } : cycle;
});

/**
 * Expansion drafts extend the source chain. Cycles with dedicated versioned
 * programs use those exact manifests; their production graphs remain separate
 * availability gates. Cycles 5–8 remain unavailable until their owner release
 * decision is recorded in source as well as their graph being ready.
 */
const expansionRouteCycles = EDUCATION_V2_P1_800_DRAFT_CYCLES.map((cycle) => {
  if (cycle.pathCode === EDUCATION_V2_P1_A_CYCLE_4_PATH_CODE) {
    return {
      ...cycle,
      pathCode: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.code,
      programId: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.programId,
      version: EDUCATION_V2_P1_A_CYCLE_4_MANIFEST.cycleVersion,
      sequence: EDUCATION_V2_P1_A_CYCLE_4_MANIFEST.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.title,
      units: EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.units,
      manifest: EDUCATION_V2_P1_A_CYCLE_4_MANIFEST,
      authoringStatus: "OWNER_RELEASE_APPROVED" as const,
      publicationApproved: isEducationV2P1ACycle4ProductionAssignmentEnabled,
    };
  }

  const authoredCycle = EDUCATION_V2_P1_A_CYCLE_5_8.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && authoredCycle) {
    const publicationApproved = () =>
      isEducationV2P1ACycle5To8ProductionAssignmentEnabled(authoredCycle.sequence);
    return {
      ...cycle,
      pathCode: authoredCycle.program.path.code,
      programId: authoredCycle.program.programId,
      version: authoredCycle.manifest.cycleVersion,
      sequence: authoredCycle.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: authoredCycle.program.path.title,
      units: authoredCycle.program.path.units,
      manifest: authoredCycle.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA9To12 = EDUCATION_V2_P1_A_CYCLE_9_12.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA9To12) {
    const publicationApproved = () =>
      isEducationV2P1ACycle9To12ProductionAssignmentEnabled(preparedA9To12.sequence);
    return {
      ...cycle,
      pathCode: preparedA9To12.program.path.code,
      programId: preparedA9To12.program.programId,
      version: preparedA9To12.manifest.cycleVersion,
      sequence: preparedA9To12.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA9To12.program.path.title,
      units: preparedA9To12.program.path.units,
      manifest: preparedA9To12.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA13To16 = EDUCATION_V2_P1_A_CYCLE_13_16.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA13To16) {
    const publicationApproved = () =>
      isEducationV2P1ACycle13To16ProductionAssignmentEnabled(preparedA13To16.sequence);
    return {
      ...cycle,
      pathCode: preparedA13To16.program.path.code,
      programId: preparedA13To16.program.programId,
      version: preparedA13To16.manifest.cycleVersion,
      sequence: preparedA13To16.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA13To16.program.path.title,
      units: preparedA13To16.program.path.units,
      manifest: preparedA13To16.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA17To20 = EDUCATION_V2_P1_A_CYCLE_17_20.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA17To20) {
    const publicationApproved = () =>
      isEducationV2P1ACycle17To20ProductionAssignmentEnabled(preparedA17To20.sequence);
    return {
      ...cycle,
      pathCode: preparedA17To20.program.path.code,
      programId: preparedA17To20.program.programId,
      version: preparedA17To20.manifest.cycleVersion,
      sequence: preparedA17To20.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA17To20.program.path.title,
      units: preparedA17To20.program.path.units,
      manifest: preparedA17To20.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA21To24 = EDUCATION_V2_P1_A_CYCLE_21_24.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA21To24) {
    const publicationApproved = () =>
      isEducationV2P1ACycle21To24ProductionAssignmentEnabled(preparedA21To24.sequence);
    return {
      ...cycle,
      pathCode: preparedA21To24.program.path.code,
      programId: preparedA21To24.program.programId,
      version: preparedA21To24.manifest.cycleVersion,
      sequence: preparedA21To24.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA21To24.program.path.title,
      units: preparedA21To24.program.path.units,
      manifest: preparedA21To24.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA25To28 = EDUCATION_V2_P1_A_CYCLE_25_28.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA25To28) {
    const publicationApproved = () =>
      isEducationV2P1ACycle25To28ProductionAssignmentEnabled(preparedA25To28.sequence);
    return {
      ...cycle,
      pathCode: preparedA25To28.program.path.code,
      programId: preparedA25To28.program.programId,
      version: preparedA25To28.manifest.cycleVersion,
      sequence: preparedA25To28.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA25To28.program.path.title,
      units: preparedA25To28.program.path.units,
      manifest: preparedA25To28.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA29To32 = EDUCATION_V2_P1_A_CYCLE_29_32.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA29To32) {
    const publicationApproved = () =>
      isEducationV2P1ACycle29To32ProductionAssignmentEnabled(preparedA29To32.sequence);
    return {
      ...cycle,
      pathCode: preparedA29To32.program.path.code,
      programId: preparedA29To32.program.programId,
      version: preparedA29To32.manifest.cycleVersion,
      sequence: preparedA29To32.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA29To32.program.path.title,
      units: preparedA29To32.program.path.units,
      manifest: preparedA29To32.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA33To36 = EDUCATION_V2_P1_A_CYCLE_33_36.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA33To36) {
    const publicationApproved = () =>
      isEducationV2P1ACycle33To36ProductionAssignmentEnabled(preparedA33To36.sequence);
    return {
      ...cycle,
      pathCode: preparedA33To36.program.path.code,
      programId: preparedA33To36.program.programId,
      version: preparedA33To36.manifest.cycleVersion,
      sequence: preparedA33To36.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA33To36.program.path.title,
      units: preparedA33To36.program.path.units,
      manifest: preparedA33To36.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA37To40 = EDUCATION_V2_P1_A_CYCLE_37_40.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA37To40) {
    const publicationApproved = () =>
      isEducationV2P1ACycle37To40ProductionAssignmentEnabled(preparedA37To40.sequence);
    return {
      ...cycle,
      pathCode: preparedA37To40.program.path.code,
      programId: preparedA37To40.program.programId,
      version: preparedA37To40.manifest.cycleVersion,
      sequence: preparedA37To40.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA37To40.program.path.title,
      units: preparedA37To40.program.path.units,
      manifest: preparedA37To40.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA41To44 = EDUCATION_V2_P1_A_CYCLE_41_44.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA41To44) {
    const publicationApproved = () =>
      isEducationV2P1ACycle41To44ProductionAssignmentEnabled(preparedA41To44.sequence);
    return {
      ...cycle,
      pathCode: preparedA41To44.program.path.code,
      programId: preparedA41To44.program.programId,
      version: preparedA41To44.manifest.cycleVersion,
      sequence: preparedA41To44.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA41To44.program.path.title,
      units: preparedA41To44.program.path.units,
      manifest: preparedA41To44.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA45To48 = EDUCATION_V2_P1_A_CYCLE_45_48.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA45To48) {
    const publicationApproved = () =>
      isEducationV2P1ACycle45To48ProductionAssignmentEnabled(preparedA45To48.sequence);
    return {
      ...cycle,
      pathCode: preparedA45To48.program.path.code,
      programId: preparedA45To48.program.programId,
      version: preparedA45To48.manifest.cycleVersion,
      sequence: preparedA45To48.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA45To48.program.path.title,
      units: preparedA45To48.program.path.units,
      manifest: preparedA45To48.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA49To52 = EDUCATION_V2_P1_A_CYCLE_49_52.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA49To52) {
    const publicationApproved = () =>
      isEducationV2P1ACycle49To52ProductionAssignmentEnabled(preparedA49To52.sequence);
    return {
      ...cycle,
      pathCode: preparedA49To52.program.path.code,
      programId: preparedA49To52.program.programId,
      version: preparedA49To52.manifest.cycleVersion,
      sequence: preparedA49To52.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA49To52.program.path.title,
      units: preparedA49To52.program.path.units,
      manifest: preparedA49To52.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  const preparedA53To56 = EDUCATION_V2_P1_A_CYCLE_53_56.find(
    (candidate) => candidate.sequence === cycle.sequence,
  );
  if (cycle.routeFamily === "A" && preparedA53To56) {
    const publicationApproved = () =>
      isEducationV2P1ACycle53To56ProductionAssignmentEnabled(preparedA53To56.sequence);
    return {
      ...cycle,
      pathCode: preparedA53To56.program.path.code,
      programId: preparedA53To56.program.programId,
      version: preparedA53To56.manifest.cycleVersion,
      sequence: preparedA53To56.manifest.sequence,
      routeFamily: "A" as const,
      scopeCode: "G8_12",
      title: preparedA53To56.program.path.title,
      units: preparedA53To56.program.path.units,
      manifest: preparedA53To56.manifest,
      authoringStatus: publicationApproved()
        ? ("OWNER_RELEASE_APPROVED" as const)
        : ("DRAFT_NOT_RELEASED" as const),
      publicationApproved,
    };
  }
  return cycle;
});

export const LEARNING_ROUTE_CYCLES: readonly LearningRouteCycle[] = [
  ...linkedBaseCycles,
  ...expansionRouteCycles,
];

const cyclesByCode = new Map(LEARNING_ROUTE_CYCLES.map((cycle) => [cycle.pathCode, cycle]));

type AuthoredSkillProgram = {
  programId: string;
  path: {
    code: string;
    units: readonly {
      steps: readonly {
        key: string;
        contentKey?: string;
        exerciseKey?: string;
        assessmentKey?: string;
      }[];
    }[];
  };
  content: readonly { key: string; skillCode: string }[];
  exercises: readonly { key: string; skillCode: string; contentKey: string }[];
  assessments: readonly { key: string; templateExerciseKey: string }[];
};

const authoredSkillPrograms: readonly AuthoredSkillProgram[] = [
  EDUCATION_V2_P1_A_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_V2_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  ...EDUCATION_V2_P1_A_CYCLE_5_8.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_9_12.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_13_16.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_17_20.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_21_24.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_25_28.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_29_32.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_33_36.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_37_40.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_41_44.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_45_48.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_49_52.map(({ program }) => program),
  ...EDUCATION_V2_P1_A_CYCLE_53_56.map(({ program }) => program),
  ...EDUCATION_V2_P1_BCD_PROGRAMS,
];

function localLearningRouteStepKey(programId: string, stableKey: string): string {
  const expectedPrefix = `${programId}:`;
  return stableKey.startsWith(expectedPrefix) ? stableKey.slice(expectedPrefix.length) : stableKey;
}

/**
 * Returns only the source-authored primary competency for this step's linked
 * content/exercise. Outcome targets are evaluated separately by the audit;
 * this list prevents the expected instructional competency from masking an
 * unrelated extra ContentSkill or Question skill relation.
 */
export function sourcePrimarySkillCodesForRouteStep(
  pathCode: string,
  stableKey: string,
): readonly string[] {
  const cycle = cyclesByCode.get(pathCode);
  if (!cycle) return [];
  const program = authoredSkillPrograms.find(
    (candidate) => candidate.programId === cycle.programId && candidate.path.code === pathCode,
  );
  if (!program) return [];

  const localStepKey = localLearningRouteStepKey(program.programId, stableKey);
  const step = program.path.units
    .flatMap((unit) => unit.steps)
    .find((item) => item.key === localStepKey);
  if (!step) return [];

  const skillCodes = new Set<string>();
  if (step.contentKey) {
    const content = program.content.find((item) => item.key === step.contentKey);
    if (content) skillCodes.add(content.skillCode);
  }
  const exerciseKeys = new Set<string>();
  if (step.exerciseKey) exerciseKeys.add(step.exerciseKey);
  if (step.assessmentKey) {
    const assessment = program.assessments.find((item) => item.key === step.assessmentKey);
    if (assessment) exerciseKeys.add(assessment.templateExerciseKey);
  }
  for (const exerciseKey of exerciseKeys) {
    const exercise = program.exercises.find((item) => item.key === exerciseKey);
    if (exercise) skillCodes.add(exercise.skillCode);
  }
  return [...skillCodes];
}

export type SourceContentSkillTarget = {
  pathCode: string;
  sourceStationKey: string;
  contentKey: string;
  skillCode: string;
  reason: "SOURCE_PRIMARY_COMPETENCY" | "LEARNING_OUTCOME_TARGET";
};

/**
 * Returns the reviewed source mappings that provisioning stores on the
 * content row for one route step. The result intentionally remains separate
 * from the scalar LearningStep.skillId field so multi-skill outcomes survive.
 */
export function sourceContentSkillTargetsForRouteStep(
  pathCode: string,
  stableKey: string,
): readonly SourceContentSkillTarget[] {
  const cycle = cyclesByCode.get(pathCode);
  if (!cycle) return [];
  const program = authoredSkillPrograms.find(
    (candidate) => candidate.programId === cycle.programId && candidate.path.code === pathCode,
  );
  if (!program) return [];

  const localStepKey = localLearningRouteStepKey(program.programId, stableKey);
  const step = program.path.units
    .flatMap((unit) => unit.steps)
    .find((item) => item.key === localStepKey);
  if (!step) return [];

  const contentKey =
    step.contentKey ??
    (step.exerciseKey
      ? program.exercises.find((item) => item.key === step.exerciseKey)?.contentKey
      : undefined) ??
    (step.assessmentKey
      ? (() => {
          const assessment = program.assessments.find((item) => item.key === step.assessmentKey);
          return assessment
            ? program.exercises.find((item) => item.key === assessment.templateExerciseKey)
                ?.contentKey
            : undefined;
        })()
      : undefined);
  if (!contentKey) return [];

  const targets = new Map<string, SourceContentSkillTarget>();
  for (const skillCode of sourcePrimarySkillCodesForRouteStep(pathCode, stableKey)) {
    targets.set(`${contentKey}|${skillCode}|SOURCE_PRIMARY_COMPETENCY`, {
      pathCode,
      sourceStationKey: localStepKey,
      contentKey,
      skillCode,
      reason: "SOURCE_PRIMARY_COMPETENCY",
    });
  }

  const manifestStep = cycle.manifest.steps.find((item) => item.stableKey === localStepKey);
  if (!manifestStep) return [...targets.values()];
  const outcomeCodes = mapCurriculumSkillCodesToStoredSkillCodes(
    manifestStep.learningOutcomeKeys.flatMap(
      (key) =>
        cycle.manifest.learningOutcomes.find((outcome) => outcome.key === key)?.targetSkillCodes ??
        [],
    ),
  );
  for (const skillCode of outcomeCodes.storedSkillCodes) {
    targets.set(`${contentKey}|${skillCode}|LEARNING_OUTCOME_TARGET`, {
      pathCode,
      sourceStationKey: localStepKey,
      contentKey,
      skillCode,
      reason: "LEARNING_OUTCOME_TARGET",
    });
  }
  return [...targets.values()];
}

export function learningRouteCycle(pathCode: string): LearningRouteCycle | null {
  return cyclesByCode.get(pathCode) ?? null;
}

const stationCategoriesByRouteKey = new Map<string, EducationV2P1ExpansionCategory>();
for (const cycle of LEARNING_ROUTE_CYCLES) {
  const sourceCycle = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
    (candidate) =>
      candidate.routeFamily === cycle.routeFamily && candidate.sequence === cycle.sequence,
  );
  if (!sourceCycle) continue;
  const sourceStationsByKey = new Map(
    sourceCycle.sourceStations.map((station) => [station.key, station]),
  );
  for (const step of cycle.manifest.steps) {
    const station = sourceStationsByKey.get(step.stableKey);
    if (station) {
      stationCategoriesByRouteKey.set(`${cycle.pathCode}\u0000${step.stableKey}`, station.category);
    }
  }
}

/** Returns only the curriculum category; passage and assessment data stay private. */
export function learningRouteStationCategory(
  pathCode: string,
  stableKey: string,
): EducationV2P1ExpansionCategory | null {
  const cycle = cyclesByCode.get(pathCode);
  if (!cycle) return null;
  const localStepKey = localLearningRouteStepKey(cycle.programId, stableKey);
  return stationCategoriesByRouteKey.get(`${pathCode}\u0000${localStepKey}`) ?? null;
}

export function nextLearningRouteCycle(pathCode: string): LearningRouteCycle | null {
  const current = learningRouteCycle(pathCode);
  if (!current?.nextPathCode) return null;
  const next = learningRouteCycle(current.nextPathCode);
  return next &&
    next.routeFamily === current.routeFamily &&
    next.scopeCode === current.scopeCode &&
    next.sequence === current.sequence + 1
    ? next
    : null;
}

export function upcomingLearningRouteCycles(pathCode: string): LearningRouteCycle[] {
  const result: LearningRouteCycle[] = [];
  const seen = new Set([pathCode]);
  let next = nextLearningRouteCycle(pathCode);
  while (next && !seen.has(next.pathCode)) {
    result.push(next);
    seen.add(next.pathCode);
    next = nextLearningRouteCycle(next.pathCode);
  }
  return result;
}

/** Minimum number of route positions visible on the student roadmap. */
export const LEARNING_ROUTE_VISIBLE_STATION_TARGET = 300;

export type PlannedLearningRouteNode = {
  id: string;
  learningPathId: null;
  learningPathCode: string;
  code: string;
  type: string;
  label: string;
  stationCategory?: EducationV2P1ExpansionCategory;
  status: "locked";
  availability: "UNAVAILABLE";
  planningStatus: "AUTHORED_UNRELEASED" | "GRAPH_NOT_AVAILABLE" | "CONTENT_NOT_AUTHORED";
  cycleSequence: number | null;
  stepOrder: number;
  templateVersionId: null;
  contentVersionId: null;
  assessmentId: null;
  prerequisiteStepId: null;
  progress: null;
  unit: { title: string };
  isCurrent: false;
};

/** Counts real positions already rendered before adding roadmap placeholders. */
export function countVisibleLearningRoutePositions(
  groups: readonly { nodes: readonly unknown[] }[],
): number {
  return groups.reduce((count, group) => count + group.nodes.length, 0);
}

/**
 * Produces a safe, read-only roadmap projection for future stations. The
 * projection deliberately excludes passage bodies, questions, answers,
 * explanations, source URLs, and database identifiers. It does not change
 * publication or assignment eligibility.
 */
export function buildPlannedLearningRouteNodes(options: {
  currentPathCode: string;
  representedPathCodes?: ReadonlySet<string>;
  visibleStationCount: number;
  targetStationCount?: number;
}): PlannedLearningRouteNode[] {
  const current = learningRouteCycle(options.currentPathCode);
  if (!current) return [];

  const representedPathCodes = options.representedPathCodes ?? new Set<string>();
  const targetStationCount = Math.max(
    0,
    options.targetStationCount ?? LEARNING_ROUTE_VISIBLE_STATION_TARGET,
  );
  const planned: PlannedLearningRouteNode[] = [];

  const futureCycles = LEARNING_ROUTE_CYCLES.filter(
    (cycle) =>
      cycle.routeFamily === current.routeFamily &&
      cycle.sequence > current.sequence &&
      !representedPathCodes.has(cycle.pathCode),
  ).sort((left, right) => left.sequence - right.sequence);

  for (const cycle of futureCycles) {
    const draft = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
      (candidate) => candidate.pathCode === cycle.pathCode,
    );
    const stationsByKey = new Map(draft?.sourceStations.map((station) => [station.key, station]));
    for (const step of cycle.manifest.steps) {
      const station = stationsByKey.get(step.stableKey);
      const hasContentDefinition = Boolean(
        station ||
        ("content" in step && step.content) ||
        ("exercise" in step && step.exercise) ||
        ("assessment" in step && step.assessment),
      );
      planned.push({
        id: `planned:${current.routeFamily}:${cycle.sequence}:${step.order}`,
        learningPathId: null,
        learningPathCode: cycle.pathCode,
        code: step.stableKey,
        type: step.type,
        label: station
          ? station.title || "İçerik başlığı hazırlanıyor"
          : hasContentDefinition
            ? `${cycle.title} · Adım ${step.order}`
            : "Henüz içerik tanımlanmadı",
        ...(station ? { stationCategory: station.category } : {}),
        status: "locked",
        availability: "UNAVAILABLE",
        planningStatus: !hasContentDefinition
          ? "CONTENT_NOT_AUTHORED"
          : cycle.publicationApproved()
            ? "GRAPH_NOT_AVAILABLE"
            : "AUTHORED_UNRELEASED",
        cycleSequence: cycle.sequence,
        stepOrder: step.order,
        templateVersionId: null,
        contentVersionId: null,
        assessmentId: null,
        prerequisiteStepId: null,
        progress: null,
        unit: { title: cycle.title },
        isCurrent: false,
      });
    }
  }

  const reservedCount = Math.max(
    0,
    targetStationCount - options.visibleStationCount - planned.length,
  );
  for (let index = 0; index < reservedCount; index += 1) {
    const routePosition = options.visibleStationCount + planned.length + 1;
    planned.push({
      id: `planned:${current.routeFamily}:reserved:${routePosition}`,
      learningPathId: null,
      learningPathCode: `PLANNED_EDUCATION_V2_P1_${current.routeFamily}`,
      code: `PLANNED_${current.routeFamily}_${routePosition}`,
      type: "PLANNED",
      label: "Henüz içerik tanımlanmadı",
      status: "locked",
      availability: "UNAVAILABLE",
      planningStatus: "CONTENT_NOT_AUTHORED",
      cycleSequence: null,
      stepOrder: routePosition,
      templateVersionId: null,
      contentVersionId: null,
      assessmentId: null,
      prerequisiteStepId: null,
      progress: null,
      unit: { title: "Gelecekteki istasyonlar" },
      isCurrent: false,
    });
  }

  return planned;
}

export const LEARNING_ROUTE_STATION_TARGET = 200;

export type LearningRouteCoverage = {
  routeFamily: "A" | "B" | "C" | "D";
  authoredStationCount: number;
  releasedSourceStationCount: number;
  sourceVerifiedDraftStationCount: number;
  sourceQualifiedStationCount: number;
  sourceQualifiedRemainingStations: number;
  authoredSourceReviewRequiredStationCount: number;
  targetStationCount: number;
  remainingAuthoredStations: number;
  categoryDistribution: "NOT_CLASSIFIED" | "INCOMPLETE" | "TARGETS_MISMATCH" | "TARGETS_MET";
  categoryCounts: Record<EducationV2P1ExpansionCategory, number>;
  categoryTargetGaps: Record<EducationV2P1ExpansionCategory, number>;
  categoryTargetExcesses: Record<EducationV2P1ExpansionCategory, number>;
  unclassifiedStationCount: number;
  categoryTargets: typeof EDUCATION_V2_P1_800_CATEGORY_TARGETS;
  productionGraph: "NOT_VERIFIED";
};

/** Source-only progress. It never implies a database graph was provisioned. */
export function summarizeLearningRouteCoverage(
  cycles: readonly LearningRouteCycle[] = LEARNING_ROUTE_CYCLES,
): LearningRouteCoverage[] {
  return (["A", "B", "C", "D"] as const).map((routeFamily) => {
    const routeCycles = cycles.filter((cycle) => cycle.routeFamily === routeFamily);
    const authoredStationCount = routeCycles.reduce(
      (count, cycle) => count + cycle.manifest.steps.length,
      0,
    );
    const releasedSourceStationCount = routeCycles.reduce(
      (count, cycle) =>
        count +
        (cycle.publicationApproved()
          ? (cycle.sourceVerifiedStationCount ?? cycle.manifest.steps.length)
          : 0),
      0,
    );
    const sourceVerifiedDraftStationCount = routeCycles.reduce(
      (count, cycle) =>
        count + (cycle.publicationApproved() ? 0 : (cycle.sourceVerifiedStationCount ?? 0)),
      0,
    );
    const sourceQualifiedStationCount =
      releasedSourceStationCount + sourceVerifiedDraftStationCount;
    const categoryCounts = Object.fromEntries(
      Object.keys(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map((category) => [category, 0]),
    ) as Record<EducationV2P1ExpansionCategory, number>;
    let classifiedStationCount = 0;
    for (const cycle of routeCycles) {
      for (const category of cycle.authoredStationCategories ?? []) {
        categoryCounts[category] += 1;
        classifiedStationCount += 1;
      }
    }
    const categoryTargetGaps = Object.fromEntries(
      Object.entries(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map(([category, target]) => [
        category,
        Math.max(0, target - categoryCounts[category as EducationV2P1ExpansionCategory]),
      ]),
    ) as Record<EducationV2P1ExpansionCategory, number>;
    const categoryTargetExcesses = Object.fromEntries(
      Object.entries(EDUCATION_V2_P1_800_CATEGORY_TARGETS).map(([category, target]) => [
        category,
        Math.max(0, categoryCounts[category as EducationV2P1ExpansionCategory] - target),
      ]),
    ) as Record<EducationV2P1ExpansionCategory, number>;
    const categoryTargetsMet =
      Object.values(categoryTargetGaps).every((count) => count === 0) &&
      Object.values(categoryTargetExcesses).every((count) => count === 0);
    return {
      routeFamily,
      authoredStationCount,
      releasedSourceStationCount,
      sourceVerifiedDraftStationCount,
      sourceQualifiedStationCount,
      sourceQualifiedRemainingStations: Math.max(
        0,
        LEARNING_ROUTE_STATION_TARGET - sourceQualifiedStationCount,
      ),
      authoredSourceReviewRequiredStationCount: Math.max(
        0,
        authoredStationCount - sourceQualifiedStationCount,
      ),
      targetStationCount: LEARNING_ROUTE_STATION_TARGET,
      remainingAuthoredStations: Math.max(0, LEARNING_ROUTE_STATION_TARGET - authoredStationCount),
      categoryDistribution:
        classifiedStationCount === 0
          ? "NOT_CLASSIFIED"
          : authoredStationCount > classifiedStationCount
            ? "INCOMPLETE"
            : categoryTargetsMet
              ? "TARGETS_MET"
              : "TARGETS_MISMATCH",
      categoryCounts,
      categoryTargetGaps,
      categoryTargetExcesses,
      unclassifiedStationCount: Math.max(0, authoredStationCount - classifiedStationCount),
      categoryTargets: EDUCATION_V2_P1_800_CATEGORY_TARGETS,
      productionGraph: "NOT_VERIFIED",
    };
  });
}

export type LearningRouteGraph = {
  code: string;
  version: number;
  units: readonly {
    code: string;
    status: string;
    steps: readonly {
      id: string;
      stableKey: string;
      type: string;
      position: number;
      status: string;
      isActive: boolean;
      prerequisiteStepId: string | null;
      completionRule: unknown;
      contentVersionId: string | null;
      exerciseTemplateVersionId: string | null;
      assessmentId: string | null;
    }[];
  }[];
};

export function matchesLearningRouteGraph(path: LearningRouteGraph): boolean {
  const cycle = learningRouteCycle(path.code);
  if (!cycle || path.version !== cycle.version || path.units.length !== cycle.units.length)
    return false;
  const actual = path.units.flatMap((unit) => unit.steps);
  if (
    actual.length !== cycle.manifest.steps.length ||
    new Set(actual.map((step) => step.id)).size !== actual.length
  )
    return false;
  const byKey = new Map(actual.map((step) => [step.stableKey, step]));
  if (byKey.size !== actual.length) return false;
  const sourceSteps = new Map(cycle.manifest.steps.map((step) => [step.stableKey, step]));
  return path.units.every((unit, index) => {
    const source = cycle.units[index]!;
    return (
      unit.status === "PUBLISHED" &&
      unit.code === source.code &&
      unit.steps.length === source.steps.length &&
      unit.steps.every((step, stepIndex) => {
        const key = source.steps[stepIndex]!.key;
        const expected = sourceSteps.get(key);
        if (!expected) return false;
        const rule =
          step.completionRule &&
          typeof step.completionRule === "object" &&
          !Array.isArray(step.completionRule)
            ? (step.completionRule as Record<string, unknown>)
            : {};
        const configured = rule.prerequisiteStepIds;
        if (
          configured !== undefined &&
          (!Array.isArray(configured) || configured.some((id) => typeof id !== "string"))
        )
          return false;
        const prerequisites = new Set([
          ...(step.prerequisiteStepId ? [step.prerequisiteStepId] : []),
          ...(Array.isArray(configured) ? (configured as string[]) : []),
        ]);
        const expectedIds = expected.prerequisiteKeys.map(
          (prerequisite) => byKey.get(`${cycle.programId}:${prerequisite}`)?.id,
        );
        return (
          step.stableKey === `${cycle.programId}:${key}` &&
          step.type === expected.type &&
          step.contentVersionId === (expected.content?.versionId ?? null) &&
          step.exerciseTemplateVersionId === (expected.exercise?.versionId ?? null) &&
          step.assessmentId === (expected.assessment?.versionId ?? null) &&
          step.position === stepIndex + 1 &&
          step.status === "PUBLISHED" &&
          step.isActive &&
          prerequisites.size === expectedIds.length &&
          expectedIds.every((id) => id !== undefined && prerequisites.has(id))
        );
      })
    );
  });
}

/** Validates authored resources and the chain without inventing future stations. */
export function validateLearningRouteCatalog(
  cycles: readonly LearningRouteCycle[] = LEARNING_ROUTE_CYCLES,
): string[] {
  const errors: string[] = [];
  const paths = new Map(cycles.map((cycle) => [cycle.pathCode, cycle]));
  if (paths.size !== cycles.length) errors.push("Tekrarlı öğrenme rotası kodu");
  const sequences = new Set<string>();
  const resources = new Set<string>();
  for (const cycle of cycles) {
    const identity = `${cycle.routeFamily}:${cycle.scopeCode}:${cycle.sequence}`;
    if (sequences.has(identity)) errors.push(`Tekrarlı döngü sırası: ${identity}`);
    sequences.add(identity);
    if (
      cycle.version !== cycle.manifest.cycleVersion ||
      cycle.sequence !== cycle.manifest.sequence ||
      cycle.routeFamily !== cycle.manifest.routeFamily
    )
      errors.push(`Döngü sürüm/kapsam uyuşmazlığı: ${cycle.pathCode}`);
    const unitSteps = cycle.units.flatMap((unit) => unit.steps.map((step) => step.key));
    if (
      unitSteps.length !== cycle.manifest.steps.length ||
      unitSteps.some((key, index) => key !== cycle.manifest.steps[index]?.stableKey)
    )
      errors.push(`Ünite ve istasyon sırası uyuşmuyor: ${cycle.pathCode}`);
    for (const issue of validateLearningCycleManifest(cycle.manifest).errors)
      errors.push(`${cycle.pathCode}: ${issue.path}: ${issue.message}`);
    for (const resource of [
      ...cycle.manifest.resourceCatalog.contentVersions,
      ...cycle.manifest.resourceCatalog.exerciseVersions,
      ...cycle.manifest.resourceCatalog.assessmentVersions,
    ]) {
      if (resources.has(resource.versionId))
        errors.push(`Tekrarlı kaynak sürümü: ${resource.versionId}`);
      resources.add(resource.versionId);
    }
    for (const questionId of cycle.manifest.resourceCatalog.questionVersionIds) {
      if (resources.has(questionId)) errors.push(`Tekrarlı soru sürümü: ${questionId}`);
      resources.add(questionId);
    }
    if (cycle.nextPathCode) {
      const next = paths.get(cycle.nextPathCode);
      if (
        !next ||
        next.routeFamily !== cycle.routeFamily ||
        next.scopeCode !== cycle.scopeCode ||
        next.sequence !== cycle.sequence + 1
      )
        errors.push(`Geçersiz döngü bağlantısı: ${cycle.pathCode}`);
    }
  }
  return errors;
}
