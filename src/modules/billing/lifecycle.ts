import type { BillingState } from "./providers/types.js";

/**
 * FREE is a derived entitlement state, not a BillingSubscriptionStatus row.
 * The remaining values mirror the existing Prisma/provider states exactly.
 */
export type LifecycleState = "FREE" | BillingState;

export type LifecycleEvent =
  | "CHECKOUT_CREATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "RETRY_SUCCEEDED"
  | "RETRY_FAILED"
  | "CANCEL_IMMEDIATE_CONFIRMED"
  | "SUBSCRIPTION_EXPIRED"
  | "UNKNOWN_PROVIDER_STATE";

export type EntitlementDecision = "PREMIUM" | "FREE" | "PENDING";
export type Enforcement = "GRANT" | "NO_GRANT";

export interface EntitlementResolution {
  decision: EntitlementDecision;
  enforcement: Enforcement;
  rationale: string;
}

/**
 * Separates the commercial decision from the current fail-safe enforcement.
 * PENDING must not become an invented grace-period or cancellation policy.
 */
export function resolveBillingEntitlement(state: LifecycleState): EntitlementResolution {
  switch (state) {
    case "ACTIVE":
      return {
        decision: "PREMIUM",
        enforcement: "GRANT",
        rationale: "Only a verified ACTIVE subscription grants personal Premium.",
      };
    case "FREE":
    case "EXPIRED":
      return {
        decision: "FREE",
        enforcement: "NO_GRANT",
        rationale: "No active billing grant is available.",
      };
    case "PENDING":
    case "TRIAL":
    case "PAST_DUE":
    case "CANCELED":
    case "UNKNOWN":
      return {
        decision: "PENDING",
        enforcement: "NO_GRANT",
        rationale: "Commercial access policy is undecided; fail-safe keeps Premium closed.",
      };
  }
}

/**
 * The application transition contract. A CANCELED subscription is never
 * reactivated: a new checkout creates a new PENDING subscription record.
 */
export function transitionLifecycleState(
  current: LifecycleState,
  event: LifecycleEvent,
): LifecycleState {
  switch (event) {
    case "CHECKOUT_CREATED":
      return current === "FREE" || current === "CANCELED" || current === "EXPIRED"
        ? "PENDING"
        : current;
    case "PAYMENT_SUCCEEDED":
    case "RETRY_SUCCEEDED":
      return current === "CANCELED" || current === "EXPIRED" ? current : "ACTIVE";
    case "PAYMENT_FAILED":
    case "RETRY_FAILED":
      return current === "CANCELED" || current === "EXPIRED" ? current : "PAST_DUE";
    case "CANCEL_IMMEDIATE_CONFIRMED":
      return current === "CANCELED" || current === "EXPIRED" ? current : "CANCELED";
    case "SUBSCRIPTION_EXPIRED":
      return current === "CANCELED" ? current : "EXPIRED";
    case "UNKNOWN_PROVIDER_STATE":
      return "UNKNOWN";
  }
}

export function isTerminalLifecycleState(state: LifecycleState): boolean {
  return state === "CANCELED" || state === "EXPIRED";
}
