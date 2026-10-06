export { entitlementRoutes } from "./routes.js";
export { entitlementAdminRoutes } from "./admin-routes.js";
export {
  ENTITLEMENT_FEATURES,
  canAccess,
  checkLimit,
  enforceUsage,
  entitlementLimitMessage,
  entitlementUsageDate,
  getCurrentPlan,
  getEntitlements,
  recordUsage,
  recordUsageInTransaction,
  requireFeatureAccess,
} from "./service.js";
export type {
  EntitlementActor,
  EntitlementFeature,
  EntitlementSnapshot,
  FeatureEntitlement,
  UsageResult,
} from "./service.js";
