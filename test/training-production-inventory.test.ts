import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildSafeTrainingInventoryReport,
  type TrainingInventoryVersion,
} from "../src/modules/training/inventory-audit.js";

function fixture(): TrainingInventoryVersion {
  return {
    id: "template-version-1",
    templateId: "template-1",
    version: 1,
    config: { family: "MAIN_IDEA" },
    status: "PUBLISHED",
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    template: {
      id: "template-1",
      title: "Gizli olmayan test başlığı",
      type: "MIXED",
      tenantId: null,
      status: "PUBLISHED",
      deletedAt: null,
    },
    contents: [
      {
        position: 1,
        contentVersionId: "content-version-1",
        contentVersion: {
          id: "content-version-1",
          contentId: "content-1",
          version: 1,
          title: "Test metni",
          body: "Bu metin rapora çıkmamalı.",
          status: "PUBLISHED",
          content: {
            id: "content-1",
            tenantId: null,
            status: "PUBLISHED",
            deletedAt: null,
          },
        },
      },
    ],
    questions: [
      {
        position: 1,
        questionVersionId: "question-version-1",
        questionVersion: {
          id: "question-version-1",
          questionId: "question-1",
          version: 2,
          contentVersionId: "content-version-1",
          prompt: "Bu soru metni rapora çıkmamalı?",
          options: [
            { id: "key-id-a", text: "Kısa seçenek", position: 1 },
            { id: "key-id-b", text: "Biraz daha uzun seçenek", position: 2 },
            { id: "key-id-c", text: "Üçüncü seçenek", position: 3 },
            { id: "key-id-d", text: "Son seçenek", position: 4 },
          ],
          correctAnswer: { type: "MULTIPLE_CHOICE", correctOptionIds: ["key-id-b"] },
          explanation: "Açıklama da rapora çıkmamalı.",
          hint: "İpucu da rapora çıkmamalı.",
          difficulty: 2,
          status: "PUBLISHED",
          question: {
            id: "question-1",
            contentId: "content-1",
            type: "MULTIPLE_CHOICE",
            status: "PUBLISHED",
            deletedAt: null,
            skill: { code: "RC_MAIN_IDEA" },
          },
        },
      },
    ],
  } as unknown as TrainingInventoryVersion;
}

describe("production Training question inventory", () => {
  it("reports version, status and aggregate quality metrics without question content or answer keys", () => {
    const report = buildSafeTrainingInventoryReport([fixture()]);
    const mainIdea = report.activities.find((activity) => activity.family === "MAIN_IDEA");
    expect(report.productionWrite).toBe("NO");
    expect(report.semanticContentReview).toBe("NOT_PERFORMED");
    expect(report.questionVersionReferenceCount).toBe(1);
    expect(report.uniqueQuestionVersionCount).toBe(1);
    expect(report.duplicateQuestionVersionReferences).toBe(0);
    expect(mainIdea).toMatchObject({
      publishedTemplateVersionCount: 1,
      studentEligibleTemplateVersionCount: 0,
    });
    expect(mainIdea?.versions[0]).toMatchObject({
      templateId: "template-1",
      templateVersionId: "template-version-1",
      templateVersion: 1,
      templateStatus: "PUBLISHED",
      configStatus: "INVALID",
      questionCount: 1,
      questionVersionInventory: [
        {
          questionVersionId: "question-version-1",
          version: 2,
          status: "PUBLISHED",
          questionStatus: "PUBLISHED",
          contentVersionLinked: true,
        },
      ],
      contentVersionInventory: [
        {
          position: 1,
          contentId: "content-1",
          contentVersionId: "content-version-1",
          version: 1,
          contentVersionStatus: "PUBLISHED",
          contentStatus: "PUBLISHED",
          contentDeleted: false,
        },
      ],
      correctOptionPositionCounts: {
        "1": 0,
        "2": 1,
        "3": 0,
        "4": 0,
        MULTIPLE_OR_UNRESOLVED: 0,
      },
      correctOptionUniquelyLongestCount: 1,
      missingQuestionContentLinkCount: 0,
    });

    const serialized = JSON.stringify(report);
    for (const sensitiveValue of [
      "Bu soru metni rapora çıkmamalı?",
      "Kısa seçenek",
      "key-id-b",
      "Açıklama da rapora çıkmamalı.",
      "İpucu da rapora çıkmamalı.",
      "Bu metin rapora çıkmamalı.",
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
    expect(serialized).not.toContain("correctAnswer");
  });

  it("surfaces unmapped published versions without logging arbitrary config values", () => {
    const row = fixture();
    const unmapped = {
      ...row,
      id: "unknown-template-version",
      config: { family: "private-config-value-must-not-be-reported" },
    } as TrainingInventoryVersion;
    const report = buildSafeTrainingInventoryReport([unmapped]);
    expect(report.unmappedPublishedTemplateVersions).toEqual([
      expect.objectContaining({
        templateVersionId: "unknown-template-version",
        family: null,
        configStatus: "INVALID",
        questionCount: 1,
      }),
    ]);
    expect(report.versionCount).toBe(1);
    expect(report.mappedActivityTemplateVersionCount).toBe(0);
    expect(JSON.stringify(report)).not.toContain("private-config-value-must-not-be-reported");
  });

  it("defines a manually dispatched master-only protected workflow with the existing production target contract", async () => {
    const workflow = await readFile(
      new URL(
        "../.github/workflows/production-training-question-inventory-audit.yml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}");
    expect(workflow).toContain("PRODUCTION_DB_APPROVED_TARGET_FINGERPRINT");
    expect(workflow).toContain('test "${GITHUB_REF}" = "refs/heads/master"');
    expect(workflow).toContain("TRAINING_QUESTION_INVENTORY_READ_ONLY_AUDIT");
    expect(workflow).not.toContain("upload-artifact");
  });

  it("uses only SELECT/query and Prisma findMany database operations", async () => {
    const script = await readFile(
      new URL("../scripts/audit-training-question-inventory-production.ts", import.meta.url),
      "utf8",
    );
    expect(script).toMatch(/SELECT current_database\(\)/u);
    expect(script).toContain("exerciseTemplateVersion.findMany");
    expect(script).toContain("$disconnect()");
    expect(script).toContain("$transaction(");
    expect(script).toContain("SET TRANSACTION READ ONLY");
    expect(script).toContain("tx.exerciseTemplateVersion.findMany");
    expect(script.match(/tx\.\$executeRaw`SET TRANSACTION READ ONLY`/gu)).toHaveLength(1);
    expect(script).not.toMatch(/prisma\.(?:exerciseTemplateVersion|\$queryRaw|\$executeRaw)/u);
    expect(script).not.toMatch(/(?:queryRaw|executeRaw)Unsafe/u);
    expect(script).not.toMatch(
      /\.(?:create|createMany|upsert|update|updateMany|delete|deleteMany)\s*\(/u,
    );
    expect(script).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE)\b/iu,
    );
  });
});
