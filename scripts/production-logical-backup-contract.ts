export type ProductionBackupTargetResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "DATABASE_URL_MISSING"
        | "APPROVED_HOST_MISSING"
        | "APPROVED_DATABASE_MISSING"
        | "INVALID_DATABASE_URL"
        | "INVALID_APPROVED_HOST"
        | "POOLER_ENDPOINT_REJECTED"
        | "PRODUCTION_HOST_MISMATCH"
        | "DATABASE_NAME_MISMATCH"
        | "DATABASE_CREDENTIALS_MISSING"
        | "INSECURE_SSL_MODE"
        | "UNSUPPORTED_URL_PARAMETER";
    };

export function validateProductionBackupTarget(input: {
  databaseUrl: string | undefined;
  approvedHost: string | undefined;
  approvedDatabase: string | undefined;
}): ProductionBackupTargetResult {
  const databaseUrl = input.databaseUrl?.trim();
  const approvedHost = input.approvedHost?.trim().toLowerCase();
  const approvedDatabase = input.approvedDatabase?.trim();

  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL_MISSING" };
  if (!approvedHost) return { ok: false, reason: "APPROVED_HOST_MISSING" };
  if (!approvedDatabase) return { ok: false, reason: "APPROVED_DATABASE_MISSING" };

  const isNeonHost = (host: string) => /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/u.test(host);

  if (!isNeonHost(approvedHost) || approvedHost.includes("pooler")) {
    return { ok: false, reason: "INVALID_APPROVED_HOST" };
  }

  let parsed: URL;
  let database: string;
  try {
    parsed = new URL(databaseUrl);
    database = decodeURIComponent(parsed.pathname.slice(1));
    decodeURIComponent(parsed.username);
    decodeURIComponent(parsed.password);
  } catch {
    return { ok: false, reason: "INVALID_DATABASE_URL" };
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: "INVALID_DATABASE_URL" };
  }
  if (parsed.hash) return { ok: false, reason: "INVALID_DATABASE_URL" };
  if (!isNeonHost(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: "INVALID_DATABASE_URL" };
  }
  if (parsed.hostname.toLowerCase().includes("pooler")) {
    return { ok: false, reason: "POOLER_ENDPOINT_REJECTED" };
  }
  if (parsed.port && parsed.port !== "5432") {
    return { ok: false, reason: "INVALID_DATABASE_URL" };
  }
  if (parsed.hostname.toLowerCase() !== approvedHost) {
    return { ok: false, reason: "PRODUCTION_HOST_MISMATCH" };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(database) || database !== approvedDatabase) {
    return { ok: false, reason: "DATABASE_NAME_MISMATCH" };
  }
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (
    !username ||
    !password ||
    username === "*" ||
    password === "*" ||
    /[\r\n]/u.test(username + password)
  ) {
    return { ok: false, reason: "DATABASE_CREDENTIALS_MISSING" };
  }

  const supportedParameters = new Set(["sslmode", "channel_binding"]);
  for (const name of parsed.searchParams.keys()) {
    if (!supportedParameters.has(name)) {
      return { ok: false, reason: "UNSUPPORTED_URL_PARAMETER" };
    }
  }
  const sslModes = parsed.searchParams.getAll("sslmode");
  if (
    sslModes.length > 1 ||
    (sslModes.length === 1 && !["require", "verify-ca", "verify-full"].includes(sslModes[0] ?? ""))
  ) {
    return { ok: false, reason: "INSECURE_SSL_MODE" };
  }
  const channelBindingModes = parsed.searchParams.getAll("channel_binding");
  if (
    channelBindingModes.length > 1 ||
    (channelBindingModes.length === 1 &&
      !["require", "prefer"].includes(channelBindingModes[0] ?? ""))
  ) {
    return { ok: false, reason: "UNSUPPORTED_URL_PARAMETER" };
  }

  return { ok: true };
}

export function isAgePublicRecipient(value: string | undefined): boolean {
  return Boolean(value?.trim().match(/^age1[023456789acdefghjklmnpqrstuvwxyz]{50,}$/u));
}
