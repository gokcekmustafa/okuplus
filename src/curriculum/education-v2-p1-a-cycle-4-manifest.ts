import type { ProgramExercise } from "./education-v2-p0-program.js";
import {
  EDUCATION_V2_P1_A_CYCLE_4_PROGRAM,
  EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE,
  EDUCATION_V2_P1_A_CYCLE_4_VERSION,
  p1ACycle4AssessmentId,
  p1ACycle4ContentVersionId,
  p1ACycle4QuestionVersionId,
  p1ACycle4TemplateVersionId,
} from "./education-v2-p1-a-cycle-4-program.js";
import {
  LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
  validateLearningCycleManifest,
  type LearningCycleManifest,
} from "./learning-cycle-manifest.js";

function questionVersionIds(exercise: ProgramExercise): string[] {
  return exercise.questions.map((question) =>
    p1ACycle4QuestionVersionId(exercise.key, question.key),
  );
}

function buildCycle4Manifest(): LearningCycleManifest {
  const program = EDUCATION_V2_P1_A_CYCLE_4_PROGRAM;
  const sourceCycle = EDUCATION_V2_P1_A_CYCLE_4_SOURCE_CYCLE;
  const contentVersions = program.content.map((item) => ({
    key: item.key,
    versionId: p1ACycle4ContentVersionId(item.key),
  }));
  const exerciseVersions = program.exercises.map((exercise) => ({
    key: exercise.key,
    versionId: p1ACycle4TemplateVersionId(exercise.key),
    questionVersionIds: questionVersionIds(exercise),
  }));
  const assessmentVersions = program.assessments.map((assessment) => ({
    key: assessment.key,
    versionId: p1ACycle4AssessmentId(assessment.key),
    questionVersionIds: assessment.questionKeys.map((questionKey) =>
      p1ACycle4QuestionVersionId(assessment.templateExerciseKey, questionKey),
    ),
  }));
  const pathSteps = program.path.units.flatMap((unit) => unit.steps);
  const learningOutcomes = sourceCycle.sourceStations.map((station) => ({
    key: station.key,
    statement: station.outcome,
    targetSkillCodes: [...station.skillCodes],
  }));
  const allQuestionVersionIds = [
    ...new Set(exerciseVersions.flatMap((item) => item.questionVersionIds ?? [])),
  ];

  const manifest: LearningCycleManifest = {
    schemaVersion: LEARNING_CYCLE_MANIFEST_SCHEMA_VERSION,
    cycleId: program.path.code,
    cycleVersion: EDUCATION_V2_P1_A_CYCLE_4_VERSION,
    sequence: 4,
    routeFamily: "A",
    targetSkillCodes: [
      ...new Set(sourceCycle.sourceStations.flatMap((station) => station.skillCodes)),
    ],
    learningOutcomes,
    resourceCatalog: {
      contentKeys: program.content.map((item) => item.key),
      exerciseKeys: program.exercises.map((item) => item.key),
      assessmentKeys: program.assessments.map((item) => item.key),
      questionVersionIds: allQuestionVersionIds,
      contentVersions,
      exerciseVersions,
      assessmentVersions,
    },
    steps: pathSteps.map((step, index) => {
      const exercise = step.exerciseKey
        ? program.exercises.find((item) => item.key === step.exerciseKey)
        : undefined;
      const assessment = step.assessmentKey
        ? program.assessments.find((item) => item.key === step.assessmentKey)
        : undefined;
      return {
        stableKey: step.key,
        order: index + 1,
        type: step.type,
        taskKind:
          step.type === "REINFORCEMENT"
            ? "RETRIEVAL"
            : step.type === "ASSESSMENT"
              ? "CHECKPOINT"
              : "TRANSFER",
        learningOutcomeKeys: [...step.learningOutcomeKeys],
        prerequisiteKeys: step.prerequisiteStepKeys ?? [],
        required: true,
        ...(step.contentKey
          ? {
              content: {
                key: step.contentKey,
                versionId: p1ACycle4ContentVersionId(step.contentKey),
              },
            }
          : {}),
        ...(exercise
          ? {
              exercise: {
                key: exercise.key,
                versionId: p1ACycle4TemplateVersionId(exercise.key),
                questionVersionIds: questionVersionIds(exercise),
              },
            }
          : {}),
        ...(assessment
          ? {
              assessment: {
                key: assessment.key,
                versionId: p1ACycle4AssessmentId(assessment.key),
                questionVersionIds: assessment.questionKeys.map((questionKey) =>
                  p1ACycle4QuestionVersionId(assessment.templateExerciseKey, questionKey),
                ),
              },
            }
          : {}),
      };
    }),
    completion: {
      requiredStepKeys: pathSteps.map((step) => step.key),
      checkpointStepKeys: [pathSteps.at(-1)!.key],
      requiresFinalMeasurement: false,
      nextCycle: "REVIEW_REQUIRED",
    },
  };

  const validation = validateLearningCycleManifest(manifest);
  if (!validation.valid) {
    throw new Error(
      `Education V2 P1-A Cycle 4 manifesti geçersiz: ${validation.errors
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  return manifest;
}

/** Exact Cycle 4 resource identities from the immutable production program. */
export const EDUCATION_V2_P1_A_CYCLE_4_MANIFEST = buildCycle4Manifest();
