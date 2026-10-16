import {
  ACADEMIC_P0_LESSONS,
  validateAcademicReadingP0Catalog,
  type AcademicLesson,
} from "./academic-reading-p0.js";
import {
  EDUCATION_V2_P0_PROGRAM_ID,
  EDUCATION_V2_P0_PROGRAM,
  getProgramIds,
  questionVersionId as p0QuestionVersionId,
  type ProgramExercise,
} from "./education-v2-p0-program.js";
import {
  EDUCATION_V2_P1_A_PATH_VERSION,
  EDUCATION_V2_P1_A_LEARNING_OUTCOMES,
  EDUCATION_V2_P1_A_PROGRAM,
  p1AAssessmentId,
  p1AContentVersionId,
  p1AQuestionVersionId,
  p1ATemplateVersionId,
  validateP1AProgram,
} from "./education-v2-p1-a-program.js";
import {
  EDUCATION_V2_P1_BCD_PROGRAMS,
  p1BCDContentVersionId,
  p1BCDId,
  p1BCDTemplateVersionId,
  validateP1BCDProgram,
  type P1BCDProgram,
} from "./education-v2-p1-bcd-program.js";

/**
 * Versioned, persistence-agnostic contract for one learning cycle.
 *
 * This is an authoring/validation contract. It does not imply that the
 * referenced content, template or assessment versions have been provisioned
 * or published in any environment. Production availability is still checked
 * by the existing graph/provisioning validators.
 */
export const LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION = 3 as const;

export const LEARNING_CYCLE_TASK_KINDS = ["NEW", "RETRIEVAL", "TRANSFER", "CHECKPOINT"] as const;
export type LearningCycleTaskKind = (typeof LEARNING_CYCLE_TASK_KINDS)[number];

export const LEARNING_CYCLE_STEP_TYPES = [
  "TEACHING",
  "SMALL_STUDY",
  "PRACTICE",
  "REINFORCEMENT",
  "ASSESSMENT",
  "MEASUREMENT",
  "NEXT_LEARNING",
] as const;
export type LearningCycleStepType = (typeof LEARNING_CYCLE_STEP_TYPES)[number];

export type LearningCycleRouteFamily = "P0" | "A" | "B" | "C" | "D";
export type LearningCycleNextPolicy = "ASSIGN_NEXT" | "REVIEW_REQUIRED" | "END_OF_PROGRAM";

export type LearningCycleVersionedReference = {
  /** Stable authoring key or catalog key. */
  key: string;
  /** Immutable version/id for the source binding. */
  versionId?: string;
  /** Immutable question versions associated with a template/assessment. */
  questionVersionIds?: readonly string[];
};

export type LearningCycleCatalogVersion = {
  key: string;
  versionId: string;
  questionVersionIds?: readonly string[];
};

export type LearningCycleOutcome = {
  key: string;
  statement: string;
  targetSkillCodes: readonly string[];
};

export type LearningCycleResourceCatalog = {
  contentKeys: readonly string[];
  exerciseKeys: readonly string[];
  assessmentKeys: readonly string[];
  questionVersionIds: readonly string[];
  contentVersions: readonly LearningCycleCatalogVersion[];
  exerciseVersions: readonly LearningCycleCatalogVersion[];
  assessmentVersions: readonly LearningCycleCatalogVersion[];
};

export type LearningCycleStepManifest = {
  stableKey: string;
  order: number;
  type: LearningCycleStepType;
  taskKind: LearningCycleTaskKind;
  /** Exact stable key from manifest.learningOutcomes. */
  learningOutcomeKeys: readonly string[];
  prerequisiteKeys: readonly string[];
  required: boolean;
  content?: LearningCycleVersionedReference;
  exercise?: LearningCycleVersionedReference;
  assessment?: LearningCycleVersionedReference;
};

export type LearningCycleManifest = {
  schemaVersion: typeof LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION;
  cycleId: string;
  cycleVersion: number;
  sequence: number;
  routeFamily: LearningCycleRouteFamily;
  targetSkillCodes: readonly string[];
  learningOutcomes: readonly LearningCycleOutcome[];
  resourceCatalog: LearningCycleResourceCatalog;
  steps: readonly LearningCycleStepManifest[];
  completion: {
    requiredStepKeys: readonly string[];
    checkpointStepKeys: readonly string[];
    requiresFinalMeasurement: boolean;
    nextCycle: LearningCycleNextPolicy;
  };
};

export type LearningCycleValidationError = {
  code:
    | "MANIFEST_FIELD"
    | "DUPLICATE_STEP"
    | "STEP_ORDER"
    | "UNKNOWN_PREREQUISITE"
    | "PREREQUISITE_ORDER"
    | "PREREQUISITE_CYCLE"
    | "STEP_TASK_MISMATCH"
    | "MISSING_REFERENCE"
    | "UNKNOWN_REFERENCE"
    | "INVALID_VERSION_REFERENCE"
    | "VERSION_MISMATCH"
    | "SOURCE_CATALOG_INVALID"
    | "INVALID_COMPLETION_REFERENCE"
    | "MISSING_FINAL_MEASUREMENT"
    | "MISSING_LEARNING_OUTCOME"
    | "UNKNOWN_LEARNING_OUTCOME"
    | "UNMAPPED_LEARNING_OUTCOME";
  path: string;
  message: string;
};

export type LearningCycleValidationResult = {
  valid: boolean;
  errors: readonly LearningCycleValidationError[];
};

