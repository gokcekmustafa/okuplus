import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/production-targeted-curriculum-repair.yml", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("../scripts/repair-production-content-skills-and-p0-station9.ts", import.meta.url),
  "utf8",
);
const p0Provisioner = readFileSync(
  new URL("../scripts/provision-education-v2-p0-learning-path.ts", import.meta.url),
  "utf8",
);

describe("targeted production curriculum repair scope", () => {
  it("requires master dispatch, the protected production environment, exact target fingerprint and scoped owner approval", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain("PRODUCTION_CURRICULUM_REPAIR_OWNER_APPROVAL");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/migrate deploy|migrate resolve|seed-education-v2/u);
  });

  it("accepts only the known 108 missing source pairs and refuses unexpected links or changed scope", () => {
    expect(script).toContain("APPROVED_P1_ROUTE_COUNT = 19");
    expect(script).toContain("APPROVED_P1_ACTIVE_STEP_COUNT = 105");
    expect(script).toContain("APPROVED_CONTENT_SKILL_EXPECTED_COUNT = 213");
    expect(script).toContain("APPROVED_CONTENT_SKILL_MISSING_COUNT = 108");
    expect(script).toContain("content_skill_unexpected_relation");
    expect(script).toContain("content_skill_missing_count_changed");
    expect(script).toContain("content_skill_route_distribution_changed");
    expect(script).toContain("ensureContentSkillLinks(tx.contentSkill, p1.links)");
  });

  it("keeps the production write atomic and limits the P0 mutation to the station 9 template pointer", () => {
    expect(script).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(script).toContain("set_config('app.platform_role', 'CONTENT_EDITOR', true)");
    expect(script).toContain("stableStepKey: release.stableStepKey");
    expect(script).toContain("EDUCATION_V2_P0_FAST_READING_${EDUCATION_V2_P0_PATH_SCOPE_CODE}");
    expect(script).toContain("exerciseTemplateVersionId: release.templateVersionId");
    expect(script).toContain("studentProgressChanged: false");
    expect(script).toContain("answersChanged: false");
    expect(script).toContain("migrationsRun: false");
    expect(script).not.toMatch(
      /studentLearningStepProgress\.(update|delete|create)|attempt\.(update|delete)|answer\.(update|delete)/u,
    );
    expect(script).not.toMatch(/\$executeRawUnsafe|\$queryRawUnsafe/u);
  });

  it("keeps the source P0 provisioner aligned to the active station 9 v3 graph without confusing lesson metadata", () => {
    expect(p0Provisioner).toContain("metadataTemplateIds.has(candidate.id)");
    expect(p0Provisioner).toContain("P0_STATION9_V3_RELEASE_DECISION.templateVersionId");
    expect(p0Provisioner).toContain("content.exerciseTemplateVersionId !== sourceTemplate.id");
    expect(p0Provisioner).toContain("assertPublishedStation9V3Graph");
  });
});
