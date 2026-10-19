import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAST_READING_RENDERERS } from "../src/modules/training/exercise-contract.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
  p1ACycle4QuestionVersionId,
} from "../src/curriculum/education-v2-p1-a-cycle-4-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_EXPLICIT_PUBLICATION_APPROVED,
  EDUCATION_V2_P1_A_CYCLE_4_STATUS,
  isEducationV2P1ACycle4ProductionAssignmentEnabled,
} from "../src/curriculum/education-v2-p1-a-cycle-4-release.js";
import { learningRouteCycle } from "../src/curriculum/learning-route-catalog.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-education-v2-p1-a-cycle-4.yml", import.meta.url),
  "utf8",
);
const seeder = readFileSync(
  new URL("../scripts/seed-education-v2-p1-a-cycle-4.ts", import.meta.url),
  "utf8",
);

describe("P1-A Cycle 4 authored program", () => {
  it("maps the five existing draft stations to a complete, ordered path", () => {
    const { content, exercises, path } = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM;
    const steps = path.units.flatMap((unit) => unit.steps);

    expect(EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sequence).toBe(4);
    expect(EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations).toHaveLength(5);
    expect(path.code).toBe("EDUCATION_V2_P1_A_MEANING_STRUCTURE_CYCLE_4_G8_12");
    expect(steps).toHaveLength(5);
    expect(content).toHaveLength(5);
    expect(exercises).toHaveLength(5);
    expect(exercises.reduce((count, exercise) => count + exercise.questions.length, 0)).toBe(15);

    for (const [
      index,
      station,
    ] of EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE.sourceStations.entries()) {
      const contentRecord = content[index];
      const exercise = exercises[index];
      const step = steps[index];
      expect(contentRecord?.key).toBe(station.key);
      expect(contentRecord?.body).toBe(station.text);
      expect(exercise?.contentKey).toBe(station.key);
      expect(step?.key).toBe(station.key);
      expect(step?.prerequisiteStepKeys).toEqual(index === 0 ? undefined : [steps[index - 1]?.key]);
      expect(station.contentOrigin).toBe("ORIGINAL_AUTHORING");
      expect(station.provenanceStatus).toBe("REVIEW_REQUIRED");
      for (const question of station.questions) {
        expect(p1ACycle4QuestionVersionId(station.key, question.key)).toContain("-v4");
        expect(exercise?.questions.some((mapped) => mapped.key === question.key)).toBe(true);
        expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
      }
    }
    expect(steps.at(-1)?.type).toBe("ASSESSMENT");
    expect(EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.assessments).toHaveLength(1);
  });

  it("uses runtime renderers and deterministic choice scoring for each skill family", () => {
    const exercises = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.exercises;
    expect(exercises).toHaveLength(5);
    for (const exercise of exercises) {
      const contract = exercise.contract;
      const expectedRenderer =
        contract.family === "ATTENTION_BURST"
          ? FAST_READING_RENDERERS.ATTENTION_BURST
          : contract.family === "RAPID_RECOGNITION"
            ? FAST_READING_RENDERERS.RAPID_RECOGNITION
            : contract.family === "PHRASE_CHUNKING"
              ? FAST_READING_RENDERERS.PHRASE_CHUNKING
              : "QUESTION_MULTIPLE_CHOICE";
      expect(contract.rendererKey).toBe(expectedRenderer);
      expect(contract.scoring.mode).toBe("DETERMINISTIC");
      expect(contract.interactionType).toBe("MULTIPLE_CHOICE");
    }
  });

  it("keeps production provisioning manual, fingerprinted, idempotent, and limited to Cycle 4", () => {
    const cycle = learningRouteCycle(EDUCATION_V2_P1_A_CYCLE_4_PROGRAM.path.code);
    expect(EDUCATION_V2_P1_A_CYCLE_4_STATUS).toBe("PUBLISHED");
    expect(EDUCATION_V2_P1_A_CYCLE_4_EXPLICIT_PUBLICATION_APPROVED).toBe(true);
    expect(isEducationV2P1ACycle4ProductionAssignmentEnabled()).toBe(true);
    expect(cycle?.publicationApproved()).toBe(true);

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: PLAN_ONLY");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("${{ secrets.PRODUCTION_DATABASE_URL }}");
    expect(workflow).toContain("scripts/db-fingerprint.ts");
    expect(workflow).toContain("scripts/production-migration-forensics.ts");
    expect(workflow).toContain("scripts/verify-canonical-placement-migration-policy.ts");
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-4.ts --dry-run");
    expect(workflow).toContain("scripts/seed-education-v2-p1-a-cycle-4.ts --apply");
    expect(workflow).toContain("PREVIOUS_47_STATIONS=NOT_TOUCHED");
    expect(workflow).toContain("STUDENT_ASSIGNMENTS_AND_PROGRESS=NOT_TOUCHED");
    expect(workflow).toContain("I_HAVE_VERIFIED_PRODUCTION_BACKUP_AND_ROLLBACK");
    expect(workflow).toContain("f0166391faa1cfef4857097ad0deb127668bbda2");
    expect(workflow).toContain(
      "I_HAVE_REVIEWED_EDUCATION_V2_P1_A_CYCLE_4_PRODUCTION_EDITORIAL_RELEASE_F0166391FAA1CFEF4857097AD0DEB127668BBDA2",
    );
    expect(workflow).not.toContain("Cycle 3");
    expect(workflow).not.toContain("prisma migrate");

    expect(seeder).toContain('Promise<"MISSING" | "EXISTING" | "CONFLICT">');
    expect(seeder).toContain('if (dryRun || state === "EXISTING")');
    expect(seeder).toContain("production APPLY yalnızca korumalı master workflow");
    expect(seeder).toContain("contentOrigin: plan.sourceStation.contentOrigin");
    expect(seeder).toContain("provenanceStatus: plan.sourceStation.provenanceStatus");
    expect(seeder).toContain('routeFamily: "P1-A-CYCLE-4"');
    expect(seeder).toContain("stableKey: `EDU-V2-P1-A-CYCLE-4-");
    expect(seeder).toContain("sourceReference: plan.sourceStation.sourceReference");
    expect(seeder).not.toContain("studentLearningPath");
    expect(seeder).not.toContain("studentLearningStep");
  });
});
