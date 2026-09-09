import { contentImportManifestSchema, type ContentImportManifest } from "./manifest-schema.js";
import { detectImportDuplicates } from "./duplicate-detector.js";
import { validateImportSemantics } from "./semantic-validator.js";
import type {
  ContentImportIssue,
  ContentImportValidationResult,
  ExistingContentImportIndex,
} from "./types.js";

function pathString(path: PropertyKey[]): string {
  return path.reduce<string>((result, entry) => {
    if (typeof entry === "number") return `${result}[${entry}]`;
    return result ? `${result}.${String(entry)}` : String(entry);
  }, "");
}

function schemaIssueCode(path: string, message: string): string {
  if (path === "content.title") return "CONTENT_TITLE_REQUIRED";
  if (path === "content.passage") return "CONTENT_PASSAGE_REQUIRED";
  if (path === "content.competency") return "CONTENT_COMPETENCY_INVALID";
  if (path === "content.difficulty") return "CONTENT_DIFFICULTY_INVALID";
  if (path.endsWith(".stem")) return "QUESTION_STEM_REQUIRED";
  if (path.includes(".options")) return "QUESTION_OPTIONS_INVALID";
  if (path.endsWith(".correctAnswer")) return "QUESTION_CORRECT_ANSWER_INVALID";
  if (message.includes("Manifest")) return "MANIFEST_FIELD_REQUIRED";
  return "SCHEMA_INVALID";
}

function sortIssues(issues: ContentImportIssue[]): ContentImportIssue[] {
  return [...issues].sort((left, right) =>
    `${left.path}\u0000${left.code}\u0000${left.message}`.localeCompare(
      `${right.path}\u0000${right.code}\u0000${right.message}`,
      "en",
    ),
  );
}

function parseSchema(input: unknown): {
  manifest: ContentImportManifest | null;
  issues: ContentImportIssue[];
} {
  const parsed = contentImportManifestSchema.safeParse(input);
  if (parsed.success) return { manifest: parsed.data, issues: [] };
  return {
    manifest: null,
    issues: sortIssues(
      parsed.error.issues.map((entry) => {
        const path = pathString(entry.path);
        return {
          code: schemaIssueCode(path, entry.message),
          path,
          message: entry.message,
        };
      }),
    ),
  };
}

export function validateContentImportManifest(
  input: unknown,
  existing: ExistingContentImportIndex = {},
): ContentImportValidationResult {
  const parsed = parseSchema(input);
  if (!parsed.manifest) return { ok: false, manifest: null, issues: parsed.issues };

  const issues = sortIssues([
    ...validateImportSemantics(parsed.manifest),
    ...detectImportDuplicates(parsed.manifest, existing),
  ]);
  if (issues.length > 0) return { ok: false, manifest: null, issues };
  return { ok: true, manifest: parsed.manifest, issues: [] };
}

export function parseContentImportManifestJson(
  json: string,
  existing: ExistingContentImportIndex = {},
): ContentImportValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      manifest: null,
      issues: [{ code: "MALFORMED_JSON", path: "$", message: "Manifest geçerli JSON değil" }],
    };
  }
  return validateContentImportManifest(parsed, existing);
}

export function assertValidContentImportManifest(input: unknown): ContentImportManifest {
  const result = validateContentImportManifest(input);
  if (!result.ok) {
    throw new Error(
      result.issues.map((entry) => `${entry.code} ${entry.path}: ${entry.message}`).join("\n"),
    );
  }
  return result.manifest;
}
