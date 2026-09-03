export { assignmentAdminRoutes } from "./admin-routes.js";
export { assignmentStudentRoutes } from "./student-routes.js";
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
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
} from "./schemas.js";
export type {
  AssignmentStatus,
  CreateAssignmentInput,
  ListAssignmentsQuery,
  UpdateAssignmentInput,
  UpdateAssignmentStatusInput,
} from "./schemas.js";
