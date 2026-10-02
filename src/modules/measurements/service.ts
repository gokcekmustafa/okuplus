import { Prisma, type AssessmentType } from "@prisma/client";
import { withTenantContext } from "../tenant/index.js";
import { assertStudentActor, type StudentActor } from "../student-learning/policy.js";
import { selectCanonicalPlacementAssessment } from "../assessments/canonical-selector.js";

const SKILL_LABELS: Record<string, string> = {
  FAST_ATTENTION: "Dikkati yönlendirme",
  FAST_RECOGNITION: "Kelime ve ifade tanıma",
  FAST_CHUNKING: "Anlamlı gruplama",
  RC_MAIN_IDEA: "Ana fikir",
  RC_DETAIL: "Ayrıntıyı bulma",
  RC_INFERENCE: "Çıkarım yapma",
};

const SKILL_ORDER = Object.keys(SKILL_LABELS);

export type MeasurementSource = "OFFICIAL_PLACEMENT" | "DEVELOPMENT_MEASUREMENT" | "LEARNING_PATH";

export type MeasurementSkillResult = {
  skillCode: string;
  label: string;
  score: number | null;
  scoredCount: number;
};

export type MeasurementHistoryItem = {
  id: string;
  assessmentId: string;
  title: string;
  type: AssessmentType;
  source: MeasurementSource;
  score: number | null;
  completedAt: Date;
  level: { code: string; name: string } | null;
  skillResults: MeasurementSkillResult[];
};

export type StudentMeasurementDashboard = {
  baseline: {
    status: "MEASURED" | "REVIEW_REQUIRED" | "NOT_AVAILABLE";
    assessmentId: string | null;
    title: string | null;
    level: { code: string; name: string } | null;
    measuredAt: Date | null;
    skillResults: MeasurementSkillResult[];
  };
  lastMeasurement: MeasurementHistoryItem | null;
  development: {
    available: boolean;
    measurementCount: number;
    from: { score: number; completedAt: Date; title: string } | null;
    to: { score: number; completedAt: Date; title: string } | null;
    scoreChange: number | null;
  };
  skillResults: {
    measuredAt: Date;
    source: MeasurementSource;
    sourceTitle: string;
    items: MeasurementSkillResult[];
  } | null;
  availableMeasurements: Array<{
    id: string;
    title: string;
    type: AssessmentType;
    source: Exclude<MeasurementSource, "LEARNING_PATH">;
    levelName: string | null;
    questionCount: number;
    hasInProgressSession: boolean;
    inProgressSessionId: string | null;
    hasResult: boolean;
    status: "PUBLISHED";
    sessionStatus: string | null;
    attemptedCount: number;
    score: number | null;
    completedAt: Date | null;
    resultLevelName: string | null;
  }>;
  history: MeasurementHistoryItem[];
  learningPathAssessments: MeasurementHistoryItem[];
};

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(0, value) : 0;
}

function skillResult(skillCode: string, value: unknown): MeasurementSkillResult | null {
  const item = objectValue(value);
  if (!item || !("score" in item || "scoredCount" in item)) return null;
  return {
    skillCode,
    label: SKILL_LABELS[skillCode] ?? "Beceri",
    score: finiteScore(item.score),
    scoredCount: nonNegativeInteger(item.scoredCount),
  };
}

/**
 * Reads only skill evidence that was already persisted by an assessment.
 * Missing values remain null; no training score or inferred value is added.
 */
export function readSkillResults(value: unknown): MeasurementSkillResult[] {
  const root = objectValue(value);
  const placement = objectValue(root?.placementScoring);
  const map =
    objectValue(placement?.skillSubscores) ??
    objectValue(root?.skillSubscores) ??
    objectValue(root?.skills);
  const fromMap = map
    ? Object.entries(map)
        .map(([skillCode, item]) => skillResult(skillCode, item))
        .filter((item): item is MeasurementSkillResult => item !== null)
    : [];
  const fromArray = Array.isArray(root?.skills)
    ? root.skills.flatMap((item) => {
        const row = objectValue(item);
        const skillCode = typeof row?.competency === "string" ? row.competency : null;
        const result = skillCode ? skillResult(skillCode, row) : null;
        return result ? [result] : [];
      })
    : [];
  const found = new Map([...fromMap, ...fromArray].map((item) => [item.skillCode, item]));
  return [...found.values()].sort((a, b) => {
    const aIndex = SKILL_ORDER.indexOf(a.skillCode);
    const bIndex = SKILL_ORDER.indexOf(b.skillCode);
    return (
      (aIndex === -1 ? SKILL_ORDER.length : aIndex) - (bIndex === -1 ? SKILL_ORDER.length : bIndex)
    );
  });
}

