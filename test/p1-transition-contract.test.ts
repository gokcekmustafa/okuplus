import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("P1 transition foundation contracts", () => {
  it("keeps the migration additive and protects the single active route invariant", async () => {
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261008100000_add_adaptive_learning_path_routing/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|TYPE|COLUMN|INDEX)\b/iu);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "routeStatus"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "measurementResultId"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "StudentLearningPath_one_active_route_idx"',
    );
    expect(migration).toContain("WHERE \"routeStatus\" = 'ACTIVE'");
  });

  it("keeps P1 selection separate from generic P0 completion", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );
    const learningPath = await readFile(
      new URL("../src/modules/learning-path/service.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("reconcileP0ToP1");
    expect(transition).toContain("withTenantContext");
    expect(transition).toContain('routeStatus: "REASSIGNED"');
    expect(transition).toContain("assertTeacherClassAccess");
    expect(transition).not.toContain("completeLearningStep(");
    expect(learningPath).toContain('const P1_PATH_PREFIX = "EDUCATION_V2_P1_"');
    expect(learningPath).toContain('routeStatus: { in: ["ACTIVE", "COMPLETED", "PAUSED"] }');
  });

  it("reconciles P1 only after the student completes a P0 terminal step", async () => {
    const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

    expect(app).toContain('"/student/learning-path/p1/reconcile"');
    expect(app).toContain('startsWith("EDUCATION_V2_P0_")');
    expect(app).toContain("p0LearningPathId: node.learningPathId");
  });

  it("reads P0 completion without writing P0 progress", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain('const P0_PATH_PREFIX = "EDUCATION_V2_P0_"');
    expect(transition).toContain("tx.studentLearningStepProgress.findMany");
    expect(transition).toContain("learningPath: { code: { startsWith: P1_PATH_PREFIX } }");
    expect(transition).not.toContain("tx.studentLearningStepProgress.update");
    expect(transition).not.toContain("tx.studentLearningStepProgress.delete");
  });

  it("pins candidate versions and rejects candidates outside the published level scope", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("version: true");
    expect(transition).toContain('status: "PUBLISHED"');
    expect(transition).toContain("levelId: null");
    expect(transition).toContain("{ levelId }");
  });

  it("makes duplicate assignment idempotent", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("studentLearningPath.findUnique");
    expect(transition).toContain("studentLearningPath.upsert");
    expect(transition).toContain('outcome: "ALREADY_ASSIGNED"');
  });

  it("records teacher override audit data without changing measurement data", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("recommendedPathId");
    expect(transition).toContain("measurementResultId");
    expect(transition).toContain("selectionPolicyVersion");
    expect(transition).toContain("overrideByUserId: actor.userId");
    expect(transition).toContain("overrideAt: now");
    expect(transition).toContain("overrideReason: input.reason");
    expect(transition).not.toContain("assessmentResult.update");
  });

  it("uses class authorization and explicit tenant/student predicates for override", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain(
      "assertTeacherClassAccess(actor, input.classId, input.studentId, tx)",
    );
    expect(transition).toContain("tenantId,");
    expect(transition).toContain("studentId: input.studentId");
    expect(transition).toContain("withTenantContext(actor");
  });

  it("preserves the original P0 enrollment while creating a distinct P1 enrollment", async () => {
    const transition = await readFile(
      new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
      "utf8",
    );

    expect(transition).toContain("learningPathId: selection.recommendedPathId");
    expect(transition).toContain("recommendedPathId: selection.recommendedPathId");
    expect(transition).toContain("P0_PATH_PREFIX");
    expect(transition).toContain("P1_PATH_PREFIX");
  });

  it("handles the unique active-route race without creating a second active route", async () => {
    const [transition, migration] = await Promise.all([
      readFile(
        new URL("../src/modules/student-learning/p1-transition.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../prisma/migrations/20261008100000_add_adaptive_learning_path_routing/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(transition).toContain('error.code === "P2002"');
    expect(transition).toContain('data: { routeStatus: "REASSIGNED" }');
    expect(migration).toContain("WHERE \"routeStatus\" = 'ACTIVE'");
  });
});
