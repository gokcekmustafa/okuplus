export { gamificationStudentRoutes } from "./student-routes.js";
export {
  POINT_RULES,
  awardPoints,
  evaluateBasicBadges,
  getStudentGamification,
  recordCorrectAnswer,
  recordDailyLogin,
  recordExerciseCompleted,
  updateStreak,
} from "./service.js";
export type {
  AwardPointsInput,
  AwardPointsResult,
  GamificationActor,
  StudentGamificationData,
} from "./service.js";
