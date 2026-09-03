export { teacherAdminRoutes } from "./admin-routes.js";
export {
  addTeacherBranch,
  addTeacherClass,
  createTeacher,
  getTeacher,
  listBranches,
  listClasses,
  listTeachers,
  removeTeacherBranch,
  removeTeacherClass,
  softDeleteTeacher,
  updateTeacher,
  updateTeacherBranch,
  updateTeacherClass,
} from "./service.js";
export type {
  BranchSummary,
  ClassAssignmentSummary,
  MembershipSummary,
  TeacherDetail,
  TeacherListItem,
  TeacherListResult,
} from "./service.js";
export {
  createTeacherBranchSchema,
  createTeacherClassSchema,
  createTeacherSchema,
  listBranchesQuerySchema,
  listClassesQuerySchema,
  listTeachersQuerySchema,
  updateTeacherBranchSchema,
  updateTeacherClassSchema,
  updateTeacherSchema,
} from "./schemas.js";
export type {
  CreateTeacherBranchInput,
  CreateTeacherClassInput,
  CreateTeacherInput,
  ListBranchesQuery,
  ListClassesQuery,
  ListTeachersQuery,
  UpdateTeacherBranchInput,
  UpdateTeacherClassInput,
  UpdateTeacherInput,
} from "./schemas.js";
