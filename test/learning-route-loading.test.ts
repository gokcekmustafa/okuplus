import { describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../src/modules/tenant/index.js", () => ({ withTenantContext: context.run }));
import { getStudentLearningPath } from "../src/modules/learning-path/service.js";

describe("long route evidence loading", () => {
  it("reads 250 synthetic historical/active stations with one evidence query per table", async () => {
    const actor = { tenantId: "tenant-capacity", userId: "student-capacity", platformRole: null };
    const rows = Array.from({ length: 250 }, (_, index) => ({
      id: `path-${index}`,
      code: `EDUCATION_V2_P1_A_CAPACITY_${index}`,
      version: 1,
      levelId: null,
      tenantId: null,
      title: "Sentetik kapasite örneği",
      area: "READING_COMPREHENSION",
      enrollments: [
        { id: `enrollment-${index}`, routeStatus: index < 249 ? "COMPLETED" : "ACTIVE" },
      ],
      units: [
        {
          id: `unit-${index}`,
          code: `UNIT_${index}`,
          title: "Örnek",
          position: 1,
          status: "PUBLISHED",
          steps: [
            {
              id: `step-${index}`,
              stableKey: `SYNTHETIC_${index}`,
              type: "TEACHING",
              position: 1,
              source: "SYSTEM_DRIVEN",
              title: "Sentetik istasyon",
              status: "PUBLISHED",
              isActive: true,
              prerequisiteStepId: null,
              completionRule: {},
              minimumLevel: null,
              maximumLevel: null,
              contentVersionId: `content-${index}`,
              exerciseTemplateVersionId: null,
              assessmentId: null,
              contentVersion: {
                status: "PUBLISHED",
                content: { status: "PUBLISHED", deletedAt: null },
              },
              exerciseTemplateVersion: null,
              assessment: null,
            },
          ],
        },
      ],
    }));
    const tx = {
      learningPath: { findMany: vi.fn(async () => rows) },
      studentProfile: { findUnique: vi.fn(async () => null) },
      studentLearningStepProgress: {
        findMany: vi.fn(async (args) =>
          rows
            .slice(0, 249)
            .map((row, index) =>
              args.select.learningStep
                ? { status: "COMPLETED", learningStep: { unit: { pathId: row.id } } }
                : { learningStepId: `step-${index}`, status: "COMPLETED", completedAt: null },
            ),
        ),
      },
      exerciseSession: {
        findMany: vi.fn(async (_args: { where: { tenantId: string; studentId: string } }) => []),
      },
      studentLessonProgress: {
        groupBy: vi.fn(async (_args: { where: { tenantId: string; studentId: string } }) => []),
      },
      assessmentResult: { findMany: vi.fn(async () => []) },
    };
    context.run.mockImplementation(async (_actor, callback) => callback(tx));
    const result = await getStudentLearningPath(actor);
    expect(result?.paths).toHaveLength(250);
    expect(
      result?.paths
        .flatMap((path) => path.nodes)
        .filter((node) => node.status === "active")
        .map((node) => node.id),
    ).toEqual(["step-249"]);
    expect(result?.routeProgress).toEqual({ completed: 249, total: 250, percent: 99 });
    expect(tx.studentProfile.findUnique).toHaveBeenCalledOnce();
    expect(tx.studentLearningStepProgress.findMany).toHaveBeenCalledTimes(2);
    expect(tx.exerciseSession.findMany).toHaveBeenCalledOnce();
    expect(tx.studentLessonProgress.groupBy).toHaveBeenCalledOnce();
    expect(tx.assessmentResult.findMany).not.toHaveBeenCalled();
    const evidenceQueries = [
      tx.exerciseSession.findMany,
      tx.studentLessonProgress.groupBy,
      tx.studentLearningStepProgress.findMany,
    ];
    for (const query of evidenceQueries)
      for (const [args] of query.mock.calls) {
        expect(args.where).toMatchObject({ tenantId: actor.tenantId, studentId: actor.userId });
      }
  });
});
