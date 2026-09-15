import { Prisma, type PlatformRole } from "@prisma/client";
import { compareBaselineToCurrent, type DevelopmentBaselineSkill } from "../development/compare.js";
import { withTenantContext } from "../tenant/index.js";
import { TRAINING_SKILL_PRESENTATION } from "../training/performance.js";

export type BaselineActor = {
  userId: string;
  tenantId: string | null;
  platformRole: PlatformRole | null;
};

export type BaselineSnapshot = {
  version: 1;
  source: "PLACEMENT";
  skills: DevelopmentBaselineSkill[];
};

export function buildPlacementBaselineSkills(skillSubscores: unknown): DevelopmentBaselineSkill[] {
  return TRAINING_SKILL_PRESENTATION.map((definition) => {
    const raw =
      skillSubscores && typeof skillSubscores === "object"
        ? (skillSubscores as Record<string, unknown>)[definition.competency]
        : null;
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    return {
      competency: definition.competency,
      score: typeof item?.score === "number" && Number.isFinite(item.score) ? item.score : null,
      scoredCount:
        typeof item?.scoredCount === "number" && Number.isInteger(item.scoredCount)
          ? Math.max(0, item.scoredCount)
          : 0,
    };
  });
}

const BASELINE_SELECT = {
  id: true,
  sourceAssessmentResultId: true,
  snapshot: true,
  capturedAt: true,
  createdAt: true,
} satisfies Prisma.StudentBaselineSelect;

function studentActor(actor: BaselineActor): asserts actor is BaselineActor & { tenantId: string } {
  if (!actor.tenantId || actor.platformRole !== null) {
    throw new Error("Bu uç yalnızca öğrencilere açıktır");
  }
}

function readSnapshot(value: Prisma.JsonValue): BaselineSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 1, source: "PLACEMENT", skills: [] };
  }
  const raw = value as { version?: unknown; source?: unknown; skills?: unknown };
  const skills = Array.isArray(raw.skills)
    ? raw.skills.flatMap((skill) => {
        if (!skill || typeof skill !== "object" || Array.isArray(skill)) return [];
        const item = skill as Record<string, unknown>;
        const competency = typeof item.competency === "string" ? item.competency : null;
        const score =
          typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null;
        const scoredCount =
          typeof item.scoredCount === "number" && Number.isInteger(item.scoredCount)
            ? Math.max(0, item.scoredCount)
            : 0;
        return competency ? [{ competency, score, scoredCount }] : [];
      })
    : [];
  return { version: raw.version === 1 ? 1 : 1, source: "PLACEMENT", skills };
}

export async function getStudentBaseline(actor: BaselineActor) {
  studentActor(actor);
  const row = await withTenantContext(actor, (tx) =>
    tx.studentBaseline.findUnique({
      where: { tenantId_studentId: { tenantId: actor.tenantId, studentId: actor.userId } },
      select: BASELINE_SELECT,
    }),
  );
  if (!row) return null;
  const snapshot = readSnapshot(row.snapshot);
  return {
    id: row.id,
    sourceAssessmentResultId: row.sourceAssessmentResultId,
    source: snapshot.source,
    version: snapshot.version,
    capturedAt: row.capturedAt,
    skills: snapshot.skills,
  };
}

export async function capturePlacementBaseline(input: {
  tenantId: string;
  studentId: string;
  assessmentResultId: string;
  skillSubscores: unknown;
}) {
  const skills = buildPlacementBaselineSkills(input.skillSubscores);
  try {
    return await withTenantContext(
      { userId: input.studentId, tenantId: input.tenantId, platformRole: null },
      (tx) =>
        tx.studentBaseline.create({
          data: {
            tenantId: input.tenantId,
            studentId: input.studentId,
            sourceAssessmentResultId: input.assessmentResultId,
            snapshot: { version: 1, source: "PLACEMENT", skills },
          },
          select: BASELINE_SELECT,
        }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return getStudentBaseline({
        userId: input.studentId,
        tenantId: input.tenantId,
        platformRole: null,
      });
    }
    throw error;
  }
}

export async function getBaselineDevelopment(
  actor: BaselineActor,
  current: Parameters<typeof compareBaselineToCurrent>[1],
) {
  const baseline = await getStudentBaseline(actor);
  return {
    baseline,
    development: compareBaselineToCurrent(baseline?.skills ?? null, current),
  };
}
