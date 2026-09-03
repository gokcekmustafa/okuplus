export { classAdminRoutes } from "./admin-routes.js";
export {
  assignTeacherToClass,
  createClass,
  getClass,
  listClassStudents,
  listClassTeachers,
  listClasses,
  softDeleteClass,
  updateClass,
  updateClassStatus,
} from "./service.js";
export type {
  ClassDetail,
  ClassListItem,
  ClassListResult,
  ClassStudent,
  ClassTeacher,
} from "./service.js";
export {
  createClassSchema,
  createTeacherAssignmentSchema,
  listClassesQuerySchema,
  updateClassSchema,
  updateClassStatusSchema,
} from "./schemas.js";
export type {
  ClassStatus,
  CreateClassInput,
  CreateTeacherAssignmentInput,
  ListClassesQuery,
  UpdateClassInput,
  UpdateClassStatusInput,
} from "./schemas.js";
