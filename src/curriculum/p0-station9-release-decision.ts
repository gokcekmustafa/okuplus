import {
  EDUCATION_V2_P0_PROGRAM,
  getProgramIds,
  questionId,
  questionVersionId,
  templateId,
} from "./education-v2-p0-program.js";

const EXERCISE_KEY = "fast-chunking-practice";
const QUESTION_KEY = "fast-chunking-practice-1";

/** Product-owner decision scoped to the single corrected P0 station 9 question. */
export const P0_STATION9_V3_RELEASE_DECISION = Object.freeze({
  publicationApproved: true,
  approvalBasis: "EXPLICIT_PRODUCT_OWNER_DECISION",
  exerciseKey: EXERCISE_KEY,
  questionKey: QUESTION_KEY,
  stableStepKey: "FAST_CHUNKING_PRACTICE",
  questionId: questionId(EXERCISE_KEY, QUESTION_KEY),
  baseQuestionVersionId: questionVersionId(EXERCISE_KEY, QUESTION_KEY),
  questionVersionId: getProgramIds("questionVersion", `${EXERCISE_KEY}-${QUESTION_KEY}-v3`),
  baseTemplateVersionId: getProgramIds("templateVersion", `${EXERCISE_KEY}-academic-v2`),
  templateId: templateId(EXERCISE_KEY),
  templateVersionId: getProgramIds("templateVersion", `${EXERCISE_KEY}-academic-v3`),
});

export function p0QuestionVersionForActiveExercise(exerciseKey: string, questionKey: string) {
  const exercise = EDUCATION_V2_P0_PROGRAM.exercises.find((item) => item.key === exerciseKey);
  const question = exercise?.questions.find((item) => item.key === questionKey);
  if (!question) return undefined;
  return exerciseKey === EXERCISE_KEY && questionKey === QUESTION_KEY
    ? P0_STATION9_V3_RELEASE_DECISION.questionVersionId
    : questionVersionId(exerciseKey, questionKey);
}
