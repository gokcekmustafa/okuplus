import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isAgePublicRecipient,
  validateProductionBackupTarget,
} from "../scripts/production-logical-backup-contract.js";

const workflow = readFileSync(
  new URL("../.github/workflows/production-encrypted-logical-backup.yml", import.meta.url),
  "utf8",
);
const backupScript = readFileSync(
  new URL("../scripts/production-logical-backup.ts", import.meta.url),
  "utf8",
);

const host = "ep-prod-123.c-2.eu-central-1.aws.neon.tech";
const databaseUrl = `postgresql://backup_user:encoded%3Asecret@${host}/okuplus?sslmode=require`;

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

  it("streams custom pg_dump output directly into age and never stages plaintext", () => {
    expect(backupScript).toContain('["--format=custom", "--no-password"]');
    expect(backupScript).toContain("/usr/lib/postgresql/18/bin");
    expect(backupScript).toContain("dump.stdout.pipe(encrypt.stdin)");
    expect(backupScript).toContain('"BEGIN READ ONLY;"');
    expect(backupScript).toContain('PGSSLMODE: "verify-full"');
    expect(backupScript).toContain('PGOPTIONS: "-c default_transaction_read_only=on"');
    expect(backupScript).toContain("has_table_privilege");
    expect(backupScript).toContain("has_sequence_privilege");
    expect(backupScript).toContain("DATABASE_ROLE_PRIVILEGES_TOO_BROAD");
    expect(backupScript).not.toContain("pg_restore");
    expect(backupScript).not.toContain("PRODUCTION_DATABASE_URL");
    expect(backupScript).not.toMatch(
      /console\.(log|error)\([^\n]*(databaseUrl|password|passFile|recipient)/iu,
    );
  });

  it("is manually dispatched on master only, protected, encrypted-only, and short lived", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/master'");
    expect(workflow).toContain("ref: master");
    expect(workflow).toContain("name: production-migration");
    expect(workflow).toContain("secrets.PRODUCTION_BACKUP_DATABASE_URL");
    expect(workflow).toContain("vars.PRODUCTION_BACKUP_AGE_RECIPIENT");
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("database.dump.age");
    expect(workflow).not.toContain("PRODUCTION_DATABASE_URL");
    expect(workflow).not.toContain("pg_restore");
    expect(workflow).not.toContain("age --decrypt");
    expect(workflow).not.toMatch(/upload-artifact[\s\S]{0,500}\.dump(?!\.age)/u);
  });
});
