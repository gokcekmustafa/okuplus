export { gamificationStudentRoutes } from "./student-routes.js";
export { gamificationFoundationRoutes } from "./foundation-routes.js";
export {
  FOUNDATION_ACHIEVEMENT_CATALOG,
  GAMIFICATION_EVENT_TYPES,
  GAMIFICATION_REWARD_RULES,
  calculateGamificationStreakTransition,
  formatGamificationActivityDate,
  getAssignmentGamificationOutcome,
  getStudentGamificationFoundation,
  getTeacherGamificationSummary,
  processGamificationEvent,
} from "./foundation.js";
export type {
  GamificationEventInput,
  GamificationEventResult,
  AssignmentGamificationOutcome,
  GamificationStreakSnapshot,
  GamificationStudentActor,
  GamificationSummary,
  GamificationTeacherActor,
} from "./foundation.js";
export {
  POINT_RULES,
  awardPoints,
  evaluateBasicBadges,
  getStudentGamification,
  recordCorrectAnswer,
  recordDailyLogin,
  recordExerciseCompleted,
  recordTrainingSessionCompleted,
  updateStreak,
} from "./service.js";
export type {
  AwardPointsInput,
  AwardPointsResult,
  GamificationActor,
  StudentGamificationData,
} from "./service.js";
