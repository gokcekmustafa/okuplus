export { studentAdminRoutes } from "./admin-routes.js";
export {
  createStudent,
  getStudent,
  listAcademicYears,
  listClasses,
  listLevels,
  listStudents,
  softDeleteStudent,
  updateStudent,
} from "./service.js";
export type {
  EnrollmentSummary,
  MembershipSummary,
  StudentDetail,
  StudentListItem,
  StudentListResult,
} from "./service.js";
export {
  createEnrollment,
  listStudentEnrollments,
  updateEnrollment,
} from "./enrollment-service.js";
export type { EnrollmentRow } from "./enrollment-service.js";
export {
  createEnrollmentSchema,
  createStudentSchema,
  listAcademicYearsQuerySchema,
  listClassesQuerySchema,
  listStudentsQuerySchema,
  updateEnrollmentSchema,
  updateStudentSchema,
} from "./schemas.js";
export type {
  CreateEnrollmentInput,
  CreateStudentInput,
  ListAcademicYearsQuery,
  ListClassesQuery,
  ListStudentsQuery,
  UpdateEnrollmentInput,
  UpdateStudentInput,
} from "./schemas.js";
