export type IsolatedRestoreTargetResult =
  | { ok: true; reason: "MATCH" }
  | {
      ok: false;
      reason:
        | "ISOLATED_DATABASE_URL_MISSING"
        | "EXPECTED_HOST_MISSING"
        | "PRODUCTION_HOST_MISSING"
        | "INVALID_DATABASE_URL"
        | "NON_NEON_HOST"
        | "EXPECTED_HOST_INVALID"
        | "EXPECTED_HOST_IS_PRODUCTION"
        | "PRODUCTION_TARGET_REJECTED"
        | "ISOLATED_HOST_MISMATCH";
    };

function endpointHost(host: string): string {
  return host.replace(/-pooler(?=\.|$)/u, "");
}

export const RESTORE_SMOKE_FAILURE_STAGES = [
  "TARGET_VALIDATION",
  "ENVIRONMENT_VALIDATION",
  "MODULE_LOADING",
  "APP_BUILD",
  "FASTIFY_READY",
  "HEALTH",
  "HEALTH_DB",
  "READY",
  "ACCOUNT_DELETION_SCHEMA",
  "DATABASE_ROLE_PRIVILEGES",
] as const;

export const RESTORE_SMOKE_ERROR_CLASSES = [
  "Error",
  "TypeError",
  "SyntaxError",
  "ReferenceError",
  "RangeError",
  "AggregateError",
  "ZodError",
  "FastifyError",
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "OtherError",
] as const;

export const RESTORE_SMOKE_ERROR_CODES = [
  "ERR_MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_REQUIRE_ESM",
  "MODULE_NOT_FOUND",
  "ENOENT",
  "EACCES",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "P1000",
  "P1001",
  "P1012",
  "P2021",
  "P2022",
] as const;

export type RestoreSmokeFailureStage = (typeof RESTORE_SMOKE_FAILURE_STAGES)[number];
export type RestoreSmokeErrorClass = (typeof RESTORE_SMOKE_ERROR_CLASSES)[number];
export type RestoreSmokeErrorCode = (typeof RESTORE_SMOKE_ERROR_CODES)[number];

export type RestoreSmokeFailureDiagnostic = {
  stage: RestoreSmokeFailureStage;
  errorClass: RestoreSmokeErrorClass;
  errorCode: RestoreSmokeErrorCode | null;
};

export function sanitizeRestoreSmokeFailure(
  stage: RestoreSmokeFailureStage,
  error: unknown,
): RestoreSmokeFailureDiagnostic {
  const errorName = error instanceof Error ? error.name : "";
  const errorClass: RestoreSmokeErrorClass = RESTORE_SMOKE_ERROR_CLASSES.includes(
    errorName as RestoreSmokeErrorClass,
  )
    ? (errorName as RestoreSmokeErrorClass)
    : "OtherError";

  let errorCode: RestoreSmokeErrorCode | null = null;
  if (error && typeof error === "object") {
    try {
      const candidate = (error as { code?: unknown }).code;
      if (
        typeof candidate === "string" &&
        RESTORE_SMOKE_ERROR_CODES.includes(candidate as RestoreSmokeErrorCode)
      ) {
        errorCode = candidate as RestoreSmokeErrorCode;
      }
    } catch {
      // Ignore hostile or throwing code accessors; diagnostics remain allowlisted.
    }
  }

  return { stage, errorClass, errorCode };
}

/** Validates a restore-only URL without returning or logging any URL component. */
export function validateIsolatedRestoreTarget(input: {
  databaseUrl: string | undefined;
  expectedHost: string | undefined;
  productionHost: string | undefined;
}): IsolatedRestoreTargetResult {
  const databaseUrl = input.databaseUrl?.trim();
  const expectedHost = input.expectedHost?.trim();
  const productionHost = input.productionHost?.trim();

  if (!databaseUrl) return { ok: false, reason: "ISOLATED_DATABASE_URL_MISSING" };
  if (!expectedHost) return { ok: false, reason: "EXPECTED_HOST_MISSING" };
  if (!productionHost) return { ok: false, reason: "PRODUCTION_HOST_MISSING" };

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, reason: "INVALID_DATABASE_URL" };
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: "INVALID_DATABASE_URL" };
  }

  const actualHost = parsed.hostname;
  const validNeonHost = (host: string) =>
    host === host.toLowerCase() && host.startsWith("ep-") && host.endsWith(".neon.tech");
  if (!validNeonHost(actualHost)) return { ok: false, reason: "NON_NEON_HOST" };
  if (!validNeonHost(expectedHost) || !validNeonHost(productionHost)) {
    return { ok: false, reason: "EXPECTED_HOST_INVALID" };
  }

  if (endpointHost(expectedHost) === endpointHost(productionHost)) {
    return { ok: false, reason: "EXPECTED_HOST_IS_PRODUCTION" };
  }
  if (endpointHost(actualHost) === endpointHost(productionHost)) {
    return { ok: false, reason: "PRODUCTION_TARGET_REJECTED" };
  }
  if (actualHost !== expectedHost) return { ok: false, reason: "ISOLATED_HOST_MISMATCH" };

  return { ok: true, reason: "MATCH" };
}
