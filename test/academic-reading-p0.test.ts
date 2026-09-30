import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ACADEMIC_P0_COMMON_FLOW,
  ACADEMIC_P0_GUIDED_SKILL_ORDER,
  ACADEMIC_P0_LESSONS,
  getAcademicP0GuidedSkillPrerequisite,
  validateAcademicReadingP0Catalog,
} from "../src/curriculum/academic-reading-p0.js";
import { buildAcademicProgram } from "../src/modules/student-learning/academic-program.js";
import { areLearningStepPrerequisitesComplete } from "../src/modules/student-learning/persistent-path.js";

describe("academic reading P0 catalogue", () => {
  it("contains one source-backed teaching sequence for each of the six skills", () => {
    const validation = validateAcademicReadingP0Catalog();
    expect(validation).toEqual({ valid: true, errors: [] });
    expect(ACADEMIC_P0_LESSONS).toHaveLength(6);
    expect(new Set(ACADEMIC_P0_LESSONS.map((lesson) => lesson.skillCode))).toEqual(
      new Set(ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes),
    );
    expect(
      ACADEMIC_P0_LESSONS.every(
        (lesson) =>
          lesson.stages.map((stage) => stage.stage).join(",") === "TEACHING,SMALL_STUDY,PRACTICE",
      ),
    ).toBe(true);
    expect(
      ACADEMIC_P0_LESSONS.every(
        (lesson) =>
          lesson.correctFeedback &&
          lesson.incorrectFeedback &&
          lesson.reteach &&
          lesson.successIndicators.length >= 2 &&
          lesson.sources.every((source) => source.limitation),
      ),
    ).toBe(true);
  });

  it("does not invent speed norms or a universal pass threshold", () => {
    const text = JSON.stringify(ACADEMIC_P0_LESSONS);
    expect(text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:WPM|kelime\/dakika)\b/i);
    expect(ACADEMIC_P0_COMMON_FLOW.assessmentRule).toContain("ürün politikası");
  });

  it("keeps the student-facing roadmap in a single guided order", () => {
    expect(ACADEMIC_P0_GUIDED_SKILL_ORDER).toEqual([
      "FAST_ATTENTION",
      "FAST_RECOGNITION",
      "FAST_CHUNKING",
      "RC_MAIN_IDEA",
      "RC_DETAIL",
      "RC_INFERENCE",
    ]);
    expect(getAcademicP0GuidedSkillPrerequisite("FAST_ATTENTION")).toBeNull();
    expect(getAcademicP0GuidedSkillPrerequisite("FAST_CHUNKING")).toBe("FAST_RECOGNITION");
    expect(getAcademicP0GuidedSkillPrerequisite("RC_MAIN_IDEA")).toBe("FAST_CHUNKING");
    expect(getAcademicP0GuidedSkillPrerequisite("RC_INFERENCE")).toBe("RC_DETAIL");
  });
});

describe("academic learning program read model", () => {
  const runtimeSkills = ACADEMIC_P0_COMMON_FLOW.prerequisiteSkillCodes.map((code) => ({
    code,
    name: code,
    hasPublishedPractice: true,
    practiceCompleted: false,
    accuracy: null,
    lessonPublished: true,
    lessonCompleted: false,
  }));

  it("keeps practice locked until its teaching lesson is completed", () => {
    const program = buildAcademicProgram(runtimeSkills);
    const fastAttention = program.areas[0]?.skills[0];
    expect(fastAttention?.stages.map((stage) => stage.status)).toEqual([
      "ACTIVE",
      "LOCKED",
      "LOCKED",
    ]);
    expect(program.common.stages[0]?.status).toBe("LOCKED");
  });

  it("does not open common reinforcement before every practice has evidence", () => {
    const program = buildAcademicProgram(
      runtimeSkills.map((skill, index) => ({
        ...skill,
        lessonCompleted: true,
        practiceCompleted: index === 0,
      })),
    );
    expect(program.common.stages[0]?.status).toBe("LOCKED");
  });

  it("marks the common flow unavailable instead of fabricating published content", () => {
    const program = buildAcademicProgram(
      runtimeSkills.map((skill) => ({ ...skill, lessonCompleted: true, practiceCompleted: true })),
    );
    expect(program.common.stages[0]?.status).toBe("UNAVAILABLE");
    expect(program.common.stages[1]?.status).toBe("LOCKED");
  });

  it("keeps a learning step locked until every prerequisite is completed", () => {
    const completed = new Set(["teaching"]);
    expect(areLearningStepPrerequisitesComplete(["teaching", "small-study"], completed)).toBe(
      false,
    );
    completed.add("small-study");
    expect(areLearningStepPrerequisitesComplete(["teaching", "small-study"], completed)).toBe(true);
  });
});

describe("education V2 P0 forward migration contract", () => {
  it("keeps legacy learning-path data and backfills prerequisites additively", async () => {
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20260927100000_add_persistent_learning_path/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|TYPE|COLUMN|INDEX)\b/iu);
    expect(migration).not.toContain('CREATE TABLE "LearningPath"');
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'MEASUREMENT'");
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'NEXT_LEARNING'");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "levelId"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "skillId"');
    expect(schema).toContain("@@index([skillId])");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "attemptCount"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "StudentLearningPath"');
    expect(migration).toContain('"prerequisiteStepId" IS NOT NULL');
    expect(migration).toContain("? 'prerequisiteStepIds'");
  });

  it("keeps provisioning fail-closed, idempotent and environment-gated", async () => {
    const provisioning = await readFile(
      new URL("../scripts/provision-education-v2-p0-learning-path.ts", import.meta.url),
      "utf8",
    );

    expect(provisioning).toContain('environment !== "STAGING" && environment !== "PRODUCTION"');
    expect(provisioning).toContain("I_HAVE_REVIEWED_EDUCATION_V2_P0");
    expect(provisioning).toContain("I_HAVE_REVIEWED_EDUCATION_V2_P0_PRODUCTION_EDITORIAL_RELEASE");
    expect(provisioning).toContain("EDUCATION_V2_P0_PRODUCTION_DATABASE_URL");
    expect(provisioning).toContain("EDUCATION_V2_P0_PRODUCTION_DATABASE_HOST");
    expect(provisioning).toContain("assertApprovedTargetFingerprint");
    expect(provisioning).toContain("where: { code_version:");
    expect(provisioning).toContain("where: { pathId_code:");
    expect(provisioning).toContain("where: { unitId_stableKey:");
    expect(provisioning).toContain('data: { status: "PUBLISHED", isActive: true }');
    expect(provisioning).toContain('status: "PUBLISHED", isActive: true, ...immutable');
    expect(provisioning).not.toMatch(/\b(?:delete|deleteMany|updateMany)\s*\(/u);
  });
});
