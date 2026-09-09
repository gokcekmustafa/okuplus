import type { ContentImportManifest, ContentImportQuestion } from "./manifest-schema.js";
import type { ContentImportIssue } from "./types.js";
import { CONTENT_IMPORT_METADATA_KEY } from "./identity.js";

function issue(code: string, path: string, message: string): ContentImportIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateMetadataMeaning(value: unknown, path: string): ContentImportIssue[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [];
  if (Object.keys(value).length === 0) {
    return [issue("METADATA_EMPTY", path, "Metadata verilmişse en az bir anlamlı alan içermeli")];
  }
  if (Object.prototype.hasOwnProperty.call(value, CONTENT_IMPORT_METADATA_KEY)) {
    return [
      issue(
        "METADATA_RESERVED_KEY",
        `${path}.${CONTENT_IMPORT_METADATA_KEY}`,
        "Import tarafından ayrılmış metadata anahtarı kullanılamaz",
      ),
    ];
  }
  return [];
}

function optionKeyIssues(question: ContentImportQuestion, index: number): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  const keys = new Set<string>();
  const normalizedKeys = new Set<string>();
  const normalizedTexts = new Set<string>();
  for (const [optionIndex, option] of question.options.entries()) {
    if (keys.has(option.key)) {
      issues.push(
        issue(
          "QUESTION_OPTIONS_INVALID",
          `questions[${index}].options[${optionIndex}].key`,
          "Seçenek anahtarları benzersiz olmalı",
        ),
      );
    }
    const normalizedKey = option.key.normalize("NFKC").toLocaleLowerCase("tr-TR");
    if (normalizedKeys.has(normalizedKey)) {
      issues.push(
        issue(
          "QUESTION_OPTIONS_INVALID",
          `questions[${index}].options[${optionIndex}].key`,
          "Seçenek anahtarları büyük/küçük harf farkıyla tekrarlanmamalı",
        ),
      );
    }
    const normalizedText = option.text
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("tr-TR");
    if (normalizedTexts.has(normalizedText)) {
      issues.push(
        issue(
          "QUESTION_OPTIONS_INVALID",
          `questions[${index}].options[${optionIndex}].text`,
          "Seçenek metinleri duplicate olmamalı",
        ),
      );
    }
    keys.add(option.key);
    normalizedKeys.add(normalizedKey);
    normalizedTexts.add(normalizedText);
  }
  return issues;
}

function correctAnswerKeys(question: ContentImportQuestion): string[] | null {
  if (question.type === "MULTIPLE_CHOICE") {
    if (typeof question.correctAnswer === "string") return [question.correctAnswer.trim()];
    if (
      Array.isArray(question.correctAnswer) &&
      question.correctAnswer.every((entry) => typeof entry === "string")
    ) {
      return question.correctAnswer.map((entry) => entry.trim());
    }
    return null;
  }
  return null;
}

function validateMultipleChoice(
  question: ContentImportQuestion,
  index: number,
): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  if (question.options.length < 2) {
    issues.push(
      issue(
        "QUESTION_OPTIONS_INVALID",
        `questions[${index}].options`,
        "Multiple choice soru en az iki seçenek içermeli",
      ),
    );
  }
  const keys = correctAnswerKeys(question);
  if (!keys || keys.length === 0 || keys.some((key) => !key)) {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "Doğru cevap seçenek anahtarı veya anahtar dizisi olmalı",
      ),
    );
    return issues;
  }
  if (new Set(keys).size !== keys.length) {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "Doğru cevap anahtarları benzersiz olmalı",
      ),
    );
  }
  const optionKeys = new Set(question.options.map((option) => option.key));
  if (keys.some((key) => !optionKeys.has(key))) {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "Doğru cevap, seçeneklerden biri olmalı",
      ),
    );
  }
  return issues;
}

function validateTrueFalse(question: ContentImportQuestion, index: number): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  if (typeof question.correctAnswer !== "boolean") {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "True/false doğru cevabı boolean olmalı",
      ),
    );
  }
  if (question.options.length !== 2) {
    issues.push(
      issue(
        "QUESTION_OPTIONS_INVALID",
        `questions[${index}].options`,
        "True/false soru tam iki seçenek içermeli",
      ),
    );
  }
  return issues;
}

function validateOpenEnded(question: ContentImportQuestion, index: number): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  if (question.options.length !== 0) {
    issues.push(
      issue(
        "QUESTION_OPTIONS_INVALID",
        `questions[${index}].options`,
        "Open ended soru seçenek içermemeli",
      ),
    );
  }
  if (typeof question.correctAnswer !== "string" || question.correctAnswer.trim().length === 0) {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "Open ended doğru cevabı boş olmayan metin olmalı",
      ),
    );
  }
  return issues;
}