function sourceFor(type: AssessmentType, learningPathBound: boolean): MeasurementSource {
  if (learningPathBound) return "LEARNING_PATH";
  return type === "PLACEMENT" ? "OFFICIAL_PLACEMENT" : "DEVELOPMENT_MEASUREMENT";
}

function questionCount(config: Prisma.JsonValue | null): number {
  const value = objectValue(config)?.questionCount;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

type ResultRow = {
  id: string;
  assessmentId: string;
  score: number | null;
  metrics: Prisma.JsonValue | null;
  completedAt: Date;
  resultLevel: { code: string; name: string } | null;
  assessment: {
    id: string;
    title: string;
    type: AssessmentType;
    learningSteps: Array<{ id: string }>;
  };
};

function historyItem(row: ResultRow): MeasurementHistoryItem {
  const learningPathBound = row.assessment.learningSteps.length > 0;
  return {
    id: row.id,
    assessmentId: row.assessmentId,
    title: row.assessment.title,
    type: row.assessment.type,
    source: sourceFor(row.assessment.type, learningPathBound),
    score: finiteScore(row.score),
    completedAt: row.completedAt,
    level: row.resultLevel,
    skillResults: readSkillResults(row.metrics),
  };
}

export function buildDevelopmentComparison(
  results: MeasurementHistoryItem[],
): StudentMeasurementDashboard["development"] {
  const measured = results
    .filter((item) => item.source === "DEVELOPMENT_MEASUREMENT" && item.score !== null)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const first = measured[0] ?? null;
  const last = measured.at(-1) ?? null;
  const available = Boolean(first && last && first.id !== last.id);
  return {
    available,
    measurementCount: measured.length,
    from:
      first && available
        ? { score: first.score!, completedAt: first.completedAt, title: first.title }
        : null,
    to:
      last && available
        ? { score: last.score!, completedAt: last.completedAt, title: last.title }
        : null,
    scoreChange: first && last && available ? last.score! - first.score! : null,
  };
}

function baselineSkills(snapshot: Prisma.JsonValue | null, metrics: Prisma.JsonValue | null) {
  const snapshotSkills = readSkillResults(snapshot);
  return snapshotSkills.length > 0 ? snapshotSkills : readSkillResults(metrics);
}

export async function getStudentMeasurementDashboard(
  actor: StudentActor & { tenantId: string; platformRole: null },
): Promise<StudentMeasurementDashboard> {
  assertStudentActor(actor);
  return withTenantContext(actor, async (tx) => {
    const [assessments, results, baseline] = await Promise.all([
      tx.assessment.findMany({
        where: {
          deletedAt: null,
          status: "PUBLISHED",
          OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
        },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          deletedAt: true,
          tenantId: true,
          config: true,
          level: { select: { name: true } },
          learningSteps: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      tx.assessmentResult.findMany({
        where: {
          tenantId: actor.tenantId,
          studentId: actor.userId,
          assessment: { deletedAt: null },
        },
        select: {
          id: true,
          assessmentId: true,
          score: true,
          metrics: true,
          completedAt: true,
          resultLevel: { select: { code: true, name: true } },
          assessment: {
            select: {
              id: true,
              title: true,
              type: true,
              learningSteps: { select: { id: true } },
            },
          },
        },
        orderBy: { completedAt: "desc" },
      }),
      tx.studentBaseline.findUnique({
        where: { tenantId_studentId: { tenantId: actor.tenantId, studentId: actor.userId } },
        select: {
          sourceAssessmentResultId: true,
          snapshot: true,
          capturedAt: true,
          sourceAssessmentResult: {
            select: {
              id: true,
              score: true,
              metrics: true,
              completedAt: true,
              resultLevel: { select: { code: true, name: true } },
              assessment: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  learningSteps: { select: { id: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const resultRows = results as ResultRow[];
    const historyItems = resultRows.map(historyItem);
    const history = historyItems.filter((item) => item.source !== "LEARNING_PATH");
    const learningPathAssessments = historyItems.filter((item) => item.source === "LEARNING_PATH");
    const developmentResults = history.filter((item) => item.source === "DEVELOPMENT_MEASUREMENT");
    const lastMeasurement = history[0] ?? null;
    const latestSkills = [...history]
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      .find((item) => item.skillResults.some((skill) => skill.score !== null));

    const placementCandidates = assessments.filter((assessment) => assessment.type === "PLACEMENT");
    const canonicalPlacement = selectCanonicalPlacementAssessment(
      placementCandidates,
      actor.tenantId,
    );
    const canonicalPlacementId =
      canonicalPlacement.status === "FOUND" ? canonicalPlacement.assessment.id : null;
    const availableRows = assessments.filter((assessment) => {
      if (assessment.learningSteps.length > 0) return false;
      if (assessment.type === "PLACEMENT") return assessment.id === canonicalPlacementId;
      return true;
    });
    const assessmentIds = availableRows.map((assessment) => assessment.id);
    const sessions = assessmentIds.length
      ? await tx.exerciseSession.findMany({
          where: {
            tenantId: actor.tenantId,
            studentId: actor.userId,
            assessmentId: { in: assessmentIds },
          },
          select: {
            id: true,
            assessmentId: true,
            status: true,
            _count: { select: { attempts: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const sessionByAssessment = new Map<string, (typeof sessions)[number]>();
    for (const session of sessions) {
      if (session.assessmentId && !sessionByAssessment.has(session.assessmentId)) {
        sessionByAssessment.set(session.assessmentId, session);
      }
    }
    const resultByAssessment = new Map<string, MeasurementHistoryItem>();
    for (const item of historyItems) {
      if (!resultByAssessment.has(item.assessmentId))
        resultByAssessment.set(item.assessmentId, item);
    }

    const baselineResult = baseline?.sourceAssessmentResult
      ? historyItem(baseline.sourceAssessmentResult as ResultRow)
      : (history.find((item) => item.source === "OFFICIAL_PLACEMENT") ?? null);
    const baselineSkillResults = baseline
      ? baselineSkills(baseline.snapshot, baseline.sourceAssessmentResult?.metrics ?? null)
      : (baselineResult?.skillResults ?? []);
    const baselineStatus = baselineResult?.level
      ? "MEASURED"
      : baselineResult
        ? "REVIEW_REQUIRED"
        : "NOT_AVAILABLE";

    return {
      baseline: {
        status: baselineStatus,
        assessmentId: baselineResult?.assessmentId ?? null,
        title: baselineResult?.title ?? null,
        level: baselineResult?.level ?? null,
        measuredAt: baseline?.capturedAt ?? baselineResult?.completedAt ?? null,
        skillResults: baselineSkillResults,
      },
      lastMeasurement,
      development: buildDevelopmentComparison(developmentResults),
      skillResults: latestSkills
        ? {
            measuredAt: latestSkills.completedAt,
            source: latestSkills.source,
            sourceTitle: latestSkills.title,
            items: latestSkills.skillResults,
          }
        : null,
      availableMeasurements: availableRows.map((assessment) => {
        const session = sessionByAssessment.get(assessment.id);
        const result = resultByAssessment.get(assessment.id);
        return {
          id: assessment.id,
          title: assessment.title,
          type: assessment.type,
          source:
            assessment.type === "PLACEMENT" ? "OFFICIAL_PLACEMENT" : "DEVELOPMENT_MEASUREMENT",
          levelName: assessment.level?.name ?? null,
          questionCount: questionCount(assessment.config),
          hasInProgressSession: session?.status === "IN_PROGRESS",
          inProgressSessionId: session?.status === "IN_PROGRESS" ? session.id : null,
          hasResult: Boolean(result),
          status: "PUBLISHED" as const,
          sessionStatus: session?.status ?? null,
          attemptedCount: session?._count.attempts ?? 0,
          score: result?.score ?? null,
          completedAt: result?.completedAt ?? null,
          resultLevelName: result?.level?.name ?? null,
        };
      }),
      history,
      learningPathAssessments,
    };
  });
}