function error(
  code: LearningCycleValidationError["code"],
  path: string,
  message: string,
): LearningCycleValidationError {
  return { code, path, message };
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function referenceErrors(
  reference: LearningCycleVersionedReference | undefined,
  path: string,
  knownKeys: ReadonlySet<string>,
  knownQuestionVersionIds: ReadonlySet<string>,
  expectedVersions: ReadonlyMap<string, LearningCycleCatalogVersion>,
): LearningCycleValidationError[] {
  if (!reference) return [];
  const errors: LearningCycleValidationError[] = [];
  if (!isNonEmpty(reference.key)) {
    errors.push(error("INVALID_VERSION_REFERENCE", `${path}.key`, "Kaynak anahtarı boş olamaz."));
  } else if (!knownKeys.has(reference.key)) {
    errors.push(
      error("UNKNOWN_REFERENCE", `${path}.key`, `Bilinmeyen kaynak anahtarı: ${reference.key}`),
    );
  }
  if (reference.versionId !== undefined && !isNonEmpty(reference.versionId)) {
    errors.push(
      error(
        "INVALID_VERSION_REFERENCE",
        `${path}.versionId`,
        "Sürüm kimliği verildiyse boş olamaz.",
      ),
    );
  }
  const expectedVersion = expectedVersions.get(reference.key);
  if (expectedVersion && reference.versionId === undefined) {
    errors.push(
      error(
        "INVALID_VERSION_REFERENCE",
        `${path}.versionId`,
        "Katalog bağlantısı için sürüm kimliği zorunludur.",
      ),
    );
  } else if (expectedVersion && reference.versionId !== expectedVersion.versionId) {
    errors.push(
      error(
        "VERSION_MISMATCH",
        `${path}.versionId`,
        `Sürüm kimliği kaynak kataloğuyla eşleşmiyor: beklenen ${expectedVersion.versionId}.`,
      ),
    );
  }
  if (knownKeys.has(reference.key) && !expectedVersion) {
    errors.push(
      error(
        "INVALID_VERSION_REFERENCE",
        `${path}.versionId`,
        "Kaynak anahtarı için katalog sürüm kaydı eksik.",
      ),
    );
  }
  const questionVersionIds = reference.questionVersionIds;
  if (questionVersionIds !== undefined) {
    if (questionVersionIds.length === 0) {
      errors.push(
        error(
          "INVALID_VERSION_REFERENCE",
          `${path}.questionVersionIds`,
          "Soru sürümü listesi verildiyse en az bir kimlik içermelidir.",
        ),
      );
    }
    const seen = new Set<string>();
    for (const [index, questionVersionId] of questionVersionIds.entries()) {
      const questionPath = `${path}.questionVersionIds[${index}]`;
      if (!isNonEmpty(questionVersionId)) {
        errors.push(error("INVALID_VERSION_REFERENCE", questionPath, "Soru sürümü boş olamaz."));
      } else if (seen.has(questionVersionId)) {
        errors.push(error("INVALID_VERSION_REFERENCE", questionPath, "Soru sürümü tekrarlı."));
      } else if (!knownQuestionVersionIds.has(questionVersionId)) {
        errors.push(
          error("UNKNOWN_REFERENCE", questionPath, `Bilinmeyen soru sürümü: ${questionVersionId}`),
        );
      }
      seen.add(questionVersionId);
    }
    if (expectedVersion?.questionVersionIds) {
      const expectedQuestionVersionIds = expectedVersion.questionVersionIds;
      if (
        questionVersionIds.length !== expectedQuestionVersionIds.length ||
        questionVersionIds.some((id, index) => id !== expectedQuestionVersionIds[index])
      ) {
        errors.push(
          error(
            "VERSION_MISMATCH",
            `${path}.questionVersionIds`,
            "Soru sürümü bağları kaynak kataloğuyla eşleşmiyor.",
          ),
        );
      }
    }
  } else if (expectedVersion?.questionVersionIds?.length) {
    errors.push(
      error(
        "INVALID_VERSION_REFERENCE",
        `${path}.questionVersionIds`,
        "Bu kaynak için soru sürümü bağları eksik.",
      ),
    );
  }
  return errors;
}

function catalogEntriesErrors(
  entries: readonly LearningCycleCatalogVersion[],
  keys: ReadonlySet<string>,
  knownQuestionVersionIds: ReadonlySet<string>,
  path: string,
): LearningCycleValidationError[] {
  const errors: LearningCycleValidationError[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isNonEmpty(entry.key)) {
      errors.push(
        error("INVALID_VERSION_REFERENCE", `${entryPath}.key`, "Katalog anahtarı boş olamaz."),
      );
    } else if (!keys.has(entry.key)) {
      errors.push(
        error("UNKNOWN_REFERENCE", `${entryPath}.key`, `Katalogda olmayan anahtar: ${entry.key}`),
      );
    } else if (seen.has(entry.key)) {
      errors.push(
        error("INVALID_VERSION_REFERENCE", `${entryPath}.key`, "Katalog anahtarı tekrarlı."),
      );
    }
    if (!isNonEmpty(entry.versionId)) {
      errors.push(
        error("INVALID_VERSION_REFERENCE", `${entryPath}.versionId`, "Sürüm kimliği boş olamaz."),
      );
    }
    if (entry.questionVersionIds !== undefined) {
      const questionIds = new Set<string>();
      for (const [questionIndex, questionVersionId] of entry.questionVersionIds.entries()) {
        const questionPath = `${entryPath}.questionVersionIds[${questionIndex}]`;
        if (!isNonEmpty(questionVersionId)) {
          errors.push(error("INVALID_VERSION_REFERENCE", questionPath, "Soru sürümü boş olamaz."));
        } else if (questionIds.has(questionVersionId)) {
          errors.push(error("INVALID_VERSION_REFERENCE", questionPath, "Soru sürümü tekrarlı."));
        } else if (!knownQuestionVersionIds.has(questionVersionId)) {
          errors.push(
            error(
              "UNKNOWN_REFERENCE",
              questionPath,
              `Bilinmeyen soru sürümü: ${questionVersionId}`,
            ),
          );
        }
        questionIds.add(questionVersionId);
      }
    }
    seen.add(entry.key);
  }
  return errors;
}

function catalogCoverageErrors(
  keys: ReadonlySet<string>,
  entries: readonly LearningCycleCatalogVersion[],
  path: string,
): LearningCycleValidationError[] {
  const entryKeys = new Set(entries.map((entry) => entry.key));
  return [...keys]
    .filter((key) => !entryKeys.has(key))
    .map((key) =>
      error(
        "INVALID_VERSION_REFERENCE",
        `${path}.${key}`,
        "Kaynak anahtarı için sürüm kaydı eksik.",
      ),
    );
}

