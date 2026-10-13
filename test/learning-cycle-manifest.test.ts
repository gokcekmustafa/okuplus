import { describe, expect, it } from "vitest";
import {
  buildCanonicalEducationV2LearningCycleManifests,
  buildEducationV2P1ALearningCycleManifest,
  validateCanonicalEducationV2LearningCycles,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "../src/curriculum/learning-cycle-manifest.js";

function copyManifest(manifest: LearningCycleManifest): LearningCycleManifest {
  return structuredClone(manifest);
}

describe("versioned learning cycle manifest", () => {
  it("mevcut P0 ve P1 manifestlerini deterministik biçimde doğrular", () => {
    const manifests = buildCanonicalEducationV2LearningCycleManifests();

    expect(manifests.map((manifest) => manifest.steps.length)).toEqual([22, 9, 5, 5, 5]);
    expect(validateCanonicalEducationV2LearningCycles()).toEqual({ valid: true, errors: [] });
    expect(validateCanonicalEducationV2LearningCycles()).toEqual(
      validateCanonicalEducationV2LearningCycles(),
    );
  });

  it.each([5, 7, 9])(
    "%i adımlı bir döngüyü, hedefleri ve yapısı geçerliyse kabul eder",
    (stepCount) => {
      const manifest = copyManifest(buildEducationV2P1ALearningCycleManifest());
      const steps = manifest.steps.slice(0, stepCount).map((step, index) => ({
        ...step,
        order: index + 1,
      }));
      manifest.steps = steps;
      manifest.completion = {
        ...manifest.completion,
        requiredStepKeys: steps.map((step) => step.stableKey),
        checkpointStepKeys: steps
          .filter((step) => step.taskKind === "CHECKPOINT")
          .map((step) => step.stableKey),
      };

      expect(validateLearningCycleManifest(manifest)).toEqual({ valid: true, errors: [] });
    },
  );

  it("SMALL_STUDY için P0 içerik tabanlı, P1-A şablon tabanlı bağı korur", () => {
    const manifests = buildCanonicalEducationV2LearningCycleManifests();
    const p0SmallStudy = manifests[0]?.steps.find((step) => step.type === "SMALL_STUDY");
    const p1ASmallStudy = manifests[1]?.steps.find((step) => step.type === "SMALL_STUDY");

    expect(p0SmallStudy?.content).toBeDefined();
    expect(p0SmallStudy?.exercise).toBeUndefined();
    expect(p1ASmallStudy?.exercise).toBeDefined();
    expect(p1ASmallStudy?.content).toBeUndefined();
  });

  it("bilinmeyen ön koşulu ve ileriye referans veren zinciri reddeder", () => {
    const unknown = copyManifest(buildEducationV2P1ALearningCycleManifest());
    unknown.steps = unknown.steps.map((step, index) =>
      index === 1 ? { ...step, prerequisiteKeys: ["does-not-exist"] } : step,
    );
    const unknownResult = validateLearningCycleManifest(unknown);
    expect(unknownResult.valid).toBe(false);
    expect(unknownResult.errors.some((item) => item.code === "UNKNOWN_PREREQUISITE")).toBe(true);

    const forward = copyManifest(buildEducationV2P1ALearningCycleManifest());
    const lastKey = forward.steps.at(-1)?.stableKey;
    forward.steps = forward.steps.map((step, index) =>
      index === 0 && lastKey
        ? { ...step, prerequisiteKeys: [lastKey] }
        : index === forward.steps.length - 1
          ? { ...step, prerequisiteKeys: [forward.steps[0]?.stableKey ?? ""] }
          : step,
    );
    const forwardResult = validateLearningCycleManifest(forward);
    expect(forwardResult.valid).toBe(false);
    expect(forwardResult.errors.some((item) => item.code === "PREREQUISITE_ORDER")).toBe(true);
    expect(forwardResult.errors.some((item) => item.code === "PREREQUISITE_CYCLE")).toBe(true);
  });

  it("tekrarlı anahtarları, sıra hatasını ve tutarsız görev türünü yakalar", () => {
    const manifest = copyManifest(buildEducationV2P1ALearningCycleManifest());
    const first = manifest.steps[0];
    const second = manifest.steps[1];
    if (!first || !second) throw new Error("P1-A test manifesti eksik");
    manifest.steps = [
      { ...first, taskKind: "TRANSFER" },
      { ...second, stableKey: first.stableKey, order: 99 },
      ...manifest.steps.slice(2),
    ];
    const result = validateLearningCycleManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((item) => item.code === "DUPLICATE_STEP")).toBe(true);
    expect(result.errors.some((item) => item.code === "STEP_ORDER")).toBe(true);
    expect(result.errors.some((item) => item.code === "STEP_TASK_MISMATCH")).toBe(true);
  });

  it("zorunlu kaynak bağlantıları ve soru sürümlerindeki eksikleri reddeder", () => {
    const missingExercise = copyManifest(buildEducationV2P1ALearningCycleManifest());
    missingExercise.steps = missingExercise.steps.map((step) =>
      step.type === "PRACTICE" ? { ...step, exercise: undefined } : step,
    );
    const missingExerciseResult = validateLearningCycleManifest(missingExercise);
    expect(missingExerciseResult.errors.some((item) => item.code === "MISSING_REFERENCE")).toBe(
      true,
    );

    const unknownQuestionVersion = copyManifest(buildEducationV2P1ALearningCycleManifest());
    unknownQuestionVersion.steps = unknownQuestionVersion.steps.map((step) =>
      step.exercise
        ? {
            ...step,
            exercise: {
              ...step.exercise,
              questionVersionIds: [
                ...(step.exercise.questionVersionIds ?? []),
                "unknown-question-v9",
              ],
            },
          }
        : step,
    );
    const unknownQuestionResult = validateLearningCycleManifest(unknownQuestionVersion);
    expect(unknownQuestionResult.valid).toBe(false);
    expect(unknownQuestionResult.errors.some((item) => item.code === "UNKNOWN_REFERENCE")).toBe(
      true,
    );
  });

  it("final ölçüm sözleşmesi MEASUREMENT adımı yoksa geçmez", () => {
    const manifest = copyManifest(buildEducationV2P1ALearningCycleManifest());
    manifest.completion = { ...manifest.completion, requiresFinalMeasurement: true };
    const result = validateLearningCycleManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((item) => item.code === "MISSING_FINAL_MEASUREMENT")).toBe(true);
  });

  it("sürüm uyuşmazlığını, eksik hedef bilgisini ve katalog binding açığını bildirir", () => {
    const manifest = copyManifest(buildEducationV2P1ALearningCycleManifest());
    const practiceIndex = manifest.steps.findIndex((step) => step.type === "PRACTICE");
    const practice = manifest.steps[practiceIndex];
    if (!practice?.exercise) throw new Error("P1-A practice bağlantısı eksik");
    manifest.targetSkillCodes = [""];
    manifest.learningOutcomes = [""];
    manifest.steps = manifest.steps.map((step, index) =>
      index === practiceIndex
        ? {
            ...step,
            exercise: { ...practice.exercise, versionId: "wrong-template-version" },
          }
        : step,
    );
    manifest.resourceCatalog = {
      ...manifest.resourceCatalog,
      exerciseVersions: manifest.resourceCatalog.exerciseVersions.slice(1),
    };

    const result = validateLearningCycleManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((item) => item.code === "MANIFEST_FIELD")).toBe(true);
    expect(result.errors.some((item) => item.code === "VERSION_MISMATCH")).toBe(true);
    expect(result.errors.some((item) => item.code === "INVALID_VERSION_REFERENCE")).toBe(true);
  });

  it("her öğrenme kazanımının en az bir adıma bağlandığını doğrular", () => {
    const manifest = copyManifest(buildEducationV2P1ALearningCycleManifest());
    const firstOutcome = manifest.learningOutcomes[0];
    if (!firstOutcome) throw new Error("P1-A öğrenme kazanımı eksik");
    manifest.steps = manifest.steps.map((step) => ({
      ...step,
      learningOutcomeKeys: [firstOutcome],
    }));

    const result = validateLearningCycleManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((item) => item.code === "UNMAPPED_LEARNING_OUTCOME")).toBe(true);
  });
});
