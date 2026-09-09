import { describe, expect, it } from "vitest";
import {
  buildContentImportPlan,
  detectImportDuplicates,
  parseContentImportManifestJson,
  validateContentImportManifest,
  validateImportSemantics,
} from "../src/modules/content-import/index.js";
import type { ContentImportManifest } from "../src/modules/content-import/manifest-schema.js";

function validManifest(): ContentImportManifest {
  return {
    manifestVersion: 1,
    manifestId: "OKU-CONTENT-IMPORT-V1",
    target: { scope: "GLOBAL", tenantId: null, allowGlobal: true },
    content: {
      externalKey: "reading-main-001",
      title: "Kütüphane Sessizliği",
      contentType: "PASSAGE",
      competency: "RC_MAIN_IDEA",
      difficulty: 0.42,
      passage:
        "Kütüphanedeki sessizlik, öğrencilerin düşüncelerini daha kolay toparlamasına yardımcı oldu.",
      metadata: { source: "authoring", ageBand: "13-17" },
    },
    questions: [
      {
        externalKey: "q-001",
        type: "MULTIPLE_CHOICE",
        stem: "Metnin ana düşüncesi nedir?",
        options: [
          { key: "A", text: "Sessizlik odaklanmayı kolaylaştırdı." },
          { key: "B", text: "Kütüphane tamamen kapatıldı." },
          { key: "C", text: "Öğrenciler dışarı çıktı." },
          { key: "D", text: "Düşünmek gereksizdi." },
        ],
        correctAnswer: "A",
        explanation: "Pasaj sessizliğin odaklanmaya yardımcı olduğunu söylüyor.",
        competency: "RC_MAIN_IDEA",
        difficulty: 0.4,
        contentVersion: { externalKey: "reading-main-001", version: 1 },
      },
    ],
  };
}