function allowedTaskKinds(type: LearningCycleStepType): readonly LearningCycleTaskKind[] {
  switch (type) {
    case "TEACHING":
      return ["NEW"];
    case "SMALL_STUDY":
      return ["NEW", "RETRIEVAL", "TRANSFER"];
    case "PRACTICE":
      return ["NEW", "RETRIEVAL", "TRANSFER"];
    case "REINFORCEMENT":
      return ["RETRIEVAL", "TRANSFER"];
    case "ASSESSMENT":
    case "MEASUREMENT":
    case "NEXT_LEARNING":
      return ["CHECKPOINT"];
  }
}

/**
 * Validates structure and references without connecting to Prisma or an
 * external service. Error ordering follows manifest ordering, so the result
 * is deterministic for the same input.
 */
export function validateLearningCycleManifest(
  manifest: LearningCycleManifest,
): LearningCycleValidationResult {
  const errors: LearningCycleValidationError[] = [];
  if (manifest.schemaVersion !== LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION) {
    errors.push(error("MANIFEST_FIELD", "schemaVersion", "Desteklenmeyen manifest şeması."));
  }
  if (!isNonEmpty(manifest.cycleId))
    errors.push(error("MANIFEST_FIELD", "cycleId", "Döngü kimliği boş olamaz."));
  if (!Number.isInteger(manifest.cycleVersion) || manifest.cycleVersion < 1) {
    errors.push(
      error("MANIFEST_FIELD", "cycleVersion", "Döngü sürümü pozitif tam sayı olmalıdır."),
    );
  }
  if (!Number.isInteger(manifest.sequence) || manifest.sequence < 0) {
    errors.push(
      error("MANIFEST_FIELD", "sequence", "Döngü sırası sıfır veya pozitif tam sayı olmalıdır."),
    );
  }
  if (manifest.targetSkillCodes.length === 0) {
    errors.push(error("MANIFEST_FIELD", "targetSkillCodes", "En az bir hedef beceri gerekir."));
  }
  const skillCodes = new Set<string>();
  for (const [index, skillCode] of manifest.targetSkillCodes.entries()) {
    if (!isNonEmpty(skillCode)) {
      errors.push(
        error("MANIFEST_FIELD", `targetSkillCodes[${index}]`, "Hedef beceri boş olamaz."),
      );
    } else if (skillCodes.has(skillCode)) {
      errors.push(
        error("MANIFEST_FIELD", `targetSkillCodes[${index}]`, "Hedef beceri tekrarlı olamaz."),
      );
    }
    skillCodes.add(skillCode);
  }
  if (manifest.learningOutcomes.length === 0) {
    errors.push(error("MANIFEST_FIELD", "learningOutcomes", "En az bir öğrenme kazanımı gerekir."));
  }
  const outcomeByKey = new Map<string, LearningCycleOutcome>();
  for (const [index, outcome] of manifest.learningOutcomes.entries()) {
    const path = `learningOutcomes[${index}]`;
    if (!isNonEmpty(outcome.key)) {
      errors.push(error("MANIFEST_FIELD", `${path}.key`, "Öğrenme kazanımı anahtarı boş olamaz."));
    } else if (outcomeByKey.has(outcome.key)) {
      errors.push(
        error("MANIFEST_FIELD", `${path}.key`, "Öğrenme kazanımı anahtarı tekrarlı olamaz."),
      );
    } else {
      outcomeByKey.set(outcome.key, outcome);
    }
    if (!isNonEmpty(outcome.statement)) {
      errors.push(
        error("MANIFEST_FIELD", `${path}.statement`, "Öğrenme kazanımı açıklaması boş olamaz."),
      );
    }
    if (outcome.targetSkillCodes.length === 0) {
      errors.push(
        error(
          "MANIFEST_FIELD",
          `${path}.targetSkillCodes`,
          "Öğrenme kazanımı en az bir hedef beceriye bağlanmalıdır.",
        ),
      );
    }
    for (const [skillIndex, skillCode] of outcome.targetSkillCodes.entries()) {
      if (!skillCodes.has(skillCode)) {
        errors.push(
          error(
            "MANIFEST_FIELD",
            `${path}.targetSkillCodes[${skillIndex}]`,
            `Kazanım hedef beceriler kataloğunda bulunmuyor: ${skillCode}`,
          ),
        );
      }
    }
  }
  const outcomes = new Set(outcomeByKey.keys());
  if (manifest.steps.length === 0) {
    errors.push(error("MANIFEST_FIELD", "steps", "En az bir öğrenme adımı gerekir."));
  }

  const contentKeys = new Set(manifest.resourceCatalog.contentKeys);
  const exerciseKeys = new Set(manifest.resourceCatalog.exerciseKeys);
  const assessmentKeys = new Set(manifest.resourceCatalog.assessmentKeys);
  const questionVersionIds = new Set(manifest.resourceCatalog.questionVersionIds);
  if (contentKeys.size !== manifest.resourceCatalog.contentKeys.length) {
    errors.push(
      error("MANIFEST_FIELD", "resourceCatalog.contentKeys", "İçerik anahtarları tekrarlı."),
    );
  }
  if (exerciseKeys.size !== manifest.resourceCatalog.exerciseKeys.length) {
    errors.push(
      error("MANIFEST_FIELD", "resourceCatalog.exerciseKeys", "Alıştırma anahtarları tekrarlı."),
    );
  }
  if (assessmentKeys.size !== manifest.resourceCatalog.assessmentKeys.length) {
    errors.push(
      error(
        "MANIFEST_FIELD",
        "resourceCatalog.assessmentKeys",
        "Değerlendirme anahtarları tekrarlı.",
      ),
    );
  }
  if (questionVersionIds.size !== manifest.resourceCatalog.questionVersionIds.length) {
    errors.push(
      error(
        "MANIFEST_FIELD",
        "resourceCatalog.questionVersionIds",
        "Soru sürümü kimlikleri tekrarlı.",
      ),
    );
  }
  for (const [index, questionVersionId] of manifest.resourceCatalog.questionVersionIds.entries()) {
    if (!isNonEmpty(questionVersionId)) {
      errors.push(
        error(
          "INVALID_VERSION_REFERENCE",
          `resourceCatalog.questionVersionIds[${index}]`,
          "Soru sürümü kimliği boş olamaz.",
        ),
      );
    }
  }
  errors.push(
    ...catalogEntriesErrors(
      manifest.resourceCatalog.contentVersions,
      contentKeys,
      questionVersionIds,
      "resourceCatalog.contentVersions",
    ),
    ...catalogEntriesErrors(
      manifest.resourceCatalog.exerciseVersions,
      exerciseKeys,
      questionVersionIds,
      "resourceCatalog.exerciseVersions",
    ),
    ...catalogEntriesErrors(
      manifest.resourceCatalog.assessmentVersions,
      assessmentKeys,
      questionVersionIds,
      "resourceCatalog.assessmentVersions",
    ),
    ...catalogCoverageErrors(
      contentKeys,
      manifest.resourceCatalog.contentVersions,
      "resourceCatalog.contentVersions",
    ),
    ...catalogCoverageErrors(
      exerciseKeys,
      manifest.resourceCatalog.exerciseVersions,
      "resourceCatalog.exerciseVersions",
    ),
    ...catalogCoverageErrors(
      assessmentKeys,
      manifest.resourceCatalog.assessmentVersions,
      "resourceCatalog.assessmentVersions",
    ),
  );
  const contentVersions = new Map(
    manifest.resourceCatalog.contentVersions.map((entry) => [entry.key, entry]),
  );
  const exerciseVersions = new Map(
    manifest.resourceCatalog.exerciseVersions.map((entry) => [entry.key, entry]),
  );
  const assessmentVersions = new Map(
    manifest.resourceCatalog.assessmentVersions.map((entry) => [entry.key, entry]),
  );
  const stepByKey = new Map<string, LearningCycleStepManifest>();
  const mappedOutcomes = new Set<string>();

  for (const [index, step] of manifest.steps.entries()) {
    const path = `steps[${index}].stableKey`;
    if (!isNonEmpty(step.stableKey)) continue;
    if (stepByKey.has(step.stableKey)) {
      errors.push(error("DUPLICATE_STEP", path, `Adım anahtarı tekrarlı: ${step.stableKey}`));
    } else {
      stepByKey.set(step.stableKey, step);
    }
  }

  for (const [index, step] of manifest.steps.entries()) {
    const path = `steps[${index}]`;
    if (!isNonEmpty(step.stableKey)) {
      errors.push(error("MANIFEST_FIELD", `${path}.stableKey`, "Adım anahtarı boş olamaz."));
    }
    if (step.order !== index + 1) {
      errors.push(
        error("STEP_ORDER", `${path}.order`, `Adım sırası ${index + 1} olmalı: ${step.stableKey}`),
      );
    }
    if (!allowedTaskKinds(step.type).includes(step.taskKind)) {
      errors.push(
        error(
          "STEP_TASK_MISMATCH",
          `${path}.taskKind`,
          `${step.type} adımı ${step.taskKind} görev türünü taşıyamaz.`,
        ),
      );
    }
    if (step.required !== true && step.required !== false) {
      errors.push(error("MANIFEST_FIELD", `${path}.required`, "required boolean olmalıdır."));
    }
    const learningOutcomeKeys = step.learningOutcomeKeys ?? [];
    if (learningOutcomeKeys.length === 0) {
      errors.push(
        error(
          "MISSING_LEARNING_OUTCOME",
          `${path}.learningOutcomeKeys`,
          "Her adım en az bir öğrenme kazanımına bağlanmalıdır.",
        ),
      );
    }
    const stepOutcomeKeys = new Set<string>();
    for (const [outcomeIndex, outcomeKey] of learningOutcomeKeys.entries()) {
      const outcomePath = `${path}.learningOutcomeKeys[${outcomeIndex}]`;
      if (!isNonEmpty(outcomeKey)) {
        errors.push(
          error("UNKNOWN_LEARNING_OUTCOME", outcomePath, "Öğrenme kazanımı anahtarı boş olamaz."),
        );
      } else if (stepOutcomeKeys.has(outcomeKey)) {
        errors.push(error("UNKNOWN_LEARNING_OUTCOME", outcomePath, "Öğrenme kazanımı tekrarlı."));
      } else if (!outcomes.has(outcomeKey)) {
        errors.push(
          error("UNKNOWN_LEARNING_OUTCOME", outcomePath, "Manifestte bulunmayan öğrenme kazanımı."),
        );
      } else {
        mappedOutcomes.add(outcomeKey);
      }
      stepOutcomeKeys.add(outcomeKey);
    }
    const prerequisites = new Set<string>();
    for (const [prerequisiteIndex, prerequisiteKey] of step.prerequisiteKeys.entries()) {
      const prerequisitePath = `${path}.prerequisiteKeys[${prerequisiteIndex}]`;
      if (!isNonEmpty(prerequisiteKey)) {
        errors.push(
          error("UNKNOWN_PREREQUISITE", prerequisitePath, "Ön koşul anahtarı boş olamaz."),
        );
      } else if (prerequisites.has(prerequisiteKey)) {
        errors.push(error("UNKNOWN_PREREQUISITE", prerequisitePath, "Ön koşul tekrarlı."));
      }
      prerequisites.add(prerequisiteKey);
      const prerequisite = stepByKey.get(prerequisiteKey);
      if (
        !prerequisite &&
        !manifest.steps.some((candidate) => candidate.stableKey === prerequisiteKey)
      ) {
        errors.push(
          error(
            "UNKNOWN_PREREQUISITE",
            prerequisitePath,
            `Bilinmeyen ön koşul: ${prerequisiteKey}`,
          ),
        );
      } else if (prerequisite && prerequisite.order >= step.order) {
        errors.push(
          error(
            "PREREQUISITE_ORDER",
            prerequisitePath,
            `Ön koşul mevcut adımdan önce gelmeli: ${step.stableKey} -> ${prerequisiteKey}`,
          ),
        );
      }
    }

    const contentErrors = referenceErrors(
      step.content,
      `${path}.content`,
      contentKeys,
      questionVersionIds,
      contentVersions,
    );
    const exerciseErrors = referenceErrors(
      step.exercise,
      `${path}.exercise`,
      exerciseKeys,
      questionVersionIds,
      exerciseVersions,
    );
    const assessmentErrors = referenceErrors(
      step.assessment,
      `${path}.assessment`,
      assessmentKeys,
      questionVersionIds,
      assessmentVersions,
    );
    errors.push(...contentErrors, ...exerciseErrors, ...assessmentErrors);

    const hasContent = Boolean(step.content);
    const hasExercise = Boolean(step.exercise);
    const hasAssessment = Boolean(step.assessment);
    switch (step.type) {
      case "TEACHING":
        if (!hasContent)
          errors.push(
            error("MISSING_REFERENCE", `${path}.content`, "TEACHING için içerik gerekir."),
          );
        if (hasExercise || hasAssessment) {
          errors.push(
            error("STEP_TASK_MISMATCH", path, "TEACHING yalnızca içerik bağlantısı taşıyabilir."),
          );
        }
        break;
      case "SMALL_STUDY":
        if (!hasContent && !hasExercise) {
          errors.push(
            error("MISSING_REFERENCE", path, "SMALL_STUDY için içerik veya alıştırma gerekir."),
          );
        }
        if (hasAssessment)
          errors.push(
            error("STEP_TASK_MISMATCH", path, "SMALL_STUDY assessment bağlantısı taşıyamaz."),
          );
        break;
      case "PRACTICE":
      case "REINFORCEMENT":
        if (!hasExercise)
          errors.push(
            error("MISSING_REFERENCE", `${path}.exercise`, `${step.type} için alıştırma gerekir.`),
          );
        if (hasAssessment)
          errors.push(
            error("STEP_TASK_MISMATCH", path, `${step.type} assessment bağlantısı taşıyamaz.`),
          );
        break;
      case "ASSESSMENT":
        if (!hasAssessment)
          errors.push(
            error(
              "MISSING_REFERENCE",
              `${path}.assessment`,
              "ASSESSMENT için değerlendirme gerekir.",
            ),
          );
        if (hasContent || hasExercise)
          errors.push(
            error("STEP_TASK_MISMATCH", path, "ASSESSMENT doğrudan içerik/alıştırma taşıyamaz."),
          );
        break;
      case "MEASUREMENT":
      case "NEXT_LEARNING":
        if (hasContent || hasExercise || hasAssessment) {
          errors.push(
            error(
              "STEP_TASK_MISMATCH",
              path,
              `${step.type} içerik, alıştırma veya assessment taşıyamaz.`,
            ),
          );
        }
        break;
    }
  }

  for (const [index, outcome] of manifest.learningOutcomes.entries()) {
    if (!isNonEmpty(outcome.key) || !mappedOutcomes.has(outcome.key)) {
      errors.push(
        error(
          "UNMAPPED_LEARNING_OUTCOME",
          `learningOutcomes[${index}]`,
          "Öğrenme kazanımı hiçbir adıma bağlanmamış.",
        ),
      );
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const step of manifest.steps) {
    adjacency.set(
      step.stableKey,
      step.prerequisiteKeys.filter((key) => stepByKey.has(key)),
    );
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) {
      errors.push(error("PREREQUISITE_CYCLE", `steps.${key}`, `Ön koşul döngüsü bulundu: ${key}`));
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const prerequisite of adjacency.get(key) ?? []) visit(prerequisite);
    visiting.delete(key);
    visited.add(key);
  };
  for (const step of manifest.steps) visit(step.stableKey);

  const requiredKeys = new Set<string>();
  for (const [index, key] of manifest.completion.requiredStepKeys.entries()) {
    const path = `completion.requiredStepKeys[${index}]`;
    if (!stepByKey.has(key))
      errors.push(error("INVALID_COMPLETION_REFERENCE", path, `Bilinmeyen zorunlu adım: ${key}`));
    if (requiredKeys.has(key))
      errors.push(error("INVALID_COMPLETION_REFERENCE", path, "Zorunlu adım tekrarlı."));
    requiredKeys.add(key);
  }
  const checkpointKeys = new Set<string>();
  for (const [index, key] of manifest.completion.checkpointStepKeys.entries()) {
    const path = `completion.checkpointStepKeys[${index}]`;
    const step = stepByKey.get(key);
    if (!step)
      errors.push(
        error("INVALID_COMPLETION_REFERENCE", path, `Bilinmeyen checkpoint adımı: ${key}`),
      );
    else if (step.taskKind !== "CHECKPOINT") {
      errors.push(error("INVALID_COMPLETION_REFERENCE", path, `Checkpoint görevi değil: ${key}`));
    }
    if (checkpointKeys.has(key))
      errors.push(error("INVALID_COMPLETION_REFERENCE", path, "Checkpoint adımı tekrarlı."));
    checkpointKeys.add(key);
  }
  if (
    manifest.completion.requiresFinalMeasurement &&
    !manifest.steps.some((step) => step.type === "MEASUREMENT")
  ) {
    errors.push(
      error(
        "MISSING_FINAL_MEASUREMENT",
        "completion.requiresFinalMeasurement",
        "Final ölçüm bekleniyor ancak MEASUREMENT adımı yok.",
      ),
    );
  }
  return { valid: errors.length === 0, errors };
}

