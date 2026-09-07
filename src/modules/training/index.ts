export { trainingStudentRoutes } from "./routes.js";
export {
  buildTrainingFeedback,
  isTrainingConfigCandidate,
  isMainIdeaVersionConfig,
  isTrainingVersionConfig,
  loadMainIdeaRuntimeGraph,
  resolveMainIdeaTemplateVersion,
  resolveTrainingRuntimeConfig,
  toMainIdeaRuntimeConfig,
} from "./runtime.js";
export type {
  MainIdeaRuntimeConfig,
  MainIdeaRuntimeGraph,
  MainIdeaStudentQuestion,
  TrainingActor,
} from "./runtime.js";
