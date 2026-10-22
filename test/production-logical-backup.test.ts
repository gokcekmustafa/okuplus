import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProductionBackupIdentitySql,
  isAgePublicRecipient,
  validateProductionBackupRole,
  validateProductionBackupTarget,
  type ProductionBackupRoleIdentity,
} from "../scripts/production-logical-backup-contract.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-encrypted-logical-backup.yml", import.meta.url),
  "utf8",
);
const backupScript = readFileSync(
  new URL("../scripts/production-logical-backup.ts", import.meta.url),
  "utf8",
);
const backupContract = readFileSync(
  new URL("../scripts/production-logical-backup-contract.ts", import.meta.url),
  "utf8",
);

const host = "ep-prod-123.c-2.eu-central-1.aws.neon.tech";
const databaseUrl = `postgresql://backup_user:encoded%3Asecret@${host}/okuplus?sslmode=require`;
const eligibleRole: ProductionBackupRoleIdentity = {
  approvedRoleMatches: true,
  applicationRole: false,
  canLogin: true,
  inheritsPrivileges: false,
  readOnly: true,
  hasWritePrivileges: false,
  superuser: false,
  bypassesRls: true,
  hasRlsTables: true,
  canManageRolesOrDatabases: false,
  hasRoleMemberships: false,
  allUserSchemasUsable: true,
  allTableLikeRelationsSelectable: true,
  allSequencesSelectable: true,
  allLargeObjectsSelectable: true,
};