function mapTaskKind(type: LearningCycleStepType): LearningCycleTaskKind {
  if (type === "TEACHING") return "NEW";
  if (type === "REINFORCEMENT") return "RETRIEVAL";
  if (type === "ASSESSMENT" || type === "MEASUREMENT" || type === "NEXT_LEARNING")
    return "CHECKPOINT";
  return "TRANSFER";
}

function p0AcademicContentKey(lesson: AcademicLesson, stage: string): string {
  return `academic-${lesson.lessonKey}-${stage.toLowerCase()}`;
}

function p0ExerciseReference(
  exercise: ProgramExercise,
  academicVersion = true,
): LearningCycleVersionedReference {
  return {
    key: exercise.key,
    versionId: academicVersion
      ? getProgramIds("templateVersion", `${exercise.key}-academic-v2`)
      : getProgramIds("templateVersion", `${exercise.key}-v1`),
    questionVersionIds: exercise.questions.map((question) =>
      p0QuestionVersionId(exercise.key, question.key),
    ),
  };
}

function p0QuestionVersionCatalog(): string[] {
  return EDUCATION_V2_P0_PROGRAM.exercises.flatMap((exercise) =>
    exercise.questions.map((question) => p0QuestionVersionId(exercise.key, question.key)),
  );
}

function p0ExerciseVersionId(exercise: ProgramExercise): string {
  const isCommonVersion = exercise.key === "common-reinforcement" || exercise.key === "common-test";
  return getProgramIds(
    "templateVersion",
    `${exercise.key}-${isCommonVersion ? "v1" : "academic-v2"}`,
  );
}

