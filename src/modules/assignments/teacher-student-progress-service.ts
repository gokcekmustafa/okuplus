import { getStudentMeasurementDashboard } from "../measurements/service.js";
import { getStudentLearningPath } from "../learning-path/service.js";
import { prisma } from "../../lib/prisma.js";
import { listTeacherRecommendations } from "./recommendation-service.js";
import {
  getTeacherStudentAssignmentHistory,
  type TeacherStudentAssignmentHistoryItem,
} from "./results-service.js";
import { assertTeacherClassAccess, type TeacherAssignmentActor } from "./teacher-service.js";

type LearningPathSnapshot = NonNullable<Awaited<ReturnType<typeof getStudentLearningPath>>>;
type LearningPathProjection = LearningPathSnapshot["paths"][number];
type MeasurementSnapshot = Awaited<ReturnType<typeof getStudentMeasurementDashboard>>;

type SkillSample = {
  score: number;
  at: Date;
  source: "ASSIGNMENT" | "MEASUREMENT";
};

export interface TeacherStudentSkillState {
  skillId: string | null;
  code: string;
  name: string;
  statusLabel: string;
  assignment: {
    latest: SkillSample | null;
    previous: SkillSample | null;
    studyCount: number;
  };
  measurement: {
    latest: SkillSample | null;
    previous: SkillSample | null;
    measurementCount: number;
  };
}

export interface TeacherStudentProgressResponse {
  student: {
    id: string;
    name: string;
    email: string | null;
    classId: string;
    className: string;
  };
  learningPath: {
    currentLevel: LearningPathProjection["currentLevel"];
    paths: Array<{
      id: string;
      title: string;
      area: string;
      currentStep: {
        id: string;
        title: string;
        type: string;
        unitTitle: string;
        status: string;
      } | null;
      completed: number;
      total: number;
      percent: number;
    }>;
  } | null;
  measurement: Pick<
    MeasurementSnapshot,
    "baseline" | "lastMeasurement" | "development" | "history"
  >;
  assignments: TeacherStudentAssignmentHistoryItem[];
  skills: TeacherStudentSkillState[];
  recommendations: Awaited<ReturnType<typeof listTeacherRecommendations>>["items"];
}

function learningPathProjection(projection: LearningPathProjection) {
  const current = projection.nodes.find((node) => node.status === "active") ?? null;
  return {
    id: projection.path.id,
    title: projection.path.title,
    area: projection.path.area,
    currentStep: current
      ? {
          id: current.id,
          title: current.label,
          type: current.type,
          unitTitle: current.unit.title,
          status: current.status,
        }
      : null,
    completed: projection.overallProgress.completed,
    total: projection.overallProgress.total,
    percent: projection.overallProgress.percent,
  };
}

function addSkillSample(
  skills: Map<string, { skillId: string | null; name: string; samples: SkillSample[] }>,
  code: string,
  name: string,
  sample: SkillSample,
  skillId: string | null = null,
) {
  const current = skills.get(code) ?? { skillId, name, samples: [] };
  if (!current.skillId && skillId) current.skillId = skillId;
  if (current.name === "Beceri" && name) current.name = name;
  current.samples.push(sample);
  skills.set(code, current);
}

function latestTwo(samples: SkillSample[], source: SkillSample["source"]) {
  const filtered = samples
    .filter((sample) => sample.source === source)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return {
    latest: filtered.at(-1) ?? null,
    previous: filtered.at(-2) ?? null,
    count: filtered.length,
  };
}

function buildSkillStates(
  assignments: TeacherStudentAssignmentHistoryItem[],
  measurement: MeasurementSnapshot,
  recommendations: TeacherStudentProgressResponse["recommendations"],
): TeacherStudentSkillState[] {
  const skills = new Map<
    string,
    { skillId: string | null; name: string; samples: SkillSample[] }
  >();
  for (const assignment of assignments) {
    for (const session of assignment.history) {
      if (session.status !== "COMPLETED") continue;
      for (const skill of session.skills) {
        if (skill.percentage === null) continue;
        addSkillSample(
          skills,
          skill.code,
          skill.name,
          {
            score: skill.percentage,
            at: session.completedAt ?? session.startedAt,
            source: "ASSIGNMENT",
          },
          skill.skillId,
        );
      }
    }
  }
  for (const item of measurement.history) {
    for (const skill of item.skillResults) {
      if (skill.score === null) continue;
      addSkillSample(skills, skill.skillCode, skill.label, {
        score: Math.round(skill.score * 1000) / 10,
        at: item.completedAt,
        source: "MEASUREMENT",
      });
    }
  }

  const recommendationCodes = new Set(recommendations.map((item) => item.skill.code));
  return [...skills.entries()]
    .map(([code, value]) => {
      const assignment = latestTwo(value.samples, "ASSIGNMENT");
      const measurementResult = latestTwo(value.samples, "MEASUREMENT");
      return {
        skillId: value.skillId,
        code,
        name: value.name,
        statusLabel: recommendationCodes.has(code)
          ? "Ek çalışma öneriliyor"
          : assignment.latest
            ? "Ödev sonucu var"
            : measurementResult.latest
              ? "Ölçüm sonucu var"
              : "Veri yok",
        assignment: {
          latest: assignment.latest,
          previous: assignment.previous,
          studyCount: assignment.count,
        },
        measurement: {
          latest: measurementResult.latest,
          previous: measurementResult.previous,
          measurementCount: measurementResult.count,
        },
      } satisfies TeacherStudentSkillState;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeacherStudentProgress(
  actor: TeacherAssignmentActor,
  classId: string,
  studentId: string,
): Promise<TeacherStudentProgressResponse> {
  const cls = await assertTeacherClassAccess(actor, classId, studentId);
  const studentActor = { userId: studentId, tenantId: cls.tenantId, platformRole: null } as const;

  const [classes, learningPath, measurement, assignments, recommendationPayload] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { displayName: true, email: true },
      }),
      getStudentLearningPath(studentActor),
      getStudentMeasurementDashboard(studentActor),
      getTeacherStudentAssignmentHistory(actor, classId, studentId),
      listTeacherRecommendations(actor, { classId, studentId, status: "PENDING" }),
    ]);
  if (!classes) throw new Error("Yetkili öğrenci bulunamadı");

  return {
    student: {
      id: studentId,
      name: classes.displayName,
      email: classes.email,
      classId,
      className: cls.name,
    },
    learningPath: learningPath
      ? {
          currentLevel: learningPath.currentLevel ?? null,
          paths: learningPath.paths.map(learningPathProjection),
        }
      : null,
    measurement: {
      baseline: measurement.baseline,
      lastMeasurement: measurement.lastMeasurement,
      development: measurement.development,
      history: measurement.history,
    },
    assignments,
    skills: buildSkillStates(assignments, measurement, recommendationPayload.items),
    recommendations: recommendationPayload.items,
  };
}
