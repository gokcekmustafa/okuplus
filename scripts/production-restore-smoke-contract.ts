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
