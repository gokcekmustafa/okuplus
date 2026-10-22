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

export type ProductionBackupRoleIdentity = {
  approvedRoleMatches: boolean;
  applicationRole: boolean;
  canLogin: boolean;
  inheritsPrivileges: boolean;
  readOnly: boolean;
  hasWritePrivileges: boolean;
  superuser: boolean;
  bypassesRls: boolean;
  hasRlsTables: boolean;
  canManageRolesOrDatabases: boolean;
  hasRoleMemberships: boolean;
  allUserSchemasUsable: boolean;
  allTableLikeRelationsSelectable: boolean;
  allSequencesSelectable: boolean;
  allLargeObjectsSelectable: boolean;
};

export type ProductionBackupIdentity = {
  database: string;
  role: ProductionBackupRoleIdentity;
};

function sqlLiteral(value: string): string {
  if (value.includes("\0")) throw new Error("DATABASE_ROLE_NOT_APPROVED");
  return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

/**
 * The exact read-only identity query used by the backup runner. Keep privilege
 * checks as PostgreSQL privilege-list calls; PostgreSQL 18 accepts comma-
 * separated privilege names for these has_*_privilege functions.
 */
export function buildProductionBackupIdentitySql(
  approvedBackupRole: string,
  approvedApplicationRole: string,
): string {
  const backupRole = sqlLiteral(approvedBackupRole);
  const applicationRole = sqlLiteral(approvedApplicationRole);
  return `SELECT json_build_object(
      'database', current_database(),
      'readOnly', current_setting('transaction_read_only')::boolean,
      'approvedRoleMatches', current_user = ${backupRole},
      'applicationRole', current_user = ${applicationRole} OR current_user = 'oku_guest_app',
      'canLogin', role.rolcanlogin,
      'inheritsPrivileges', role.rolinherit,
      'superuser', role.rolsuper,
      'bypassesRls', role.rolbypassrls,
      'canManageRolesOrDatabases', role.rolcreatedb OR role.rolcreaterole OR role.rolreplication,
      'hasRoleMemberships', EXISTS (
        SELECT 1 FROM pg_roles AS member_of
        WHERE member_of.oid <> role.oid
          AND pg_has_role(current_user, member_of.oid, 'MEMBER')
      ),
      'hasRlsTables', EXISTS (
        SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relrowsecurity
      ),
      'allUserSchemasUsable', NOT EXISTS (
        SELECT 1 FROM pg_namespace AS n
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
          AND NOT has_schema_privilege(current_user, n.oid, 'USAGE')
      ),
      'allTableLikeRelationsSelectable', NOT EXISTS (
        SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND NOT has_table_privilege(current_user, c.oid, 'SELECT')
      ),
      'allSequencesSelectable', NOT EXISTS (
        SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
          AND c.relkind = 'S' AND NOT has_sequence_privilege(current_user, c.oid, 'SELECT')
      ),
      'allLargeObjectsSelectable', NOT EXISTS (
        SELECT 1 FROM pg_largeobject_metadata AS lo
        WHERE NOT has_largeobject_privilege(current_user, lo.oid, 'SELECT')
      ),
      'hasWritePrivileges',
        has_database_privilege(current_user, current_database(), 'CREATE')
        OR has_database_privilege(current_user, current_database(), 'TEMP')
        OR EXISTS (
          SELECT 1 FROM pg_namespace AS n
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND has_schema_privilege(current_user, n.oid, 'CREATE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege(
              current_user, c.oid,
              'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN'
            )
        )
        OR EXISTS (
          SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_any_column_privilege(current_user, c.oid, 'INSERT, UPDATE, REFERENCES')
        )
        OR EXISTS (
          SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
            AND c.relkind = 'S'
            AND has_sequence_privilege(current_user, c.oid, 'UPDATE, USAGE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_largeobject_metadata AS lo
          WHERE has_largeobject_privilege(current_user, lo.oid, 'UPDATE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_tablespace AS ts
          WHERE has_tablespace_privilege(current_user, ts.oid, 'CREATE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_parameter_acl AS parameter_acl
          WHERE has_parameter_privilege(current_user, parameter_acl.parname, 'ALTER SYSTEM')
        )
        OR EXISTS (
          SELECT 1 FROM pg_shdepend AS dependency
          WHERE dependency.refclassid = 'pg_authid'::regclass
            AND dependency.refobjid = role.oid AND dependency.deptype = 'o'
        )
    )::text AS identity FROM pg_roles AS role WHERE role.rolname = current_user;`;
}

/** Only invoke the dump after the exact identity query and every role gate pass. */
export async function runBackupAfterIdentityCheck(
  readIdentity: () => Promise<ProductionBackupIdentity>,
  expectedDatabase: string,
  onIdentity: (identity: ProductionBackupIdentity) => void,
  dump: () => Promise<void>,
): Promise<void> {
  const identity = await readIdentity();
  onIdentity(identity);
  if (identity.database !== expectedDatabase) throw new Error("DATABASE_NAME_MISMATCH");
  const validation = validateProductionBackupRole(identity.role);
  if (!validation.ok) throw new Error(validation.reason);
  await dump();
}

export type ProductionBackupRoleResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "DATABASE_ROLE_NOT_APPROVED"
        | "DATABASE_ROLE_IS_APPLICATION_ROLE"
        | "DATABASE_ROLE_NOT_LOGIN"
        | "DATABASE_ROLE_NOT_READ_ONLY"
        | "DATABASE_ROLE_PRIVILEGES_TOO_BROAD"
        | "DATABASE_RLS_BYPASS_REQUIRED"
        | "DATABASE_RLS_BYPASS_UNNECESSARY"
        | "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE";
    };

/**
 * Fail closed unless the connection is the explicitly approved, standalone
 * backup login and has only the read privileges needed for a complete dump.
 */
export function validateProductionBackupRole(
  identity: ProductionBackupRoleIdentity,
): ProductionBackupRoleResult {
  if (!identity.approvedRoleMatches) {
    return { ok: false, reason: "DATABASE_ROLE_NOT_APPROVED" };
  }
  if (identity.applicationRole) {
    return { ok: false, reason: "DATABASE_ROLE_IS_APPLICATION_ROLE" };
  }
  if (!identity.canLogin) {
    return { ok: false, reason: "DATABASE_ROLE_NOT_LOGIN" };
  }
  if (
    identity.superuser ||
    identity.canManageRolesOrDatabases ||
    identity.hasRoleMemberships ||
    identity.inheritsPrivileges
  ) {
    return { ok: false, reason: "DATABASE_ROLE_PRIVILEGES_TOO_BROAD" };
  }
  if (!identity.readOnly || identity.hasWritePrivileges) {
    return { ok: false, reason: "DATABASE_ROLE_NOT_READ_ONLY" };
  }
  if (identity.hasRlsTables && !identity.bypassesRls) {
    return { ok: false, reason: "DATABASE_RLS_BYPASS_REQUIRED" };
  }
  if (!identity.hasRlsTables && identity.bypassesRls) {
    return { ok: false, reason: "DATABASE_RLS_BYPASS_UNNECESSARY" };
  }
  if (
    !identity.allUserSchemasUsable ||
    !identity.allTableLikeRelationsSelectable ||
    !identity.allSequencesSelectable ||
    !identity.allLargeObjectsSelectable
  ) {
    return { ok: false, reason: "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE" };
  }
  return { ok: true };
}

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
