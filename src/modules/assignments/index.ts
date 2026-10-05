export { assignmentAdminRoutes } from "./admin-routes.js";
export { assignmentStudentRoutes } from "./student-routes.js";
export { assignmentTeacherRoutes } from "./teacher-routes.js";
export {
  createAssignment,
  deleteAssignment,
  getAssignment,
  listAssignments,
  listClassAssignments,
  updateAssignment,
  updateAssignmentStatus,
} from "./service.js";
export type { AssignmentDetail, AssignmentListItem, AssignmentListResult } from "./service.js";
export {
  acceptStudentRecommendation,
  autoAssignStudentRecommendations,
  evaluateStudentRecommendations,
  listStudentRecommendations,
  listTeacherAutomationSettings,
  listTeacherRecommendations,
  persistStudentRecommendations,
  refreshTeacherRecommendations,
  runTeacherAutomation,
} from "./recommendation-service.js";
export {
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
  createTeacherAssignmentSchema,
} from "./schemas.js";
export type {
  AssignmentStatus,
  CreateAssignmentInput,
  ListAssignmentsQuery,
  UpdateAssignmentInput,
  UpdateAssignmentStatusInput,
  CreateTeacherAssignmentInput,
  TeacherAssignmentStatus,
} from "./schemas.js";