function validateMatching(question: ContentImportQuestion, index: number): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  if (
    question.options.length < 2 ||
    !isRecord(question.correctAnswer) ||
    !Array.isArray(question.correctAnswer.pairs)
  ) {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "Matching doğru cevabı pairs dizisi içermeli",
      ),
    );
    return issues;
  }
  const optionKeys = new Set(question.options.map((option) => option.key));
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  for (const [pairIndex, pair] of question.correctAnswer.pairs.entries()) {
    if (!isRecord(pair) || typeof pair.leftKey !== "string" || typeof pair.rightKey !== "string") {
      issues.push(
        issue(
          "QUESTION_CORRECT_ANSWER_INVALID",
          `questions[${index}].correctAnswer.pairs[${pairIndex}]`,
          "Matching çifti leftKey/rightKey içermeli",
        ),
      );
      continue;
    }
    if (!optionKeys.has(pair.leftKey) || !optionKeys.has(pair.rightKey)) {
      issues.push(
        issue(
          "QUESTION_CORRECT_ANSWER_INVALID",
          `questions[${index}].correctAnswer.pairs[${pairIndex}]`,
          "Matching çifti mevcut seçenek anahtarlarını kullanmalı",
        ),
      );
    }
    if (usedLeft.has(pair.leftKey) || usedRight.has(pair.rightKey)) {
      issues.push(
        issue(
          "QUESTION_CORRECT_ANSWER_INVALID",
          `questions[${index}].correctAnswer.pairs[${pairIndex}]`,
          "Matching eşleşmeleri benzersiz olmalı",
        ),
      );
    }
    usedLeft.add(pair.leftKey);
    usedRight.add(pair.rightKey);
  }
  return issues;
}

function validateFillBlank(question: ContentImportQuestion, index: number): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  if (
    question.options.length !== 0 ||
    !isRecord(question.correctAnswer) ||
    !Array.isArray(question.correctAnswer.blanks)
  ) {
    issues.push(
      issue(
        "QUESTION_CORRECT_ANSWER_INVALID",
        `questions[${index}].correctAnswer`,
        "Fill blank doğru cevabı blanks dizisi içermeli ve seçenek içermemeli",
      ),
    );
    return issues;
  }
  const blankKeys = new Set<string>();
  for (const [blankIndex, blank] of question.correctAnswer.blanks.entries()) {
    if (
      !isRecord(blank) ||
      typeof blank.blankKey !== "string" ||
      !Array.isArray(blank.acceptedAnswers)
    ) {
      issues.push(
        issue(
          "QUESTION_CORRECT_ANSWER_INVALID",
          `questions[${index}].correctAnswer.blanks[${blankIndex}]`,
          "Boşluk blankKey/acceptedAnswers içermeli",
        ),
      );
      continue;
    }
    if (
      blankKeys.has(blank.blankKey) ||
      blank.acceptedAnswers.length === 0 ||
      blank.acceptedAnswers.some(
        (answer) => typeof answer !== "string" || answer.trim().length === 0,
      )
    ) {
      issues.push(
        issue(
          "QUESTION_CORRECT_ANSWER_INVALID",
          `questions[${index}].correctAnswer.blanks[${blankIndex}]`,
          "Boşluk anahtarları ve kabul edilen cevaplar benzersiz/geçerli olmalı",
        ),
      );
    }
    blankKeys.add(blank.blankKey);
  }
  return issues;
}

export function validateImportSemantics(manifest: ContentImportManifest): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [];
  const { content, target } = manifest;

  if (target.scope === "GLOBAL") {
    if (target.tenantId !== null && target.tenantId !== undefined) {
      issues.push(
        issue("GLOBAL_TENANT_INVALID", "target.tenantId", "Global içerikte tenantId null olmalı"),
      );
    }
    if (target.allowGlobal !== true) {
      issues.push(
        issue(
          "GLOBAL_IMPORT_NOT_EXPLICIT",
          "target.allowGlobal",
          "Global import açıkça allowGlobal=true istemeli",
        ),
      );
    }
  } else {
    if (!target.tenantId) {
      issues.push(
        issue("TENANT_REQUIRED", "target.tenantId", "Tenant importunda tenantId gerekli"),
      );
    }
    if (target.allowGlobal) {
      issues.push(
        issue(
          "TENANT_GLOBAL_FLAG_INVALID",
          "target.allowGlobal",
          "Tenant importunda allowGlobal=true kullanılamaz",
        ),
      );
    }
  }

  issues.push(...validateMetadataMeaning(content.metadata, "content.metadata"));
  if (content.passage.replace(/[\s\p{P}\p{S}]/gu, "").length === 0) {
    issues.push(
      issue("CONTENT_PASSAGE_MEANINGLESS", "content.passage", "Pasaj anlamlı metin içermeli"),
    );
  }

  for (const [index, question] of manifest.questions.entries()) {
    if (question.competency !== content.competency) {
      issues.push(
        issue(
          "QUESTION_COMPETENCY_MISMATCH",
          `questions[${index}].competency`,
          "Soru competency değeri içerik competency değeriyle eşleşmeli",
        ),
      );
    }
    if (
      question.contentVersion &&
      (question.contentVersion.externalKey !== content.externalKey ||
        question.contentVersion.version !== 1)
    ) {
      issues.push(
        issue(
          "QUESTION_CONTENT_VERSION_MISMATCH",
          `questions[${index}].contentVersion`,
          "Soru yalnız bu manifestin ContentVersion v1 sürümüne bağlanabilir",
        ),
      );
    }
    issues.push(...validateMetadataMeaning(question.metadata, `questions[${index}].metadata`));
    issues.push(...optionKeyIssues(question, index));
    switch (question.type) {
      case "MULTIPLE_CHOICE":
        issues.push(...validateMultipleChoice(question, index));
        break;
      case "TRUE_FALSE":
        issues.push(...validateTrueFalse(question, index));
        break;
      case "OPEN_ENDED":
        issues.push(...validateOpenEnded(question, index));
        break;
      case "MATCHING":
        issues.push(...validateMatching(question, index));
        break;
      case "FILL_BLANK":
        issues.push(...validateFillBlank(question, index));
        break;
    }
  }
  return issues;
}