function p0ContentVersions(): LearningCycleCatalogVersion[] {
  return ACADEMIC_P0_LESSONS.flatMap((lesson) =>
    lesson.stages
      .filter((stage) => stage.stage !== "PRACTICE")
      .map((stage) => {
        const key = p0AcademicContentKey(lesson, stage.stage);
        return { key, versionId: getProgramIds("contentVersion", `${key}-v1`) };
      }),
  );
}

function p0ExerciseVersions(): LearningCycleCatalogVersion[] {
  return EDUCATION_V2_P0_PROGRAM.exercises.map((exercise) => ({
    key: exercise.key,
    versionId: p0ExerciseVersionId(exercise),
    questionVersionIds: exercise.questions.map((question) =>
      p0QuestionVersionId(exercise.key, question.key),
    ),
  }));
}

function p0AssessmentVersions(): LearningCycleCatalogVersion[] {
  return EDUCATION_V2_P0_PROGRAM.assessments.map((assessment) => {
    const exercise = EDUCATION_V2_P0_PROGRAM.exercises.find(
      (candidate) => candidate.key === assessment.templateExerciseKey,
    );
    if (!exercise) throw new Error(`P0 assessment exercise bulunamadı: ${assessment.key}`);
    return {
      key: assessment.key,
      versionId: getProgramIds("assessment", assessment.key),
      questionVersionIds: assessment.questionKeys.map((questionKey) =>
        p0QuestionVersionId(exercise.key, questionKey),
      ),
    };
  });
}

