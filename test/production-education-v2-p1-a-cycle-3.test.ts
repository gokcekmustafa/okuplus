import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EDUCATION_V2_P1_A_CYCLE_3_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_3_STATUS,
} from "../src/curriculum/education-v2-p1-a-cycle-3-program.js";
import { learningRouteCycle } from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-3.yml", import.meta.url),
  "utf8",
);
const seeder = readFileSync(
  new URL("../scripts/seed-education-v2-p1-a-cycle-3.ts", import.meta.url),
  "utf8",
);

describe("protected Cycle 3 production provision", () => {
  it("uses only the authored seven-step Cycle 3 package and its versioned release IDs", () => {
    const steps = EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units.flatMap((unit) => unit.steps);
    expect(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.units).toHaveLength(2);
    expect(steps).toHaveLength(7);
    expect(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.content).toHaveLength(7);
    expect(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.exercises).toHaveLength(5);
    expect(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.assessments).toHaveLength(1);
    expect(seeder).toContain("EDUCATION_V2_P1_A_CYCLE_3_PROGRAM");
    expect(seeder).toContain("p1ACycle3ContentVersionId");
    expect(seeder).toContain("p1ACycle3TemplateVersionId");
    expect(seeder).not.toContain("CYCLE_V2");
    expect(seeder).not.toContain("p1ACycleV2");
  });

  it("is manually triggered on master, production-environment scoped, and read-only by default", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain(
      "EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
    );
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-3.ts --dry-run");
    expect(workflow).not.toContain("prisma migrate");
    expect(workflow).not.toContain("scripts/seed-education-v2-p1-a-cycle-v2.ts");
    expect(workflow).toContain("PREVIOUS_40_STATIONS=NOT_TOUCHED");
    expect(workflow).toContain("STUDENT_ASSIGNMENTS_AND_PROGRESS=NOT_TOUCHED");
  });

  it("requires exact release, product-owner, production-fingerprint, and backup gates for APPLY", () => {
    expect(workflow).toContain("d171073d1418cf835fc074ff337368d99884400a");
    expect(workflow).toContain("git merge-base --is-ancestor");
    expect(workflow).toContain("approved_content_sha");
    expect(workflow).toContain("current_content_sha");
    expect(workflow).toContain("APPLY_EDUCATION_V2_P1_A_CYCLE_3");
    expect(workflow).toContain(
      "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLE_3_PRODUCTION_EDITORIAL_RELEASE_D171073D1418CF835FC074FF337368D99884400A",
    );
    expect(workflow).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/production-migration-forensics.ts");
    expect(workflow).toContain("scripts/verify-canonical-placement-migration-policy.ts");
    expect(seeder).toContain("production APPLY yalnızca korumalı master workflow");
    expect(seeder).toContain("APPROVED_CONTENT_RELEASE_COMMIT");
    expect(seeder).toContain("PRODUCTION_APPROVAL_ENV");
    expect(seeder).toContain("PRODUCTION_BACKUP_CONFIRMATION_ENV");
  });

  it("applies only a complete missing graph and refuses partial/conflicting records", () => {
    expect(seeder).toContain('Promise<"MISSING" | "EXISTING" | "CONFLICT">');
    expect(seeder).toContain('if (existingCount === 0) return "MISSING"');
    expect(seeder).toContain('return graphIsPublished ? "EXISTING" : "CONFLICT"');
    expect(seeder).toContain("Cycle 3 stable graph kısmi veya uyumsuz; overwrite yapılmayacak");
    expect(seeder).toContain('if (dryRun || state === "EXISTING")');
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-3.ts --apply");
    expect(workflow).toContain('report.state !== "EXISTING"');
    expect(workflow).toContain("CYCLE3_GRAPH_POSTCONDITION=EXISTING");
  });

  it("does not open Cycle 3 assignment eligibility as a side effect of graph provisioning", () => {
    const cycle = learningRouteCycle(EDUCATION_V2_P1_A_CYCLE_3_PROGRAM.path.code);
    expect(EDUCATION_V2_P1_A_CYCLE_3_STATUS).toBe("OWNER_RELEASE_REQUIRED");
    expect(cycle?.publicationApproved()).toBe(false);
    expect(workflow).toContain("STUDENT_ASSIGNMENTS_AND_PROGRESS=NOT_TOUCHED");
    expect(seeder).not.toContain("studentLearningPath");
    expect(seeder).not.toContain("studentLearningStep");
    expect(seeder).toContain("EDUCATION_V2_P1_A_CYCLE_3_ID");
  });
});