describe("production encrypted logical backup contract", () => {
  it("accepts only a direct Neon URL matching both approved host and database", () => {
    expect(
      validateProductionBackupTarget({
        databaseUrl,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: true });
    expect(
      validateProductionBackupTarget({
        databaseUrl: `${databaseUrl}&channel_binding=require`,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a pooler endpoint before accepting the configured production host", () => {
    const pooler = host.replace(".c-", "-pooler.c-");
    expect(
      validateProductionBackupTarget({
        databaseUrl: `postgresql://u:p@${pooler}/okuplus`,
        approvedHost: pooler,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "INVALID_APPROVED_HOST" });
    expect(
      validateProductionBackupTarget({
        databaseUrl: `postgresql://u:p@${pooler}/okuplus`,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "POOLER_ENDPOINT_REJECTED" });
  });

  it("fails closed for host, database, credentials, and insecure connection mismatches", () => {
    expect(
      validateProductionBackupTarget({
        databaseUrl: databaseUrl.replace(host, "ep-other.c-2.eu-central-1.aws.neon.tech"),
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "PRODUCTION_HOST_MISMATCH" });
    expect(
      validateProductionBackupTarget({
        databaseUrl: databaseUrl.replace("/okuplus", "/other"),
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "DATABASE_NAME_MISMATCH" });
    expect(
      validateProductionBackupTarget({
        databaseUrl: `postgresql://u:p@${host}/okuplus?sslmode=disable`,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "INSECURE_SSL_MODE" });
    expect(
      validateProductionBackupTarget({
        databaseUrl: `postgresql://${host}/okuplus`,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "DATABASE_CREDENTIALS_MISSING" });
  });

  it("requires all target bindings and rejects unsupported URL parameters", () => {
    expect(
      validateProductionBackupTarget({
        databaseUrl: undefined,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "DATABASE_URL_MISSING" });
    expect(
      validateProductionBackupTarget({
        databaseUrl,
        approvedHost: undefined,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "APPROVED_HOST_MISSING" });
    expect(
      validateProductionBackupTarget({
        databaseUrl,
        approvedHost: host,
        approvedDatabase: undefined,
      }),
    ).toEqual({ ok: false, reason: "APPROVED_DATABASE_MISSING" });
    expect(
      validateProductionBackupTarget({
        databaseUrl: `${databaseUrl}&options=unsafe`,
        approvedHost: host,
        approvedDatabase: "okuplus",
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_URL_PARAMETER" });
  });

  it("accepts only age public recipients", () => {
    expect(isAgePublicRecipient(`age1${"a".repeat(50)}`)).toBe(true);
    expect(isAgePublicRecipient("private-key-material")).toBe(false);
    expect(isAgePublicRecipient(undefined)).toBe(false);
  });

  it("accepts a separate login backup role with BYPASSRLS and complete read access", () => {
    expect(validateProductionBackupRole(eligibleRole)).toEqual({ ok: true });
  });

  it.each([
    ["unapproved login", { approvedRoleMatches: false }, "DATABASE_ROLE_NOT_APPROVED"],
    ["application login", { applicationRole: true }, "DATABASE_ROLE_IS_APPLICATION_ROLE"],
    ["non-login role", { canLogin: false }, "DATABASE_ROLE_NOT_LOGIN"],
    ["not a read-only transaction", { readOnly: false }, "DATABASE_ROLE_NOT_READ_ONLY"],
    ["inherited privileges", { inheritsPrivileges: true }, "DATABASE_ROLE_PRIVILEGES_TOO_BROAD"],
    ["superuser", { superuser: true }, "DATABASE_ROLE_PRIVILEGES_TOO_BROAD"],
    ["write access", { hasWritePrivileges: true }, "DATABASE_ROLE_NOT_READ_ONLY"],
    [
      "role administration",
      { canManageRolesOrDatabases: true },
      "DATABASE_ROLE_PRIVILEGES_TOO_BROAD",
    ],
    ["role membership", { hasRoleMemberships: true }, "DATABASE_ROLE_PRIVILEGES_TOO_BROAD"],
    [
      "missing schema usage",
      { allUserSchemasUsable: false },
      "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE",
    ],
    [
      "missing table SELECT",
      { allTableLikeRelationsSelectable: false },
      "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE",
    ],
    [
      "missing sequence SELECT",
      { allSequencesSelectable: false },
      "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE",
    ],
    [
      "missing large-object SELECT",
      { allLargeObjectsSelectable: false },
      "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE",
    ],
  ] as const)("rejects %s", (_label, change, reason) => {
    expect(validateProductionBackupRole({ ...eligibleRole, ...change })).toEqual({
      ok: false,
      reason,
    });
  });

  it("requires RLS bypass when RLS tables exist and rejects unnecessary bypass", () => {
    expect(validateProductionBackupRole({ ...eligibleRole, bypassesRls: false })).toEqual({
      ok: false,
      reason: "DATABASE_RLS_BYPASS_REQUIRED",
    });
    expect(validateProductionBackupRole({ ...eligibleRole, hasRlsTables: false })).toEqual({
      ok: false,
      reason: "DATABASE_RLS_BYPASS_UNNECESSARY",
    });
    expect(
      validateProductionBackupRole({ ...eligibleRole, hasRlsTables: false, bypassesRls: false }),
    ).toEqual({ ok: true });
  });

  it("preflights full read coverage and streams custom pg_dump output directly into age", () => {
    expect(backupScript).toContain('["--format=custom", "--no-password"]');
    expect(backupScript).toContain("/usr/lib/postgresql/18/bin");
    expect(backupScript).toContain("dump.stdout.pipe(encrypt.stdin)");
    expect(backupScript).toContain("`BEGIN READ ONLY; ${buildProductionBackupIdentitySql(");
    expect(backupScript).toContain('PGSSLMODE: "verify-full"');
    expect(backupScript).toContain('PGOPTIONS: "-c default_transaction_read_only=on"');
    expect(backupContract).toContain("has_table_privilege");
    expect(backupContract).toContain("has_sequence_privilege");
    expect(backupContract).toContain("has_largeobject_privilege");
    expect(backupContract).toContain("pg_shdepend");
    expect(backupContract).toContain("pg_parameter_acl");
    expect(backupContract).toContain("buildProductionBackupIdentitySql");
    expect(backupContract).toContain("runBackupAfterIdentityCheck");
    expect(backupScript).toContain("buildProductionBackupIdentitySql");
    expect(backupScript).not.toContain("--enable-row-security");
    expect(backupScript).toContain("DATABASE_ROLE_PRIVILEGES_TOO_BROAD");
    expect(backupScript).not.toContain("pg_restore");
    expect(backupScript).not.toContain("PRODUCTION_DATABASE_URL");
    expect(backupScript).not.toMatch(
      /console\.(log|error)\([^\n]*(databaseUrl|password|passFile|recipient)/iu,
    );
  });

  it("quotes approved role names as SQL literals without allowing interpolation", () => {
    const sql = buildProductionBackupIdentitySql("backup' OR true --", "app\\role");
    expect(sql).toContain("E'backup'' OR true --'");
    expect(sql).toContain("E'app\\\\role'");
    expect(sql).not.toContain("current_user = 'backup' OR true");
  });

  it("is manually dispatched on master only, protected, encrypted-only, and short lived", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/master'");
    expect(workflow).toContain("ref: master");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("secrets.PRODUCTION_BACKUP_DATABASE_URL");
    expect(workflow).toContain("vars.PRODUCTION_BACKUP_AGE_RECIPIENT");
    expect(workflow).toContain("vars.PRODUCTION_BACKUP_APPROVED_USER");
    expect(workflow).toContain("vars.PRODUCTION_APP_RUNTIME_DB_USER");
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("database.dump.age");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("pg_restore");
    expect(workflow).not.toContain("age --decrypt");
    expect(workflow).not.toMatch(/upload-artifact[\s\S]{0,500}\.dump(?!\.age)/u);
  });
});