function p0LearningOutcomes(): LearningCycleOutcome[] {
  return ACADEMIC_P0_LESSONS.map((lesson) => ({
    key: `P0_${lesson.skillCode}`,
    statement: lesson.objective,
    targetSkillCodes: [lesson.skillCode],
  }));
}

function p0LearningOutcomeKeys(): string[] {
  return ACADEMIC_P0_LESSONS.map((lesson) => `P0_${lesson.skillCode}`);
}

/** Builds the canonical 18 lesson stages + 4 common P0 stages. */
export function buildEducationV2P0LearningCycleManifest(): LearningCycleManifest {
  const catalogValidation = validateAcademicReadingP0Catalog();
  if (!catalogValidation.valid) throw new Error(catalogValidation.errors.join("; "));
  const steps: LearningCycleStepManifest[] = [];
  for (const lesson of ACADEMIC_P0_LESSONS) {
    let previousKey: string | undefined;
    for (const stage of lesson.stages) {
      const stableKey = `${lesson.skillCode}_${stage.stage}`;
      const exercise = EDUCATION_V2_P0_PROGRAM.exercises.find(
        (candidate) =>
          candidate.skillCode === lesson.skillCode && !candidate.key.startsWith("common-"),
      );
      if (!exercise) throw new Error(`P0 exercise bulunamadı: ${lesson.skillCode}`);
      steps.push({
        stableKey,
        order: steps.length + 1,
        type: stage.stage,
        taskKind: mapTaskKind(stage.stage),
        learningOutcomeKeys: [`P0_${lesson.skillCode}`],
        prerequisiteKeys: previousKey ? [previousKey] : [],
        required: true,
        ...(stage.stage === "PRACTICE"
          ? { exercise: p0ExerciseReference(exercise) }
          : {
              content: {
                key: p0AcademicContentKey(lesson, stage.stage),
                versionId: getProgramIds(
                  "contentVersion",
                  `${p0AcademicContentKey(lesson, stage.stage)}-v1`,
                ),
              },
            }),
      });
      previousKey = stableKey;
    }
  }
  const reinforcementExercise = EDUCATION_V2_P0_PROGRAM.exercises.find(
    (exercise) => exercise.key === "common-reinforcement",
  );
  const assessment = EDUCATION_V2_P0_PROGRAM.assessments.find(
    (candidate) => candidate.key === "common-assessment",
  );
  const assessmentExercise = assessment
    ? EDUCATION_V2_P0_PROGRAM.exercises.find(
        (exercise) => exercise.key === assessment.templateExerciseKey,
      )
    : undefined;
  if (!reinforcementExercise || !assessment || !assessmentExercise) {
    throw new Error("P0 ortak kaynakları bulunamadı");
  }
  const practiceKeys = ACADEMIC_P0_LESSONS.map((lesson) => `${lesson.skillCode}_PRACTICE`);
  steps.push({
    stableKey: "COMMON_REINFORCEMENT",
    order: steps.length + 1,
    type: "REINFORCEMENT",
    taskKind: "RETRIEVAL",
    learningOutcomeKeys: p0LearningOutcomeKeys(),
    prerequisiteKeys: practiceKeys,
    required: true,
    exercise: p0ExerciseReference(reinforcementExercise, false),
  });
  steps.push({
    stableKey: "COMMON_ASSESSMENT",
    order: steps.length + 1,
    type: "ASSESSMENT",
    taskKind: "CHECKPOINT",
    learningOutcomeKeys: p0LearningOutcomeKeys(),
    prerequisiteKeys: ["COMMON_REINFORCEMENT"],
    required: true,
    assessment: {
      key: assessment.key,
      versionId: getProgramIds("assessment", assessment.key),
      questionVersionIds: assessment.questionKeys.map((questionKey) =>
        p0QuestionVersionId(assessmentExercise.key, questionKey),
      ),
    },
  });
  steps.push({
    stableKey: "COMMON_MEASUREMENT",
    order: steps.length + 1,
    type: "MEASUREMENT",
    taskKind: "CHECKPOINT",
    learningOutcomeKeys: p0LearningOutcomeKeys(),
    prerequisiteKeys: ["COMMON_ASSESSMENT"],
    required: true,
  });
  steps.push({
    stableKey: "COMMON_NEXT_LEARNING",
    order: steps.length + 1,
    type: "NEXT_LEARNING",
    taskKind: "CHECKPOINT",
    learningOutcomeKeys: p0LearningOutcomeKeys(),
    prerequisiteKeys: ["COMMON_MEASUREMENT"],
    required: false,
  });
  return {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: EDUCATION_V2_P0_PROGRAM_ID,
    cycleVersion: 1,
    sequence: 0,
    routeFamily: "P0",
    targetSkillCodes: ACADEMIC_P0_LESSONS.map((lesson) => lesson.skillCode),
    learningOutcomes: p0LearningOutcomes(),
    resourceCatalog: {
      contentKeys: ACADEMIC_P0_LESSONS.flatMap((lesson) =>
        lesson.stages
          .filter((stage) => stage.stage !== "PRACTICE")
          .map((stage) => p0AcademicContentKey(lesson, stage.stage)),
      ),
      exerciseKeys: EDUCATION_V2_P0_PROGRAM.exercises.map((exercise) => exercise.key),
      assessmentKeys: EDUCATION_V2_P0_PROGRAM.assessments.map((item) => item.key),
      questionVersionIds: p0QuestionVersionCatalog(),
      contentVersions: p0ContentVersions(),
      exerciseVersions: p0ExerciseVersions(),
      assessmentVersions: p0AssessmentVersions(),
    },
    steps,
    completion: {
      requiredStepKeys: steps.filter((step) => step.required).map((step) => step.stableKey),
      checkpointStepKeys: ["COMMON_ASSESSMENT", "COMMON_MEASUREMENT"],
      requiresFinalMeasurement: true,
      nextCycle: "REVIEW_REQUIRED",
    },
  };
}

