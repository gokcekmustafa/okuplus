import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  graphIsExact,
  planVersionRecovery,
  runtimeCandidateIsEligible,
  versionConfig,
  type FamilySpec,
  type TemplateDetail,
  type TemplateVersionDetail,
} from "../scripts/provision-staging-runtime-exercise-graphs.ts";

const provisionerPath = resolve(
  process.cwd(),
  "scripts",
  "provision-staging-runtime-exercise-graphs.ts",
);

const attentionSpec = {
  family: "ATTENTION_BURST",
  competency: "FAST_ATTENTION",
  rendererKey: "QUESTION_ATTENTION_BURST",
} satisfies FamilySpec;

const contentVersionIds = ["content-version-1", "content-version-2"];
const questionVersionIds = [
  "question-version-1",
  "question-version-2",
  "question-version-3",
  "question-version-4",
  "question-version-5",
  "question-version-6",
];

const template = {
  id: "template-1",
  tenantId: null,
  title: "STAGING · ATTENTION_BURST",
  type: "COMPREHENSION",
  skillId: "skill-fast-attention",
  config: { stableFixtureIdentity: "STAGING-RUNTIME-GRAPH-V1-ATTENTION_BURST" },
  status: "PUBLISHED",
  versions: [],
} satisfies TemplateDetail;

function makeVersion(
  version: number,
  status: TemplateVersionDetail["status"] = "PUBLISHED",
  config: unknown = versionConfig(attentionSpec),
): TemplateVersionDetail {
  return {
    id: `template-version-${version}`,
    templateId: template.id,
    version,
    config,
    status,
    contents: contentVersionIds.map((contentVersionId, position) => ({
      contentVersionId,
      position,
    })),
    questions: questionVersionIds.map((questionVersionId, position) => ({
      questionVersionId,
      position,
    })),
  };
}

const exactPublished = makeVersion(2);
const partialPublished = makeVersion(1, "PUBLISHED", null);
const validDraft = makeVersion(2, "DRAFT");

describe("runtime exercise provisioner identity", () => {
  it("uses the parent stableFixtureIdentity and version contract fields", async () => {
    const source = await readFile(provisionerPath, "utf8");

    expect(source).toContain("stableFixtureIdentity");
    expect(source).toContain("parseTrainingExerciseVersionConfig(versionDetail.config)");
    expect(source).toContain("config.family !== runtimeSpec.family");
    expect(source).toContain("config.competency !== runtimeSpec.competency");
    expect(source).toContain("config.rendererKey !== runtimeSpec.rendererKey");
    expect(source).not.toContain("config?.stableKey !== identity");
  });

  it("reuses an exact published version without mutation", () => {
    const result = planVersionRecovery(
      template,
      [exactPublished],
      attentionSpec,
      contentVersionIds,
      questionVersionIds,
    );

    expect(result.kind).toBe("NOOP");
    expect(result.kind === "NOOP" && result.version.id).toBe(exactPublished.id);
  });

  it("plans v2 for a configless immutable published v1", () => {
    const result = planVersionRecovery(
      template,
      [partialPublished],
      attentionSpec,
      contentVersionIds,
      questionVersionIds,
    );

    expect(result).toEqual({ kind: "CREATE", nextVersion: 2 });
    expect(partialPublished.status).toBe("PUBLISHED");
    expect(partialPublished.config).toBeNull();
  });

  it("resumes one existing DRAFT version", () => {
    const result = planVersionRecovery(
      template,
      [partialPublished, validDraft],
      attentionSpec,
      contentVersionIds,
      questionVersionIds,
    );

    expect(result.kind).toBe("RESUME");
    expect(result.kind === "RESUME" && result.version.id).toBe(validDraft.id);
  });

  it("fails closed for ambiguous versions", () => {
    expect(() =>
      planVersionRecovery(
        template,
        [partialPublished, makeVersion(2, "REVIEW")],
        attentionSpec,
        contentVersionIds,
        questionVersionIds,
      ),
    ).toThrow("exact olmayan non-DRAFT");

    expect(() =>
      planVersionRecovery(
        template,
        [makeVersion(1, "DRAFT"), makeVersion(2, "DRAFT")],
        attentionSpec,
        contentVersionIds,
        questionVersionIds,
      ),
    ).toThrow("birden fazla DRAFT");
  });

  it("accepts the v2 config and exact published graph for runtime use", () => {
    expect(runtimeCandidateIsEligible(template, exactPublished, attentionSpec)).toBe(true);
    expect(
      graphIsExact(template, exactPublished, attentionSpec, contentVersionIds, questionVersionIds),
    ).toBe(true);
  });

  it("keeps the recovery lifecycle and binding order explicit", async () => {
    const source = await readFile(provisionerPath, "utf8");
    expect(source).toContain("/admin/templates/${encodeURIComponent(template.id)}/versions");
    expect(source).toContain("body: { config }");
    expect(source).toContain("/contents`, {");
    expect(source).toContain("/questions`, {");
    expect(source.indexOf("/review`,")).toBeLessThan(source.indexOf("/publish`,"));
    expect(source).toContain("const runtimeEligible = runtimeCandidateIsEligible");
  });
});
