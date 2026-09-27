import {
  ACADEMIC_P0_COMMON_FLOW,
  ACADEMIC_P0_LESSONS,
  type AcademicAreaCode,
  type AcademicSkillCode,
  type AcademicStage,
} from "../../curriculum/academic-reading-p0.js";

export type AcademicStepStatus = "COMPLETED" | "ACTIVE" | "LOCKED" | "UNAVAILABLE";

export type AcademicRuntimeSkill = {
  code: string;
  name: string;
  hasPublishedPractice: boolean;
  practiceCompleted: boolean;
  accuracy: number | null;
  lessonPublished: boolean;
  lessonCompleted: boolean;
};

export type AcademicProgramResponse = {
  version: "P0";
  publicationStatus: "PARTIALLY_AVAILABLE" | "AUTHORING_ONLY";
  areas: Array<{
    code: AcademicAreaCode;
    title: string;
    skills: Array<{
      skillCode: AcademicSkillCode;
      title: string;
      objective: string;
      stages: Array<{
        code: AcademicStage;
        title: string;
        status: AcademicStepStatus;
      }>;
      accuracy: number | null;
    }>;
  }>;
  common: {
    stages: Array<{
      code: (typeof ACADEMIC_P0_COMMON_FLOW.stages)[number];
      title: string;
      status: AcademicStepStatus;
    }>;
    prerequisiteSkillCodes: readonly AcademicSkillCode[];
  };
  nextStep: {
    area: AcademicAreaCode | "COMMON";
    skillCode: AcademicSkillCode | null;
    stage: AcademicStage | "REINFORCEMENT" | "ASSESSMENT" | "MEASUREMENT" | "NEXT_LEARNING";
    title: string;
  } | null;
};

const AREA_TITLE: Record<AcademicAreaCode, string> = {
  FAST_READING: "Hızlı Okuma",
  READING_COMPREHENSION: "Okuduğunu Anlama",
};

const STAGE_TITLE: Record<AcademicStage, string> = {
  TEACHING: "Öğretim",
  SMALL_STUDY: "Küçük çalışma",
  PRACTICE: "Uygulama",
};

const COMMON_STAGE_TITLE = {
  REINFORCEMENT: "Ortak pekiştirme",
  ASSESSMENT: "Ortak değerlendirme",
  MEASUREMENT: "Başarı ölçümü",
  NEXT_LEARNING: "Sonraki öğrenme",
} as const;

const SKILL_CODES = new Set<AcademicSkillCode>(ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes);

function stepStatus(stage: AcademicStage, skill: AcademicRuntimeSkill): AcademicStepStatus {
  if (!skill.lessonPublished) return "UNAVAILABLE";
  if (stage === "TEACHING") return skill.lessonCompleted ? "COMPLETED" : "ACTIVE";
  if (stage === "SMALL_STUDY") return skill.lessonCompleted ? "ACTIVE" : "LOCKED";
  if (skill.practiceCompleted) return "COMPLETED";
  if (!skill.hasPublishedPractice) return "UNAVAILABLE";
  return skill.lessonCompleted ? "ACTIVE" : "LOCKED";
}

function firstNextStep(
  areas: AcademicProgramResponse["areas"],
  common: AcademicProgramResponse["common"],
): AcademicProgramResponse["nextStep"] {
  for (const area of areas) {
    for (const skill of area.skills) {
      const next = skill.stages.find((stage) => stage.status === "ACTIVE");
      if (next) {
        return {
          area: area.code,
          skillCode: skill.skillCode,
          stage: next.code,
          title: `${area.title}: ${skill.title} — ${next.title}`,
        };
      }
    }
  }
  const commonNext = common.stages.find((stage) => stage.status === "ACTIVE");
  return commonNext
    ? {
        area: "COMMON",
        skillCode: null,
        stage: commonNext.code,
        title: commonNext.title,
      }
    : null;
}

export function buildAcademicProgram(
  runtimeSkills: readonly AcademicRuntimeSkill[],
  options: {
    hasPublishedCommonReinforcement?: boolean;
  } = {},
): AcademicProgramResponse {
  const skillsByCode = new Map(runtimeSkills.map((skill) => [skill.code, skill]));
  const areas = (Object.keys(AREA_TITLE) as AcademicAreaCode[]).map((areaCode) => ({
    code: areaCode,
    title: AREA_TITLE[areaCode],
    skills: ACADEMIC_P0_LESSONS.filter((lesson) => lesson.area === areaCode).map((lesson) => {
      const runtimeSkill = skillsByCode.get(lesson.skillCode);
      const skill: AcademicRuntimeSkill = runtimeSkill ?? {
        code: lesson.skillCode,
        name: lesson.title,
        hasPublishedPractice: false,
        practiceCompleted: false,
        accuracy: null,
        lessonPublished: false,
        lessonCompleted: false,
      };
      return {
        skillCode: lesson.skillCode,
        title: lesson.title,
        objective: lesson.objective,
        stages: lesson.stages.map((stage) => ({
          code: stage.stage,
          title: STAGE_TITLE[stage.stage],
          status: stepStatus(stage.stage, skill),
        })),
        accuracy: skill.accuracy,
      };
    }),
  }));

  const allPracticeComplete = runtimeSkills
    .filter((skill) => SKILL_CODES.has(skill.code as AcademicSkillCode))
    .every((skill) => skill.practiceCompleted);
  const allPracticeAvailable = ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes.every(
    (code) => skillsByCode.get(code)?.hasPublishedPractice,
  );
  const reinforcementStatus: AcademicStepStatus = allPracticeComplete
    ? allPracticeAvailable
      ? options.hasPublishedCommonReinforcement
        ? "ACTIVE"
        : "UNAVAILABLE"
      : "UNAVAILABLE"
    : "LOCKED";
  const common = {
    stages: [
      {
        code: "REINFORCEMENT" as const,
        title: COMMON_STAGE_TITLE.REINFORCEMENT,
        status: reinforcementStatus,
      },
      {
        code: "ASSESSMENT" as const,
        title: COMMON_STAGE_TITLE.ASSESSMENT,
        status: "LOCKED" as const,
      },
      {
        code: "MEASUREMENT" as const,
        title: COMMON_STAGE_TITLE.MEASUREMENT,
        status: "LOCKED" as const,
      },
      {
        code: "NEXT_LEARNING" as const,
        title: COMMON_STAGE_TITLE.NEXT_LEARNING,
        status: "LOCKED" as const,
      },
    ],
    prerequisiteSkillCodes: ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes,
  } satisfies AcademicProgramResponse["common"];

  const anyPublishedLesson = runtimeSkills.some((skill) => skill.lessonPublished);
  return {
    version: "P0",
    publicationStatus: anyPublishedLesson ? "PARTIALLY_AVAILABLE" : "AUTHORING_ONLY",
    areas,
    common,
    nextStep: firstNextStep(areas, common),
  };
}