function p1AStepManifest(): LearningCycleStepManifest[] {
  const steps = EDUCATION_V2_P1_A_PROGRAM.path.units.flatMap((unit) => unit.steps);
  return steps.map((step, index) => {
    const exercise = step.exerciseKey
      ? EDUCATION_V2_P1_A_PROGRAM.exercises.find((candidate) => candidate.key === step.exerciseKey)
      : undefined;
    const assessment = step.assessmentKey
      ? EDUCATION_V2_P1_A_PROGRAM.assessments.find(
          (candidate) => candidate.key === step.assessmentKey,
        )
      : undefined;
    return {
      stableKey: step.key,
      order: index + 1,
      type: step.type,
      taskKind: mapTaskKind(step.type),
      learningOutcomeKeys: step.learningOutcomeKeys,
      prerequisiteKeys: step.prerequisiteStepKeys ?? [],
      required: true,
      ...(step.contentKey
        ? { content: { key: step.contentKey, versionId: p1AContentVersionId(step.contentKey) } }
        : {}),
      ...(exercise
        ? {
            exercise: {
              key: exercise.key,
              versionId: p1ATemplateVersionId(exercise.key),
              questionVersionIds: exercise.questions.map((question) =>
                p1AQuestionVersionId(exercise.key, question.key),
              ),
            },
          }
        : {}),
      ...(assessment
        ? {
            assessment: {
              key: assessment.key,
              versionId: p1AAssessmentId(assessment.key),
              questionVersionIds: assessment.questionKeys.map((questionKey) =>
                p1AQuestionVersionId(assessment.templateExerciseKey, questionKey),
              ),
            },
          }
        : {}),
    };
  });
}

export function buildEducationV2P1ALearningCycleManifest(): LearningCycleManifest {
  const sourceErrors = validateP1AProgram();
  if (sourceErrors.length > 0) throw new Error(sourceErrors.join("; "));
  const learningOutcomes = EDUCATION_V2_P1_A_LEARNING_OUTCOMES.map((outcome) => ({
    ...outcome,
    targetSkillCodes: [...outcome.targetSkillCodes],
  }));
  const steps = p1AStepManifest();
  return {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: EDUCATION_V2_P1_A_PROGRAM.path.code,
    cycleVersion: EDUCATION_V2_P1_A_PATH_VERSION,
    sequence: 1,
    routeFamily: "A",
    targetSkillCodes: [...new Set(EDUCATION_V2_P1_A_PROGRAM.content.map((item) => item.skillCode))],
    learningOutcomes,
    resourceCatalog: {
      contentKeys: EDUCATION_V2_P1_A_PROGRAM.content.map((item) => item.key),
      exerciseKeys: EDUCATION_V2_P1_A_PROGRAM.exercises.map((item) => item.key),
      assessmentKeys: EDUCATION_V2_P1_A_PROGRAM.assessments.map((item) => item.key),
      questionVersionIds: EDUCATION_V2_P1_A_PROGRAM.exercises.flatMap((exercise) =>
        exercise.questions.map((question) => p1AQuestionVersionId(exercise.key, question.key)),
      ),
      contentVersions: EDUCATION_V2_P1_A_PROGRAM.content.map((item) => ({
        key: item.key,
        versionId: p1AContentVersionId(item.key),
      })),
      exerciseVersions: EDUCATION_V2_P1_A_PROGRAM.exercises.map((exercise) => ({
        key: exercise.key,
        versionId: p1ATemplateVersionId(exercise.key),
        questionVersionIds: exercise.questions.map((question) =>
          p1AQuestionVersionId(exercise.key, question.key),
        ),
      })),
      assessmentVersions: EDUCATION_V2_P1_A_PROGRAM.assessments.map((assessment) => ({
        key: assessment.key,
        versionId: p1AAssessmentId(assessment.key),
        questionVersionIds: assessment.questionKeys.map((questionKey) =>
          p1AQuestionVersionId(assessment.templateExerciseKey, questionKey),
        ),
      })),
    },
    steps,
    completion: {
      requiredStepKeys: steps.map((step) => step.stableKey),
      checkpointStepKeys: ["assessment"],
      requiresFinalMeasurement: false,
      nextCycle: "REVIEW_REQUIRED",
    },
  };
}

