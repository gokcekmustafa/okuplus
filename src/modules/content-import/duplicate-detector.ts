import { createHash } from "node:crypto";
import type { ContentImportManifest } from "./manifest-schema.js";
import type { ContentImportIssue, ExistingContentImportIndex } from "./types.js";

export function normalizeImportText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function importFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function duplicateIssue(path: string, value: string, label: string): ContentImportIssue {
  return {
    code: `DUPLICATE_${label}`,
    path,
    message: `Normalize edildiğinde duplicate değer: ${value}`,
  };
}

export function detectImportDuplicates(
  manifest: ContentImportManifest,
  existing: ExistingContentImportIndex = {},
): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  const contentKeys = new Set<string>();
  const questionKeys = new Set<string>();
  const stems = new Set<string>();
  const passage = normalizeImportText(manifest.content.passage);

  if (contentKeys.has(manifest.content.externalKey)) {
    issues.push(
      duplicateIssue("content.externalKey", manifest.content.externalKey, "CONTENT_EXTERNAL_KEY"),
    );
  }
  contentKeys.add(manifest.content.externalKey);

  for (const [index, question] of manifest.questions.entries()) {
    if (questionKeys.has(question.externalKey)) {
      issues.push(
        duplicateIssue(
          `questions[${index}].externalKey`,
          question.externalKey,
          "QUESTION_EXTERNAL_KEY",
        ),
      );
    }
    questionKeys.add(question.externalKey);

    const normalizedStem = normalizeImportText(question.stem);
    if (stems.has(normalizedStem)) {
      issues.push(duplicateIssue(`questions[${index}].stem`, normalizedStem, "QUESTION_STEM"));
    }
    stems.add(normalizedStem);
  }

  const existingContent = existing.contents ?? [];
  const existingQuestions = existing.questions ?? [];
  const sameContentKey = existingContent.filter(
    (entry) => entry.externalKey === manifest.content.externalKey,
  );
  if (sameContentKey.length > 1) {
    issues.push(
      duplicateIssue(
        "content.externalKey",
        manifest.content.externalKey,
        "EXISTING_CONTENT_EXTERNAL_KEY",
      ),
    );
  }
  if (
    existingContent.some(
      (entry) =>
        entry.externalKey !== manifest.content.externalKey && entry.normalizedPassage === passage,
    )
  ) {
    issues.push(duplicateIssue("content.passage", passage, "PASSAGE"));
  }
  for (const [index, question] of manifest.questions.entries()) {
    const normalizedStem = normalizeImportText(question.stem);
    const matches = existingQuestions.filter((entry) => entry.externalKey === question.externalKey);
    if (matches.length > 1) {
      issues.push(
        duplicateIssue(
          `questions[${index}].externalKey`,
          question.externalKey,
          "EXISTING_QUESTION_EXTERNAL_KEY",
        ),
      );
    }
    if (
      existingQuestions.some(
        (entry) =>
          entry.externalKey !== question.externalKey && entry.normalizedStem === normalizedStem,
      )
    ) {
      issues.push(
        duplicateIssue(`questions[${index}].stem`, normalizedStem, "EXISTING_QUESTION_STEM"),
      );
    }
  }

  return issues;
}
