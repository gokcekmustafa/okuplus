import type { Env } from "../../config/env.js";
import {
  IYZICO_SANDBOX_BASE_URL,
  IyzicoConfigurationError,
  IyzicoSubscriptionProvider,
} from "./providers/iyzico/index.js";

export type IyzicoEnvironment = Pick<
  Env,
  | "IYZICO_API_KEY"
  | "IYZICO_SECRET_KEY"
  | "IYZICO_BASE_URL"
  | "IYZICO_MERCHANT_ID"
  | "IYZICO_SUBSCRIPTION_PLAN_MONTHLY"
  | "IYZICO_SUBSCRIPTION_PLAN_YEARLY"
  | "IYZICO_CHECKOUT_CALLBACK_URL"
  | "IYZICO_WEBHOOK_MAX_AGE_SECONDS"
>;

export type IyzicoAvailabilityEnvironment = Pick<
  Env,
  | "IYZICO_API_KEY"
  | "IYZICO_SECRET_KEY"
  | "IYZICO_BASE_URL"
  | "IYZICO_MERCHANT_ID"
  | "IYZICO_SUBSCRIPTION_PLAN_MONTHLY"
  | "IYZICO_SUBSCRIPTION_PLAN_YEARLY"
  | "IYZICO_CHECKOUT_CALLBACK_URL"
>;

export function iyzicoConfigFromEnv(env: Env) {
  return {
    apiKey: env.IYZICO_API_KEY,
    secretKey: env.IYZICO_SECRET_KEY,
    baseUrl: env.IYZICO_BASE_URL || IYZICO_SANDBOX_BASE_URL,
    merchantId: env.IYZICO_MERCHANT_ID,
    webhookMaxAgeSeconds: env.IYZICO_WEBHOOK_MAX_AGE_SECONDS,
  };
}

export function iyzicoCredentialsAvailable(env: IyzicoAvailabilityEnvironment): boolean {
  return Boolean(env.IYZICO_API_KEY && env.IYZICO_SECRET_KEY && env.IYZICO_MERCHANT_ID);
}

export function iyzicoCheckoutConfigured(env: IyzicoAvailabilityEnvironment): boolean {
  const baseUrl = env.IYZICO_BASE_URL.trim();
  const sandboxBaseUrl = !baseUrl || baseUrl === IYZICO_SANDBOX_BASE_URL;
  let callbackIsHttps = false;
  try {
    callbackIsHttps = new URL(env.IYZICO_CHECKOUT_CALLBACK_URL).protocol === "https:";
  } catch {
    callbackIsHttps = false;
  }
  return Boolean(
    iyzicoCredentialsAvailable(env) &&
    sandboxBaseUrl &&
    callbackIsHttps &&
    (env.IYZICO_SUBSCRIPTION_PLAN_MONTHLY || env.IYZICO_SUBSCRIPTION_PLAN_YEARLY),
  );
}

export function createIyzicoProvider(env: Env): IyzicoSubscriptionProvider {
  try {
    return new IyzicoSubscriptionProvider(iyzicoConfigFromEnv(env));
  } catch (error) {
    if (error instanceof IyzicoConfigurationError) throw error;
    throw new IyzicoConfigurationError("iyzico sandbox yapılandırması geçersiz");
  }
}

export function premiumPlanReference(env: Env, billingPeriod: "MONTHLY" | "YEARLY"): string {
  const reference =
    billingPeriod === "MONTHLY"
      ? env.IYZICO_SUBSCRIPTION_PLAN_MONTHLY
      : env.IYZICO_SUBSCRIPTION_PLAN_YEARLY;
  if (!reference)
    throw new IyzicoConfigurationError(`iyzico ${billingPeriod} plan referansı eksik`);
  return reference;
}