describe("content import manifest v1", () => {
  it("validates a canonical manifest and produces a draft plan", () => {
    const result = validateContentImportManifest(validManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = buildContentImportPlan(result.manifest);
    expect(plan.operations.map((entry) => entry.operation)).toEqual([
      "CREATE_CONTENT",
      "CREATE_CONTENT_VERSION",
      "CREATE_QUESTION",
      "CREATE_QUESTION_VERSION",
      "LINK_QUESTION_TO_CONTENT_VERSION",
    ]);
    expect(plan.operations.every((entry) => entry.reason !== "PUBLISHED")).toBe(true);
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects missing fields and invalid enums with stable error codes", () => {
    const input = validManifest() as unknown as Record<string, unknown>;
    delete (input.content as Record<string, unknown>).title;
    (input.content as Record<string, unknown>).competency = "UNKNOWN";
    const result = validateContentImportManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((entry) => entry.code)).toEqual([
      "CONTENT_COMPETENCY_INVALID",
      "CONTENT_TITLE_REQUIRED",
    ]);
  });

  it("rejects invalid question type, options and correct answer", () => {
    const input = validManifest();
    input.questions[0]!.type = "MULTIPLE_CHOICE";
    input.questions[0]!.options = [{ key: "A", text: "Tek seçenek" }];
    input.questions[0]!.correctAnswer = "Z";
    const result = validateContentImportManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((entry) => entry.code)).toContain("QUESTION_OPTIONS_INVALID");
    expect(result.issues.map((entry) => entry.code)).toContain("QUESTION_CORRECT_ANSWER_INVALID");
  });

  it("rejects duplicate external keys, normalized stems and passages", () => {
    const input = validManifest();
    input.questions.push({
      ...input.questions[0]!,
      externalKey: "q-002",
      stem: " METNİN ANA DÜŞÜNCESİ NEDİR? ",
    });
    const existing = {
      contents: [
        {
          externalKey: "different-content",
          normalizedPassage:
            "kütüphanedeki sessizlik, öğrencilerin düşüncelerini daha kolay toparlamasına yardımcı oldu.",
          currentVersion: null,
        },
      ],
      questions: [
        {
          externalKey: "q-existing",
          normalizedStem: "metnin ana düşüncesi nedir?",
          currentVersion: null,
        },
      ],
    };
    const duplicateCodes = detectImportDuplicates(input, existing).map((entry) => entry.code);
    expect(duplicateCodes).toContain("DUPLICATE_PASSAGE");
    expect(duplicateCodes).toContain("DUPLICATE_QUESTION_STEM");
    expect(duplicateCodes).toContain("DUPLICATE_EXISTING_QUESTION_STEM");
  });

  it("rejects an explicitly wrong ContentVersion reference", () => {
    const input = validManifest();
    input.questions[0]!.contentVersion = { externalKey: "another-content", version: 2 };
    const result = validateContentImportManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe("QUESTION_CONTENT_VERSION_MISMATCH");
  });

  it("supports all deterministic answer shapes without OPEN_ENDED assumptions", () => {
    const input = validManifest();
    input.questions = [
      {
        ...input.questions[0]!,
        externalKey: "q-tf",
        stem: "Pasajdaki ifade doğru mudur?",
        type: "TRUE_FALSE",
        options: [
          { key: "T", text: "Doğru" },
          { key: "F", text: "Yanlış" },
        ],
        correctAnswer: true,
      },
      {
        ...input.questions[0]!,
        externalKey: "q-oe",
        stem: "Pasajdaki temel beceriyi yazın.",
        type: "OPEN_ENDED",
        options: [],
        correctAnswer: "odaklanma",
      },
      {
        ...input.questions[0]!,
        externalKey: "q-match",
        stem: "Kavramı açıklamasıyla eşleştirin.",
        type: "MATCHING",
        options: [
          { key: "A", text: "A" },
          { key: "B", text: "B" },
        ],
        correctAnswer: { pairs: [{ leftKey: "A", rightKey: "B" }] },
      },
      {
        ...input.questions[0]!,
        externalKey: "q-blank",
        stem: "Eksik sözcüğü tamamlayın.",
        type: "FILL_BLANK",
        options: [],
        correctAnswer: { blanks: [{ blankKey: "blank-1", acceptedAnswers: ["sessizlik"] }] },
      },
    ];
    expect(validateContentImportManifest(input).ok).toBe(true);
  });

  it("requires an explicit global import flag", () => {
    const input = validManifest();
    input.target.allowGlobal = false;
    expect(validateImportSemantics(input).map((entry) => entry.code)).toContain(
      "GLOBAL_IMPORT_NOT_EXPLICIT",
    );
  });

  it("does not overwrite a published content or question version", () => {
    const input = validManifest();
    const plan = buildContentImportPlan(input, {
      contents: [
        {
          externalKey: input.content.externalKey,
          normalizedPassage: "başka pasaj",
          currentVersion: { version: 3, status: "PUBLISHED", fingerprint: "different" },
        },
      ],
      questions: [
        {
          externalKey: "q-001",
          normalizedStem: "başka soru",
          currentVersion: {
            version: 2,
            status: "PUBLISHED",
            fingerprint: "different",
            contentExternalKey: input.content.externalKey,
            contentVersion: 1,
          },
        },
      ],
    });
    expect(plan.operations[1]?.operation).toBe("CREATE_NEW_VERSION");
    expect(plan.operations[3]?.operation).toBe("CREATE_NEW_VERSION");
    expect(plan.operations[1]?.targetVersion).toBe(4);
    expect(plan.operations[3]?.targetVersion).toBe(3);
  });

  it("reuses exact identities deterministically", () => {
    const input = validManifest();
    const contentFingerprint = "not-used-by-test";
    const first = buildContentImportPlan(input);
    const existing = {
      contents: [
        {
          externalKey: input.content.externalKey,
          normalizedPassage: "başka",
          currentVersion: {
            version: 1,
            status: "PUBLISHED" as const,
            fingerprint: first.operations[1]!.payloadFingerprint!,
          },
        },
      ],
      questions: [
        {
          externalKey: "q-001",
          normalizedStem: "başka",
          currentVersion: {
            version: 1,
            status: "PUBLISHED" as const,
            fingerprint: first.operations[3]!.payloadFingerprint!,
            contentExternalKey: input.content.externalKey,
            contentVersion: 1,
          },
        },
      ],
    };
    const second = buildContentImportPlan(input, existing);
    expect(contentFingerprint).toBe("not-used-by-test");
    expect(second.operations[1]?.operation).toBe("REUSE_EXISTING");
    expect(second.operations[3]?.operation).toBe("REUSE_EXISTING");
    expect(buildContentImportPlan(input).fingerprint).toBe(first.fingerprint);
  });

  it("returns deterministic malformed JSON and unsafe metadata errors", () => {
    const malformed = parseContentImportManifestJson("{broken");
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.issues[0]?.code).toBe("MALFORMED_JSON");

    const unsafe = validManifest();
    unsafe.content.metadata = JSON.parse('{"__proto__":"x","source":"test"}') as Record<
      string,
      unknown
    >;
    const result = validateContentImportManifest(unsafe);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((entry) => entry.code)).toContain("SCHEMA_INVALID");
  });
});
