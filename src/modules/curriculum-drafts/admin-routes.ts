import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import type { AuthProvider } from "../auth/index.js";
import { EDUCATION_V2_P1_800_DRAFT_CYCLES } from "../../curriculum/education-v2-p1-800-draft-cycles.js";
import { summarizeLearningRouteCoverage } from "../../curriculum/learning-route-catalog.js";
import { assessMultipleChoicePackageQuality } from "../../curriculum/option-length-quality.js";

const querySchema = z.object({
  routeFamily: z.enum(["A", "B", "C", "D"]).optional(),
  sequence: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().trim().max(120).optional(),
});

const routeFamilies = ["A", "B", "C", "D"] as const;

function normalizedSourcePage(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return `${parsed.hostname.replace(/^www\./u, "").toLowerCase()}${parsed.pathname.replace(/\/$/u, "")}`;
  } catch {
    return null;
  }
}

const sourcePageUseCounts = new Map<string, number>();
for (const cycle of EDUCATION_V2_P1_800_DRAFT_CYCLES) {
  for (const station of cycle.sourceStations) {
    const sourcePage = normalizedSourcePage(station.sourceEvidence?.url);
    if (sourcePage)
      sourcePageUseCounts.set(sourcePage, (sourcePageUseCounts.get(sourcePage) ?? 0) + 1);
  }
}

function sourcePageUseCount(
  station: (typeof EDUCATION_V2_P1_800_DRAFT_CYCLES)[number]["sourceStations"][number],
): number {
  const sourcePage = normalizedSourcePage(station.sourceEvidence?.url);
  return sourcePage ? (sourcePageUseCounts.get(sourcePage) ?? 0) : 0;
}

function setPrivateNoStore(reply: { header(name: string, value: string): unknown }): void {
  reply.header("Cache-Control", "private, no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.header("Vary", "Authorization, Cookie");
}

function sourceTitle(
  station: (typeof EDUCATION_V2_P1_800_DRAFT_CYCLES)[number]["sourceStations"][number],
) {
  return station.sourceEvidence?.title ?? station.sourceReference;
}

function questionQualitySummary(cycle: (typeof EDUCATION_V2_P1_800_DRAFT_CYCLES)[number]) {
  const report = assessMultipleChoicePackageQuality(
    cycle.sourceStations.flatMap((station) =>
      station.questions.map((question) => ({
        key: question.key,
        prompt: question.prompt,
        options: question.options,
        correctOptionId: question.correctOptionId,
      })),
    ),
  );
  return {
    questionCount: report.questionCount,
    correctPositionCounts: report.correctPositionCounts,
    correctUniqueLongestCount: report.correctUniqueLongestCount,
    correctUniqueShortestCount: report.correctUniqueShortestCount,
    clearLengthOutlierCount: report.clearLengthOutlierCount,
  };
}

/**
 * Read-only preview of unreleased curriculum drafts. Correct answers are
 * intentionally available only to SUPER_ADMIN and never enter learner APIs.
 */
export async function curriculumDraftAdminRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const superAdminOnly = [requireAuth(opts.authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/admin/curriculum-drafts", { preHandler: superAdminOnly }, async (request, reply) => {
    setPrivateNoStore(reply);
    const query = querySchema.parse(request.query);
    const search = query.search?.toLocaleLowerCase("tr-TR");
    const cycles = EDUCATION_V2_P1_800_DRAFT_CYCLES.filter(
      (cycle) =>
        (!query.routeFamily || cycle.routeFamily === query.routeFamily) &&
        (!query.sequence || cycle.sequence === query.sequence),
    ).map((cycle) => ({
      routeFamily: cycle.routeFamily,
      sequence: cycle.sequence,
      pathCode: cycle.pathCode,
      title: cycle.title,
      authoringStatus: cycle.authoringStatus,
      publicationApproved: cycle.publicationApproved(),
      stationCount: cycle.sourceStations.length,
      questionQuality: questionQualitySummary(cycle),
      stations: cycle.sourceStations.map((station) => ({
        key: station.key,
        title: station.title,
        category: station.category,
        skillCodes: station.skillCodes,
        difficulty: station.difficulty,
        provenanceStatus: station.provenanceStatus,
        sourceTitle: sourceTitle(station),
        sourcePageUseCount: sourcePageUseCount(station),
      })),
    }));
    const filteredCycles = search
      ? cycles
          .map((cycle) => ({
            ...cycle,
            stations: cycle.stations.filter((station) =>
              [
                station.key,
                station.title,
                station.category,
                station.sourceTitle,
                ...station.skillCodes,
              ]
                .join(" ")
                .toLocaleLowerCase("tr-TR")
                .includes(search),
            ),
          }))
          .filter((cycle) => cycle.stations.length > 0)
      : cycles;

    const coverage = summarizeLearningRouteCoverage().map((item) => ({
      routeFamily: item.routeFamily,
      authoredStationCount: item.authoredStationCount,
      releaseApprovedSourceCount: item.releasedSourceStationCount,
      sourceVerifiedDraftCount: item.sourceVerifiedDraftStationCount,
      sourceReviewRequiredCount: item.authoredSourceReviewRequiredStationCount,
      sourceQualifiedCount: item.sourceQualifiedStationCount,
      sourceQualifiedRemaining: item.sourceQualifiedRemainingStations,
      categoryCounts: item.categoryCounts,
      categoryTargetGaps: item.categoryTargetGaps,
      categoryTargetExcesses: item.categoryTargetExcesses,
      unclassifiedStationCount: item.unclassifiedStationCount,
      productionGraph: item.productionGraph,
    }));

    return ok({
      routeFamilies,
      cycles: filteredCycles,
      totalStations: filteredCycles.reduce((total, cycle) => total + cycle.stations.length, 0),
      coverage,
    });
  });

  app.get(
    "/admin/curriculum-drafts/:routeFamily/:sequence/:stationKey",
    { preHandler: superAdminOnly },
    async (request, reply) => {
      setPrivateNoStore(reply);
      const params = request.params as {
        routeFamily?: string;
        sequence?: string;
        stationKey?: string;
      };
      const routeFamily = z.enum(routeFamilies).parse(params.routeFamily);
      const sequence = z.coerce.number().int().min(1).max(1000).parse(params.sequence);
      const stationKey = params.stationKey;
      const cycle = EDUCATION_V2_P1_800_DRAFT_CYCLES.find(
        (candidate) => candidate.routeFamily === routeFamily && candidate.sequence === sequence,
      );
      const station = cycle?.sourceStations.find((candidate) => candidate.key === stationKey);
      if (!cycle || !station) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Taslak istasyon bulunamadı" },
        });
      }

      return ok({
        cycle: {
          routeFamily: cycle.routeFamily,
          sequence: cycle.sequence,
          pathCode: cycle.pathCode,
          title: cycle.title,
          authoringStatus: cycle.authoringStatus,
          publicationApproved: cycle.publicationApproved(),
          questionQuality: questionQualitySummary(cycle),
        },
        station: {
          ...station,
          sourceTitle: sourceTitle(station),
          sourcePageUseCount: sourcePageUseCount(station),
          questions: station.questions.map((question) => ({
            ...question,
            correctOption: question.options.find((option) => option.id === question.correctOptionId)
              ?.text,
          })),
        },
      });
    },
  );
}
