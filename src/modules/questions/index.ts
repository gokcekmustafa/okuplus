export { questionAdminRoutes } from "./admin-routes.js";
export {
  createAttempt,
  createQuestion,
  createQuestionVersion,
  deleteQuestion,
  getQuestion,
  getQuestionVersion,
  listQuestionByContent,
  listQuestions,
  listQuestionVersions,
  publishQuestionVersion,
  reviewQuestionVersion,
  scoreAttempt,
  softDeleteQuestion,
  updateContentQuestions,
  updateQuestion,
  updateQuestionStatus,
  updateQuestionVersion,
} from "./service.js";
export type {
  QuestionDetail,
  QuestionListItem,
  QuestionListResult,
  QuestionVersionDetail,
  QuestionVersionSummary,
} from "./service.js";
export {
  createQuestionSchema,
  createQuestionVersionSchema,
  listQuestionsQuerySchema,
  updateQuestionSchema,
  updateQuestionStatusSchema,
  updateQuestionVersionSchema,
  updateContentQuestionsSchema,
} from "./schemas.js";
export type {
  CreateQuestionInput,
  CreateQuestionVersionInput,
  ListQuestionsQuery,
  UpdateQuestionInput,
  UpdateQuestionStatusInput,
  UpdateQuestionVersionInput,
  UpdateContentQuestionsInput,
  CreateAttemptInput,
  AttemptResponse,
} from "./schemas.js";