function p1BCDStepManifest(program: P1BCDProgram): LearningCycleStepManifest[] {
  const steps = program.path.units.flatMap((unit) => unit.steps);
  return steps.map((step, index) => {
    const exercise = step.exerciseKey
      ? program.exercises.find((candidate) => candidate.key === step.exerciseKey)
      : undefined;
    const assessment = step.assessmentKey
      ? program.assessments.find((candidate) => candidate.key === step.assessmentKey)
      : undefined;
    return {
      stableKey: step.key,
      order: index + 1,
      type: step.type,
      taskKind: mapTaskKind(step.type),
      learningOutcomeKeys: step.learningOutcomeKeys,
      prerequisiteKeys: step.prerequisiteStepKeys ?? [],
      required: true,
      ...(step.contentKey
        ? {
            content: {
              key: step.contentKey,
              versionId: p1BCDContentVersionId(program, step.contentKey),
            },
          }
        : {}),
      ...(exercise
        ? {
            exercise: {
              key: exercise.key,
              versionId: p1BCDTemplateVersionId(program, exercise.key),
              questionVersionIds: exercise.questions.map((question) =>
                p1BCDId(program, "questionVersion", `${exercise.key}-${question.key}-v1`),
              ),
            },
          }
        : {}),
      ...(assessment
        ? {
            assessment: {
              key: assessment.key,
              versionId: p1BCDId(program, "assessment", assessment.key),
              questionVersionIds: assessment.questionKeys.map((questionKey) =>
                p1BCDId(
                  program,
                  "questionVersion",
                  `${assessment.templateExerciseKey}-${questionKey}-v1`,
                ),
              ),
            },
          }
        : {}),
    };
  });
}

export function buildEducationV2P1BCDLearningCycleManifests(): LearningCycleManifest[] {
  return EDUCATION_V2_P1_BCD_PROGRAMS.map((program) => {
    const sourceErrors = validateP1BCDProgram(program);
    if (sourceErrors.length > 0) throw new Error(sourceErrors.join("; "));
    const learningOutcomes = [
      {
        ...program.learningOutcome,
        targetSkillCodes: [...program.learningOutcome.targetSkillCodes],
      },
    ];
    const steps = p1BCDStepManifest(program);
    return {
      schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
      cycleId: program.path.code,
      cycleVersion: program.cycleVersion,
      sequence: program.sequence,
      routeFamily: program.routeFamily,
      targetSkillCodes: [...new Set(program.content.map((item) => item.skillCode))],
      learningOutcomes,
      resourceCatalog: {
        contentKeys: program.content.map((item) => item.key),
        exerciseKeys: program.exercises.map((item) => item.key),
        assessmentKeys: program.assessments.map((item) => item.key),
        questionVersionIds: program.exercises.flatMap((exercise) =>
          exercise.questions.map((question) =>
            p1BCDId(program, "questionVersion", `${exercise.key}-${question.key}-v1`),
          ),
        ),
        contentVersions: program.content.map((item) => ({
          key: item.key,
          versionId: p1BCDContentVersionId(program, item.key),
        })),
        exerciseVersions: program.exercises.map((exercise) => ({
          key: exercise.key,
          versionId: p1BCDTemplateVersionId(program, exercise.key),
          questionVersionIds: exercise.questions.map((question) =>
            p1BCDId(program, "questionVersion", `${exercise.key}-${question.key}-v1`),
          ),
        })),
        assessmentVersions: program.assessments.map((assessment) => ({
          key: assessment.key,
          versionId: p1BCDId(program, "assessment", assessment.key),
          questionVersionIds: assessment.questionKeys.map((questionKey) =>
            p1BCDId(
              program,
              "questionVersion",
              `${assessment.templateExerciseKey}-${questionKey}-v1`,
            ),
          ),
        })),
      },
      steps,
      completion: {
        requiredStepKeys: steps.map((step) => step.stableKey),
        checkpointStepKeys: steps
          .filter((step) => step.type === "ASSESSMENT")
          .map((step) => step.stableKey),
        requiresFinalMeasurement: false,
        nextCycle: "REVIEW_REQUIRED",
      },
    };
  });
}

export function buildCanonicalEducationV2LearningCycleManifests(): LearningCycleManifest[] {
  return [
    buildEducationV2P0LearningCycleManifest(),
    buildEducationV2P1ALearningCycleManifest(),
    ...buildEducationV2P1BCDLearningCycleManifests(),
  ];
}

export function validateCanonicalEducationV2LearningCycles(): LearningCycleValidationResult {
  const errors: LearningCycleValidationError[] = [];
  for (const manifest of buildCanonicalEducationV2LearningCycleManifests()) {
    const result = validateLearningCycleManifest(manifest);
    errors.push(
      ...result.errors.map((item) => ({ ...item, path: `${manifest.cycleId}.${item.path}` })),
    );
  }
  return { valid: errors.length === 0, errors };
}
