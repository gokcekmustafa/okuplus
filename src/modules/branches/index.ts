export { branchAdminRoutes } from "./admin-routes.js";
export {
  createBranch,
  getBranch,
  listBranchManagers,
  listBranches,
  softDeleteBranch,
  updateBranch,
  updateBranchManager,
  updateBranchStatus,
} from "./service.js";
export type {
  BranchDetail,
  BranchListItem,
  BranchListResult,
  BranchManagerOption,
} from "./service.js";
export {
  createBranchSchema,
  listBranchManagersQuerySchema,
  listBranchesQuerySchema,
  updateBranchManagerSchema,
  updateBranchSchema,
  updateBranchStatusSchema,
} from "./schemas.js";
export type {
  BranchStatus,
  CreateBranchInput,
  ListBranchesQuery,
  UpdateBranchInput,
  UpdateBranchManagerInput,
  UpdateBranchStatusInput,
} from "./schemas.js";
